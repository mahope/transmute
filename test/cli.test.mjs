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

test('--delimiter is honoured in the preview, not only with --output', () => {
  // The preview used to call the engine without the flag, so the same command
  // showed the auto-detected `;` as three columns and the real export as one.
  const out = expectOk(sh(`transmute --delimiter ,`, { input: 'a;b;c\n1;2;3\n' }));
  assert.equal(out.includes('(1 rows, 1 columns)'), true, `preview ignored --delimiter:\n${out}`);
  assert.equal(out.includes('| a;b;c |'), true, `preview ignored --delimiter:\n${out}`);
});

test('50 records in one run — no purchase, no run limit', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -p '[{"op":"sort","by":"score","dir":"desc"}]' -o csv`, { input: bigDataset(50) }));
  assert.equal(out.trim().split('\n').length, 51);
});

test('a 150,000-row file previews instead of dying on a stack overflow', () => {
  // The default run has no `-o`, so it prints the table. That is the path a
  // 4 MB CSV took: `Math.max(...data.map(...))` spread one argument per record
  // into a call, and V8 gives up somewhere around 110,000 of them. Exit 1, no
  // output, on a file no larger than a screenshot.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-big-'));
  try {
    const input = join(dir, 'people.csv');
    const rows = ['id,name'];
    for (let i = 0; i < 150000; i++) rows.push(`${i},person-${i}`);
    writeFileSync(input, rows.join('\n') + '\n');
    const out = expectOk(sh(`"${process.execPath}" "${cli}" ${JSON.stringify(input)}`));
    assert.equal(out.includes('(150000 rows, 2 columns)'), true, out.slice(-300));
    assert.equal(out.includes('person-0 '), true, out.slice(0, 400));
    // And the same file written out as a table, which is the other half of it.
    const target = join(dir, 'out table.txt');
    expectOk(sh(`"${process.execPath}" "${cli}" ${JSON.stringify(input)} -o table --out ${JSON.stringify(target)}`));
    const written = readFileSync(target, 'utf-8');
    assert.equal(written.includes('(150000 rows, 2 columns)'), true, written.slice(-200));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a name with a wide character does not break the table it is printed in', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" -f csv`, { input: 'name,city\nMøller,København\n🚀,Aarhus\n日本,Odense\n' }));
  const rules = out.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'));
  const columns = l => {
    let w = 0;
    for (const ch of l) {
      const cp = ch.codePointAt(0);
      w += (cp >= 0x1f300 && cp <= 0x1f9ff) || (cp >= 0x4e00 && cp <= 0x9fff) ? 2 : 1;
    }
    return w;
  };
  assert.equal(new Set(rules.map(columns)).size, 1, `table is crooked:\n${out}`);
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

test('a step that cannot do its job without a parameter → exit 2, nothing on stdout', () => {
  // Every one of these ran and answered with something else, with exit 0 and an
  // empty stderr: `filter` kept every row, `pick` wrote an empty object per
  // row — the whole file's content gone — and a `join` with an empty `with`
  // dropped every row. The one thing a user cannot do is see that.
  for (const [pipe, needle] of [
    ['[{"op":"filter"}]', '"expr" is required'],
    ['[{"op":"map"}]', '"expr" is required'],
    ['[{"op":"pick"}]', '"fields" is required'],
    ['[{"op":"omit"}]', '"fields" is required'],
    ['[{"op":"sort"}]', '"by" is required'],
    ['[{"op":"group"}]', '"by" is required'],
    ['[{"op":"rename"}]', '"mapping" is required'],
    ['[{"op":"flatten"}]', '"field" is required'],
    ['[{"op":"add"}]', '"fields" is required'],
    ['[{"op":"join","on":"city","with":[]}]', 'non-empty array of records'],
    ['[{"op":"join","with":[{"city":"Aarhus"}]}]', '"on" is required'],
    ['[{"op":"head","n":"2"}]', '"n" must be'],
    ['[{"op":"tail","n":-1}]', '"n" must be'],
    ['[{"op":"sort","by":42}]', '"by" must be']
  ]) {
    expectFail(`transmute test/fixtures/people.csv -p '${pipe}' -o csv`, 2, needle);
  }
});

test('a bad step is reported before the input is read', () => {
  // The step is the user's own typo; the file is a separate question. Order
  // them the other way and a mistyped pipeline is reported as a file problem.
  expectFail(`transmute test/fixtures/people.csv -f json -p '[{"op":"pick"}]' -o csv`, 2, '"fields" is required');
});

test('the message names the step that is wrong, not the first one', () => {
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"count"},{"op":"head","n":1},{"op":"group"}]' -o csv`, 2, 'step 3 (group)');
});

test('an inherited method is not an operation → exit 2', () => {
  // `operations.toString` exists on every object, so the old lookup found it and
  // ran `Object.prototype.toString` as a transformation: the whole file came
  // back as one row reading "[object Object]", with exit 0.
  expectFail(`transmute test/fixtures/people.csv -p '[{"op":"toString"}]' -o csv`, 2, 'Unknown operation: toString');
});

test('tail 0 is no rows, not every row', () => {
  const out = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"tail","n":0}]' -o json`));
  assert.equal(out.trim(), '[]');
});

test('the documented defaults still work: unique without by, head and tail without n', () => {
  const unique = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"unique"}]' -o csv`));
  assert.equal(unique.trim().split('\n').length - 1, 4);
  const head = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"head"}]' -o csv`));
  assert.equal(head.trim().split('\n').length - 1, 4);
  const tail = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"tail"}]' -o csv`));
  assert.equal(tail.trim().split('\n').length - 1, 4);
});

test('add still turns a per-record failure into null', () => {
  const out = expectOk(sh(`transmute test/fixtures/people.csv -p '[{"op":"add","fields":{"x":"item.nope.deep"}}]' -o csv`));
  assert.equal(out.includes(','), true, 'the null field must be in the output');
});

console.log('── each option is given once ──');

// The parser used to keep the last value of a repeated flag and say nothing,
// so a command that was not the command the user wrote exited 0 with an empty
// stderr and output that looked like the answer to it. Two `--pipe` flags ran
// one pipeline and dropped the other; `-f json -f csv` read JSON as CSV and
// wrote the empty result it made up.

test('two --pipe flags → exit 2, and the message says to put every step in one', () => {
  expectFail(
    `transmute test/fixtures/people.csv -p '[{"op":"sort","by":"age"}]' -p '[{"op":"head","n":3}]' -o csv`,
    2,
    'Put every step in one --pipe, as a JSON array.'
  );
});

test('a short alias and its long name are the same flag', () => {
  expectFail(
    `transmute test/fixtures/people.csv -p '[{"op":"head","n":1}]' --pipe '[{"op":"head","n":2}]' -o json`,
    2,
    '--pipe was given 2 times'
  );
});

test('two --format flags → exit 2, no empty CSV from reading JSON as CSV', () => {
  // `-f json -f csv` used to read the JSON fixture as a one-column CSV and
  // write the empty result, exit 0.
  expectFail(`transmute test/fixtures/people.csv -f json -f csv -o csv`, 2, '--format was given 2 times');
});

test('two --output flags → exit 2', () => {
  expectFail(`transmute test/fixtures/people.csv -o json -o csv`, 2, '--output was given 2 times');
});

test('two --delimiter flags → exit 2, no one-column file', () => {
  expectFail(`transmute test/fixtures/european.csv --delimiter ';' --delimiter ',' -o csv`, 2, '--delimiter was given 2 times');
});

test('two --table flags → exit 2', () => {
  expectFail(`transmute test/fixtures/people.csv -o sql --table t1 --table t2`, 2, '--table was given 2 times');
});

test('two --out flags → exit 2, and neither file is written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const first = join(dir, 'first.csv');
    const second = join(dir, 'second.csv');
    expectFail(`transmute test/fixtures/people.csv -o csv --out ${JSON.stringify(first)} --out ${JSON.stringify(second)}`, 2, '--out was given 2 times');
    assert.equal(existsSync(first), false, 'the first --out target must not be written');
    assert.equal(existsSync(second), false, 'the second --out target must not be written either');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the count is the whole command line, not the number of repeats found so far', () => {
  // The parser stops at the first repeat. Reporting "2 times" for a command
  // that gave the flag three times would be the same silence in miniature.
  expectFail(`transmute test/fixtures/people.csv -f json -f json -f json -o json`, 2, '--format was given 3 times');
});

test('every option once still works, in both spellings', () => {
  // `--table` is paired with `-o sql` here because a table name only exists in
  // SQL output; the test is about the spellings, not about the format.
  const out = expectOk(sh(`transmute test/fixtures/people.csv -f csv -p '[{"op":"head","n":2}]' -o sql --table people`));
  assert.equal(out.includes('Alice'), true, `expected Alice in: ${out}`);
  assert.equal(out.includes('Carla'), false, `head 2 must not reach Carla in: ${out}`);
  const shorthand = expectOk(sh(`transmute test/fixtures/people.csv --format csv --pipe '[{"op":"head","n":2}]' --output sql --table people`));
  assert.equal(shorthand, out);
});

test('--help says the same rule the error enforces', () => {
  const out = expectOk(sh(`"${process.execPath}" "${cli}" --help`));
  assert.equal(out.includes('Give each option once'), true, '--help does not say that each option is given once');
  assert.equal(out.includes('single --pipe'), true, '--help does not point at one --pipe');
});

test('the preview says it too, since that is where a user reads the options', () => {
  const out = expectOk(sh(`transmute test/fixtures/people.csv`));
  assert.equal(out.includes('Every option is given once'), true, 'the preview does not say that each option is given once');
});

console.log('── an option that cannot do its job ──');

// A repeated flag was the first silence of this kind, T28 stopped it. The other
// one is an option the CLI accepts and then cannot honour: `--out` used to run
// the preview and write no file at all, so the user asked for a file and got a
// table on the screen with exit 0 and an empty stderr.

test('--out without --output → exit 2, and the file is not written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const target = join(dir, 'people.csv');
    expectFail(`transmute test/fixtures/people.csv --out ${JSON.stringify(target)}`, 2, '--out needs --output');
    assert.equal(existsSync(target), false, 'nothing may be written when --out has no --output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--out with --pipe but no --output → exit 2, no table inside a .json file', () => {
  // The stronger half: with a --pipe the preview is skipped, so the file was
  // written — as an ASCII table, under a name that says JSON.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const target = join(dir, 'top.json');
    expectFail(`transmute test/fixtures/people.csv -p '[{"op":"head","n":2}]' --out ${JSON.stringify(target)}`, 2, '--out needs --output');
    assert.equal(existsSync(target), false, 'no file may be written without --output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--table without --output sql → exit 2, and the message names the format', () => {
  expectFail(`transmute test/fixtures/people.csv --table users -o csv`, 2, 'the output here is csv');
});

test('--table on the preview → exit 2, and the message says what the output is', () => {
  expectFail(`transmute test/fixtures/people.csv --table users`, 2, 'the output here is a preview');
});

test('--delimiter on input that is not CSV → exit 2, and it names the format', () => {
  expectFail(`transmute test/fixtures/orders.json --delimiter ';' -o json`, 2, 'this input is json');
});

test('--delimiter with CSV output but non-CSV input → exit 2, because the writer ignores it', () => {
  // The CSV writer always writes a comma and quotes a field that contains one
  // of the delimiters it knows, so the flag cannot steer the output at all.
  // Measured: with and without the flag the CSV is byte-identical.
  expectFail(`transmute test/fixtures/orders.json -o csv --delimiter ';'`, 2, 'this input is json');
});

test('the three options are only refused where they cannot apply', () => {
  // The near misses are the point: a delimiter still decides how a CSV input is
  // read when the output is JSON, and a table name is what SQL output is for.
  const rows = JSON.parse(expectOk(sh(`transmute test/fixtures/european.csv --delimiter ';' -o json`)));
  assert.equal(rows.length, 2, 'the Danish semicolon file must still be read as its two rows');
  assert.equal(rows[0].navn, 'Mette', 'the explicit delimiter must still win over detection');
  assert.equal(rows[0].note, 'Salg, mellem', 'a quoted field with the delimiter inside it must survive');

  const sql = expectOk(sh(`transmute test/fixtures/people.csv -o sql --table people`));
  assert.equal(sql.includes('INSERT INTO "people"'), true, `--table must still name the SQL table: ${sql}`);

  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const written = join(dir, 'out.json');
    expectOk(sh(`transmute test/fixtures/people.csv -o json --out ${JSON.stringify(written)}`));
    const out = JSON.parse(readFileSync(written, 'utf-8'));
    assert.equal(out[0].name, 'Alice', '--out with --output must still write the file');
    assert.equal(existsSync(join(dir, 'out.json')), true, 'the file the user asked for must exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an option that cannot apply is refused before the input is read', () => {
  // The two relations that need no data are answered from the flags alone, so a
  // typo is a usage error even when the file is missing. The delimiter needs the
  // format the file was detected as, so there the missing file is still what the
  // user has to hear about first.
  expectFail(`transmute test/fixtures/nope.csv --out out.json`, 2, '--out needs --output');
  expectFail(`transmute test/fixtures/nope.csv --table users -o csv`, 2, '--table names the table');
  expectFail(`transmute test/fixtures/nope.json --delimiter ';' -o json`, 3, 'File not found');
});

test('--help and the preview name the rule the errors enforce', () => {
  const help = expectOk(sh(`"${process.execPath}" "${cli}" --help`));
  for (const rule of ['--out needs --output', '--table needs --output sql', '--delimiter needs CSV input']) {
    assert.equal(help.includes(rule), true, `--help does not say: ${rule}`);
  }
  const preview = expectOk(sh(`transmute test/fixtures/people.csv`));
  assert.equal(preview.includes('--out needs --output'), true, 'the preview does not say --out needs --output');
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

console.log('── a field name no record has ──');

test('a mistyped field is written to stderr, and the file still lands', () => {
  // `age` typed as `ag`: `unique` compared `undefined` to `undefined`, found
  // all three rows identical and wrote one of them, with nothing on stderr to
  // say the file was not the one that was asked for.
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"unique","by":"ag"}]' -o json`);
  assert.equal(r.status, 0, 'a field a file does not have is a warning, not a broken pipeline');
  assert.equal(JSON.parse(r.stdout).length, 1);
  assert.match(r.stderr, /Warning: unique: no record has a field named "ag"/, r.stderr);
  assert.match(r.stderr, /1 of 4 rows survived/, r.stderr);
});

test('stdout stays exactly the data when a field is missing', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"sort","by":"ag"}]' -o csv`);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /the rows are in their original order, not sorted/, r.stderr);
  const rows = r.stdout.trim().split('\n');
  assert.equal(rows[0], 'name,age,zip,active,city');
  assert.equal(rows.length, 5, r.stdout);
});

test('a field the data has is not reported missing', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"sort","by":"age","dir":"desc"},{"op":"rename","mapping":{"city":"town"}},{"op":"pick","fields":["name","town"]}]' -o json`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', `unexpected warning: ${r.stderr}`);
  const rows = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(rows[0]), ['name', 'town']);
  assert.equal(rows[0].name, 'Carla', 'the sort really did run, and the oldest is first');
  assert.equal(rows.length, 4, r.stdout);
});

console.log('── a step that meets rows it cannot read ──');

test('a step that names a field fails on a row that is not a record', () => {
  // The silent half of the family. After a `map` that leaves strings, `omit`
  // wrote columns `0 1 2 3` holding `A l i c e`, `rename` did the same, `add`
  // spread the string away and lost it, `group` filed everything under
  // "(null)", `unique` compared `undefined` to `undefined` and kept one of two
  // rows, and `join` dropped every row. Exit 0, empty stderr, every time.
  for (const step of [
    '{"op":"pick","fields":["name"]}',
    '{"op":"omit","fields":"name"}',
    '{"op":"rename","mapping":{"name":"n"}}',
    '{"op":"add","fields":{"x":"1"}}',
    '{"op":"sort","by":"name"}',
    '{"op":"group","by":"name"}',
    '{"op":"unique","by":"name"}',
    '{"op":"join","with":[{"name":"Alice"}],"on":"name"}'
  ]) {
    const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"map","expr":"item.name"},${step}]' -o json`);
    assert.equal(r.status, 1, `${step} exited ${r.status}, stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `${step} wrote to stdout anyway: ${r.stdout}`);
    assert.match(r.stderr, /not a record/, `${step}: ${r.stderr}`);
    assert.match(r.stderr, /row 1 is a string \("Alice"\)/, `${step}: ${r.stderr}`);
  }
});

test('the failure is a transformation error, not a usage error', () => {
  // The pipeline is a good pipeline for a file of records. It is the rows that
  // are not, so this is exit 1 like any other failed transformation, and not
  // exit 2, which belongs to a flag or an expression the user mistyped.
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"map","expr":"item.name"},{"op":"pick","fields":["name"]}]' -o csv`);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Pipeline step 2 \(pick\)/, r.stderr);
  assert.match(r.stderr, /use map to turn each row into a record first/, r.stderr);
});

test('a step that needs no field still runs on rows that are not records', () => {
  const r = sh(`"${process.execPath}" "${cli}" test/fixtures/people.csv -f csv --pipe '[{"op":"map","expr":"item.city"},{"op":"unique"},{"op":"count"}]' -o json`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  // Four rows, two cities: `unique` over the values is what the step is for.
  assert.deepEqual(JSON.parse(r.stdout), [{ count: 2 }]);
});

console.log('── input that is not UTF-8 ──');

/** A file whose bytes are deliberately not UTF-8, written byte for byte. */
function writeBytes(dir, name, bytes) {
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(bytes));
  return path;
}

test('a latin-1 file is refused, not silently mangled into U+FFFD', () => {
  // `M\xf8ller` is `Møller` in ISO-8859-1, which is what a Windows export of a
  // Danish customer list looks like. It used to come out as `M?ller`, exit 0,
  // empty stderr, and the mangled name was written to the output file — the one
  // failure in this list that destroyed the characters instead of hiding a wrong
  // answer.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = writeBytes(dir, 'latin1.csv', [0x6e, 0x61, 0x76, 0x6e, 0x0a, 0x4d, 0xf8, 0x6c, 0x6c, 0x65, 0x72, 0x0a]);
    const out = join(dir, 'out.json');
    const result = spawnSync(process.execPath, [cli, path, '-o', 'json', '--out', out], { encoding: 'utf-8' });
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, '', `stdout should stay empty on error, got: ${result.stdout}`);
    assert.ok(result.stderr.includes('is not valid UTF-8'), result.stderr);
    assert.ok(result.stderr.includes('iconv'), 'the message should say how to convert the file');
    assert.equal(existsSync(out), false, 'a file the CLI could not read must not produce output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a latin-1 file is refused in the preview too, and nothing is printed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = writeBytes(dir, 'latin1.csv', [0x6e, 0x61, 0x76, 0x6e, 0x0a, 0x4d, 0xf8, 0x6c, 0x6c, 0x65, 0x72, 0x0a]);
    const result = spawnSync(process.execPath, [cli, path], { encoding: 'utf-8' });
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, '', 'the preview must not print a table built from characters that were lost');
    assert.ok(result.stderr.includes('is not valid UTF-8'), result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('piped latin-1 is refused the same way, and the message says stdin', () => {
  // A pipe is read as bytes too. Decoding with setEncoding('utf-8') in the stdin
  // reader made a piped file behave exactly like a piped latin-1 one.
  const result = spawnSync(process.execPath, [cli, '-f', 'csv', '-o', 'json'], { encoding: 'utf-8', input: Buffer.from([0x6e, 0x61, 0x76, 0x6e, 0x0a, 0x4d, 0xf8, 0x6c, 0x6c, 0x65, 0x72, 0x0a]) });
  assert.equal(result.status, 3, `expected exit 3, got ${result.status}: ${result.stderr}`);
  assert.equal(result.stdout, '', `stdout should stay empty on error, got: ${result.stdout}`);
  assert.ok(result.stderr.includes('stdin is not valid UTF-8'), result.stderr);
});

test('a UTF-16 file is refused instead of becoming a field name of U+FFFD', () => {
  // The worst case measured: the BOM and the NUL bytes between every character
  // decoded into one header key, so the first record had a single field called
  // "��n\u0000a\u0000v\u0000n" and the file looked like it had been read.
  const bytes = [0xff, 0xfe];
  for (const ch of 'navn\n') bytes.push(ch.charCodeAt(0), 0x00);
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = writeBytes(dir, 'utf16.csv', bytes);
    const result = spawnSync(process.execPath, [cli, path, '-f', 'csv', '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(result.status, 3, `expected exit 3, got ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, '', `stdout should stay empty on error, got: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the reported position is the character that could not be read', () => {
  // "navn\nM\xf8ller\n" decodes to "navn\nM\uFFFDller\n", so the first character
  // that is not what the file holds is at index 6. A number that points at the
  // wrong place sends the user to the wrong byte.
  const result = spawnSync(process.execPath, [cli, '-f', 'csv', '-o', 'json'], {
    encoding: 'utf-8',
    input: Buffer.from([0x6e, 0x61, 0x76, 0x6e, 0x0a, 0x4d, 0xf8, 0x6c, 0x6c, 0x65, 0x72, 0x0a]),
  });
  assert.ok(result.stderr.includes('position 6'), result.stderr);
});

test('a UTF-8 file that really contains U+FFFD is read, not refused', () => {
  // The check is on the bytes and never on the decoded text, so a file whose
  // author really typed U+FFFD is left alone. Refusing on the decoded text
  // instead would break a valid file — the same over-refusal T26 warned about
  // for field names.
  const result = spawnSync(process.execPath, [cli, '-f', 'csv', '-o', 'json'], {
    encoding: 'utf-8',
    input: Buffer.from('navn\nM\uFFFDller\n', 'utf-8'),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [{ navn: 'M\uFFFDller' }]);
});

test('non-ASCII UTF-8 still round-trips: nordic letters, emoji and CJK', () => {
  // The fix must not narrow what the tool accepts. These are the characters a
  // Danish, Japanese or emoji-bearing export is made of.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'utf8.csv');
    writeFileSync(path, 'navn\nMøller\n🚀日本\n', 'utf-8');
    const out = JSON.parse(expectOk(spawnSync(process.execPath, [cli, '-f', 'csv', '-o', 'json'], { encoding: 'utf-8', input: readFileSync(path) })));
    assert.deepEqual(out.map(row => row.navn), ['Møller', '🚀日本']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('── XML output has to be well-formed ──');

test('a value XML 1.0 cannot write → exit 1, and no file is written', () => {
  // A NUL inside a value is ordinary data — a fixed-width export, a legacy file
  // — and it used to be written straight into the file. The result declared
  // `version="1.0"` and no XML parser would accept it, while this tool's own
  // reader read it back, so a round trip through Transmute hid it. Exit was 0.
  //
  // There is no entity that saves it: `&#0;` is refused by the same rule of the
  // specification. So the run stops and says where the character is.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'ctrl.json');
    writeFileSync(path, JSON.stringify([{ id: 1, note: 'a' + String.fromCharCode(0) + 'b' }]), 'utf-8');
    const out = join(dir, 'out.xml');
    const result = spawnSync(process.execPath, [cli, path, '-o', 'xml', '--out', out], { encoding: 'utf-8' });
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, '', `stdout should stay empty on error, got: ${result.stdout}`);
    assert.ok(result.stderr.includes('U+0000 (NUL)'), result.stderr);
    assert.ok(result.stderr.includes('field "note"'), 'the message should name the field: ' + result.stderr);
    assert.equal(existsSync(out), false, 'a file the CLI refused to write must not exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a value that is not finite stops every writer, and no file is left behind', () => {
  // `1e400` is a legal JSON number literal, so this input is a file any JSON tool
  // accepts — and it parses to Infinity. From there the six writers disagreed
  // about one value, all of them at exit 0 with empty stderr: `json` wrote
  // `null` in its place, and `csv`, `yaml`, `sql`, `table` and `xml` wrote the
  // bare word, which PyYAML, SQLite and every XML parser hand back as a string.
  // So the number silently changed type in five formats and stopped existing in
  // the sixth. Measured here on the real binary, then refused by all six.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'inf.json');
    writeFileSync(path, '[{"id":1,"a":1e400,"ok":1e308}]', 'utf-8');
    for (const format of ['json', 'csv', 'yaml', 'sql', 'table', 'xml']) {
      const out = join(dir, `out.${format}`);
      const result = spawnSync(process.execPath, [cli, path, '-o', format, '--out', out], { encoding: 'utf-8' });
      assert.equal(result.status, 1, `${format}: expected exit 1, got ${result.status}: ${result.stderr}`);
      assert.equal(result.stdout, '', `${format}: stdout should stay empty on error, got: ${result.stdout}`);
      assert.ok(result.stderr.includes('Infinity'), `${format}: the message must name the value: ${result.stderr}`);
      assert.ok(result.stderr.includes('field "a"'), `${format}: the message must name the field: ${result.stderr}`);
      assert.equal(existsSync(out), false, `${format}: a file the CLI refused to write must not exist`);
    }
    // The boundary is finiteness, not size: the largest finite double is written
    // like any other number, and no format may refuse it.
    const finite = join(dir, 'finite.json');
    writeFileSync(finite, '[{"v":1.7976931348623157e308,"w":5e-324}]', 'utf-8');
    const text = expectOk(spawnSync(process.execPath, [cli, finite, '-o', 'json'], { encoding: 'utf-8' }));
    assert.strictEqual(JSON.parse(text)[0].v, 1.7976931348623157e308);
    assert.ok(text.includes('5e-324'), text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a division by zero in a pipeline is refused by name, not written as null', () => {
  // The second way in, and the one a user meets: JSON cannot spell NaN or
  // Infinity, but an `add` expression divides by zero all the time — an `amount
  // / units` on a row where units is 0. Before this the run exited 0 and wrote
  // `null` for the field, which is a value the next step will happily carry on
  // as if it were data.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'rows.json');
    writeFileSync(path, '[{"amount":10,"units":0}]', 'utf-8');
    const out = join(dir, 'out.csv');
    const result = spawnSync(
      process.execPath,
      [cli, path, '-o', 'csv', '--out', out, '--pipe', '[{"op":"add","fields":{"price":"item.amount / item.units"}}]'],
      { encoding: 'utf-8' }
    );
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}: ${result.stderr}`);
    assert.ok(result.stderr.includes('field "price"'), result.stderr);
    assert.ok(result.stderr.includes('1/0'), 'the message should name the usual cause: ' + result.stderr);
    assert.equal(existsSync(out), false, 'a refused run must not leave a file');
    // The same pipeline with a denominator that is not zero is ordinary work.
    writeFileSync(path, '[{"amount":10,"units":4}]', 'utf-8');
    const ok = expectOk(spawnSync(
      process.execPath,
      [cli, path, '-o', 'csv', '--pipe', '[{"op":"add","fields":{"price":"item.amount / item.units"}}]'],
      { encoding: 'utf-8' }
    ));
    assert.ok(ok.includes('2.5'), ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the character XML can write is still written, byte for byte', () => {
  // The guard must not narrow what the tool accepts. Tab, newline and carriage
  // return are inside the `Char` production, and CJK, emoji and astral
  // characters are above #xFFFF — all of them have to survive a round trip.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const C = (n) => String.fromCharCode(n);
    const rows = [{ note: 'café 日本 🚀', tab: 'a' + C(9) + 'b', nl: 'a' + C(10) + 'b', cr: 'a' + C(13) + 'b' }];
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify(rows), 'utf-8');
    const xml = expectOk(spawnSync(process.execPath, [cli, path, '-o', 'xml'], { encoding: 'utf-8' }));
    assert.ok(xml.includes('version="1.0"'), xml);
    const back = expectOk(spawnSync(process.execPath, [cli, '-f', 'xml', '-o', 'json'], { encoding: 'utf-8', input: xml }));
    assert.deepEqual(JSON.parse(back), rows);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a NUL stops every writer but JSON, and no file is left behind', () => {
  // The error message tells the user to write JSON instead, so that advice is
  // only honest if the JSON run really does produce the value — and every other
  // writer has to stop, because a NUL that survives into the file is a file no
  // reader of that format opens. Measured, not assumed: Python's csv raises
  // `line contains NUL`, SQLite reports `unrecognized token` inside the literal,
  // PyYAML answers `unacceptable character #x0000`, and `file(1)` calls all of
  // them `data` rather than text. This test used to assert the opposite for CSV,
  // SQL, YAML and the table, having asked only whether the byte survived the
  // write. `--out` is the part that matters most: nothing may reach the disk.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'nul.json');
    writeFileSync(path, JSON.stringify([{ id: 1, note: 'a' + String.fromCharCode(0) + 'b' }]), 'utf-8');
    for (const format of ['xml', 'csv', 'yaml', 'sql', 'table']) {
      const out = join(dir, `nul.${format}`);
      for (const argv of [['-o', format], ['-o', format, '--out', out]]) {
        const result = spawnSync(process.execPath, [cli, path, ...argv], { encoding: 'utf-8' });
        assert.equal(result.status, 1, `${format} ${argv.join(' ')}: exit ${result.status}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${format} ${argv.join(' ')}: stdout must stay empty`);
        assert.ok(result.stderr.startsWith('Error: '), `${format}: ${result.stderr}`);
        assert.ok(result.stderr.includes('U+0000 (NUL)'), `${format}: ${result.stderr}`);
        assert.ok(result.stderr.includes('field "note"'), `${format}: ${result.stderr}`);
        assert.ok(!existsSync(out), `${format}: ${out} must not be written`);
      }
    }
    // JSON escapes it, so the value survives byte for byte and stderr is empty.
    const json = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(json.status, 0, json.stderr);
    assert.equal(json.stderr, '', json.stderr);
    assert.ok(json.stdout.includes('a\\u0000b'), json.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a lone surrogate stops every writer but JSON, and is never replaced by U+FFFD', () => {
  // A lone surrogate is not a character a file can hold: it is half of a UTF-16
  // pair whose other half never arrived, and UTF-8 has no encoding of it. So it
  // is reachable from plain ASCII input — JSON's `\udXXX` escape produces one —
  // and every writer silently substituted U+FFFD for it. `csv`, `sql` and `table`
  // wrote `61 efbf bd 62` at exit 0 with empty stderr while `json`, `yaml` and
  // `xml` disagreed in the same run, so the value that came out was a different
  // value from the one that went in and no reader could tell.
  //
  // The assertion that matters is the negative one: U+FFFD must not appear in
  // what any writer produces. Checking only for exit 1 would pass against a fix
  // that stripped the character instead of refusing it — the silent data loss
  // this exists to prevent — so every format is read back and searched.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'half.json');
    writeFileSync(path, '[{"id":1,"note":"a\\ud800b"}]', 'utf-8');
    for (const format of ['xml', 'csv', 'yaml', 'sql', 'table']) {
      const out = join(dir, `half.${format}`);
      for (const argv of [['-o', format], ['-o', format, '--out', out]]) {
        const result = spawnSync(process.execPath, [cli, path, ...argv], { encoding: 'utf-8' });
        assert.equal(result.status, 1, `${format} ${argv.join(' ')}: exit ${result.status}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${format} ${argv.join(' ')}: stdout must stay empty`);
        assert.ok(result.stderr.includes('U+D800 (half of a surrogate pair'), `${format}: ${result.stderr}`);
        assert.ok(result.stderr.includes('field "note"'), `${format}: ${result.stderr}`);
        assert.ok(!result.stdout.includes('\uFFFD'), `${format}: stdout must not carry the substitute`);
        assert.ok(!existsSync(out), `${format}: ${out} must not be written`);
      }
    }
    // JSON escapes it as seven ASCII bytes that parse back to the same value, so
    // the advice the message gives is honest and the round trip is lossless.
    const json = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(json.status, 0, json.stderr);
    assert.equal(json.stderr, '', json.stderr);
    assert.ok(json.stdout.includes('a\\ud800b'), json.stdout);
    const back = spawnSync(process.execPath, [cli, '-', '-o', 'json'], { input: json.stdout, encoding: 'utf-8' });
    assert.equal(back.status, 0, back.stderr);
    assert.ok(back.stdout.includes('a\\ud800b'), back.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a full surrogate pair is written by every format, and a noncharacter is not confused with one', () => {
  // The refusal is a surrogate, not an astral character. 🚀 is one character made
  // of two UTF-16 units, and a rule written against the code units instead of
  // the code points would refuse every emoji on earth. U+FFFE is the neighbour
  // that really is refused by YAML and XML, and the three text writers do write
  // it: it encodes, it survives the round trip and `file(1)` calls the result
  // text, so the line the plan draws is "can a reader read the file", not
  // "does a grammar mention it".
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'emoji.json');
    writeFileSync(path, JSON.stringify([{ note: 'a' + String.fromCodePoint(0x1f600) + 'b' }]), 'utf-8');
    for (const format of ['json', 'csv', 'yaml', 'table', 'sql', 'xml']) {
      const result = spawnSync(process.execPath, [cli, path, '-o', format], { encoding: 'utf-8' });
      assert.equal(result.status, 0, `${format} must carry an emoji: ${result.stderr}`);
      assert.equal(result.stderr, '', `${format}: ${result.stderr}`);
      assert.ok(result.stdout.includes('\u{1F600}'), `${format}: ${JSON.stringify(result.stdout)}`);
    }
    const noncharacter = join(dir, 'fffe.json');
    writeFileSync(noncharacter, JSON.stringify([{ note: 'a' + String.fromCodePoint(0xfffe) + 'b' }]), 'utf-8');
    for (const format of ['yaml', 'xml']) {
      const result = spawnSync(process.execPath, [cli, noncharacter, '-o', format], { encoding: 'utf-8' });
      assert.equal(result.status, 1, `${format} must refuse U+FFFE: ${result.stderr}`);
      assert.ok(result.stderr.includes('U+FFFE'), `${format}: ${result.stderr}`);
    }
    for (const format of ['csv', 'table', 'sql', 'json']) {
      const out = join(dir, `fffe.${format}`);
      const result = spawnSync(process.execPath, [cli, noncharacter, '-o', format, '--out', out], { encoding: 'utf-8' });
      assert.equal(result.status, 0, `${format} must carry U+FFFE: ${result.stderr}`);
      assert.ok(readFileSync(out, 'utf-8').includes(String.fromCodePoint(0xfffe)), `${format} lost U+FFFE`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a key given twice is warned about on stderr and stdout stays data', () => {
  // The warning is the whole point, and the split is the contract: stdout is
  // what a script pipes onward, so it must parse without the reader stripping
  // anything off the front.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'dup.json');
    writeFileSync(path, '{\n  "id": 1,\n  "name": "Ada",\n  "name": "Bob"\n}\n', 'utf-8');
    const result = spawnSync(process.execPath, [cli, path, '-o', 'csv'], { encoding: 'utf-8' });
    assert.equal(result.status, 0, `exit ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, 'id,name\n1,Bob\n', 'stdout must be clean data');
    assert.ok(result.stderr.startsWith('Warning: JSON: key "name"'), result.stderr);
    assert.ok(result.stderr.includes('"Ada"') && result.stderr.includes('"Bob"'), result.stderr);
    // A file with no collision must not produce a single byte on stderr.
    writeFileSync(path, '{"id":1,"name":"Ada"}\n', 'utf-8');
    assert.equal(spawnSync(process.execPath, [cli, path, '-o', 'csv'], { encoding: 'utf-8' }).stderr, '');
    // And on a pipe, where there is no file to point at.
    const piped = spawnSync(process.execPath, [cli, '-f', 'json', '-o', 'csv'], {
      encoding: 'utf-8',
      input: '[{"a":1,"a":2}]'
    });
    assert.equal(piped.status, 0, piped.stderr);
    assert.equal(piped.stdout, 'a\n2\n');
    assert.ok(piped.stderr.includes('key "a"'), piped.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a second XML root element stops the run with exit 3', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'two.xml');
    // Two documents, two different root names: the reader says what it found.
    writeFileSync(path, '<rows><row><a>1</a></row></rows>\n<more><row><b>2</b></row></more>\n', 'utf-8');
    const named = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(named.status, 3, `exit ${named.status}: ${named.stderr}`);
    assert.equal(named.stdout, '', 'a refused input must not write a partial file to stdout');
    assert.ok(named.stderr.includes('one root element'), named.stderr);
    assert.ok(named.stderr.includes('<more>'), named.stderr);
    // The same file with the *same* root name twice — what a batch tool that
    // appends records actually writes. The reader ends the root where the root's
    // own nesting ends, so this one is named by the same rule as the case above.
    writeFileSync(path, '<rows><row><a>1</a></row></rows>\n<rows><row><b>2</b></row></rows>\n', 'utf-8');
    const same = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(same.status, 3, `exit ${same.status}: ${same.stderr}`);
    assert.equal(same.stdout, '', 'a refused input must not write a partial file to stdout');
    assert.ok(same.stderr.includes('one root element'), same.stderr);
    assert.ok(same.stderr.includes('</rows>'), same.stderr);
    // A first document that closes itself is the same file, and used to be read
    // as the root's one child instead of being named at all.
    writeFileSync(path, '<rows/>\n<rows><row><b>2</b></row></rows>\n', 'utf-8');
    const selfClosed = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(selfClosed.status, 3, `exit ${selfClosed.status}: ${selfClosed.stderr}`);
    assert.equal(selfClosed.stdout, '');
    assert.ok(selfClosed.stderr.includes('one root element'), selfClosed.stderr);
    // A single document with a prologue and a comment is still one document.
    writeFileSync(path, '<?xml version="1.0"?>\n<!-- two rows -->\n<rows><row><a>1</a></row></rows>\n', 'utf-8');
    assert.equal(spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' }).status, 0);
    // And a root that closes itself is a document, not a truncated one.
    writeFileSync(path, '<rows/>\n', 'utf-8');
    const alone = spawnSync(process.execPath, [cli, path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(alone.status, 0, `exit ${alone.status}: ${alone.stderr}`);
    assert.equal(alone.stdout, '[]\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a flow collection that is the whole yaml file is read as its content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transmute-'));
  try {
    const path = join(dir, 'flow.yaml');
    // The block reader took `{a` for a key, so the file's content came out as
    // one field holding the text `1, b: two` — exit 0, empty stderr, and a
    // conversion of a document nobody wrote.
    writeFileSync(path, '{a: 1, b: two}\n', 'utf-8');
    const out = expectOk(spawnSync(process.execPath, [cli, '-f', 'yaml', path, '-o', 'json'], { encoding: 'utf-8' }));
    assert.equal(out, '[\n  {\n    "a": 1,\n    "b": "two"\n  }\n]\n');
    // The same duplicate-key rule as everywhere else, on a file this shape.
    writeFileSync(path, '{a: 1, a: 2}\n', 'utf-8');
    const dup = spawnSync(process.execPath, [cli, '-f', 'yaml', path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(dup.status, 0, dup.stderr);
    assert.equal(dup.stdout, '[\n  {\n    "a": 2\n  }\n]\n');
    assert.ok(dup.stderr.includes('key "a"'), dup.stderr);
    // An unbalanced brace is a different file and is not a flow document.
    writeFileSync(path, '{a: 1\n', 'utf-8');
    const open = expectOk(spawnSync(process.execPath, [cli, '-f', 'yaml', path, '-o', 'json'], { encoding: 'utf-8' }));
    assert.equal(open, '[\n  {\n    "{a": 1\n  }\n]\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
