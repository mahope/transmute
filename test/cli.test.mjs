/**
 * CLI tests: the real binary, in a child process, with real files and pipes.
 *
 * Covers the promises the README makes — local transformation of json, csv,
 * yaml and xml, machine-readable output on stdout, errors on stderr with a
 * distinct exit code, and no account, network or upload involved.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * `sh` plus a successful exit. `allowStderr` is for runs that legitimately
 * warn — a CSV row that is longer than its header still succeeds, and the
 * warning is the whole point. stdout is pure data either way.
 */
function expectOk(result, { allowStderr = false } = {}) {
  assert.equal(result.status, 0, `exit ${result.status}: ${result.stderr}`);
  if (!allowStderr) assert.equal(result.stderr, '', `stderr not empty: ${result.stderr}`);
  return result.stdout;
}

console.log('\n📋 Transmute CLI Tests\n');

console.log('── documented commands run as written ──');

for (const testCase of CASES) {
  test(`${testCase.name}: ${testCase.command.split(' | ')[0].slice(0, 48)}…`, () => {
    const stdout = expectOk(sh(testCase.command), { allowStderr: testCase.warns });
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

console.log('── real-world CSV: delimiters and quotes ──');

test('a semicolon CSV is not collapsed into one column', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/european.csv -o json`));
  const rows = JSON.parse(out);
  assert.deepEqual(Object.keys(rows[0]), ['navn', 'by', 'note', 'antal']);
  assert.equal(rows[0].note, 'Salg, mellem', 'a quoted comma must survive as data');
  assert.equal(rows[1].note, 'Linje 1\nLinje 2', 'a quoted newline must not invent a row');
  assert.equal(rows.length, 2, 'two data rows in, two data rows out');
});

test('a tab-separated file is read as three columns', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -f csv --delimiter tab -o json`, { input: 'id\tname\tqty\n1\tWidget\t5\n' }));
  assert.deepEqual(JSON.parse(out), [{ id: 1, name: 'Widget', qty: 5 }]);
});

test('--delimiter overrides the detected one', () => {
  // Forcing `,` on a semicolon file makes every row longer than the one-column
  // header, which is exactly what the new warning is for.
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/european.csv --delimiter , -o json`);
  const stdout = expectOk(r, { allowStderr: true });
  const rows = JSON.parse(stdout);
  // The override must win: the header stays one column instead of being
  // detected as four again. Forcing the wrong delimiter splits the quoted
  // fields too, which is what the warning now reports instead of hiding.
  assert.ok(Object.keys(rows[0]).includes('navn;by;note;antal'), Object.keys(rows[0]).join(','));
  assert.ok(r.stderr.includes('more fields than the header'), r.stderr);
});

test('--delimiter tab is accepted as a name, not a literal tab', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -f csv -o json --delimiter tab`, { input: 'a\tb\n1\t2\n' }));
  assert.deepEqual(JSON.parse(out), [{ a: 1, b: 2 }]);
});

console.log('── the format is detected, so no flag is needed ──');

test('a Danish Excel export on stdin is read without --format', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: 'navn;by;pris\nMette;KBH;199,50\nBo;AA;50\n' }));
  assert.deepEqual(JSON.parse(out), [
    { navn: 'Mette', by: 'KBH', pris: '199,50' },
    { navn: 'Bo', by: 'AA', pris: 50 }
  ]);
});

test('a tab-separated or pipe-separated file on stdin is read without --format', () => {
  const tsv = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: 'name\temail\na@b.dk\t123\n' }));
  assert.deepEqual(JSON.parse(tsv), [{ name: 'a@b.dk', email: 123 }]);
  const piped = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: 'name|email\na@b.dk|123\n' }));
  assert.deepEqual(JSON.parse(piped), [{ name: 'a@b.dk', email: 123 }]);
});

test('a one-column export on stdin is read, not refused as JSON', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: 'email\na@b.dk\nc@d.dk\n' }));
  assert.deepEqual(JSON.parse(out), [{ email: 'a@b.dk' }, { email: 'c@d.dk' }]);
});

test('detection on stdin still leaves JSON, YAML and XML alone', () => {
  const json = expectOk(sh(`"${process.execPath}" "${cli}" -o csv`, { input: '[{"a":1},\n{"a":2}]' }));
  assert.equal(json.trim(), 'a\n1\n2');
  const yaml = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: 'server:\n  host: db.local\n' }));
  assert.deepEqual(JSON.parse(yaml), [{ server: { host: 'db.local' } }]);
  const xml = expectOk(sh(`"${process.execPath}" "${cli}" -o json`, { input: '<data>\n<item>1</item>\n<item>2</item>\n</data>' }));
  assert.equal(JSON.parse(xml).length, 2);
});

console.log('── real-world CSV: rows longer than the header ──');

test('a row with more fields than the header keeps the extra values', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/ragged.csv -o json`), { allowStderr: true });
  const rows = JSON.parse(out);
  assert.equal(rows.length, 3, 'the extra fields must not invent rows');
  assert.equal(rows[1].column4, 'follow-up');
  assert.deepEqual(Object.keys(rows[0]), ['id', 'name', 'note'], 'rows within the header width are untouched');
});

test('the extra values survive a round trip back to CSV', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" test/fixtures/ragged.csv -o csv`), { allowStderr: true });
  assert.ok(out.includes('id,name,note,column4'), out);
  assert.ok(out.includes('DK,follow-up'), out);
});

test('a long row warns once on stderr and still exits 0', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/ragged.csv -o json`);
  assert.equal(r.status, 0, 'losing the values is worse than warning about them');
  assert.equal(r.stderr.includes('Warning:'), true, `expected a warning, got: ${r.stderr}`);
  assert.ok(r.stderr.includes('1 of 3 CSV rows has more fields than the header (row 3)'), r.stderr);
  assert.ok(r.stderr.includes('kept in column4'), r.stderr);
});

test('stdout stays pure data when a warning is printed', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/ragged.csv -o json`);
  assert.doesNotThrow(() => JSON.parse(r.stdout), 'a warning on stderr must not corrupt stdout');
  assert.equal(r.stdout.includes('Warning'), false);
});

test('a well-formed CSV prints no warning at all', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -o json`);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '', `stderr should stay empty, got: ${r.stderr}`);
});

test('records with different keys export every key to CSV', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -f json -o csv`, {
    input: '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"bob@x.dk"}]'
  }));
  assert.equal(out.trim(), 'id,name,email\n1,Alice,\n2,Bob,bob@x.dk');
});

test('a semicolon in a free-text field survives csv → csv → json', () => {
  const written = expectOk(sh(`"${process.execPath}" "${cli}" -f json -o csv`, {
    input: '[{"id":1,"note":"Copenhagen; Aarhus"}]'
  }));
  assert.equal(written.trim(), 'id,note\n1,"Copenhagen; Aarhus"');
  const back = expectOk(sh(`"${process.execPath}" "${cli}" -f csv -o json`, { input: written }));
  assert.deepEqual(JSON.parse(back), [{ id: 1, note: 'Copenhagen; Aarhus' }]);
});

test('xml → xml does not compound its own escaping', () => {
  const source = '<users><user><name>Tom &amp; Jerry</name><tag>a &lt;b&gt;</tag></user></users>';
  const once = expectOk(sh(`"${process.execPath}" "${cli}" -f xml -o xml`, { input: source }));
  const twice = expectOk(sh(`"${process.execPath}" "${cli}" -f xml -o xml`, { input: once }));
  assert.equal(twice, once);
  assert.equal(once.includes('&amp;amp;'), false, `escape grew: ${once}`);
});

console.log('── nested YAML is read, not flattened away ──');

test('an indented block survives, instead of vanishing with exit 0', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -f yaml -o json`, {
    input: 'server:\n  host: db.local\n  port: 5432\nlist:\n  - a\n  - b\n'
  }));
  assert.deepEqual(JSON.parse(out), [{ server: { host: 'db.local', port: 5432 }, list: ['a', 'b'] }]);
});

test('three levels of mappings and sequences survive the round trip', () => {
  const source = readFileSync('test/fixtures/nested.yaml', 'utf8');
  const once = expectOk(sh(`"${process.execPath}" "${cli}" -f yaml -o yaml`, { input: source }));
  const twice = expectOk(sh(`"${process.execPath}" "${cli}" -f yaml -o yaml`, { input: once }));
  assert.equal(twice, once, 'writing the same structure twice must be byte-identical');
  assert.equal(once.includes('rpm: 600'), true, once);
  const back = JSON.parse(expectOk(sh(`"${process.execPath}" "${cli}" -f yaml -o json`, { input: once })));
  assert.equal(back[0].service.routes[1].limits.rpm, 60);
  assert.equal(back[0].service.changelog, '2026-09-01 first release\n2026-09-20 added refunds\n');
});

test('a numeric string stays a string through json → yaml → json', () => {
  // `0074` is a zip code, not the number 74. YAML reads a bare 0074 as a
  // number — that is YAML's rule, not this tool's — so the writer is the
  // half that has to quote it.
  const written = expectOk(sh(`"${process.execPath}" "${cli}" -f json -o yaml`, { input: '[{"zip":"0074"}]' }));
  assert.equal(written.trim(), '- zip: "0074"');
  const back = expectOk(sh(`"${process.execPath}" "${cli}" -f yaml -o json`, { input: written }));
  assert.deepEqual(JSON.parse(back), [{ zip: '0074' }]);
});

test('a config file with no extension is detected as YAML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const target = join(dir, 'app.conf');
    writeFileSync(target, '# a config\nservice:\n  name: billing\n  tags:\n    - a\n    - b\n');
    const out = expectOk(sh(`"${process.execPath}" "${cli}" ${JSON.stringify(target)} -o json`));
    assert.deepEqual(JSON.parse(out), [{ service: { name: 'billing', tags: ['a', 'b'] } }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a multi-document file is read as its first document and says so', () => {
  const r = sh(`"${process.execPath}" "${cli}" -f yaml -o json`, { input: 'a: 1\n---\nb: 2\n' });
  const stdout = expectOk(r, { allowStderr: true });
  assert.deepEqual(JSON.parse(stdout), [{ a: 1 }]);
  assert.ok(/only the first was read/.test(r.stderr), r.stderr);
});

test('a YAML block that cannot be read fails with exit 3 and an empty stdout', () => {
  // Unreadable input is exit 3 in this tool's contract, and the message names
  // the line, so the user can go look at it instead of trusting the output.
  expectFail(`"${process.execPath}" "${cli}" -f yaml -o json`, 3, 'YAML line 2', { input: 'a: 1\n   b: 2\n' });
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

test('an expression that is not JavaScript → exit 2, no rows, nothing on stdout', () => {
  // `item.age >` used to keep every row and exit 0 with an empty stderr, so a
  // filter that did not filter looked exactly like one that worked.
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"filter","expr":"item.age >"}]' -o csv`, 2, 'Invalid expression "item.age >"');
});

test('an unclosed parenthesis in an expression → exit 2', () => {
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"map","expr":"item.age > 5)"}]' -o csv`, 2, 'Invalid expression "item.age > 5)"');
});

test('a bad expression in add → exit 2 instead of a column of nulls', () => {
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"add","fields":{"x":"item.age >"}}]' -o csv`, 2, 'Invalid expression');
});

test('an expression that throws at runtime → exit 1', () => {
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"map","expr":"item.nope.deep"}]' -o csv`, 1, "reading 'deep'");
});

test('add still turns a per-record failure into null', () => {
  const out = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"add","fields":{"x":"item.nope.deep"}}]' -o csv`));
  assert.equal(out.includes(','), true, 'the null field must be in the output');
});

console.log('── help and version ──');

test('--help exits 0 and lists every option and operation', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" --help`));
  for (const flag of ['--format', '--pipe', '--output', '--out', '--table', '--delimiter', '--version']) {
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
  const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const matrix = ci.match(/node:\s*\[([\d,\s]+)\]/);
  assert.ok(matrix, 'ci.yml has no "node: [...]" matrix to compare engines against');
  const oldest = Math.min(...matrix[1].split(',').map(version => Number(version.trim())));
  assert.equal(pkg.engines.node, `>=${oldest}`, `engines.node must state the oldest runtime ci.yml tests (Node ${oldest})`);
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

test('unknown --delimiter → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv --delimiter xx -o json`, 2, 'Unknown delimiter');
});

test('--delimiter without a value → exit 2', () => {
  expectFail(`"${process.execPath}" "${cli}" test/fixtures/people.csv --delimiter`, 2, '--delimiter needs a value');
});

test('a nested value survives the real binary as parseable JSON', () => {
  // The bug this closes was invisible from the API: a nested object came out
  // as the literal `[object Object]` and the command still exited 0 with an
  // empty stderr, so a script could not tell a good export from a broken one.
  const out = expectOk(sh(`transmute test/fixtures/orders.json --output csv`));
  assert.equal(out.includes('object Object'), false, `lost the nested value:\n${out}`);
  const back = expectOk(sh(`"${process.execPath}" "${cli}" -f csv -o json`, { input: out }));
  const rows = JSON.parse(back);
  assert.equal(rows.length, 3);
  const cell = rows[0].items;
  assert.equal(typeof cell, 'string', 'the cell should be CSV-quoted, not raw JSON');
  assert.equal(JSON.stringify(JSON.parse(cell)), '[{"sku":"a-1","qty":2}]');
});

test('a nested value in SQL output is a JSON literal, not the word Object', () => {
  const out = expectOk(sh(`transmute test/fixtures/orders.json --output sql --table orders`));
  assert.equal(out.includes('object Object'), false, `lost the nested value:\n${out}`);
  assert.ok(out.includes(`'[{"sku":"a-1","qty":2}]'`), `not a JSON string literal:\n${out}`);
});

test('join --prefix keeps the colliding field in the real binary', () => {
  const out = expectOk(sh(`transmute test/fixtures/orders.json --pipe '[{"op":"join","on":"customer","prefix":"was_","with":[{"customer":"alice","status":"refunded"}]}]' --output json`));
  const row = JSON.parse(out)[0];
  assert.equal(row.status, 'paid', 'the left side must win without a prefix');
  assert.equal(row.was_status, 'refunded', `the prefixed field was dropped:\n${out}`);
});

test('join without a prefix still keeps the left value and drops the right one', () => {
  const out = expectOk(sh(`transmute test/fixtures/orders.json --pipe '[{"op":"join","on":"customer","with":[{"customer":"alice","status":"refunded"}]}]' --output json`));
  const row = JSON.parse(out)[0];
  assert.equal(row.status, 'paid');
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'refunded'), false);
  assert.equal(Object.keys(row).join(','), 'id,customer,status,items,total');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
