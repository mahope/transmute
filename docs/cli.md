# Transmute CLI reference

Everything the free CLI can do, with a runnable example and the exact output for
every operation. The examples are executed by `npm test`, so they cannot drift
away from the code — see [Keeping this page honest](#keeping-this-page-honest).

- [Install and run](#install-and-run)
- [Options](#options)
- [Exit codes](#exit-codes)
- [Formats and type coercion](#formats-and-type-coercion)
- [Operations](#operations)
- [Conversions](#conversions)
- [Scripts, pipes and files](#scripts-pipes-and-files)
- [Limits](#limits)
- [The browser and the desktop app](#the-browser-and-the-desktop-app)
- [Keeping this page honest](#keeping-this-page-honest)

## Install and run

Requires Node 22 or newer (tested on 22 and 24). No accounts, no configuration, no network calls.

```bash
npx @mahope/transmute people.csv --output json
```

Or clone and run it locally:

```bash
git clone https://github.com/mahope/transmute.git
cd transmute
npm install        # nothing to download — the CLI has zero dependencies
npm link           # makes `transmute` available in your shell
```

Every example below uses `transmute`. If you did not run `npm link`, prefix it
with `node src/cli.js`.

## Options

| Option | Meaning |
|---|---|
| `-f, --format <type>` | Input format: `json`, `csv`, `yaml`, `xml`. Auto-detected from the file extension, then from the content. |
| `-p, --pipe <json>` | Transformation pipeline, a JSON array of steps. |
| `-o, --output <type>` | Output format: `json`, `csv`, `yaml`, `xml`, `table`, `sql`. Defaults to `table`. |
| `--out <file>` | Write the output to a file instead of stdout. |
| `--table <name>` | Table name for SQL output. Default `my_table`. |
| `--delimiter <d>` | Field delimiter for CSV/TSV input: `,` `;` `tab` or `|`. Detected from the header line when omitted. |
| `-v, --version` | Print the version. |
| `-h, --help` | Print the built-in help. |

Exactly one input file is accepted. Use `-` or a pipe to read from stdin.

With no `--pipe` and no `--output`, Transmute prints a preview table of the
input, which is the quickest way to check what a file contains.

## Exit codes

| Code | Meaning | Typical cause |
|---|---|---|
| `0` | Success | — |
| `1` | The transformation failed | The engine threw while transforming |
| `2` | Usage error | Unknown option, bad option value, `--pipe` that is not a valid pipeline |
| `3` | Input error | File missing, unreadable, or unparseable as the input format |

Errors always go to stderr, prefixed with `Error:`, and stdout stays empty on
failure — so `transmute in.json -o csv > out.csv` never leaves a half-written
file behind. That makes the CLI safe in cron jobs and CI:

```bash
transmute export.json --pipe '[{"op":"filter","expr":"item.status === \"active\""}]' -o csv > active.csv \
  || echo "transmute failed with $?" >&2
```

## Formats and type coercion

Input: `json`, `csv`, `yaml`, `xml`. Output: `json`, `csv`, `yaml`, `xml`,
`table`, `sql`.

JSON is always an array of records internally. A single object becomes a
one-record array, so every operation works the same regardless of input.

CSV has no types, so values are coerced the way spreadsheets do:

- `30` becomes the number `30`
- `true` and `false` become booleans
- an empty cell becomes an empty string
- `0074` stays the string `"0074"` — leading zeros survive, so postcodes and
  product codes are not silently mangled
- numbers with 16 or more digits stay strings, so nothing loses precision

### Delimiters, quotes and line endings

CSV is read the way RFC 4180 describes it, because that is what spreadsheets
export:

- The delimiter is detected from the header line. `,` `;` tab and `|` are
  recognised, and a tie keeps `,`. Excel in Denmark, Germany and most of
  Europe writes `;` by default, so `navn;by;pris` is three columns, not one.
- `--delimiter ,`, `--delimiter ;`, `--delimiter tab` or `--delimiter |` forces
  it when the file is ambiguous. An unknown value is a usage error (exit 2).
- A quoted field may contain the delimiter, escaped quotes (`""`) and line
  breaks. `"Linje 1\nLinje 2"` is one value, not two records.
- Whitespace inside quotes is data: `" padded "` keeps its spaces. Unquoted
  fields are still trimmed, so `  padded  ` becomes `padded`.
- A UTF-8 byte-order mark and CRLF line endings are handled and do not end up in
  your field names.
- A row with **more** fields than the header keeps the extra values in
  `column4`, `column5`, … — named after their position, so a real column of that
  name is never overwritten (it becomes `column4_2`). The run still succeeds
  (exit 0) and one warning on stderr says which rows and which columns are
  involved. A row with *fewer* fields is padded with `''`, as before.

Detection uses the same rule as the reader, so a file the reader can read is
never refused for want of a `--format` flag. That matters most on **stdin**,
where there is no file extension to go by — a Danish Excel export, a TSV and a
pipe-delimited table all used to be sent to the JSON reader and rejected with
`Could not parse input as json`, even though the reader behind the check
handled all of them:

```bash
printf 'navn;by;pris\nMette;KBH;199,50\n' | transmute --output json
```

```json
[
  {
    "navn": "Mette",
    "by": "KBH",
    "pris": "199,50"
  }
]
```

A file with no delimiter at all is a one-column CSV when it has more than one
line, so a mailing list is read rather than refused:

```bash
printf 'email\na@b.dk\nc@d.dk\n' | transmute --output csv
```

```csv
email
a@b.dk
c@d.dk
```

JSON, YAML and XML are still recognised first, so nothing is stolen from them. A
single line with no delimiter stays JSON, which is what keeps the bare scalars
`42`, `true` and `hello` scalars instead of one-column tables.

`test/fixtures/ragged.csv` is a file where someone appended a column to the
data without touching the header. Row 3 is the proof, and it is part of the test
suite:

```bash
transmute test/fixtures/ragged.csv --output json
```

```
Warning: 1 of 3 CSV rows has more fields than the header (row 3); the extra values are kept in column4
```

```json
[
  {
    "id": 1,
    "name": "Alice",
    "note": "ok"
  },
  {
    "id": 2,
    "name": "Mette, Copenhagen",
    "note": "DK",
    "column4": "follow-up"
  },
  {
    "id": 3,
    "name": "Bob",
    "note": "ok"
  }
]
```

#### Writing: quote anything a reader could mistake for structure

Reading is only half of it — a CSV you write has to survive being read back. A
value is quoted when it contains `"`, a line break, **or any of the delimiters
this tool recognises** (`,` `;` tab `|`). That includes the CR in a CRLF file,
which the reader treats as the end of a record. `test/fixtures/tricky.csv` has a
semicolon, a pipe and an escaped quote in its free-text column:

```bash
transmute test/fixtures/tricky.csv --output csv
```

```csv
code,note
a-1,"semi; colon"
a-2,"pipe| bar"
a-3,"say ""hi"" now"
```

Piping that output straight back in gives the original rows, byte for byte:

```bash
transmute test/fixtures/tricky.csv --output csv | transmute --output json
```

Without the quoting, `semi; colon` was written bare. This tool read it back
correctly, but a reader that auto-detects the delimiter — Danish Excel, most
tools in this category — split the column and lost the row's meaning one hop
later. Free text is the field most likely to contain a semicolon, which is
exactly why the export quotes it.

The same applies in the other direction, and silently, when records do not all
have the same keys. `csv`, `table` and `sql` output use every key any record
has, in the order they first appear, so a field that only the second record
carries is no longer dropped:

```bash
echo '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","email":"bob@example.com"}]' | transmute --output csv
```

```csv
id,name,email
1,Alice,
2,Bob,bob@example.com
```

#### Nested values in a flat cell

A CSV column and a SQL column hold one scalar. An object or an array is not
one, and this tool used to write it with `String()`: an object became the
literal text `[object Object]` and an array became its elements joined with
commas. Both exited 0 with nothing on stderr, so an API response with a nested
`user` object produced a CSV whose `user` column was those fourteen characters,
and two different arrays — `["a,b"]` and `["a","b"]` — produced the same file.

Now an object and an array are written as compact JSON in the cell, and
`csv`, `table` and `sql` all do it the same way. This is what `jq`'s `@csv`
writes for a non-scalar, so the cell is faithful and still parseable:

```bash
transmute test/fixtures/orders.json --output csv
```

```csv
id,customer,status,items,total
1,alice,paid,"[{""sku"":""a-1"",""qty"":2}]",120
2,bob,open,"[{""sku"":""b-1"",""qty"":1},{""sku"":""b-2"",""qty"":3}]",60
3,carla,paid,"[{""sku"":""c-1"",""qty"":5}]",250
```

`null` and a missing key still write an empty cell, because an empty cell is
what the CSV reader reads back as an empty string. JSON in a cell is faithful
but it is not a column you can sort or sum, so promote the field you actually
want when you need a real column — see [`flatten`](#flatten) and
[`map`](#map).

`test/fixtures/european.csv` is a semicolon file with a quoted comma and a
quoted newline, and it is part of the test suite:

```bash
transmute test/fixtures/european.csv --pipe '[{"op":"sort","by":"antal","dir":"desc"}]' --output json
```
```json
[
  {
    "navn": "Hans",
    "by": "Aarhus",
    "note": "Linje 1\nLinje 2",
    "antal": 7
  },
  {
    "navn": "Mette",
    "by": "Copenhagen",
    "note": "Salg, mellem",
    "antal": 3
  }
]
```

XML is read as records: `<users><user>…</user><user>…</user></users>` becomes
one record per `<user>`, with element names as field names. Text content stays
a string (`"age": "30"`), because XML does not say what `"30"` means. Use a
pipeline step such as `{"op":"map","expr":"({...item, age: Number(item.age)})"}`
when you want numbers.

YAML support covers the shapes this tool cares about: a list of objects, a list
of scalars, and a single top-level object — read by indentation, so nested
mappings and sequences at any depth survive, as do block scalars (`|`, `>`),
single and double quotes, flow collections (`[a, b]`, `{k: v}`) and `#`
comments. Anchors, aliases and multi-document files are not supported; a file
with more than one document is read as its first document and says so on
stderr.

A top-level mapping is one record, the way a key-value document is one row:

```bash
cat config.yaml | transmute --format yaml
```

```json
[
  {
    "a": 1,
    "b": "hello"
  }
]
```

## Operations

A pipeline is a JSON array. Steps run left to right, each one seeing the output
of the previous one.

### filter

Keep the records where a JavaScript expression is true. `item` is the record,
`i` is its index.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"filter","expr":"item.age > 26"}]' --output json
```

```json
[
  {
    "name": "Alice",
    "age": 30,
    "zip": "0074",
    "active": true,
    "city": "Aarhus"
  },
  {
    "name": "Carla",
    "age": 41,
    "zip": 8000,
    "active": true,
    "city": "Aarhus"
  }
]
```

### map

Replace every record with the result of an expression. Return an object to
keep a record shape; return a scalar to turn records into values.

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"map","expr":"({...item, label: item.customer.toUpperCase()})"}]' --output json
```

```json
[
  {
    "id": 1,
    "customer": "alice",
    "status": "paid",
    "items": [
      {
        "sku": "a-1",
        "qty": 2
      }
    ],
    "total": 120,
    "label": "ALICE"
  },
  {
    "id": 2,
    "customer": "bob",
    "status": "open",
    "items": [
      {
        "sku": "b-1",
        "qty": 1
      },
      {
        "sku": "b-2",
        "qty": 3
      }
    ],
    "total": 60,
    "label": "BOB"
  },
  {
    "id": 3,
    "customer": "carla",
    "status": "paid",
    "items": [
      {
        "sku": "c-1",
        "qty": 5
      }
    ],
    "total": 250,
    "label": "CARLA"
  }
]
```

### pick

Keep only the named fields, in the order you list them.

```bash
transmute test/fixtures/people.yaml --pipe '[{"op":"pick","fields":["name","city"]}]' --output csv
```

```csv
name,city
Alice,Aarhus
Bob,Odense
Carla,Aarhus
```

### omit

Drop the named fields.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"omit","fields":["zip","active"]}]' --output csv
```

```csv
name,age,city
Alice,30,Aarhus
Bob,25,Odense
Carla,41,Aarhus
Daniel,25,Odense
```

### sort

Sort by one field. `dir` is `asc` (default) or `desc`. Numbers sort
numerically, everything else as text. Records missing the field sort last.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"sort","by":"age","dir":"desc"}]' --output csv
```

```csv
name,age,zip,active,city
Carla,41,8000,true,Aarhus
Alice,30,0074,true,Aarhus
Bob,25,2100,false,Odense
Daniel,25,2100,true,Odense
```

### unique

Keep the first record for each value of a field, or drop fully identical
records when no field is given.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"unique","by":"age"}]' --output csv
```

```csv
name,age,zip,active,city
Alice,30,0074,true,Aarhus
Bob,25,2100,false,Odense
Carla,41,8000,true,Aarhus
```

### group

Group by a field. Each group becomes `{ key, count, items }`, where `items` is
the full set of records in the group. Records with no value for the field are
grouped under `(null)`.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"group","by":"city"}]' --output table
```

```text
+--------+-------+---------------------------------+
| key    | count | items                           |
+--------+-------+---------------------------------+
| Aarhus | 2     | [{"name":"Alice","age":30,…},{…}] |
| Odense | 2     | [{"name":"Bob","age":25,…},{…}]   |
+--------+-------+---------------------------------+
(2 rows, 3 columns)
```

Nested records are shown as JSON inside the `table` output, so a grouped cell
is still readable — pipe the result through `pick` or `flatten` for a flat
report.

### count

Collapse to a single record with the number of records.

```bash
transmute test/fixtures/users.xml --pipe '[{"op":"count"}]' --output json
```

```json
[
  {
    "count": 3
  }
]
```

### head

Keep the first `n` records (default 10).

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"head","n":2}]' --output csv
```

```csv
name,age,zip,active,city
Alice,30,0074,true,Aarhus
Bob,25,2100,false,Odense
```

### tail

Keep the last `n` records (default 10).

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"tail","n":2}]' --output csv
```

```csv
name,age,zip,active,city
Carla,41,8000,true,Aarhus
Daniel,25,2100,true,Odense
```

### rename

Rename fields with a mapping. Existing field order is kept.

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"rename","mapping":{"customer":"buyer","total":"amount"}}]' --output json
```

```json
[
  {
    "id": 1,
    "buyer": "alice",
    "status": "paid",
    "items": [
      {
        "sku": "a-1",
        "qty": 2
      }
    ],
    "amount": 120
  }
]
```

### flatten

Expand an array field into one record per element. Object elements are merged
into the parent record, so `flatten` turns nested arrays into rows.

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"flatten","field":"items"},{"op":"pick","fields":["id","sku","qty"]}]' --output csv
```

```csv
id,sku,qty
1,a-1,2
2,b-1,1
2,b-2,3
3,c-1,5
```

### add

Add computed fields without rewriting the record. A failing expression yields
`null` for that field rather than stopping the run. Accepts either
`{"fields": {"total": "expr"}}` or a single `{"expr": "…"}` pair per field.

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"add","fields":{"lines":"item.items.length","big":"item.total > 100"}}]' --output json
```

```json
[
  {
    "id": 1,
    "customer": "alice",
    "status": "paid",
    "items": [{ "sku": "a-1", "qty": 2 }],
    "total": 120,
    "lines": 1,
    "big": true
  }
]
```

### join

Merge rows from an inline table on a shared field. `with` holds the other side,
`on` is the key, and `keep` decides what happens to records with no match:
`left` keeps them, anything else drops them. Matching fields never overwrite
existing ones, so a `prefix` is what you need when the other side has a field
name you already have:

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"join","on":"customer","keep":"left","with":[{"customer":"alice","tier":"gold"},{"customer":"bob","tier":"silver"}]}]' --output table
```

```text
+----+----------+--------+---------------------------------+-------+--------+
| id | customer | status | items                           | total | tier   |
+----+----------+--------+---------------------------------+-------+--------+
| 1  | alice    | paid   | [{"sku":"a-1","qty":2}]         | 120   | gold   |
| 2  | bob      | open   | [{"sku":"b-1","qty":1},{"…"}]  | 60    | silver |
| 3  | carla    | paid   | [{"sku":"c-1","qty":5}]         | 250   |        |
+----+----------+--------+---------------------------------+-------+--------+
(3 rows, 6 columns)
```

Both sides have their own `status` in real data, and a join cannot invent a
third answer for one field. Without a `prefix` the existing name wins and the
other side's value is dropped. With one, both survive under their own names:

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"join","on":"customer","prefix":"was_","with":[{"customer":"alice","status":"refunded"}]}]' --output json
```

```json
[
  {
    "id": 1,
    "customer": "alice",
    "status": "paid",
    "items": [
      {
        "sku": "a-1",
        "qty": 2
      }
    ],
    "total": 120,
    "was_status": "refunded"
  }
]
```

A `prefix` only helps when the prefixed name is itself free. If the left record
already has `was_status`, that field is dropped the same way, and the join says
nothing about it — pick a prefix that is not already in use.

## Conversions

No pipeline, just a different format. These are the format pairs the fixtures
in `test/fixtures/` cover.

CSV to JSON, with type coercion:

```bash
transmute test/fixtures/people.csv --output json
```

```json
[
  {
    "name": "Alice",
    "age": 30,
    "zip": "0074",
    "active": true,
    "city": "Aarhus"
  }
]
```

YAML to CSV:

```bash
transmute test/fixtures/people.yaml --output csv
```

```csv
name,age,city
Alice,30,Aarhus
Bob,25,Odense
Carla,41,Aarhus
```

JSON to CSV with a nested value — see [Nested values in a flat
cell](#nested-values-in-a-flat-cell) for why the cell holds JSON:

```bash
transmute test/fixtures/orders.json --output csv
```

```csv
id,customer,status,items,total
1,alice,paid,"[{""sku"":""a-1"",""qty"":2}]",120
2,bob,open,"[{""sku"":""b-1"",""qty"":1},{""sku"":""b-2"",""qty"":3}]",60
3,carla,paid,"[{""sku"":""c-1"",""qty"":5}]",250
```

Nested YAML to JSON — mappings, sequences, a block scalar and a quoted string,
three levels deep:

```bash
transmute test/fixtures/nested.yaml --output json
```

```json
[
  {
    "service": {
      "name": "billing",
      "replicas": 3,
      "labels": {
        "team": "payments",
        "tier": "critical"
      },
      "routes": [
        {
          "path": "/invoices",
          "methods": [
            "GET",
            "POST"
          ],
          "limits": {
            "rpm": 600
          }
        },
        {
          "path": "/refunds",
          "methods": [
            "POST"
          ],
          "limits": {
            "rpm": 60
          }
        }
      ],
      "changelog": "2026-09-01 first release\n2026-09-20 added refunds\n",
      "note": "quoted: with a colon # and a hash"
    },
    "tags": [
      "fast",
      "audited"
    ],
    "feature_flags": {
      "new_pricing": false,
      "beta": null
    }
  }
]
```

The same file written back as YAML keeps the structure, and a second run
produces byte-identical output:

```bash
transmute test/fixtures/nested.yaml --output yaml
```

```yaml
- service:
    name: billing
    replicas: 3
    labels:
      team: payments
      tier: critical
    routes:
      - path: /invoices
        methods:
          - GET
          - POST
        limits:
          rpm: 600
      - path: /refunds
        methods:
          - POST
        limits:
          rpm: 60
    changelog: |
      2026-09-01 first release
      2026-09-20 added refunds
    note: "quoted: with a colon # and a hash"
  tags:
    - fast
    - audited
  feature_flags:
    new_pricing: false
    beta: null
```

A string that would be read back as something else is quoted on the way out:
`0074` stays `"0074"` instead of becoming the number 74.

XML to JSON — one record per `<user>`:

```bash
transmute test/fixtures/users.xml --output json
```

```json
[
  {
    "name": "Alice",
    "age": "30",
    "city": "Aarhus"
  }
]
```

#### XML entities are decoded on the way in

The writer escapes `&`, `<`, `>`, `"` and `'`, so the reader decodes them. Without
that, `xml → xml` is not a round trip but a ratchet: `Tom &amp; Jerry` comes back
as `Tom &amp;amp; Jerry`, and the next pass grows it again. `&#65;` and `&#x42;`
become `A` and `B`, so numeric character references work too:

```bash
transmute test/fixtures/entities.xml --output json
```

```json
[
  {
    "name": "Tom & Jerry",
    "tag": "a <b> &amp; c",
    "code": "AB"
  }
]
```

`&amp;amp;` in that `tag` is a literal `&amp;` in the file — an escaped ampersand,
decoded exactly one level, which is what the file said. An entity this tool does
not know, such as `&nbsp;`, is passed through unchanged rather than guessed at.

JSON to SQL, with `--table` choosing the table name:

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"pick","fields":["id","customer","total"]}]' --output sql --table orders
```

```sql
-- Generated by Transmute
INSERT INTO "orders" ("id", "customer", "total") VALUES
  (1, 'alice', 120),
  (2, 'bob', 60),
  (3, 'carla', 250);
```

SQL output quotes text, leaves numbers unquoted and escapes single quotes by
doubling them. Two values that look alike are kept apart, because they are not
the same thing in a database:

| Value in the input | Written as | Why |
|---|---|---|
| `null`, or a key no record has | `NULL` | The value is absent |
| `""`, or a blank CSV field | `''` | The value is an empty string |
| `2100` | `2100` | A number |
| `0074` | `'0074'` | A leading zero marks an identifier, not a number |

```bash
transmute test/fixtures/sql-empty.csv --output sql
```

```sql
-- Generated by Transmute
INSERT INTO "my_table" ("name", "middle", "zip", "score") VALUES
  ('Alice', '', '0074', 30),
  ('Bob', 'Quinn', 2100, 25);
```

Writing the blank `middle` as `NULL` produced a file that imported without an
error and then answered no rows to `WHERE middle = ''`. The same goes for a
postal code: `0074` is not 74, so a leading zero keeps the quotes on.

JSON to YAML:

```bash
transmute test/fixtures/people.yaml --pipe '[{"op":"pick","fields":["name","age"]},{"op":"sort","by":"age","dir":"desc"}]' --output yaml
```

```yaml
- name: Carla
  age: 41
- name: Alice
  age: 30
- name: Bob
  age: 25
```

JSON to XML:

```bash
transmute test/fixtures/orders.json --pipe '[{"op":"pick","fields":["id","status"]}]' --output xml
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<data>
  <item>
    <id>1</id>
    <status>paid</status>
  </item>
</data>
```

The `table` output is for reading, not for piping: it shows at most 20 rows
plus a count.

## Scripts, pipes and files

Read from stdin, write to a file:

```bash
cat test/fixtures/orders.json | transmute --pipe '[{"op":"filter","expr":"item.status === \"paid\""},{"op":"pick","fields":["id","total"]}]' --output csv
```

```csv
id,total
1,120
3,250
```

```bash
transmute huge-export.json --pipe '[{"op":"filter","expr":"item.active"}]' -o csv --out active.csv
```

Batch over a directory of CSVs:

```bash
for f in exports/*.csv; do
  transmute "$f" --pipe '[{"op":"count"}]' -o json >> counts.jsonl
done
```

## Limits

There are none. No run cap, no record cap, no file-size cap, no upload, no
account, no telemetry. The engine is one dependency-free file
([`src/engine.js`](../src/engine.js)) that never opens a socket: the test suite
asserts it contains no `require(`, `fetch(`, `XMLHttpRequest` or `process.`
reference at all. A 50-record pipeline is part of the test suite, and a
million-record file takes exactly as long as the machine needs.

## The browser and the desktop app

The same engine runs in the browser on [transmute.run](https://transmute.run/)
and inside Transmute Desktop, and the test suite runs every example on this
page through both copies to prove the output is identical.

Transmute Desktop is the paid, separate app: $19 one time, up to three
machines, with a visual pipeline builder for people who would rather not write
JSON. The CLI in this repository is free, MIT licensed and complete on its own —
you never need the desktop app to use Transmute.

- Desktop and the purchase: https://transmute.run/
- License help: https://transmute.run/support/

## Keeping this page honest

`npm test` runs three suites:

1. `test/test.js` — unit tests for the engine.
2. `test/cli.test.mjs` — the real CLI in a child process: every command on this
   page, all exit codes, stdout/stderr separation, `--out`, stdin, and a
   50-record run.
3. `test/conformance.test.mjs` — every command and every excerpt above is
   compared with what the engine actually produces, and the CLI engine and the
   browser engine must agree byte for byte.

If you change engine behaviour, regenerate the snapshots with
`npm run snapshots:cli`, then update this page in the same commit.
