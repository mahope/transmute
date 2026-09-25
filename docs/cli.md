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

Requires Node 18 or newer. No accounts, no configuration, no network calls.

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

XML is read as records: `<users><user>…</user><user>…</user></users>` becomes
one record per `<user>`, with element names as field names. Text content stays
a string (`"age": "30"`), because XML does not say what `"30"` means. Use a
pipeline step such as `{"op":"map","expr":"({...item, age: Number(item.age)})"}`
when you want numbers.

YAML support covers the shapes this tool cares about: a list of objects, a list
of scalars, and a single top-level object. Anchors, multi-document files and
nested block structures are not supported.

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
existing ones, so a `prefix` on the other side is only needed for genuinely new
names.

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

SQL output quotes text, leaves numbers unquoted, emits `NULL` for empty values
and escapes single quotes by doubling them.

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
