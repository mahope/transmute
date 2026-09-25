/**
 * README tests: the examples a reader copies first must actually run.
 *
 * Every command in the README's `## Examples` block is extracted from the file
 * itself and executed against the real CLI, so a stale or copied-from-nowhere
 * example fails `npm test` instead of failing in someone's terminal. A new
 * example has to be registered in EXPECTATIONS below, which is what keeps this
 * file from silently going stale.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'src', 'cli.js');
const readme = readFileSync(join(root, 'README.md'), 'utf-8');

/** What each documented example must produce. Keyed by a distinctive part of the command. */
const EXPECTATIONS = [
  {
    key: 'people.csv -o json',
    says: 'CSV to JSON with type coercion',
    check(out) {
      const rows = JSON.parse(out);
      assert.equal(Array.isArray(rows), true, 'output should be a JSON array');
      assert.equal(rows[0].name, 'Alice');
      assert.equal(typeof rows[0].age, 'number', 'CSV numbers must stay numbers');
    }
  },
  {
    key: '--pipe \'[{"op":"filter","expr":"item.age > 26"}',
    says: 'filter and sort in one pass',
    check(out) {
      const lines = out.trim().split('\n');
      assert.equal(lines[0], 'name,age,city');
      assert.equal(lines.length, 2, 'only Alice is over 26');
      assert.equal(lines[1].startsWith('Alice'), true, `expected Alice first, got: ${out}`);
    }
  },
  {
    key: 'cat config.yaml | transmute --format yaml',
    says: 'YAML to JSON from stdin',
    check(out) {
      // A key-value YAML document is one record, like a CSV header row.
      assert.deepEqual(JSON.parse(out), [{ a: 1, b: 'hello' }]);
    }
  },
  {
    key: 'echo \'{"a":1}\' | transmute --output xml',
    says: 'JSON to XML',
    check(out) {
      assert.equal(out.includes('<a>1</a>'), true, `expected <a>1</a> in: ${out}`);
    }
  }
];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

console.log('\n📋 Transmute README Tests\n');

/** The runnable lines of the README's `## Examples` block. */
function documentedExamples() {
  const section = readme.match(/^## Examples\s*\n+```bash\n([\s\S]*?)^```/m);
  assert.ok(section, 'README must have a `## Examples` code block');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** Run a README command with `transmute` bound to this checkout, in a fixture directory. */
function run(command, cwd) {
  const bound = command.replace('transmute ', `${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} `);
  return spawnSync('sh', ['-c', bound], { cwd, encoding: 'utf-8' });
}

const examples = documentedExamples();

console.log('── the examples run as written ──');

const workdir = mkdtempSync(join(tmpdir(), 'transmute-readme-'));
try {
  writeFileSync(join(workdir, 'people.csv'), 'name,age,city\nAlice,32,Aarhus\nBob,25,Odense\n');
  writeFileSync(join(workdir, 'config.yaml'), 'a: 1\nb: hello\n');

  for (const expectation of EXPECTATIONS) {
    test(`${expectation.key} → ${expectation.says}`, () => {
      const command = examples.find((line) => line.includes(expectation.key));
      assert.ok(command, `README no longer documents: ${expectation.key}`);
      const result = run(command, workdir);
      assert.equal(result.status, 0, `exit ${result.status}: ${result.stderr}`);
      assert.equal(result.stderr, '', `stderr not empty: ${result.stderr}`);
      assert.notEqual(result.stdout.trim(), '', 'no output');
      expectation.check(result.stdout);
    });
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

console.log('── the README cannot drift ──');

test('every README example is checked here', () => {
  const checked = EXPECTATIONS.map((e) => e.key);
  for (const command of examples) {
    const found = checked.some((key) => command.includes(key));
    assert.equal(found, true, `README example is not verified: ${command}\nAdd it to EXPECTATIONS in test/readme.test.mjs`);
  }
  assert.equal(examples.length, EXPECTATIONS.length, `README has ${examples.length} examples, ${EXPECTATIONS.length} are verified`);
});

test('the README points at the full reference and the exit codes', () => {
  assert.equal(readme.includes('docs/cli.md'), true, 'README must link to the full CLI reference');
  assert.equal(readme.includes('Exit codes'), true, 'README must document the exit codes');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
