/**
 * Conformance tests: the CLI engine and the browser engine must be the same
 * product, and the documentation must describe what the tool actually does.
 *
 * The browser engine is site/engine.js, loaded the same way site/try.html
 * loads it — no bundler, no Node built-ins, just a `module.exports` shim.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('docs/cli.md quotes the real error for input that is not UTF-8', () => {
  // The tenth silence, and the only one that destroyed characters instead of
  // hiding a wrong answer: a Windows-1252 export decoded to U+FFFD, exit 0 and
  // an empty stderr, and the mangled names went into the output file. The docs
  // have to carry the message the CLI now prints, or a reader meets it with no
  // explanation — the same lock the two silences above are held under.
  const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '-f', 'csv', '-o', 'json'], {
    cwd: root,
    encoding: 'utf-8',
    input: Buffer.from([0x6e, 0x61, 0x76, 0x6e, 0x2c, 0x62, 0x79, 0x0a, 0x4d, 0xf8, 0x6c, 0x6c, 0x65, 0x72, 0x0a]),
  });
  assert.equal(result.status, 3, `a non-UTF-8 input should be an input error, got exit ${result.status}`);
  assert.equal(result.stdout, '', 'refused input must leave stdout empty');
  // The message names the input it was given, so the docs quote a file of their own.
  const message = result.stderr.trim().replace(/^Error: /, '').replace(/^stdin/, 'customers.csv');
  assert.equal(docs.includes(message), true, `docs/cli.md does not quote the error verbatim: ${message}`);
  assert.equal(help.includes('not UTF-8'), true, '--help does not list non-UTF-8 input as an input error');
  const row = docs.split('\n').find(line => line.startsWith('| `3` |'));
  assert.ok(row.includes('not UTF-8'), 'the exit 3 row in docs/cli.md does not mention it');
});

test('docs/cli.md shows the real table cell and sql identifier output', () => {
  // The same lock as the silences above, for a silence of the other kind: these
  // values *can* be written, they were just written in a way that misrepresented
  // them. A paragraph and a table of claims are worth nothing if the four
  // commands above them do not print what the page says, so the page is run.
  // The blocks are taken from the page itself, which is also what stops the
  // examples and the engine from drifting apart.
  const section = (() => {
    const from = docs.indexOf('### A cell that cannot be shown');
    const to = docs.indexOf('### XML output: the characters XML itself cannot hold');
    assert.ok(from !== -1 && to > from, 'docs/cli.md has lost the section on a cell that cannot be shown');
    return docs.slice(from, to);
  })();

  // Every `bash` block in the section, and the plain output block that follows
  // it. The page spells an escape as `\\n` inside a shell command and as `\n`
  // inside the output, so the comparison is on the printed text, not on source.
  const runs = [...section.matchAll(/```bash\n([\s\S]*?)```\n\n```(?:sql)?\n([\s\S]*?)```/g)];
  assert.equal(runs.length, 4, `the section should show four runnable examples, found ${runs.length}`);

  for (const [, command, expected] of runs) {
    const result = spawnSync('sh', ['-c', command.replace(/(^|\s)transmute /g, '$1' + JSON.stringify(process.execPath) + ' ' + JSON.stringify(join(root, 'src', 'cli.js')) + ' ')], {
      cwd: root,
      encoding: 'utf-8',
    });
    assert.equal(result.status, 0, `the documented command failed: ${command.trim()}\n${result.stderr}`);
    assert.equal(result.stdout, expected, `docs/cli.md does not show what this prints:\n$ ${command.trim()}`);
  }

  // The one claim that is a measurement rather than an example: a newline in a
  // SQL value is left alone, because a SQL literal may hold one. The example
  // above shows the value across two lines, which is the whole claim — so the
  // page would have to change if someone "fixed" it into an escape.
  assert.ok(section.includes("is left alone"), 'docs/cli.md must say the SQL newline is deliberate');
  assert.ok(section.includes("imports the file"), 'docs/cli.md must say the SQL value still imports');
});

test('docs/cli.md shows what a quoted column name prints', () => {
  // The rule is a claim about a file: a column name is quoted, never trimmed.
  // A paragraph saying so is worth nothing if the command above it prints a
  // bare name, so the command is run and the bytes compared — and the two
  // claims that cannot be seen in the output (a trimmed name is *silent*, and a
  // whitespace-only header loses the whole file) are locked by their own
  // round trip rather than by the example.
  const section = (() => {
    const from = docs.indexOf('### Delimiters, quotes and line endings');
    const to = docs.indexOf('### Text encoding');
    assert.ok(from !== -1 && to > from, 'docs/cli.md has lost the section on delimiters and quotes');
    return docs.slice(from, to);
  })();

  // Fenced blocks are paired by position, not by the text between them: the
  // rules sit in a bullet list, so the fences are indented and no two-block
  // regex survives the indentation. The indentation is the closing fence's
  // own, and it is stripped from the body — the output a command prints has
  // nothing to do with the bullet it is quoted in.
  const blocks = [...section.matchAll(/^([ \t]*)```(\w*)\n([\s\S]*?)^\1```/gm)]
    .map(m => ({ lang: m[2], body: m[3].split('\n').map(l => l.startsWith(m[1]) ? l.slice(m[1].length) : l).join('\n') }));
  const idx = blocks.findIndex(b => b.lang === 'bash' && b.body.includes('"Total "'));
  assert.ok(idx !== -1, 'the column-name rule shows no runnable example');
  assert.equal(blocks[idx + 1]?.lang, 'csv', 'the column-name example is not followed by its output');

  const result = spawnSync('sh', ['-c', blocks[idx].body.trim().replace(/(^|\s)transmute /g, '$1' + JSON.stringify(process.execPath) + ' ' + JSON.stringify(join(root, 'src', 'cli.js')) + ' ')], {
    cwd: root,
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0, `the documented command failed: ${blocks[idx].body.trim()}\n${result.stderr}`);
  assert.equal(result.stdout, blocks[idx + 1].body, `docs/cli.md does not show what this prints:\n$ ${blocks[idx].body.trim()}`);

  // The silent half, locked through the real binary: the two names stay two
  // columns, and a header that is nothing but spaces is a header.
  const written = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '-', '-f', 'json', '-o', 'csv'], { input: '[{"Total ":1,"Total":2}]', encoding: 'utf-8' });
  assert.deepEqual(run(written.stdout, 'csv', [], 'json').data, [{ 'Total ': 1, Total: 2 }]);
  const blank = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '-', '-f', 'json', '-o', 'csv'], { input: '[{"  ":1}]', encoding: 'utf-8' });
  assert.deepEqual(run(blank.stdout, 'csv', [], 'json').data, [{ '  ': 1 }], 'a header of only spaces is a header, not a blank line');
});

test('docs/cli.md quotes the real error for a value XML 1.0 cannot write', () => {
  // The eleventh silence, and the same shape as the tenth: a control character
  // in a value was written into the file raw, so the file declared XML 1.0 and
  // no parser would take it, while this tool's own reader read it back and hid
  // it. Exit 0, empty stderr. The docs have to carry the message the CLI now
  // prints, and the message has to survive a change to the error text — the
  // same three-surface lock the two silences above are held under.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-conf-'));
  try {
    const path = join(dir, 'nul.json');
    writeFileSync(path, JSON.stringify([{ id: 1, note: 'a' + String.fromCharCode(0) + 'b' }]), 'utf-8');
    const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', 'xml'], { encoding: 'utf-8' });
    assert.equal(result.status, 1, `a character XML cannot hold should be a transformation failure, got exit ${result.status}`);
    assert.equal(result.stdout, '', 'a refused conversion must leave stdout empty');
    const message = result.stderr.trim().replace(/^Error: /, '');
    assert.equal(docs.includes(message), true, `docs/cli.md does not quote the error verbatim: ${message}`);
    assert.equal(help.includes('holding something that format cannot'), true, '--help does not mention the refusal');
    const row = docs.split('\n').find(line => line.startsWith('| `1` |'));
    assert.ok(row.includes('XML 1.0'), 'the exit 1 row in docs/cli.md does not mention it');
    // The escape route the message names has to exist, or the advice is a lie.
    const ok = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(ok.status, 0, `json should carry the character: ${ok.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docs/cli.md quotes the real error for every format that cannot write a NUL', () => {
  // The XML refusal above was, for a long time, the only one — and the reason it
  // was believed to be enough was a measurement that asked the wrong question.
  // T32 recorded that "CSV, SQL, JSON and YAML all hold a NUL faithfully", which
  // is true of the byte and false of the file: Python's csv raises `line contains
  // NUL`, SQLite reports `unrecognized token`, PyYAML answers `unacceptable
  // character #x0000` and `file(1)` calls all three `data`. So the refusal now
  // belongs to the target format, four more writers have it, and the docs have to
  // carry all five messages verbatim — the same three-surface lock, widened.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-conf-'));
  try {
    const path = join(dir, 'nul.json');
    writeFileSync(path, JSON.stringify([{ id: 1, note: 'a' + String.fromCharCode(0) + 'b' }]), 'utf-8');
    for (const format of ['xml', 'yaml', 'csv', 'sql', 'table']) {
      const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', format], { encoding: 'utf-8' });
      assert.equal(result.status, 1, `${format}: exit ${result.status}: ${result.stderr}`);
      const message = result.stderr.trim().replace(/^Error: /, '');
      assert.equal(docs.includes(message), true, `docs/cli.md does not quote the ${format} error verbatim: ${message}`);
      // Naming JSON as the way out is only honest if JSON really is the way out.
      if (format !== 'xml') {
        assert.ok(message.includes('Write JSON instead'), `${format}: ${message}`);
        const ok = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', 'json'], { encoding: 'utf-8' });
        assert.equal(ok.status, 0, `json should carry the character: ${ok.stderr}`);
      }
    }
    // The docs must not repeat the claim this iteration measured to be false.
    assert.ok(!docs.includes('carry a `U+0000` faithfully'), 'docs/cli.md still claims CSV, SQL and YAML carry a NUL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docs/cli.md quotes the real error for a number no format can carry', () => {
  // The third kind of impossible, and the only one that is not about a single
  // format. `1e400` is a legal JSON literal, so the input is a file any JSON tool
  // accepts — and all six writers answered differently at exit 0 with empty
  // stderr: `json` wrote `null` in place of the number, and the five text
  // formats wrote the bare word, which PyYAML, SQLite and every XML parser hand
  // back as a string. So the number changed type in five formats and stopped
  // existing in the sixth.
  //
  // The lock has a harder job here than for the characters above: those messages
  // all end in "Write JSON instead", and that advice is *false* for this value —
  // JSON is the writer that destroys it. So the test also requires that no
  // message names a way out, and that a real run on the same input produces
  // exit 1 with no file, which is the only proof the advice was not invented.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-conf-'));
  try {
    const path = join(dir, 'inf.json');
    writeFileSync(path, '[{"id":1,"a":1e400,"ok":1e308}]', 'utf-8');
    for (const format of ['json', 'xml', 'yaml', 'csv', 'sql', 'table']) {
      const out = join(dir, `out.${format}`);
      const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', format, '--out', out], { encoding: 'utf-8' });
      assert.equal(result.status, 1, `${format}: exit ${result.status}: ${result.stderr}`);
      assert.equal(result.stdout, '', `${format}: a refused run must leave stdout empty`);
      assert.equal(existsSync(out), false, `${format}: a refused run must not write a file`);
      const message = result.stderr.trim().replace(/^Error: /, '');
      assert.equal(docs.includes(message), true, `docs/cli.md does not quote the ${format} error verbatim: ${message}`);
      assert.ok(message.includes('Infinity') && message.includes('field "a"'), `${format}: the message must name value and field: ${message}`);
      // The advice that the character refusals end on is a lie for this value.
      assert.ok(!message.includes('Write JSON instead'), `${format}: no format carries a non-finite number: ${message}`);
      assert.ok(message.includes('not finite'), `${format}: the message must say why: ${message}`);
    }
    // The boundary is finiteness, so the largest finite double must still be
    // written — a rule written against "big" rather than "not finite" fails here.
    const finite = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', 'json'], { encoding: 'utf-8' });
    assert.notEqual(finite.status, 0, 'this run must refuse the file, because field "a" is not finite');
    const okPath = join(dir, 'finite.json');
    writeFileSync(okPath, '[{"v":1.7976931348623157e308}]', 'utf-8');
    const ok = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), okPath, '-o', 'json'], { encoding: 'utf-8' });
    assert.equal(ok.status, 0, `the largest finite double must be writable: ${ok.stderr}`);
    assert.equal(help.includes('a number that is not finite'), true, '--help does not mention the non-finite refusal');
    // The exit 1 row is the third surface: the docs, the error and --help.
    const row = docs.split('\n').find(line => line.startsWith('| `1` |'));
    assert.ok(row && row.includes('not finite'), 'the exit 1 row in docs/cli.md does not mention a value that is not finite');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the frame and the CLI agree that a value no format can carry is refused', () => {
  // The frame is the second customer of the engine, and the one that decides
  // whether the download button is armed. If the browser's own engine ever
  // answers "null" here while the CLI refuses, the playground hands the user a
  // file with a number replaced by a null — which is the whole finding. So the
  // two answers are compared, not assumed: the site's engine is loaded the way
  // `try.html` loads it, and the refusals have to be the same sentence.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-conf-'));
  try {
    const path = join(dir, 'inf.json');
    writeFileSync(path, '[{"id":1,"a":1e400}]', 'utf-8');
    const input = readFileSync(path, 'utf-8');
    for (const format of ['json', 'yaml', 'csv']) {
      const viaSite = browser.run(input, 'json', [], format);
      assert.ok(viaSite.error, `the site's engine must refuse ${format}, not write it: ${viaSite.text}`);
      assert.ok(viaSite.text === undefined || viaSite.text === '', `${format}: the frame must write nothing`);
      const viaCli = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', format], { encoding: 'utf-8' });
      assert.equal(viaCli.stderr.trim().replace(/^Error: /, ''), viaSite.error,
        `frame and CLI must print the same refusal for ${format}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docs/cli.md quotes the real error for every format that cannot write a lone surrogate', () => {
  // The same three-surface lock as the NUL above, widened to the second kind of
  // impossible. The NUL is a real character these formats cannot carry; a lone
  // surrogate is not a character any file can hold, and every writer here used to
  // put U+FFFD in its place at exit 0. So the docs have to carry five more
  // messages verbatim, and "Write JSON instead" has to stay true — which is why
  // each refusal is checked against a real JSON run, not against the sentence.
  const dir = mkdtempSync(join(tmpdir(), 'transmute-conf-'));
  try {
    const path = join(dir, 'half.json');
    // Plain ASCII on disk: JSON's `\udXXX` escape is what produces a lone
    // surrogate, so this is a file any JSON tool would accept.
    writeFileSync(path, '[{"id":1,"note":"a\\ud800b"}]', 'utf-8');
    for (const format of ['xml', 'yaml', 'csv', 'sql', 'table']) {
      const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', format], { encoding: 'utf-8' });
      assert.equal(result.status, 1, `${format}: exit ${result.status}: ${result.stderr}`);
      const message = result.stderr.trim().replace(/^Error: /, '');
      assert.equal(docs.includes(message), true, `docs/cli.md does not quote the ${format} error verbatim: ${message}`);
      // The refusal must name the character, or the message is unactionable.
      assert.ok(message.includes('U+D800'), `${format}: ${message}`);
      if (format !== 'xml') {
        assert.ok(message.includes('Write JSON instead'), `${format}: ${message}`);
        const ok = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), path, '-o', 'json'], { encoding: 'utf-8' });
        assert.equal(ok.status, 0, `json should carry the character: ${ok.stderr}`);
        assert.ok(ok.stdout.includes('a\\ud800b'), `json must keep the value: ${ok.stdout}`);
      }
    }
    // And the docs must not claim the character survives where it does not.
    assert.ok(docs.includes('a lone surrogate has no UTF-8 encoding'), 'docs/cli.md does not explain the lone surrogate');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('── the browser frame must forward what stderr prints ──');

/** Run site/try.html's own frame script, driven the way the parent page drives it. */
function ask(message) {
  const page = readFileSync(join(root, 'site', 'try.html'), 'utf-8');
  const script = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
  let handler = null, ready = null, answer = null;
  const frame = { postMessage(msg) { if (msg.type === 'ready') ready = msg; } };
  const sandbox = {
    module: { exports: {} },
    console,
    parent: frame,
    addEventListener(type, fn) { if (type === 'message') handler = fn; },
  };
  sandbox.exports = sandbox.module.exports;
  sandbox.module.exports = { ...engine };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'try.html' });
  assert.ok(ready, 'the frame never announced itself ready to the parent page');
  assert.ok(handler, 'the frame script registered no message handler');
  // e.source is the parent window as far as the frame is concerned; the frame
  // answers with reply(src, msg), so the answer lands on the object we hand in.
  const parent = { postMessage(msg) { if (msg.type === 'result') answer = msg; } };
  handler({ source: parent, data: message });
  assert.ok(answer, `the frame did not answer a ${message.type} message`);
  return answer;
}

test('the frame forwards the warnings the CLI prints on stderr', () => {
  // The twelfth silence, and the only one with no file behind it: the engine has
  // returned warnings since T13 and the CLI has printed them on stderr, but
  // site/try.html forwarded text, error and rows and dropped them. So the
  // playground — the most used surface in the product, and the one people try a
  // pipeline in — showed an empty table for a `pick` with a typo in a field
  // name, and one row out of three for `unique --by` on a field no row has, with
  // nothing at all on screen. The frame is the wire, so the test is the wire.
  const cases = [
    { name: 'a pick on a field no record has', input: '[{"name":"Ada","age":37}]', input_format: 'json', pipeline: '[{"op":"pick","fields":["nmae"]}]' },
    { name: 'a key that says two things at once', input: '{"name":"Ada","name":"Bob"}', input_format: 'json', pipeline: '[]' },
    { name: 'a unique --by on a field no record has', input: '[{"a":1},{"a":2},{"a":3}]', input_format: 'json', pipeline: '[{"op":"unique","by":"ag"}]' },
    { name: 'a CSV row with more fields than the header', input: 'a,b\n1,2,3,4', input_format: 'csv', pipeline: '[]' },
    { name: 'a YAML file with two documents', input: 'a: 1\n---\na: 2', input_format: 'yaml', pipeline: '[]' },
  ];
  for (const { name, input, input_format, pipeline } of cases) {
    const answer = ask({ type: 'run', id: 1, input, input_format, pipeline, output_format: 'table' });
    assert.equal(answer.error, undefined, `${name}: the frame should not have failed — ${answer.error}`);
    assert.ok(Array.isArray(answer.warnings), `${name}: the frame forwarded no warnings array, so the browser cannot show any`);
    assert.ok(answer.warnings.length > 0, `${name}: the engine warned and the frame forwarded nothing`);
    // The browser must be told what the terminal tells the user: the same words,
    // from the same pipeline, on the same input.
    const cli = runCli(['-f', input_format, '--pipe', pipeline, '-o', 'table'], input);
    const printed = cli.stderr.trim().split('\n').filter(Boolean);
    assert.equal(cli.status, 0, `${name}: the CLI should succeed, got exit ${cli.status} — ${cli.stderr}`);
    assert.equal(
      answer.warnings.map(w => `Warning: ${w}`).join('\n'),
      printed.join('\n'),
      `${name}: the frame and the CLI disagree about what to warn about`
    );
    // And the output the frame forwards is the output the CLI writes: the warning
    // is an addition, never a substitute. (The CLI terminates its last line; the
    // frame forwards the engine's text as it is.)
    assert.equal(answer.text, cli.stdout.replace(/\n$/, ''), `${name}: the frame and the CLI disagree about the output`);
  }
});

test('a run that succeeds says so, and one that fails carries its warnings too', () => {
  // A warning is not an error: the output is still written and still correct, so
  // the frame must not turn one into the other. And the engine collects warnings
  // before a step throws, so a run that ends in an error can still have said
  // something worth hearing on the way there.
  const clean = ask({ type: 'run', id: 1, input: '[{"a":1},{"a":2}]', input_format: 'json', pipeline: '[{"op":"pick","fields":["a"]}]', output_format: 'table' });
  assert.equal(clean.error, undefined, 'a clean run reported an error');
  assert.deepEqual(clean.warnings, [], 'a clean run invented warnings');
  assert.equal(clean.rows, 2, 'the row count is not what the parent page shows as "N rows"');
  assert.match(clean.text, /a/, 'the frame forwarded no output text for a clean run');
  // A bad expression is the user's own input, so the frame answers with an error
  // and nothing else — but the warnings gathered before the failure travel with it.
  const broken = ask({ type: 'run', id: 1, input: '{"a":1,"a":2}', input_format: 'json', pipeline: '[{"op":"filter","expr":"item.age >"}]', output_format: 'table' });
  assert.ok(broken.error, 'an expression that is not JavaScript should reach the parent as an error');
  assert.ok(Array.isArray(broken.warnings), 'a failed run must still answer with a warnings array, or the parent page has to special-case it');
  assert.equal(broken.warnings.length, 1, 'the warning the reader made before the expression failed was dropped');
});

test('the parent page renders the warnings next to the output, in both languages', () => {
  // The wire is only half the surface. Without JS the playground shows its static
  // example, so the element has to exist in the markup, be hidden while there is
  // nothing to say, and be written from `e.data.warnings` — and the label has to
  // exist in both languages the site is served in, or a Danish reader gets an
  // English word for the one thing he must not miss.
  const site = readFileSync(join(root, 'site', 'site.js'), 'utf-8');
  assert.match(site, /data\.warnings/, 'site.js never reads the warnings the frame now forwards');
  const labels = [...site.matchAll(/warningsLabel:\s*'([^']+)'/g)].map(m => m[1]);
  assert.equal(labels.length, 2, `the warnings label must exist in both languages, found ${labels.length}`);
  assert.notEqual(labels[0], labels[1], 'the warnings label is the same word in both languages');
  assert.match(site, /\[data-role=warnings\]/, 'site.js does not write the warnings into their own element');
  // Copy and download read the output element. A warning folded into it would be
  // copied and downloaded as data — the one thing the CLI's stderr/stdout split
  // exists to prevent. Checked inside the function that paints the warnings, not
  // on a keyword: routing them through a variable is the same mistake.
  const paint = site.slice(site.indexOf('function warnings('), site.indexOf('window.addEventListener', site.indexOf('function warnings(')));
  assert.ok(paint.length > 0, 'site.js no longer has the function that paints the warnings');
  assert.equal(paint.includes('outEl'), false, 'the warnings are written into the output element, so they would be copied and downloaded as data');
  assert.equal(
    /outEl\.(textContent|innerHTML)\s*=[^;]*warning/i.test(site),
    false,
    'the warnings are written into the output element, so they would be copied and downloaded as data'
  );
  // And the block is rebuilt every time, so a warning cannot outlive the run that
  // caused it: the next clean run has to leave nothing behind.
  assert.match(paint, /warnEl\.textContent\s*=\s*''/, 'the warnings block is never emptied, so a stale warning survives a clean run');
  assert.match(paint, /warnEl\.hidden\s*=\s*true/, 'the warnings block is never hidden again when there is nothing to warn about');
  // Both playground pages carry the element, and it starts hidden: without
  // JavaScript the page shows its static example, and a warning box that is
  // empty but visible is a lie about there being something to say.
  for (const page of ['index.html', 'da/index.html']) {
    const html = readFileSync(join(root, 'site', page), 'utf-8');
    assert.match(html, /data-role="warnings"[^>]*hidden/, `${page}: the warnings element is missing or not hidden by default`);
  }
});

for (const testCase of CASES) {
  test(`docs/cli.md shows the exact output for: ${testCase.name}`, () => {
    assert.equal(docs.includes(testCase.command), true, `command not found in docs: ${testCase.command}`);
    assert.equal(expected[testCase.name].includes(testCase.docOutput), true, `docOutput is not part of the real output for ${testCase.name}`);
    assert.equal(docs.includes(testCase.docOutput), true, `output not found in docs for ${testCase.name}`);
  });
}

test('docs/cli.md quotes the real warning for a CSV column that loses its type', () => {
  // The warning is the whole answer to a loss RFC 4180 cannot prevent: quoting
  // does not stop the reader typing a cell, so the only thing left is to say
  // which columns. A message the docs paraphrase is a message nobody can match
  // against a real run, so the docs quote this one verbatim — and the counts in
  // it come from the run below, not from the prose.
  const result = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '-f', 'json', '-o', 'csv'], {
    cwd: root,
    encoding: 'utf-8',
    input: '[{"id":"1","navn":"Ada","ok":"true"},{"id":"2","navn":"Bob","ok":"false"}]',
  });
  assert.equal(result.status, 0, `a type warning must not fail the run, got exit ${result.status}`);
  const message = result.stderr.trim().replace(/^Warning: /, '');
  assert.ok(message.includes('"id" (2)'), message);
  assert.ok(!message.includes('"navn"'), `a column of plain text must not be named: ${message}`);
  assert.equal(docs.includes(message), true, `docs/cli.md does not quote the warning verbatim: ${message}`);
  // The escape route the message names has to exist, or the advice is a lie.
  for (const out of ['json', 'yaml', 'xml']) {
    const kept = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), '-f', 'json', '-o', out], {
      cwd: root, encoding: 'utf-8', input: '[{"id":"1"}]',
    });
    assert.equal(kept.status, 0, `${out} should carry the string: ${kept.stderr}`);
    assert.equal(kept.stderr, '', `${out} must not warn about a column it keeps: ${kept.stderr}`);
    assert.equal(kept.stdout.includes('1'), true, `${out} lost the value: ${kept.stdout}`);
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
