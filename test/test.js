/**
 * Transmute Engine — test suite
 */

const assert = require('assert');
const { readFileSync } = require('fs');
const { join } = require('path');
const { run, serializers, detectFormat } = require('../src/engine');

const here = join(__dirname, 'fixtures');

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

console.log('\n📋 Transmute Engine Tests\n');
// ─── ADD & JOIN ──────────────────────────────────────────────────────────

test('add computed field', () => {
  const r = run('[{"price":10,"qty":2}]', 'json', [{op:'add',fields:{total:'item.price * item.qty'}}]);
  assert.strictEqual(r.data[0].total, 20);
});

test('add leaves existing fields untouched', () => {
  const r = run('[{"name":"A","price":5,"qty":1}]', 'json', [{op:'add',fields:{total:'item.price * item.qty'}}]);
  assert.strictEqual(r.data[0].name, 'A');
});

test('add with bad expression yields null, not crash', () => {
  const r = run('[{"a":1}]', 'json', [{op:'add',fields:{x:'item.nope.deep'}}]);
  assert.strictEqual(r.data.length, 1);
});

test('join merges matching rows on key', () => {
  const r = run('[{"id":"a"},{"id":"b"}]', 'json',
    [{op:'join',on:'id',with:[{id:'a',city:'X'}]}]);
  assert.strictEqual(r.data[0].city, 'X');
  assert.strictEqual(r.data.length, 1); // non-matching dropped by default
});

test('join keep:left keeps unmatched rows', () => {
  const r = run('[{"id":"a"},{"id":"z"}]', 'json',
    [{op:'join',on:'id',keep:'left',with:[{id:'a',city:'X'}]}]);
  assert.strictEqual(r.data.length, 2);
});


// ─── PARSING ─────────────────────────────────────────────────────────────

test('parse JSON array', () => {
  const r = run('[{"a":1,"b":2},{"a":3,"b":4}]', 'json');
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.data.length, 2);
});

test('parse JSON object (single → array)', () => {
  const r = run('{"a":1,"b":2}', 'json');
  assert.strictEqual(r.data.length, 1);
});

test('parse CSV', () => {
  const r = run('name,age\nAlice,30\nBob,25', 'csv');
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0].name, 'Alice');
  assert.strictEqual(r.data[1].age, 25);
});

test('CSV type coercion', () => {
  const r = run('name,age,zip,active\nAlice,30,0074,true', 'csv');
  assert.strictEqual(r.data[0].age, 30);      // numbers coerced
  assert.strictEqual(r.data[0].zip, '0074');  // leading zeros preserved
  assert.strictEqual(r.data[0].active, true); // booleans coerced
});

test('parse CSV with quoted fields', () => {
  const r = run('name,email\n"Smith, John","john@test.com"', 'csv');
  assert.strictEqual(r.data[0].name, 'Smith, John');
});

test('CSV row with more fields than the header keeps the extra values', () => {
  const r = run('id,name\n1,Alice\n2,Bob,extra,more', 'csv');
  assert.strictEqual(r.data[1].column3, 'extra');
  assert.strictEqual(r.data[1].column4, 'more');
});

test('extra CSV columns are named after their position, not a counter', () => {
  // The value is in the 3rd field of the row, so the column says column3 even
  // though it is the 1st column beyond the header. That is where the user looks.
  const r = run('id\n1,a,b', 'csv');
  assert.strictEqual(r.data[0].column2, 'a');
  assert.strictEqual(r.data[0].column3, 'b');
});

test('extra CSV columns never overwrite a real column of the same name', () => {
  const r = run('id,column3\n1,a\n2,b,overflow', 'csv');
  assert.strictEqual(r.data[1].column3, 'b');       // the real column is intact
  assert.strictEqual(r.data[1].column3_2, 'overflow');
});

test('extra CSV fields are coerced like every other field', () => {
  const r = run('id\n1,42,true', 'csv');
  assert.strictEqual(r.data[0].column2, 42);
  assert.strictEqual(r.data[0].column3, true);
});

test('extra CSV fields produce one warning, not one per row', () => {
  const r = run('id,name\n1,Alice\n2,Bob,c\n3,Carla,d', 'csv', [], 'json');
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('2 of 3 CSV rows have more fields'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('rows 3, 4'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('kept in column3'), r.warnings[0]);
  // One column per field position, no matter how many rows are too long.
  assert.deepStrictEqual(Object.keys(r.data[1]), ['id', 'name', 'column3']);
  assert.deepStrictEqual(Object.keys(r.data[2]), ['id', 'name', 'column3']);
});

test('a well-formed CSV produces no warnings', () => {
  const r = run('id,name\n1,Alice\n2,Bob', 'csv', [], 'json');
  assert.deepStrictEqual(r.warnings, []);
});

test('rows with fewer fields than the header are still padded with empty strings', () => {
  const r = run('a,b,c\n1,2,3\n4', 'csv');
  assert.deepStrictEqual(r.data[1], { a: 4, b: '', c: '' });
});

test('csv output keeps keys that only later records carry', () => {
  const r = run('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"b@x.dk"}]', 'json', [], 'csv');
  assert.strictEqual(r.text, 'id,name,email\n1,Alice,\n2,Bob,b@x.dk');
});

test('table output keeps keys that only later records carry', () => {
  const r = run('[{"id":1},{"id":2,"email":"b@x.dk"}]', 'json', [], 'table');
  assert.ok(r.text.includes('email'), r.text);
  assert.ok(r.text.includes('(2 rows, 2 columns)'), r.text);
  assert.ok(r.text.includes('| b@x.dk |'), r.text);
});

test('csv and table column order is the first-seen order of every key', () => {
  const records = [{ b: 1 }, { a: 2, c: 3 }];
  assert.strictEqual(serializers.csv(records), 'b,a,c\n1,,\n,2,3');
  assert.strictEqual(serializers.sql(records).includes('"b", "a", "c"'), true);
});

test('csv output for records with identical keys is unchanged', () => {
  assert.strictEqual(
    serializers.csv([{ a: 1, b: 2 }, { a: 3, b: 4 }]),
    'a,b\n1,2\n3,4'
  );
});

test('csv output quotes every delimiter the reader can detect, not just the comma', () => {
  // Free text is the field most likely to hold a semicolon, and Danish Excel
  // reads `;` by default. Writing it bare loses the column on the next hop.
  assert.strictEqual(serializers.csv([{ a: 'x;y', b: 1 }]), 'a,b\n"x;y",1');
  assert.strictEqual(serializers.csv([{ a: 'x|y', b: 1 }]), 'a,b\n"x|y",1');
  assert.strictEqual(serializers.csv([{ a: 'x\ty', b: 1 }]), 'a,b\n"x\ty",1');
  // A bare CR ends a record for the reader, so it must be inside the quotes.
  assert.strictEqual(serializers.csv([{ a: 'x\ry', b: 1 }]), 'a,b\n"x\ry",1');
});

test('a CSV round trip returns the values it started with', () => {
  const source = 'code,note\na-1,"semi; colon"\na-2,"pipe| bar"\na-3,"say ""hi"" now"';
  const written = run(source, 'csv', [], 'csv').text;
  const reread = run(written, 'csv', [], 'json');
  assert.deepStrictEqual(reread.data, run(source, 'csv', [], 'json').data);
  // A CR in a value survives the same way.
  const crlf = run('a,b\n"x\ry",z', 'csv', [], 'csv');
  assert.deepStrictEqual(run(crlf.text, 'csv').data, run('a,b\n"x\ry",z', 'csv').data);
});

test('XML entities are decoded on the way in', () => {
  const r = run('<users><user><n>Tom &amp; Jerry</n><t>a &lt;b&gt; &quot;q&quot; &apos;s&apos;</t></user></users>', 'xml');
  assert.strictEqual(r.data[0].n, 'Tom & Jerry');
  assert.strictEqual(r.data[0].t, 'a <b> "q" \'s\'');
});

test('numeric XML character references are decoded, decimal and hex', () => {
  const r = run('<users><user><a>&#65;</a><b>&#x42;</b><c>&#8364;</c></user></users>', 'xml');
  assert.strictEqual(r.data[0].a, 'A');
  assert.strictEqual(r.data[0].b, 'B');
  assert.strictEqual(r.data[0].c, '€');
});

test('an unknown XML entity is passed through, not guessed', () => {
  const r = run('<users><user><n>a &nbsp; b &bogus; c</n></user></users>', 'xml');
  assert.strictEqual(r.data[0].n, 'a &nbsp; b &bogus; c');
});

test('xml → xml is a round trip, not an escaping ratchet', () => {
  const once = run('<u><n>Tom &amp; Jerry</n></u>', 'xml', [], 'xml').text;
  const twice = run(once, 'xml', [], 'xml').text;
  assert.strictEqual(twice, once);
  assert.ok(!once.includes('&amp;amp;'), once);
});

test('parse YAML list', () => {
  const r = run('- name: Alice\n  age: 30\n- name: Bob\n  age: 25', 'yaml');
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0].name, 'Alice');
});

test('parse YAML scalars', () => {
  const r = run('- apple\n- banana\n- cherry', 'yaml');
  assert.strictEqual(r.data.length, 3);
});

/**
 * The reader used to walk one line at a time, so an indented block was not
 * parsed — it was dropped, and the run still exited 0. These tests are the
 * difference between "the file was read" and "the file was mostly read".
 */
test('parse nested YAML mappings and sequences', () => {
  const r = run([
    'server:',
    '  host: db.local',
    '  port: 5432',
    '  tls:',
    '    - name: a',
    '      port: 1',
    '    - name: b',
    'list:',
    '  - x',
    '  - y'
  ].join('\n'), 'yaml');
  assert.deepStrictEqual(r.data, [{
    server: { host: 'db.local', port: 5432, tls: [{ name: 'a', port: 1 }, { name: 'b' }] },
    list: ['x', 'y']
  }]);
});

test('a sequence may sit at the same indentation as its key', () => {
  const r = run('tags:\n- x\n- y\nother: 1', 'yaml');
  assert.deepStrictEqual(r.data, [{ tags: ['x', 'y'], other: 1 }]);
});

test('flat top-level YAML keys are one record, unchanged', () => {
  assert.deepStrictEqual(run('a: 1\nb: hello', 'yaml').data, [{ a: 1, b: 'hello' }]);
});

test('YAML comments and document separators are not data', () => {
  const r = run('# top\na: 1 # trailing\n---\nb: 2', 'yaml');
  assert.deepStrictEqual(r.data, [{ a: 1 }]);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(/only the first was read/.test(r.warnings[0]), r.warnings[0]);
});

test('block scalars keep their line breaks, and a # inside one is data', () => {
  const r = run('script: |\n  #!/bin/sh\n  echo one # not a comment\nafter: 1', 'yaml');
  assert.strictEqual(r.data[0].script, '#!/bin/sh\necho one # not a comment\n');
  assert.strictEqual(r.data[0].after, 1);
});

test('folded scalars join lines the way prose does', () => {
  const r = run('text: >\n  one\n  two\n\n  three', 'yaml');
  assert.strictEqual(r.data[0].text, 'one two\nthree\n');
});

test('quoted YAML strings keep the characters that mean something', () => {
  const r = run('a: "x: y # z; w"\nb: \'it\'\'s fine\'', 'yaml');
  assert.strictEqual(r.data[0].a, 'x: y # z; w');
  assert.strictEqual(r.data[0].b, "it's fine");
});

test('flow collections are read, not stringified', () => {
  const r = run('hosts: {a: 1, b: [2, three]}\nlist: [1, 2]', 'yaml');
  assert.deepStrictEqual(r.data[0].hosts, { a: 1, b: [2, 'three'] });
  assert.deepStrictEqual(r.data[0].list, [1, 2]);
});

test('a malformed YAML block fails loudly and names the line', () => {
  const r = run('a: 1\n   b: 2', 'yaml');
  assert.ok(/YAML line 2/.test(r.error), r.error);
});

test('yaml → yaml keeps a nested structure and is idempotent', () => {
  const once = run(readFileSync(join(here, 'nested.yaml'), 'utf8'), 'yaml', [], 'yaml').text;
  const twice = run(once, 'yaml', [], 'yaml').text;
  assert.strictEqual(twice, once);
  const back = run(once, 'yaml').data;
  assert.strictEqual(back[0].service.routes[0].limits.rpm, 600);
  assert.strictEqual(back[0].service.changelog, '2026-09-01 first release\n2026-09-20 added refunds\n');
  assert.deepStrictEqual(back[0].tags, ['fast', 'audited']);
});

test('a string that reads like a number is written quoted', () => {
  const once = run('[{"zip":"0074","on":"true","empty":""}]', 'json', [], 'yaml').text;
  assert.ok(once.includes("zip: '0074'") || once.includes('zip: "0074"'), once);
  assert.deepStrictEqual(run(once, 'yaml').data, [{ zip: '0074', on: 'true', empty: '' }]);
});

test('nested YAML is detected from content, not just from the extension', () => {
  assert.strictEqual(detectFormat(null, 'server:\n  host: db.local\n'), 'yaml');
  assert.strictEqual(detectFormat(null, '# comment first\na: 1\n'), 'yaml');
  assert.strictEqual(detectFormat(null, 'name,age\nAlice,30\n'), 'csv');
  assert.strictEqual(detectFormat(null, '{"a":1}'), 'json');
});

test('a delimiter the CSV reader understands is a CSV file, however it is written', () => {
  // The detector had its own weaker copy of the delimiter rule — only `,` —
  // so a Danish Excel export, a TSV and a pipe table were all read as JSON and
  // refused, even though the reader behind the detector handles all four.
  assert.strictEqual(detectFormat(null, 'navn;by;pris\nMette;KBH;199,50\n'), 'csv');
  assert.strictEqual(detectFormat(null, 'name\temail\na@b.dk\t123\n'), 'csv');
  assert.strictEqual(detectFormat(null, 'name|email\na@b.dk|123\n'), 'csv');
  // A comma inside a quoted header field is not the delimiter, so this is a
  // semicolon file. Detection and reading must agree on that.
  assert.strictEqual(detectFormat(null, '"a,b";c\n1;2\n'), 'csv');
  assert.deepStrictEqual(run('"a,b";c\n1;2\n', 'csv').data, [{ 'a,b': 1, c: 2 }]);
});

test('a one-column file with no delimiter at all is a CSV file', () => {
  // One column is a legitimate export, and the delimiter cannot name it. The
  // file is still CSV because a line per record is what CSV means here.
  assert.strictEqual(detectFormat(null, 'email\na@b.dk\nc@d.dk\n'), 'csv');
  assert.deepStrictEqual(run('email\na@b.dk\nc@d.dk\n', 'csv').data, [
    { email: 'a@b.dk' },
    { email: 'c@d.dk' }
  ]);
});

test('a single line without a delimiter is not turned into a CSV header', () => {
  // The one-column rule needs a second line to be evidence. A bare scalar is
  // still JSON, and one word is still an error rather than a one-row table
  // whose header is the word.
  assert.strictEqual(detectFormat(null, '42'), 'json');
  assert.strictEqual(detectFormat(null, 'hello'), 'json');
  assert.strictEqual(detectFormat(null, 'true'), 'json');
});

test('the one-column rule cannot steal a JSON, YAML or XML file', () => {
  assert.strictEqual(detectFormat(null, '[1,\n2]'), 'json');
  assert.strictEqual(detectFormat(null, '{\n"a": 1\n}'), 'json');
  assert.strictEqual(detectFormat(null, '- one\n- two\n'), 'yaml');
  assert.strictEqual(detectFormat(null, 'a: 1\nb: 2\n'), 'yaml');
  assert.strictEqual(detectFormat(null, '<data>\n<item>1</item>\n</data>'), 'xml');
  // A column header that merely contains a colon is not `key: value`.
  assert.strictEqual(detectFormat(null, 'created:at\n2026-01-01\n2026-02-01\n'), 'csv');
});

// ─── TRANSFORMATIONS ─────────────────────────────────────────────────────

test('filter', () => {
  const r = run('[{"x":1},{"x":5},{"x":3}]', 'json', [{ op: 'filter', expr: 'item.x > 2' }]);
  assert.strictEqual(r.data.length, 2);
});

test('map', () => {
  const r = run('[{"x":1},{"x":2}]', 'json', [{ op: 'map', expr: '({...item, y: item.x * 2})' }]);
  assert.strictEqual(r.data[0].y, 2);
  assert.strictEqual(r.data[1].y, 4);
});

test('pick fields', () => {
  const r = run('[{"a":1,"b":2,"c":3}]', 'json', [{ op: 'pick', fields: ['a', 'c'] }]);
  assert.strictEqual(Object.keys(r.data[0]).length, 2);
  assert.strictEqual(r.data[0].a, 1);
  assert.strictEqual(r.data[0].c, 3);
});

test('omit fields', () => {
  const r = run('[{"a":1,"b":2,"c":3}]', 'json', [{ op: 'omit', fields: ['b'] }]);
  assert.strictEqual(Object.keys(r.data[0]).length, 2);
  assert.strictEqual(r.data[0].a, 1);
  assert.strictEqual(r.data[0].c, 3);
});

test('sort ascending', () => {
  const r = run('[{"x":3},{"x":1},{"x":2}]', 'json', [{ op: 'sort', by: 'x', dir: 'asc' }]);
  assert.strictEqual(r.data[0].x, 1);
  assert.strictEqual(r.data[2].x, 3);
});

test('sort descending', () => {
  const r = run('[{"x":1},{"x":3},{"x":2}]', 'json', [{ op: 'sort', by: 'x', dir: 'desc' }]);
  assert.strictEqual(r.data[0].x, 3);
  assert.strictEqual(r.data[2].x, 1);
});

test('unique by field', () => {
  const r = run('[{"id":1},{"id":2},{"id":1}]', 'json', [{ op: 'unique', by: 'id' }]);
  assert.strictEqual(r.data.length, 2);
});

test('head', () => {
  const r = run('[{"x":1},{"x":2},{"x":3},{"x":4},{"x":5}]', 'json', [{ op: 'head', n: 3 }]);
  assert.strictEqual(r.data.length, 3);
  assert.strictEqual(r.data[0].x, 1);
});

test('tail', () => {
  const r = run('[{"x":1},{"x":2},{"x":3},{"x":4},{"x":5}]', 'json', [{ op: 'tail', n: 2 }]);
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0].x, 4);
});

test('count', () => {
  const r = run('[{"x":1},{"x":2},{"x":3}]', 'json', [{ op: 'count' }]);
  assert.strictEqual(r.data[0].count, 3);
});

test('group by field', () => {
  const input = '[{"role":"admin","name":"Alice"},{"role":"user","name":"Bob"},{"role":"admin","name":"Charlie"}]';
  const r = run(input, 'json', [{ op: 'group', by: 'role' }]);
  assert.strictEqual(r.data.length, 2);
  const admin = r.data.find(g => g.key === 'admin');
  assert.strictEqual(admin.count, 2);
});

test('rename fields', () => {
  const r = run('[{"old_name":"Alice"}]', 'json', [{ op: 'rename', mapping: { old_name: 'new_name' } }]);
  assert.strictEqual(r.data[0].new_name, 'Alice');
  assert.strictEqual(r.data[0].old_name, undefined);
});

// ─── PIPELINE CHAINING ───────────────────────────────────────────────────

test('chained pipeline', () => {
  const input = '[{"name":"Alice","age":30,"role":"admin"},{"name":"Bob","age":25,"role":"user"},{"name":"Charlie","age":35,"role":"admin"}]';
  const r = run(input, 'json', [
    { op: 'filter', expr: 'item.age > 26' },
    { op: 'pick', fields: ['name', 'role'] },
    { op: 'sort', by: 'name', dir: 'asc' }
  ]);
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0].name, 'Alice');
  assert.strictEqual(r.data[1].name, 'Charlie');
});

// ─── SERIALIZATION ───────────────────────────────────────────────────────

test('serialize to CSV', () => {
  const r = run('[{"a":1,"b":2},{"a":3,"b":4}]', 'json', [], 'csv');
  assert(r.text.includes('a,b'));
  assert(r.text.includes('1,2'));
});

test('serialize to YAML', () => {
  const r = run('[{"a":1,"b":2}]', 'json', [], 'yaml');
  assert(r.text.includes('a: 1'));
});

test('serialize to table', () => {
  const r = run('[{"name":"Alice","age":30}]', 'json', [], 'table');
  assert(r.text.includes('Alice'));
  assert(r.text.includes('30'));
  assert(r.text.includes('rows'));
});

// ─── ERROR HANDLING ──────────────────────────────────────────────────────

test('error on invalid JSON', () => {
  const r = run('{invalid json}', 'json');
  assert(r.error);
});

test('error on unknown operation', () => {
  const r = run('[{"x":1}]', 'json', [{ op: 'nonexistent' }]);
  assert(r.error);
});

// ─── XML ─────────────────────────────────────────────────────────────────

test('parse simple XML with nested records', () => {
  const r = run('<data><user><name>Alice</name><age>32</age></user><user><name>Bob</name><age>25</age></user></data>', 'xml', [], 'json');
  assert.deepStrictEqual(r.data, [{ name: 'Alice', age: '32' }, { name: 'Bob', age: '25' }]);
});

test('XML roundtrip: serialize then parse back', () => {
  const src = '[{"name":"Alice","age":32},{"name":"Bob","age":20}]';
  const xml = run(src, 'json', [], 'xml').text;
  const back = run(xml, 'xml', [], 'json');
  assert.deepStrictEqual(back.data, [{ name: 'Alice', age: '32' }, { name: 'Bob', age: '20' }]);
});

test('filter on parsed XML', () => {
  const xml = '<data><item><v>10</v></item><item><v>3</v></item></data>';
  const r = run(xml, 'xml', [{ op: 'filter', expr: 'Number(item.v) > 5' }, { op: 'count' }], 'json');
  assert.deepStrictEqual(r.data, [{ count: 1 }]);
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────



// ─── SQL serializer ───
const { run: runSQL } = require('../src/engine.js');

function t(name, fn) {
  try { fn(); console.log('  ✅', name); passed++; }
  catch (e) { console.log('  ❌', name, e.message); failed++; }
}

t('JSON → SQL INSERT basic', () => {
  const r = runSQL('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]', 'json', [], 'sql', { tableName: 'users' });
  if (r.error) throw new Error(r.error);
  if (!r.text.includes('INSERT INTO "users" ("id", "name") VALUES')) throw new Error('missing header');
  if (!r.text.includes("(1, 'Alice')")) throw new Error('missing row');
});

t('CSV → SQL numbers stay numeric', () => {
  const r = runSQL('a,b\n1,hello\n2.5,world', 'csv', [], 'sql');
  if (r.text.includes("'1,'") || r.text.includes('(\'1\'')) throw new Error('number quoted');
  if (!r.text.includes('(1, \'hello\')')) throw new Error(r.text);
});

t('SQL escapes single quotes', () => {
  const r = runSQL('[{"name":"O\'Brien\'s Shop"}]', 'json', [], 'sql');
  if (!r.text.includes("'O''Brien''s Shop'")) throw new Error(r.text);
});

t('SQL NULL only for null and missing, never for an empty string', () => {
  // An empty string is a value, not an absence. Emitting NULL for it made
  // `WHERE middle = ''` return nothing after importing a CSV with a blank
  // field, and it was silent: exit 0, valid SQL.
  const r = runSQL('[{"a":null,"b":""},{"a":1,"b":2},{"a":3}]', 'json', [], 'sql');
  const rows = r.text.trim().split('\n').slice(2)
    .map(l => l.trim().replace(/,$/, '').replace(/;$/, ''));
  if (rows[0] !== "(NULL, '')") throw new Error('null and empty string mixed up: ' + r.text);
  if (rows[1] !== '(1, 2)') throw new Error(r.text);
  if (rows[2] !== '(3, NULL)') throw new Error('a key no record has must be NULL: ' + r.text);
  if (r.text.includes('NULL, NULL')) throw new Error('an empty string was written as NULL');
});

t('SQL keeps the empty string through a CSV round trip', () => {
  const r = runSQL('name,middle\nAlice,\nBob,Quinn\n', 'csv', [], 'sql');
  if (!r.text.includes("('Alice', '')")) throw new Error(r.text);
  if (r.text.includes('NULL')) throw new Error('a blank CSV field is a value, not NULL: ' + r.text);
  // The value survives the reader too, so the loss is not moved to the next hop.
  const back = runSQL('name,middle\nAlice,\nBob,Quinn\n', 'csv', [], 'csv');
  if (back.text !== 'name,middle\nAlice,\nBob,Quinn') throw new Error('lost on the way back: ' + JSON.stringify(back.text));
});

t('SQL quotes numeric strings with leading zeros', () => {
  // A Danish postal code is an identifier, not the number 74.
  const r = runSQL('name,zip\nAlice,0074\nBob,2100\n', 'csv', [], 'sql');
  if (!r.text.includes("('Alice', '0074')")) throw new Error('leading zero lost: ' + r.text);
  if (!r.text.includes("('Bob', 2100)")) throw new Error('plain number should stay numeric: ' + r.text);
  // Padded decimals are identifiers for the same reason; real numbers are not.
  const dec = runSQL('[{"v":"00.5"},{"v":"0.5"},{"v":"-0074"},{"v":0.5}]', 'json', [], 'sql');
  const rows = dec.text.trim().split('\n').slice(2).map(l => l.trim().replace(/,$/, '').replace(/;$/, ''));
  if (rows[0] !== "('00.5')") throw new Error(r.text);
  if (rows[1] !== '(0.5)') throw new Error('a plain decimal must stay numeric: ' + dec.text);
  if (rows[2] !== "('-0074')") throw new Error('a signed postal code lost its zeros: ' + dec.text);
  if (rows[3] !== '(0.5)') throw new Error('a real number must stay numeric: ' + dec.text);
});

t('pipeline + sql works', () => {
  const r = runSQL('[{"n":3},{"n":1},{"n":2}]', 'json', [{ op: 'sort', by: 'n' }], 'sql');
  const idx1 = r.text.indexOf('(1'), idx2 = r.text.indexOf('(2'), idx3 = r.text.indexOf('(3');
  if (!(idx1 < idx2 && idx2 < idx3)) throw new Error('sort not applied');
});

t('XML attributes are kept, not dropped', () => {
  const r = run('<r><i sku="A-1" stock="7"><name>Bog</name></i></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['@sku'] !== 'A-1') throw new Error('sku lost: ' + JSON.stringify(r.data));
  if (r.data[0]['@stock'] !== '7') throw new Error('stock lost: ' + JSON.stringify(r.data));
  if (r.data[0].name !== 'Bog') throw new Error('child lost: ' + JSON.stringify(r.data));
});

t('XML attribute and child of the same name both survive', () => {
  const r = run('<r><i name="attr"><name>child</name></i></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['@name'] !== 'attr') throw new Error('attribute lost: ' + JSON.stringify(r.data));
  if (r.data[0].name !== 'child') throw new Error('child lost: ' + JSON.stringify(r.data));
});

t('XML single-quoted and bare attribute values are read', () => {
  const r = run("<r><i a='one' b=two/></r>", 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['@a'] !== 'one') throw new Error('single quotes: ' + JSON.stringify(r.data));
  if (r.data[0]['@b'] !== 'two') throw new Error('bare value: ' + JSON.stringify(r.data));
});

t('XML entity references inside an attribute are decoded', () => {
  const r = run('<r><i title="Tom &amp; Jerry"/></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['@title'] !== 'Tom & Jerry') throw new Error(JSON.stringify(r.data));
});

t('XML namespaced tags do not empty the file', () => {
  const r = run('<r><ns:item><a>1</a></ns:item><ns:item><a>2</a></ns:item></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data.length !== 2) throw new Error('expected 2 records, got ' + JSON.stringify(r.data));
  if (r.data[0].a !== '1' || r.data[1].a !== '2') throw new Error(JSON.stringify(r.data));
});

t('XML DOCTYPE prologue does not empty the file', () => {
  const r = run('<?xml version="1.0"?>\n<!DOCTYPE users SYSTEM "u.dtd">\n<users><user id="1"><name>A</name></user></users>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data.length !== 1) throw new Error('expected 1 record, got ' + JSON.stringify(r.data));
  if (r.data[0]['@id'] !== '1' || r.data[0].name !== 'A') throw new Error(JSON.stringify(r.data));
});

t('XML DOCTYPE with an internal subset is skipped whole', () => {
  const r = run('<!DOCTYPE r [<!ELEMENT r (#PCDATA)>]>\n<r><i><a>1</a></i></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data.length !== 1) throw new Error('expected 1 record, got ' + JSON.stringify(r.data));
});

t('XML dashes and dots in tag names are read', () => {
  const r = run('<r><order-item><order.id>7</order.id></order-item></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['order.id'] !== '7') throw new Error(JSON.stringify(r.data));
});

t('XML round trip keeps attributes as attributes', () => {
  const first = run('<r><i sku="A-1"><name>Bog</name></i></r>', 'xml', [], 'json');
  if (first.error) throw new Error(first.error);
  const back = run(JSON.stringify(first.data), 'json', [], 'xml');
  if (back.error) throw new Error(back.error);
  if (!back.text.includes('sku="A-1"')) throw new Error('attribute not written back: ' + back.text);
  if (!back.text.includes('<name>Bog</name>')) throw new Error('child not written: ' + back.text);
  const again = run(back.text, 'xml', [], 'json');
  if (again.error) throw new Error(again.error);
  if (again.data[0]['@sku'] !== 'A-1' || again.data[0].name !== 'Bog') throw new Error(JSON.stringify(again.data));
});

t('XML writer escapes quotes in an attribute value', () => {
  const r = run('[{"@title":"say \\"hi\\""}]', 'json', [], 'xml');
  if (r.error) throw new Error(r.error);
  if (!r.text.includes('title="say &quot;hi&quot;"')) throw new Error(r.text);
});

t('XML element with attributes and text keeps both', () => {
  const r = run('<r><i unit="kg">5</i></r>', 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data[0]['@unit'] !== 'kg') throw new Error(JSON.stringify(r.data));
  if (r.data[0]['#text'] !== '5') throw new Error(JSON.stringify(r.data));
});

t('CSV writes a nested object as JSON, not [object Object]', () => {
  // This was the worst quiet failure in the tool: a nested `user` object became
  // the literal fourteen characters `[object Object]`, exit 0, no warning. The
  // site's own flattening guide names that string as the defect it works around.
  const src = '[{"id":1,"user":{"name":"Ada","email":"ada@example.com"}}]';
  const r = run(src, 'json', [], 'csv');
  if (r.text.includes('object Object')) throw new Error('still stringified: ' + r.text);
  // Read the cell back with the tool's own reader, so the test does not carry
  // a second, weaker idea of what a CSV cell is.
  const back = run(r.text, 'csv', [], 'json');
  if (back.error) throw new Error(back.error);
  if (JSON.parse(back.data[0].user).email !== 'ada@example.com') {
    throw new Error('the email is not recoverable from the cell: ' + r.text);
  }
});

t('CSV writes arrays as JSON, so two different arrays stay two different files', () => {
  // A comma-joined array collides: `["a,b"]` and `["a","b"]` both wrote `a,b`
  // and read back as one string. The cell has to be parseable to tell them apart.
  const r = run('[{"t":["a,b"]},{"t":["a","b"]}]', 'json', [], 'csv');
  const back = run(r.text, 'csv', [], 'json');
  if (back.error) throw new Error(back.error);
  if (back.data[0].t === back.data[1].t) throw new Error('the two arrays produced the same file: ' + r.text);
  if (JSON.stringify(JSON.parse(back.data[0].t)) !== '["a,b"]') throw new Error(back.data[0].t);
  if (JSON.stringify(JSON.parse(back.data[1].t)) !== '["a","b"]') throw new Error(back.data[1].t);
});

t('an empty object and an empty array are not the same cell', () => {
  // Both used to write an empty CSV field, so `{}` and `[]` became
  // indistinguishable and both read back as ''.
  const r = run('[{"a":{},"b":[]}]', 'json', [], 'csv');
  const cells = r.text.trim().split('\n')[1];
  if (!cells.includes('{}')) throw new Error('empty object lost: ' + r.text);
  if (!cells.includes('[]')) throw new Error('empty array lost: ' + r.text);
});

t('csv, sql and table agree on a nested value', () => {
  // They disagreed: table and docs/cli.md wrote JSON, csv and sql wrote
  // `[object Object]`. One helper now serves all three.
  const src = '[{"v":{"a":1}}]';
  const cell = '{"a":1}';
  if (!run(src, 'json', [], 'csv').text.includes(cell.replace(/"/g, '""'))) throw new Error('csv disagrees');
  if (!run(src, 'json', [], 'sql').text.includes(`'${cell}'`)) throw new Error('sql disagrees');
  if (!run(src, 'json', [], 'table').text.includes(cell)) throw new Error('table disagrees');
});

t('SQL imports a nested object as a JSON string literal, not as [object Object]', () => {
  const r = run('[{"id":1,"user":{"name":"O\'Brien"}}]', 'json', [], 'sql');
  if (r.text.includes('object Object')) throw new Error('still stringified: ' + r.text);
  // The single quote has to survive as data inside the literal.
  if (!r.text.includes(`'{"name":"O''Brien"}'`)) throw new Error('quote not escaped: ' + r.text);
});

t('a nested value survives a csv → json round trip as parseable JSON', () => {
  const r = run('[{"v":{"a":[1,2]}}]', 'json', [], 'csv');
  const back = run(r.text, 'csv', [], 'json');
  if (back.error) throw new Error(back.error);
  const cell = back.data[0].v;
  if (typeof cell !== 'string') throw new Error('unquoted: ' + JSON.stringify(back.data));
  if (JSON.stringify(JSON.parse(cell)) !== '{"a":[1,2]}') throw new Error('lost on the way back: ' + cell);
});

t('join with a prefix keeps the field whose name collided', () => {
  // The guard asked whether the *unprefixed* right-hand name existed on the
  // left, so a prefix — the one option that exists to survive a collision —
  // dropped the field anyway and still exited 0. docs/cli.md promises the
  // opposite.
  const r = run('[{"id":1,"tier":"basic"}]', 'json', [
    { op: 'join', on: 'id', prefix: 'r_', with: [{ id: 1, tier: 'gold' }] }
  ], 'json');
  if (r.data[0].r_tier !== 'gold') throw new Error('the prefixed field was dropped: ' + JSON.stringify(r.data));
  if (r.data[0].tier !== 'basic') throw new Error('the left side was overwritten: ' + JSON.stringify(r.data));
});

t('join without a prefix still refuses to overwrite an existing field', () => {
  // The fix must not turn the documented "matching fields never overwrite"
  // rule into a data race.
  const r = run('[{"id":1,"tier":"basic"}]', 'json', [
    { op: 'join', on: 'id', with: [{ id: 1, tier: 'gold' }] }
  ], 'json');
  if (r.data[0].tier !== 'basic') throw new Error('overwrote without a prefix: ' + JSON.stringify(r.data));
  if ('tier2' in r.data[0] || Object.keys(r.data[0]).length !== 2) {
    throw new Error('the field landed under some other name: ' + JSON.stringify(r.data));
  }
});

t('join prefix only helps when the prefixed name is itself taken', () => {
  const r = run('[{"id":1,"tier":"basic","r_tier":"already"}]', 'json', [
    { op: 'join', on: 'id', prefix: 'r_', with: [{ id: 1, tier: 'gold' }] }
  ], 'json');
  if (r.data[0].r_tier !== 'already') throw new Error('overwrote a taken name: ' + JSON.stringify(r.data));
  if (r.data[0].tier !== 'basic') throw new Error(JSON.stringify(r.data));
});

// ─── Keys that are not legal XML names, and keys that lie to the reader ───

t('a key that is not a legal XML name travels in a name attribute', () => {
  const r = runSQL('[{"first name":"Ada","2fa":true,"a-b":1,"normal":"ok"}]', 'json', [], 'xml');
  if (r.error) throw new Error(r.error);
  // `first name` and `2fa` may not be tag names, so they must not be written as
  // one: the file used to be rejected by every XML parser, this one included.
  if (/<first name>|<2fa>/.test(r.text)) throw new Error('wrote a key as a tag name: ' + r.text);
  if (!r.text.includes('<field name="first name">Ada</field>')) throw new Error(r.text);
  if (!r.text.includes('<a-b>1</a-b>')) throw new Error('a legal name must stay a tag: ' + r.text);
});

t('JSON → XML → JSON keeps keys that are not legal XML names', () => {
  const input = '[{"first name":"Ada","2fa":true,"a/b":"x","":"empty","deep":{"3rd place":"podium"}}]';
  const out = runSQL(input, 'json', [], 'xml');
  if (out.error) throw new Error(out.error);
  const back = runSQL(out.text, 'xml', [], 'json');
  if (back.error) throw new Error('the tool cannot read its own output: ' + back.error);
  // The round trip is the whole claim. It used to come back as `[{}]`: every
  // field gone, exit 0, no warning. `2fa` reads back as a string because XML
  // carries no types — the same thing `<age>30</age>` has always done.
  assert.deepStrictEqual(back.data, [{
    'first name': 'Ada', '2fa': 'true', 'a/b': 'x', '': 'empty',
    deep: { '3rd place': 'podium' }
  }]);
});

t('an attribute name is a name too, so `@2fa` is not written as an attribute', () => {
  const input = '[{"@2fa":"x","@":"y","@id":"ok"}]';
  const out = runSQL(input, 'json', [], 'xml');
  if (out.error) throw new Error(out.error);
  if (/="[xy]"/.test(out.text.replace(/ name="[^"]*"/g, ''))) throw new Error('empty or illegal attribute name: ' + out.text);
  if (!out.text.includes('<item id="ok">')) throw new Error('a legal attribute must stay an attribute: ' + out.text);
  const back = runSQL(out.text, 'xml', [], 'json');
  assert.deepStrictEqual(back.data, JSON.parse(input));
});

t('XML output is well-formed for a whole fixture of awkward keys', () => {
  const input = JSON.stringify([
    { 'first name': 'Ada', '2fa': 'yes', '@': 'x', 'a-b': '1', 'a.b': '2', 'ns:ok': '3', 'ünïcode': '4' },
    { 'first name': 'Bob', '2fa': 'no', '@': 'y', 'a-b': '5', 'a.b': '6', 'ns:ok': '7', 'ünïcode': '8' }
  ]);
  const out = runSQL(input, 'json', [], 'xml');
  if (out.error) throw new Error(out.error);
  // No tag or attribute name outside the XML Name production. `<?xml` and
  // `<!--` are declarations and comments, not names.
  const tags = [...out.text.matchAll(/<\/?([^\s/>!?][^\s/>]*)/g)].map(m => m[1]);
  for (const tag of tags) {
    if (!/^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/.test(tag)) {
      throw new Error(`not a legal XML name: ${tag} in\n${out.text}`);
    }
  }
  assert.deepStrictEqual(runSQL(out.text, 'xml', [], 'json').data, JSON.parse(input));
});

t('an unreadable XML document fails instead of parsing to nothing', () => {
  // Half a document used to be `[]` or `[{}]` with exit 0, so a file the reader
  // did not understand looked like a file with no records.
  for (const [doc, why] of [
    ['<data><item><a>1</a>', 'root is never closed'],
    ['not xml at all', 'no root element'],
    ['<data><item><a>1</a></b></data>', 'closing tag does not match']
  ]) {
    const r = runSQL(doc, 'xml', [], 'json');
    if (!r.error) throw new Error(`${why}: parsed silently to ${JSON.stringify(r.data)}`);
  }
});

t('a legal XML document still parses', () => {
  const r = runSQL(readFileSync(join(here, 'users.xml'), 'utf-8'), 'xml', [], 'json');
  if (r.error) throw new Error(r.error);
  if (r.data.length !== 3) throw new Error(JSON.stringify(r.data));
});

t('unique without `by` compares records, not key order', () => {
  const input = '[{"a":1,"b":2},{"b":2,"a":1},{"a":1,"b":2},{"a":2,"b":1}]';
  const r = runSQL(input, 'json', [{ op: 'unique' }], 'json');
  // The second record is the first one with its keys in another order. Both
  // were kept before, so the deduplication did nothing on input that did not
  // come out of this tool.
  assert.strictEqual(r.data.length, 2);
  assert.deepStrictEqual(Object.keys(r.data[0]), ['a', 'b']);
});

t('unique without `by` compares nested records by content', () => {
  const input = '[{"id":1,"tags":{"x":1,"y":2}},{"id":1,"tags":{"y":2,"x":1}},{"id":2,"tags":{}}]';
  const r = runSQL(input, 'json', [{ op: 'unique' }], 'json');
  assert.strictEqual(r.data.length, 2);
});

t('group survives a group key that is also an Object property', () => {
  // `__proto__` and `constructor` are strings any JSON file may hold. As object
  // property names they reached `Object.prototype`, and the run died with
  // "groups[key].push is not a function".
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const r = runSQL(`[{"k":"${key}","n":1},{"k":"${key}","n":2},{"k":"other","n":3}]`, 'json', [{ op: 'group', by: 'k' }], 'json');
    if (r.error) throw new Error(`${key}: ${r.error}`);
    assert.strictEqual(r.data.length, 2, key);
    assert.strictEqual(r.data.find(g => g.key === key).count, 2, key);
  }
});

t('group keeps grouping the ordinary values the same way', () => {
  const r = runSQL('[{"role":"admin"},{"role":"admin"},{"role":null},{"role":"user"}]', 'json', [{ op: 'group', by: 'role' }], 'json');
  assert.strictEqual(r.data.length, 3);
  assert.deepStrictEqual(r.data.map(g => [g.key, g.count]), [['admin', 2], ['(null)', 1], ['user', 1]]);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
