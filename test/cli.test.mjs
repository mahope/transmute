/**
 * CLI tests: the real binary, in a child process, with real files and pipes.
 *
 * Covers the promises the README makes — local transformation of json, csv,
 * yaml and xml, machine-readable output on stdout, errors on stderr with a
 * distinct exit code, and no account, network or upload involved.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CASES, FIXTURES, bigDataset, fixtureText } from './fixtures/cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'src', 'cli.js');
const expected = JSON.parse(readFileSync(join(here, 'fixtures', 'expected.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

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

/** Run the CLI exactly as the docs spell it, with `transmute` bound to this repo. */
function sh(command, opts = {}) {
  return spawnSync('sh', ['-c', command.replace('transmute ', `${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} `)], {
    cwd: root,
    encoding: 'utf-8',
    input: opts.input,
    ...opts.spawn
  });
}

function expectOk(result) {
  assert.equal(result.status, 0, `exit ${result.status}: ${result.stderr}`);
  assert.equal(result.stderr, '', `stderr not empty: ${result.stderr}`);
  return result.stdout;
}

console.log('\n📋 Transmute CLI Tests\n');

console.log('── documented commands run as written ──');

for (const testCase of CASES) {
  test(`${testCase.name}: ${testCase.command.split(' | ')[0].slice(0, 48)}…`, () => {
    const stdout = expectOk(sh(testCase.command));
    assert.equal(stdout, expected[testCase.name] + '\n', 'stdout does not match the documented output');
  });
}

console.log('── formats work locally, no account needed ──');

test('csv → json', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -o json`));
  assert.equal(JSON.parse(out).length, 4);
});

test('yaml → csv', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/people.yaml -o csv`));
  assert.equal(out.trim().split('\n')[0], 'name,age,city');
});

test('xml → json', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/users.xml -o json`));
  assert.equal(JSON.parse(out)[0].name, 'Alice');
});

test('json → sql', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/orders.json -o sql --table orders`));
  assert.equal(out.includes('INSERT INTO "orders"'), true);
});

test('stdin → stdout', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -p '[{"op":"count"}]' -o json`, { input: '[{"a":1},{"a":2}]' }));
  assert.equal(JSON.parse(out)[0].count, 2);
});

test('no flags prints a preview table and exits 0', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv`));
  assert.equal(out.includes('Input detected as: CSV'), true);
  assert.equal(out.includes('(4 rows, 5 columns)'), true);
});

test('50 records in one run — no purchase, no run limit', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -p '[{"op":"sort","by":"score","dir":"desc"}]' -o csv`, { input: bigDataset(50) }));
  assert.equal(out.trim().split('\n').length, 51);
});

test('--out writes the output to a file and prints nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const target = join(dir, 'people.json');
    const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -o json --out ${JSON.stringify(target)}`));
    assert.equal(out, '');
    assert.equal(JSON.parse(readFileSync(target, 'utf-8')).length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('── errors are machine-readable ──');

function expectFail(command, code, needle, opts = {}) {
  const result = sh(command, opts);
  assert.equal(result.status, code, `expected exit ${code}, got ${result.status}: ${result.stderr}`);
  assert.equal(result.stdout, '', `stdout should stay empty on error, got: ${result.stdout}`);
  assert.equal(result.stderr.includes(needle), true, `stderr "${result.stderr}" does not mention ${needle}`);
}

test('missing file → exit 3', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/nope.csv -o json`, 3, 'File not found');
});

test('unparseable input → exit 3', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f json -o json`, 3, 'Could not parse input as json');
});

test('invalid --pipe JSON → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -p '[{' -o json`, 2, 'not valid JSON');
});

test('--pipe that is not an array → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -p '{"op":"head"}' -o json`, 2, 'must be a JSON array');
});

test('unknown operation → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -p '[{"op":"nope"}]' -o json`, 2, 'Unknown operation: nope');
});

test('unknown output format → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -o bogus`, 2, 'Unknown output format');
});

test('unknown option → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" --bogus test/fixtures/people.csv`, 2, 'Unknown option');
});

test('flag without a value → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv --pipe`, 2, '--pipe needs a value');
});

test('two input files → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv test/fixtures/orders.json -o json`, 2, 'Only one input file');
});

test('unwritable --out target → exit 3', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv -o json --out /nope/dir/out.json`, 3, 'Could not write');
});

console.log('── help and version ──');

test('--help exits 0 and lists every option and operation', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" --help`));
  for (const flag of ['--format', '--pipe', '--output', '--out', '--table', '--version']) {
    assert.equal(out.includes(flag), true, `--help does not document ${flag}`);
  }
  for (const op of ['filter', 'map', 'pick', 'omit', 'sort', 'unique', 'group', 'count', 'head', 'tail', 'rename', 'flatten', 'add', 'join']) {
    assert.equal(out.includes(op), true, `--help does not list ${op}`);
  }
  assert.equal(out.includes('Exit codes'), true);
});

test('--version prints the npm version', () => {
  assert.equal(expectOk(sh(`"${process.execPath}" "${cli}" --version`)).trim(), pkg.version);
});

test('engines requirement matches the CI matrix', () => {
  assert.equal(pkg.engines.node, '>=18', 'engines.node must state the supported runtime');
});

test('fixtures referenced by the docs exist', () => {
  for (const format of Object.keys(FIXTURES)) {
    assert.equal(existsSync(FIXTURES[format]), true, `missing fixture ${format}`);
    assert.equal(fixtureText(format).length > 0, true);
  }
});

test('a file argument that is a directory fails cleanly', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures -o json`, 3, 'Could not read');
});

test('the CLI can be executed directly (shebang + exec bit)', () => {
  execFileSync(cli, ['--version'], { cwd: root, encoding: 'utf-8' });
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
