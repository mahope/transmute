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

t('SQL NULL for empty values', () => {
  const r = runSQL('[{"a":null,"b":""}]', 'json', [], 'sql');
  if (!r.text.includes('(NULL, NULL)')) throw new Error(r.text);
});

t('pipeline + sql works', () => {
  const r = runSQL('[{"n":3},{"n":1},{"n":2}]', 'json', [{ op: 'sort', by: 'n' }], 'sql');
  const idx1 = r.text.indexOf('(1'), idx2 = r.text.indexOf('(2'), idx3 = r.text.indexOf('(3');
  if (!(idx1 < idx2 && idx2 < idx3)) throw new Error('sort not applied');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
