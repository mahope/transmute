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

for (const testCase of CASES) {
  test(`docs/cli.md shows the exact output for: ${testCase.name}`, () => {
    assert.equal(docs.includes(testCase.command), true, `command not found in docs: ${testCase.command}`);
    assert.equal(expected[testCase.name].includes(testCase.docOutput), true, `docOutput is not part of the real output for ${testCase.name}`);
    assert.equal(docs.includes(testCase.docOutput), true, `output not found in docs for ${testCase.name}`);
  });
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
