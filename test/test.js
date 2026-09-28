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

test('add with an expression that is not JavaScript fails instead of nulling every row', () => {
  // The per-record catch turned a typo into a whole table of nulls, which is
  // the same silent answer the identity passthrough gave filter and map.
  const r = run('[{"a":1},{"a":2}]', 'json', [{op:'add',fields:{x:'item.a >'}}]);
  assert.ok(/Invalid expression "item\.a >"/.test(r.error), r.error);
  assert.strictEqual(r.usage, true);
});

test('an expression that cannot be compiled fails as a usage error', () => {
  const r = run('[{"age":10},{"age":30}]', 'json', [{ op: 'filter', expr: 'item.age >' }]);
  assert.ok(/Invalid expression/.test(r.error), r.error);
  assert.strictEqual(r.usage, true);
  assert.strictEqual(r.text, undefined);
});

test('a missing parenthesis in an expression is caught too', () => {
  const r = run('[{"age":10}]', 'json', [{ op: 'map', expr: 'item.age > 5)' }]);
  assert.ok(/Invalid expression "item\.age > 5\)"/.test(r.error), r.error);
  assert.strictEqual(r.usage, true);
});

test('an expression that throws at runtime stays a transformation error', () => {
  const r = run('[{"a":1}]', 'json', [{ op: 'map', expr: 'item.nope.deep' }]);
  assert.ok(/reading 'deep'/.test(r.error), r.error);
  assert.notStrictEqual(r.usage, true);
});

test('a valid expression is still compiled and run', () => {
  const r = run('[{"x":1},{"x":5}]', 'json', [{ op: 'filter', expr: 'item.x > 2' }]);
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.data, [{ x: 5 }]);
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

// Measured against `csv` in the reader, not against a wish. Every case below
// read as data on the real binary before T98: the line above the header became
// the header, so every real column name in the file was gone, and a `;` file
// with a comment above it lost every column boundary it had.
test('a # line above the header is a comment, so the header is the header', () => {
  const r = run('# exported 2026-09-28\na,b\n1,2\n', 'csv', [], 'json');
  assert.deepStrictEqual(r.data, [{ a: 1, b: 2 }]);
  // The comment is gone, and nothing pretends otherwise: one line naming the
  // count and the text, so a file that used `#` as a column name hears about it.
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('1 CSV line starting with #'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('# exported 2026-09-28'), r.warnings[0]);
});

test('a # line in the middle or at the end of a file is a comment, not a row', () => {
  // Both read as an invented data row before, with the comment's own words in
  // the columns — T26's class, the one that puts text in a file that has none.
  const middle = run('a,b\n#x,y\n1,2\n', 'csv', [], 'json');
  assert.deepStrictEqual(middle.data, [{ a: 1, b: 2 }]);
  const end = run('a,b\n1,2\n#x,y\n', 'csv', [], 'json');
  assert.deepStrictEqual(end.data, [{ a: 1, b: 2 }]);
});

test('a comment does not take the delimiter with it', () => {
  // The measured worst case: `# note` above a `;` file won the delimiter
  // comparison, so the whole file came back as ONE column of raw text and
  // every column boundary in it was gone.
  const r = run('# note\na;b\n1;2\n', 'csv', [], 'json');
  assert.deepStrictEqual(r.data, [{ a: 1, b: 2 }]);
  // Same shape with the delimiter inside the comment line itself.
  assert.deepStrictEqual(run('#a,b\n1,2\n3,4\n', 'csv', [], 'json').data, [{ 1: 3, 2: 4 }]);
});

test('a # that opens a quoted field is data, because the reader trims before it asks', () => {
  assert.deepStrictEqual(run('a\n"#b",2\n', 'csv', [], 'json').data, [{ a: '#b', column2: 2 }]);
  // A # on the second line of a quoted field never ends a record at all, so it
  // cannot become a comment either.
  assert.deepStrictEqual(run('a,b\n"x\n#y",2\n', 'csv', [], 'json').data, [{ a: 'x\n#y', b: 2 }]);
  // Leading whitespace does not save a line: the reader trims an unquoted
  // field, so `  #a,b` is a comment with two fields, not a header with two
  // names — and a file of nothing but those is empty, and says so.
  const indented = run('  #a,b\n1,2\n', 'csv', [], 'json');
  assert.deepStrictEqual(indented.data, []);
  assert.ok(indented.warnings[0].includes('1 CSV line starting with #'), indented.warnings[0]);
});

test('several comment lines are one warning, like every other per-parse warning', () => {
  const r = run('# a\n# b\n#c\na,b\n1,2\n', 'csv', [], 'json');
  assert.deepStrictEqual(r.data, [{ a: 1, b: 2 }]);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('3 CSV lines starting with #'), r.warnings[0]);
});

test('a file of nothing but # lines is empty, and says so', () => {
  const r = run('#a\n#b\n', 'csv', [], 'json');
  assert.deepStrictEqual(r.data, []);
  assert.ok(r.warnings[0].includes('2 CSV lines starting with #'), r.warnings[0]);
});

test('a value or header that opens with # is quoted on the way out', () => {
  // Without this the tool wrote files it then read back wrong: `{"a":"#1"}`
  // went out as `a\n#1` and came back as ZERO rows, and a column called
  // `#id` cost the file every one of its other columns.
  assert.strictEqual(run('[{"a":"#1"}]', 'json', [], 'csv').text, 'a\n"#1"');
  assert.strictEqual(run('[{"#id":"1","a":"x"}]', 'json', [], 'csv').text, '"#id",a\n1,x');
  assert.deepStrictEqual(
    run(run('[{"a":"#1"}]', 'json', [], 'csv').text, 'csv', [], 'json').data, [{ a: '#1' }]);
  // A # that is not the first character is ordinary text and stays bare.
  assert.strictEqual(run('[{"a#b":"1"}]', 'json', [], 'csv').text, 'a#b\n1');
  assert.strictEqual(run('[{"a":"x#y"}]', 'json', [], 'csv').text, 'a\nx#y');
});

test('a header that names a column twice says so, because one column is gone', () => {
  const r = run('a,a,b\n1,2,3', 'csv', [], 'json');
  // The last of the two wins, exactly as it always did — the point is that the
  // value in the first one is gone and nothing said so.
  assert.deepStrictEqual(r.data[0], { a: 2, b: 3 });
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('"a" twice'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('columns 1 and 2'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('only the last of them is kept'), r.warnings[0]);
});

test('a repeated header warns once, not once per row', () => {
  const r = run('a,a\n1,2\n5,6\n9,9', 'csv', [], 'json');
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('2 of 3 rows'), r.warnings[0]);
});

test('a repeated header whose two columns always agree stays silent', () => {
  // The rule JSON and YAML already use: an identical repeat says the same thing
  // twice, and a warning for it would be noise on correct input. Nothing is
  // lost here either — both columns hold the same value in every row.
  assert.deepStrictEqual(run('a,a\n1,1\n2,2', 'csv', [], 'json').warnings, []);
  // And the two are compared as the reader read them: `1` and `1.0` are the
  // same number, so this says the same thing twice as well.
  assert.deepStrictEqual(run('a,a\n1,1.0', 'csv', [], 'json').warnings, []);
  assert.deepStrictEqual(run('a,a\ntrue,true', 'csv', [], 'json').warnings, []);
});

test('a repeated header is found after the reader read the names, not in the raw text', () => {
  // `"a"` is the same name as `a`, and `,` twice is the same empty name twice.
  assert.strictEqual(run('a,"a"\n1,2', 'csv', [], 'json').warnings.length, 1);
  assert.strictEqual(run(',\n1,2', 'csv', [], 'json').warnings.length, 1);
  // A name that trims to another one is the same name too, which is how a
  // spreadsheet export loses a column.
  assert.strictEqual(run('a, a\n1,2', 'csv', [], 'json').warnings.length, 1);
});

test('a short row in a pair of repeated columns warns, because its value is gone', () => {
  const r = run('a,a\n1', 'csv', [], 'json');
  assert.deepStrictEqual(r.data[0], { a: '' });
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('1 of 1 row'), r.warnings[0]);
});

test('a repeated header with no rows to compare stays silent', () => {
  // There is nothing to lose without a row, so there is nothing to report.
  assert.deepStrictEqual(run('a,a\n', 'csv', [], 'json').warnings, []);
  assert.deepStrictEqual(run('a,a', 'csv', [], 'json').warnings, []);
});

test('three columns under one name are reported once, with every position', () => {
  const r = run('a,a,a\n1,2,3', 'csv', [], 'json');
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('columns 1, 2 and 3'), r.warnings[0]);
});

test('two different repeated headers are reported separately', () => {
  const r = run('a,a,b,b\n1,2,3,4', 'csv', [], 'json');
  assert.strictEqual(r.warnings.length, 2);
  assert.ok(r.warnings.some(w => w.includes('"a" twice')), r.warnings.join('\n'));
  assert.ok(r.warnings.some(w => w.includes('"b" twice')), r.warnings.join('\n'));
});

// ─── WRITERS: A NAME ONLY SOME ROWS HAVE ────────────────────────────────

// The key union is built from the first row that has the name, and then every
// writer asks the *other* rows for that value. `row[name]` walks the prototype
// chain, so a name like `constructor` came back as the inherited function and
// was written into the output as its own source text.

test('a value only the first row has is empty in the others, not an inherited one', () => {
  const data = JSON.stringify([{ name: 'a' }, { other: 1 }]);
  const pipeline = [{ op: 'rename', mapping: { name: 'constructor' } }];
  const csv = run(data, 'json', pipeline, 'csv');
  assert.strictEqual(csv.text, 'constructor,other\na,\n,1');
  const table = run(data, 'json', pipeline, 'table');
  assert.ok(!table.text.includes('native code'), table.text);
  const sql = run(data, 'json', pipeline, 'sql');
  assert.ok(!sql.text.includes('native code'), sql.text);
  assert.ok(sql.text.includes("('a', NULL)"), sql.text);
});

test('every prototype name is a missing value, not a function', () => {
  const data = JSON.stringify([{ name: 'a' }, { other: 1 }]);
  for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']) {
    const csv = run(data, 'json', [{ op: 'rename', mapping: { name } }], 'csv');
    assert.strictEqual(csv.text, `${name},other\na,\n,1`, name);
  }
});

test('a field named __proto__ is still written as the field it is', () => {
  const csv = run('{"__proto__":1,"a":2}', 'json', [], 'csv');
  assert.strictEqual(csv.text, '__proto__,a\n1,2');
  const sql = run('{"__proto__":1,"a":2}', 'json', [], 'sql');
  assert.ok(sql.text.includes('"__proto__"'), sql.text);
});

test('a row that is not a record does not crash the flat writers', () => {
  const data = JSON.stringify([null, { a: 1 }]);
  for (const format of ['csv', 'table', 'sql']) {
    const r = run(data, 'json', [], format);
    assert.ok(r.text !== undefined, `${format} threw instead of writing: ${r.error}`);
  }
  // `""` and not a bare blank line: in a one-column file an empty line is the
  // blank line RFC 4180 lets between records, and the reader drops it — so the
  // bare form loses the row on the way back in. T43's rule, and it is the
  // reader that decides it, not the writer.
  const csv = run(data, 'json', [], 'csv');
  assert.strictEqual(csv.text, 'a\n""\n1');
  assert.strictEqual(run(csv.text, 'csv', [], 'json').data.length, 2);
});

test('a record after a row that is not one still decides the columns', () => {
  const csv = run(JSON.stringify([null, { b: 2 }, { a: 1 }]), 'json', [], 'csv');
  assert.strictEqual(csv.text, 'b,a\n,\n2,\n,1');
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

/**
 * Screen columns of a line, counted the way a terminal counts them. This is
 * the expectation, not a copy of the engine's own helper: it only knows the
 * three cases the table tests use, and it would disagree with the engine if
 * the engine got one of them wrong.
 */
function displayWidthOfLine(line) {
  let w = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || (cp >= 0x0300 && cp <= 0x036f)) continue; // variation selector, combining accent
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1f9ff);
    w += wide ? 2 : 1;
  }
  return w;
}

test('a table measures a cell in screen columns, not in UTF-16 code units', () => {
  // `.length` is not a column count. `🚀` is two code units and two columns,
  // `日本` is two code units and four columns, and `é` written as `e` plus a
  // combining accent is two code units and one column. Padding by `.length`
  // moved the right-hand border on the very line it had just printed.
  const r = serializers.table([{ who: '🚀', where: 'Danmark' }, { who: '日本', where: 'Danmark' }]);
  const lines = r.split('\n');
  // Every rule and every row line is the same length once measured in columns.
  const widths = lines.filter(l => l.startsWith('|') || l.startsWith('+-'));
  assert.equal(new Set(widths.map(displayWidthOfLine)).size, 1, r);
  // The border, the header, the middle border, the two rows and the closing
  // border: six lines, all the same width once counted in columns.
  assert.equal(widths.length, 6, r);
});

test('a combining accent does not push the rest of the cell to the right', () => {
  const plain = serializers.table([{ a: 'cafe' }]);
  const accented = serializers.table([{ a: 'cafe\u0301' }]);
  const w = s => displayWidthOfLine(s.split('\n').find(l => l.startsWith('| ')));
  assert.equal(w(plain), w(accented), `${plain}\n---\n${accented}`);
});

test('a table sizes its columns from the rows it prints, not from rows it hides', () => {
  // The table prints the first 20 rows. It used to measure every row in the
  // file, so one long value in row 5,000 padded all 20 printed lines to a
  // width no printed line used.
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: i, note: 'short' }));
  rows[29].note = 'x'.repeat(120);
  const r = serializers.table(rows);
  const bodyLines = r.split('\n').filter(l => l.startsWith('| '));
  assert.equal(bodyLines.length, 21, r); // header + 20 rows
  assert.equal(Math.max(...bodyLines.map(displayWidthOfLine)), 14, r);
  assert.equal(r.includes('... 10 more rows'), true, r);
});

test('a table of 150,000 records is a table, not a stack overflow', () => {
  // `Math.max(...data.map(...))` spread one argument per record into a call.
  // V8's limit is somewhere around 110,000, so a perfectly ordinary 4 MB CSV
  // died with "Maximum call stack size exceeded" — and `table` is the format
  // the preview uses, so it took the plain `transmute people.csv` with it.
  const rows = Array.from({ length: 150000 }, (_, i) => ({ id: i, name: `person-${i}` }));
  const r = serializers.table(rows);
  assert.equal(r.includes('(150000 rows, 2 columns)'), true, r.slice(-200));
  assert.equal(r.includes('... 149980 more rows'), true, r.slice(-200));
});

test('a table cell that cannot be shown in a box is written as an escape', () => {
  // Every one of these broke the frame at exit 0 with empty stderr. A newline
  // made one record print as two rows; a carriage return sent the cursor back
  // to column 0 and overwrote the row's own left border; a tab is one column to
  // `displayWidth` but up to eight to a terminal, so the right border sat where
  // the text did not end; and a bare `|` reads as the box's own separator.
  // Each input paired with the cell it must be written as. Pairing them keeps a
  // passing assertion tied to the value that produced it.
  const hostile = [
    ['line1\nline2', 'line1\\nline2'],
    ['a\rb', 'a\\rb'],
    ['a\tb', 'a\\tb'],
    ['x|y', 'x\\|y'],
    ['a|b\nc|d', 'a\\|b\\nc\\|d'],
    ['b\x07c', 'b\\x07c'],
    ['\r\n', '\\r\\n'],
    ['Møller\n日本', 'Møller\\n日本']
  ];
  for (const [input, expected] of hostile) {
    const r = serializers.table([{ a: input }]);
    const widths = r.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'));
    // The frame survives: every rule and every row is the same width.
    assert.equal(new Set(widths.map(displayWidthOfLine)).size, 1, `${JSON.stringify(input)}\n${r}`);
    // Three rules, a header, one row: the value stayed on the line it started on.
    assert.equal(widths.length, 5, `${JSON.stringify(input)}\n${r}`);
    // And the cell carries the value, spelled so a reader can see what happened.
    assert.ok(r.includes(`| ${expected} `), `${JSON.stringify(input)} -> ${expected}\n${r}`);
  }
  // A NUL is a stronger case than an escape: it is refused outright, because
  // `assertWritable` has no way to keep it at all. It never reaches the cell,
  // so the escape rule is not the last line of defence here — it is the first.
  assert.throws(() => serializers.table([{ a: 'sl\0et' }]), /cannot write U\+0000/);
});

test('a table writes the escape it means, not a different character', () => {
  // The point of an escape is that it can be read back. Assert the spelling,
  // because `\n` and a literal newline look identical in a diff and are not.
  assert.match(serializers.table([{ a: 'x\ny' }]), /\| x\\ny +\|/);
  assert.match(serializers.table([{ a: 'x\ry' }]), /\| x\\ry +\|/);
  assert.match(serializers.table([{ a: 'x\ty' }]), /\| x\\ty +\|/);
  assert.match(serializers.table([{ a: 'x|y' }]), /\| x\\\|y +\|/);
  // A control character with no short name is spelled by its byte value.
  assert.match(serializers.table([{ a: 'x\x07y' }]), /\| x\\x07y +\|/);
  // Ordinary text is untouched, including the characters the box is drawn with.
  assert.match(serializers.table([{ a: 'Møller' }]), /\| Møller +\|/);
  assert.match(serializers.table([{ a: '2026-09-26' }]), /\| 2026-09-26 +\|/);
  assert.match(serializers.table([{ a: 'a-b' }]), /\| a-b +\|/);
});

test('a table cell made only of frame characters cannot pose as a border', () => {
  // The one way data in this format can impersonate the frame around it.
  const r = serializers.table([{ a: '+---+' }]);
  // The cell is the row line without its `| ` and ` |`, and it no longer opens
  // with the character a border line opens with.
  const cell = r.split('\n')[3].slice(2, -2);
  assert.equal(cell.length, 6, r);
  assert.ok(!'+-|'.includes(cell[0]), `cellen begynder med ${JSON.stringify(cell[0])}: ${r}`);
  // Escaping the first character is enough, and it is a character no line of
  // the frame can start with: every line that opens with a `+` is made of the
  // frame's characters and nothing else.
  for (const line of r.split('\n')) {
    if (line.startsWith('+')) assert.match(line, /^[+-]+$/, line);
  }
  // The frame is still a frame: five lines, all the same width.
  const widths = r.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'));
  assert.equal(new Set(widths.map(displayWidthOfLine)).size, 1, r);
  assert.equal(widths.length, 5, r);
  // It takes the whole cell being frame-shaped. A date is not, and neither is
  // a `+` in the middle of a value, and neither is a run too short to read as
  // a border.
  for (const ordinary of ['2026-09-26', 'a + b', '++', '-', 'a-b', 'x - y', 'a-+-b']) {
    assert.doesNotMatch(serializers.table([{ a: ordinary }]), /\\/, ordinary);
  }
});

test('a table measures a column after escaping it, not before', () => {
  // The bug this loop already had once, for CJK width: measure the raw value,
  // print the escaped one, and the padding counts the length of the escape
  // instead of the width of the cell. `p\nq` is two characters wide and four
  // characters printed, so measuring the raw value leaves every line below the
  // frame two columns short of the rule above it.
  const r = serializers.table([{ a: 'p\nq' }, { a: 'x' }]);
  const widths = r.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'));
  assert.equal(new Set(widths.map(displayWidthOfLine)).size, 1, r);
  // The escaped cell decides the width, so the column is exactly as wide as the
  // four characters that are printed.
  assert.equal(r.split('\n')[0], '+------+', r);
  // The other direction too: a value that only gets shorter cannot leave the
  // column padded to the width of something that is no longer printed.
  const narrow = serializers.table([{ a: 'x|y' }, { a: '12345678' }]);
  assert.equal(
    new Set(narrow.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'))
      .map(displayWidthOfLine)).size, 1, narrow
  );
});

test('a table column name is escaped and measured like a value', () => {
  // A newline in a column name split the header across two lines, so every row
  // below it was misaligned — the header is the worst cell in the table,
  // because everything else lines up to it.
  for (const name of ['a\nb', 'a|b', 'a\tb', 'a\rb', '+---+']) {
    const r = serializers.table([{ [name]: 1 }]);
    const widths = r.split('\n').filter(l => l.startsWith('|') || l.startsWith('+-'));
    assert.equal(new Set(widths.map(displayWidthOfLine)).size, 1, `${JSON.stringify(name)}\n${r}`);
    assert.equal(widths.length, 5, `${JSON.stringify(name)}\n${r}`);
  }
});

test('a sql identifier is escaped, not only quoted', () => {
  // A `"` inside a double-quoted identifier is escaped by doubling it, the same
  // way `''` doubles inside a string literal. Measured against sqlite3: a
  // column named `a"b` gave `("a"b")` and `Parse error near "b"`, and Transmute
  // exited 0 with empty stderr, so the user got a file that cannot be imported.
  assert.strictEqual(
    serializers.sql([{ 'a"b': 1 }]),
    '-- Generated by Transmute\nINSERT INTO "my_table" ("a""b") VALUES\n  (1);'
  );
  // The table name goes through the same helper — and `--table` is a flag the
  // user types, so this one is a single stray quote away from a normal command.
  assert.strictEqual(
    serializers.sql([{ a: 1 }], { tableName: 'my"table' }),
    '-- Generated by Transmute\nINSERT INTO "my""table" ("a") VALUES\n  (1);'
  );
  // An ordinary name is unchanged, and `;` and `--` were already safe inside a
  // quoted identifier: they are ordinary characters there, not a statement end.
  assert.match(serializers.sql([{ a: 1 }]), /INSERT INTO "my_table" \("a"\) VALUES/);
  assert.match(serializers.sql([{ 'a;DROP TABLE t;--': 1 }]), /\("a;DROP TABLE t;--"\)/);
  assert.match(serializers.sql([{ 'a--b': 1 }]), /\("a--b"\)/);
});

test('a sql value keeps a newline, because sql literals may hold one', () => {
  // Measured, and deliberately not changed. SQL has no `\n` escape inside a
  // string literal — it would store a literal backslash and an n — so
  // "fixing" the line break would replace the value with a different one. The
  // file is valid: sqlite3 imports it and the value comes back with its
  // newline, which is the whole point of the measurement.
  const sql = serializers.sql([{ a: 1, b: 'line1\nline2' }]);
  assert.match(sql, /\(1, 'line1\nline2'\);/);
  // The value side's own doubling is untouched by the identifier change.
  assert.match(serializers.sql([{ a: "x'; DROP TABLE secret; --" }]), /'x''; DROP TABLE secret; --'/);
});

test('csv and table column order is the first-seen order of every key', () => {  const records = [{ b: 1 }, { a: 2, c: 3 }];
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

test('an element that contains a child of its own name is read to its real end', () => {
  // `{"a":{"a":1}}` is written as `<a><a>1</a></a>`, and finding the end by the
  // first `</a>` cut the parent off inside the child: the reader failed the
  // whole file on a document it had written itself.
  assert.deepStrictEqual(run('<data><item><a><a>1</a></a></item></data>', 'xml').data, [{ a: { a: '1' } }]);
  assert.deepStrictEqual(run('<data><item><a><a><a>1</a></a></a></item></data>', 'xml').data, [{ a: { a: { a: '1' } } }]);
  // A self-closing child of the same name closes nothing, so it must not be
  // counted as an open element.
  assert.deepStrictEqual(run('<data><item><a><a/></a></item></data>', 'xml').data, [{ a: { a: {} } }]);
  // Only same-name children nest: a different name in between is its own depth.
  assert.deepStrictEqual(run('<data><item><a><b><a>1</a></b></a></item></data>', 'xml').data, [{ a: { b: { a: '1' } } }]);
  // A name that only shares a prefix is a different element, not a nested one.
  assert.deepStrictEqual(run('<data><item><a><ab>1</ab></a></item></data>', 'xml').data, [{ a: { ab: '1' } }]);
});

test('json → xml → json survives a key that repeats on two levels', () => {
  const src = JSON.stringify([{ a: { a: 1 } }, { a: { b: { a: 2 } } }]);
  const back = run(run(src, 'json', [], 'xml').text, 'xml', [], 'json');
  assert.deepStrictEqual(back.data, [{ a: { a: '1' } }, { a: { b: { a: '2' } } }]);
});

test('a list is repeated elements, so a list is still a list', () => {
  // The list used to be written as numbered `<field name="0">` children, which
  // is a list in an object's clothes: the index that says *which member* lived
  // in an attribute, because an element name cannot say it twice in a row. A
  // reader that maps element name to value then keeps the last member and drops
  // the rest, and this reader read `{"0":"1","1":"2","2":"3"}` back.
  const round = (v) => run(run(JSON.stringify([{ v }]), 'json', [], 'xml').text, 'xml', [], 'json').data[0].v;
  assert.deepStrictEqual(round([1, 2, 3]), ['1', '2', '3']);
  assert.deepStrictEqual(round(['a', 'b']), ['a', 'b']);
  assert.deepStrictEqual(round([{ sku: 'A' }, { sku: 'B' }]), [{ sku: 'A' }, { sku: 'B' }]);
  // Two empty objects are two elements, and an empty element is not an empty
  // string the way a self-closed carried key is.
  assert.deepStrictEqual(round([{}, {}]), [{}, {}]);
  // A list inside a record, and a record whose own key repeats, are the same
  // rule: repeated elements wherever the name may say it.
  const deep = run('[{"a":{"v":[1,2]},"w":3}]', 'json', [], 'xml');
  assert.ok(deep.text.includes('<v>1</v>') && deep.text.includes('<v>2</v>'), deep.text);
  assert.deepStrictEqual(run(deep.text, 'xml', [], 'json').data, [{ a: { v: ['1', '2'] }, w: '3' }]);
  // An object with one repeated child is a different document from a list, and
  // it stays one: this is the case a list-inside-a-list cannot be told from.
  const coll = run('[{"v":{"v":[1,2]}}]', 'json', [], 'xml');
  assert.deepStrictEqual(run(coll.text, 'xml', [], 'json').data, [{ v: { v: ['1', '2'] } }]);
  // A key that is not a legal tag name still cannot be spelled as a tag, so it
  // travels in the `name` attribute — once per member, which the reader keys on.
  const carried = run('[{"first name":["a","b"]}]', 'json', [], 'xml');
  assert.strictEqual((carried.text.match(/<field name="first name">/g) || []).length, 2, carried.text);
  assert.deepStrictEqual(run(carried.text, 'xml', [], 'json').data, [{ 'first name': ['a', 'b'] }]);
  // A record that is a list keeps its own boundary: two records that are lists
  // must not become one element per member.
  const rows = run('[[1,2],[3,4]]', 'json', [], 'xml');
  assert.strictEqual((rows.text.match(/<item>/g) || []).length, 2, rows.text);
  assert.deepStrictEqual(run(rows.text, 'xml', [], 'json').data, [{ '0': '1', '1': '2' }, { '0': '3', '1': '4' }]);
});

test('a list member with an attribute cannot be a duplicate attribute', () => {
  // `<field name="0" name="x"/>` is two `name` attributes on one element, and
  // expat refuses the file outright — not a lossy read, an unreadable one. A
  // carried key has already spent the element's attribute slot, so the record's
  // own attributes go out as child elements, the same road an illegal
  // attribute name already took.
  const r = run('[{"first name":[{"@name":"x","sku":"A"}]}]', 'json', [], 'xml');
  assert.ok(!/name="[^"]*"[^>]*\sname=/.test(r.text.replace(/\n\s*/g, ' ')), r.text);
  assert.ok(r.text.includes('<field name="@name">'), r.text);
  // A legal key is unaffected: the attribute is an attribute, as it always was.
  const ok = run('[{"v":[{"@name":"x","sku":"A"}]}]', 'json', [], 'xml');
  assert.ok(ok.text.includes('<v name="x">'), ok.text);
  assert.ok(!ok.text.includes('field'), ok.text);
});

test('a name carrying a prefix is carried, not written as a name', () => {
  // `<a:b>1</a:b>` is a namespace *reference*, and a reference is only legal
  // when the document declares the prefix it names. There is no URI here to
  // declare, so the file was one no namespace-aware parser could open at all:
  // measured on the binary this writes, `xml.etree.ElementTree` answers
  // "unbound prefix" and gives up, while this tool read its own output back and
  // reported it fine. A name that carries a prefix therefore cannot be spelled
  // as a name, and travels the way every other unspellable name already does.
  for (const key of ['a:b', 'xml:x', 'xlink:href', 'ns:a:b', ':b']) {
    const r = run(JSON.stringify([{ [key]: 1 }]), 'json', [], 'xml');
    assert.ok(!new RegExp(`<(/?)${key}[ >/]`).test(r.text), `${key}: ${r.text}`);
    assert.ok(r.text.includes(`<field name="${key}">1</field>`), `${key}: ${r.text}`);
    assert.deepStrictEqual(run(r.text, 'xml', [], 'json').data, [{ [key]: '1' }]);
  }
  // An attribute name carries the same rule: `@xlink:href` wrote
  // `xlink:href="…"`, an undeclared prefix, so that file would not open either.
  // It keeps its `@` on the way, the way `@first name` already did.
  const attr = run('[{"@xlink:href":"u"}]', 'json', [], 'xml');
  assert.ok(!/xlink:href=/.test(attr.text), attr.text);
  assert.deepStrictEqual(run(attr.text, 'xml', [], 'json').data, [{ '@xlink:href': 'u' }]);
  // A prefixed name on the way *in* is still read: the reader is untouched,
  // which is what keeps a foreign document with namespaces readable.
  const read = run('<data><item><ns:v>1</ns:v></item></data>', 'xml', [], 'json');
  assert.deepStrictEqual(read.data, [{ 'ns:v': '1' }]);
});

test('a tab, newline or return in an attribute keeps its whitespace', () => {
  // XML normalizes an attribute value before a parser ever sees it: a literal
  // tab, newline or carriage return in one becomes a space (XML 1.0 3.3.3). A
  // character reference is appended as it stands, so `&#9;` is the spelling
  // that survives. Measured on the file this tool wrote: `note="a<TAB>b"` came
  // back from a real parser as `a b`, and this reader — which decodes
  // references and does not normalize — said `a\tb`, so the two disagreed about
  // the same bytes. Where this reader is more faithful than a real one, the
  // file is what lies, and the file is what the user hands to somebody else.
  for (const ch of ['\t', '\n', '\r']) {
    const value = `a${ch}b`;
    const r = run(JSON.stringify([{ '@note': value }]), 'json', [], 'xml');
    const m = r.text.match(/note="([^"]*)"/);
    assert.ok(m, r.text);
    assert.ok(!/[\t\n\r]/.test(m[1]), JSON.stringify(value) + ': ' + r.text);
    assert.deepStrictEqual(run(r.text, 'xml', [], 'json').data, [{ '@note': value }]);
  }
  // And in a carried key, where it is worse than a lost space: `{"a\nb":1,
  // "a b":2}` wrote two `name="a b"`, and the file could no longer say which
  // was which.
  const two = run('[{"a\\nb":1,"a b":2}]', 'json', [], 'xml');
  assert.strictEqual((two.text.match(/<field name="a&#10;b">/g) || []).length, 1, two.text);
  assert.ok(two.text.includes('<field name="a b">2</field>'), two.text);
  assert.deepStrictEqual(run(two.text, 'xml', [], 'json').data, [{ 'a\nb': '1', 'a b': '2' }]);
  // Element text is a different rule and stays literal: a parser keeps a tab
  // and a newline in an element's content, so escaping them there would only
  // make the file harder to read than the reader that has to read it.
  const text = run('[{"v":"a\\tb\\nc"}]', 'json', [], 'xml');
  assert.ok(text.text.includes('<v>a\tb\nc</v>'), JSON.stringify(text.text));
  assert.deepStrictEqual(run(text.text, 'xml', [], 'json').data, [{ v: 'a\tb\nc' }]);
});

test('xmlns is a declaration, so it is not written as an attribute', () => {
  // `<item xmlns="http://x"/>` carries no value: it names the default namespace
  // of the element and of everything under it, and a conforming reader reports
  // no attribute at all. `{"@xmlns":"http://x"}` therefore left a record whose
  // only field was invisible to every other tool, in a file that had also
  // re-namespaced the whole document around it.
  const r = run('[{"@xmlns":"http://x"}]', 'json', [], 'xml');
  assert.ok(!/\sxmlns=/.test(r.text), r.text);
  assert.ok(r.text.includes('<field name="@xmlns">http://x</field>'), r.text);
  assert.deepStrictEqual(run(r.text, 'xml', [], 'json').data, [{ '@xmlns': 'http://x' }]);
  // An ordinary attribute is untouched: it is still an attribute, and it is
  // still the shortest spelling for a name XML can carry.
  const ok = run('[{"@id":"7"}]', 'json', [], 'xml');
  assert.ok(ok.text.includes('<item id="7"/>'), ok.text);
  assert.deepStrictEqual(run(ok.text, 'xml', [], 'json').data, [{ '@id': '7' }]);
});

test('the root element keeps its own attributes, on every record', () => {
  // Measured against `xml.etree.ElementTree`: an attribute on a *child* has
  // been a `@`-prefixed field since attributes were read at all, and an
  // attribute on the *root* had nowhere to go — the loop over the root's content
  // only ever looked for children. So `<rss version="2.0">` came back as its
  // items with `version` gone: exit 0, empty stderr, a file that had said which
  // version of itself it was turned into one that does not know. Every form
  // below loses something without this, so every form is pinned.
  assert.deepStrictEqual(run('<a id="1"><b>1</b></a>', 'xml').data, [{ '@id': '1', b: '1' }]);
  assert.deepStrictEqual(run('<note id="1" lang="da"><body>x</body></note>', 'xml').data, [
    { '@id': '1', '@lang': 'da', body: 'x' }
  ]);
  // The one that is not a child: the root's record is a single nested object, so
  // this is the file that says `version` before the flatten runs and has nowhere
  // to say it after.
  assert.deepStrictEqual(run('<rss version="2.0"><channel><t>x</t></channel></rss>', 'xml').data, [
    { '@version': '2.0', t: 'x' }
  ]);
  // Both of the shapes T95 added, with an attribute added on top: the root's own
  // text and a root that holds nothing but its attributes.
  assert.deepStrictEqual(run('<a id="1">hello</a>', 'xml').data, [{ '@id': '1', a: 'hello' }]);
  assert.deepStrictEqual(run('<a id="1"/>', 'xml').data, [{ '@id': '1' }]);
  // On every record, not on a record of its own: an attribute on no record
  // cannot be written to CSV, joined, or seen in the playground.
  assert.deepStrictEqual(run('<data v="1"><item><a>1</a></item><item><a>2</a></item></data>', 'xml').data, [
    { '@v': '1', a: '1' },
    { '@v': '1', a: '2' }
  ]);
  assert.ok(run('<data v="1"><item><a>1</a></item></data>', 'xml', [], 'csv').text.includes('@v'));
  // A prefixed attribute name, and one spread over two lines, because a
  // namespace-prefixed name on the root is how an Atom feed names its own
  // `content` module.
  assert.deepStrictEqual(run('<feed xmlns:content="http://x/"><entry>a</entry></feed>', 'xml').data, [
    { '@xmlns:content': 'http://x/', entry: 'a' }
  ]);
  assert.deepStrictEqual(run('<a\n  id="1">\n  <b>1</b>\n</a>', 'xml').data, [{ '@id': '1', b: '1' }]);
});

test('a record keeps its own attribute when the root carries the same name', () => {
  // The record is the more specific of the two answers and the document's is the
  // one that repeats, so the record wins — and the name is on two levels of the
  // file, which is a decision this reader made and the user did not, so it is
  // said once.
  const r = run('<a id="1"><b id="2">1</b></a>', 'xml');
  assert.deepStrictEqual(r.data, [{ '@id': '2', '#text': '1' }]);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('"@id"'), r.warnings[0]);
  // Nothing to say when the two names do not meet.
  assert.deepStrictEqual(run('<a id="1"><b>1</b></a>', 'xml').warnings, []);
});

test('an XML document without root attributes reads exactly as it did', () => {
  // The rule is only about the root's own attributes, so every file without one
  // has to be byte-for-byte the answer it was: no record invented for an empty
  // root, no `@` field where the file has none, and the flatten unchanged.
  assert.deepStrictEqual(run('<a><b>1</b></a>', 'xml').data, [{ b: '1' }]);
  assert.deepStrictEqual(run('<a/>', 'xml').data, []);
  assert.deepStrictEqual(run('<data><item><a>1</a></item><item><a>2</a></item></data>', 'xml').data, [
    { a: '1' },
    { a: '2' }
  ]);
  assert.deepStrictEqual(run('<data><item><a>1</a></item></data>', 'xml').data, [{ a: '1' }]);
  assert.deepStrictEqual(run('<rss><channel><t>x</t></channel></rss>', 'xml').data, [{ t: 'x' }]);
});

test('the XML writer names the three list shapes XML cannot carry', () => {
  // Repeated elements are a complete answer for a list of several members, so
  // the ordinary case is silent — a file full of lists must not become a file
  // full of warnings.
  assert.deepStrictEqual(run('[{"v":[1,2]},{"v":[3,4]}]', 'json', [], 'xml').warnings, []);
  assert.deepStrictEqual(run('[{"v":[{"a":1},{"a":2}]}]', 'json', [], 'xml').warnings, []);
  // An empty list, a list of one and a list inside a list are the three that
  // have no shape here, and each is named with the field and how often.
  const empty = run('[{"v":[]},{"v":[]}]', 'json', [], 'xml');
  assert.strictEqual(empty.warnings.length, 1, JSON.stringify(empty.warnings));
  assert.ok(empty.warnings[0].includes('empty list') && empty.warnings[0].includes('"v" (2)'), empty.warnings[0]);
  assert.ok(empty.text.includes('<v/>'), empty.text);
  const one = run('[{"tags":["new"]}]', 'json', [], 'xml');
  assert.strictEqual(one.warnings.length, 1, JSON.stringify(one.warnings));
  assert.ok(one.warnings[0].includes('list of one') && one.warnings[0].includes('"tags" (1)'), one.warnings[0]);
  const nested = run('[{"v":[[1,2]]}]', 'json', [], 'xml');
  // Two things are true of `[[1,2]]` and both are said: the outer list has one
  // member, and that member is a list. One line that says neither would be the
  // same silence as not warning at all.
  assert.strictEqual(nested.warnings.length, 2, JSON.stringify(nested.warnings));
  assert.ok(nested.warnings.join(' ').includes('list inside a list'), nested.warnings.join(' '));
  assert.ok(nested.warnings.join(' ').includes('list of one'), nested.warnings.join(' '));
  assert.ok(nested.warnings.join(' ').includes('"v" (1)'), nested.warnings.join(' '));
  // The warning says what was written, so it has to be what was written: a
  // list inside a list keeps the numbered spelling instead of being flattened
  // into one list of two.
  assert.ok(nested.text.includes('<field name="0">1</field>'), nested.text);
  // Two fields, three shapes between them, and each is named on its own line.
  const both = run('[{"v":[],"w":[[1]]}]', 'json', [], 'xml');
  assert.strictEqual(both.warnings.length, 3, JSON.stringify(both.warnings));
  assert.ok(both.warnings.some((w) => w.includes('"v" (1)')), both.warnings.join(' '));
  assert.ok(both.warnings.filter((w) => w.includes('"w" (1)')).length === 2, both.warnings.join(' '));
  // The other four writers have no list shape to lose, so they must stay silent.
  for (const out of ['json', 'yaml', 'csv', 'table']) {
    assert.deepStrictEqual(run('[{"v":[],"w":[[1]],"t":["x"]}]', 'json', [], out).warnings, [], out);
  }
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

test('a block scalar keeps the whitespace at the end of its own lines', () => {
  // `tokenizeYAML` trims every line, which is right for a key and wrong for a
  // block scalar: in a block scalar the trailing spaces are the value, and the
  // note over the function already says so for `#`. A fixed-width column, a
  // padded shell snippet and an indented recipe all live in here. Measured with
  // PyYAML, which is the reader this one has to agree with; the old reader gave
  // the answers in the comments, at exit 0 with empty stderr.
  const cases = [
    // clip, a space on a middle line
    ['- v: |\n    a  \n    b\n', 'a  \nb\n', 'a\nb\n'],
    // strip, and a line that is nothing but one space is content, not a break
    ['- v: |-\n    a\n     \n    b\n', 'a\n \nb', 'a\n\nb'],
    // strip, trailing spaces on the last line
    ['- v: |-\n    a   \n', 'a   ', 'a'],
    // keep: the block's own breaks and no break of the writer's own
    ['- v: |+\n    a\n    b\n', 'a\nb\n', 'a\nb\n\n'],
    ['- v: |+\n    a\n    b\n\n\n', 'a\nb\n\n\n', 'a\nb\n\n\n\n'],
    // a tab is whitespace too
    ['- v: |-\n    a\t\n    b\n', 'a\t\nb', 'a\nb'],
    // folded: a space line is content, and it keeps the breaks around it
    ['- v: >\n    a\n     \n    b\n', 'a\n \nb\n', 'a b\n'],
    ['- v: >\n    a \n    b\n', 'a  b\n', 'a b\n'],
    // and a plain scalar still loses them, because YAML says it does
    ['- v: a   \n', 'a', 'a']
  ];
  for (const [text, expected, before] of cases) {
    assert.strictEqual(run(text, 'yaml').data[0].v, expected,
      `${JSON.stringify(text)} (was ${JSON.stringify(before)})`);
  }
});

test('folded scalars join lines the way prose does', () => {
  // Measured with PyYAML on this exact file: `one two\nthree`. The old reader
  // added the last `\n` for every `>` and `|`, which is what this expectation
  // used to say; the reader now asks PyYAML instead of guessing.
  const r = run('text: >\n  one\n  two\n\n  three', 'yaml');
  assert.strictEqual(r.data[0].text, 'one two\nthree');
  // And with the break there, it is kept: the empty line spends the break of
  // the run it is in, and the file's own last break is the value's.
  const withBreak = run('text: >\n  one\n  two\n\n  three\n', 'yaml');
  assert.strictEqual(withBreak.data[0].text, 'one two\nthree\n');
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

t('XML: a CDATA section beside text keeps its own text', () => {
  // The section *is* text, and it is text wherever it stands. The previous fix
  // made a reader for it that only spoke when the content was nothing but
  // sections, so a section beside text fell to the other reader — and the two
  // answered differently about the same file:
  //
  //   `<a>pre<![CDATA[<b>]]>post</a>` → `prepost`  (the section's `<b>` gone)
  //   `<a><![CDATA[x]]>hello</a>`      → `hello`   (the section's `x` gone)
  //   `<i>a<![CDATA[x]]>b</i>`          → `a<![CDATA[x]]>b` (the markers as text)
  //
  // All three are silent: exit 0, no warning, a value the file never held. The
  // first two are the worst class in this reader — data removed in silence — and
  // they came out of the fix for that same class, one iteration earlier.
  // `xml.etree.ElementTree` reads them as `pre<b>post`, `xhello` and `axb`.
  for (const [text, expected] of [
    ['<a>pre<![CDATA[<b>]]>post</a>', [{ a: 'pre<b>post' }]],
    ['<a><![CDATA[x]]>hello</a>', [{ a: 'xhello' }]],
    ['<a>hello<![CDATA[x]]></a>', [{ a: 'hellox' }]],
    ['<a>a<![CDATA[x]]>b</a>', [{ a: 'axb' }]],
    ['<a>a <![CDATA[x]]> b</a>', [{ a: 'a x b' }]],
    ['<r><i>a<![CDATA[x]]>b</i></r>', [{ i: 'axb' }]],
    ['<r><i><![CDATA[<b>bold</b>]]></i></r>', [{ i: '<b>bold</b>' }]],
    // a space between two sections is layout, not a space in the value
    ['<a><![CDATA[a]]> <![CDATA[b]]></a>', [{ a: 'ab' }]],
    // and the section's own text is neither trimmed nor decoded
    ['<a><![CDATA[ a ]]></a>', [{ a: ' a ' }]],
    ['<a><![CDATA[a &amp; b]]></a>', [{ a: 'a &amp; b' }]],
  ]) {
    const r = run(text, 'xml', [], 'json');
    if (r.error) throw new Error(text + ': ' + r.error);
    assert.deepStrictEqual(r.data, expected, text);
  }
  // An unterminated section is named in a child too, not only at the root: it
  // would otherwise spell its own opening marker into a value.
  const open = run('<r><i><b>1</b><![CDATA[x</i></r>', 'xml', [], 'json');
  assert.ok(open.error && /CDATA section is never closed/.test(open.error), open.error);
  assert.strictEqual(open.data, undefined);
});

t('XML: 25 files read against ElementTree, and 11 CDATA and root-text answers', () => {
  // The XML reader had been measured by hand in nine iterations and never by a
  // table. Every line below is a measured answer: the input is one of the shapes
  // a real export writes, and the expected value is what `xml.etree.ElementTree`
  // says about the same file. All 25 files are well-formed — the judge reads
  // every one of them — so a refusal here is not a malformed input being caught
  // but a valid one thrown away, which is the one class that means the tool does
  // not work for the person who wrote the file. Three of them were: a CDATA
  // section was markup to the reader, and so was the root element's own text.

  // --- CDATA, which is text, in every place it stands ---------------------
  // a section holding a value
  assert.deepStrictEqual(run('<r><i><![CDATA[one]]></i></r>', 'xml', [], 'json').data, [{ i: 'one' }]);
  // a section holding what looks like markup: the text is "<b>", not an element
  assert.deepStrictEqual(run('<a><![CDATA[<b>]]></a>', 'xml', [], 'json').data, [{ a: '<b>' }]);
  // a section holding what looks like a close tag
  assert.deepStrictEqual(run('<a><![CDATA[</a>]]></a>', 'xml', [], 'json').data, [{ a: '</a>' }]);
  // an empty section is the empty string
  assert.deepStrictEqual(run('<a><![CDATA[]]></a>', 'xml', [], 'json').data, [{ a: '' }]);
  // two sections are one text: a writer that wraps a long value uses one per line
  assert.deepStrictEqual(run('<a><![CDATA[a]]><![CDATA[b]]></a>', 'xml', [], 'json').data, [{ a: 'ab' }]);
  // an entity in a section is data: nothing in a section is decoded, which is
  // the one thing that separates it from every other text in the file
  assert.deepStrictEqual(run('<a><![CDATA[a &amp; b]]></a>', 'xml', [], 'json').data, [{ a: 'a &amp; b' }]);
  // whitespace around a section is the file's indentation, not its value
  assert.deepStrictEqual(run('<a>\n  <![CDATA[x]]>\n</a>', 'xml', [], 'json').data, [{ a: 'x' }]);
  // a section beside an attribute hangs the text on the attribute's record
  assert.deepStrictEqual(run('<r><i v="1"><![CDATA[x]]></i></r>', 'xml', [], 'json').data, [{ '@v': '1', '#text': 'x' }]);
  // a section inside a record that flattens to rows
  assert.deepStrictEqual(
    run('<data><item><d><![CDATA[x]]></d><n>1</n></item><item><d><![CDATA[y]]></d><n>2</n></item></data>', 'xml', [], 'json').data,
    [{ d: 'x', n: '1' }, { d: 'y', n: '2' }]
  );
  // a list of sections: the shape an RSS feed and a SOAP response write
  assert.deepStrictEqual(run('<r><i><![CDATA[one]]></i><i><![CDATA[two]]></i></r>', 'xml', [], 'json').data, [{ i: 'one' }, { i: 'two' }]);
  // a section that is never closed is a file the reader cannot read. It used to
  // be read as the text "<![CDATA[x", which is a value the file never held.
  const unterminated = run('<a><![CDATA[x</a>', 'xml', [], 'json');
  assert.ok(unterminated.error, 'an unclosed CDATA section must be named, not read as text');
  assert.ok(/CDATA section is never closed/.test(unterminated.error), unterminated.error);

  // --- the root element's own text ---------------------------------------
  // the root's text was never read, because the loop over it only looked for
  // children. `<a>hello</a>` is a whole document and was refused with exit 3.
  assert.deepStrictEqual(run('<a>hello</a>', 'xml', [], 'json').data, [{ a: 'hello' }]);
  // an entity in it is decoded, as it is everywhere else in the file
  assert.deepStrictEqual(run('<a>a &amp; b</a>', 'xml', [], 'json').data, [{ a: 'a & b' }]);
  // Text beside markup. It was refused with exit 3 whatever the text was, which
  // is T68's class — a well-formed file this reader cannot open. The three
  // answers were weighed: `#content` as `xmltodict` writes it (a list of the
  // runs and the elements) round-trips through this tool's own writer only
  // because `#content` is not a legal XML name, so the writer sends it out as
  // three `<field name="#content">` siblings and the child element is gone from
  // the file; a refusal keeps the class; and `#text` is the field this reader
  // already gives an element that has text beside an attribute
  // (`<b id="2">1</b>` → `{'@id':'2','#text':'1'}`) and the field the writer
  // already writes back. So the text rides on the record as `#text`, and the one
  // thing that costs — the order between text and elements — is named once.
  for (const [mixed, expected] of [
    ['<a>hello<b>1</b></a>', [{ b: '1', '#text': 'hello' }]],
    ['<r><i>1</i>tail<i>2</i></r>', [{ i: '1', '#text': 'tail' }, { i: '2', '#text': 'tail' }]],
    ['<r>lead<i>1</i><i>2</i></r>', [{ i: '1', '#text': 'lead' }, { i: '2', '#text': 'lead' }]],
    ['<a>1<b>2</b>3<c>4</c>5</a>', [{ b: '2', '#text': '135' }, { c: '4', '#text': '135' }]],
    ['<p>Some <b>bold</b> and <i>italic</i>.</p>', [{ b: 'bold', '#text': 'Some  and .' }, { i: 'italic', '#text': 'Some  and .' }]],
  ]) {
    const r = run(mixed, 'xml', [], 'json');
    if (r.error) throw new Error(mixed + ': ' + r.error);
    assert.ok(r.warnings.some((w) => /text beside markup/.test(w) && /order between the text/.test(w)),
      'the loss must be named: ' + mixed + ' → ' + JSON.stringify(r.warnings));
    assert.deepStrictEqual(r.data, expected, mixed);
  }
  // An element whose only text is layout is not mixed content and is not named:
  // `<a> <b>1</b> </a>` is an indented element, and it read as `{b: '1'}` before
  // this and must keep reading that way, silently.
  const indented = run('<a> <b>1</b> </a>', 'xml', [], 'json');
  assert.deepStrictEqual(indented.data, [{ b: '1' }]);
  assert.deepStrictEqual(indented.warnings, [], 'layout is not a loss to report');

  // --- 24 files that must not move --------------------------------------
  // A repeated element is a list. These are the shapes measured alongside the
  // CDATA files, all of them well-formed, and none of them is a CDATA section or
  // a root's own text — so nothing here may change because of this fix. A
  // repeated element is one value until it is two, and the row shape at the root
  // is one row per child: `<tags><tag>a</tag><tag>b</tag></tags>` is two records
  // of one column, while the same tag repeated inside a record is a list on that
  // record. The last one is the pairing that says which of the two it is.
  const files = [
    ['<rss><channel><title>Nyheder</title>\n<item><title>Første</title><link>https://a.example/1</link></item>\n<item><title>Anden</title><link>https://a.example/2</link></item>\n</channel></rss>',
      [{ title: 'Nyheder', item: [{ title: 'Første', link: 'https://a.example/1' }, { title: 'Anden', link: 'https://a.example/2' }] }]],
    ['<urlset><url><loc>https://a.example/</loc><lastmod>2026-09-01</lastmod></url><url><loc>https://a.example/da/</loc><lastmod>2026-09-02</lastmod></url></urlset>',
      [{ loc: 'https://a.example/', lastmod: '2026-09-01' }, { loc: 'https://a.example/da/', lastmod: '2026-09-02' }]],
    ['<tags><tag>alpha</tag><tag>beta</tag><tag>gamma</tag></tags>', [{ tag: 'alpha' }, { tag: 'beta' }, { tag: 'gamma' }]],
    ['<r><i id="1"/><i id="2"/></r>', [{ '@id': '1' }, { '@id': '2' }]],
    ['<r><i><j>1</j><j>2</j></i><i><j>3</j></i></r>', [{ j: ['1', '2'] }, { j: '3' }]],
    ['<r><a>1</a><b>x</b><b>y</b></r>', [{ a: '1' }, { b: 'x' }, { b: 'y' }]],
    ['<r><i/><i/></r>', [{}, {}]],
    ['<r><i v="1">a</i><i v="2">b</i></r>', [{ '@v': '1', '#text': 'a' }, { '@v': '2', '#text': 'b' }]],
    ['<data><item><name>x</name><tag>t1</tag><tag>t2</tag></item><item><name>y</name><tag>t3</tag></item></data>',
      [{ name: 'x', tag: ['t1', 't2'] }, { name: 'y', tag: 't3' }]],
    ['<r><i>1</i></r>', [{ i: '1' }]],
    ['<r><a>1</a><a>2</a><b>x</b><b>y</b></r>', [{ a: '1' }, { a: '2' }, { b: 'x' }, { b: 'y' }]],
    ['<a><b><c>1</c><c>2</c></b><b><c>3</c></b></a>', [{ c: ['1', '2'] }, { c: '3' }]],
    ['<r>\n  <i>1</i>\n  <i>2</i>\n</r>', [{ i: '1' }, { i: '2' }]],
    ['<a><b id="1"><c>1</c><c>2</c></b><b id="2"><c>3</c></b></a>', [{ '@id': '1', c: ['1', '2'] }, { '@id': '2', c: '3' }]],
    ['<rows><row><a>1</a><a>2</a></row><row><a>3</a></row></rows>', [{ a: ['1', '2'] }, { a: '3' }]],
    ['<r><a>1</a><b>x</b></r>', [{ a: '1' }, { b: 'x' }]],
    // The root's own `xmlns:ns` is an attribute like any other and is now on both
    // records, the same rule that has always held for an attribute on a child.
    // `ElementTree` reports a namespace in the *tag* name instead of in
    // `attrib`, so this is a thing the file really says and not one this reader
    // made up.
    ['<r xmlns:ns="urn:x"><ns:i>1</ns:i><ns:i>2</ns:i></r>', [{ '@xmlns:ns': 'urn:x', 'ns:i': '1' }, { '@xmlns:ns': 'urn:x', 'ns:i': '2' }]],
    ['<r><i><a>1</a><a>2</a></i><i><a>3</a><a>4</a></i><i><a>5</a></i></r>',
      [{ a: ['1', '2'] }, { a: ['3', '4'] }, { a: '5' }]],
    ['<r><i name="attr">text</i><i name="attr2">text2</i></r>', [{ '@name': 'attr', '#text': 'text' }, { '@name': 'attr2', '#text': 'text2' }]],
    ['<r><i><j>1</j></i><i><j>2</j><j>3</j></i></r>', [{ j: '1' }, { j: ['2', '3'] }]],
    ['<r><i>1</i><!-- note --><i>2</i></r>', [{ i: '1' }, { i: '2' }]],
  ];
  for (const [text, expected] of files) {
    const r = run(text, 'xml', [], 'json');
    if (r.error) throw new Error(`${text.slice(0, 40)}: ${r.error}`);
    assert.deepStrictEqual(r.data, expected, text.slice(0, 60));
  }

  // A value read out of a section survives the writer and reads back the same.
  // The writer escapes it, so the round trip is lossless without writing a
  // section — a value that needs one is a value with markup in it, and that is
  // the writer's own rule, not a promise about sections.
  const fromSection = run('<r><i><![CDATA[<b>bold</b>]]></i></r>', 'xml', [], 'json');
  assert.deepStrictEqual(fromSection.data, [{ i: '<b>bold</b>' }]);
  const written = run(JSON.stringify(fromSection.data), 'json', [], 'xml');
  if (written.error) throw new Error(written.error);
  assert.deepStrictEqual(run(written.text, 'xml', [], 'json').data, fromSection.data, written.text);
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



// ─── Pipeline validation ───────────────────────────────────────────────
const { validatePipeline } = require('../src/engine.js');

/** Run and insist on the refusal, with the op and the parameter named. */
function refuse(pipeline, op, param) {
  const r = runSQL('[{"id":1,"name":"Alice","age":30},{"id":2,"name":"Bob","age":25}]', 'json', pipeline, 'json');
  if (!r.error) throw new Error(`no error: ${JSON.stringify(r.text)}`);
  if (r.usage !== true) throw new Error('not flagged as a usage error');
  if (!r.error.includes(op)) throw new Error(`${r.error} does not name ${op}`);
  if (param && !r.error.includes(param)) throw new Error(`${r.error} does not name ${param}`);
}

t('an operation that cannot do its job without a parameter says so', () => {
  // Each of these used to run and answer with something else: `filter` with no
  // `expr` kept every row, `pick` with no `fields` returned `{}` for every
  // record, `join` with an empty `with` dropped every row. All of it with exit
  // 0, an empty stderr, and a file on disk the user did not ask for.
  for (const [op, param] of [
    ['filter', 'expr'], ['map', 'expr'], ['pick', 'fields'], ['omit', 'fields'],
    ['sort', 'by'], ['group', 'by'], ['rename', 'mapping'], ['flatten', 'field'],
    ['add', 'fields'], ['join', 'with'], ['join', 'on']
  ]) {
    refuse([{ op }], op, param);
  }
});

t('pick with no fields no longer deletes every field in the file', () => {
  // The worst of them: `pick` reads its field list as `[undefined]`, matches
  // nothing, and writes an empty object per row. The whole file, gone.
  const r = runSQL('[{"id":1,"name":"Alice"}]', 'json', [{ op: 'pick' }], 'csv');
  if (!r.error) throw new Error('no error, and the record was emptied');
  if (r.text !== undefined) throw new Error('text was produced anyway');
});

t('a parameter of the wrong type is refused and the value is quoted back', () => {
  for (const [pipeline, op, param, got] of [
    [[{ op: 'head', n: '5' }], 'head', 'n', '"5"'],
    [[{ op: 'tail', n: -1 }], 'tail', 'n', '-1'],
    [[{ op: 'sort', by: 42 }], 'sort', 'by', '42'],
    [[{ op: 'pick', fields: 'a', }, { op: 'omit', fields: { a: 1 } }], 'omit', 'fields', '{"a":1}'],
    [[{ op: 'join', with: 'nope', on: 'id' }], 'join', 'with', '"nope"']
  ]) {
    refuse(pipeline, op, param);
    const r = runSQL('[{"id":1}]', 'json', pipeline, 'json');
    if (!r.error.includes(got)) throw new Error(`${r.error} does not show the value it got (${got})`);
  }
});

t('an expression that is empty is a mistake, not an identity', () => {
  // An unset shell variable lands here: `--pipe '[{"op":"filter","expr":"'"$X"'"}]'`
  // with X empty used to keep every row and exit 0.
  refuse([{ op: 'filter', expr: '' }], 'filter', 'expr');
  refuse([{ op: 'map', expr: '   ' }], 'map', 'expr');
});

t('an inherited method is not an operation', () => {
  // `operations.toString` exists on every object. The lookup used to find it and
  // run `Object.prototype.toString` as a transformation, which answered
  // "[object Object]" for the whole file.
  refuse([{ op: 'toString' }], 'toString');
  refuse([{ op: 'constructor' }], 'constructor');
});

t('the message points at the step that is wrong, not the first one', () => {
  const r = runSQL('[{"id":1,"name":"Alice"}]', 'json', [
    { op: 'pick', fields: 'id' },
    { op: 'head', n: 1 },
    { op: 'group' }
  ], 'json');
  if (!r.error.includes('step 3')) throw new Error(r.error);
  if (!r.error.includes('group')) throw new Error(r.error);
});

t('a bad pipeline is refused before the input is even read', () => {
  // The order matters: a step the user mistyped should not be reported as a
  // file problem, and it should not read the file at all.
  const r = runSQL('this is not json at all', 'json', [{ op: 'filter' }], 'json');
  if (!r.error.includes('filter')) throw new Error(r.error);
});

t('optional parameters keep their documented defaults', () => {
  // `unique` without `by` drops fully identical records; `head` and `tail`
  // without `n` take 10. A validator that demanded every key would break all
  // three, so they are checked only when they are given.
  const rows = Array.from({ length: 12 }, (_, i) => `{"i":${i}}`).join(',');
  assert.strictEqual(runSQL(`[${rows}]`, 'json', [{ op: 'head' }], 'json').data.length, 10);
  assert.strictEqual(runSQL(`[${rows}]`, 'json', [{ op: 'tail' }], 'json').data.length, 10);
  assert.strictEqual(runSQL(`[${rows}]`, 'json', [{ op: 'tail', n: 2 }], 'json').data[0].i, 10);
  const dupes = runSQL('[{"a":1},{"a":1},{"a":2}]', 'json', [{ op: 'unique' }], 'json');
  if (dupes.error) throw new Error(dupes.error);
  assert.strictEqual(dupes.data.length, 2);
});

t('an empty field list or mapping is a deliberate no-op and stays legal', () => {
  // `pick` with `[]` yields empty objects and `rename` with `{}` changes
  // nothing. Neither can do damage the user did not ask for, so neither is
  // refused — only a *missing* key is a mistake.
  for (const step of [{ op: 'pick', fields: [] }, { op: 'rename', mapping: {} }, { op: 'add', fields: {} }]) {
    const r = runSQL('[{"id":1}]', 'json', [step], 'json');
    if (r.error) throw new Error(`${step.op}: ${r.error}`);
  }
});

t('an explicit identity expression is still legal', () => {
  const r = runSQL('[{"a":1}]', 'json', [{ op: 'filter', expr: 'item' }], 'json');
  if (r.error) throw new Error(r.error);
  assert.strictEqual(r.data.length, 1);
});

t('validatePipeline hands back the pipeline it was given', () => {
  const pipeline = [{ op: 'filter', expr: 'item.a' }, { op: 'sort', by: 'a' }];
  assert.strictEqual(validatePipeline(pipeline), pipeline);
});

t('a pipeline that is not an array is refused, not run', () => {
  for (const bad of [{ op: 'head' }, 'head', null, 42]) {
    try {
      validatePipeline(bad);
      throw new Error(`accepted ${JSON.stringify(bad)}`);
    } catch (err) {
      if (err.usage !== true) throw new Error(`${JSON.stringify(bad)}: not a usage error`);
    }
  }
  for (const bad of [[null], ['head'], [['op', 'head']], [{ n: 1 }]]) {
    try {
      validatePipeline(bad);
      throw new Error(`accepted ${JSON.stringify(bad)}`);
    } catch (err) {
      if (err.usage !== true) throw new Error(`${JSON.stringify(bad)}: not a usage error`);
    }
  }
});

t('tail of zero rows is zero rows', () => {
  // `data.slice(-0)` is `data.slice(0)`, so the last zero rows came back as all
  // of them. A file with twelve rows and `tail 0` produced a twelve row export.
  const rows = Array.from({ length: 12 }, (_, i) => `{"i":${i}}`).join(',');
  for (const op of ['head', 'tail']) {
    const r = runSQL(`[${rows}]`, 'json', [{ op, n: 0 }], 'json');
    if (r.error) throw new Error(r.error);
    if (r.data.length !== 0) throw new Error(`${op} 0 gave ${r.data.length} rows`);
    if (r.text.trim() !== '[]') throw new Error(`${op} 0 wrote: ${r.text}`);
  }
});

// ─── Fields a step names ───────────────────────────────────────────────

/** Run, insist it succeeded, and hand back the warnings it said. */
function warningsFor(pipeline, input = '[{"id":1,"name":"Ada","age":36},{"id":2,"name":"Bob","age":41},{"id":3,"name":"Cyd","age":29}]') {
  const r = runSQL(input, 'json', pipeline, 'json');
  if (r.error) throw new Error(r.error);
  return r.warnings;
}

t('a field no record has is named, and what the step did about it', () => {
  // Every one of these ran and answered the typo with something else. `unique`
  // compared `undefined` to `undefined`, called all three rows identical and
  // wrote one of them; `sort` sorted nothing; `group` put everything in
  // "(null)"; `pick` dropped the field; `rename` renamed nothing. Exit 0, empty
  // stderr, and a file that says the opposite of what was asked.
  const cases = [
    [[{ op: 'unique', by: 'ag' }], 'unique', 'ag', '1 of 3 rows survived'],
    [[{ op: 'sort', by: 'ag' }], 'sort', 'ag', 'not sorted'],
    [[{ op: 'pick', fields: ['name', 'emial'] }], 'pick', 'emial', 'no output'],
    [[{ op: 'omit', fields: 'emial' }], 'omit', 'emial', 'nothing was removed'],
    [[{ op: 'group', by: 'contry' }], 'group', 'contry', '(null)'],
    [[{ op: 'rename', mapping: { emial: 'email' } }], 'rename', 'emial', 'not renamed to "email"'],
    [[{ op: 'flatten', field: 'itemz' }], 'flatten', 'itemz', 'no row was expanded'],
    [[{ op: 'join', with: [{ id: 2 }], on: 'idd' }], 'join', 'idd', 'every row was dropped']
  ];
  for (const [pipeline, op, field, effect] of cases) {
    const warnings = warningsFor(pipeline);
    if (warnings.length !== 1) throw new Error(`${op}: ${warnings.length} warnings, want 1: ${JSON.stringify(warnings)}`);
    const w = warnings[0];
    if (!w.startsWith(`${op}: `)) throw new Error(`${op}: warning does not start with the step: ${w}`);
    if (!w.includes(`"${field}"`)) throw new Error(`${op}: warning does not name the field: ${w}`);
    if (!w.includes(effect)) throw new Error(`${op}: warning does not say what happened: ${w}`);
  }
});

t('the result of a mistyped field is still a result, not an error', () => {
  // A pipeline that names a field a file does not have is not a broken
  // pipeline: the same script may be meant for many files. The run succeeds and
  // writes what the step did, and the warning is the news.
  const r = runSQL('[{"name":"Ada"},{"name":"Bob"}]', 'json', [{ op: 'unique', by: 'ag' }], 'csv');
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.data.length, 1);
  assert.strictEqual(r.warnings.length, 1);
});

t('a field some records have is not a field no record has', () => {
  // Heterogeneous data is the normal shape of a left join with no match, an API
  // that adds a key, and `pick` itself. A warning for every one of them would
  // train the user to ignore the warning that matters.
  const het = '[{"name":"Ada","email":"a@x.dk"},{"name":"Bob"},{"name":"Cyd","email":"c@x.dk"}]';
  for (const pipeline of [
    [{ op: 'pick', fields: ['name', 'email'] }],
    [{ op: 'omit', fields: 'email' }],
    [{ op: 'sort', by: 'email' }],
    [{ op: 'group', by: 'email' }],
    [{ op: 'unique', by: 'email' }],
    [{ op: 'rename', mapping: { email: 'mail' } }],
    [{ op: 'flatten', field: 'email' }]
  ]) {
    assert.deepStrictEqual(warningsFor(pipeline, het), [], `${pipeline[0].op} warned about a field two rows have`);
  }
});

t('a field an earlier step created is not missing', () => {
  // The check runs against the data as it is at each step, so `add` before
  // `sort`, and `map` before `pick`, are the pipelines people actually write.
  assert.deepStrictEqual(warningsFor([
    { op: 'add', fields: { older: 'item.age > 35' } },
    { op: 'sort', by: 'older' }
  ]), []);
  assert.deepStrictEqual(warningsFor([
    { op: 'map', expr: '({who: item.name, years: item.age})' },
    { op: 'pick', fields: ['who', 'years'] }
  ]), []);
  // And a field an earlier step removed is gone, so naming it later is a real
  // mistake and not a leftover from the file.
  assert.strictEqual(warningsFor([
    { op: 'rename', mapping: { age: 'years' } },
    { op: 'sort', by: 'age' }
  ]).length, 1);
});

t('a pipeline over fields that all exist says nothing at all', () => {
  assert.deepStrictEqual(warningsFor([
    { op: 'filter', expr: 'item.age > 30' },
    { op: 'sort', by: 'age', dir: 'desc' },
    { op: 'unique', by: 'name' },
    { op: 'rename', mapping: { age: 'years' } },
    { op: 'pick', fields: ['name', 'years'] },
    { op: 'omit', fields: 'name' }
  ]), []);
});

t('sorting on a field no row has leaves the rows in their original order', () => {
  // The comparator answered `1` for every pair of rows that both lacked the
  // field, which is not an order a sort is allowed to be given: a comparator
  // that claims a < b and b < a at once leaves the engine free to return any
  // order it likes. It happened to leave them alone here, and nothing promised
  // that. The warning is what the user gets either way.
  const r = runSQL('[{"n":3},{"n":1},{"n":2}]', 'json', [{ op: 'sort', by: 'missing' }], 'json');
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.data.map(x => x.n), [3, 1, 2]);
  assert.strictEqual(r.warnings.length, 1);
});

t('a field only the right side of a join has is not reported as missing', () => {
  // `on` is named on both sides. The right-hand records live in `with`, so a
  // field only they have cannot be reported as a field no record has — it is a
  // join that can never match, which is a different mistake to make.
  const rows = '[{"id":1},{"id":2}]';
  assert.strictEqual(warningsFor([{ op: 'join', with: [{ id: 2, c: 'DK' }], on: 'id' }], rows).length, 0);
  // Neither side having it is the mistake worth naming.
  assert.strictEqual(warningsFor([{ op: 'join', with: [{ id: 2, c: 'DK' }], on: 'idd' }], rows).length, 1);
});

t('rows that are not records are not fields nobody has', () => {
  // A step over values has no fields to miss, and a step that cannot read a
  // row says which row it could not read. The check must not pile a second,
  // vaguer complaint on top of that error.
  const r = runSQL('[1,2,3]', 'json', [{ op: 'sort', by: 'n' }], 'json');
  assert.deepStrictEqual(r.warnings, []);
  assert.ok(/row 1 is a number \(1\)/.test(r.error), r.error);
});

t('a step that names a field refuses a row that is not a record', () => {
  // The data-shaped twin of the missing-parameter check. After a `map` that
  // yields strings, six of the eight steps that name a field answered with
  // something other than what they did: `omit` and `rename` built columns
  // `0 1 2 3` holding `A d a`, data no file contained; `add` spread a number
  // into `{}` and lost it; `group` put every row in `(null)`; `unique` compared
  // `undefined` with `undefined` and deleted all but one row; `join` dropped
  // every row and wrote an empty file. Exit 0, empty stderr, every time.
  const steps = [
    { op: 'pick', fields: ['name'] },
    { op: 'omit', fields: 'name' },
    { op: 'rename', mapping: { name: 'n' } },
    { op: 'add', fields: { x: '1' } },
    { op: 'sort', by: 'name' },
    { op: 'group', by: 'name' },
    { op: 'unique', by: 'name' },
    { op: 'flatten', field: 'items' },
    { op: 'join', with: [{ name: 'Ada' }], on: 'name' }
  ];
  for (const step of steps) {
    const r = runSQL('[{"name":"Ada"},{"name":"Bob"}]', 'json',
      [{ op: 'map', expr: 'item.name' }, step], 'json');
    assert.ok(r.error, `${step.op} answered a string row with ${JSON.stringify(r.data)}`);
    assert.ok(
      r.error.includes(`(Pipeline step 2 (${step.op})` ) || r.error.startsWith(`Pipeline step 2 (${step.op})`),
      `${step.op}: ${r.error}`
    );
    assert.ok(/row 1 is a string \("Ada"\)/.test(r.error), `${step.op}: ${r.error}`);
    // Data, not a bad command: the pipeline is right for a file of records.
    assert.strictEqual(r.usage, false, step.op);
    assert.strictEqual(r.text, undefined, step.op);
  }
});

t('a row that is not a record is named by its number, not just its kind', () => {
  const r = runSQL('[{"n":1},{"n":2},{"n":3}]', 'json',
    [{ op: 'map', expr: 'item.n === 2 ? "two" : ({ name: item.n })' }, { op: 'pick', fields: ['name'] }], 'json');
  assert.ok(/row 2 is a string \("two"\)/.test(r.error), r.error);
});

t('the other shapes a row can have are named too', () => {
  const shapes = [
    ['[1,2]', 'a number (1)'],
    ['[true,false]', 'a boolean (true)'],
    ['[null]', 'null'],
    ['[[1,2]]', 'an array']
  ];
  for (const [input, described] of shapes) {
    const r = runSQL(input, 'json', [{ op: 'pick', fields: ['name'] }], 'json');
    assert.ok(r.error.includes(`row 1 is ${described}`), `${input}: ${r.error}`);
  }
});

t('steps that need no field still work on rows that are not records', () => {
  // The other half of the rule. `count`, `head`, `tail`, `filter`, `map` and a
  // `unique` without `by` compare or count rows, not fields, and a `map` that
  // reshapes rows into values is how a value-shaped tool gets its rows in the
  // first place. Failing them too would make the guard a new silent loss: the
  // step that produced the strings would be the only one allowed to see them.
  const input = '[{"name":"Ada"},{"name":"Bob"},{"name":"Ada"}]';
  const asNames = [{ op: 'map', expr: 'item.name' }];
  for (const [label, pipeline, expected] of [
    ['count', [...asNames, { op: 'count' }], 3],
    ['head', [...asNames, { op: 'head', n: 2 }], 2],
    ['tail', [...asNames, { op: 'tail', n: 1 }], 1],
    ['filter', [...asNames, { op: 'filter', expr: 'item === "Ada"' }], 2],
    ['unique', [...asNames, { op: 'unique' }], 2],
    ['map', [...asNames, { op: 'map', expr: 'item.length' }], 3]
  ]) {
    const r = runSQL(input, 'json', pipeline, 'json');
    assert.strictEqual(r.error, undefined, `${label}: ${r.error}`);
    const rows = label === 'count' ? r.data[0].count : r.data.length;
    assert.strictEqual(rows, expected, label);
  }
  // A `unique` with no `by` on identical strings is the one case where two rows
  // really are the same, so it may drop one — that is what it is for.
  const u = runSQL(input, 'json', [...asNames, { op: 'unique' }], 'json');
  assert.deepStrictEqual(u.data, ['Ada', 'Bob']);
});

t('the guard looks at the row, not at what is inside it', () => {
  // A record whose values are null, an empty object, an array or a key called
  // `__proto__` is still a record, and the steps that name fields keep working
  // on it. What the guard refuses is the row's own shape.
  const r = runSQL('[{"a":null},{"a":{}},{"a":[1]},{"__proto__":1}]', 'json',
    [{ op: 'group', by: 'a' }, { op: 'pick', fields: ['key', 'count', 'items'] }], 'json');
  assert.strictEqual(r.error, undefined, r.error);
  // Three keys: two rows have no `a` and share "(null)", and the two objects
  // and the array are their own keys, because `group` compares them by identity.
  assert.deepStrictEqual(r.data.map(g => g.count), [2, 1, 1]);
});

t('XML output is well-formed for a fixture of values XML 1.0 cannot hold', () => {
  // The whole `Char` production, written out, so this covers what XML 1.0
  // allows and not what a particular control character happens to be. Written
  // raw, every one of these produced a file that declared `version="1.0"` and
  // that Expat refused as `not well-formed (invalid token)`, with exit 0 and
  // an empty stderr — and this tool's own reader read it back happily, so a
  // round trip through Transmute hid it completely.
  const C = (n) => String.fromCharCode(n);
  const input = JSON.stringify([
    { ok: 'café 日本 🚀', tab: 'a' + C(9) + 'b', nl: 'a' + C(10) + 'b', cr: 'a' + C(13) + 'b' },
    { nul: 'a' + C(0) + 'b', bel: 'a' + C(7) + 'b', vt: 'a' + C(11) + 'b', ff: 'a' + C(12) + 'b' },
    { esc: 'a' + C(27) + 'b', us: 'a' + C(31) + 'b', fffe: 'a' + C(0xfffe) + 'b', ffff: 'a' + C(0xffff) + 'b' },
    { plane2: 'a' + String.fromCodePoint(0x1f600) + 'b', high: 'a' + String.fromCodePoint(0x10ffff) + 'b' }
  ]);

  // Row 1 is representable, so it is written and read back unchanged.
  const ok = runSQL(JSON.stringify([JSON.parse(input)[0]]), 'json', [], 'xml');
  if (ok.error) throw new Error(ok.error);
  assert.deepStrictEqual(runSQL(ok.text, 'xml', [], 'json').data, [JSON.parse(input)[0]]);

  // Every unrepresentable value refuses, and each one says which character and
  // where it is — the difference between a user who can act and one who cannot.
  const rows = JSON.parse(input);
  const unrepresentable = [
    ['nul', rows[1].nul], ['bel', rows[1].bel], ['vt', rows[1].vt], ['ff', rows[1].ff],
    ['esc', rows[2].esc], ['us', rows[2].us], ['fffe', rows[2].fffe], ['ffff', rows[2].ffff]
  ];
  for (const [field, value] of unrepresentable) {
    const expected = describeCodePoint(value);
    const r = runSQL(JSON.stringify([{ [field]: value }]), 'json', [], 'xml');
    assert.ok(r.error, `${field} must be refused, got: ${r.text}`);
    assert.ok(r.error.includes(expected), `${field}: expected ${expected} in: ${r.error}`);
    assert.ok(r.error.includes(`field "${field}"`), `${field}: message must name the field: ${r.error}`);
    // Nothing is written, and the refusal is the data's, not the pipeline's, so
    // the CLI reports it as a transformation failure and not as a usage error.
    assert.strictEqual(r.text, undefined);
    assert.strictEqual(r.usage, false);
  }
});

function describeCodePoint(str) {
  const cp = str.codePointAt(1);
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

t('a lone surrogate is refused too, and a real pair is not', () => {
  // A JSON string may hold half a surrogate pair; the writer replaced it with
  // U+FFFD on the way out, which is silent data loss. A *complete* pair is one
  // character above #xFFFF and is perfectly legal, so the two must not be
  // confused — `for...of` is what tells them apart.
  const lone = runSQL('[{"a":"pre\\ud800post"}]', 'json', [], 'xml');
  assert.ok(lone.error, 'a lone surrogate must be refused');
  assert.ok(lone.error.includes('U+D800'), lone.error);
  assert.ok(lone.error.includes('surrogate pair'), lone.error);

  const pair = runSQL(JSON.stringify([{ a: 'pre\u{1f600}post' }]), 'json', [], 'xml');
  if (pair.error) throw new Error(pair.error);
  assert.ok(pair.text.includes('\u{1f600}'), pair.text);
  assert.deepStrictEqual(runSQL(pair.text, 'xml', [], 'json').data, [{ a: 'pre\u{1f600}post' }]);
});

t('an unrepresentable character is found in a field name and in an attribute', () => {
  const C = (n) => String.fromCharCode(n);
  // A key that is not a legal tag name travels in a `name` attribute, which is
  // text like any other, and an `@key` is written as an attribute value. Both
  // are places a control character can land, so both are checked.
  const inName = runSQL(JSON.stringify([{ ['bad' + C(0) + 'name']: 'x' }]), 'json', [], 'xml');
  assert.ok(inName.error, 'a control character in a field name must be refused');
  assert.ok(inName.error.includes('U+0000'), inName.error);

  const inAttr = runSQL(JSON.stringify([{ meta: { '@label': 'bad' + C(7) + 'label' } }]), 'json', [], 'xml');
  assert.ok(inAttr.error, 'a control character in an attribute must be refused');
  assert.ok(inAttr.error.includes('U+0007'), inAttr.error);
  assert.ok(inAttr.error.includes('"@label"'), inAttr.error);

  // Deep inside, with the full path, so the message is actionable.
  const deep = runSQL(JSON.stringify([{ a: [{ b: 'x' + C(11) + 'y' }] }]), 'json', [], 'xml');
  assert.ok(deep.error.includes('[0]'), deep.error);
  assert.ok(deep.error.includes('field "b"'), deep.error);
});

t('JSON is the only format that can carry the characters the others must refuse', () => {
  // This test used to assert the opposite — that CSV, SQL, YAML and the table all
  // "carry a NUL faithfully". It was written from the wrong side: it asked whether
  // the character survived the write, not whether anything could read the file.
  // Measured with the reference readers, a NUL survives and then breaks all four:
  // Python's csv raises `line contains NUL`, SQLite reports `unrecognized token`
  // inside the literal, PyYAML answers `unacceptable character #x0000`, and
  // `file(1)` calls each of them `data` rather than text. So the refusal is the
  // target's, and JSON is the route out of every one of them — which the error
  // message names, so the way out it gives has to be a real one.
  const input = JSON.stringify([{ id: 1, note: 'a' + String.fromCharCode(0) + 'b' }]);
  const expected = JSON.parse(input);
  for (const format of ['xml', 'csv', 'yaml', 'sql', 'table']) {
    const r = runSQL(input, 'json', [], format);
    assert.ok(r.error, `${format} must refuse a NUL, not write it: ${r.text}`);
    assert.ok(r.error.includes('U+0000 (NUL)'), `${format}: ${r.error}`);
    assert.ok(r.error.includes('field "note"'), `${format}: ${r.error}`);
    if (format !== 'xml') assert.ok(r.error.includes('Write JSON instead'), `${format}: ${r.error}`);
  }
  const j = runSQL(input, 'json', [], 'json');
  assert.strictEqual(j.error, undefined, j.error);
  assert.strictEqual(j.text, JSON.stringify(expected, null, 2));
});

t('YAML refuses every character its c-printable production excludes', () => {
  // YAML 1.2 `c-printable` is #x9 | #xA | #xD | [#x20-#x7E] | #x85 | [#xA0-#xD7FF]
  // | [#xE000-#xFFFD] | [#x10000-#x10FFFF]. A YAML reader checks it before it
  // parses anything, and YAML has no escape for these: `\0` is not a YAML escape,
  // so quoting the scalar does not make room either. Measured against PyYAML, the
  // three characters it accepts out of this set are exactly the three inside it.
  const inside = [0x09, 0x0a, 0x0d, 0x20, 0x7e, 0x85, 0xa0, 0xd7ff, 0xe000, 0xfffd];
  const outside = [0x00, 0x01, 0x07, 0x08, 0x0b, 0x0c, 0x1b, 0x1f, 0x7f, 0x9f, 0xfffe, 0xffff];
  for (const cp of inside) {
    const input = JSON.stringify([{ v: 'x' + String.fromCodePoint(cp) + 'y' }]);
    const r = runSQL(input, 'json', [], 'yaml');
    assert.strictEqual(r.error, undefined, `U+${cp.toString(16)} must be writable: ${r.error}`);
    assert.ok(r.text.includes('x'), `U+${cp.toString(16)} must keep its value: ${r.text}`);
  }
  for (const cp of outside) {
    const input = JSON.stringify([{ v: 'x' + String.fromCodePoint(cp) + 'y' }]);
    const r = runSQL(input, 'json', [], 'yaml');
    assert.ok(r.error, `U+${cp.toString(16)} must be refused: ${r.text}`);
    assert.ok(r.error.startsWith('YAML 1.2 cannot write U+'), r.error);
  }
  // A real surrogate pair is one character above #xFFFF, so it is inside both
  // productions and neither writer may refuse it.
  const pair = JSON.stringify([{ v: 'x\u{1f600}y' }]);
  assert.strictEqual(runSQL(pair, 'json', [], 'yaml').error, undefined);
  assert.strictEqual(runSQL(pair, 'json', [], 'xml').error, undefined);
});

t('CSV, SQL and the table refuse a NUL in a field name, not only in a value', () => {
  // The same walk that finds it in a value has to find it in a key, or a NUL
  // would slip through in the one position no reader expects it.
  for (const format of ['csv', 'sql', 'table', 'yaml']) {
    const r = runSQL('[{"a\\u0000b":"c"}]', 'json', [], format);
    assert.ok(r.error, `${format} must refuse a NUL in a key: ${r.text}`);
    assert.ok(r.error.includes('the field name'), `${format}: ${r.error}`);
  }
  // Tab, newline and carriage return are inside every one of these formats'
  // character sets, so none of them may refuse those.
  for (const format of ['csv', 'sql', 'table', 'yaml', 'xml']) {
    for (const cp of [0x09, 0x0a, 0x0d]) {
      const input = JSON.stringify([{ v: 'a' + String.fromCharCode(cp) + 'b' }]);
      const r = runSQL(input, 'json', [], format);
      assert.strictEqual(r.error, undefined, `${format} U+${cp.toString(16)}: ${r.error}`);
    }
  }
});

t('a lone surrogate is refused by the text writers, not quietly replaced', () => {
  // The measurement that found this: the same input, six output formats, one
  // answer. `yaml` and `xml` refused U+D800 by their own grammars, and `json`
  // escaped it, while `csv`, `sql` and `table` had no rule and wrote U+FFFD in
  // its place — exit 0, no warning, and a value that had become a different
  // value. U+FFFD is an ordinary character once it is in a file, so nothing
  // downstream can notice. A lone surrogate has no UTF-8 encoding at all, so
  // this is not a question of what a format's rules allow.
  const lone = 0xd800;
  for (const format of ['csv', 'sql', 'table', 'yaml', 'xml']) {
    const r = runSQL(JSON.stringify([{ v: 'a' + String.fromCodePoint(lone) + 'b' }]), 'json', [], format);
    assert.ok(r.error, `${format} must refuse a lone surrogate: ${r.text}`);
    assert.ok(r.error.includes('U+D800 (half of a surrogate pair'), `${format}: ${r.error}`);
    assert.ok(r.error.includes('no UTF-8 encoding') || r.error.includes('no escape for it') || r.error.includes('numeric character reference'), `${format}: ${r.error}`);
    assert.ok(!r.text || !r.text.includes('\uFFFD'), `${format}: must not write the substitute`);
  }
  // JSON is the way out the message names, so it has to be lossless: the escape
  // is seven ASCII bytes that parse back to the same lone surrogate.
  const json = runSQL(JSON.stringify([{ v: 'a' + String.fromCodePoint(lone) + 'b' }]), 'json', [], 'json');
  assert.strictEqual(json.error, undefined, json.error);
  assert.ok(json.text.includes('a\\ud800b'), json.text);
  const back = runSQL(json.text, 'json', [], 'json');
  assert.ok(back.text.includes('a\\ud800b'), back.text);

  // A full pair is one character above #xFFFF and no writer may refuse it, so a
  // rule written against UTF-16 code units instead of code points cannot pass.
  for (const format of ['csv', 'sql', 'table', 'yaml', 'xml', 'json']) {
    const r = runSQL(JSON.stringify([{ v: 'a\u{1f600}b' }]), 'json', [], format);
    assert.strictEqual(r.error, undefined, `${format} must carry an emoji: ${r.error}`);
  }

  // The last code unit of the range is not a special case: D800 and DBFF are
  // both halves of nothing, and a rule that stopped at the first would be a
  // rule about a number rather than about the character.
  for (const cp of [0xd800, 0xdbff, 0xdc00, 0xdfff]) {
    const r = runSQL(JSON.stringify([{ v: 'a' + String.fromCodePoint(cp) + 'b' }]), 'json', [], 'csv');
    assert.ok(r.error, `U+${cp.toString(16)} must be refused: ${r.text}`);
  }
});

t('a number that is not finite is refused by every writer, not written as null or as text', () => {
  // Measured on the rigtige writers, before the fix: `1e400` is a legal JSON
  // number literal, so this input is a file any JSON tool accepts, and it parses
  // to Infinity. From there the six formats disagreed about one value:
  //
  //   json   -> `null`                     the value is gone
  //   csv    -> `Infinity`                 a cell that is text
  //   yaml   -> `Infinity`                 PyYAML: str, not float (YAML's own form is `.inf`)
  //   sql    -> 'Infinity'                 SQLite: typeof = `text`
  //   table  -> `Infinity`                 text in a box
  //   xml    -> <Infinity>                 text in an element
  //
  // All six at exit 0 with empty stderr. So the number's *type* changed in five
  // of them and the number itself was replaced in the sixth, and nothing said so.
  const input = '[{"id":1,"a":1e400,"b":-1e400,"ok":1e308}]';
  for (const format of ['json', 'csv', 'yaml', 'sql', 'table', 'xml']) {
    const r = runSQL(input, 'json', [], format);
    assert.ok(r.error, `${format} must refuse a value that is not finite, not write it: ${r.text}`);
    assert.ok(r.error.includes('Infinity'), `${format}: the message must name the value: ${r.error}`);
    assert.ok(r.error.includes('field "a"'), `${format}: the message must name the field: ${r.error}`);
    // The negative assertion is the one that matters: a fix that *replaced* the
    // value with something writable would pass the checks above.
    assert.ok(!r.text, `${format}: nothing may be written: ${r.text}`);
  }
  // A finite number of the same size must not be caught by the rule, and neither
  // may the largest finite double — the boundary is finiteness, not magnitude.
  const finite = runSQL(input, 'json', [], 'json');
  assert.ok(!finite.error.includes('ok'), `a finite number must be writable: ${finite.error}`);
  assert.ok(runSQL('[{"v":1e308}]', 'json', [], 'json').error === undefined);
  // 0, -0 and the smallest doubles are ordinary numbers.
  for (const v of ['0', '-0', '5e-324', '1.7976931348623157e308']) {
    assert.strictEqual(runSQL(`[{"v":${v}}]`, 'json', [], 'json').error, undefined, v);
  }
});

t('a float with an exponent is written the way a YAML reader reads it back', () => {
  // Measured on the real binary, before the fix: seventeen numbers through
  // `transmute nums.json -o yaml`, exit 0, empty stderr, and PyYAML read seven
  // of them back as something else. Five were a *string*:
  //
  //   1e-7        -> '1e-7'        1e+21   -> '1e+21'      5e-324 -> '5e-324'
  //   -1e-7       -> '-1e-7'       1e+308  -> '1e+308'
  //
  // A number that comes out as text, written bare so it looks like a number.
  // YAML's own float production is stricter than JavaScript's: it wants a `.`
  // and a *signed* exponent, so `1.0e-7` is a float to YAML 1.1 and YAML 1.2
  // alike, while `1e-7` is a float only to 1.2 and a string to 1.1 — and 1.1 is
  // what PyYAML, Ruby, Go and most of a pipeline actually speak. `1.0e308` fails
  // the same way, which is why the sign is part of the rule and not a detail.
  //
  // This asserts the *spelling*, and it has to: our own reader is more
  // permissive than PyYAML and reads `1e-7` back as a number, so a round-trip
  // test through `run(..., 'yaml', ...)` passes against the broken writer too.
  // A tool agreeing with itself is not evidence that a file is readable.
  // PyYAML's own float production, decimal branches: the `.` is mandatory and
  // the exponent's sign is mandatory. Written out longhand, it is
  // `[-+]?[0-9]*\.[0-9]*(?:[eE][-+][0-9]+)?` — its other branches are the
  // sexagesimal form and `.inf`/`.nan`, which are non-finite and already refused.
  const YAML11_FLOAT = /^[-+]?[0-9]*\.[0-9]*(?:[eE][-+][0-9]+)?$/;
  const YAML11_INT = /^[-+]?[0-9]+$/;
  const written = [];
  for (const literal of ['1e-7', '-1e-7', '1e21', '1e308', '5e-324', '1.5', '0.1',
    '0.000001', '1.7976931348623157e308', '0.30000000000000004', '1.2345678901234567',
    '1', '-2.5', '1000000000000000', '0']) {
    const r = runSQL(`[{"v":${literal}}]`, 'json', [], 'yaml');
    assert.ok(!r.error, `${literal} must be writable: ${r.error}`);
    const scalar = r.text.split('v: ')[1].trim();
    written.push([literal, scalar]);
    // The negative case is the value: a scalar no YAML 1.1 reader resolves to a
    // number is a string wearing a number's clothes.
    assert.ok(
      YAML11_FLOAT.test(scalar) || YAML11_INT.test(scalar),
      `${literal} is written ${JSON.stringify(scalar)}, which a YAML 1.1 reader reads as a string`
    );
    // And the number it resolves to must be the number that went in.
    const back = Number(scalar);
    assert.strictEqual(back, Number(literal), `${literal} came back as ${back} from ${scalar}`);
  }
  // The spellings themselves, so a fix that quotes the value, or that trades the
  // bug for a different one, cannot pass on the regex alone.
  const byLiteral = Object.fromEntries(written);
  assert.strictEqual(byLiteral['1e-7'], '1.0e-7');
  assert.strictEqual(byLiteral['-1e-7'], '-1.0e-7');
  assert.strictEqual(byLiteral['1e21'], '1.0e+21');
  assert.strictEqual(byLiteral['1e308'], '1.0e+308');
  assert.strictEqual(byLiteral['5e-324'], '5.0e-324');
  // The numbers that already worked must keep the spelling they had: this is
  // not a licence to reformat every float in a file.
  assert.strictEqual(byLiteral['1.5'], '1.5');
  assert.strictEqual(byLiteral['0.1'], '0.1');
  assert.strictEqual(byLiteral['1.7976931348623157e308'], '1.7976931348623157e+308');
  assert.strictEqual(byLiteral['1'], '1');
  assert.strictEqual(byLiteral['1000000000000000'], '1000000000000000');
  // Inside a sequence, in a nested mapping and as a top-level scalar — the rule
  // belongs to the writer, not to the one place the shape happened to be flat.
  assert.ok(/v: 1\.0e-7/.test(runSQL('[{"v":1e-7}]', 'json', [], 'yaml').text));
  assert.ok(/- 1\.0e-7/.test(runSQL('[1e-7]', 'json', [], 'yaml').text));
  assert.ok(/deep: 1\.0e-7/.test(runSQL('[{"a":{"b":{"deep":1e-7}}}]', 'json', [], 'yaml').text));
  // SQL has the same bare form and no such problem: SQLite resolves `1e-7` to a
  // real. The bug is YAML's stricter production, not a rule about exponents.
  assert.ok(/'1e-7'/.test(runSQL('[{"v":1e-7}]', 'json', [], 'sql').text)
    || /\(1e-7\)/.test(runSQL('[{"v":1e-7}]', 'json', [], 'sql').text));
});

test('a string a YAML reader would resolve to something else is written quoted', () => {
  // Measured on the real binary, before the fix: sixty-three plain strings
  // through `transmute probe.json -o yaml`, exit 0, empty stderr, and PyYAML read
  // **twenty-seven values as something other than the string that went in** —
  // plus one that made the whole document unloadable, and fourteen keys under
  // another name. `yes` came back as `True`, `12:30` as `750`, `1_000` as `1000`,
  // `2026-09-26` as a `datetime.date`, and the two worst made PyYAML refuse the
  // file outright:
  //
  //   v: <<      -> ConstructorError: could not determine a constructor for the
  //                  tag 'tag:yaml.org,2002:merge'
  //   v: =       -> ConstructorError: … 'tag:yaml.org,2002:value'
  //
  // So this is the same finding as the exponent test above, seen from the other
  // side: a value the writer is handed as a *string* and the reader gives back as
  // something else. The difference is that here the loss is silent in the worst
  // way — `yes` and `12:30` are not rare spellings, they are what a spreadsheet
  // and a Danish export actually contain.
  //
  // It asserts the spelling, for the reason the test above gives: our own reader
  // is *more* permissive than PyYAML — it reads `yes` and `12:30` back as
  // strings — so a round trip through `run(..., 'yaml', ...)` passes against the
  // broken writer. The lock is the list below, measured against PyYAML's own
  // resolver, not against ourselves.
  const RESOLVES_ELSEWHERE = [
    // YAML 1.1's booleans, three spellings each. `true`/`false`/`null`/`~` were
    // already quoted; the other four words were not, and they are the common
    // ones in exported data.
    ['yes', 'bool'], ['Yes', 'bool'], ['YES', 'bool'], ['no', 'bool'], ['No', 'bool'],
    ['NO', 'bool'], ['on', 'bool'], ['On', 'bool'], ['ON', 'bool'], ['off', 'bool'],
    ['Off', 'bool'], ['OFF', 'bool'],
    // The unsigned dotted floats. `-.inf` and `+.inf` are already caught by the
    // leading sign, `.5` by the number rule — these six are the ones that got
    // through, and they are the smallest numbers and the not-a-number markers.
    ['.inf', 'float'], ['.Inf', 'float'], ['.INF', 'float'],
    ['.nan', 'float'], ['.NaN', 'float'], ['.NAN', 'float'],
    // Underscores are *inside* YAML 1.1's integer production, so a number
    // written the way a person writes it reads as the number without them.
    ['1_000', 'int'], ['1_0', 'int'], ['1_', 'int'], ['1__0', 'int'], ['2026_09_26', 'int'],
    ['0b1010_1', 'int'], ['07_7', 'int'], ['0x1_F', 'int'], ['-1_0', 'int'], ['0b_1', 'int'],
    ['0.1_2', 'float'],
    // Sexagesimal. A clock time is base 60 in YAML 1.1: `12:30` is 750 and
    // `12:00:00` is 43200, which is a *different number*, not just another type.
    ['12:30', 'int'], ['1:2', 'int'], ['1:30:45', 'int'], ['1:2:3', 'int'], ['1:2:3:4', 'int'],
    ['12:00:00', 'int'], ['190:20:30.15', 'float'],
    // Timestamps. The resolver is lexical, so it does not validate the date:
    // `2026-13-45` is a timestamp too, and quoting only real-looking dates
    // would be the wrong rule.
    ['2026-09-26', 'timestamp'], ['2026-13-45', 'timestamp'],
    ['2026-9-26T12:00:00Z', 'timestamp'], ['2026-09-26T12:00:00Z', 'timestamp'],
    ['2026-09-26 12:00:00', 'timestamp'], ['2026-09-26  12:00:00', 'timestamp'],
    ['2026-09-26T12:00:00', 'timestamp'], ['2026-09-26 12:00:00.5', 'timestamp'],
    ['2026-09-26T12:00:00+02:00', 'timestamp'],
    // No constructor: a reader that meets these refuses the whole document.
    ['<<', 'merge'], ['=', 'value'],
  ];
  for (const [value, tag] of RESOLVES_ELSEWHERE) {
    const r = runSQL(JSON.stringify([{ v: value }]), 'json', [], 'yaml');
    assert.ok(!r.error, `${value} must be writable: ${r.error}`);
    const scalar = r.text.split('v: ')[1].trim();
    assert.strictEqual(
      scalar, JSON.stringify(value),
      `${JSON.stringify(value)} is written bare, and a YAML 1.1 reader resolves it to ${tag}`
    );
  }
  // The spellings themselves, so a fix cannot pass on the loop above alone. A
  // quoted scalar is a JSON string here, which every YAML reader reads as a
  // string — that is the point of it.
  for (const value of ['yes', '12:30', '1_000', '2026-09-26', '.inf', '<<', '=']) {
    const r = runSQL(JSON.stringify([{ v: value }]), 'json', [], 'yaml');
    assert.ok(/v: "/.test(r.text), `${value} must be written quoted, got ${r.text.trim()}`);
  }
  // The other direction, and it is the one an over-broad fix breaks: a string a
  // reader keeps as a string is written bare, because quoting everything turns
  // every file into noise. These were all measured as `str` by PyYAML — the
  // short date, the invalid sexagesimal, the single-letter booleans YAML 1.1
  // does *not* have, the lowercase `t`/`z` timestamp it does not accept, and
  // the signed `.5` it has no production for.
  for (const value of ['2026-9-26', '2026-9-6 12:00', '12:60', '12:30:60', '12:30 CET',
    '_1', 'y', 'n', 'ja', 'nej', 'y.', 'no.', 'a:b', '1.2.3', '2026/09/26', '09-17',
    '2026-W40', 'a=b', 'NaN', 'inf', 'hello', 'Aarhus', '10%', '1.234,56',
    '42abc', '0xZZ', '2026-09-26t12:00:00z', '2026-09-26 x']) {
    const r = runSQL(JSON.stringify([{ v: value }]), 'json', [], 'yaml');
    const scalar = r.text.split('v: ')[1].trim();
    assert.strictEqual(scalar, value, `${JSON.stringify(value)} was written ${scalar}`);
  }
  // Four that a YAML 1.1 reader keeps as strings, but that are quoted anyway by a
  // rule that is not this one: `0` and `-0` are numbers to `Number()`, `1e5` is
  // one too (only YAML's stricter float production keeps it a string, which is
  // the test above), and `+.5` is caught by the leading indicator that has always
  // been there. Locked so the rules stay distinguishable instead of one silently
  // absorbing the other.
  for (const value of ['0', '-0', '1e5', '+.5']) {
    const r = runSQL(JSON.stringify([{ v: value }]), 'json', [], 'yaml');
    const scalar = r.text.split('v: ')[1].trim();
    assert.strictEqual(scalar, JSON.stringify(value), `${JSON.stringify(value)} was written ${scalar}`);
  }
  // A key is a scalar too, and one that resolves elsewhere comes back under
  // another name: `0074` is a Danish postal code and reads as the *octal* 60,
  // `yes` reads as `True`, and the record no longer has the field it had.
  for (const key of ['yes', 'On', 'OFF', 'no', '1_000', '0x1F', '0074', '42', '0',
    '2026-09-26', 'true', 'null']) {
    const r = runSQL(JSON.stringify([{ [key]: 'v' }]), 'json', [], 'yaml');
    assert.ok(r.text.startsWith(`- ${JSON.stringify(key)}: v`),
      `key ${JSON.stringify(key)} is written bare: ${r.text.trim()}`);
  }
  // A key a reader keeps as a key stays bare: `name` and the version-shaped
  // `1.2.3` are the ordinary case, and the fix is not a licence to quote them.
  for (const key of ['name', '1.2.3', 'a.b', 'x-y', 'col 1']) {
    const r = runSQL(JSON.stringify([{ [key]: 'v' }]), 'json', [], 'yaml');
    assert.ok(r.text.startsWith(`- ${key}: v`), `key ${key} must stay bare: ${r.text.trim()}`);
  }
  // The rule belongs to the writer, so it holds in a sequence, nested and at the
  // top level, exactly as the exponent rule does.
  assert.ok(/- "yes"/.test(runSQL(JSON.stringify(['yes']), 'json', [], 'yaml').text));
  assert.ok(/deep: "12:30"/.test(runSQL('[{"a":{"b":{"deep":"12:30"}}}]', 'json', [], 'yaml').text));
  // And to YAML only: CSV has no types to change and XML text is text, so a
  // fix that reached past the YAML writer would be a new behaviour, not a fix.
  assert.ok(/^yes$/m.test(runSQL('[{"v":"yes"}]', 'json', [], 'csv').text), runSQL('[{"v":"yes"}]', 'json', [], 'csv').text);
  assert.ok(/<v>yes<\/v>/.test(runSQL('[{"v":"yes"}]', 'json', [], 'xml').text));
  assert.ok(/'yes'/.test(runSQL('[{"v":"yes"}]', 'json', [], 'sql').text), runSQL('[{"v":"yes"}]', 'json', [], 'sql').text);
});

test('NaN from an expression is refused too, and the path to it is named', () => {
  // JSON cannot spell NaN, so the only way in is a computation: `1/0` and `0/0`
  // in an `add` expression. That makes this a user-reachable value, not an exotic
  // input — `amount / units` on a row where units is 0 is an ordinary pipeline.
  // One expression per run, because the walk names the *first* value it refuses.
  for (const [expr, name] of [['1/0', 'Infinity'], ['0/0', 'NaN']]) {
    for (const format of ['json', 'csv', 'yaml', 'sql', 'table', 'xml']) {
      const r = runSQL('[{"n":1}]', 'json', [{ op: 'add', fields: { out: expr } }], format);
      assert.ok(r.error, `${format} must refuse ${name} from ${expr}: ${r.text}`);
      assert.ok(r.error.includes(name), `${format}: the message must name the value: ${r.error}`);
      assert.ok(r.error.includes('field "out"'), `${format}: the field must be named: ${r.error}`);
      // A refusal writes nothing at all, so there is no text that could hold
      // either the word or the null it used to become.
      assert.ok(!r.text, `${format}: must not become null or the word: ${r.text}`);
    }
  }
  // A division that comes out finite is ordinary arithmetic and must not be
  // caught by the rule, in either direction.
  for (const [expr, want] of [['1/2', 0.5], ['4/2', 2]]) {
    const r = runSQL('[{"n":1}]', 'json', [{ op: 'add', fields: { out: expr } }], 'json');
    assert.strictEqual(r.error, undefined, `${expr}: ${r.error}`);
    assert.strictEqual(r.data[0].out, want, expr);
  }
});

t('the value refusal finds a non-finite number deep inside and in a field name position', () => {
  // The walk that finds a NUL in a key and a surrogate in a nested array is the
  // same one, so a number three levels down must be named with its full path.
  const deep = runSQL('[{"a":[{"b":[{"c":1e400}]}]}]', 'json', [], 'json');
  assert.ok(deep.error, `a nested value must be refused: ${deep.text}`);
  assert.ok(deep.error.includes('[0]'), deep.error);
  assert.ok(deep.error.includes('field "c"'), deep.error);
  // A non-finite number as a *value* beside a string in the same record is found
  // by the same walk, and a record that has none is written as it always was.
  const mixed = runSQL('[{"s":"ok","n":1e400}]', 'json', [], 'table');
  assert.ok(mixed.error.includes('field "n"'), mixed.error);
  assert.strictEqual(runSQL('[{"s":"ok","n":1.5}]', 'json', [], 'table').error, undefined);
});

t('a key the JSON input gives twice is named, not resolved in silence', () => {
  // `JSON.parse` has already dropped the first value by the time the reader
  // sees the object, so the collision is found in the text. The value is kept
  // and the run succeeds — but which one won must never be a private decision.
  const r = run('{\n  "status": 200,\n  "name": "ada",\n  "status": 500\n}', 'json', []);
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.data, [{ status: 500, name: 'ada' }]);
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].includes('"status"'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('200') && r.warnings[0].includes('500'), r.warnings[0]);
  // The line is what makes it actionable in a file nobody can read by hand.
  assert.ok(r.warnings[0].includes('lines 2 and 4'), r.warnings[0]);
  // stdout stays clean data: a warning never belongs in the output stream.
  assert.ok(!r.text.includes('Warning'), r.text);
});

t('an identical repeat is not a collision', () => {
  // `{"a":1,"a":1}` says the same thing twice. There is nothing to decide, so
  // a warning here would be noise on correct input.
  const r = run('{"a":1,"a":1,"b":"x"}', 'json', []);
  assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.data, [{ a: 1, b: 'x' }]);
  // And two objects that each carry the key are not a collision at all.
  const two = run('[{"k":1},{"k":2},{"k":1}]', 'json', []);
  assert.deepStrictEqual(two.warnings, []);
  // A key that only looks like one, and an escaped spelling of a key.
  const tricky = run('{"a":"has \\"quote\\", and: colon","a2":1}', 'json', []);
  assert.deepStrictEqual(tricky.warnings, []);
  assert.strictEqual(run('{"\\u0061":1,"a":2}', 'json', []).warnings.length, 1);
});

t('a collision one level down is found by the same rule', () => {
  // The walk descends into object and array values instead of skipping them, so
  // a collision inside a nested object is not invisible because the outer key
  // happened to come first.
  const r = run('{\n "a": 1,\n "b": {\n  "c": 1,\n  "c": 2\n },\n "a": 3\n}', 'json', []);
  const keys = r.warnings.map(w => w.match(/key "([^"]+)"/)[1]);
  assert.deepStrictEqual(keys, ['c', 'a']);
  assert.ok(r.warnings[0].includes('lines 4 and 5'), r.warnings[0]);
  assert.deepStrictEqual(r.data, [{ a: 3, b: { c: 2 } }]);
  const inArray = run('[{"k":1,"k":2}]', 'json', []);
  assert.strictEqual(inArray.warnings.length, 1, JSON.stringify(inArray.warnings));
});

t('a key the YAML input gives twice is named too', () => {
  // The classic YAML trap: the second line wins and the first value is gone
  // with nothing to show for it. Same rule, same words, so the two readers
  // cannot drift apart.
  const r = run('name: Ada\nname: Bob\nage: 36\n', 'yaml', []);
  assert.deepStrictEqual(r.data, [{ name: 'Bob', age: 36 }]);
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].startsWith('YAML: key "name"'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('lines 1 and 2'), r.warnings[0]);

  // Nested, and inside a flow mapping, where there is no line to name.
  const nested = run('x:\n  k: 1\n  k: 2\n', 'yaml', []);
  assert.strictEqual(nested.warnings.length, 1, JSON.stringify(nested.warnings));
  assert.deepStrictEqual(nested.data, [{ x: { k: 2 } }]);
  const flow = run('a: {x: 1, x: 2}\nb: 1\n', 'yaml', []);
  assert.strictEqual(flow.warnings.length, 1, JSON.stringify(flow.warnings));
  assert.ok(!flow.warnings[0].includes('lines'), flow.warnings[0]);
  // A repeated key with the same value is still not a collision.
  assert.deepStrictEqual(run('a: 1\na: 1\n', 'yaml', []).warnings, []);
  // Nor is a key that appears in two different records.
  assert.deepStrictEqual(run('- k: 1\n- k: 2\n', 'yaml', []).warnings, []);
});

t('a second XML root element is refused, not ignored', () => {
  // Batch tools concatenate XML documents, so this is a file users really have.
  // Reading only the first document dropped the second with exit 0 and no
  // warning — half a file that looks like all of it.
  const two = run('<root><a>1</a></root>\n<other><b>2</b></other>\n', 'xml', []);
  assert.ok(two.error, 'a second root element must not be read silently');
  assert.ok(two.error.includes('one root element'), two.error);
  assert.ok(two.error.includes('<other>'), two.error);
  // The failure names the content it found, which is what a user has to look at.
  const r = runSQL('<root><a>1</a></root>\n', 'xml', [], 'json');
  assert.strictEqual(r.error, undefined, r.error);
  assert.deepStrictEqual(r.data, [{ a: '1' }]);
  // Prologue, comments and a trailing newline are not a second document.
  for (const head of ['<?xml version="1.0"?>\n', '<!-- a note -->\n', '<!DOCTYPE r>\n']) {
    const ok = run(head + '<root><a>1</a></root>\n', 'xml', []);
    assert.strictEqual(ok.error, undefined, head + ': ' + ok.error);
  }
});

t('a flow collection that is the whole document is read as its content', () => {
  // `{a: 1}` on the root line reached the block reader, which took `{a` for a
  // key: the file's content came out as one field holding the text `1, b: two`,
  // exit 0 and clean stderr. The flow reader already existed and read the very
  // same line correctly one level down, so the root was the only place the
  // syntax was not read.
  const map = run('{a: 1, b: two}', 'yaml', []);
  assert.deepStrictEqual(map.data, [{ a: 1, b: 'two' }]);
  // The same rule as everywhere else: a key the file gives twice, with two
  // different values behind it, is named — never guessed at.
  const dup = run('{a: 1, a: 2}', 'yaml', []);
  assert.deepStrictEqual(dup.data, [{ a: 2 }]);
  assert.strictEqual(dup.warnings.length, 1, JSON.stringify(dup.warnings));
  assert.ok(dup.warnings[0].startsWith('YAML: key "a"'), dup.warnings[0]);
  // A sequence at the root, and a comment after the collection.
  assert.deepStrictEqual(run('[1, 2, 3]', 'yaml', []).data, [1, 2, 3]);
  assert.deepStrictEqual(run('{a: 1} # a note', 'yaml', []).data, [{ a: 1 }]);
  // An unbalanced `{` is a file PyYAML refuses, and so is a collection on the root
  // line with a line behind it — `yamlFlowLine` only takes the collection when
  // nothing follows it, so the block reader below got the line. It used to answer
  // the field `{a` holding the text `1` and the field `{a` holding `1}`, a name no
  // file writes; both are now refused by name, the same way `? {a: 1}` is.
  assert.ok(run('{a: 1', 'yaml', []).error, '{a: 1 should be refused');
  // Nor does a collection on the root line swallow the lines under it. A
  // collection spread over several lines *is* a document this rule reaches,
  // since the lines are folded together before it is asked — the old answer
  // here was the one string `[`, and PyYAML reads the list.
  assert.ok(run('{a: 1}\nb: 2', 'yaml', []).error, '{a: 1}\\nb: 2 should be refused');
  assert.deepStrictEqual(run('[\n  {a: 1},\n  {a: 2}\n]', 'yaml', []).data, [{ a: 1 }, { a: 2 }]);
  // A flow collection under an explicit document marker is the same document.
  assert.deepStrictEqual(run('---\n{a: 1}\n', 'yaml', []).data, [{ a: 1 }]);
});

t('the root element ends where its own nesting ends, not at the last close tag', () => {
  // `lastIndexOf('</rows>')` found the *last* close tag in the file, so two
  // documents sharing a root name — the shape a batch tool appending the same
  // schema actually writes — hid the second document from the one-root rule and
  // were reported by the child reader instead, with a message pointing inside
  // the file rather than at the rule the user broke.
  for (const doc of [
    '<rows>a</rows><rows>b</rows>',
    '<rows><row><a>1</a></row></rows>\n<rows><row><b>2</b></row></rows>\n',
    '<rows/><rows>b</rows>',
    '<rows></rows><rows>b</rows>',
    '<rows>a</rows>\n\n<rows>b</rows>',
    '<ns:rows>a</ns:rows><ns:rows>b</ns:rows>'
  ]) {
    const r = run(doc, 'xml', []);
    assert.ok(r.error, doc);
    assert.ok(r.error.includes('one root element'), doc + ': ' + r.error);
  }
  // Nesting is what ends the root, not its name: the same name inside it, a
  // longer name, and a self-closed child all still read the way they always did.
  assert.deepStrictEqual(run('<root><root>x</root></root>', 'xml', []).data, [{ root: 'x' }]);
  assert.deepStrictEqual(run('<root><roots>x</roots></root>', 'xml', []).data, [{ roots: 'x' }]);
  assert.deepStrictEqual(run('<r><i a="1"/><i>2</i></r>', 'xml', []).data, [{ i: { '@a': '1' } }, { i: '2' }]);
  // A root that closes itself is closed. That file used to be refused with
  // "never closed", which is the one message about XML that was simply untrue.
  assert.deepStrictEqual(run('<rows/>', 'xml', []).data, []);
  assert.deepStrictEqual(run('<rows></rows>', 'xml', []).data, []);
  // A self-closed root that carries an attribute is not an empty document. It
  // was `[]` — no records, and the attribute gone with them — and it is now the
  // one record that says what the element is. Measured: `ElementTree` reads
  // `<rows a="1"/>` as an element whose `attrib` is `{"a": "1"}`, so the empty
  // answer was the one that said the file held nothing.
  assert.deepStrictEqual(run('<rows a="1"/>', 'xml', []).data, [{ '@a': '1' }]);
  // A close tag that does not match what it closes is still the child's problem
  // to name, not a claim that the root was never closed.
  const crossed = run('<data><item><a>1</a></b></data>', 'xml', []);
  assert.ok(crossed.error, 'mismatched tags must not parse');
  assert.ok(!crossed.error.includes('never closed'), crossed.error);
});

test('a one-column CSV record with an empty value survives the round trip', () => {
  // RFC 4180 lets a file carry blank lines between records, and the reader
  // dropped every record whose only field was empty. A one-column export
  // therefore wrote its empty values as blank lines and lost those rows on the
  // way back in: three records in, two out, exit 0, empty stderr, and the two
  // that survived looked like the whole file.
  for (const value of ['', ' ', '  ']) {
    const records = [{ v: 'first' }, { v: value }, { v: 'third' }];
    const text = run(JSON.stringify(records), 'json', [], 'csv').text;
    assert.strictEqual(text, `v\nfirst\n"${value}"\nthird`, JSON.stringify(value));
    const back = run(text, 'csv', [], 'json').data;
    assert.deepStrictEqual(back, records, JSON.stringify(value));
  }
  // A genuinely blank line is still a blank line, in a one-column file as much
  // as any other: that is the reader's own tolerance, and this does not touch it.
  assert.deepStrictEqual(run('v\nfirst\n\nthird\n', 'csv', [], 'json').data, [{ v: 'first' }, { v: 'third' }]);
  assert.deepStrictEqual(run('a,b\n1,x\n\n2,y\n', 'csv', [], 'json').data, [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
  // `null` reaches the cell as an empty string, so it is the same record.
  assert.deepStrictEqual(run('[{"v":"a"},{"v":null},{"v":"c"}]', 'json', [], 'csv').text, 'v\na\n""\nc');
  // A quoted empty field is a record, not a blank line, however many columns
  // the file has — this is the reader half of the fix on its own.
  assert.deepStrictEqual(run('a,b\n1,""\n2,y\n', 'csv', [], 'json').data, [{ a: 1, b: '' }, { a: 2, b: 'y' }]);
});

test('a CSV cell is quoted when a bare one would not read back the same', () => {
  // The reader trims every field it did not read as quoted, so `"  x  "` was
  // written bare and came back as `"x"`. Quoting is the one thing that does
  // work in CSV, and this is where it belongs.
  const text = run('[{"a":"  x  ","b":"y","c":"","d":"z"}]', 'json', [], 'csv').text;
  assert.strictEqual(text, 'a,b,c,d\n"  x  ",y,,z', text);
  assert.deepStrictEqual(run(text, 'csv', [], 'json').data, [{ a: '  x  ', b: 'y', c: '', d: 'z' }]);
  // Quotes inside a quoted cell are doubled, so this does not become four
  // quotes and an unterminated field.
  const inner = run('[{"a":" \\"q\\" "}]', 'json', [], 'csv').text;
  assert.deepStrictEqual(run(inner, 'csv', [], 'json').data, [{ a: ' "q" ' }]);
});

test('a CSV column name is quoted on the same rule as a CSV value', () => {
  // The value line got this rule from the test above; the header line never
  // did, and the gap is three silent losses. A bare header is trimmed by the
  // reader, a header of nothing but spaces is a blank line, and two headers
  // that differ only in their edge spaces become one column.
  //
  // The second of those is the sharpest: RFC 4180 lets a file carry blank
  // lines between records, the reader follows that rule for records, and the
  // header is the first record — so a whitespace-only header was eaten and the
  // only data line became the header. One record in, zero records out.
  for (const name of [' a ', '  ', '', ' a', 'a ']) {
    const records = [{ [name]: 1 }];
    const text = run(JSON.stringify(records), 'json', [], 'csv').text;
    assert.deepStrictEqual(run(text, 'csv', [], 'json').data, records, JSON.stringify(name));
  }
  // Two headers one space apart are two columns, and both values are kept —
  // this is the case that lost a whole column of data.
  const pair = [{ ' a': 1, 'a ': 2 }];
  const pairText = run(JSON.stringify(pair), 'json', [], 'csv').text;
  assert.strictEqual(pairText, '" a","a "\n1,2', pairText);
  assert.deepStrictEqual(run(pairText, 'csv', [], 'json').data, pair);
  // The quoting is on the name, not a new rule for names: a name holding a
  // quote still doubles it, and the ones that need nothing stay bare so an
  // ordinary export is unchanged.
  assert.strictEqual(run('[{"a\\"b":1," c ":2,"d":3}]', 'json', [], 'csv').text, '"a""b"," c ",d\n1,2,3');
  // A name a reference reader also keeps: Python's csv holds the spaces, and
  // Transmute now writes the file that makes that true.
  assert.strictEqual(run('[{"Total ":1,"Total":2}]', 'json', [], 'csv').text, '"Total ",Total\n1,2');
});

test('the CSV writer names the columns a reader will type for it', () => {
  // Quoting cannot fix a type change: the reader takes the quotes off before
  // it coerces, so `"true"` comes back as the boolean `true`. The rule is
  // therefore `coerceCSVValue` itself, and the answer is a warning.
  const r = run('[{"id":"1","navn":"Ada","ok":"true"},{"id":"2","navn":"Bob","ok":"false"}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  const w = r.warnings[0];
  assert.ok(w.includes('"id" (2)'), w);
  assert.ok(w.includes('"ok" (2)'), w);
  assert.ok(!w.includes('"navn"'), w);
  // Nothing to warn about: these came in as numbers and go out as numbers, and
  // a value a reader keeps as a string (`0074`, `12:30`, `1e5`) keeps its type.
  for (const text of ['[{"id":1,"ok":true}]', '[{"id":"0074"}]', '[{"t":"12:30"}]', '[{"t":"1e5"}]', '[{"t":"yes"}]']) {
    assert.deepStrictEqual(run(text, 'json', [], 'csv').warnings, [], text);
  }
  // The other five writers have no equivalent, so they must stay silent.
  for (const out of ['json', 'yaml', 'xml', 'table', 'sql']) {
    assert.deepStrictEqual(run('[{"id":"1"}]', 'json', [], out).warnings, [], out);
  }
  // A column that mixes strings and numbers is named for the strings only.
  const mixed = run('[{"a":"1"},{"a":2},{"a":"x"}]', 'json', [], 'csv').warnings;
  assert.strictEqual(mixed.length, 1, JSON.stringify(mixed));
  assert.ok(mixed[0].includes('"a" (1)'), mixed[0]);
});

// ─── Names a record already answers to ────────────────────────────────
test('a repeated child key is a list, and that list is the file', () => {
  // The two obligations a name-to-value reader has here, measured with two
  // judges: the other reader in the file has all three members, and this one
  // keeps all three. Nothing is dropped, so nothing needs a warning, and the
  // round trip is stable — a list is written back as repeated elements and
  // read as the same list.
  assert.deepStrictEqual(run('<data><item><v>1</v><v>2</v><v>3</v></item></data>', 'xml').data, [{ v: ['1', '2', '3'] }]);
  // One member is not a list, and that is the whole difference between the two
  // documents: XML cannot say "one of many", so the type follows the count.
  assert.deepStrictEqual(run('<data><item><v>1</v></item></data>', 'xml').data, [{ v: '1' }]);
  // Two records where the same field is a list in one and a scalar in the other
  // is heterogeneous data, not a collision: both keep every member they have.
  assert.deepStrictEqual(run('<data><item><v>1</v><v>2</v></item><item><v>9</v></item></data>', 'xml').data,
    [{ v: ['1', '2'] }, { v: '9' }]);
  // Nested one level deeper, with attributes and with a child element per
  // member: the members are objects, and they stay objects.
  assert.deepStrictEqual(run('<data><item><v x="1"/><v x="2"/></item></data>', 'xml').data, [{ v: [{ '@x': '1' }, { '@x': '2' }] }]);
  const carried = run('<data><item><field name="a b">1</field><field name="a b">2</field></item></data>', 'xml');
  assert.deepStrictEqual(carried.data, [{ 'a b': ['1', '2'] }]);
  // The list is a document, so it must survive being written and read again.
  const round = run(run(JSON.stringify([{ a: { v: [1, 2] } }]), 'json', [], 'xml').text, 'xml', [], 'json');
  assert.deepStrictEqual(round.data, [{ a: { v: ['1', '2'] } }]);
});

test('a name a record already answers to is still a field, not an inherited one', () => {
  // `childKey in value` walked the prototype chain, so a record whose child
  // element is named after an `Object.prototype` member was read as if the file
  // had already given that name twice: the repeated-key rule wrapped the
  // *inherited function* as the first member, and a function is not JSON, so
  // the field came out as `[null, "1"]` — a null nobody wrote, in a list nobody
  // asked for, and one more null on every round trip.
  for (const name of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString']) {
    assert.deepStrictEqual(run(`<data><item><${name}>1</${name}></item></data>`, 'xml').data, [{ [name]: '1' }], name);
    // Two of them is a list of two, which is what the file says.
    assert.deepStrictEqual(run(`<data><item><${name}>1</${name}><${name}>2</${name}></item></data>`, 'xml').data,
      [{ [name]: ['1', '2'] }], name);
  }
  // `__proto__` is the other half: assignment to it on a plain object replaces
  // the prototype instead of adding a field, so the field was *absent* from the
  // record — `{}` where the file said `1`, exit 0, no warning.
  // `{ ['__proto__']: … }` and not `{ __proto__: … }`: the latter is a prototype
  // write in the test itself, and would make this test pass for the wrong reason.
  assert.deepStrictEqual(run('<data><item><__proto__>1</__proto__><keep>y</keep></item></data>', 'xml').data,
    [{ ['__proto__']: '1', keep: 'y' }]);
  // The writer's own spelling, read back: this is the file `json → xml` produced
  // for a record with that key, so the tool did not read back what it wrote.
  const round = (key) => run(run(JSON.stringify([{ [key]: 'x', keep: 'y' }]), 'json', [], 'xml').text, 'xml', [], 'json');
  assert.deepStrictEqual(round('__proto__').data[0]['__proto__'], 'x');
  assert.deepStrictEqual(round('toString').data[0].toString, 'x');
  // A key the XML writer cannot spell as a tag travels in a `name` attribute,
  // and `readFieldName` puts it back through the same two lines.
  const carried = round('a b');
  assert.deepStrictEqual(carried.data, [{ 'a b': 'x', keep: 'y' }]);
});

test('the steps that name fields keep those fields', () => {
  // Same rule, one layer over: `pick` asked `f in item`, `rename` asked
  // `mapping[k] ?? k`, and all four steps wrote by assignment. So `pick` dropped
  // the field it was asked for by name, `omit` dropped the field it was keeping,
  // and `rename` with no mapping for a field wrote it under the *name* of the
  // inherited member — `{"__proto__":"x"}` came out as `{"[object Object]":"x"}`
  // and `constructor` as `{"function Object() { [native code] }":"c"}`.
  const input = '[{"__proto__":"x","keep":"y"},{"constructor":"c","toString":"t","keep":"y"}]';
  const pipe = (steps) => runSQL(input, 'json', steps, 'json');
  assert.deepStrictEqual(pipe([{ op: 'pick', fields: ['keep', '__proto__'] }]).data[0]['__proto__'], 'x');
  assert.strictEqual(pipe([{ op: 'pick', fields: ['keep', 'nope'] }]).data[0].nope, undefined);
  assert.strictEqual(pipe([{ op: 'omit', fields: ['keep'] }]).data[0]['__proto__'], 'x');
  const renamed = pipe([{ op: 'rename', mapping: { keep: 'ny' } }]).data;
  assert.deepStrictEqual(Object.keys(renamed[0]), ['__proto__', 'ny']);
  assert.deepStrictEqual(Object.keys(renamed[1]), ['constructor', 'toString', 'ny']);
  // The mapping and the added field need a computed key: a `{ __proto__ }`
  // literal in the test itself would set a prototype, which is the very thing
  // the step has to survive. The CLI gets these from JSON, where the name is a
  // field like any other.
  assert.strictEqual(pipe([{ op: 'rename', mapping: { ['__proto__']: 'ny' } }]).data[0].ny, 'x');
  const added = pipe([{ op: 'add', fields: { ['__proto__']: { expr: '1' } } }]).data[0];
  assert.strictEqual(added['__proto__'], 1);
  // Reading it back from the other formats too: a CSV column and a YAML key by
  // that name were dropped the same way, at the same two lines.
  assert.strictEqual(run('__proto__,keep\nx,y\n', 'csv', [], 'json').data[0]['__proto__'], 'x');
  assert.strictEqual(run('__proto__: x\nkeep: y\n', 'yaml', [], 'json').data[0]['__proto__'], 'x');
  assert.strictEqual(run('{"__proto__":"x","keep":"y"}', 'json', [], 'json').data[0]['__proto__'], 'x');
});

test('a step that reads a field name does not read the prototype', () => {
  // The same rule one layer over, on the *read* side. `pick` asked `f in item`
  // and every step that writes asked `key in record`, so a name the record does
  // not have but inherits — `toString`, `constructor`, `__proto__` — was read as
  // a value the file never had. `group` then wrote that value as its key: the
  // table showed `function Object() { [native code] }` and the JSON dropped the
  // field, while the warning said the rows landed in `(null)`.
  const input = '[{"id":1,"name":"Ada"},{"id":2,"name":"Bo"},{"id":3,"name":"Cy"}]';
  const pipe = (steps) => run(input, 'json', steps, 'json');
  // A field name is either in the record or it is not. Here it is not, so
  // `group` groups the way it groups for any missing field.
  const grouped = pipe([{ op: 'group', by: 'toString' }]).data;
  assert.strictEqual(grouped.length, 1);
  assert.strictEqual(grouped[0].key, '(null)');
  assert.strictEqual(typeof grouped[0].key, 'string');
  // And the claim the warning makes about it is now true, instead of naming a
  // group the output does not contain.
  const warned = pipe([{ op: 'group', by: 'toString' }]);
  assert.ok(warned.warnings.some(w => /every row landed in the group "\(null\)"/.test(w)),
    JSON.stringify(warned.warnings));
  // `sort` compares nothing but the missing field, so the rows keep their
  // order; the row order is what a reader checks first.
  assert.deepStrictEqual(pipe([{ op: 'sort', by: '__proto__' }]).data.map(r => r.id), [1, 2, 3]);
  // `flatten` sees no array, so no row is expanded.
  assert.strictEqual(pipe([{ op: 'flatten', field: 'constructor' }]).data.length, 3);
  // The one that removes data: every row looked identical because they all
  // carried the *same inherited function* as their key. T26 documented that
  // answer for a field no record has, and it stands: one row, with the warning
  // that says so. What changed is why they looked identical.
  const unique = pipe([{ op: 'unique', by: 'toString' }]);
  assert.strictEqual(unique.data.length, 1);
  assert.ok(unique.warnings.some(w => /every row looked identical/.test(w)),
    JSON.stringify(unique.warnings));
});

test('join does not match rows on a field neither side has', () => {
  // The sharpest version of the same bug, and the warning made it worse: it
  // said "neither side has it, so every row was dropped" while every row was in
  // fact *merged with the last right-hand record*, so a `city` the file never
  // mentioned was written into all three rows. Both sides stringified a missing
  // key to `"undefined"`, which matched, and an inherited name matched just as
  // well because `String(fn)` is the same string on both sides.
  const input = '[{"id":"1","name":"Ada"},{"id":"2","name":"Bo"}]';
  const with_ = [{ id: '1', city: 'Aarhus' }, { id: '2', city: 'Odense' }];
  const r = run(input, 'json', [{ op: 'join', on: 'nope', with: with_ }], 'json');
  assert.deepStrictEqual(r.data, []);
  assert.ok(r.warnings.some(w => /neither side has it, so every row was dropped/.test(w)),
    JSON.stringify(r.warnings));
  // An inherited name is the same missing field, and must be judged the same
  // way rather than matching every row to one arbitrary record.
  const inherited = run(input, 'json', [{ op: 'join', on: 'toString', with: with_ }], 'json');
  assert.deepStrictEqual(inherited.data, []);
  // `keep: left` keeps the rows it cannot match, and invents nothing.
  const kept = run(input, 'json', [{ op: 'join', on: 'toString', with: with_, keep: 'left' }], 'json');
  assert.deepStrictEqual(kept.data, [{ id: '1', name: 'Ada' }, { id: '2', name: 'Bo' }]);
  // The join that is supposed to match still matches, once per row.
  const good = run(input, 'json', [{ op: 'join', on: 'id', with: with_ }], 'json');
  assert.deepStrictEqual(good.data, [
    { id: '1', name: 'Ada', city: 'Aarhus' },
    { id: '2', name: 'Bo', city: 'Odense' }
  ]);
  // Fixing the invention uncovered the silence it had been hiding: a key only
  // one side has cannot match anything, so the run writes an empty file — and
  // said nothing, because T26 read "the right side has it" as "there is no
  // mistake here". Which side is missing the key is the whole difference between
  // two different typos in a pipeline, so the warning names it.
  const rightOnly = run(input, 'json', [{ op: 'join', on: 'city', with: with_ }], 'json');
  assert.deepStrictEqual(rightOnly.data, []);
  assert.ok(rightOnly.warnings.some(w => /no record on the left has a field named "city"/.test(w)),
    JSON.stringify(rightOnly.warnings));
  const leftOnly = run(input, 'json', [{ op: 'join', on: 'id', with: [{ k: '1' }] }], 'json');
  assert.deepStrictEqual(leftOnly.data, []);
  assert.ok(leftOnly.warnings.some(w => /no record on the right has a field named "id"/.test(w)),
    JSON.stringify(leftOnly.warnings));
  // `keep: left` keeps what it cannot match, and the warning says that instead
  // of claiming rows were dropped.
  const keptNothing = run(input, 'json', [{ op: 'join', on: 'nope', keep: 'left', with: with_ }], 'json');
  assert.strictEqual(keptNothing.data.length, 2);
  assert.ok(keptNothing.warnings.some(w => /every row was kept unchanged/.test(w)),
    JSON.stringify(keptNothing.warnings));
});

test('join writes a right-hand field that the left row inherits, and one named __proto__', () => {
  // The write guard asked `target in merged`, so it asked the prototype chain
  // the same way the readers did, and the field the right-hand file really has
  // was dropped — the one place T46's `setField` was not called from. Both cases
  // are exit 0 with no warning, because no field name is named in the pipeline.
  const input = '[{"id":"1","name":"Ada"}]';
  const rows = (with_) => run(input, 'json', [{ op: 'join', on: 'id', with: with_ }], 'json').data;
  // A computed key in the test as well: `{ __proto__: … }` would set a
  // prototype here instead of naming a field, which is the thing under test.
  const inherited = rows([{ id: '1', toString: 'x' }]);
  assert.strictEqual(inherited[0].toString, 'x');
  const own = rows([{ id: '1', ['__proto__']: 'x' }]);
  assert.strictEqual(own[0]['__proto__'], 'x');
  // `prefix` is the documented way to keep two sides' `city` apart, and it
  // works for these names too.
  const prefixed = run(input, 'json',
    [{ op: 'join', on: 'id', prefix: 'r_', with: [{ id: '1', toString: 'x' }] }], 'json').data;
  assert.strictEqual(prefixed[0].r_toString, 'x');
});

// ─── ROWS THAT ARE NOT RECORDS, ON THE WAY OUT ───────────────────────────

test('sql writes the whole file when the first row is not a record', () => {
  // The guard asked whether the *first* row was an object, so `["Ada", …]` and
  // `["Alice", {"a":1}]` returned an empty string and every record in the file
  // was gone — the file was written, exit 0, empty stderr. The only reason
  // there is nothing to write is that there are no columns.
  const r = run('["Alice", {"a":1}]', 'json', [], 'sql');
  assert.match(r.text, /INSERT INTO "my_table" \("a"\) VALUES/);
  assert.match(r.text, /\(NULL\)/);
  assert.match(r.text, /\(1\)/);
  // The row order is the file order, and the value that was there is gone.
  assert.ok(r.text.indexOf('(NULL)') < r.text.indexOf('(1)'), r.text);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('1 of 2 rows is not a record'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('written as NULL'), r.warnings[0]);
});

test('a row that is not a record is named by every flat format that drops it', () => {
  // Same data, three writers, one silence each — and the answer is T14's: the
  // run succeeds, the file is written, and one line says what the file lost.
  for (const format of ['csv', 'table', 'sql']) {
    const r = run('[{"a":1}, "Alice"]', 'json', [], format);
    assert.strictEqual(r.warnings.length, 1, `${format}: ${JSON.stringify(r.warnings)}`);
    assert.ok(r.warnings[0].startsWith(`${format}: `), r.warnings[0]);
    assert.ok(r.warnings[0].includes('row 2 is a string ("Alice")'), r.warnings[0]);
    assert.ok(r.warnings[0].includes('not in the file'), r.warnings[0]);
  }
});

test('a file with no records at all says the whole file is gone', () => {
  // `["Alice","Bob"]` wrote a two-byte CSV that reads back as an empty array,
  // and the table printed a box with no columns in it. The empty file is the
  // format's honest answer — there is no header to write — so the warning has
  // to say that the values are not in it.
  const csv = run('["Alice","Bob"]', 'json', [], 'csv');
  // Two blank lines: the format's honest answer when there is no header to
  // write, and a file that reads back as no rows at all.
  assert.strictEqual(csv.text, '\n\n');
  assert.ok(csv.warnings[0].includes('no records to make a header from'), csv.warnings[0]);
  assert.deepStrictEqual(run(csv.text, 'csv', [], 'json').data, []);
  const sql = run('["Alice","Bob"]', 'json', [], 'sql');
  assert.strictEqual(sql.text, '');
  assert.ok(sql.warnings[0].includes('no records to make columns from'), sql.warnings[0]);
});

test('a list row says it became columns, because its members do survive', () => {
  // `Object.keys` on a list is its positions, so `[1,2]` names the columns `0`
  // and `1` for the whole file. The values are kept and the list around them is
  // not — T45's rule for a list of one, and the warning has to say which.
  const r = run('[[1,2],{"a":9}]', 'json', [], 'csv');
  assert.strictEqual(r.text.split('\n')[0], '0,1,a');
  assert.ok(r.warnings[0].includes('a list of 2 members'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('columns named after its positions'), r.warnings[0]);
});

test('a list position that is a record field says the two are one column', () => {
  // The old sentence was a claim about the file, and in this shape it is false:
  // column `0` is not *named after a position*, it is a field a record has, and
  // the list's first member is written into it. Two rows' values in one cell,
  // read back as one — so the warning has to name the column and say that.
  const r = run('[{"0":"rec","a":1},["list"]]', 'json', [], 'csv');
  assert.strictEqual(r.text, '0,a\nrec,1\nlist,', r.text);
  const w = r.warnings[0];
  assert.ok(w.includes('row 2 is a list of 1 member'), w);
  assert.ok(w.includes('"0"'), `the warning does not name the column: ${w}`);
  assert.ok(w.includes('written into the same column'), `the warning does not say they are one column: ${w}`);
  assert.ok(!w.includes('columns named after its positions'),
    `the warning still claims the list became columns named after its positions: ${w}`);
  // Every flat writer is named, because all three make the same one column.
  for (const format of ['table', 'sql']) {
    const other = run('[{"0":"rec","a":1},["list"]]', 'json', [], format);
    assert.ok(other.warnings[0].includes('written into the same column'), `${format}: ${other.warnings[0]}`);
  }
  // A record with no numeric field is the case the old sentence was written for,
  // and it must not pick up the new one.
  const clean = run('[{"a":1},["x","y"]]', 'json', [], 'csv');
  assert.ok(clean.warnings[0].includes('columns named after its positions'), clean.warnings[0]);
  assert.ok(!clean.warnings[0].includes('written into the same column'), clean.warnings[0]);
});

test('a list position shared with two records names the column once', () => {
  const r = run('[{"0":"a","1":"b"},["x","y"],{"0":"c","1":"d"}]', 'json', [], 'csv');
  const w = r.warnings[0];
  assert.ok(w.includes('"0" and "1"'), `the warning does not name both columns: ${w}`);
  assert.strictEqual((w.match(/written into the same column/g) || []).length, 1, w);
});

test('records and scalars mixed say which rows, once, and never more', () => {
  const r = run('[1,{"a":1},{"a":2},"x",{"a":3}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('2 of 5 rows are not records'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('row 1 is a number (1)'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('row 4 is a string ("x")'), r.warnings[0]);
});

test('the six-row file names three rows and says how many more there are', () => {
  // The cap is T14's: one line per run, three named, the rest counted.
  const many = JSON.stringify([1, 2, 3, 4, 5, {"a": 1}]);
  const r = run(many, 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('5 of 6 rows are not records'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('and 2 more'), r.warnings[0]);
});

test('a file of records with the same fields is not warned about, in any format', () => {
  for (const format of ['csv', 'table', 'sql', 'json', 'yaml', 'xml']) {
    const r = run('[{"a":1,"b":"x"},{"a":2,"b":"y"}]', 'json', [], format);
    assert.deepStrictEqual(r.warnings, [], `${format}: ${JSON.stringify(r.warnings)}`);
  }
});

test('a value that is there is not an absence: "", 0, false and null are told apart', () => {
  // Only the two that are *not* a value in the cell may be named. `""` is the
  // value, `0` and `false` are values that are easy to lose to a truthiness
  // test, and `null` is a value the file cannot hold.
  for (const value of ['""', '0', 'false', '[]', '{}']) {
    const r = run(`[{"a":1,"b":${value}},{"a":2,"b":${value}}]`, 'json', [], 'csv');
    assert.deepStrictEqual(r.warnings, [], `b=${value}: ${JSON.stringify(r.warnings)}`);
  }
  const nulled = run('[{"a":1,"b":null},{"a":2,"b":null}]', 'json', [], 'csv');
  assert.strictEqual(nulled.warnings.length, 1, JSON.stringify(nulled.warnings));
  assert.ok(/columns holds an explicit null/.test(nulled.warnings[0]), nulled.warnings[0]);
});

test('a field no row has is named, with the rows that lack it counted', () => {
  const r = run('[{"a":1,"b":1},{"a":2,"b":2},{"a":3}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].includes('1 of 2 columns is not in every row'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('"b" (1 of 3)'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('read back as an empty string'), r.warnings[0]);
  // The fact the user needs: the empty cell is a *value* on the way back in.
  const back = run(r.text, 'csv', [], 'json');
  assert.strictEqual(JSON.parse(back.text)[2].b, '');
});

test('a column a row is missing and a column holding null are both named', () => {
  // `b` is null in one row and absent in the other, `c` is absent in one row.
  // The two counts are separate facts and the message has to keep them apart:
  // a column that is null everywhere is a different problem from one that is
  // missing somewhere.
  const r = run('[{"a":1,"b":null},{"a":2,"c":3}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(/are not in every row: "b" \(1 of 2\), "c" \(1 of 2\)/.test(r.warnings[0]), r.warnings[0]);
  assert.ok(/columns holds an explicit null: "b" \(1 of 2\)/.test(r.warnings[0]), r.warnings[0]);
});

test('sql is not named, because the file says NULL out loud', () => {
  const r = run('[{"a":1,"b":null},{"a":2}]', 'json', [], 'sql');
  assert.deepStrictEqual(r.warnings, [], JSON.stringify(r.warnings));
  assert.match(r.text, /\(1, NULL\),\n  \(2, NULL\);/);
});

test('json and yaml keep the difference and are not warned about either', () => {
  for (const format of ['json', 'yaml']) {
    const r = run('[{"a":1,"b":null},{"a":2}]', 'json', [], format);
    assert.deepStrictEqual(r.warnings, [], `${format}: ${JSON.stringify(r.warnings)}`);
  }
  // Proof that the warning is not claiming a loss that did not happen: yaml
  // writes the null and leaves the absent key out, and reading that back gives
  // one row with `b` and one row without.
  const yaml = run('[{"a":1,"b":null},{"a":2}]', 'json', [], 'yaml');
  const back = run(yaml.text, 'yaml', [], 'json');
  const rows = JSON.parse(back.text);
  assert.ok('b' in rows[0], JSON.stringify(rows));
  assert.ok(!('b' in rows[1]), JSON.stringify(rows));
});

test('xml names the field whose null comes back as the text "null"', () => {
  const r = run('[{"a":1,"b":null},{"a":2}]', 'json', [], 'xml');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(/xml: 1 field\(s\) hold an explicit null, which XML has no spelling for: "b" \(1\)/.test(r.warnings[0]), r.warnings[0]);
  // The file is still written, and it is the loss the warning names: the null is
  // the four letters `null`, and reading that back gives a string.
  assert.match(r.text, /<b>null<\/b>/, r.text);
  const back = run(r.text, 'xml', [], 'json');
  assert.strictEqual(JSON.parse(back.text)[0].b, 'null', back.text);
});

test('every place a null can sit in xml is named, and each by its own name', () => {
  const r = run('[{"a":{"b":null},"c":[1,null],"@d":null},[null]]', 'json', [], 'xml');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  // Nested under a key of its own, a list member under the field that holds it,
  // an attribute under the name it carries, and a null row under the tag it was
  // written as. Counted per field, so a file with 40 000 rows says each once.
  for (const field of ['"b" (1)', '"c" (1)', '"@d" (1)', '"item" (1)']) {
    assert.ok(r.warnings[0].includes(field), `${field} not in ${r.warnings[0]}`);
  }
  assert.ok(r.warnings[0].includes('4 field(s)'), r.warnings[0]);
});

test('the same null counted once per place, not once per row', () => {
  const rows = JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ a: i, b: null })));
  const r = run(rows, 'json', [], 'xml');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].includes('"b" (25)'), r.warnings[0]);
});

test('a string that spells "null" is not a null and is not named', () => {
  for (const value of ['"null"', '""', '"~"', '"NULL"']) {
    const r = run(`[{"a":${value}}]`, 'json', [], 'xml');
    assert.deepStrictEqual(r.warnings, [], `${value}: ${JSON.stringify(r.warnings)}`);
  }
});

test('a file with no null in it is not warned about', () => {
  const r = run('[{"a":1,"b":{"c":"x","d":[1,2]}},{"a":2,"e":"y","f":[3,4]}]', 'json', [], 'xml');
  assert.deepStrictEqual(r.warnings, [], JSON.stringify(r.warnings));
});

test('the table names what the screen cannot show either', () => {
  const r = run('[{"a":1,"b":null},{"a":2}]', 'json', [], 'table');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].startsWith('table:'), r.warnings[0]);
  assert.ok(r.warnings[0].includes('shown empty'), r.warnings[0]);
});

test('a column only a list row contributed is not blamed on the records', () => {
  // `Object.keys` on a list is its positions, so `0` and `1` are columns of the
  // whole file. The records do not have them and never did; the list warning
  // already says what they are, and a second sentence here would name the same
  // loss as if a record had lost a field.
  const r = run('[[1,2],{"a":9}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.ok(r.warnings[0].includes('a list of 2 members'), r.warnings[0]);
});

test('a null row is named like every other row that is not a record', () => {
  // It is the one shape that used to survive SQL — `typeof null` is "object" —
  // and that is exactly why it must not be the one that goes unnamed.
  const r = run('[null,{"a":1}]', 'json', [], 'sql');
  assert.match(r.text, /\(NULL\),\n  \(1\);/);
  assert.ok(r.warnings[0].includes('row 1 is null'), r.warnings[0]);
});

test('two fields renamed to one name are a pipeline error, not a file', () => {
  // Knowable before a byte is read, and wrong for every input: the second write
  // replaces the first in every row, and the output has one field where the
  // pipeline named two. Nothing in the file says a value is gone.
  const r = run('[{"city":"Aarhus","town":"Vejle"}]', 'json',
    [{ op: 'rename', mapping: { city: 'where', town: 'where' } }], 'json');
  assert.ok(r.error.includes('"town" and "city" are both renamed to "where"'), r.error);
  assert.strictEqual(r.usage, true, 'a pipeline that cannot do its job is the user’s own input');
  assert.strictEqual(r.text, undefined, 'nothing is written');
});

test('a rename onto a name the records have says which value is not in the output', () => {
  // A reasonable pipeline — the next file may only have `town` — so the run
  // succeeds and writes its output. What changes is that the value the record's
  // own `city` held is named instead of quietly vanishing.
  const r = run('[{"city":"Aarhus","town":"Vejle"}]', 'json',
    [{ op: 'rename', mapping: { town: 'city' } }], 'json');
  assert.strictEqual(r.error, undefined, r.error);
  assert.match(r.text, /"city": "Vejle"/, r.text);
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /"town" → "city" \(1 of 1\)/, r.warnings[0]);
  assert.match(r.warnings[0], /not in the output/, r.warnings[0]);
});

test('a rename that loses no value says nothing', () => {
  // A swap renames onto names the records have and loses nothing: `a` becomes
  // `b` and `b` becomes `a`, so warning about it would be noise, and a rule
  // broad enough to catch it would fire on every working pipeline. A name
  // nobody has is the ordinary case and stays silent.
  const both = '[{"a":1,"b":2},{"a":3,"b":4}]';
  assert.deepStrictEqual(warningsFor([{ op: 'rename', mapping: { a: 'b', b: 'a' } }], both), []);
  assert.deepStrictEqual(warningsFor([{ op: 'rename', mapping: { town: 'by' } }],
    '[{"city":"Aarhus","town":"Vejle"}]'), []);
  // And the same file through csv, where the file has no way to say it either.
  const r = run('city,town\nAarhus,Vejle\n', 'csv',
    [{ op: 'rename', mapping: { town: 'city' } }], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /"town" → "city" \(1 of 1\)/, r.warnings[0]);
});

test('a list member that carries a name the record has says which value is gone', () => {
  // `{ ...item, [field]: undefined, ...sub }` gives the member the last word on
  // every name it shares with the record, so the record's own value is gone from
  // the output. The run succeeds — the next file may not collide — and the
  // missing value is named instead of vanishing.
  const r = run('[{"id":1,"customer":"alice","items":[{"id":"a-1","sku":"a-1","qty":2}]}]',
    'json', [{ op: 'flatten', field: 'items' }], 'json');
  assert.strictEqual(r.error, undefined, r.error);
  assert.match(r.text, /"id": "a-1"/, r.text);
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /"id" \(1 of 1\) from the "items" list/, r.warnings[0]);
  assert.match(r.warnings[0], /not in the output/, r.warnings[0]);
});

test('every colliding name is named, and the row count is the denominator', () => {
  // Two members lose two different values, and one record out of three collides.
  // A warning that named only the first would leave the other value just as gone
  // as it was, and `(1 of 3)` is what says the pipeline is fine for the other two.
  const r = run('[{"a":1,"b":2,"items":[{"a":9,"b":8}]},{"a":3,"items":[{"a":7}]}]',
    'json', [{ op: 'flatten', field: 'items' }], 'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /2 list members are/, r.warnings[0]);
  assert.match(r.warnings[0], /"a" \(2 of 2\), "b" \(1 of 2\)/, r.warnings[0]);
  assert.match(r.warnings[0], /values that were in those fields are not in the output/, r.warnings[0]);
  // The count is records on both sides of the slash, so a row whose list carries
  // the same name three times is one row that lost a value, not three.
  const repeated = run('[{"sku":"keep","items":[{"sku":"a"},{"sku":"b"},{"sku":"c"}]}]',
    'json', [{ op: 'flatten', field: 'items' }], 'json');
  assert.match(repeated.warnings[0], /"sku" \(1 of 1\)/, repeated.warnings[0]);
});

test('a flatten that loses no value says nothing', () => {
  // The control that keeps the rule from being too broad, in three shapes. A
  // member named after the list field replaces a value the step was asked to
  // take away, so nothing the record held is lost. A member sharing no name with
  // the record is the ordinary case. And a list of scalars has no names in it to
  // collide, which is the path that writes the member under the list's name.
  assert.deepStrictEqual(warningsFor([{ op: 'flatten', field: 'items' }],
    '[{"items":[{"items":"inner"}]}]'), []);
  assert.deepStrictEqual(warningsFor([{ op: 'flatten', field: 'items' }],
    '[{"id":1,"items":[{"sku":"a-1","qty":2}]}]'), []);
  assert.deepStrictEqual(warningsFor([{ op: 'flatten', field: 'items' }],
    '[{"id":1,"items":["a","b"]}]'), []);
  // A prototype name in the member is a name like any other, written as an own
  // field — it must not be mistaken for a collision with an inherited member.
  assert.deepStrictEqual(warningsFor([{ op: 'flatten', field: 'items' }],
    '[{"id":1,"items":[{"toString":"x"}]}]'), []);
  // And the rule before it still fires, so the two do not swallow each other.
  const missing = run('[{"id":1}]', 'json', [{ op: 'flatten', field: 'items' }], 'json');
  assert.strictEqual(missing.warnings.length, 1, JSON.stringify(missing.warnings));
  assert.match(missing.warnings[0], /no record has a field named "items"/, missing.warnings[0]);
});

t('a joined field the left record already has says which value is gone', () => {
  // The join writes a right-hand field only when the left has no name for it, so
  // the joined value is simply not in the output. `docs/cli.md` promises that in
  // prose; the run itself said nothing at all. It succeeds — the next file may
  // not collide — and names the value instead of dropping it silently.
  const r = run('[{"id":1,"name":"outer"}]', 'json',
    [{ op: 'join', on: 'id', with: [{ id: 1, name: 'inner' }] }], 'json');
  assert.strictEqual(r.error, undefined, r.error);
  assert.match(r.text, /"name": "outer"/, r.text);
  assert.doesNotMatch(r.text, /inner/, 'the dropped value must not be in the output');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /a joined field is already a field in the left records/, r.warnings[0]);
  assert.match(r.warnings[0], /"name" \(1 of 1\)/, r.warnings[0]);
  assert.match(r.warnings[0], /is not in the output/, r.warnings[0]);
});

t('a prefix that does not make room is named as the prefix it was', () => {
  // The documented way out, and the case that matters most: `prefix: "x_"` is
  // what the docs tell the user to reach for, and on a left row that already has
  // `x_name` it drops the value just the same. The message leads with the prefix,
  // because "pick a prefix that is not already in use" is advice no user can act
  // on without reading every left row.
  const r = run('[{"id":1,"name":"outer","x_name":"already"}]', 'json',
    [{ op: 'join', on: 'id', prefix: 'x_', with: [{ id: 1, name: 'inner' }] }], 'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /join: with prefix "x_",/, r.warnings[0]);
  // The name reported is the one that was actually taken, not the bare one.
  assert.match(r.warnings[0], /"x_name" \(1 of 1\)/, r.warnings[0]);
  // And the prefix that does make room still says nothing at all.
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', prefix: 'x_', with: [{ id: 1, name: 'inner' }] }],
    '[{"id":1,"name":"outer"}]'), []);
});

t('every colliding joined name is named, and the row count is the denominator', () => {
  // Two joined fields lose two values across two of three rows, and a warning
  // naming only the first would leave the other value just as gone.
  const r = run('[{"id":1,"name":"a","tier":"x"},{"id":2,"name":"b","tier":"y"},{"id":3,"name":"c"}]',
    'json',
    [{ op: 'join', on: 'id', with: [{ id: 1, name: 'R1', tier: 'T1' }, { id: 2, name: 'R2', tier: 'T2' }] }],
    'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /2 joined fields are/, r.warnings[0]);
  assert.match(r.warnings[0], /"name" \(2 of 2\), "tier" \(2 of 2\)/, r.warnings[0]);
  assert.match(r.warnings[0], /values that would have gone there are not in the output/, r.warnings[0]);
  // The denominator is the rows a join could have written into, not the rows that
  // matched nothing. A right-hand row carrying the same name three times is one
  // row that lost a value, not three.
  const repeated = run('[{"sku":"keep"}]', 'json',
    [{ op: 'join', on: 'sku', with: [{ sku: 'keep', a: 1, a: 2, a: 3 }] }], 'json');
  assert.deepStrictEqual(repeated.warnings, [], 'duplicate JSON keys collapse in the reader, so nothing collides');
});

t('a join that loses no value says nothing', () => {
  // The control that keeps the rule from being too broad, in four shapes. A
  // right-hand field named after the join key is skipped on purpose, and the left
  // row holds that value by definition of the match. A right value equal to the
  // left one loses nothing — the same reason `{a: b, b: a}` does not warn in
  // rename. A field only one side has is the ordinary join. And a row that
  // matched nothing had no joined value to lose.
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', with: [{ id: 1 }] }], '[{"id":1,"name":"outer"}]'), []);
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', with: [{ id: 1, name: 'outer' }] }],
    '[{"id":1,"name":"outer"}]'), []);
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', with: [{ id: 1, tier: 'gold' }] }],
    '[{"id":1,"name":"outer"}]'), []);
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', with: [{ id: 77, name: 'x' }] }],
    '[{"id":1,"name":"outer"}]'), []);
  // A nested value compares by content, not by identity: two equal objects are
  // one value under one name, and nothing is lost.
  assert.deepStrictEqual(warningsFor([{ op: 'join', on: 'id', with: [{ id: 1, meta: { a: 1, b: [2] } }] }],
    '[{"id":1,"meta":{"b":[2],"a":1}}]'), []);
  // The rule before it still fires, so the two do not swallow each other: the
  // left has the key and the right does not, which is the one-sided message.
  const missing = run('[{"id":1,"city":"Aarhus","name":"outer"}]', 'json',
    [{ op: 'join', on: 'city', with: [{ id: 1, name: 'inner' }] }], 'json');
  assert.strictEqual(missing.warnings.length, 1, JSON.stringify(missing.warnings));
  assert.match(missing.warnings[0], /no record on the right has a field named "city"/, missing.warnings[0]);
});

t('the joined value that is dropped is reported through csv too', () => {
  // CSV has no way to say what a writer left out, so the warning has to reach the
  // format that cannot carry it — the same reason the earlier rules hang on the
  // transform rather than on a writer.
  const r = run('id,name\n1,outer\n', 'csv',
    [{ op: 'join', on: 'id', with: [{ id: 1, name: 'inner' }] }], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /"name" \(1 of 1\)/, r.warnings[0]);
  assert.strictEqual(r.text, 'id,name\n1,outer', r.text);
});

t('a whole number that a number cannot hold is named, once, with the value it became', () => {
  // 9223372036854775807 is the largest 64-bit signed integer, and it is the
  // shape a snowflake id, an order number or an amount in minor units has. It
  // does not survive being read: the nearest double is printed back with
  // different digits, so the output holds a value the input never had.
  const r = run('[{"id":9223372036854775807},{"id":9223372036854775807}]', 'json', [], 'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /^JSON: 9223372036854775807 /, r.warnings[0]);
  // The value that came out is named, because that is the number the user will
  // find in the file and have to look for.
  assert.match(r.warnings[0], /read as 9223372036854776000/, r.warnings[0]);
  // Two rows, one sentence: the count is what keeps a file from saying the
  // same thing once per row.
  assert.match(r.warnings[0], /in 2 places/, r.warnings[0]);
});

t('a whole number that survives the reading is not named', () => {
  // Counting digits would be wrong at both ends of this list, and that is why
  // the rule asks whether the two values are the same number instead:
  // 9007199254740994 is sixteen digits and exact, 10000000000000000000 is
  // twenty and exact, 1.0 and 1e5 are only spelled differently, and the digits
  // inside a string were never a number at all. 123456789012345678 was measured
  // to belong in the other test: eighteen digits that look safe and are not.
  const r = run(
    '[{"a":9007199254740991},{"a":9007199254740992},{"a":9007199254740994},' +
    '{"a":10000000000000000000},{"a":1.0},{"a":1.50},' +
    '{"a":1e5},{"a":0.1},{"a":"AB-9007199254740993"}]', 'json', [], 'json');
  assert.deepStrictEqual(r.warnings, []);
  // The largest double there is, in the seventeen digits it can be written in.
  // Its exact value as a literal and the double behind it differ from the
  // seventeenth digit on, and no reader can see that — so the rule compares the
  // digits the file shows, and a file this tool wrote itself stays silent.
  assert.deepStrictEqual(
    run('[{"v":1.7976931348623157e308},{"w":5e-324},{"x":-0.0}]', 'json', [], 'json').warnings, []);
});

t('the same rule reads a YAML scalar, and a flow one with it', () => {
  const block = run('id: 9007199254740993\nname: Ada\n', 'yaml', [], 'json');
  assert.strictEqual(block.warnings.length, 1, JSON.stringify(block.warnings));
  assert.match(block.warnings[0], /^YAML: 9007199254740993 /, block.warnings[0]);
  assert.match(block.warnings[0], /read as 9007199254740992/, block.warnings[0]);
  const flow = run('{a: 9223372036854775807}\n', 'yaml', [], 'json');
  assert.strictEqual(flow.warnings.length, 1, JSON.stringify(flow.warnings));
  assert.match(flow.warnings[0], /read as 9223372036854776000/, flow.warnings[0]);
  // A quoted YAML scalar is a string, so it never goes through the number and
  // there is nothing to have lost.
  assert.deepStrictEqual(run('id: "9007199254740993"\n', 'yaml', [], 'json').warnings, []);
});

t('a whole number written with an exponent is still a whole number', () => {
  // 9.007199254740993e15 is 9007199254740993 written another way, and it is the
  // one digit-count rule and the one spelling rule both miss.
  const r = run('[{"a":9.007199254740993e15},{"b":1e15},{"c":-1.25e2}]', 'json', [], 'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  // The sentence no longer says "whole number", because the rule now reaches
  // decimals too; what it has to keep saying is the literal as it was written,
  // exponent and all, so the user can find it in their own file.
  assert.match(r.warnings[0], /9\.007199254740993e15 is written with more detail/, r.warnings[0]);
  // -1.25e2 is -125 exactly, so it is a whole number that is held exactly.
  assert.match(r.warnings[0], /in 1 place/, r.warnings[0]);
  // Eighteen digits that read as safe, and are not: 123456789012345678 comes
  // back as 123456789012345680. No digit count could have told the two apart.
  const long = run('[{"a":123456789012345678}]', 'json', [], 'json');
  assert.strictEqual(long.warnings.length, 1, JSON.stringify(long.warnings));
  assert.match(long.warnings[0], /read as 123456789012345680/, long.warnings[0]);
});

t('a whole number too large for any number is left to the writer that refuses it', () => {
  // 1e400 is not read as a changed value, it is read as no value at all, and
  // the writer already says so out loud and exits 1. Two rules for one file
  // would only make the loud one harder to find.
  const r = run('[{"a":1e400}]', 'json', [], 'json');
  assert.match(r.error, /Infinity/, JSON.stringify(r));
});

t('the readers that never lose a value stay silent', () => {
  // CSV and XML hand every value on as text, so nothing is rounded before a
  // writer sees it. Measured, not assumed: these two were silent before the
  // rule existed too.
  assert.deepStrictEqual(run('id\n9007199254740993\n', 'csv', [], 'json').warnings, []);
  assert.deepStrictEqual(run('<r><i><id>9007199254740993</id></i></r>', 'xml', [], 'json').warnings, []);
  // The same two readers with a decimal that the number readers lose, because
  // this is not a property of JSON and YAML: it is a property of rounding.
  assert.deepStrictEqual(run('v\n123456789012345678.5\n', 'csv', [], 'json').warnings, []);
  assert.deepStrictEqual(run('<r><v>123456789012345678.5</v></r>', 'xml', [], 'json').warnings, []);
});

t('a decimal that changes on the way in is named, with the value it became', () => {
  // 123456789012345678.5 is eighteen whole digits and a half. The rule that
  // asked "is this an integer that fits" never saw it, because its fraction
  // does not survive the shift into an integer — so the value came out as
  // 123456789012345680 with nothing on stderr, in all six output formats, and
  // the same class as the integer two iterations back went unnamed.
  const r = run('[{"v":123456789012345678.5},{"v":123456789012345678.5}]', 'json', [], 'json');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /^JSON: 123456789012345678\.5 /, r.warnings[0]);
  // The value that came out is named, because that is the number the user will
  // have to look for in the file they now have.
  assert.match(r.warnings[0], /read as 123456789012345680/, r.warnings[0]);
  // Two rows, one sentence — the same counting as the whole number above it,
  // because a file decides how often its own mistake repeats.
  assert.match(r.warnings[0], /in 2 places/, r.warnings[0]);
  // The half is the point: 9007199254740993.5 and 9007199254740993.25 are the
  // integer that was already reported, with a fraction the old rule dropped on
  // its way to the integer test, and both lose the half as well as a digit.
  for (const literal of ['9007199254740993.5', '9007199254740993.25', '-123456789012345678.5']) {
    const one = run(`[{"v":${literal}}]`, 'json', [], 'json');
    assert.strictEqual(one.warnings.length, 1, `${literal}: ${JSON.stringify(one.warnings)}`);
    assert.match(one.warnings[0], new RegExp(`^JSON: ${literal.replace(/[.\-]/g, '\\$&')} `),
      one.warnings[0]);
  }
});

t('a number written with more decimals than a number keeps is named', () => {
  // 1.0000000000000000000000000000000001 is thirty-four digits, and the
  // seventeen a double can tell apart are all the same: the file says "1 and
  // then thirty-three zeros and a one" and the output says "1". Nothing about
  // the size of the number is involved, which is why the rule cannot be about
  // magnitude — only the last shown digit says anything here.
  const r = run('[{"v":1.0000000000000000000000000000000001},{"v":0.100000000000000000001}]',
    'json', [], 'json');
  assert.strictEqual(r.warnings.length, 2, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /^JSON: 1\.0000000000000000000000000000000001 /, r.warnings[0]);
  assert.match(r.warnings[0], /read as 1 in 1 place/, r.warnings[0]);
  assert.match(r.warnings[1], /^JSON: 0\.100000000000000000001 /, r.warnings[1]);
  assert.match(r.warnings[1], /read as 0\.1 /, r.warnings[1]);
  // The whole-value spelling of the same file: twenty digits that are exactly
  // held, and twenty decimals that are not. One rule decides both, because the
  // place the last digit stands in is the only thing it asks about.
  assert.deepStrictEqual(run('[{"a":10000000000000000000},{"b":0.10000000000000000000}]',
    'json', [], 'json').warnings, []);
});

t('a decimal that is held exactly is not named, whatever it is written as', () => {
  // This is the half of the rule that decides whether it can be used at all: it
  // has to stay silent on every number a correct writer produces, or it is
  // noise on good input. None of these is quiet because of its size, its
  // exponent or the number of its decimals — each is quiet because the value
  // that came out is the value the file wrote, in every digit the file showed.
  assert.deepStrictEqual(run(
    '[{"a":19.99},{"b":0.07},{"c":1.50},{"d":100.00},{"e":1.005},{"f":2.675},' +
    '{"g":0.30000000000000004},{"h":0.8455124082255701},{"i":33.33},{"j":1e-7},' +
    '{"k":0.0000001},{"l":123.456},{"m":-0.0},{"n":1.7976931348623157e308},' +
    '{"o":5e-324},{"p":1.0},{"q":123456789.123456},{"r":2.2250738585072014e-308}]',
    'json', [], 'json').warnings, []);
  // Fifteen digits that carry the value is where the fast path stops and the
  // exact comparison starts, so both sides of that line are here: this one is
  // held, and the next one is not — 1234567890123456.7 comes back as
  // 1234567890123456.8, which is a different amount of money.
  assert.deepStrictEqual(run('[{"v":123456789012345.67}]', 'json', [], 'json').warnings, []);
  const edge = run('[{"w":1234567890123456.7}]', 'json', [], 'json');
  assert.strictEqual(edge.warnings.length, 1, JSON.stringify(edge.warnings));
  assert.match(edge.warnings[0], /read as 1234567890123456\.8/, edge.warnings[0]);
});

t('the same rule reads a decimal YAML scalar, and leaves a quoted one alone', () => {
  const block = run('v: 123456789012345678.5\nname: Ada\n', 'yaml', [], 'json');
  assert.strictEqual(block.warnings.length, 1, JSON.stringify(block.warnings));
  assert.match(block.warnings[0], /^YAML: 123456789012345678\.5 /, block.warnings[0]);
  assert.match(block.warnings[0], /read as 123456789012345680/, block.warnings[0]);
  // A flow scalar is a number too, and a quoted one is a string, so there is
  // nothing to have lost.
  const flow = run('{v: 123456789012345678.5}\n', 'yaml', [], 'json');
  assert.strictEqual(flow.warnings.length, 1, JSON.stringify(flow.warnings));
  assert.match(flow.warnings[0], /read as 123456789012345680/, flow.warnings[0]);
  assert.deepStrictEqual(run('v: "123456789012345678.5"\n', 'yaml', [], 'json').warnings, []);
  // A decimal deeper in the file is reached the same way, so the rule is not
  // attached to the first number it meets.
  const deep = run('outer:\n  inner:\n    v: 1.0000000000000000000000000000000001\nn: 2\n',
    'yaml', [], 'json');
  assert.strictEqual(deep.warnings.length, 1, JSON.stringify(deep.warnings));
  assert.match(deep.warnings[0], /^YAML: 1\.0000000000000000000000000000000001 /, deep.warnings[0]);
});

t('the advice the warning gives is a way out that works today', () => {
  // Quoting is the only lossless answer the readers have, so a warning that
  // recommends it is recommending something real and not a promise.
  const quoted = run('[{"id":"9223372036854775807"}]', 'json', [], 'csv');
  assert.deepStrictEqual(quoted.warnings, []);
  assert.strictEqual(quoted.text, 'id\n9223372036854775807', quoted.text);
  // The same answer for the decimals, measured rather than assumed: all
  // nineteen digits of the half, and all thirty-four of the deep decimal, come
  // back out through CSV exactly as they went in.
  const quotedDecimal = run('[{"v":"123456789012345678.5"}]', 'json', [], 'csv');
  assert.deepStrictEqual(quotedDecimal.warnings, []);
  assert.strictEqual(quotedDecimal.text, 'v\n123456789012345678.5', quotedDecimal.text);
  const quotedDeep = run('[{"v":"1.0000000000000000000000000000000001"}]', 'json', [], 'csv');
  assert.deepStrictEqual(quotedDeep.warnings, []);
  assert.strictEqual(quotedDeep.text, 'v\n1.0000000000000000000000000000000001', quotedDeep.text);
  // And the unquoted ones really are changed in the file the user is handed,
  // so the advice is not a way of keeping a value that was never lost.
  assert.match(run('[{"v":123456789012345678.5}]', 'json', [], 'csv').text,
    /123456789012345680/, 'the value in the file is the one that changed');
});

t('a byte order mark is the file saying what it is, not the file saying something', () => {
  // Measured on the real binary before the rule existed: the same three bytes
  // are read by three of the four readers, because String.prototype.trim()
  // removes U+FEFF and they all trim. JSON.parse does not trim, so the reader
  // that had the least excuse refused the file outright — exit 3 and a message
  // that points at the character, not at the reason it is there. PowerShell
  // 5.1, many Windows editors and a fair number of export buttons write one.
  const bom = '\uFEFF';
  const r = run(`${bom}[{"id":1,"name":"Ada"}]`, 'json', [], 'csv');
  assert.ok(!r.error, 'a marked JSON file must be read: ' + JSON.stringify(r));
  assert.deepStrictEqual(r.data, [{ id: 1, name: 'Ada' }]);
  assert.strictEqual(r.text.trim(), 'id,name\n1,Ada', r.text);
  // It is an encoding marker at the very start of the file, so exactly one goes.
  // The other three readers already behaved this way, and now they behave this
  // way for a reason instead of by accident.
  assert.deepStrictEqual(run(`${bom}id\n1\n`, 'csv', [], 'json').data, [{ id: 1 }]);
  assert.deepStrictEqual(run(`${bom}id: 1\n`, 'yaml', [], 'json').data, [{ id: 1 }]);
  assert.deepStrictEqual(run(`${bom}<r><i id="1"/></r>`, 'xml', [], 'json').data, [{ '@id': '1' }]);
  // U+FEFF anywhere else is the file's own text and is the user's data. A BOM
  // on the second line, and one inside a value, are both kept — a marker is
  // only a marker at the front, and a value that starts with an invisible
  // character is not something to repair.
  const second = run(`\n${bom}{"a":1}`, 'json', [], 'json');
  assert.match(second.error, /Unexpected token/, 'only the first character is a marker: ' + JSON.stringify(second));
  const inValue = run(`{"a":"${bom}x"}`, 'json', [], 'csv');
  assert.ok(!inValue.error, inValue.error);
  assert.deepStrictEqual(inValue.data, [{ a: `${bom}x` }]);
  // Measured while writing this: the CSV writer already quotes a cell that
  // begins with a mark, so a value like this cannot be read back as a marker
  // in front of a file. It is quoted on the way out, and left alone on the way
  // in — the two rules do not have to know about each other.
  assert.strictEqual(inValue.text.trim(), `a\n"${bom}x"`, JSON.stringify(inValue.text));
  // A file with two of them in front is not a marked file, it is a marked file
  // with a stray character, and the reader says so rather than picking one.
  const two = run(`${bom}${bom}{"a":1}`, 'json', [], 'json');
  assert.match(two.error, /Unexpected token/, JSON.stringify(two));
  // The number rules still see the text they are meant to see: the marker is
  // gone before the file is walked, so a file that both starts with one and
  // loses a digit is reported for the digit alone.
  const both = run(`${bom}[{"v":123456789012345678.5}]`, 'json', [], 'json');
  assert.strictEqual(both.warnings.length, 1, JSON.stringify(both.warnings));
  assert.match(both.warnings[0], /^JSON: 123456789012345678\.5 /, both.warnings[0]);
});

t('a directive is the file naming its YAML version, not a document of its own', () => {
  // Measured on the real binary before this rule existed. A directive line is
  // `%` in the first column, and Kubernetes manifests, Ansible playbooks and a
  // good deal of CI config open with one. `%` is a YAML indicator, so no plain
  // scalar can begin with one and such a line is only ever a directive — but
  // the reader counted it as the document, so everything under it was never
  // read. The mapping came out as the one string "%YAML 1.2" and the
  // "2 documents" warning pointed at a second document the file did not have.
  const mapping = run('%YAML 1.2\n---\nid: 1\nname: Ada\n', 'yaml', [], 'json');
  assert.ok(!mapping.error, mapping.error);
  assert.deepStrictEqual(mapping.data, [{ id: 1, name: 'Ada' }]);
  // The warning went with the bug: the file has one document, and saying two
  // sent the user looking for a second one that was never there.
  assert.deepStrictEqual(mapping.warnings, [], JSON.stringify(mapping.warnings));
  assert.deepStrictEqual(run('%YAML 1.1\n---\n- a\n- b\n', 'yaml', [], 'json').data, ['a', 'b']);
  // A %TAG directive, and both directives over each other. The `%TAG` one was
  // worse than a lost document: it read as a record whose only field was the
  // directive's own text, mapped to null.
  assert.deepStrictEqual(run('%TAG !e! tag:example.com,2000:\n---\nid: 1\n', 'yaml', [], 'json').data, [{ id: 1 }]);
  assert.deepStrictEqual(
    run('%YAML 1.2\n%TAG !e! tag:example.com,2000:\n---\nid: 1\n', 'yaml', [], 'json').data, [{ id: 1 }]);
  // Without a `---` the lines under the directive are the document, so the
  // directive is skipped and what follows is read. This one was the silent
  // half of the bug: the same file with a `---` warned, this one said nothing
  // at all and still lost the mapping.
  const noMarker = run('%YAML 1.2\nid: 1\nname: Ada\n', 'yaml', [], 'json');
  assert.deepStrictEqual(noMarker.data, [{ id: 1, name: 'Ada' }]);
  assert.deepStrictEqual(noMarker.warnings, [], JSON.stringify(noMarker.warnings));
  // A tag handle in a key is data this tool does not resolve, and it keeps the
  // handle whole: neither split into a namespace and a local name, which would
  // invent a shape nobody wrote, nor refused, which would break files that
  // convert today.
  assert.deepStrictEqual(
    run('%TAG !e! tag:example.com,2000:app/\n---\n!e!foo: bar\n', 'yaml', [], 'json').data,
    [{ '!e!foo': 'bar' }]);

  // Controls. `---` on its own is not a directive and not an error, and it did
  // not warn before this rule either.
  const bare = run('---\nid: 1\n', 'yaml', [], 'json');
  assert.deepStrictEqual(bare.data, [{ id: 1 }]);
  assert.deepStrictEqual(bare.warnings, [], JSON.stringify(bare.warnings));
  // Two real documents still say only the first was read — the rule must not be
  // able to swallow that, which is why the directive check stops at the first
  // document's own end marker.
  const two = run('a: 1\n---\nb: 2\n', 'yaml', [], 'json');
  assert.deepStrictEqual(two.data, [{ a: 1 }]);
  assert.ok(/only the first was read/.test(two.warnings[0]), JSON.stringify(two.warnings));
  const later = run('a: 1\n---\n%YAML 1.2\nb: 2\n', 'yaml', [], 'json');
  assert.deepStrictEqual(later.data, [{ a: 1 }]);
  assert.ok(/only the first was read/.test(later.warnings[0]), JSON.stringify(later.warnings));
  // A `%` that is not in the first column is not a directive: it belongs to the
  // block that holds it. A `|` scalar carrying a shell snippet and a percentage
  // in a value are both measured clean, and a rule that fired on them would
  // make every config file an error.
  const script = run('script: |\n  %YAML not a directive\nid: 1\n', 'yaml', [], 'json');
  assert.deepStrictEqual(script.data, [{ script: '%YAML not a directive\n', id: 1 }]);
  assert.deepStrictEqual(run('id: 1\nnote: 100% off\n', 'yaml', [], 'json').data,
    [{ id: 1, note: '100% off' }]);
  // Indented further than its key is an indentation error, and stays one.
  assert.match(run('id: 1\n  %YAML 1.2\n', 'yaml', [], 'json').error, /unexpected indentation/);

  // A directive stands *before* a document, so one that stands inside one is
  // not a value to keep. In a mapping it already failed loudly, but in a
  // sequence it ended the document and took the rest of the file with it:
  // `- a`, `%YAML 1.2`, `- b` read as the single record "a", exit 0, empty
  // stderr. One check for every shape of document, so they all say the same
  // thing, and the message names the line and the line's own text.
  for (const [text, needle] of [
    ['- a\n%YAML 1.2\n- b\n', 'YAML line 2'],
    ['id: 1\n%YAML 1.2\nname: Ada\n', 'YAML line 2'],
    ['alpha\n%YAML 1.2\nbeta\n', 'YAML line 2'],
    ['items:\n  - a\n%YAML 1.2\n', 'YAML line 3'],
  ]) {
    const r = run(text, 'yaml', [], 'json');
    assert.ok(r.error, `a directive inside a document must not be read: ${JSON.stringify(r)}`);
    assert.match(r.error, new RegExp(needle), r.error);
    assert.match(r.error, /only allowed before the document/, r.error);
  }
});

t('a backslash in a SQL value is named, and the value is still written as it is', () => {
  // The file is correct for the SQL it is written for, and that was measured
  // rather than assumed: sqlite3 3.50.6 imports `C:\Users\Ada`, `a\nb` and a
  // value *ending* in a backslash, and gives all three back as text with every
  // character in it. MySQL and MariaDB read the same file as an escape, so the
  // warning names the columns rather than rewriting a value that is right for
  // one dialect and wrong for the other whichever way it is spelled.
  const r = run('[{"path":"C:\\\\Users\\\\Ada"}]', 'json', [], 'sql');
  const out = serializers.sql(r.data);
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /^sql: 1 of 1 columns hold a value with a backslash/, r.warnings[0]);
  assert.match(r.warnings[0], /"path" \(1\)/, r.warnings[0]);
  assert.match(r.warnings[0], /NO_BACKSLASH_ESCAPES/, r.warnings[0]);
  // The value itself is untouched: the warning is the whole difference.
  assert.ok(out.includes("('C:\\Users\\Ada')"), out);

  // Both shapes that change a value on the way in are named, and a row count is
  // a count of rows: two of two rows, not two columns.
  const two = run('[{"p":"a\\\\b"},{"p":"c\\\\d"}]', 'json', [], 'sql');
  assert.strictEqual(two.warnings.length, 1, JSON.stringify(two.warnings));
  assert.match(two.warnings[0], /"p" \(2\)/, two.warnings[0]);
  const tail = run('[{"p":"end\\\\"}]', 'json', [], 'sql');
  assert.match(tail.warnings[0], /"p" \(1\)/, tail.warnings[0]);
  assert.ok(serializers.sql(tail.data).includes("('end\\')"), serializers.sql(tail.data));

  // A nested value is written as a JSON string literal, so a backslash inside it
  // is in the file too and is counted — the rule reads the literals the file was
  // written with, not the values the user typed.
  const nested = run('[{"o":{"a":"x\\\\y"}}]', 'json', [], 'sql');
  assert.strictEqual(nested.warnings.length, 1, JSON.stringify(nested.warnings));
  assert.match(nested.warnings[0], /"o" \(1\)/, nested.warnings[0]);

  // Two columns, one of them named: the count is of the columns that hold one.
  const half = run('[{"a":"x\\\\y","b":"plain"}]', 'json', [], 'sql');
  assert.match(half.warnings[0], /^sql: 1 of 2 columns/, half.warnings[0]);

  // Nothing to say, nothing said. A forward-slash path, a number, a boolean, a
  // nested value and a value that holds no backslash are the ordinary case, and
  // a rule that named them would be noise on every file.
  assert.deepStrictEqual(run(
    '[{"p":"C:/Users/Ada"},{"n":19.99},{"b":true},{"o":{"a":"x"}},{"s":"a/b"}]',
    'json', [], 'sql').warnings, []);
  // The same file as CSV, where every value is text, and the same file as YAML.
  assert.deepStrictEqual(run('p\nC:/Users/Ada\n', 'csv', [], 'sql').warnings, []);
  assert.deepStrictEqual(run('p: "C:/Users/Ada"\n', 'yaml', [], 'sql').warnings, []);
});

t('the csv type warning names sql, which is the format that does change the type', () => {
  // Three formats keep a string. One does not: a string that is a number is
  // written as a number literal, so telling a user to switch to "another
  // format" without saying which one is the wrong advice for sql.
  const r = run('[{"v":"19.99"},{"v":"true"},{"v":"x"}]', 'json', [], 'csv');
  assert.strictEqual(r.warnings.length, 1, JSON.stringify(r.warnings));
  assert.match(r.warnings[0], /json, yaml and xml keep the strings/, r.warnings[0]);
  assert.match(r.warnings[0], /except a number, which it writes as a number/, r.warnings[0]);
  // And the claim is the measured one: sql writes a number as a number and
  // keeps a boolean-looking string as text.
  const sql = run('[{"v":"19.99"},{"v":"true"}]', 'json', [], 'sql');
  const text = serializers.sql(sql.data);
  assert.ok(text.includes('(19.99)'), text);
  assert.ok(text.includes("('true')"), text);
});

// ─── YAML block scalars, judged by a reader that is not this one ──────────
//
// Every other YAML test in this file reads a block scalar or writes a plain
// one, and not one of them wrote a *multi-line value* and read it back — so the
// shape a value with a line break in it is written in had no test at all. These
// five are the measured cases: `|-` dropped the value's last character, and a
// value carrying a carriage return was written as a block scalar, which cannot
// hold one. Both were silent, at exit 0, and this tool's own reader agreed with
// the wrong answer, so a round trip through Transmute hid them completely.

t('a block scalar written with |- keeps its last character', () => {
  // The marker says "remove the block's own trailing line break", so the lines
  // written are the whole value. Taking one character off them — the newline
  // the marker gives back for `|` and `|+` — is not a newline to recover.
  // `a\n ` — a last line that is one space — is left out on purpose: the writer
  // now puts it in the file faithfully, but this tool's *reader* trims every
  // line of a block scalar (tokenizeYAML strips trailing whitespace from all of
  // them, where a block scalar's is data), so the round trip below still loses
  // it. That is a reader bug of its own, measured and written up in the plan,
  // and it is not what this rule is about.
  const shapes = [
    ['a\nb', '|-'],
    ['a\nb\nc\nd', '|-'],
    ['a\n\nb', '|-'],
    ['a\nb\n', '|'],
    ['a\nb\n\n', '|+'],
    ['a\n\nb\n', '|'],
    ['a\n', '|'],
    ['a\n\n', '|+'],
    ['a\n\n\n', '|+'],
  ];
  for (const [value, marker] of shapes) {
    const text = serializers.yaml([{ v: value }]);
    assert.ok(text.includes(`v: ${marker}`), `${JSON.stringify(value)} -> ${text}`);
    // Read back by this tool's reader, which is the same one that hid the loss,
    // so a match here is the claim the bug contradicted.
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
});

t('a value with a carriage return is quoted, because a block scalar cannot hold one', () => {
  // YAML normalizes #x0D#x0A, #x0D and #x0A all to a single #x0A in the
  // content of a line break, and a block scalar has no escape to say otherwise.
  for (const value of ['a\r\nb', 'a\r\nb\r\nc', 'a\nb\rc', '\ra\nb', 'a\nb\r']) {
    const text = serializers.yaml([{ v: value }]);
    assert.ok(!/v: \|/.test(text), `${JSON.stringify(value)} -> ${text}`);
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
  // And a lone carriage return already took this path before this rule, so it
  // is a control rather than a new behaviour: it has no line break to make a
  // block scalar out of.
  assert.ok(serializers.yaml([{ v: 'a\rb' }]).includes('"a\\rb"'));
});

t('a multi-line value survives all four readers it is written for', () => {
  // json, csv, sql and the three flat formats carry the line break as data; the
  // block scalar is the only place YAML can keep one without escaping it.
  const value = 'first\nsecond';
  assert.strictEqual(serializers.json([{ v: value }]).includes('first\\nsecond'), true);
  assert.deepStrictEqual(run(serializers.csv([{ v: value }]), 'csv').data, [{ v: value }]);
  const sql = serializers.sql([{ v: value }]);
  assert.ok(sql.includes("'first\nsecond'"), sql);
});

// ─── The indentation indicator: what it says, and who needs it ─────────────
//
// Measured with PyYAML 6.0.3 as the judge, on 44 hand-written YAML files
// through this tool's own reader. Before: 16 of 44 agreed. `blockScalarHeader`
// knew `|`, `>` and the two chomping indicators and nothing else, so a header
// carrying a digit was not a header at all — the value came back as the *text*
// `|2` at exit 0 with empty stderr, and a file whose block was indented
// further than the line above it was refused with exit 3 and
// `unexpected indentation`. T68's class: a valid file the tool cannot open.

t('a block header with an indentation indicator is read as the block it names', () => {
  // The digit says how far in the block's own lines sit, counted from the line
  // the header is on, so the leading spaces the automatic detection would have
  // eaten are content. Every expectation is PyYAML's answer, measured; the
  // "was" is what this tool's reader gave before, on the same files.
  const cases = [
    // clip: two spaces and then `a`, because the block starts at column two
    ['v: |2\n    a\n  b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    // the indicator is counted from the key's column, not the dash's, so the
    // same header in a sequence item asks for four and not two
    ['- v: |2\n      a\n    b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    // ... and from the key's column two levels down, too
    ['a:\n  b: |4\n        x\n      y\n', '  x\ny\n', 'exit 3: unexpected indentation'],
    // the same indicator with each chomping indicator, in either order
    ['v: |4\n      a\n    b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    ['v: |-2\n    a\n  b\n', '  a\nb', 'exit 3: unexpected indentation'],
    ['v: |+2\n    a\n  b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    ['v: |2-\n    a\n  b\n', '  a\nb', 'exit 3: unexpected indentation'],
    // a comment may follow it, as after any other header
    ['v: |2 # why\n    a\n  b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    // an indicator equal to the detected indentation keeps every space
    ['v: |2\n    a\n    b\n', '  a\n  b\n', 'exit 3: unexpected indentation'],
    ['v: |4\n    a\n    b\n', 'a\nb\n', 'exit 3: unexpected indentation'],
    // a leading empty line is content, and it does not move the block
    ['v: |2\n\n    a\n  b\n', '\n  a\nb\n', 'exit 3: unexpected indentation'],
    // a line at exactly the declared indentation is content, not the next key
    ['root:\n  v: |2\n    next: 1\n', 'next: 1\n', 'exit 3: unexpected indentation'],
    // a line at the parent indentation ends the block, as it always has
    ['root:\n  v: |2\n      x\n  next: 1\n', '  x\n', 'exit 3: unexpected indentation'],
    // a plain block scalar in a sequence counts from the dash
    ['- |2\n    a\n  b\n', '  a\nb\n', 'exit 3: unexpected indentation'],
    // trailing spaces on a block's own line are still data
    ['v: |2\n    a   \n  b\n', '  a   \nb\n', 'exit 3: unexpected indentation'],
  ];
  for (const [text, expected, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused (${before}): ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    const v = [got.v, got.b, got.root && got.root.v, got.a && got.a.b].find(x => x !== undefined);
    assert.strictEqual(v !== undefined ? v : got, expected, `${JSON.stringify(text)} (was ${before})`);
  }
});

t('an empty block with an indentation indicator is empty, not the header text', () => {
  // The reader took the whole header as a plain scalar, so `v` came back as the
  // three characters `|2` — a value where the file says there is none, at exit
  // 0 with empty stderr. Every one of these was measured; PyYAML says empty.
  for (const text of ['- v: |2\n', '- v: |2', '- v: |2\n\n', '- v: |2 # c\n']) {
    const r = run(text, 'yaml');
    assert.strictEqual(r.data[0].v, '', JSON.stringify(text));
  }
  // The controls: a header *without* an indicator was already read as an empty
  // block, and stays that way.
  for (const text of ['- v: |\n', '- v: |-\n', '- v: |+\n', '- v: >\n']) {
    assert.strictEqual(run(text, 'yaml').data[0].v, '', JSON.stringify(text));
  }
});

t('a digit that is not an indentation indicator is refused, not guessed at', () => {
  // `|0`, `|02` and `|12` are not headers, and PyYAML refuses all three. Before
  // this rule the reader refused them too, but for the wrong reason and with a
  // message about indentation; what matters is that the answer did not change.
  for (const text of ['- v: |0\n    a\n', '- v: |02\n    a\n  b\n', '- v: |12\n     a\n  b\n']) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `must stay refused: ${JSON.stringify(text)} -> ${JSON.stringify(r.data)}`);
  }
  // And a header that claims more indentation than its first line has is an
  // error, which is the other half of what the digit promises.
  const under = run('v: |2\n a\n', 'yaml');
  assert.ok(under.error, `a line under the declared indentation must not be read: ${JSON.stringify(under)}`);
  assert.match(under.error, /YAML line 2/, under.error);
  assert.match(under.error, /says 2 spaces of indentation/, under.error);
  // The same file with the line under the *parent's* indentation never reaches
  // the block at all, and is refused one step earlier — PyYAML refuses it too.
  assert.ok(run('- v: |2\n a\n', 'yaml').error, 'must stay refused');
  // A sequence item's header counts from the key's column, so the same file
  // with the second line at two is a line *under* the declared four, and both
  // readers refuse it.
  assert.ok(run('- v: |2\n    a\n  b\n', 'yaml').error, 'must stay refused');
});

t('a multi-line value whose first line starts with a space is written with the indicator', () => {
  // The block is written two spaces in from the key, so a first line that
  // begins with a space would be *indentation* to a reader — and then the rest
  // of the block, written at two, is under-indented and the file is not YAML
  // any more. Measured with PyYAML, which raised a ParserError on every file
  // written before this rule, while this tool's own reader read all of them
  // back unharmed: the file was the thing that was wrong, and only other
  // readers ever saw it.
  for (const value of [' a\nb', '  deep\nx', '   \na', ' a\n b\nc', ' a\n']) {
    const text = serializers.yaml([{ v: value }]);
    assert.match(text, /- v: \|-?\+?2\n/, `${JSON.stringify(value)} -> ${text}`);
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
  // The chomping marker keeps its place in front of the digit, and a value that
  // does not start with a space is written the way it always was — a plain
  // marker, because there is nothing for an indicator to say.
  assert.ok(serializers.yaml([{ v: ' a\nb\n' }]).includes('- v: |2\n'), serializers.yaml([{ v: ' a\nb\n' }]));
  // `a\n b` is a control for the leading-space rule: the space is on a *later*
  // line, where the automatic detection has already found the block, so it is
  // data and needs no indicator. `a\n\tb` is left out on purpose — a tab in a
  // block scalar line is read as a space (`tokenizeYAML`'s `^[ \t]*` eats it as
  // indentation and the dedent puts a space back), which is a reader bug of its
  // own, measured and written up in the plan.
  for (const value of ['a\nb', 'a\nb\n', 'a\nb\n\n', 'a\n b', 'a\n  b\nc']) {
    const text = serializers.yaml([{ v: value }]);
    assert.ok(!/v: \|[+-]?\d/.test(text), `${JSON.stringify(value)} -> ${text}`);
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
});

// ─── Folding stops at a line indented deeper than the block ─────────────────
//
// Measured with PyYAML 6.0.3 as the judge, on 26 hand-written YAML files
// through this tool's own reader. Before: 13 of 26 agreed. The fold loop asked
// only "is this line empty" and never "is this line indented further than the
// block", so a line indented deeper than the block had the break before it
// folded to a space like any prose line: `v: >` / `a` / `  b` came back
// `'a   b\n'` where PyYAML says `'a\n  b\n'` — a line break replaced by a space,
// in a value that says it is folded, so nothing in the file said so.

t('a folded block keeps the break around a line indented deeper than itself', () => {
  // Every expectation is PyYAML's answer, measured; the "was" is what this
  // tool's reader gave before, on the same files.
  const cases = [
    // The class itself: one deeper line, in the middle and at the end.
    ['v: >\n    a\n      b\n', 'a\n  b\n', "'a   b\\n'"],
    ['v: >\n    a\n      b\n    c\n', 'a\n  b\nc\n', "'a   b c\\n'"],
    // Each chomping indicator folds the same way; only the end differs.
    ['v: >-\n    a\n      b\n', 'a\n  b', "'a   b'"],
    ['v: >+\n    a\n      b\n', 'a\n  b\n', "'a   b\\n'"],
    // The rule is about the block's own indentation, so an explicit indicator
    // says the same thing from the other direction and is answered the same way.
    ['v: >2\n  a\n    b\n', 'a\n  b\n', "'a   b\\n'"],
    ['v: >2 # note\n  a\n    b\n', 'a\n  b\n', "'a   b\\n'"],
    // Deeper lines in a row, and each one deeper than the last.
    ['v: >\n    a\n      b\n      c\n    d\n', 'a\n  b\n  c\nd\n', "'a   b   c d\\n'"],
    ['v: >\n    a\n      b\n        c\n    d\n', 'a\n  b\n    c\nd\n', "folded to spaces"],
    // Prose on both sides of a deeper line, and a deeper line in the middle of
    // it — the fold resumes as soon as both neighbours are ordinary lines again.
    ['v: >2\n    b\n  c\n  d\n', '  b\nc d\n', "'b c d\\n' — the leading two spaces went too"],
    ['v: >\n    one two\n      three\n    four five\n', 'one two\n  three\nfour five\n', "'one two   three four five\\n'"],
    // A deeper line and then a run of prose, where only the first break folds.
    ['v: >+\n    a\n      b\n    c\n', 'a\n  b\nc\n', "'a   b c\\n'"],
    // The block's shape around the sequence dash is the same question.
    ['- v: >\n    a\n      b\n', 'a\n  b\n', "'a   b\\n'"],
    // Trailing spaces on a deeper line are data, as everywhere else.
    ['v: >\n    a\n      b   \n', 'a\n  b   \n', "'a   b   \\n'"],
  ];
  for (const [text, expected, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, `${JSON.stringify(text)} (was ${before})`);
  }
});

t('an empty line after a deeper line carries two breaks, not one', () => {
  // The empty line spends the fold of the break before it and carries a break of
  // its own. After a deeper line that break is not a fold, so both are there:
  // PyYAML reads `b`, ``, `c` as 'b\nc', and the same three lines with `b`
  // indented deeper as 'b\n\nc'. This is the difference between "the empty line
  // spent a break" and "there were two breaks", and one newline cannot say which.
  // A *run* of empty lines is the same question asked once more: two empties are
  // three breaks and fold to two, which is what the test below pins down too.
  const cases = [
    ['v: >\n    a\n      b\n\n    c\n', 'a\n  b\n\nc\n', "'a   b\\nc\\n'"],
    ['v: >+\n    a\n      b\n\n', 'a\n  b\n\n', "'a   b\\n'"],
    ['v: >\n    a\n      b\n\n\n    c\n', 'a\n  b\n\n\nc\n', "'a\\n  b\\n\\nc\\n'"],
    // The file's own last line break is the break that *ends* the deeper line,
    // not an empty line inside the block, so it is counted once either way.
    ['v: >+\n    a\n      b\n', 'a\n  b\n', "'a   b\\n'"],
    ['v: >+\n    a\n      b\n\n\n', 'a\n  b\n\n\n', "'a\\n  b\\n\\n'"],
  ];
  for (const [text, expected, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, `${JSON.stringify(text)} (was ${before})`);
  }
});

t('folding a block that has no deeper line is unchanged', () => {
  // The controls, and the reason the rule is safe: an ordinary folded block
  // still folds, because nothing about it is indented deeper than itself. All
  // twelve were measured against PyYAML and agreed before this rule too.
  const cases = [
    ['v: >\n    one\n    two\n', 'one two\n'],
    ['v: >-\n    one\n    two\n', 'one two'],
    ['v: >+\n    one\n    two\n', 'one two\n'],
    ['v: >2\n  one\n  two\n', 'one two\n'],
    // An empty line still spends the break, and the line after it adds none.
    ['v: >\n    one\n\n    three\n', 'one\nthree\n'],
    // A line of nothing but spaces is content, so it spends a break and keeps
    // its spaces — with or without a deeper line around it.
    ['v: >\n    a\n     \n    b\n', 'a\n \nb\n'],
    ['v: >2\n    b\n   \n  c\n', '  b\n \nc\n'],
    ['v: >2\n   \n    b\n  c\n', ' \n  b\nc\n'],
    ['v: >\n    alpha beta gamma delta\n    epsilon\n', 'alpha beta gamma delta epsilon\n'],
  ];
  for (const [text, expected] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, JSON.stringify(text));
  }
});

t('keep keeps every empty line at the end of a folded block', () => {
  // `+` is the one chomping indicator that says *keep them all*, so the empty
  // lines at the end of a block are the value. Each one has a line break of its
  // own and the file has one after it, so `v: >+` / `a` / `b` / `` is 'a b\n\n'
  // — measured with PyYAML, and this read 'a b\n', a line break dropped with no
  // warning on the one indicator whose whole meaning is not to drop anything.
  // Clip and strip are controls: they are the two that are *supposed* to spend
  // the trailing breaks, and they were clean before and after.
  const cases = [
    ['v: >+\n    a\n    b\n\n', 'a b\n\n', "'a b\\n'"],
    ['v: >+\n    a\n    b\n\n\n', 'a b\n\n\n', "'a b\\n'"],
    ['v: >+\n    a\n    b\n\n\n\n', 'a b\n\n\n\n', "'a b\\n'"],
    // The explicit indentation indicator says nothing about chomping, so the
    // same file with one is the same value.
    ['v: >+2\n  a\n  b\n\n', 'a b\n\n', "'a b\\n'"],
    // A file with no last line break has none to keep, and a block that ends
    // where the file ends has no empty line to keep either.
    ['v: >+\n    a\n    b', 'a b', "'a b'"],
    ['v: >\n    a\n    b\n\n', 'a b\n', "'a b\\n'"],
    ['v: >-\n    a\n    b\n\n', 'a b', "'a b'"],
  ];
  for (const [text, expected, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, `${JSON.stringify(text)} (was ${before})`);
  }
});

t('a run of empty lines folds to a line break each, not to one', () => {
  // One empty line spends the fold of the break before it, which is why
  // `one`, `two`, ``, `three` is 'one two\nthree' and not 'one two\n\nthree'.
  // A *run* is a different question: two empty lines are three line breaks, and
  // a run of b breaks folds to b-1, so 'one two\n\nthree' — measured with PyYAML
  // and this read 'one two\nthree', a line break dropped in the middle of a
  // value. Clip is the header `>` gets when no indicator follows it, so this was
  // in the commonest chomping there is and not only under `keep`.
  const cases = [
    ['v: >\n    one\n    two\n\n    three\n', 'one two\nthree\n', "'one two\\nthree\\n'"],
    ['v: >\n    one\n    two\n\n\n    three\n', 'one two\n\nthree\n', "'one two\\nthree\\n'"],
    ['v: >\n    one\n    two\n\n\n\n    three\n', 'one two\n\n\nthree\n', "'one two\\nthree\\n'"],
    // All three chompings agree on the middle of the block; only the tail differs.
    ['v: >-\n    one\n    two\n\n\n    three\n', 'one two\n\nthree', "'one two\\nthree'"],
    ['v: >+\n    one\n    two\n\n\n    three\n', 'one two\n\nthree\n', "'one two\\nthree\\n'"],
    // A break at the front of the block has no break in front of it to fold with,
    // so it stays (PyYAML: a leading empty line is '\none two', and this read
    // 'one two' — a line break dropped at the other end of the same value).
    ['v: >\n\n    one\n    two\n', '\none two\n', "'one two\\n'"],
    ['v: >-\n\n    one\n    two\n', '\none two', "'one two'"],
  ];
  for (const [text, expected, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, `${JSON.stringify(text)} (was ${before})`);
  }
});

t('a literal block has no folding, so a deeper line in it is just content', () => {
  // `|` keeps every break whatever the indentation, so the rule above cannot
  // reach it. Measured as controls, and they were clean before this change too:
  // a literal block that gained a fold would be a different bug than the one
  // this rule fixes.
  const cases = [
    ['v: |\n    a\n      b\n', 'a\n  b\n'],
    ['v: |-\n    a\n      b\n', 'a\n  b'],
    ['v: |+\n    a\n      b\n', 'a\n  b\n'],
    ['v: |2\n  a\n    b\n', 'a\n  b\n'],
  ];
  for (const [text, expected] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    assert.strictEqual(got.v, expected, JSON.stringify(text));
  }
});

// ─── The first line sets the block's indentation ───────────────────────────
//
// Measured with PyYAML 6.0.3 as the judge, on 107 hand-written YAML files
// through this tool's own reader, plus 18 more for the one corner the first pass
// left open. Before: 44 of 107 and 12 of 18. Without an indentation indicator
// the *first* line of a block says where the block's own lines start, so a later
// line indented less is not a line of the block — it is a sibling of the block's
// parent, and a block scalar is a single scalar, so a parser looking for the end
// of the block finds a mapping start or a scalar where the value should be.
// PyYAML answers "expected <block end>, but found" and refuses the file. This
// asked for the *minimum* indentation instead, which is the only answer that
// keeps every line inside the block, so `v: |` / `a` at six / `b` at four came
// back as `'  a\nb\n'`: a file no real parser accepts, read as a value at exit 0
// with empty stderr. T68's class, and the reason the explicit indicator exists.

t('a line under the block its first line opened is refused, not read as a value', () => {
  // Every "was" below is what this tool's reader gave on the same file, measured.
  const cases = [
    // The class itself, through every marker and every chomping: the rule is
    // about where the block starts, so none of the six can reach it.
    ['v: |\n      a\n    b\n', "'  a\\nb\\n'"],
    ['v: >\n      a\n    b\n', "'  a\\nb\\n'"],
    ['v: |-\n      a\n    b\n', "'  a\\nb'"],
    ['v: >-\n      a\n    b\n', "'  a\\nb'"],
    ['v: |+\n      a\n    b\n', "'  a\\nb\\n'"],
    ['v: >+\n      a\n    b\n', "'  a\\nb\\n'"],
    // Three spaces under six, and a second line under the first: the depth of
    // the difference does not matter, only which side of it the first line is.
    ['v: |\n      a\n   b\n', "'   a\\nb\\n'"],
    ['v: |\n      a\n    b\n    c\n', "'  a\\nb\\nc\\n'"],
    // A line that is a *key* is the sharpest case: a reader that keeps it in
    // the block writes a value that contains another mapping's start, and one
    // that ends the block has nowhere to put it.
    ['v: |\n      a\n  b: 1\n', "'    a\\nb: 1\\n'"],
    ['v: |\n      a\n    b: 1\n', "'  a\\nb: 1\\n'"],
    // The block's parent is not the document, and a sequence item is not either:
    // the question is the same one, asked from each parent.
    ['outer:\n  v: |\n      a\n    b: 1\n', "outer.v = '  a\\nb: 1\\n'"],
    ['- v: |\n      a\n    b\n', "'  a\\nb\\n'"],
    // An empty line does not move the block, so the line after it is still
    // under it: `v: |`, six spaces, `a` at six, empty, `b` at four.
    ['v: |\n      a\n\n    b\n', "'  a\\n\\nb\\n'"],
  ];
  for (const [text, before] of cases) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${JSON.stringify(text)} was read as a value (was ${before})`);
    assert.match(r.error, /YAML line \d+/, `${JSON.stringify(text)}: ${r.error}`);
  }
  // The message names the line that opened the block and the line under it,
  // because a file like this is a mistake in a file the user wrote by hand and
  // the two numbers are what they have to look at.
  const r = run('v: |\n      a\n    b\n', 'yaml');
  assert.match(r.error, /YAML line 3/, r.error);
  assert.match(r.error, /first line of this block is indented 6/, r.error);
  assert.match(r.error, /this line is indented 4/, r.error);
  // A file that says `|2` and indents less is the same mistake said out loud,
  // and it was already refused — the two messages differ, the answer does not.
  const explicit = run('v: |2\n    a\n b\n', 'yaml');
  assert.ok(explicit.error, `the explicit form must stay refused: ${JSON.stringify(explicit)}`);
  assert.match(explicit.error, /says 2 spaces of indentation/, explicit.error);
});

t('a line at the block its first line opened is still read, and is not this rule', () => {
  // The controls, and the reason the rule is safe: everything that used to agree
  // with PyYAML still does. A block whose *first* line is its shallowest is
  // untouched, and so is a line that dedents all the way out of the block — to
  // the next key, or to the next item of a sequence.
  const cases = [
    ['v: |\n  a\n  b\n', 'a\nb\n'],
    ['v: >\n  one\n  two\n', 'one two\n'],
    ['v: |\n  a\n    b\n', 'a\n  b\n'],
    ['v: |\n  a\nnext: 1\n', 'a\n'],
    ['v: >\n      a\nnext: 1\n', 'a\n'],
    // Dedenting to the next key of the same mapping, and to the next item of a
    // sequence: a line *at* the parent's indentation never reached the block.
    ['v: |\n      a\n', 'a\n'],
    // An empty line before the block's first line says nothing, and a line of
    // nothing but spaces above it claims the indentation as well — which is why
    // six spaces then `a` at eight is '\na\nb\n' and six spaces then `a` at two
    // is the refusal above.
    ['v: |\n\n  a\n  b\n', '\na\nb\n'],
    ['v: |\n      \n        a\n        b\n', '\na\nb\n'],
    ['v: >\n      \n        a\n        b\n', '\na b\n'],
    ['v: |\n  \n    a\n    b\n', '\na\nb\n'],
    // ... and below the first line with text, a line of spaces is content again
    // (T74's rule), so it does not claim anything.
    ['v: |\n      \n        a\n          \n        b\n', '\na\n  \nb\n'],
    // The explicit indicator is a different rule and answers the same way it
    // always has: the digit says where the block starts, so a deeper first line
    // is content rather than a mistake.
    ['v: |2\n      a\n    b\n', '    a\n  b\n'],
  ];
  for (const [text, expected] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const got = Array.isArray(r.data) ? r.data[0] : r.data;
    const v = [got.v, got.outer && got.outer.v].find(x => x !== undefined);
    assert.strictEqual(v, expected, JSON.stringify(text));
  }
  // A dedent to the next item of a sequence is a two-item file, not a one-item
  // file with a second item inside the value.
  const seq = run('- v: |\n      a\n- b: 1\n', 'yaml');
  assert.strictEqual(seq.data.length, 2, JSON.stringify(seq.data));
  assert.strictEqual(seq.data[1].b, 1, JSON.stringify(seq.data));
});

t('a tab cannot open a line, because YAML has no tab indentation', () => {
  // `tokenizeYAML` read a tab as one space of indentation, so a file PyYAML
  // refuses — "found character '\t' that cannot start any token" — came out
  // here as a value, exit 0, empty stderr. Nine of the thirty measured files
  // were this one rule, through every block marker and in a sequence item.
  const cases = [
    ['v: |\n\ta\n\tb\n', 'a tab under a literal block'],
    ['v: >\n\ta\n\tb\n', 'a tab under a folded block'],
    ['v: |-\n\ta\n\tb\n', 'a tab under a stripped block'],
    ['v: >+\n\ta\n\tb\n', 'a tab under a kept block'],
    ['v: |2\n\ta\n\tb\n', 'a tab under a block that names its indentation'],
    ['- v: |\n\ta\n\tb\n', 'a tab under a block in a sequence item'],
    ['v: |\n  a\n\tb\n', 'a tab in the second line of a block'],
    ['\ta\n', 'a tab opening a plain scalar'],
    ['v: 1\n\t\nw: 2\n', 'a line that is nothing but a tab'],
  ];
  for (const [text, what] of cases) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${what} was read as a value: ${JSON.stringify(r.data)}`);
    assert.match(r.error, /tab character cannot start a line/, `${what}: ${r.error}`);
  }
  // The line number is what the user has to look at, and it is the file's own
  // line, not the line inside the block.
  const r = run('v: |\n  a\n\tb\n', 'yaml');
  assert.match(r.error, /YAML line 3/, r.error);
});

t('a tab inside a block scalar is content, and comes back as a tab', () => {
  // The other half of the same character, and the one that cost data instead of
  // refusing a file: the tab *is* the content once the indentation has begun,
  // but the tokenizer ate it as indentation, so the dedent was handed a column
  // that was not there. This tool's own writer produced the file and this
  // tool's own reader lost the tab — `x\n\ty` came back as `x\n y`.
  for (const value of ['x\n\ty', 'x\n\t\ny', 'a\n\tb\nc', '\ta\n\tb', 'a\n\t\n\nb']) {
    const text = serializers.yaml([{ v: value }]);
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
  // Measured, not guessed: a line whose only content is a tab *below* the
  // block's first line is content like any other, PyYAML reads it as '\t',
  // and the same file written by hand says the same thing.
  assert.strictEqual(run('v: |\n  a\n  \t\n  b\n', 'yaml').data[0].v, 'a\n\t\nb\n');
  // A tab *before* the block's own lines is the rule above and not this one.
  const bad = run('v: |\n  a\n\tb\n', 'yaml');
  assert.ok(bad.error, 'a tab at column 0 is indentation, not content');

  // The controls, and the reason the rule is safe: a tab is legal inside a
  // quoted scalar and inside a comment, and a line of nothing but spaces is
  // still an empty line rather than a tab that survived.
  const quoted = ['"a\tb": 1\n', 'v: "a\tb"\n', "v: 'a\tb'\n", '# a\tb\nv: 1\n'];
  for (const text of quoted) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
  }
  const spaced = run('v: |\n  a\n  \n  b\n', 'yaml');
  assert.strictEqual(spaced.data[0].v, 'a\n\nb\n', JSON.stringify(spaced.data));
  // One space deeper than the block, so one space of it is content: PyYAML
  // reads 'a\n \nb' here, and the line is not empty just because it is blank.
  const padded = run('v: |\n  a\n   \n  b\n', 'yaml');
  assert.strictEqual(padded.data[0].v, 'a\n \nb\n', JSON.stringify(padded.data));
});

t('a tab where a token starts is refused, in every place that ate one', () => {
  // The other half of T79's rule, and the one the measurement grew: PyYAML
  // answers the *same* thing for a tab that cannot open a line and a tab that
  // cannot start a token, so a file carrying one was refused there and read here
  // as a value. Fifteen of the eighteen measured files were this, through five
  // different places, and the message was one string.
  const cases = [
    ['a\tb: 1\n', 'a tab inside a plain key'],
    ['v:\t1\n', 'a tab right after the colon'],
    ['v: a\tb\n', 'a tab inside a plain value'],
    ['v: 1\t\n', 'a tab the trailing trim ate'],
    ['-\ta\n', 'a tab after the dash'],
    ['-  \ta\n', 'a tab after two spaces and a dash'],
    ['-\ta: 1\n', 'a tab after the dash, before an inline mapping'],
    ['-\t\n', 'nothing but a tab after the dash'],
    ['v: {\t"a": 1\t}\n', 'a tab inside a flow mapping'],
    ['v: [\t1, 2]\n', 'a tab inside a flow sequence'],
    ['v: [1\t]\n', 'a tab before a closing bracket'],
    ['v: {\t}\n', 'a tab in an empty flow mapping'],
    ['v: [1,\t2]\n', 'a tab after a flow comma'],
    ['v:\t\n  1\n', 'a tab where the value should begin'],
    ['a\tb:\t1\n', 'a tab in the key and after the colon']
  ];
  for (const [text, what] of cases) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${what} was read as a value: ${JSON.stringify(r.data)}`);
    assert.match(r.error, /found character '\\t' that cannot start any token/, `${what}: ${r.error}`);
  }
  // The line the user has to open is the file's own.
  assert.match(run('k: 1\nv: a\tb\n', 'yaml').error, /YAML line 2/);
});

t('a tab is legal in a quoted scalar and in a block scalar, and stays data', () => {
  // The control table, written because the fix is a refusal: a tab the user typed
  // on purpose must survive, and these are the places PyYAML accepts one. All
  // eighteen were measured against PyYAML 6.0.3 through the real binary, and the
  // twelve block-scalar shapes below are the ones a block reader can reach.
  const legal = [
    ['"a\tb": 1\n', [{ 'a\tb': 1 }]],
    ["v: 'a\tb'\n", [{ v: 'a\tb' }]],
    ['v: 1 # a\tb\n', [{ v: 1 }]],
    ['v: {"a\tb": 1}\n', [{ v: { 'a\tb': 1 } }]],
    ['v: ["a\tb"]\n', [{ v: ['a\tb'] }]],
    ['v: |\n  a\tb\n', [{ v: 'a\tb\n' }]],
    ['v: >\n  a\tb\n', [{ v: 'a\tb\n' }]],
    ['v: |+\n  a\tb\n\n', [{ v: 'a\tb\n\n' }]],
    ['v: |-\n  a\tb\n', [{ v: 'a\tb' }]],
    ['v: |2\n    a\tb\n', [{ v: '  a\tb\n' }]],
    ['v: |\n  a\n  \t\n  b\n', [{ v: 'a\n\t\nb\n' }]],
    ['v: |\n  a\tb\nnext: 1\n', [{ v: 'a\tb\n', next: 1 }]],
    ['- |\n  a\tb\n', ['a\tb\n']],
    ['k:\n  v: |\n    a\tb\n', [{ k: { v: 'a\tb\n' } }]]
  ];
  for (const [text, want] of legal) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
  // And the round trip this tool's own writer makes, which is the case T79 lost a
  // tab in: a tab in a value is written as a block scalar line, and the tab is
  // the only copy of that data.
  for (const value of ['x\n\ty', 'a\tb\nc', 'a\nb\tc']) {
    const text = serializers.yaml([{ v: value }]);
    assert.strictEqual(run(text, 'yaml').data[0].v, value, text);
  }
});

t('an anchor names a value and a reference stands in for it', () => {
  // `&name` and `*name` are properties of the value in front of them, not the
  // value. They came out as the value's own text — `&x 1` and `*x`, two strings,
  // exit 0, an empty stderr — and a file whose anchor sat above a block was
  // refused outright, because `a: &x` reads as a finished line and the block
  // under it was then an unexpected indentation. Eighteen of the twenty files
  // measured against PyYAML 6.0.3 through the real binary disagreed that way,
  // and the second of them is the one that cost a file: `a: &x` + `k: 1` never
  // got read at all. Anchors are how GitHub Actions workflows, compose files and
  // Kubernetes manifests say the same block twice.
  const cases = [
    ['a: &x 1\nb: *x\n', [{ a: 1, b: 1 }]],
    ['a: &x\n  k: 1\nb: *x\n', [{ a: { k: 1 }, b: { k: 1 } }]],
    ['a: &s [1, 2]\nb: *s\n', [{ a: [1, 2], b: [1, 2] }]],
    ['a: &x "a b"\nb: *x\n', [{ a: 'a b', b: 'a b' }]],
    ['a: &x 1 # note\nb: *x\n', [{ a: 1, b: 1 }]],
    ['a: &x\nb: 1\nc: *x\n', [{ a: null, b: 1, c: null }]],
    ['a: &b |\n  text\nc: *b\n', [{ a: 'text\n', c: 'text\n' }]],
    ['- &x a\n- *x\n', ['a', 'a']],
    ['- &x\n  a: 1\n- *x\n', [{ a: 1 }, { a: 1 }]],
    ['outer:\n  a: &x 1\n  b: *x\n', [{ outer: { a: 1, b: 1 } }]],
    ['a: &s\n  - 1\nb:\n  - *s\n', [{ a: [1], b: [[1]] }]],
    ['a: &x 1\nb: [*x, 2]\n', [{ a: 1, b: [1, 2] }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // Two keys that share an anchor are two values once they are JSON: changing
  // one may not reach into the other, which is the rule the writers follow.
  const shared = run('base: &b\n  k: 1\none: *b\ntwo: *b\n', 'yaml');
  shared.data[0].one.k = 99;
  assert.strictEqual(shared.data[0].two.k, 1, 'the two references are one object');
  assert.strictEqual(shared.data[0].base.k, 1, 'and neither is the anchor');

  // A name that was never given, and a value that holds itself. The second is
  // the one PyYAML answers with a structure JSON cannot carry, so it is refused
  // in words rather than answered with something that would not survive.
  assert.match(
    run('a: 1\nb: *nope\n', 'yaml').error,
    /YAML line 2: found undefined alias 'nope'/
  );
  assert.match(
    run('a: &r\n  self: *r\n', 'yaml').error,
    /YAML line 2: &r points at itself/
  );
});

t('a merge key copies fields in, and the document\'s own fields win', () => {
  // `<<` is not a key: it copies the fields of the mappings it names into this
  // one. It came out as a field called `<<` whose value was the text `*b`, so a
  // child mapping lost every inherited field and gained a lie instead — the
  // shape most config files use to say "the same as the parent, plus this".
  const cases = [
    ['base: &b\n  k: 1\nchild:\n  <<: *b\n  j: 2\n', [{ base: { k: 1 }, child: { k: 1, j: 2 } }]],
    // The written field is the one that counts, in either order, and a merge
    // that repeats a field is not the duplicate the tool warns about — PyYAML
    // answers both of these without a word.
    ['base: &b\n  k: 1\nchild:\n  <<: *b\n  k: 2\n', [{ base: { k: 1 }, child: { k: 2 } }]],
    ['a: &a\n  k: 1\nc:\n  k: 2\n  <<: *a\n', [{ a: { k: 1 }, c: { k: 2 } }]],
    ['a: &a\n  x: 1\nb:\n  <<: *a\n  <<: *a\n', [{ a: { x: 1 }, b: { x: 1 } }]],
    // In a list the first mapping to carry a field wins.
    [
      'a: &a\n  x: 1\n  y: 1\nb: &b\n  x: 2\nc:\n  <<: [*a, *b]\n',
      [{ a: { x: 1, y: 1 }, b: { x: 2 }, c: { x: 1, y: 1 } }]
    ],
    ['base: &b\n  k: 1\n  j: 2\nchild:\n  <<: *b\n  k: 9\n  m: 3\n',
      [{ base: { k: 1, j: 2 }, child: { k: 9, j: 2, m: 3 } }]],
    ['base: &b\n  k: 1\nouter:\n  child:\n    <<: *b\n',
      [{ base: { k: 1 }, outer: { child: { k: 1 } } }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
    assert.deepStrictEqual(r.warnings, [], JSON.stringify(text));
  }

  // A merge can only merge a mapping, and PyYAML refuses the file rather than
  // guessing, so the answer here is a name and a line as well.
  assert.match(
    run('a: &x 1\nb:\n  <<: *x\n', 'yaml').error,
    /YAML line 3: a merge key \("<<"\) can only merge a mapping/
  );
});

t('a merge key merges in a flow mapping too, and `<<` in quotes is a name', () => {
  // A `<<` written on one line between braces is the same merge key, and it was
  // read as an ordinary field: `a: {<<: *b, d: 2}` came back as the field `<<`
  // holding the anchor's own mapping, so a child lost every inherited field and
  // gained a key no file means by it. It is the spelling a hand-written config,
  // a compose file and a CI matrix use when they share one block.
  const cases = [
    ['b: &b {x: 1}\na: {<<: *b, d: 2}\n', [{ b: { x: 1 }, a: { x: 1, d: 2 } }]],
    ['b: &b {x: 1}\na: {<<: *b}\n', [{ b: { x: 1 }, a: { x: 1 } }]],
    // From a block anchor, not only from one written on the same line.
    ['b: &b\n  x: 1\na: {<<: *b, d: 2}\n', [{ b: { x: 1 }, a: { x: 1, d: 2 } }]],
    // A list of references, first to carry a field wins.
    ['b: &b {x: 1}\nc: &c {y: 2}\na: {<<: [*b, *c], d: 3}\n',
      [{ b: { x: 1 }, c: { y: 2 }, a: { x: 1, y: 2, d: 3 } }]],
    ['b: &b {x: 1}\nc: &c {x: 2}\na: {<<: [*b, *c]}\n',
      [{ b: { x: 1 }, c: { x: 2 }, a: { x: 1 } }]],
    ['b: &b {x: 1}\nc: &c {x: 2}\na: {<<: [*c, *b]}\n',
      [{ b: { x: 1 }, c: { x: 2 }, a: { x: 2 } }]],
    // A mapping written in line is a merge the file can mean, and refusing it
    // turned away a file PyYAML reads — in the block spelling too, which had
    // refused `{x: 1}` under `<<` since the merge key was built.
    ['a: {<<: {x: 1}, d: 2}\n', [{ a: { x: 1, d: 2 } }]],
    ['a:\n  <<: {x: 1}\n  d: 2\n', [{ a: { x: 1, d: 2 } }]],
    // The written field is the one that counts, in either order, and a name may
    // carry an anchor without becoming a different name.
    ['b: &b {x: 1}\na: {<<: [*b], x: 9}\n', [{ b: { x: 1 }, a: { x: 9 } }]],
    ['b: &b {x: 1}\na: {x: 9, <<: *b}\n', [{ b: { x: 1 }, a: { x: 9 } }]],
    ['b: &b {x: 1}\na: {d: 2, <<: *b}\n', [{ b: { x: 1 }, a: { d: 2, x: 1 } }]],
    ['b: &b {x: 1}\na: {&k <<: *b}\n', [{ b: { x: 1 }, a: { x: 1 } }]],
    ['b: &b {x: 1}\nc: &c {y: 2}\na: {<<: *b, <<: *c}\n',
      [{ b: { x: 1 }, c: { y: 2 }, a: { x: 1, y: 2 } }]],
    // One anchor, two children on one line each.
    ['b: &b {x: 1}\na: {<<: *b, d: 2}\nc: {<<: *b, e: 3}\n',
      [{ b: { x: 1 }, a: { x: 1, d: 2 }, c: { x: 1, e: 3 } }]],
    // A flow mapping is a value like any other, so a list element is one too.
    ['b: &b {x: 1}\na: [{<<: *b, d: 2}]\n', [{ b: { x: 1 }, a: [{ x: 1, d: 2 }] }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
    assert.deepStrictEqual(r.warnings, [], JSON.stringify(text));
  }

  // `<<` in quotes is the field name `<<` and nothing else, in both spellings.
  // The block reader merged the quoted one: a field the file wrote was thrown
  // away and the anchor's fields took its place, with nothing on stderr.
  for (const text of ['b: &b {x: 1}\na: {"<<": *b}\n', 'b: &b {x: 1}\na:\n  "<<": *b\n',
                      'b: &b {x: 1}\na: {\'<<\': *b}\n', 'b: &b {x: 1}\na:\n  \'<<\': *b\n']) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [{ b: { x: 1 }, a: { '<<': { x: 1 } } }], JSON.stringify(text));
    assert.deepStrictEqual(r.warnings, [], JSON.stringify(text));
  }

  // The explicit form is not the merge key, in either spelling: PyYAML refuses
  // it and the block reader reads it as the field `<<`, so the flow one agrees
  // with the block rather than answering a question nobody asked.
  for (const text of ['a: {? << : 1}\n', 'a:\n  ? <<\n  : 1\n']) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [{ a: { '<<': 1 } }], JSON.stringify(text));
  }

  // A `<<` that is a value is a value, and it is a name that merges nothing:
  // this reader has read the merge tag as text since the first flow
  // collection, the same leniency it keeps for `&base.image`.
  assert.deepStrictEqual(run('a: [<<]\n', 'yaml').data, [{ a: ['<<'] }]);
  assert.deepStrictEqual(run('a: <<\n', 'yaml').data, [{ a: '<<' }]);

  // What cannot be merged is named, in both spellings and with the same words
  // the block reader uses, so one merge key has one answer.
  assert.match(run('a: {<<: [1, 2]}\n', 'yaml').error,
    /a merge key \("<<"\) can only merge a mapping/);
  assert.match(run('a:\n  <<: [1, 2]\n', 'yaml').error,
    /a merge key \("<<"\) can only merge a mapping/);
  assert.match(run('a: {<<: x}\n', 'yaml').error,
    /a merge key \("<<"\) takes a reference or a list of them, not "x"/);
  assert.match(run('a:\n  <<: x\n', 'yaml').error,
    /a merge key \("<<"\) takes a reference or a list of them, not "x"/);
  assert.match(run('a: {<<:}\n', 'yaml').error,
    /a merge key \("<<"\) takes a reference or a list of them, not ""/);
  assert.match(run('b: &b {x: 1}\na: {<<: !!map *b}\n', 'yaml').error,
    /a merge key \("<<"\) takes a reference or a list of them, not "!!map/);
});

t('a name is a name: anchors and references leave everything else alone', () => {
  // The control table, written because the fix reads a name where there was a
  // string. A `*` or `&` inside a value is text, a tab is still a tab, a `#` is
  // still a comment, and this tool's own writer and reader still agree.
  const untouched = [
    ['a: 2*3\n', [{ a: '2*3' }]],
    ['a: x&y\n', [{ a: 'x&y' }]],
    ['a: 1 # *b &c\n', [{ a: 1 }]],
    ['# &a *b\nv: 1\n', [{ v: 1 }]],
    ['a: "b # c"\n', [{ a: 'b # c' }]],
    ['a: "b*c"\n', [{ a: 'b*c' }]]
  ];
  for (const [text, want] of untouched) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // A key really is a key: `<<` is a merge only when a reference follows it, and
  // a `#` in a key is a key, not the start of a comment.
  assert.deepStrictEqual(run('a#b: 1\n', 'yaml').data, [{ 'a#b': 1 }]);
  assert.deepStrictEqual(run('note: "# not a comment"\n', 'yaml').data, [{ note: '# not a comment' }]);

  // The tab rules are the other side of the same reader and did not move: a tab
  // where a token starts is still refused, and a tab inside a comment or a
  // quoted scalar is still data.
  assert.match(run('v:\t1\n', 'yaml').error, /cannot start any token/);
  assert.match(run('v: 1\t# note\n', 'yaml').error, /cannot start any token/);
  assert.deepStrictEqual(run('# note\ta\nv: 1\n', 'yaml').data, [{ v: 1 }]);
  assert.deepStrictEqual(run('v: "a\tb"\n', 'yaml').data, [{ v: 'a\tb' }]);

  // And the writer's own round trip, which is where a name must not appear.
  for (const value of ['a\nb', 'x\n\ty', 'a *b* c', 'a &b c']) {
    const text = serializers.yaml([{ v: value }]);
    assert.deepStrictEqual(run(text, 'yaml').data, [{ v: value }], text);
  }
});

t('a tag asks for a type, and JSON gets one', () => {
  // `!!str` is the one thing in YAML that deliberately changes a type, and it
  // came out as the value's own text: `a: !!str 1` was the string "!!str 1",
  // not the string "1". A tag over a block refused the file outright, because
  // `a: !!str` read as a finished line and the block under it was then an
  // unexpected indentation — thirteen of twenty-seven measured files disagreed
  // with PyYAML 6.0.3 that way, and Kubernetes manifests, CloudFormation and
  // Ansible playbooks are full of them.
  const cases = [
    ['a: !!str 1\n', [{ a: '1' }]],
    ['a: !!int "1"\n', [{ a: 1 }]],
    ['a: !!bool yes\n', [{ a: true }]],
    ['a: !!bool "off"\n', [{ a: false }]],
    ['a: !!float "1.5"\n', [{ a: 1.5 }]],
    ['a: !!null ""\n', [{ a: null }]],
    // The text is the text: `!!str 01` is two characters, not the number 1
    // written as "1" and turned back into a string. Going through the value
    // would lose exactly the digits the tag was written to keep.
    ['a: !!str 01\n', [{ a: '01' }]],
    ['a: !!str 1.50\n', [{ a: '1.50' }]],
    ['a: !!str "1"\n', [{ a: '1' }]],
    // The full spelling of a tag is the same tag.
    ['a: !<tag:yaml.org,2002:str> 1\n', [{ a: '1' }]],
    ['a: !!int 0x10\n', [{ a: 16 }]],
    ['a: !!int 1_000\n', [{ a: 1000 }]],
    // Over a block, a tag is a property and the block underneath is the value:
    // this file was refused before, with "unexpected indentation".
    ['a: !!str |\n  1\n', [{ a: '1\n' }]],
    ['a: !!str\n', [{ a: '' }]],
    // A bare `!` is the non-specific tag: it asks for no type, so it changes
    // nothing and says nothing. PyYAML reads `a: !` as an empty value too.
    ['a: !\nb: 1\n', [{ a: null, b: 1 }]],
    // In a sequence, and in both orders with a name.
    ['- !!str 1\n- !!int "2"\n', ['1', 2]],
    ['a: &x !!str 1\nb: *x\n', [{ a: '1', b: '1' }]],
    ['a: !!str &x 1\nb: *x\n', [{ a: '1', b: '1' }]],
    ['v: [!!str 1, !!int "2"]\n', [{ v: ['1', 2] }]],
    // A tag on a key is a property of the key, not part of its name.
    ['!!str a: 1\n', [{ a: 1 }]],
    ['!!str a:\n  b: 1\n', [{ a: { b: 1 } }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
    // A tag the file asked for and this file can deliver is not a warning: the
    // user wrote the type down, and JSON carried it.
    assert.deepStrictEqual(r.warnings, [], JSON.stringify(text));
  }

  // A tag that says something else, and a tag with nothing to say. PyYAML
  // refuses both, this tool names them: the value is what the file wrote, and a
  // value that changes without a word is the class the warnings exist for.
  for (const tag of ['!!binary', '!!timestamp', '!custom', '!<tag:example.com,2026>']) {
    const r = run(`a: ${tag} "1"\n`, 'yaml');
    assert.ok(!r.error, `${tag} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [{ a: '1' }], tag);
    assert.strictEqual(r.warnings.length, 1, `${tag} was dropped in silence: ${JSON.stringify(r.warnings)}`);
    assert.match(r.warnings[0], /YAML line 1: the tag ".*" is not a type JSON carries/);
  }

  // A tag with nothing to make of the value is refused in words, with the line.
  for (const [text, what, line = 1] of [
    ['a: !!int x\n', 'a whole number'],
    ['a: !!float x\n', 'a number'],
    ['a: !!bool maybe\n', 'a yes/no value'],
    ['a: !!null x\n', 'empty'],
    ['a: !!float .inf\n', 'infinity'],
    ['a: !!str\n  b: 1\n', 'a table'],
    ['a: !!str [1]\n', 'a list'],
    ['a: !!str !!int 1\n', 'one tag', 1],
    ['a: &x 1\nb: &y *x\n', 'both named and a reference', 2],
    ['a: &x 1\n&k *x: 2\n', 'a key both named and a reference', 2]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${what} was read as a value: ${JSON.stringify(r.data)}`);
    assert.ok(
      r.error.includes(`YAML line ${line}: `),
      `${text.trim()} should name line ${line}, not: ${r.error}`
    );
  }
});

t('a name can stand on a key, and a key is still a key', () => {
  // `&k b: 2` names the field `b` and `!!str a: 1` asks for it to be a string.
  // Both came out as part of the field name, so the file got a field called
  // `&k b` and the one it asked for was gone — measured against PyYAML 6.0.3,
  // which reads the name off the key and leaves the name behind.
  const cases = [
    ['a: 1\n&k b: 2\n', [{ a: 1, b: 2 }]],
    ['a: 1\n&k b:\n  c: 2\n', [{ a: 1, b: { c: 2 } }]],
    ['a: &x 1\n*x: 2\n', [{ a: 1, 1: 2 }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
    assert.deepStrictEqual(r.warnings, [], JSON.stringify(text));
  }

  // A name that was given on a key can be used later, which is the point of it.
  // The name points at the key's own text, which is what a key node is: PyYAML
  // reads `&k a: 1` + `b: *k` as the field `b` holding the string "a".
  const used = run('&k a: 1\nb: *k\n', 'yaml');
  assert.deepStrictEqual(used.data, [{ a: 1, b: 'a' }], 'a name on a key is a name');

  // A field name is text, so a reference to a list or a table is refused instead
  // of being written as `[object Object]` in a file the user then keys on.
  assert.match(
    run('a: &x\n  k: 1\n*x: 2\n', 'yaml').error,
    /YAML line 3: a field name is text, and a reference to a table is not/
  );
  assert.match(run('!!int a: 1\n', 'yaml').error, /YAML line 1: "a" is not a whole number/);

  // A line that opens a list entry is not a mapping entry, whatever else is on
  // it: `- <<: *b` read as a field called `- <<`, so a file that mixed a mapping
  // and a list at the same indentation got a field nobody wrote and lost the
  // list. PyYAML refuses that document; so does this one, with the line.
  assert.match(
    run('a: &b\n  k: 1\n- <<: *b\n', 'yaml').error,
    /YAML line 3: expected "key: value", got "- <<: \*b"/
  );
});

t('a tag leaves everything else alone', () => {
  // The control table, written because the fix reads a tag where there was a
  // string. A `!` or `*` or `&` inside a value is text, a quoted one is text,
  // and this tool's own writer and reader still agree — a tag is never invented
  // on the way out, because a JSON field has no way to ask for a type.
  const untouched = [
    ['a: 2*3\n', [{ a: '2*3' }]],
    ['a: x&y\n', [{ a: 'x&y' }]],
    ['a#b: 1\n', [{ 'a#b': 1 }]],
    ['a: "b*c"\n', [{ a: 'b*c' }]],
    ['a: "b!c"\n', [{ a: 'b!c' }]],
    ["a: '!custom'\n", [{ a: '!custom' }]],
    ['a: "!!str 1"\n', [{ a: '!!str 1' }]],
    ['a: 1 # !!str 2\n', [{ a: 1 }]],
    ['# !!str\nv: 1\n', [{ v: 1 }]],
    ['a: hi!\n', [{ a: 'hi!' }]],
    ['12:30\n', ['12:30']]
  ];
  for (const [text, want] of untouched) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // A tag holds across every writer, because a string that reads as a number is
  // a value that changes on the way out: all six formats, measured on the value
  // the reader produced.
  const tagged = run('a: !!str 1\nb: !!str 01\n', 'yaml').data;
  for (const format of ['json', 'yaml', 'xml', 'csv', 'sql', 'table']) {
    const text = serializers[format](tagged);
    assert.ok(
      !/"a":\s*1\b/.test(text) || /"1"/.test(text),
      `${format} wrote the tagged string as a number:\n${text}`
    );
  }
  // And the round trip: what the writer wrote, this reader reads back.
  for (const value of ['a\nb', '1', 'x\n\ty', 'a *b* c', 'a &b c', '!custom']) {
    const text = serializers.yaml([{ v: value }]);
    assert.deepStrictEqual(run(text, 'yaml').data, [{ v: value }], text);
  }
});

t('a key spelled out in front is a key', () => {
  // `? x` and the `: 1` under it are one entry written out, and the reader had no
  // notion of one. What it did with the line depended on what stood around it:
  // `? x` + `: 1` was refused outright with "unexpected indentation" on a file
  // PyYAML 6.0.3 reads as `{x: 1}`, while `? x` with nothing after it was read
  // as the invented text `"? x"` — exit 0, an empty stderr — and `- ? x` gave a
  // record whose one field was called `"? x"`. A `!!set` is written on exactly
  // these lines, so a tag that exists only to be spelled out this way had nothing
  // to stand on.
  const cases = [
    // The value under the key, at the key's own indentation.
    ['a:\n  ? x\n  : 1\n', [{ a: { x: 1 } }]],
    ['a:\n  ? x # a note\n  : 1\n', [{ a: { x: 1 } }]],
    // No value of its own is a key holding nothing, the same answer `x:` gets.
    ['a:\n  ? x\n  ? y\n', [{ a: { x: null, y: null } }]],
    // One level deeper, which is where a sequence entry pushes the line.
    ['- ? x\n  : 1\n', [{ x: 1 }]],
    ['- ? x\n', [{ x: null }]],
    // The document's own keys, which are a mapping and not a run of bare scalars.
    ['? x\n: 1\n', [{ x: 1 }]],
    ['? x\n', [{ x: null }]],
    // A key is text, so a `#` in it is a key and a quoted one keeps it.
    ['a:\n  ? "x # y"\n  : 1\n', [{ a: { 'x # y': 1 } }]],
    // A `!!set` is a mapping whose members hold nothing: read as written, and
    // named on stderr, because a set is a type JSON does not have.
    ['a: !!set\n  ? x\n  ? y\n', [{ a: { x: null, y: null } }], 1]
  ];
  for (const [text, want, warnings = 0] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
    assert.strictEqual(r.warnings.length, warnings, JSON.stringify(text));
  }

  // A *quoted* key is text, so the same collection written in quotes is still the
  // key it spells — the rule asks the key's own text before its quotes are read,
  // and this is the control that says it did not read them first.
  assert.deepStrictEqual(run('? "[x, y]"\n: 1\n', 'yaml').data, [{ '[x, y]': 1 }]);
  assert.deepStrictEqual(run("a: {? 'x, b' : 1}\n", 'yaml').data, [{ a: { 'x, b': 1 } }]);
});

t('a key that is a flow collection is refused, because a field name is text', () => {
  // A table or a list standing where a key belongs cannot be a field name in JSON,
  // and PyYAML refuses every one of these with `found unhashable key`. It used to
  // be read as the text of the collection instead, so the field was named after it
  // — a name this tool invented — and in the two-line spellings the key's *own
  // value* was read as a second field beside it, so `? {a: 1}` + `: 1` came back
  // as two fields, `null` and `{a`, and neither was in the file. The six written
  // inside a flow collection came back as the line's own text, taking every field
  // of the document with it, exit 0 and an empty stderr. Twenty spellings measured
  // 2026-09-28 with PyYAML 6.0.3 as the judge: 0 of 20 in agreement before, 20 of
  // 20 after.
  const collectionKeys = [
    'a:\n  ? [x, y]\n  : 1\n',
    '? {a: 1}\n: 1\n',
    '? {a: 1} : 1\n',
    '? [x, y]\n: 1\n',
    '? [x, y] : 1\n',
    '- ? {a: 1}\n  : 1\n',
    '- ? {a: 1} : 1\n',
    '? {a: 1}\n',
    '- ? {a: 1}\n',
    'a:\n  ? {b: 1}\n  : 1\n',
    '? {a: 1}\n: 1\nb: 2\n',
    'a: {? {b: 1} : 1}\n',
    'a: {? [x, y] : 1}\n',
    'a: {{b: 1}: 1}\n',
    'a: {[x]: 1}\n',
    'a: {[1, 2]: 3}\n',
    'a: {[]: 1}\n',
    'a: {? [] : 1}\n',
    'a: {? {b: 1, c: 2} : 3}\n',
    '{a: 1}: 2\n'
  ];
  for (const text of collectionKeys) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${JSON.stringify(text)} was read as ${JSON.stringify(r.data)}`);
    assert.match(r.error, /a field name is text, and a (list|table) is not/, r.error);
  }
  // A *quoted* key is text, so the same collection written in quotes is still the
  // key it spells — the rule asks the key's own text before its quotes are read,
  // and this is the control that says it did not read them first.
  assert.deepStrictEqual(run('? "[x, y]"\n: 1\n', 'yaml').data, [{ '[x, y]': 1 }]);
  assert.deepStrictEqual(run("a: {? 'x, b' : 1}\n", 'yaml').data, [{ a: { 'x, b': 1 } }]);
  // And a collection is still read wherever it *is* the value, at the root, one
  // level down, over two lines and on a list entry.
  for (const [text, want] of [
    ['{a: 1, b: two}\n', [{ a: 1, b: 'two' }]],
    ['a: {a: 1}\n', [{ a: { a: 1 } }]],
    ['a: [1, 2]\n', [{ a: [1, 2] }]],
    ['a: [1,\n  2]\n', [{ a: [1, 2] }]],
    ['- {a: 1}\n', [{ a: 1 }]],
    ['- [1, 2]\n', [[1, 2]]],
    ['a: [not a collection]\n', [{ a: ['not a collection'] }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // And everything else the reader did with a `?` line is untouched: a `?` in a
  // value, in a quote and in a comment is text, and a folded scalar ends where
  // an explicit key begins.
  for (const [text, want] of [
    ['a: "b ? c"\n', [{ a: 'b ? c' }]],
    ["a: '?'\n", [{ a: '?' }]],
    ['a: hi?\n', [{ a: 'hi?' }]],
    ['a: 1 # ? x\n', [{ a: 1 }]],
    ['? not a key\n']
  ]) {
    const r = run(text, 'yaml');
    if (want === undefined) {
      assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
      continue;
    }
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a refusal inside a flow collection is refused, not read as the line\'s own text', () => {
  // `parseYAMLFlow` catches everything so it can answer "this line is not a flow
  // collection", which is the right answer for `a: [not a collection]`. But it
  // caught the reader's *own* refusals with it, so every one of them came back as
  // the text the collection was written with, every field of the document gone
  // and an empty stderr — `{b: !!int "x"}` as the field `a` with the value
  // `{b: !!int "x"}`. The same file written in two lines was refused with the same
  // words, so the two readers could not answer the same question the same way.
  // Measured 2026-09-28, 22 files with PyYAML 6.0.3 as the judge: 16 read a file
  // the judge refused, and the block reader refused all 16 of the ones that have
  // a block spelling. 16 of 16 after.
  const flowRefusals = [
    // A reference with no anchor, in every place a flow collection can stand:
    // the value of a key, an item in a list, the whole document, an item nested
    // in an item, beside a field that reads fine, one level down, and behind a
    // merge key. The block reader refuses each of these with the same words.
    ['a: {b: *nope}\n', /found undefined alias 'nope'/],
    ['a: [*nope]\n', /found undefined alias 'nope'/],
    ['[*nope]\n', /found undefined alias 'nope'/],
    ['a: {b: [*nope, 1]}\n', /found undefined alias 'nope'/],
    ['a: {b: !!int 1, c: *nope}\n', /found undefined alias 'nope'/],
    ['a:\n  b: {c: *nope}\n', /found undefined alias 'nope'/],
    ['a: {<<: *nope}\n', /found undefined alias 'nope'/],
    // An anchor named below the line that uses it is a reference with no anchor,
    // and both readers say so.
    ['a: [*k]\nb: &k 1\n', /found undefined alias 'k'/],
    ['a: {b: *k}\nk: &k 1\n', /found undefined alias 'k'/],
    // A tag that asks for a type the text is not. The wording quotes the value as
    // the reader sliced it, which inside a collection is the run up to the
    // bracket — so the message says `"[1"`, not the list. The answer is the one
    // that matters and it is the block reader's; the fragment is the next thing
    // to measure, not this one.
    ['a: {b: !!int "x"}\n', /so "!!int" has nothing to make of it/],
    ['a: [!!float "x"]\n', /so "!!float" has nothing to make of it/],
    ['a: {b: !!bool "maybe"}\n', /so "!!bool" has nothing to make of it/],
    ['a: {b: !!int [1, 2]}\n', /so "!!int" has nothing to make of it/],
    // A node named twice, named and a reference at once, or carrying two tags —
    // the three rules `readYAMLProperties` states, reached from inside a
    // collection where they used to be swallowed with everything else.
    ['a: {b: &x &y 1}\n', /can only be named once/],
    ['a: {b: &x *x}\n', /cannot be both named and be a reference/],
    ['a: {b: !t1 !t2 1}\n', /can only carry one tag/]
  ];
  for (const [text, want] of flowRefusals) {
    const r = run(text, 'yaml');
    assert.ok(r.error, `${JSON.stringify(text)} was read as ${JSON.stringify(r.data)}`);
    assert.match(r.error, want, `${JSON.stringify(text)}: ${r.error}`);
  }

  // The whole point: the flow reader and the block reader now say the *same*
  // thing about the same construct, with the same words. They differ only in the
  // line number, which a flow collection has no room for.
  const sameWords = (flow, block) => {
    const a = run(flow, 'yaml').error.replace(/YAML line \d+: /, '');
    const b = run(block, 'yaml').error.replace(/YAML line \d+: /, '');
    assert.strictEqual(a, b, `${JSON.stringify(flow)} vs ${JSON.stringify(block)}`);
  };
  sameWords('a: {b: *nope}\n', 'a:\n  b: *nope\n');
  sameWords('a: [*nope]\n', 'a:\n  - *nope\n');
  sameWords('a: {b: !!int "x"}\n', 'a:\n  b: !!int "x"\n');
  sameWords('a: {b: !!bool "maybe"}\n', 'a:\n  b: !!bool "maybe"\n');
  sameWords('a: {b: &x &y 1}\n', 'a:\n  b: &x &y 1\n');
  sameWords('a: {b: !t1 !t2 1}\n', 'a:\n  b: !t1 !t2 1\n');
  sameWords('a: [*k]\nb: &k 1\n', 'a:\n  - *k\nb: &k 1\n');

  // A half-open quote is deliberately *not* one of the eleven: `readYAMLQuoted`
  // answers "this is a typo, not a reason to throw away the rest of a file", and
  // the block reader has always gone on reading the text. This is the control
  // that says the catch is still there for the thing it is actually for — PyYAML
  // refuses both, and this tool reads both, and says so in neither.
  for (const [flow, block] of [['a: {b: "x}\n', 'a: "x\n'], ['a: [ \'x ]\n', "a:\n  b: 'x\n"]]) {
    assert.ok(!run(flow, 'yaml').error, `${JSON.stringify(flow)} was refused`);
    assert.ok(!run(block, 'yaml').error, `${JSON.stringify(block)} was refused`);
  }

  // And the catch is still there for its own answer: a line that is not one whole
  // flow collection is read as a block, and every collection that *is* one is
  // still read, with its tag, its anchor, its reference and its two lines.
  for (const [text, want] of [
    ['a: [not a collection]\n', [{ a: ['not a collection'] }]],
    ['a: {b: 1}\n', [{ a: { b: 1 } }]],
    ['a: [1, 2]\n', [{ a: [1, 2] }]],
    ['a: [1,\n  2]\n', [{ a: [1, 2] }]],
    ['a: {b: !!int 5}\n', [{ a: { b: 5 } }]],
    ['a: {b: !!str 01}\n', [{ a: { b: '01' } }]],
    ['x: &k {b: 1}\ny: *k\n', [{ x: { b: 1 }, y: { b: 1 } }]],
    ['a: {b: &x 1, c: *x}\n', [{ a: { b: 1, c: 1 } }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a question mark opening a flow collection is a key, not a name', () => {
  // The rule the block reader got in the test above was never carried into the
  // flow reader, so the same document had two answers: `? x` + `: 1` over four
  // lines gave `{x: 1}` and `{? x : 1}` on one line gave a field called `? x` —
  // an invented name, exit 0, an empty stderr. A `!!set` written on one line,
  // which is the short way to write one, hit it, and so did every config file
  // that inlines a mapping.
  const cases = [
    // In front of a mapping key, with and without a space, which is how the two
    // spellings differ in the spec and not in the answer.
    ['a: {? x : 1}\n', [{ a: { x: 1 } }]],
    ['a: {?x : 1}\n', [{ a: { x: 1 } }]],
    ['a: { ? x : 1 }\n', [{ a: { x: 1 } }]],
    // A quoted key is the text inside its quotes, and a `,` or a `}` inside
    // them is that text too rather than the end of the collection.
    ['a: {? "x y" : 1}\n', [{ a: { 'x y': 1 } }]],
    ['a: {? "a, b" : 1}\n', [{ a: { 'a, b': 1 } }]],
    // Two of them, and one among plain keys, in a nested mapping and in the
    // document's own root.
    ['a: {? x : 1, ? y : 2}\n', [{ a: { x: 1, y: 2 } }]],
    ['a: {b: 2, ? x : 1}\n', [{ a: { b: 2, x: 1 } }]],
    ['a: {c: {? x : 1}}\n', [{ a: { c: { x: 1 } } }]],
    // The value is anything the flow reader already reads, and a key with no
    // value of its own holds nothing, the same answer `x:` gets.
    ['a: {? x : {c: 2}}\n', [{ a: { x: { c: 2 } } }]],
    ['a: {? x : [1, 2]}\n', [{ a: { x: [1, 2] } }]],
    ['a: {? x : !!str 1}\n', [{ a: { x: '1' } }]],
    ['a: {? x, b: 2}\n', [{ a: { x: null, b: 2 } }]],
    ['a: {? x : }\n', [{ a: { x: null } }]],
    // In front of a sequence entry, where it is a one-field record.
    ['a: [? x, y]\n', [{ a: [{ x: null }, 'y'] }]],
    ['a: [? x : 1]\n', [{ a: [{ x: 1 }] }]],
    ['a: [y, ? x, ? z]\n', [{ a: ['y', { x: null }, { z: null }] }]],
    // A `!!set` on one line is the same post the four-line one is.
    ['a: !!set\n  ? x\n  ? y\n', [{ a: { x: null, y: null } }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
  // A set of one tag on one line warns once, like the four-line spelling.
  assert.strictEqual(run('a: !!set [? x, ? y]\n', 'yaml').warnings.length, 1);

  // A question mark anywhere else is text and stays it — in a quote, in the
  // middle of a name, and in a value, where PyYAML 6.0.3 refuses the document.
  // This tool reads those files, which is the trade it has made since the first
  // flow collection (see the note on `&base.image` in IMPLEMENTATION_PLAN.md).
  for (const [text, want] of [
    ['a: {"? x": 1}\n', [{ a: { '? x': 1 } }]],
    ['a: ["? x", y]\n', [{ a: ['? x', 'y'] }]],
    ['a: b?c\n', [{ a: 'b?c' }]],
    ['a: [b, c?x]\n', [{ a: ['b', 'c?x'] }]],
    ['a: {b: ? x}\n', [{ a: { b: '? x' } }]],
    ['# ? x\na: 1\n', [{ a: 1 }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a key that was not written is the key YAML leaves out', () => {
  // The flow half of the `?` key was fixed in the test above; the block half was
  // not, and it failed in two ways that PyYAML 6.0.3 answers to the letter.
  // A whole entry on one line — `? x : 1` — took its colon as an ordinary key
  // separator, so the file got a field called `? x` and lost both the key and the
  // value: an invented name, exit 0, an empty stderr. And a key left out, which
  // `?`, `? : 1` and `{? : 1}` all write, came out as the empty name `''` — a
  // name no file writes, and one this reader cannot tell from `? ""`, the key
  // written as the empty string, which YAML keeps apart.
  const cases = [
    // The entry on one line, in the document's root, nested, in a sequence entry
    // and in a sequence entry that inlines a mapping.
    ['? x : 1\n', [{ x: 1 }]],
    ['a:\n  ? x : 1\n', [{ a: { x: 1 } }]],
    ['- ? x : 1\n', [{ x: 1 }]],
    ['? "a, b" : 1\n', [{ 'a, b': 1 }]],
    ['? x : 1\nb: 2\n', [{ x: 1, b: 2 }]],
    // The value is whatever the line after a `k:` holds, so a block under a
    // one-line `?` key is read as the value the entry already had.
    ['? x : |\n  line\n', [{ x: 'line\n' }]],
    ['? x :\n  c: 1\n', [{ x: { c: 1 } }]],
    ['? x :\n', [{ x: null }]],
    // The key left out, in every spelling a block file writes it.
    ['?\n', [{ null: null }]],
    ['?\n: 1\n', [{ null: 1 }]],
    ['? : 1\n', [{ null: 1 }]],
    ['?   \n: 1\n', [{ null: 1 }]],
    ['? # note\n: 1\n', [{ null: 1 }]],
    ['? &k\n: 1\n', [{ null: 1 }]],
    ['? : 1\nb: 2\n', [{ null: 1, b: 2 }]],
    ['? :\n  a: 1\n', [{ null: { a: 1 } }]],
    ['- ?\n  : 1\n', [{ null: 1 }]],
    // `~` is the other spelling of nothing, and a key written that way is the
    // same key — it was a field called `~`, which no JSON file has.
    ['? ~\n: 1\n', [{ null: 1 }]],
    ['~: 1\n', [{ null: 1 }]],
    // And the same in a flow collection, which is where the value is on the line
    // by definition.
    ['a: {? : 1}\n', [{ a: { null: 1 } }]],
    ['a: {? : 1, b: 2}\n', [{ a: { null: 1, b: 2 } }]],
    ['a: {?}\n', [{ a: { null: null } }]],
    ['a: {? , b: 2}\n', [{ a: { null: null, b: 2 } }]],
    ['{? : 1}\n', [{ null: 1 }]],
    ['- {? : 1}\n', [{ null: 1 }]],
    ['- {? : 1, b: 2}\n', [{ null: 1, b: 2 }]]
  ];
  for (const [text, want] of cases) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // The empty string is a key of its own and stays one: YAML keeps the key left
  // out and the key written as `""` apart, and so does this.
  for (const [text, want] of [
    ['? ""\n: 1\n', [{ '': 1 }]],
    ['a: {"": 1}\n', [{ a: { '': 1 } }]],
    ["'': 1\n", [{ '': 1 }]]
  ]) {
    assert.deepStrictEqual(run(text, 'yaml').data, want, JSON.stringify(text));
  }
  // A key written `null: 1` was already this key — the name is the text it was
  // written with — so the two spellings are the one field and not two.
  assert.deepStrictEqual(run('null: 1\n', 'yaml').data, run('? : 1\n', 'yaml').data);

  // An alias is the whole key and leaves no text behind it, so `? *z` is a key
  // named after the value `z` holds. Asking whether the key was left out first
  // called it a key YAML never wrote, and the block reader did exactly that while
  // the flow reader did not.
  assert.deepStrictEqual(run('a: &z 1\n? *z\n: 2\n', 'yaml').data, [{ a: 1, 1: 2 }]);
  assert.deepStrictEqual(run('a: &z 1\nb: {? *z : 2}\n', 'yaml').data, [{ a: 1, b: { 1: 2 } }]);

  // JSON has no key that is not text, so the two spellings of the key left out
  // land on the same field. That is the collision the duplicate-key warning is
  // for, and it is the same one a file with two identical names gets.
  const twice = run('? : 1\n~: 2\n', 'yaml');
  assert.deepStrictEqual(twice.data, [{ null: 2 }]);
  assert.strictEqual(twice.warnings.length, 1);
  assert.ok(/key "null" has two different values/.test(twice.warnings[0]), twice.warnings[0]);

  // The tool's own writer cannot tell the key left out from one written `null`,
  // and it does not have to: it quotes the name, so the key comes back as text
  // and the entry survives the round trip through this reader's own two halves.
  const written = serializers.yaml(run('? : 1\nb: 2\n', 'yaml').data);
  assert.ok(/"null": 1/.test(written), written);
  assert.deepStrictEqual(run(written, 'yaml').data, [{ null: 1, b: 2 }]);
});

test('a flow collection reads a key as the name it stands for', () => {
  // `{&z x : 1}` and `{*z : 2}` are a key that names itself and a key that is
  // a reference, and the flow reader took both for the text of the line — so an
  // anchor written on a key never registered, and `*z` below it was refused as
  // an undefined alias on a file PyYAML 6.0.3 reads. The block reader has asked
  // these questions about a key since T84; this is the same reader, one syntax
  // further in.
  assert.deepStrictEqual(run('a: {&z x : 1}\nb: *z\n', 'yaml').data, [{ a: { x: 1 }, b: 'x' }]);
  assert.deepStrictEqual(run('y: &z 1\na: {*z : 2}\n', 'yaml').data, [{ y: 1, a: { '1': 2 } }]);
  // A tag JSON can carry turns the name into that type's text; `!!str 1` is the
  // field `1`, not the field `!!str 1`.
  assert.deepStrictEqual(run('a: {!!str x : 1}\n', 'yaml').data, [{ a: { x: 1 } }]);

  // A key with no value of its own is a field holding nothing, and the block
  // reader has said `null` for that since it read `x:` — so `{b: }` is the one
  // question the flow reader answered with the empty string, a value no file
  // wrote. `{b: ""}` is the empty string, and stays it.
  for (const [text, want] of [
    ['a: {b: }\n', [{ a: { b: null } }]],
    ['a: {b:, c: 2}\n', [{ a: { b: null, c: 2 } }]],
    ['a: {b: {c: }}\n', [{ a: { b: { c: null } } }]],
    ['a: {b: ""}\n', [{ a: { b: '' } }]],
    ['a: {b: " "}\n', [{ a: { b: ' ' } }]]
  ]) {
    assert.deepStrictEqual(run(text, 'yaml').data, want, JSON.stringify(text));
  }

  // A comma before the bracket ends the collection instead of opening one more
  // entry. `[1, ]` is the one element `[1]`; reading the empty tail as a value
  // put a second element in the list, and in a mapping the same empty tail
  // failed the whole collection, so `{b: 1, }` came back as the text it was
  // written with — a valid file read as a string.
  assert.deepStrictEqual(run('a: [1, 2, ]\n', 'yaml').data, [{ a: [1, 2] }]);
  assert.deepStrictEqual(run('a: {b: 1, }\n', 'yaml').data, [{ a: { b: 1 } }]);
  assert.deepStrictEqual(run('a: [1, ]\n', 'yaml').data, [{ a: [1] }]);

  // And everything the flow reader already agreed on is untouched.
  for (const [text, want] of [
    ['a: {b: 1}\n', [{ a: { b: 1 } }]],
    ['a: {b: 1, c: 2}\n', [{ a: { b: 1, c: 2 } }]],
    ['a: {b: {c: [1, 2]}}\n', [{ a: { b: { c: [1, 2] } } }]],
    ['a: [1, 2, 3]\n', [{ a: [1, 2, 3] }]],
    ['a: &z {b: 1}\nc: *z\n', [{ a: { b: 1 }, c: { b: 1 } }]],
    ['a: {}\n', [{ a: {} }]],
    ['a: []\n', [{ a: [] }]],
    ['a: {b: 1, b: 2}\n', [{ a: { b: 2 } }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a key that carries properties is read as a key, in every spelling', () => {
  // A key may carry an anchor and a tag, and when it does, the quotes were read
  // off the wrong side of them: every reader asked "is this key quoted?" about
  // the text *before* the `&k` and the `!tag`, so a quoted key that carried
  // either of them came out with its two quote characters in the name — a field
  // called `"x"`, which no JSON file has — and a tag on such a key was handed
  // `"1"` with the quotes still on, so `!!int "1": 2` was *refused* with "is not
  // a whole number" on a file PyYAML 6.0.3 reads as the field `1`. That is the
  // only class of bug that means the tool does not work at all, and it sat in
  // all three readers of a key: the block entry, the explicit `?` key and the
  // flow key.
  for (const [text, want] of [
    // A quoted key is the text inside its quotes, anchor and all.
    ['&k "x": 1\n', [{ x: 1 }]],
    ["&k 'x': 1\n", [{ x: 1 }]],
    ['? &k "x"\n: 1\n', [{ x: 1 }]],
    ['a: {&k "x": 1}\n', [{ a: { x: 1 } }]],
    ['a: {? &k "x" : 1}\n', [{ a: { x: 1 } }]],
    // And a tag on it is applied to that text, not to the quotes around it.
    ['!!int "1": 2\n', [{ 1: 2 }]],
    ['&k !!int "1": 2\n', [{ 1: 2 }]],
    ['? !!int "1"\n: 2\n', [{ 1: 2 }]],
    ['? !!int "1" : 2\n', [{ 1: 2 }]],
    ['a: {!!int "1": 2}\n', [{ a: { 1: 2 } }]],
    // A key written as the empty string is still the empty string, tag or not.
    ['!!str "": 1\n', [{ '': 1 }]],
    ['? !!str ""\n: 1\n', [{ '': 1 }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // A tag this tool cannot carry is a name the file wrote and a warning says so.
  // The warning was only ever written for a *value*, so `!custom x: 1` gave the
  // field `!custom x` with an empty stderr — an invented name nobody can look up,
  // on a file PyYAML refuses outright, so the warning is the only place a reader
  // learns this reader made the name up. The same key over two lines and on one
  // line has to say the same thing; the one-line entry used to read the tag off
  // the key a second time, found nothing, and dropped it without a word.
  for (const [text, want] of [
    ['!custom x: 1\n', { '!custom x': 1 }],
    ['? !custom x\n: 1\n', { '!custom x': 1 }],
    ['? !custom x : 1\n', { '!custom x': 1 }],
    ['&k !custom x: 1\n', { '&k !custom x': 1 }],
    ['? &k !custom x : 1\n', { '&k !custom x': 1 }],
    ['a: {? !custom x : 1}\n', { a: { '!custom x': 1 } }]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [want], JSON.stringify(text));
    assert.strictEqual(r.warnings.length, 1, `${JSON.stringify(text)} warned ${r.warnings.length} times`);
    assert.match(
      r.warnings[0],
      /YAML line 1: the tag "!custom" is not a type JSON carries, so the key was read as it was written/,
      r.warnings[0]
    );
  }

  // An anchor on a key names the key node; it does not rename it, and it does
  // not take its place in the reader's own order. `&k ~: 1` was a field called
  // `~` while `~: 1`, `? &k ~` and `a: {&k ~: 1}` were all the key YAML leaves
  // out — the same rule, with a name in front of it. And on the one-line `?` key
  // the anchor never registered at all, so the `*k` two lines down was an
  // undefined alias and the whole file was refused: exit 3 on a file this reader
  // accepts, which is the one class where the tool simply does not work.
  assert.deepStrictEqual(run('&k ~: 1\n', 'yaml').data, run('~: 1\n', 'yaml').data);
  assert.deepStrictEqual(run('? &k ~ : 1\n', 'yaml').data, run('~: 1\n', 'yaml').data);
  assert.deepStrictEqual(run('? &k ~\n: 1\n', 'yaml').data, [{ null: 1 }]);
  assert.deepStrictEqual(run('a: {&k ~: 1}\n', 'yaml').data, [{ a: { null: 1 } }]);
  assert.deepStrictEqual(run('? &k x : 1\nz: *k\n', 'yaml').data, [{ x: 1, z: 1 }]);
  // All four spellings of the anchor on a `?` key register the same node, and
  // the node is the whole entry: `*k` is the entry's value, and nothing at all
  // for the two spellings that write no value — measured, not guessed.
  for (const [text, want] of [
    ['? &k x : 1\nz: *k\n', 1],
    ['? &k x\n: 1\nz: *k\n', 1],
    ['? &k x :\nz: *k\n', null],
    ['? &k x\nz: *k\n', null]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [{ x: want, z: want }], JSON.stringify(text));
  }

  // Two tags on a key is a key that carries two tags, and the message used to
  // tell the user their key was a value.
  const twice = run('!a !b x: 1\n', 'yaml');
  assert.ok(twice.error, 'two tags on one key were accepted');
  assert.match(twice.error, /one key can only carry one tag, but "!b x" carries two/, twice.error);
  // A value still says value, so the fix is not the other way round.
  assert.match(run('a: !x !y 1\n', 'yaml').error, /one value can only carry one tag/, '');
});

test('a flow collection is read over the lines it is written on', () => {
  // A collection may be wrapped, and a wrapped one is how a hand-written CI
  // config, a compose file or a Kubernetes manifest keeps a list readable. This
  // reader reads one line at a time, so the continuation was an indentation it
  // could not explain: eleven of the twelve measured files were *refused* —
  // "unexpected indentation", exit 3, on files PyYAML 6.0.3 reads — and the
  // twelfth came out as a field called `{a`. A line break inside a flow is
  // separation and not content, the same folding a quoted scalar gets, so the
  // lines are joined with one space and the one-line reader reads them.
  for (const [text, want] of [
    ['a: {b:\n  1}\n', [{ a: { b: 1 } }]],
    ['a: [1,\n  2]\n', [{ a: [1, 2] }]],
    ['a: {\n  b: 1\n}\n', [{ a: { b: 1 } }]],
    ['a: [\n  1\n]\n', [{ a: [1] }]],
    ['a:\n  b: {c:\n    1}\n', [{ a: { b: { c: 1 } } }]],
    ['- {a:\n    1}\n', [{ a: 1 }]],
    ['a: {b: 1,\n  c: 2}\n', [{ a: { b: 1, c: 2 } }]],
    ['a: {b: 1\n  }\n', [{ a: { b: 1 } }]],
    ['a: [\n  1,\n  2,\n  3\n]\n', [{ a: [1, 2, 3] }]],
    ['a: {b: &x\n  1}\nc: *x\n', [{ a: { b: 1 }, c: 1 }]],
    // A quote that runs over the line break folds the way it folds inside one
    // line, and a comment on a continuation line hides only its own line.
    ['a: ["one\n  two"]\n', [{ a: ['one two'] }]],
    ['a: {\n  b: 1  # note\n}\n', [{ a: { b: 1 } }]],
    // And on the document's first line too, where the reader only takes a flow
    // that closes on its line.
    ['{a: 1,\n b: 2}\n', [{ a: 1, b: 2 }]],
    ['{\n  a: 1\n}\n', [{ a: 1 }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // A list that is still open when the text runs out is a file broken in the
  // middle of a list, and PyYAML 6.0.3 refuses all three of these. Read as the
  // text they were written with, `a: [1` put the list's own contents in a field
  // and every other field in the file with it, exit 0 and an empty stderr. A
  // brace is a different question and keeps its answer: a `{` with no colon in
  // it is not a mapping, so those two are read as text — see the block below,
  // which says what is measured and what is still an open one.
  assert.match(run('a: [1\n', 'yaml').error || '', /expected , or \] in flow sequence/);
  for (const text of ['a: {b\n', '- {a\n']) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.ok(typeof r.data[0].a === 'string' || typeof r.data[0] === 'string', JSON.stringify(text));
  }

  // The lines of a block scalar are a value and not syntax, so an unbalanced
  // `[` in one is a letter: `v: |` with `a: [1` under it reads back as the text
  // the file carries, in every form the header is written in.
  for (const [text, want] of [
    ['v: |\n  a: [1\n  b: 2\n', [{ v: 'a: [1\nb: 2\n' }]],
    ['v: >\n  a: {b\n  c: 1\n', [{ v: 'a: {b c: 1\n' }]],
    ['v: &x |\n  a: [1\n', [{ v: 'a: [1\n' }]],
    ['v: |2\n    a: [1\n    b\n', [{ v: '  a: [1\n  b\n' }]],
    ['- |\n  a: [1\n  b\n', ['a: [1\nb\n']],
    // A folded block keeps the comment as content, and so does this one.
    ['v: |\n  # note\n  a\n', [{ v: '# note\na\n' }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // And a tab is still refused on the line it is written on, whether that line
  // was folded into the collection above it or is a block scalar's own content.
  assert.match(run('a: [1,\n  \t2\n]\n', 'yaml').error || '', /cannot start any token/);
  assert.deepStrictEqual(run('v: |\n  a\tb\n', 'yaml').data, [{ v: 'a\tb\n' }]);
});

test('a flow collection on a sequence entry is a list of tables', () => {
  // `- {a: 1}` and `- [1, 2]` are the two ways a list is written with tables or
  // lists in it, and the third is `- key: value`, which the entry is rewritten
  // into. Read as that rewrite, the first was not a record with one field: it
  // was a record with a field called `{a` holding `1` — a name nobody wrote,
  // exit 0 and an empty stderr, in a file PyYAML reads as a list of one table.
  for (const [text, want] of [
    ['- {a: 1}\n', [{ a: 1 }]],
    ['- [1, 2]\n', [[1, 2]]],
    ['- {}\n', [{}]],
    ['- []\n', [[]]],
    ['- {a: 1, b: 2}\n', [{ a: 1, b: 2 }]],
    ['- {a: {b: 1}}\n', [{ a: { b: 1 } }]],
    ['- &x {a: 1}\n- *x\n', [{ a: 1 }, { a: 1 }]],
    // Wrapped, because the line above is not the only way to write it.
    ['- {a:\n    1}\n', [{ a: 1 }]],
    ['- {\n  a: 1\n}\n', [{ a: 1 }]],
    ['- [\n    1,\n    2\n  ]\n', [[1, 2]]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // The three ways an entry is written keep their own answers: a block under a
  // bare dash, a mapping after the dash, and a plain scalar after the dash.
  for (const [text, want] of [
    ['-\n  a: 1\n', [{ a: 1 }]],
    ['- a: 1\n', [{ a: 1 }]],
    ['- 1\n- 2\n', [1, 2]],
    ['- a [1] text\n', ['a [1] text']]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a colon in a flow scalar is the character it is, not the end of the node', () => {
  // `http://x/y`, `host:5432` and `12:30` are one value each, and they are what a
  // hand-written config, a compose file and a health check put inside a flow
  // collection. A colon that ends a plain node whatever follows it meant every
  // one of them came back as the text the collection was written with — the
  // mapping, the list and every field in it gone, exit 0 and an empty stderr.
  for (const [text, want] of [
    ['a: {url: http://x/y}\n', [{ a: { url: 'http://x/y' } }]],
    ['a: {url: http://x}\n', [{ a: { url: 'http://x' } }]],
    ['a: {addr: host:5432}\n', [{ a: { addr: 'host:5432' } }]],
    ['a: [host:5432]\n', [{ a: ['host:5432'] }]],
    ['a: [http://x/y]\n', [{ a: ['http://x/y'] }]],
    // A colon is text in every position a value is written: in a nested table,
    // in a list, and after an explicit key.
    ['a: {b: {c: host:5432}}\n', [{ a: { b: { c: 'host:5432' } } }]],
    ['a: [{b: host:1}]\n', [{ a: [{ b: 'host:1' }] }]],
    ['a: {? b : host:1}\n', [{ a: { b: 'host:1' } }]],
    ['a: {b: x:y:z}\n', [{ a: { b: 'x:y:z' } }]],
    ['a: {b: "x", c: y:z}\n', [{ a: { b: 'x', c: 'y:z' } }]],
    // A value with a colon in it is still a value after an anchor, and the
    // reference is a copy, so the second field is the same one.
    ['a: &x {b: host:1}\nc: *x\n', [{ a: { b: 'host:1' }, c: { b: 'host:1' } }]],
    // Quoted is quoted, so a colon in there was never the question.
    ['a: {url: "http://x/y"}\n', [{ a: { url: 'http://x/y' } }]],
    // A key is asked the same question, and PyYAML asks it the same way:
    // `{b:c: 1}` is one field called `b:c`, not two fields.
    ['a: {b:c: 1}\n', [{ a: { 'b:c': 1 } }]],
    // `12:30` is YAML 1.1's sexagesimal and PyYAML reads 750. This reader keeps
    // the text, in a flow value as well as in a block one, so a clock stays a
    // clock — see the note on the sexagesimal in docs/cli.md.
    ['a: {t: 12:30}\n', [{ a: { t: '12:30' } }]],
    ['a: [12:30]\n', [{ a: ['12:30'] }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // What follows a colon still decides. `: ` ends the node, so a value that is
  // followed by a colon and a word is a document PyYAML refuses, and so is a
  // collection whose table never closes. All four of these were read as the text
  // they were written with — the whole file came back as one field — and the
  // three with a colon in them are now refused with the reader's own words.
  for (const [text, want] of [
    ['a: {b: c: d}\n', /expected , or \} in flow mapping/],
    ['a: {b: 1: }\n', /expected , or \} in flow mapping/],
    ['a: {b: x:}\n', /expected , or \} in flow mapping/],
    ['a: [1\n', /expected , or \] in flow sequence/]
  ]) {
    const r = run(text, 'yaml');
    assert.match(r.error || '', want, JSON.stringify(text));
    assert.strictEqual(r.data, undefined, JSON.stringify(text));
  }

  // The other two are the open question, and they are open on purpose. A `{` with
  // no colon in it never becomes a mapping, so this reader asks a question the
  // file does not answer and reads the line as the text it is — `a: {b` and
  // `- {a` come back as `{b` and `{a`. PyYAML refuses both. Turning that around
  // means answering `{b 1}` as `{"b 1": null}`, because a missing value is `null`
  // and not an error, so a JSON object gets a name no file wrote in it. That is a
  // choice and not a bug, and it is asked in the plan rather than decided here.
  for (const [text, want] of [
    ['a: {x, y}\n', '{x, y}'],
    ['a: {b\n', '{b']
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, [{ a: want }], JSON.stringify(text));
  }

  // An IPv6 address is a colon that is text five times over, and PyYAML refuses
  // the document. This reader has always preferred to read a file people have
  // written over to refuse it (see the note on `&base.image`), and that is the
  // answer the rule gives for free.
  assert.deepStrictEqual(run('a: {ip: ::1}\n', 'yaml').data, [{ a: { ip: '::1' } }]);
});

test('a line that is nothing but a name is the node under it, not a scalar', () => {
  // `&k` on a line of its own is a name with nothing written after it, and YAML
  // reads it as the node that follows: the mapping, the list or the value under
  // it. This reader read it as a scalar, because that is all there was on the
  // line — and then the rest of the file was never read. `&k` and then `a: 1`
  // and `b: 2` came out as the one string "&k", exit 0, an empty stderr, in a
  // file PyYAML 6.0.3 reads as `{a: 1, b: 2}`: a whole document replaced by the
  // two characters meant to name it. Under a key it was the other kind of broken
  // — `a:` / `  &k` / `  b: 1` died with "unexpected indentation", so the one
  // writing that shape had no file at all. Seventeen of twenty measured files
  // disagreed with PyYAML that way, in every spelling of the shape.
  for (const [text, want] of [
    ['&k\na: 1\n', [{ a: 1 }]],
    ['&k\na: 1\nb: 2\n', [{ a: 1, b: 2 }]],
    // The name is on a line of its own, so it says nothing about how far the node
    // it names reaches: a mapping level in and a mapping two levels in are the
    // same document, and PyYAML reads both.
    ['&k\n  a: 1\n', [{ a: 1 }]],
    ['&k # note\na: 1\n', [{ a: 1 }]],
    ['&k\n\na: 1\n', [{ a: 1 }]],
    ['---\n&k\na: 1\n', [{ a: 1 }]],
    ['a:\n  &k\n  b: 1\n', [{ a: { b: 1 } }]],
    // Not only a mapping: the node under the name is whatever the file wrote.
    ['&k\n- a\n- b\n', ['a', 'b']],
    ['&k\n- |\n  x\n', ['x\n']],
    ['&k\n? x\n: 1\n', [{ x: 1 }]],
    ['&k\n? x\n', [{ x: null }]],
    // A whole flow collection under the name is that collection, read by the
    // reader that knows the syntax — as a block mapping it was the field `{a`
    // with the text `1}` for a value, and `{a` is a name no file writes.
    ['&k\n{a: 1}\n', [{ a: 1 }]],
    // Nothing under the name is nothing, and a name with text behind it is the
    // text: `&k` alone is an empty document, `&k ?x` is the scalar `?x` — both
    // read as the whole line before, string included.
    ['&k\n', []],
    ['&k ?x\n', ['?x']],
    // The same question in the run of bare scalars the reader keeps for files
    // that are not YAML at all: `&x 1` is the number 1 with a name on it, the
    // answer a value in a mapping has given it since T82.
    ['&x 1\n', [1]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }

  // A name that stands on the whole document, used from inside it, is a value
  // that holds itself — the answer T82 chose for `a: &k` + `b: *k` when a whole
  // node cannot be carried in JSON. It has to be the same answer here, and before
  // this the name was never registered at all, so `*k` was an undefined alias.
  assert.match(
    String(run('&k\na: &x 1\nb: *k\n', 'yaml').error),
    /&k points at itself, and a value that holds itself is not one JSON can carry/
  );
  // A name the file never gave is the error every other reader of an alias gives
  // — it used to be the text "*k", one record in a file with no answer in it.
  assert.match(
    String(run('*k\n', 'yaml').error),
    /found undefined alias 'k' — an anchor is written &k and has to be named before it is used/
  );

  // A tag with nothing written after it says the type of the node under it, and a
  // tag this tool cannot carry is *named* — the warning is the only place a reader
  // learns this reader cannot deliver the type the file promised. It used to be
  // the string "!custom" with an empty stderr and the mapping under it unread.
  const tagged = run('!custom\na: 1\n', 'yaml');
  assert.deepStrictEqual(tagged.data, [{ a: 1 }]);
  assert.strictEqual(tagged.warnings.length, 1);
  assert.match(
    tagged.warnings[0],
    /YAML line 1: the tag "!custom" is not a type JSON carries, so the value was read as it was written/,
    tagged.warnings[0]
  );
  // A carried tag on a node that is not one value says so instead of reading on:
  // `&k !!str` above a mapping asks for a string and gets a table.
  assert.match(
    String(run('&k !!str\na: 1\n', 'yaml').error),
    /a "!!str" tag can only stand on one value, not on a table/
  );

  // Measured and left alone, in both directions, because PyYAML reads them the
  // same way this reader does not: a bare name *inside* a mapping is not a node
  // the file wrote — `a: 1` / `&k` / `b: 2` is two nodes in one mapping, and
  // PyYAML refuses it too, so the loud refusal is the honest answer and stays.
  assert.match(String(run('a: 1\n&k\nb: 2\n', 'yaml').error), /expected "key: value", got "&k"/);
  // A name on a value and on a sequence entry is a different spelling of the same
  // thing and is untouched: it has worked since T82 and must keep working.
  for (const [text, want] of [
    ['a: &k\n  b: 1\n', [{ a: { b: 1 } }]],
    ['a: &k\n', [{ a: null }]],
    ['- &k\n  a: 1\n', [{ a: 1 }]],
    ['- &k\n- b\n', [null, 'b']],
    ['a: &x 1\nb: *x\n', [{ a: 1, b: 1 }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('a key that carries a tag and no text of its own is named, not left out', () => {
  // A tag is a property of the node it stands in front of, and the node is there
  // even when no text follows the tag. The key-left-out question was asked first
  // and answered `null` before the tag was ever reached, so `? !custom` and
  // `a: {? !custom : 1}` dropped it *with nothing on stderr* — while the four
  // spellings that carry text are named and warned about. `!custom: 1` already
  // gave the field `!custom`, so the reader had two answers to one question.
  for (const text of [
    '? !custom\n: 1\n',
    '? !custom\n: {a: 1}\n',
    'a: {? !custom : 1}\n',
    'a: {? !custom : {x: 1}}\n',
    'a: {!custom : 1}\n',
    '- ? !custom\n  : 1\n'
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    const names = JSON.stringify(r.data).match(/"!custom"/g) || [];
    assert.strictEqual(names.length, 1, `${JSON.stringify(text)} did not name the key: ${JSON.stringify(r.data)}`);
    assert.strictEqual(r.warnings.length, 1, `${JSON.stringify(text)} warned ${r.warnings.length} times`);
    assert.match(
      r.warnings[0],
      /YAML line \d+: the tag "!custom" is not a type JSON carries, so the key was read as it was written/,
      `${JSON.stringify(text)}: ${r.warnings[0]}`
    );
  }
  // The value the entry carries is untouched by the naming of its key: a key
  // written as `!custom` above a mapping is a key with a table under it, and
  // reading it as a scalar is the mistake this rule exists next to.
  assert.deepStrictEqual(run('? !custom\n: {a: 1}\n', 'yaml').data, [{ '!custom': { a: 1 } }]);
  assert.deepStrictEqual(run('a: {? !custom : {x: 1}}\n', 'yaml').data, [{ a: { '!custom': { x: 1 } } }]);

  // A tag that asks for a type JSON *does* carry is PyYAML's own answer, and the
  // measured one is that the node is not nothing: `!!str` with no text behind it
  // is the empty string and `!!null` is `null`. Both were the key left out
  // before, which is a different field.
  assert.deepStrictEqual(run('? !!str\n: 1\n', 'yaml').data, [{ '': 1 }]);
  assert.deepStrictEqual(run('a: {? !!str : 1}\n', 'yaml').data, [{ a: { '': 1 } }]);
  assert.deepStrictEqual(run('? !!null\n: 1\n', 'yaml').data, [{ null: 1 }]);
  assert.deepStrictEqual(run('a: {? !!null : 1}\n', 'yaml').data, [{ a: { null: 1 } }]);
  // A carried tag that has no value to convert says so, which is what PyYAML's
  // own answer is for these three: it refuses the file as well.
  for (const tag of ['!!int', '!!float', '!!bool']) {
    assert.match(String(run(`? ${tag}\n: 1\n`, 'yaml').error), new RegExp(`"${tag}"`), tag);
  }

  // A bare `!` asks for no type at all, so it says nothing about the key and is
  // not part of its name — it named one, and `!` is a name no JSON file has.
  // `? !` is the key left out and `? ! x` is the key `x`, both as PyYAML reads.
  assert.deepStrictEqual(run('? !\n: 1\n', 'yaml').data, [{ null: 1 }]);
  assert.deepStrictEqual(run('? ! x\n: 1\n', 'yaml').data, [{ x: 1 }]);
  assert.deepStrictEqual(run('a: {? ! : 1}\n', 'yaml').data, [{ a: { null: 1 } }]);
  assert.strictEqual(run('? !\n: 1\n', 'yaml').warnings.length, 0);

  // A key left out with no property in front of it is untouched, in both
  // readers, and so is a property with no tag to name it: `~` is the other
  // spelling of nothing and an anchor renames the node, it does not name it.
  for (const [text, want] of [
    ['? : 1\n', [{ null: 1 }]],
    ['?\n: 1\n', [{ null: 1 }]],
    ['? ~\n: 1\n', [{ null: 1 }]],
    ['? &k ~\n: 1\n', [{ null: 1 }]],
    ['? x\n: 1\n', [{ x: 1 }]],
    ['a: {? x : 1}\n', [{ a: { x: 1 } }]],
    ['? !!str x\n: 1\n', [{ x: 1 }]],
    ['? ""\n: 1\n', [{ '': 1 }]]
  ]) {
    const r = run(text, 'yaml');
    assert.ok(!r.error, `${JSON.stringify(text)} was refused: ${r.error}`);
    assert.deepStrictEqual(r.data, want, JSON.stringify(text));
  }
});

test('CSV: 50 files read against Python\'s csv, and 23 written files read back', () => {
  // The CSV reader and writer had been measured by hand in sixteen iterations of
  // YAML work and never by a table, so nothing held them in place. Every line below
  // is a measured answer: the input is one of fifty shapes a real export has, the
  // expected value is what Python 3's `csv` module says about the same file, and a
  // line that differs says which of the reader's three documented rules it follows —
  // the trim of an unquoted field, the padding of a short row to the header's width,
  // or the dropping of a blank line between records. A cell count, a cell's text and
  // that trim are three different questions, and the table keeps them apart on
  // purpose: the last fifteen iterations each found a table that could not.

  // --- the reader, 50 files -------------------------------------------
  // "a,b\n1,2\n"
  assert.deepStrictEqual(run("a,b\n1,2\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // "name,note\n\"Smith, John\",ok\n"
  assert.deepStrictEqual(run("name,note\n\"Smith, John\",ok\n", 'csv', [], 'json').data, [{"name": "Smith, John", "note": "ok"}]);
  // "name,note\n\"Smith, John\",\"said \"\"hi\"\"\"\n"
  assert.deepStrictEqual(run("name,note\n\"Smith, John\",\"said \"\"hi\"\"\"\n", 'csv', [], 'json').data, [{"name": "Smith, John", "note": "said \"hi\""}]);
  // "name,note\n\"multi\nline\",x\n"
  assert.deepStrictEqual(run("name,note\n\"multi\nline\",x\n", 'csv', [], 'json').data, [{"name": "multi\nline", "note": "x"}]);
  // leading space before quote: trim: the space keeps the quotes literal, as they are in a real file
  // "name,note\n \"quoted\",x\n"
  assert.deepStrictEqual(run("name,note\n \"quoted\",x\n", 'csv', [], 'json').data, [{"name": "\"quoted\"", "note": "x"}]);
  // "a,b\n\"x\" ,y\n"
  assert.deepStrictEqual(run("a,b\n\"x\" ,y\n", 'csv', [], 'json').data, [{"a": "x ", "b": "y"}]);
  // "a,b\n\"x\"y,z\n"
  assert.deepStrictEqual(run("a,b\n\"x\"y,z\n", 'csv', [], 'json').data, [{"a": "xy", "b": "z"}]);
  // "a,b\na\"b,c\n"
  assert.deepStrictEqual(run("a,b\na\"b,c\n", 'csv', [], 'json').data, [{"a": "a\"b", "b": "c"}]);
  // "a,b\na\"b\"c,d\n"
  assert.deepStrictEqual(run("a,b\na\"b\"c,d\n", 'csv', [], 'json').data, [{"a": "a\"b\"c", "b": "d"}]);
  // "a,b\n\"\",x\n"
  assert.deepStrictEqual(run("a,b\n\"\",x\n", 'csv', [], 'json').data, [{"a": "", "b": "x"}]);
  // "a,b\n\"\"\"\",x\n"
  assert.deepStrictEqual(run("a,b\n\"\"\"\",x\n", 'csv', [], 'json').data, [{"a": "\"", "b": "x"}]);
  // "a,b\n\"a\"\"\",x\n"
  assert.deepStrictEqual(run("a,b\n\"a\"\"\",x\n", 'csv', [], 'json').data, [{"a": "a\"", "b": "x"}]);
  // "a,b\n\"  \",x\n"
  assert.deepStrictEqual(run("a,b\n\"  \",x\n", 'csv', [], 'json').data, [{"a": "  ", "b": "x"}]);
  // unquoted spaces trimmed: trim: the reader trims every field it did not read as quoted
  // "a,b\n  x  ,  y\n"
  assert.deepStrictEqual(run("a,b\n  x  ,  y\n", 'csv', [], 'json').data, [{"a": "x", "b": "y"}]);
  // unterminated quote: padded to the header's width, like any short row
  // "a,b\n\"c,d\n"
  assert.deepStrictEqual(run("a,b\n\"c,d\n", 'csv', [], 'json').data, [{"a": "c,d\n", "b": ""}]);
  // unterminated quote eof: padded to the header's width, like any short row
  // "a,b\n\"c"
  assert.deepStrictEqual(run("a,b\n\"c", 'csv', [], 'json').data, [{"a": "c", "b": ""}]);
  // "a,b\r1,2\r"
  assert.deepStrictEqual(run("a,b\r1,2\r", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // "a,b\r\n1,2\r\n"
  assert.deepStrictEqual(run("a,b\r\n1,2\r\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // "a,b\r\n\"x\ry\",z\r\n"
  assert.deepStrictEqual(run("a,b\r\n\"x\ry\",z\r\n", 'csv', [], 'json').data, [{"a": "x\ry", "b": "z"}]);
  // "a;b\n1;2\n"
  assert.deepStrictEqual(run("a;b\n1;2\n", 'csv', [], 'json', { delimiter: ";" }).data, [{"a": 1, "b": 2}]);
  // "a;b\n\"x;y\";2\n"
  assert.deepStrictEqual(run("a;b\n\"x;y\";2\n", 'csv', [], 'json', { delimiter: ";" }).data, [{"a": "x;y", "b": 2}]);
  // "a\tb\n1\t2\n"
  assert.deepStrictEqual(run("a\tb\n1\t2\n", 'csv', [], 'json', { delimiter: "\t" }).data, [{"a": 1, "b": 2}]);
  // "a|b\n1|2\n"
  assert.deepStrictEqual(run("a|b\n1|2\n", 'csv', [], 'json', { delimiter: "|" }).data, [{"a": 1, "b": 2}]);
  // "a,b\n1,2,\n"
  assert.deepStrictEqual(run("a,b\n1,2,\n", 'csv', [], 'json').data, [{"a": 1, "b": 2, "column3": ""}]);
  // "a,b\n1,2\n"
  assert.deepStrictEqual(run("a,b\n1,2\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // blank line between records: RFC 4180 lets a file carry blank lines between records; the reader drops them
  // "a,b\n1,2\n\n3,4\n"
  assert.deepStrictEqual(run("a,b\n1,2\n\n3,4\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}, {"a": 3, "b": 4}]);
  // blank quoted record: padded to the header's width, like any short row
  // "a,b\n1,2\n\"\"\n"
  assert.deepStrictEqual(run("a,b\n1,2\n\"\"\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}, {"a": "", "b": ""}]);
  // "a,b\n1,2,3,4\n"
  assert.deepStrictEqual(run("a,b\n1,2,3,4\n", 'csv', [], 'json').data, [{"a": 1, "b": 2, "column3": 3, "column4": 4}]);
  // "\"a,1\",b\n1,2\n"
  assert.deepStrictEqual(run("\"a,1\",b\n1,2\n", 'csv', [], 'json').data, [{"a,1": 1, "b": 2}]);
  // "\" a \",b\n1,2\n"
  assert.deepStrictEqual(run("\" a \",b\n1,2\n", 'csv', [], 'json').data, [{" a ": 1, "b": 2}]);
  // "a,\n1,2\n"
  assert.deepStrictEqual(run("a,\n1,2\n", 'csv', [], 'json').data, [{"a": 1, "": 2}]);
  // "a,b\n,\n"
  assert.deepStrictEqual(run("a,b\n,\n", 'csv', [], 'json').data, [{"a": "", "b": ""}]);
  // "a,b\n\"x;y|z\tw\",q\n"
  assert.deepStrictEqual(run("a,b\n\"x;y|z\tw\",q\n", 'csv', [], 'json').data, [{"a": "x;y|z\tw", "b": "q"}]);
  // "a,b,c\n,\"q\",\n"
  assert.deepStrictEqual(run("a,b,c\n,\"q\",\n", 'csv', [], 'json').data, [{"a": "", "b": "q", "c": ""}]);
  // "a,b,c\n1,,3\n"
  assert.deepStrictEqual(run("a,b,c\n1,,3\n", 'csv', [], 'json').data, [{"a": 1, "b": "", "c": 3}]);
  // "a,b\n\"1,234\",2\n"
  assert.deepStrictEqual(run("a,b\n\"1,234\",2\n", 'csv', [], 'json').data, [{"a": "1,234", "b": 2}]);
  // "a\n\"\"\n"
  assert.deepStrictEqual(run("a\n\"\"\n", 'csv', [], 'json').data, [{"a": ""}]);
  // single col plain empty: a blank line is not a record, so a one-column file of them has no rows
  // "a\n\n"
  assert.deepStrictEqual(run("a\n\n", 'csv', [], 'json').data, []);
  // "﻿a,b\n1,2\n"
  assert.deepStrictEqual(run("﻿a,b\n1,2\n", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // "a,b\n\"x\n\ny\",2\n"
  assert.deepStrictEqual(run("a,b\n\"x\n\ny\",2\n", 'csv', [], 'json').data, [{"a": "x\n\ny", "b": 2}]);
  // "a,b\n\"x\"\"\",2\n"
  assert.deepStrictEqual(run("a,b\n\"x\"\"\",2\n", 'csv', [], 'json').data, [{"a": "x\"", "b": 2}]);
  // "a,b,c\n1,\"\",3\n"
  assert.deepStrictEqual(run("a,b,c\n1,\"\",3\n", 'csv', [], 'json').data, [{"a": 1, "b": "", "c": 3}]);
  // space then unterminated: trim: same, on a file whose quote is never closed
  // "a,b\n \"c,d\n"
  assert.deepStrictEqual(run("a,b\n \"c,d\n", 'csv', [], 'json').data, [{"a": "\"c", "b": "d"}]);
  // delim inside unterminated: padded to the header's width, like any short row
  // "a,b\n\"c,d,e\n"
  assert.deepStrictEqual(run("a,b\n\"c,d,e\n", 'csv', [], 'json').data, [{"a": "c,d,e\n", "b": ""}]);
  // row shorter: padded to the header's width, like any short row
  // "a,b,c\n1,2\n"
  assert.deepStrictEqual(run("a,b,c\n1,2\n", 'csv', [], 'json').data, [{"a": 1, "b": 2, "c": ""}]);
  // "a,b\n1,2"
  assert.deepStrictEqual(run("a,b\n1,2", 'csv', [], 'json').data, [{"a": 1, "b": 2}]);
  // "\"\",b\n1,2\n"
  assert.deepStrictEqual(run("\"\",b\n1,2\n", 'csv', [], 'json').data, [{"": 1, "b": 2}]);
  // "a,b\n1,\"x\"y\"\n"
  assert.deepStrictEqual(run("a,b\n1,\"x\"y\"\n", 'csv', [], 'json').data, [{"a": 1, "b": "xy\""}]);
  // "a,b\n\"x;y\",2\n"
  assert.deepStrictEqual(run("a,b\n\"x;y\",2\n", 'csv', [], 'json').data, [{"a": "x;y", "b": 2}]);
  // "a;b\n\"x,y\";2\n"
  assert.deepStrictEqual(run("a;b\n\"x,y\";2\n", 'csv', [], 'json', { delimiter: ";" }).data, [{"a": "x,y", "b": 2}]);

  // --- the writer, 23 files a standard reader opens ---------------------
  // plain
  assert.strictEqual(serializers.csv([{"a": "1", "b": "x"}, {"a": "2", "b": "y"}]).trimEnd(), "a,b\n1,x\n2,y");
  // comma in value
  assert.strictEqual(serializers.csv([{"a": "1,234", "b": "x"}]).trimEnd(), "a,b\n\"1,234\",x");
  // quote in value
  assert.strictEqual(serializers.csv([{"a": "he said \"hi\"", "b": "x"}]).trimEnd(), "a,b\n\"he said \"\"hi\"\"\",x");
  // newline in value
  assert.strictEqual(serializers.csv([{"a": "multi\nline", "b": "x"}]).trimEnd(), "a,b\n\"multi\nline\",x");
  // cr in value
  assert.strictEqual(serializers.csv([{"a": "x\ry", "b": "z"}]).trimEnd(), "a,b\n\"x\ry\",z");
  // semicolon in value
  assert.strictEqual(serializers.csv([{"a": "x;y", "b": "z"}]).trimEnd(), "a,b\n\"x;y\",z");
  // tab in value
  assert.strictEqual(serializers.csv([{"a": "x\ty", "b": "z"}]).trimEnd(), "a,b\n\"x\ty\",z");
  // pipe in value
  assert.strictEqual(serializers.csv([{"a": "x|y", "b": "z"}]).trimEnd(), "a,b\n\"x|y\",z");
  // leading space value
  assert.strictEqual(serializers.csv([{"a": " x", "b": "y"}]).trimEnd(), "a,b\n\" x\",y");
  // trailing space value
  assert.strictEqual(serializers.csv([{"a": "x ", "b": "y"}]).trimEnd(), "a,b\n\"x \",y");
  // only spaces value
  assert.strictEqual(serializers.csv([{"a": "   ", "b": "y"}]).trimEnd(), "a,b\n\"   \",y");
  // empty value
  assert.strictEqual(serializers.csv([{"a": "", "b": "y"}]).trimEnd(), "a,b\n,y");
  // empty header name
  assert.strictEqual(serializers.csv([{"a": "x", "": "y"}]).trimEnd(), "a,\nx,y");
  // header w/ space
  assert.strictEqual(serializers.csv([{" a ": "x", "b": "y"}]).trimEnd(), "\" a \",b\nx,y");
  // both headers w/ space
  assert.strictEqual(serializers.csv([{" a": "x", "a ": "y"}]).trimEnd(), "\" a\",\"a \"\nx,y");
  // header with comma
  assert.strictEqual(serializers.csv([{"a,1": "x", "b": "y"}]).trimEnd(), "\"a,1\",b\nx,y");
  // header with quote
  assert.strictEqual(serializers.csv([{"a\"1": "x", "b": "y"}]).trimEnd(), "\"a\"\"1\",b\nx,y");
  // numbers as numbers
  assert.strictEqual(serializers.csv([{"a": 1, "b": 2.5}]).trimEnd(), "a,b\n1,2.5");
  // bool value: a boolean is written as the word, and read back as the word
  // bool value
  assert.strictEqual(serializers.csv([{"a": true, "b": false}]).trimEnd(), "a,b\ntrue,false");
  // null value: a value with no cell of its own is an empty cell, not the word
  // null value
  assert.strictEqual(serializers.csv([{"a": null, "b": "x"}]).trimEnd(), "a,b\n,x");
  // one column one row
  assert.strictEqual(serializers.csv([{"a": ""}]).trimEnd(), "a\n\"\"");
  // value looks like formula
  assert.strictEqual(serializers.csv([{"a": "=SUM(A1)", "b": "x"}]).trimEnd(), "a,b\n=SUM(A1),x");
  // unicode
  assert.strictEqual(serializers.csv([{"a": "Ærø blå", "b": "日本"}]).trimEnd(), "a,b\nÆrø blå,日本");
})

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

