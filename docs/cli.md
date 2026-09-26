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
| `--out <file>` | Write the output to a file instead of stdout. Needs `--output`. |
| `--table <name>` | Table name for SQL output. Default `my_table`. Needs `--output sql`. |
| `--delimiter <d>` | Field delimiter for CSV/TSV **input**: `,` `;` `tab` or `|`. Detected from the header line when omitted. Needs CSV input. |
| `-v, --version` | Print the version. |
| `-h, --help` | Print the built-in help. |

Exactly one input file is accepted. Use `-` or a pipe to read from stdin.

Each option is given once. Giving one twice is a usage error, because the last
one used to win and the earlier ones were dropped without a word: two `--pipe`
flags ran only the second pipeline, `--output json --output csv` wrote CSV, and
`--out a.csv --out b.csv` wrote only `b.csv` — all of it exit 0 with an empty
stderr, and output that looked like the command that was asked for. A short
alias counts as the same flag, so `-p` and `--pipe` together is a repeat too.
Steps are collected in a single `--pipe`, because the flag order would otherwise
decide the order of the steps:

```bash
transmute people.csv --pipe '[{"op":"sort","by":"age"}]' --pipe '[{"op":"head","n":3}]' --output csv
```

```
Error: --pipe was given 2 times, and only the last one would have been used. Put every step in one --pipe, as a JSON array.
```

With no `--pipe` and no `--output`, Transmute prints a preview table of the
input, which is the quickest way to check what a file contains. The preview is
the same run with the same flags, `--delimiter` included — it used to read the
file with the auto-detected delimiter and show you a table of a file you had
already told it how to read.

### An option that cannot do its job

Three options are only meaningful next to another one, and they used to be
accepted anyway and then dropped, without a word on stderr and with exit 0:

| Command | What it used to do |
|---|---|
| `transmute people.csv --out people.json` | Printed the preview. **No file was written** — the sharpest of the three, because the user asked for a file and got a table on the screen. |
| `transmute people.csv --pipe '[{"op":"head","n":2}]' --out top.json` | Wrote the file — as an ASCII table, under a name that says JSON. |
| `transmute people.csv --table users` | Printed the preview. The table name was never used, because only SQL output has a table. |
| `transmute orders.json --delimiter ';' -o json` | Read and wrote exactly what it would have without the flag. The writer always writes a comma, so `--delimiter` can only steer the *reader*. |

All three are usage errors now, exit 2, nothing on stdout and no file:

```bash
transmute people.csv --out people.json
```

```
Error: --out needs --output: without it Transmute prints a preview and writes no file. Say what the file should hold with --output json, csv, yaml, xml, table or sql.
```

```bash
transmute people.csv --table users -o csv
```

```
Error: --table names the table in SQL output only, but the output here is csv. Use --output sql, or drop --table.
```

```bash
transmute orders.json --delimiter ';' -o json
```

```
Error: --delimiter applies to CSV input, and this input is json. Drop it, or read the file as CSV with --format csv.
```

What still works, because the flag *is* the thing being asked for there:
`--out file` with `--output`, `--out -` for stdout, `--table name` with
`--output sql`, and `--delimiter ';'` on a CSV input with JSON, YAML or SQL
output — the Danish Excel export read as four columns:

```bash
transmute european.csv --delimiter ';' -o json
```

## Exit codes

| Code | Meaning | Typical cause |
|---|---|---|
| `0` | Success | — |
| `1` | The transformation failed | The engine threw while transforming, or the chosen `--output` was asked for data that format cannot represent (a character outside XML 1.0 `Char` or YAML `c-printable`, a `U+0000` or a lone surrogate anywhere, or a number that is not finite in **any** format) |
| `2` | Usage error | Unknown option, bad option value, an option given twice, an option that cannot do its job (`--out` without `--output`, `--table` without `--output sql`, `--delimiter` without CSV input), `--pipe` that is not a valid pipeline, a step missing a parameter it needs, an expression that is not valid JavaScript |
| `3` | Input error | File missing, unreadable, unparseable as the input format, or not UTF-8 |

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

Writing CSV is where quoting earns its keep, because the reader trims and
types whatever it reads back. Three rules, all measured on the real binary:

- A cell whose bare form would not read back the same is **quoted**. That is a
  value with a space at either end, and — in a one-column export — an empty or
  blank value:

  ```bash
  printf '[{"a":"  x  ","b":"y"}]' | transmute --output csv
  ```

  ```csv
  a,b
  "  x  ",y
  ```

- A **blank line between records is still skipped**, as RFC 4180 allows, but a
  quoted empty field is a record and not a blank line. A one-column export
  therefore keeps its empty rows: `[{"v":"a"},{"v":""},{"v":"c"}]` writes
  `v` / `a` / `""` / `c` and reads back as three records. It used to write a
  blank line, and the reader ate it — three records in, two out, exit 0 and
  nothing on stderr.

- A **column name** follows the same rule as a value, and it used not to. A
  header written bare is trimmed by the reader, so a name with a space at
  either end came back under a different name — and a header holding nothing
  but spaces was written as a line the reader read as a *blank line*, which
  RFC 4180 allows between records, so the header was eaten and the file read
  back with no rows at all. Names are quoted, never trimmed:

  ```bash
  printf '[{"Total ":1,"Total":2}]' | transmute --output csv
  ```

  ```csv
  "Total ",Total
  1,2
  ```

  This is the ordinary shape of it: a spreadsheet export with a stray trailing
  space in one column name. Before, both names were written bare, both were
  trimmed to `Total`, the two columns became one, and the second value
  overwrote the first — a whole column of data gone, exit 0, nothing on
  stderr.

- A string that **looks like a number or a boolean** is written as text and
  read back as a number or a boolean. Quoting cannot prevent this — the reader
  takes the quotes off before it converts, so `"true"` comes back as `true` —
  and RFC 4180 has no way to say *this cell is a string*. So the run says which
  columns, and still writes the file (exit 0):

  ```bash
  printf '[{"id":"1","navn":"Ada","ok":"true"},{"id":"2","navn":"Bob","ok":"false"}]' | transmute --output csv
  ```

  ```csv
  id,navn,ok
  1,Ada,true
  2,Bob,false
  ```

  ```
  Warning: csv: 2 of 3 columns hold values that are written as text and read back as a number or a boolean: "id" (2), "ok" (2). Quoting does not prevent it; json, yaml and xml keep the strings.
  ```

  Only columns that actually held a string are named — `navn` is not, because a
  name is a name to a reader too — and a value that keeps its type (`0074`,
  `12:30`, `1e5`, `yes`) is never named. Use `--output json`, `yaml` or `xml`
  when the strings have to survive as strings.

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

### A header that names a column twice

Two columns of one name are one field, so one of them cannot survive. The reader
keeps the last of them — the same rule JSON and YAML duplicates follow — and says
which values are gone. A spreadsheet export with `name` in column 2 and again in
column 4 is the ordinary shape of it:

```bash
transmute test/fixtures/dup-header.csv --output json
```

```
Warning: CSV: the header names "name" twice (columns 2 and 4); they hold different values in 2 of 2 rows, so only the last of them is kept and the values in the others are gone. One of those names is a mistake in the input.
```

```json
[
  {
    "id": 1,
    "name": "Alice B",
    "email": "a@x.dk"
  },
  {
    "id": 2,
    "name": "Bob C",
    "email": "b@x.dk"
  }
]
```

Nothing is printed when the two columns hold the same value in every row: a file
that says the same thing twice is not a mistake, and a warning for it would be
noise on correct input. `1` and `1.0` are compared as the reader read them, so
that pair stays silent too.

### Text encoding

Text is UTF-8, on a file and on a pipe alike. That is not a preference: reading
anything else as UTF-8 does not fail, it *replaces*. Every byte sequence that is
not valid UTF-8 decodes to `U+FFFD`, so a Windows-1252 export of a Danish
customer list came out with `M?ller` instead of `Møller` — exit 0, nothing on
stderr, and the mangled names written to the output file, where they looked
healthy. A UTF-16 export was worse: the byte-order mark and the NUL bytes
between every character became a single field name of `\uFFFD` and `\u0000`.

So input that is not UTF-8 is an **input error** (exit 3), it is refused before
anything is written, and the message says where to look:

```bash
iconv -f iso-8859-1 customers.csv > customers-utf8.csv
```

```bash
transmute customers.csv --output json
```

```
Error: customers.csv is not valid UTF-8 (first invalid character at position 9). Transmute reads text as UTF-8, so every non-ASCII character would be replaced with U+FFFD and the result written out as if it were correct. Convert the input to UTF-8 first, for example with: iconv -f iso-8859-1 -t utf-8 FILE > FILE-utf8
```

Transmute does not guess which encoding the file was in, because every wrong
guess would rewrite your bytes. Convert the file, then run it again — everything
valid UTF-8 is read, including `Møller`, `🚀` and `日本`, and including a file
that really does contain a `U+FFFD` character.

### A name the input gives twice

`{"id": 1, "id": 2}` is not valid JSON, and `id: 1` followed by `id: 2` is the
classic YAML trap: the second line wins, the first value is gone, and both
runners exit 0 with nothing on stderr. It reads like a merge that went the way
you meant, which is exactly why it is worth saying out loud. A key in JSON is
always a string with a `:` after it, so the collision can be found exactly, at
any depth, in JSON, in a YAML block mapping and in a YAML flow mapping.

The value is kept — the **last** one, the same answer `JSON.parse` and `jq`
give — the run succeeds, and the collision is named on stderr with the key, both
values and the lines they are on. stdout stays pure data, so a script can pipe
it onward without stripping a warning off the front. In a file of 40 000
records nobody is going to read it by hand, but "lines 2 and 4" is a place to
look.

```bash
printf '{\n  "id": 1,\n  "name": "Ada",\n  "name": "Bob"\n}\n' > dup.json && transmute dup.json --output csv
```

```
id,name
1,Bob
```

```
Warning: JSON: key "name" has two different values (lines 3 and 4) — "Ada" and "Bob"; the last one is kept. One of them is a mistake in the input.
```

The same input twice with the **same** value — `{"a":1,"a":1}` — is not a
collision: there is nothing to decide, so it stays silent. Neither is a key that
appears in two different records, or a key that merely looks like one inside a
string value.

### Flow collections, on one line and as the whole file

`[a, b]` and `{k: v}` are read as collections, wherever they sit in a YAML
file: under a key, on a line of their own, or as the entire document.

```bash
printf 'servers:\n  hosts: {a: 1, b: two}\n' | transmute --format yaml --output json
```

```json
[
  {
    "servers": {
      "hosts": {
        "a": 1,
        "b": "two"
      }
    }
  }
]
```

The whole file being a collection is the same syntax, so it is read the same
way. That case used to reach the block reader, which took `{a` for a key and
gave back one field holding the text `1, b: two}` — exit 0, nothing on stderr,
and a conversion of a document nobody wrote.

```bash
printf '{a: 1, b: two}\n' | transmute --format yaml --output json
```

```json
[
  {
    "a": 1,
    "b": "two"
  }
]
```

A key the collection gives twice is still named, with the same words as a JSON
or block-mapping collision. There is no line number to give, because the
collection is one line:

```bash
printf '{a: 1, a: 2}\n' | transmute --format yaml --output csv
```

```
a
2
```

```
Warning: YAML: key "a" has two different values — 1 and 2; the last one is kept. One of them is a mistake in the input.
```

A collection has to close on its own line to be read as a collection. A file
that opens one and never closes it, and a collection spread over several lines,
are read the way they always were — as the text they are.

### A cell that cannot be shown: `table` and `sql`

The refusals above are about a character **no** file can hold. This is the other
kind: a value every format can carry, written in a way that misrepresents it.

`table` is a box drawn with `|`, `+` and `-`, and it is the format the preview
uses — the first thing almost every user sees. So a cell is the one place in
this tool where the *spelling* of a character decides what the reader sees.
Measured on the real binary, four ordinary characters in ordinary data each broke
the box at exit 0 with nothing on stderr:

| In a value | What the terminal did |
|---|---|
| `line1\nline2` | one record printed as two rows, and the frame lost a border |
| `a\rb` | the cursor went back to column 0, so `b` overwrote the row's left border |
| `a\tb` | `displayWidth` counts a tab as one column, a terminal advances up to eight, so the right border sat where the text did not end |
| `x\|y` | a bare `\|` reads as the box's own separator, so the cell looked like two columns |

```bash
printf '[{"a":"line1\\nline2","b":"x|y"}]' | transmute --output table
```

```
+--------------+------+
| a            | b    |
+--------------+------+
| line1\nline2 | x\|y |
+--------------+------+
(1 rows, 2 columns)
```

So a cell writes what a terminal cannot show as the escape the reader already
knows: `\n`, `\r`, `\t`, and `\xNN` for any other control character, which is
invisible rather than merely wide. A `|` is written `\|`, the same spelling a
Markdown table gives the same character for the same reason. `+` and `-` are
**not** escaped one by one — that would turn every date into `2026\-09\-26` — but
a cell made entirely of them has its first character escaped, because that is the
one shape that can pose as a border line:

```bash
printf '[{"a":"+---+"}]' | transmute --output table
```

```
+--------+
| a      |
+--------+
| \+---+ |
+--------+
(1 rows, 1 columns)
```

A **column name is a cell too**, and the worst one, because every row below lines
up to it. A newline in a field name split the header across two lines and took
the whole table with it.

One thing is deliberately given up: a nested value is written as compact JSON, so
`["x|y"]` becomes `["x\|y"]`, which is no longer parseable JSON. That trade is
right in a table and wrong everywhere else, because a table cell is never read by
a program — there is no `table` reader — while the frame it sits in is what the
reader relies on. For a value a program has to read back, use `--output json`.

`sql` has the mirror-image problem, and it is about **identifiers** rather than
values. A column name and a table name are wrapped in `"`, and a `"` inside one
is escaped by *doubling* it, exactly as `''` doubles inside a string literal.
The value side already did this; the identifier side wrapped the name in quotes
and hoped:

```bash
printf '[{"a":1}]' | transmute --output sql --table 'ta"bel'
```

```sql
-- Generated by Transmute
INSERT INTO "ta""bel" ("a") VALUES
  (1);
```

Before the fix that file was `INSERT INTO "ta"bel" ("a") VALUES`, and sqlite3
answered `Parse error near "bel": syntax error` — while Transmute exited 0 with
empty stderr, so the user got a file that cannot be imported and no word about
it. `--table` is a flag the user types, so this is one stray quote away from an
ordinary command.

A `;` or a `--` in a name is **not** the same hole, and was measured rather than
assumed: inside a quoted identifier they are ordinary characters, and a value
containing `'; DROP TABLE secret; --` is already doubled to `''` and imports with
every table intact. A `"` cannot inject either — it closes the identifier early,
but then the column list's `(` is never closed, so the statement stops parsing
and the rest of the line is rejected. It was never injection. It is a file that
does not import, which is the smaller claim and the smaller fix.

A **newline in a SQL value is left alone**, which is a decision and not an
oversight. SQL string literals may hold one, sqlite3 imports the file, and the
value comes back with its newline intact. Writing `\n` instead would store a
literal backslash and an `n` — SQL has no escape inside a literal — so "fixing"
the line break would replace the value with a different one:

```bash
printf '[{"a":"l1\\nl2"}]' | transmute --output sql
```

```sql
-- Generated by Transmute
INSERT INTO "my_table" ("a") VALUES
  ('l1
l2');
```

### Lists in XML: repeated elements, and the three that have no shape

A list is written as **repeated elements of the same name**, which is the one
shape XML has for one and what an XML document actually looks like:

```bash
printf '[{"id":1,"tags":["red","blue"]},{"id":2,"tags":["green"]}]' > tags.json && transmute tags.json --output xml
```

```
Warning: xml: 1 field(s) hold a list of one, which XML writes as the single value it is: "tags" (1). It reads back as that value, not as a list of one — the value is kept, the list around it is not.
<?xml version="1.0" encoding="UTF-8"?>
<data>
  <item>
    <id>1</id>
    <tags>red</tags>
    <tags>blue</tags>
  </item>
  <item>
    <id>2</id>
    <tags>green</tags>
  </item>
</data>
```

Transmute used to write a list as numbered `<field name="0">` children instead.
That is a list wearing an object's clothes: the index that says *which member*
lived in an attribute, because an element name cannot say it twice in a row. Any
reader that maps element name to value then keeps the **last** member and loses
the rest — `{"tags":["red","blue","green"]}` came out as one tag, `green` — and
Transmute's own reader read `[1,2,3]` back as `{"0":"1","1":"2","2":"3"}`. A list
whose members carried `@name` was worse than lossy: the element got **two
`name` attributes**, and `expat` refused the file outright.

Reading the file above back gives the list, and one field that is not a list
any more:

```bash
transmute tags.json --output xml | transmute --format xml --output json
```

```
[
  {
    "id": "1",
    "tags": [
      "red",
      "blue"
    ]
  },
  {
    "id": "2",
    "tags": "green"
  }
]
```

The numbers are text now, as they always were — an XML element is text, so
`1` reads back as `"1"`. What comes back is a **list**, which is the part that
used to be lost.

Three list shapes have no answer here, and each is named on stderr. The run
still succeeds and stdout is still clean data, because nothing is wrong with the
command — the file just cannot say what it lost:

| Shape | Written as | Reads back as | Why there is no other answer |
|---|---|---|---|
| A list of one | the value itself, `<tags>green</tags>` | `"green"` | one element is what a scalar is, and anything that told them apart would have to be on the element a plain value also uses |
| An empty list | an empty element, `<tags/>` | `{}` | an empty element is exactly what an empty object is |
| A list inside a list | numbered `<field name="0">` children | `{"0":…}` | `[[1,2]]` and `{"v":[1,2]}` would otherwise be the same document |

Telling those three apart would take a marker attribute, and a marker is a
convention every other reader would have to know about to see the list at all —
a worse trade than saying so. A file full of ordinary lists is silent.

A key that is not a legal XML tag name still travels in a `name` attribute on
`<field>`, once per member, so a list under such a key is still a list:

```bash
printf '[{"first name":["Ada","Bob"]}]' | transmute --format json --output xml
```

```
<?xml version="1.0" encoding="UTF-8"?>
<data>
  <item>
    <field name="first name">Ada</field>
    <field name="first name">Bob</field>
  </item>
</data>
```

### XML output: the characters XML itself cannot hold

XML 1.0 is not able to represent every character. Its `Char` production is

```
Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
```

so tab, newline and carriage return are in, and `U+0000`–`U+0008`, `U+000B`,
`U+000C`, `U+000E`–`U+001F`, the two permanently unassigned characters
`U+FFFE` and `U+FFFF`, and half a surrogate pair are **out**. A control character
inside a value is ordinary data — a NUL from a fixed-width export, a bell from a
terminal capture — and writing it raw produced a file that declared
`version="1.0"` and that no XML parser would accept. Expat calls it
`not well-formed (invalid token)`. Transmute's own reader was lenient enough to
read the file back, so a round trip through Transmute hid it completely, and the
run exited 0 with nothing on stderr.

There is no entity that saves it. `&#0;` is refused by the very production above,
so an escape would not make the file valid, and dropping the character would
throw the data away. So the run stops, names the character and the field, and
writes nothing — exit **1**, which is a transformation failure, because the
pipeline is fine and the data is what XML cannot carry.

```bash
printf '[{"id":1,"note":"a\x00b"}]' > nul.json && transmute nul.json --output xml
```

```
Error: XML 1.0 cannot write U+0000 (NUL), which is in row 1, field "note". There is no way to keep it: a numeric character reference is refused by the same rule. Write CSV, JSON, SQL or YAML instead, or remove the character before converting.
```

This belongs to the *target format*, not to the data, and the other writers
apply the same rule to the characters **they** cannot hold. A `U+0000` is the
clearest case, because it survives into four of the five text formats and breaks
every one of them:

| `--output` | A `U+0000` in a value | What the reference reader says |
|---|---|---|
| `xml` | **refused**, exit 1 | `expat`: `not well-formed (invalid token)` |
| `yaml` | **refused**, exit 1 | PyYAML: `unacceptable character #x0000: special characters are not allowed` |
| `csv` | **refused**, exit 1 | Python `csv`: `_csv.Error: line contains NUL` |
| `sql` | **refused**, exit 1 | SQLite: `OperationalError: unrecognized token` |
| `table` | **refused**, exit 1 | `file(1)`: `data`, not text — and the box is misaligned |
| `json` | written | escaped as `\u0000`, so every reader keeps the value |

The other three name it the same way, one per line, with the file they refuse to
write:

```
Error: CSV cannot write U+0000 (NUL), which is in row 1, field "note". There is no way to keep it: a NUL ends the record for every reader of CSV. Write JSON instead, or remove the character before converting.
Error: SQL cannot write U+0000 (NUL), which is in row 1, field "note". There is no way to keep it: a NUL ends the string literal. Write JSON instead, or remove the character before converting.
Error: a text table cannot write U+0000 (NUL), which is in row 1, field "note". There is no way to keep it: a NUL ends the cell for every reader. Write JSON instead, or remove the character before converting.
```

So the escape route is **JSON**, and only JSON: it is the one format with an
escape for every character. A character that survives the write is not the same
as a file something can read — and Transmute's own reader is lenient enough to
read all of these back, so a round trip through Transmute hides it completely.
Nothing is written when a writer refuses: `stdout` stays empty and `--out`
leaves no file, so `> out.csv` is never a broken file.

The same `U+0000` read as YAML says this, and names the same way out:

```bash
printf '[{"id":1,"note":"a\x00b"}]' > nul.json && transmute nul.json --output yaml
```

```
Error: YAML 1.2 cannot write U+0000 (NUL), which is in row 1, field "note". There is no way to keep it: YAML has no escape for it either. Write JSON instead, or remove the character before converting.
```

YAML is the strictest of the five because `c-printable` excludes fifteen
characters, not one:

```bash
printf '[{"v":"x\u0007y"}]' > bell.json && transmute bell.json --output yaml
```

```
Error: YAML 1.2 cannot write U+0007 (BEL), which is in row 1, field "v". There is no way to keep it: YAML has no escape for it either. Write JSON instead, or remove the character before converting.
```

Tab, newline and carriage return are inside *every* format's character set, so
none of them refuse those, and neither does `café`, `日本` or `🚀`.

#### The character no file can hold: a lone surrogate

The `U+0000` above is a real character that these formats cannot carry. A **lone
surrogate** is not a character at all — it is half of a UTF-16 pair whose other
half never arrived, and UTF-8 has no encoding of it. It is reachable from ordinary
input, because JSON’s `\udXXX` escape produces one, so this file is valid JSON
made only of ASCII:

```bash
printf '[{"id":1,"note":"a\\ud800b"}]' > half.json && transmute half.json --output csv
```

```
Error: CSV cannot write U+D800 (half of a surrogate pair — the other half is missing), which is in row 1, field "note". There is no way to keep it: a lone surrogate has no UTF-8 encoding, so every writer puts U+FFFD in its place — a different value from the one you gave it. Write JSON instead, or remove the character before converting.
Error: SQL cannot write U+D800 (half of a surrogate pair — the other half is missing), which is in row 1, field "note". There is no way to keep it: a lone surrogate has no UTF-8 encoding, so every writer puts U+FFFD in its place — a different value from the one you gave it. Write JSON instead, or remove the character before converting.
Error: a text table cannot write U+D800 (half of a surrogate pair — the other half is missing), which is in row 1, field "note". There is no way to keep it: a lone surrogate has no UTF-8 encoding, so every writer puts U+FFFD in its place — a different value from the one you gave it. Write JSON instead, or remove the character before converting.
```

`yaml` and `xml` were refusing it before this was found, each by its own grammar,
and they still do, in their own words:

```
Error: YAML 1.2 cannot write U+D800 (half of a surrogate pair — the other half is missing), which is in row 1, field "note". There is no way to keep it: YAML has no escape for it either. Write JSON instead, or remove the character before converting.
Error: XML 1.0 cannot write U+D800 (half of a surrogate pair — the other half is missing), which is in row 1, field "note". There is no way to keep it: a numeric character reference is refused by the same rule. Write CSV, JSON, SQL or YAML instead, or remove the character before converting.
```

Until this was refused, `csv`, `sql` and `table` wrote `61 efbf bd 62` — the `a` and
the `b` with `U+FFFD` wedged between them — at **exit 0 with empty stderr**, while
`json`, `yaml` and `xml` in the very same run disagreed with them. The value that
came out was a different value from the one that went in, and no reader could
tell, because `U+FFFD` is a perfectly ordinary character once it is in the file.

The other three now refuse it for the reason that applies to all five: the
character cannot exist in a file of any format, so the question is not what a
format’s rules allow but whether the character can be written at all.

`json` is still the way out the messages name, and it is lossless —
`JSON.stringify` escapes the surrogate as `\ud800`, seven ASCII bytes that parse
back to the very same lone surrogate:

```bash
transmute half.json --output json    # [{"id": 1, "note": "a\ud800b"}]
```

`U+FFFE` and `U+FFFF` are refused by `yaml` and `xml` and written by the other
three, and that asymmetry is deliberate: unlike a lone surrogate, they *can* be
encoded in UTF-8, they survive the round trip exactly, and `file(1)` calls a file
containing them text. The rule here is whether a reader can read the file, and
for these three it can.

#### The value no format carries: a number that is not finite

`1e400` is a **legal JSON number literal**, so this file is one any JSON tool
accepts — and it parses to `Infinity`:

```bash
printf '[{"id":1,"a":1e400,"ok":1e308}]' > inf.json && transmute inf.json --output json
```

```
Error: JSON cannot write Infinity, which is in row 1, field "a". There is no way to keep it: JSON has no form for it, so the number is written as null — a different value, and one that reads as nothing there at all. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
```

This is the one refusal that is **not** about a single format, and it is the one
worth measuring twice, because the six writers did not agree on what to do with
one value. Every row below was measured on the real binary, then read back with
the reference reader for that format. All six were **exit 0 with empty stderr**:

| `--output` | What it wrote | What the reference reader says |
|---|---|---|
| `json` | `null` | the number is **gone**, replaced by a value that reads as "nothing here" |
| `yaml` | `Infinity` | PyYAML: **`str`**, not float — YAML's own spelling is `.inf` |
| `sql` | `'Infinity'` | SQLite: `typeof(x)` = **`text`** |
| `csv` | `Infinity` | a cell is text, so a reader gets a word |
| `table` | `Infinity` | a cell is text |
| `xml` | `<Infinity>` | every element is text, so a parser reads a word |

So the number silently became a **string** in five formats and stopped existing
in the sixth. Each says so in its own words now:

```
Error: YAML 1.2 cannot write Infinity, which is in row 1, field "a". There is no way to keep it: a YAML reader takes the bare word for a string and not a float — YAML's own spelling is .inf, so the number would change type. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
Error: CSV cannot write Infinity, which is in row 1, field "a". There is no way to keep it: a CSV cell is text, so what a reader gets back is the word and not the number. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
Error: SQL cannot write Infinity, which is in row 1, field "a". There is no way to keep it: it would be written as a string literal, and SQLite stores that with type text. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
Error: a text table cannot write Infinity, which is in row 1, field "a". There is no way to keep it: a cell in a text table is text, so the number would be printed as a word. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
Error: XML 1.0 cannot write Infinity, which is in row 1, field "a". There is no way to keep it: every XML element is text, so a parser reads the word and not a number. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
```

Note what these messages do **not** say. Every other refusal names a way out —
`Write JSON instead` — because JSON escapes every character the other five
refuse. Here there is no way out to name, so they say that instead of pointing at
an escape that does not exist. That is also why `json` is in the table at all: it
is the route out of every *character* refusal and the **worst** answer to this one.

The second way in is a pipeline, and it is the one a user actually meets. JSON
cannot spell `NaN`, but an expression divides by zero all the time — an
`amount / units` on a row where `units` is `0`:

```bash
printf '[{"amount":10,"units":0}]' > rate.json
transmute rate.json --output csv --pipe '[{"op":"add","fields":{"price":"item.amount / item.units"}}]'
```

```
Error: CSV cannot write Infinity, which is in row 1, field "price". There is no way to keep it: a CSV cell is text, so what a reader gets back is the word and not the number. No format here carries a value that is not finite, so fix the number before converting: 1/0 and 0/0 in an expression, and a literal like 1e400, all produce one.
```

Before this it exited **0** and wrote `null` for the field — a value the next step
carries on with as if it were data.

The boundary is **finiteness, not size**. `1e308`, `1.7976931348623157e308`,
`5e-324`, `0` and `-0` are ordinary numbers and every format writes them; only
`Infinity`, `-Infinity` and `NaN` are refused.

#### What XML output does not keep: types

XML has no types, so every element comes back as a string. `{"id": 1}` becomes
`<id>1</id>` and reads back as `{"id": "1"}`. Use `json` or `csv` when the type
matters — for a database import, `--output sql` writes numbers unquoted and the
rest as literals, which is what `INSERT` wants.

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

#### Writing YAML: a string a reader would read as something else

YAML is the one output format here with no types in it, and that cuts both ways.
A number is written bare and read back as a number, and a string is written bare
too — so a string that *looks* like a number comes back as one, quietly, with
exit 0 and nothing on stderr. YAML 1.1's vocabulary is wider than YAML 1.2's
and much wider than a number:

| Value in the input | Written as | A YAML 1.1 reader reads it as |
|---|---|---|
| `yes`, `no`, `on`, `off` (and `Yes`, `OFF`, …) | `"yes"` | `True` / `False` |
| `12:30`, `1:30:45` | `"12:30"` | `750`, `5445` — a clock time is base 60 |
| `1_000` | `"1_000"` | `1000` — underscores are in YAML's integer rule |
| `2026-09-26` | `"2026-09-26"` | a timestamp, not a string |
| `.inf`, `.NaN` | `".inf"` | a float, not a string |
| `0074` | `"0074"` | `60` — a leading zero is octal in YAML, not decimal |
| `<<`, `=` | `"<<"` | *refuses the whole file* — neither tag has a constructor |

```bash
echo '[{"answer":"yes","opened":"12:30","due":"2026-09-26","zip":"0074","merge":"<<"}]' | transmute --output yaml
```

```yaml
- answer: "yes"
  opened: "12:30"
  due: "2026-09-26"
  zip: "0074"
  merge: "<<"
```

Field **names** get the same treatment, because a key that resolves elsewhere
comes back under another name: a `yes` column arrives as `True`, and `0074`
arrives as the octal `60`.

Two things are deliberately *not* quoted, so a file does not turn into noise: a
string a reader keeps as a string stays bare (`y`, `n`, `12:60`, `1.2.3`,
`2026-9-26`, `2026/09/26`, `NaN`, `inf`), and a number that is a number is
written as YAML wants it, with a `.` and a signed exponent so `1e-7` goes out as
`1.0e-7` and reads back as a float.

This tool's own YAML reader is more permissive than PyYAML here — it reads `yes`
and `12:30` back as strings — so a round trip through this tool is not evidence
that another reader agrees. The rule is the productions PyYAML ships in
`yaml/resolver.py`, transcribed whole.

### A row that is not a record: `csv`, `table` and `sql`

These three formats have one shape: a header, and a row of cells under it. A JSON
array does not have to hold records, and one `map` step makes a file that does
not — so a row can meet the writer with no fields of its own. It has no cell to
be written in, and each format did the only thing it could:

| Input | `csv` / `table` | `sql` | `json` / `yaml` / `xml` |
|---|---|---|---|
| `[{"a":1},"Alice"]` | an empty cell | `NULL` | kept as it is |
| `["Alice",{"a":1}]` | an empty cell | `NULL` | kept as it is |
| `["Alice","Bob"]` | no header, so no rows | no columns, so no statement | kept as it is |
| `[[1,2],{"a":9}]` | columns `0` and `1` | columns `0` and `1` | kept as a list |

All of it exit 0. The last row is the only one that keeps its values, because a
list's positions *are* field names — so it reads back as `{"0":1,"1":2}`, the
members kept and the list around them gone.

The value in the other three rows is not in the file, and nothing said so. That
is the same silence [a longer row than the header](#a-header-that-names-a-column-twice)
was, at the other end of the same line, and it gets the same answer: the run
succeeds, the file is written, and **one warning names the rows, what they were,
and what the file did with them.**

```bash
printf '[{"a":1},"Alice",{"a":2}]' | transmute --output csv
```

```
Warning: csv: 1 of 3 rows is not a record (row 2 is a string ("Alice")); it was written as an empty cell, so a value that is not a record is not in the file. json, yaml and xml keep it.
a
1
""
2
```

It is a warning and not an error, because these steps are for files of records
and a few rows that are not must not cost the other 10 000. It is not an invented
column either: a row with no fields has no name to hang a column on, and a
`value` column is a convention every other reader would have to know to see the
data at all.

`sql` had a second answer to the same question, and it was the worst of the lot.
It asked whether the **first** row was an object, so a file that began with a
string or a number got an empty statement — and every record after it was gone,
at exit 0, in a file that was written and looked fine. Only "there are no
columns" is a reason to write nothing:

```bash
printf '["Alice",{"name":"Bob"}]' | transmute --output sql
```

```sql
Warning: sql: 1 of 2 rows is not a record (row 1 is a string ("Alice")); it was written as NULL, so a value that is not a record is not in the file. json, yaml and xml keep it.
-- Generated by Transmute
INSERT INTO "my_table" ("name") VALUES
  (NULL),
  ('Bob');
```

`json`, `yaml` and `xml` need no warning: all three can carry every value the
flat three refuse, and `json` is the route out of everything this tool refuses to
write.

### A field a row does not have: `csv` and `table`

The header is the union of every row's fields, so a record that lacks one gets a
cell — and RFC 4180 has no way to say *this cell holds no value*. The cell is
empty, and a reader, this one included, reads an empty cell as an empty
**string**. An explicit `null` takes the same road, which is the worse half of
it: the value was there and a different value comes back, so an import that
trusts the file stores `''` in a column you meant to leave empty.

`sql` is not named, and that is the difference between the two answers: it
writes `NULL`, which is SQL's own word for a value that is not there, so the
file says it out loud. `json`, `yaml` and `xml` keep the difference too — an
absent key is absent and a null is a key holding null.

```bash
printf '[{"id":1,"navn":"Ada","email":null},{"id":2,"navn":"Bo"},{"id":3,"email":"c@x.dk"}]' | transmute --output csv
```

```text
Warning: csv: 2 of 3 columns are not in every row: "navn" (1 of 3), "email" (1 of 3); 1 of 3 columns holds an explicit null: "email" (1 of 3). Those cells are written empty and read back as an empty string, which is a value and not an absence. sql writes NULL instead; json, yaml and xml keep the difference.
id,navn,email
1,Ada,
2,Bo,
3,,c@x.dk
```

A value that *is* there is never named: `""`, `0`, `false` and `{}` are values,
and only a missing key and a `null` are the two the file cannot hold. A column
only a list row contributed — `Object.keys` on a list is its positions — is not
missing from the records either, and is named by the warning above instead.

## Operations

A pipeline is a JSON array. Steps run left to right, each one seeing the output
of the previous one.

### What a step must bring with it

Every operation needs one parameter to do its job, and a step that leaves it out
is a usage error (exit 2) naming the step and the parameter. Each of them used
to run anyway and answer with something else, with exit 0 and an empty stderr:
`filter` without `expr` kept every row, `pick` without `fields` wrote an empty
object per row, and a `join` with an empty `with` dropped every row. A mistyped
key, or a shell variable that expanded to nothing, looked like a run that
worked.

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"pick"}]' --output csv
```

```
Error: Pipeline step 1 (pick): "fields" is required, a field name or an array of field names
```

| Operation | Required | Also accepted |
|---|---|---|
| `filter`, `map` | `expr` | a JavaScript expression, tested as written |
| `pick`, `omit` | `fields` | a field name, or an array of them |
| `sort`, `group` | `by` | a field name |
| `unique` | — | `by` is optional: without it, fully identical records are dropped |
| `rename` | `mapping` | an object of `{oldField: newField}` |
| `flatten` | `field` | a field name holding the arrays |
| `add` | `fields` | an object of `{newField: expression}` |
| `join` | `with`, `on` | a non-empty array of records, and the field to join on |
| `head`, `tail` | — | `n` is optional and defaults to 10 |
| `count` | — | takes no parameters |

An empty `expr` is a mistake, not an identity — it is what a shell variable that
was never set leaves behind. `head` and `tail` take a number of rows, so `n: 0`
is no rows: the last zero rows used to come back as all of them.

### When a field name is in no row

A step that names a field no record has is a typo, and each of these operations
used to answer the typo with a different result and say nothing at all — exit 0,
empty stderr, and a file that is not the one that was asked for. `unique` by
`ag` compared `undefined` to `undefined`, decided all four rows were identical
and wrote one of them; `sort` sorted nothing; `group` put everything in a single
`(null)` group; `pick` dropped the field; `rename` renamed nothing; a `join`
whose `on` no record has drops every row.

The run still succeeds, because a script written for one file is often run
against another, and the output is still the output the step produced. What
changed is that one warning on stderr names the step, the field and what
happened, while stdout stays exactly the data:

```bash
transmute test/fixtures/people.csv --pipe '[{"op":"unique","by":"ag"}]' --output json
```

```
Warning: unique: no record has a field named "ag"; every row looked identical, so 1 of 4 rows survived
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

`pick`, `omit`, `sort`, `unique`, `group`, `rename`, `flatten` and `join` are all
checked. The check is per step, against the data as it is at that point, so a
field `add` or `map` just created is not missing, and a field a previous
`rename` removed is.

A field *some* records have is not reported. Heterogeneous data is what a left
join with no match and an API that adds a key look like, and `pick` is built for
it:

```bash
printf '[{"id":1,"email":"a@x.dk"},{"id":2},{"id":3,"email":"c@x.dk"}]' \
  | transmute --pipe '[{"op":"pick","fields":["id","email"]}]' --output table
```

```
+----+--------+
| id | email  |
+----+--------+
| 1  | a@x.dk |
| 2  |        |
| 3  | c@x.dk |
+----+--------+
(3 rows, 2 columns)
```

Warnings are for stderr only. A `2>/dev/null` around a run, or a `--out` file,
never changes the file that is written.

#### Field names JavaScript already has

`toString`, `constructor`, `valueOf`, `hasOwnProperty`, `__proto__` and the rest
of `Object.prototype` are names every object answers to. A record from a JSON,
CSV, YAML or XML file only has the fields the file gave it, so a step asked for
one of those names is asked for a field **no record has** — the same case as the
section above, and it is judged the same way:

```bash
printf '[{"id":1,"name":"Ada"},{"id":2,"name":"Bo"},{"id":3,"name":"Cy"}]' \
  | transmute --pipe '[{"op":"group","by":"toString"}]' --output table
```

```
Warning: group: no record has a field named "toString"; every row landed in the group "(null)"
+--------+-------+-------------------------------------------------------------------+
| key    | count | items                                                             |
+--------+-------+-------------------------------------------------------------------+
| (null) | 3     | [{"id":1,"name":"Ada"},{"id":2,"name":"Bo"},{"id":3,"name":"Cy"}] |
+--------+-------+-------------------------------------------------------------------+
(1 rows, 3 columns)
```

That table used to print `function Object() { [native code] }` as the group key
— a JavaScript function read out of the runtime and written into your data — and
the JSON output dropped the `key` field entirely, while the warning said the rows
were in `(null)`. `sort` and `unique` compared rows on the same inherited
function, and a `join` on that name matched every row to one arbitrary record on
the other side.

A field by one of those names that the file **does** have is an ordinary field.
`{"toString":"x"}` in a JSON file, a `toString` column in a CSV, a `__proto__`
key in YAML: they are read, written, joined and prefixed like any other name.

### When a row is not a record

A field name no record has is a warning, because the next file may have it. A
row that is not a record is the other thing entirely: a step that names a field
has no field to read, so every answer it could give is invented or lost data.

After a `map` that leaves strings, `omit` and `rename` built columns `0 1 2 3`
holding `A l i c e` — characters the file never contained; `add` spread a
number into `{}` and lost the number; `group` filed every row under `(null)`;
`unique` compared `undefined` with `undefined`, decided two different names were
identical and deleted one; `join` dropped every row and wrote an empty file. All
of it exit 0, empty stderr, and output that looked like the transformation that
was asked for.

`pick`, `omit`, `rename`, `add`, `sort`, `group`, `unique --by`, `flatten` and
`join` now stop at the first row they cannot read, and say which step it was,
which row it was, and what the row was. Exit 1, nothing on stdout, no file
written — the data is wrong, so there is nothing to write:

```bash
transmute test/fixtures/people.csv \
  --pipe '[{"op":"map","expr":"item.name"},{"op":"pick","fields":["name"]}]' --output csv
```

```
Error: Pipeline step 2 (pick) names a field, but row 1 is a string ("Alice"), not a record. It has no fields to read — use map to turn each row into a record first.
```

This is a transformation error, not a usage error, so it is exit 1 and not exit
2: the pipeline is a good pipeline for a file of records, and it is these rows
that are not. `count`, `head`, `tail`, `filter`, `map` and a `unique` without
`by` need no field and keep working on rows that are not records — a `map` that
reshapes records into values is how such rows are made in the first place, and
the step that made them must be allowed to see them.

The same rows meet the *writers*, and there the answer is the other one: a step
that names a field has nothing to read, while a writer has to write every row it
is given, so `csv`, `table` and `sql` write the row and **warn** that the value
is not in the file — see
[A row that is not a record](#a-row-that-is-not-a-record-csv-table-and-sql).
Exit 0 there, exit 1 here, and the difference is what the step is asked to do
with the row.

The browser playground runs the same engine and shows the same message in its
error box.

### filter

Keep the records where a JavaScript expression is true. `item` is the record,
`i` is its index.

An expression that is not valid JavaScript is a usage error (exit 2) and prints
the parser's own message. It used to be treated as "no filter", so `item.age >`
returned every row with exit 0 and an empty stderr — the one answer that looks
exactly like a filter that worked. An expression that *compiles* but throws on a
record, such as `item.nope.deep`, is a transformation error (exit 1).

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

Add computed fields without rewriting the record. An expression that throws on a
record yields `null` for that field rather than stopping the run, because one
odd record should not cost you the export. An expression that is not valid
JavaScript is different: it is broken in every record, so it fails as a usage
error (exit 2) instead of quietly filling the column with `null`. Accepts either
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
Warning: table: 1 of 6 columns is not in every row: "tier" (1 of 3). Those cells are shown empty, and nothing on the screen says which of the two it was. sql writes NULL instead; json, yaml and xml keep the difference.
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

A join key that only **one** side has cannot match anything at all, and which
side it is missing from is the whole difference between two different typos in a
pipeline, so stderr names the side:

```bash
printf '[{"id":"1","name":"Ada"},{"id":"2","name":"Bo"}]' \
  | transmute --pipe '[{"op":"join","on":"city","with":[{"id":"1","city":"Aarhus"}]}]' --output json
```

```
Warning: join: no record on the left has a field named "city"; it is on the right, so no row could match
[]
```

The rows that cannot be matched are dropped, or kept unchanged with `keep: left`
or `keep: all`, and the warning says which of the two happened. A key *neither*
side has says so too, in the same words it always used: every row was dropped.

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

#### One root element, and nothing after it

Batch tools append their output, so a file can arrive holding two documents
back to back. An XML document has exactly one root element, and Transmute reads
one — so the second document is not quietly dropped, which is what happened
before this rule: the first document was read, the rest of the file was never
looked at, and the run exited 0 with a result that was half the file.

```bash
printf '<rows><row><a>1</a></row></rows>\n<more><row><b>2</b></row></more>\n' | transmute --format xml --output json
```

```
Error: Could not parse input as xml: an XML document has one root element, but this file has more after </rows>: "<more><row><b>2</b></row></more>". Concatenated XML is not one document — split it first, or read the documents one at a time.
```

Exit **3** — the input is not one document, and Transmute will not choose which
document you meant. Split the file, or read the parts one at a time. A prologue,
a `DOCTYPE` and comments are not extra documents and are read as usual.

Both documents having the **same** root name is the form a batch tool writes,
and it is the same rule: the root element ends where its own nesting ends, so
the second document is the one after it.

```bash
printf '<rows><row><a>1</a></row></rows>\n<rows><row><b>2</b></row></rows>\n' | transmute --format xml --output json
```

```
Error: Could not parse input as xml: an XML document has one root element, but this file has more after </rows>: "<rows><row><b>2</b></row></rows>". Concatenated XML is not one document — split it first, or read the documents one at a time.
```

A root element that closes itself — `<rows/>` — is closed, and is read as the
document it is: no rows. It used to be refused as a root that was never closed,
which was the one thing this reader said about XML that was simply untrue.

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
plus a count. Each column is as wide as the 20 rows it actually prints, counted
in screen columns, so a name in Japanese or an emoji does not push the
right-hand border out of line.

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
