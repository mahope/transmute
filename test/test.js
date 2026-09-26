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
    serializers.sql([{ a: 1 }], 'my"table'),
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
  // An unbalanced `{` is a different file, and it reads the way it reads today.
  assert.deepStrictEqual(run('{a: 1', 'yaml', []).data, [{ '{a': 1 }]);
  // Nor does a collection on the root line swallow the lines under it, and a
  // collection spread over several lines is not a document this rule reaches.
  assert.deepStrictEqual(run('{a: 1}\nb: 2', 'yaml', []).data, [{ '{a': '1}', b: 2 }]);
  assert.deepStrictEqual(run('[\n  {a: 1},\n  {a: 2}\n]', 'yaml', []).data, ['[']);
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
  assert.deepStrictEqual(run('<rows a="1"/>', 'xml', []).data, []);
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

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
