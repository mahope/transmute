/**
 * Conformance tests: the CLI engine and the browser engine must be the same
 * product, and the documentation must describe what the tool actually does.
 *
 * The browser engine is site/engine.js, loaded the same way site/try.html
 * loads it — no bundler, no Node built-ins, just a `module.exports` shim.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import engine from '../src/engine.js';
import { CASES, bigDataset, fixtureText } from './fixtures/cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const expected = JSON.parse(readFileSync(join(here, 'fixtures', 'expected.json'), 'utf-8'));
const docs = readFileSync(join(root, 'docs', 'cli.md'), 'utf-8');
const readme = readFileSync(join(root, 'README.md'), 'utf-8');

const { run, operations } = engine;

/** Load the site copy exactly as try.html does. */
function loadBrowserEngine() {
  const source = readFileSync(join(root, 'site', 'engine.js'), 'utf-8');
  const sandbox = { module: { exports: {} }, console };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'site/engine.js' });
  return sandbox.module.exports;
}

const browser = loadBrowserEngine();

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

console.log('\n📋 Transmute Conformance Tests\n');

console.log('── real-world CSV, in both engines ──');

/** Both engines must agree on the CSV promises, not just on the fixtures. */
function csvParity(text, opts) {
  const cli = engine.parsers.csv(text, opts);
  const web = browser.parsers.csv(text, opts);
  assert.equal(JSON.stringify(web), JSON.stringify(cli), 'the two CSV readers disagree');
  return cli;
}

test('a semicolon CSV keeps its columns in both engines', () => {
  const rows = csvParity('navn;by;pris\nMette;Copenhagen;199,50\n');
  assert.deepEqual(rows, [{ navn: 'Mette', by: 'Copenhagen', pris: '199,50' }]);
});

test('a tab-separated file is three columns in both engines', () => {
  assert.deepEqual(csvParity('id\tname\n1\tWidget\n'), [{ id: 1, name: 'Widget' }]);
});

test('a quoted newline does not invent a row in both engines', () => {
  const rows = csvParity('id,note\n1,"line1\nline2"\n2,ok\n');
  assert.equal(rows.length, 2, 'the embedded newline created a phantom record');
  assert.equal(rows[0].note, 'line1\nline2');
});

test('whitespace inside quotes is data in both engines', () => {
  assert.equal(csvParity('id,name\n1," padded "\n')[0].name, ' padded ');
  assert.equal(csvParity('id,name\n1,  padded  \n')[0].name, 'padded');
});

test('an explicit delimiter wins over the detected one in both engines', () => {
  assert.deepEqual(csvParity('a|b\n1|2\n', { delimiter: '|' }), [{ a: 1, b: 2 }]);
  assert.deepEqual(Object.keys(csvParity('a;b\n1;2\n', { delimiter: ',' })[0]), ['a;b']);
});

test('a byte-order mark and CRLF line endings survive in both engines', () => {
  assert.deepEqual(csvParity('﻿navn;alder\r\nAlice;30\r\n'), [{ navn: 'Alice', alder: 30 }]);
});

console.log('── engine parity: CLI vs browser ──');

for (const testCase of CASES) {
  test(`${testCase.name}: identical output in both engines`, () => {
    const input = fixtureText(testCase.fixture, testCase.file);
    const cli = run(input, testCase.fixture, testCase.pipeline, testCase.outputFormat, testCase.opts || {});
    const web = browser.run(input, testCase.fixture, testCase.pipeline, testCase.outputFormat, testCase.opts || {});
    assert.equal(cli.error, undefined, `CLI error: ${cli.error}`);
    assert.equal(web.error, undefined, `browser error: ${web.error}`);
    assert.equal(web.text, cli.text, 'browsers and CLI disagree');
    // The browser engine runs in its own vm realm, so compare by value, not by prototype.
    assert.equal(JSON.stringify(web.data), JSON.stringify(cli.data), 'parsed data differs');
    assert.equal(cli.text, expected[testCase.name], 'snapshot is stale — run npm run snapshots:cli');
  });
}

test('the site copy exposes the same operations as the CLI engine', () => {
  assert.deepEqual(Object.keys(browser.operations).sort(), Object.keys(operations).sort());
  assert.deepEqual(Object.keys(browser.serializers).sort(), Object.keys(engine.serializers).sort());
  assert.deepEqual(Object.keys(browser.parsers).sort(), Object.keys(engine.parsers).sort());
});

test('every operation has at least one documented fixture case', () => {
  const covered = new Set(CASES.map(c => c.op).filter(Boolean));
  const missing = Object.keys(operations).filter(op => !covered.has(op));
  assert.deepEqual(missing, [], `undocumented operations: ${missing.join(', ')}`);
});

test('all four input formats and all six output formats are covered', () => {
  const inputs = new Set(CASES.map(c => c.fixture));
  assert.deepEqual([...inputs].sort(), ['csv', 'json', 'xml', 'yaml']);
  const outputs = new Set(CASES.map(c => c.outputFormat));
  assert.deepEqual([...outputs].sort(), ['csv', 'json', 'sql', 'table', 'xml', 'yaml']);
});

console.log('── no limits, no network ──');

test('50 records transform in one run, identical in both engines', () => {
  const input = bigDataset(50);
  const pipeline = [{ op: 'filter', expr: 'item.active' }, { op: 'sort', by: 'score', dir: 'desc' }];
  const cli = run(input, 'json', pipeline, 'csv');
  const web = browser.run(input, 'json', pipeline, 'csv');
  assert.equal(cli.error, undefined);
  assert.equal(cli.text, web.text);
  assert.equal(cli.data.length, 34); // every third record is inactive
  assert.equal(cli.text.trim().split('\n').length, 35); // header + 34 rows
});

test('the engine has no network, fs or process access', () => {
  const source = readFileSync(join(root, 'site', 'engine.js'), 'utf-8');
  for (const forbidden of ['require(', 'fetch(', 'XMLHttpRequest', 'process.', 'import(']) {
    assert.equal(source.includes(forbidden), false, `engine must not use ${forbidden}`);
  }
});

console.log('── documentation matches the tool ──');

test('docs/cli.md documents every operation', () => {
  for (const op of Object.keys(operations)) {
    assert.equal(docs.includes(op), true, `docs/cli.md does not mention ${op}`);
  }
  assert.equal(docs.includes('Exit codes'), true, 'docs/cli.md must document the exit codes');
  assert.equal(docs.includes('Node'), true, 'docs/cli.md must document the runtime requirement');
});

test('README documents every operation', () => {
  for (const op of Object.keys(operations)) {
    assert.equal(readme.includes(op), true, `README does not mention ${op}`);
  }
});

console.log('── the error, the help and docs/cli.md say the same thing ──');

/** Run the real binary, so the message locked below is the one a user gets. */
function runCli(args, input) {
  return spawnSync(process.execPath, [join(root, 'src', 'cli.js'), ...args], { cwd: root, encoding: 'utf-8', input });
}

const help = runCli(['--help']).stdout;

test('docs/cli.md quotes the real error for an option given twice', () => {
  // Two --pipe flags used to run one pipeline and drop the other, exit 0 and
  // an empty stderr. The docs have to carry the message the CLI now prints, or
  // a reader is told about a rule the tool does not enforce.
  const result = runCli(['test/fixtures/people.csv', '-p', '[{"op":"head","n":1}]', '-p', '[{"op":"head","n":2}]', '-o', 'csv']);
  assert.equal(result.status, 2, `a repeated --pipe should be a usage error, got exit ${result.status}`);
  assert.equal(result.stdout, '', 'a repeated option must leave stdout empty');
  const message = result.stderr.trim().replace(/^Error: /, '');
  assert.equal(docs.includes(message), true, `docs/cli.md does not quote the error verbatim: ${message}`);
  assert.equal(help.includes('Give each option once'), true, '--help does not say that each option is given once');
  assert.equal(docs.includes('Given each option is given once') || docs.includes('Each option is given once'), true, 'docs/cli.md does not state the rule in prose');
});

test('every option the parser accepts is in the docs, in the help, and checked for repeats', () => {
  // The docs table is the list here, so it is what the parser and the help are
  // held against: an option the parser accepts without documenting it, or a
  // documented option nobody accepts, fails this.
  const table = docs.slice(docs.indexOf('## Options'), docs.indexOf('## Exit codes'));
  const documented = [...table.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)]
    .flatMap(row => row[1].split(',').map(token => token.trim().split(' ')[0]))
    .filter(token => token.startsWith('-'));
  assert.ok(documented.length >= 10, `the docs option table looks unparsed: ${documented.join(' ')}`);

  const source = readFileSync(join(root, 'src', 'cli.js'), 'utf-8');
  for (const option of documented) {
    assert.equal(help.includes(option), true, `--help does not document ${option}`);
    if (option === '-v' || option === '-h' || option === '--version' || option === '--help') continue;
    assert.equal(
      new RegExp(`['"]${option}['"]:\\s*'(--[a-z]+)'`).test(source),
      true,
      `${option} is not mapped to a counted option name in the parser`
    );
    const counted = source.match(new RegExp(`['"]${option}['"]:\\s*'(--[a-z]+)'`))[1];
    assert.equal(
      source.includes(`takeOption(seenOptions, optionCounts, '${counted}')`),
      true,
      `${counted} is not checked for being given twice`
    );
  }
});

test('the docs exit-code table still describes exit 2', () => {
  const row = docs.split('\n').find(line => line.startsWith('| `2` |'));
  assert.ok(row, 'docs/cli.md has no row for exit code 2');
  for (const cause of ['an option given twice', 'bad option value', 'Unknown option', 'an option that cannot do its job']) {
    assert.equal(row.includes(cause), true, `the exit 2 row no longer lists: ${cause}`);
  }
});

test('docs/cli.md quotes the real error for every option that cannot do its job', () => {
  // The second silence, found while the first was being fixed: three options are
  // only meaningful next to another one, and each of them was accepted and then
  // dropped. `--out file` without `--output` printed the preview and wrote no
  // file at all. The docs have to carry the message the CLI now prints, and the
  // help has to state the rule, or a reader is told about a rule the tool does
  // not enforce — the same lock the repeated-flag message is held under.
  const cases = [
    { args: ['test/fixtures/people.csv', '--out', 'p.json'], rule: '--out needs --output' },
    { args: ['test/fixtures/people.csv', '--table', 'users', '-o', 'csv'], rule: '--table needs --output sql' },
    { args: ['test/fixtures/orders.json', '--delimiter', ';', '-o', 'json'], rule: '--delimiter needs CSV input' },
  ];
  for (const { args, rule } of cases) {
    const result = runCli(args);
    assert.equal(result.status, 2, `${args.join(' ')} should be a usage error, got exit ${result.status}`);
    assert.equal(result.stdout, '', 'a refused option must leave stdout empty');
    const message = result.stderr.trim().replace(/^Error: /, '');
    assert.equal(docs.includes(message), true, `docs/cli.md does not quote the error verbatim: ${message}`);
    assert.equal(help.includes(rule), true, `--help does not state the rule: ${rule}`);
    const preview = runCli(['test/fixtures/people.csv']).stdout;
    assert.equal(preview.includes(rule), true, `the preview does not state the rule: ${rule}`);
  }
});

test('an option that cannot do its job is refused before the input is read', () => {
  // The two relations that need no data are answered from the flags alone, so a
  // typo is a usage error even when the file is missing. The delimiter needs the
  // format the input was detected as, so there the missing file comes first.
  assert.equal(runCli(['test/fixtures/nope.csv', '--out', 'p.json']).status, 2, 'a missing file must not mask --out without --output');
  assert.equal(runCli(['test/fixtures/nope.csv', '--table', 'users', '-o', 'csv']).status, 2, 'a missing file must not mask --table without sql');
  assert.equal(runCli(['test/fixtures/nope.json', '--delimiter', ';', '-o', 'json']).status, 3, 'the delimiter needs the input format, so the missing file is still an input error');
});

for (const testCase of CASES) {
  test(`docs/cli.md shows the exact output for: ${testCase.name}`, () => {
    assert.equal(docs.includes(testCase.command), true, `command not found in docs: ${testCase.command}`);
    assert.equal(expected[testCase.name].includes(testCase.docOutput), true, `docOutput is not part of the real output for ${testCase.name}`);
    assert.equal(docs.includes(testCase.docOutput), true, `output not found in docs for ${testCase.name}`);
  });
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
