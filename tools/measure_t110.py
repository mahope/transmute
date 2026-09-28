"""Does `flatten` write a row's fields in the order the file had?

T108 gave the file's order a home and T109 taught the five steps that build a
record to carry it. `flatten` builds a record too — `{...item, [field]: …, ...sub}`
— and T109's own note says it was fixed with the same rule. It is not in the
code, and the fix is missing in all three branches of the step.

So this asks the question in the shape that made T108's table trustworthy: one
column that looks like a whole number, so JavaScript's own order and the file's
order disagree. Without it every row here reads "fine".

  ORDER  where do the fields of an expanded row stand, and did the step write
         them there?
  LOSS   does carrying an order into the new row cost a value? A hint holds
         names, not values, so the question is whether the carrying can throw a
         field away.
  SCOPE  which branch of `flatten` loses it — a list of records, a list of
         scalars, a field that is not a list — and through which reader, since a
         CSV cell cannot hold a list at all.

Three questions held apart, and each table gets its own verdict, because a table
that measures order and loss in one column calls every file broken or none.
"""

import collections, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Absolute, because `node -e` resolves a relative `require` against the working
# directory and not against this file — a table that reads `MODULE_NOT_FOUND`
# for every row is the harness's own bug and not a finding.
ENGINE = os.path.abspath(os.path.join(ROOT, "src", "engine.js"))


def node(code, args=()):
    proc = subprocess.run(["node", "-e", code, ENGINE, *args],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().split("\n")[-1]}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"error": "no json", "raw": proc.stdout}


# The real path: the readers, the operations and the writers, through `run`.
# No top-level `return`: `node -e` compiles this as a script, not a function.
PIPE = (
    "const e=require(process.argv[1]);"
    "const r=e.run(process.argv[2],process.argv[3],JSON.parse(process.argv[4]),'sql');"
    "const out=r.error?{error:r.error}:{text:r.text,warnings:r.warnings||[],"
    "rows:JSON.parse(JSON.stringify(r.data||[]))};"
    "console.log(JSON.stringify(out));"
)


def run_file(text, fmt, steps):
    return node(PIPE, args=(text, fmt, json.dumps(steps)))


def columns_of_sql(text):
    """The column list out of the INSERT line — what the file says, not a guess."""
    if not text or "INSERT INTO" not in text:
        return None
    head = text.split("INSERT INTO", 1)[1].split("VALUES", 1)[0]
    return [c.strip().strip('"') for c in head.split("(", 1)[1].rstrip(") ").split(",")]


# A column that looks like a whole number, so JavaScript's order (`2026` first)
# and the file's order (`id` first) disagree. Python's `json` keeps the order the
# text has, so it can say which of the two the file wrote.
FILE_ORDER = ["id", "2026", "name"]

CASES = [
    ("json, a list of records", "json",
     '{"id":1,"2026":2,"name":"x","tags":[{"t":"a","u":"b"}]}\n',
     [{"op": "flatten", "field": "tags"}],
     FILE_ORDER + ["tags", "t", "u"]),
    ("yaml, a list of records", "yaml",
     'id: 1\n"2026": 2\nname: x\ntags:\n  - t: a\n    u: b\n',
     [{"op": "flatten", "field": "tags"}],
     FILE_ORDER + ["tags", "t", "u"]),
    ("yaml, a list of scalars", "yaml",
     'id: 1\n"2026": 2\nname: x\ntags:\n  - a\n  - b\n',
     [{"op": "flatten", "field": "tags"}],
     FILE_ORDER + ["tags"]),
    ("yaml, a record that repeats a name", "yaml",
     'id: 1\n"2026": 2\nname: x\ntags:\n  - name: z\n    u: b\n',
     [{"op": "flatten", "field": "tags"}],
     FILE_ORDER + ["tags", "u"]),
    # A CSV cell cannot hold a list, so the one CSV path that reaches the branch
    # is `group`, which builds the list itself out of whole records.
    ("csv, group then flatten", "csv",
     "id,2026,name\n1,2,x\n1,3,y\n",
     [{"op": "group", "by": "id"}, {"op": "flatten", "field": "items"}],
     ["key", "count", "items"] + FILE_ORDER),
    ("xml, a list of records", "xml",
     '<r><id>1</id><name>x</name><tags><t>a</t><u>b</u></tags></r>',
     [{"op": "flatten", "field": "tags"}],
     ["id", "name", "tags", "t", "u"]),
]

# The three branches of the step, and the two that are not a list at all, so the
# table can tell "flatten lost the order" from "flatten changed nothing". The
# input is YAML, because that is the reader that hands the order on — a table
# written in JSON would measure the JSON reader on every row and say nothing
# about the step.
SCOPE = [
    ("a list of records", 'id: 1\n"2026": 2\ntags:\n  - t: a\n', ["id", "2026", "tags", "t"]),
    ("a list of scalars", 'id: 1\n"2026": 2\ntags:\n  - a\n  - b\n', ["id", "2026", "tags"]),
    ("a list of nulls", 'id: 1\n"2026": 2\ntags:\n  - null\n  - b\n', ["id", "2026", "tags"]),
    ("a field that is not a list", 'id: 1\n"2026": 2\ntags: a\n', ["id", "2026", "tags"]),
    ("a field the file does not have", 'id: 1\n"2026": 2\n', ["id", "2026"]),
    ("a list of lists", 'id: 1\n"2026": 2\ntags:\n  - [a, b]\n', ["id", "2026", "tags"]),
]

# The steps T109 already fixed, as controls: a table that cannot say which step
# moved the order cannot be used to say that `flatten` did.
YAML_PLAIN = 'id: 1\n"2026": 2\nname: x\n'
CONTROLS = [
    ("pick", YAML_PLAIN, [{"op": "pick", "fields": ["id", "2026", "name"]}], ["id", "2026", "name"]),
    ("add", YAML_PLAIN, [{"op": "add", "fields": {"extra": "1"}}], ["id", "2026", "name", "extra"]),
    ("omit", YAML_PLAIN, [{"op": "omit", "fields": ["name"]}], ["id", "2026"]),
    ("rename", YAML_PLAIN, [{"op": "rename", "mapping": {"2026": "year"}}], ["id", "year", "name"]),
    ("filter", YAML_PLAIN, [{"op": "filter", "expr": "item.id == 1"}], ["id", "2026", "name"]),
    ("group", YAML_PLAIN, [{"op": "group", "by": "id"}], ["key", "count", "items"]),
]

# The reader question, kept as its own table: which of the four readers hands the
# order on at all. JSON cannot show the class through XML's rule (an element name
# may not start with a digit), and both are written out so the table can be wrong
# about the engine and not about the file.
READERS = [
    ("csv", "id,2026,name\n1,2,x\n"),
    ("yaml", YAML_PLAIN),
    ("yaml flow", '{"id": 1, "2026": 2, "name": "x"}\n'),
    ("json", '{"id":1,"2026":2,"name":"x"}\n'),
    ("xml", "<r><id>1</id><name>x</name></r>"),
]


def reader_table():
    rows = []
    for label, text in READERS:
        r = node(
            "const e=require(process.argv[1]);"
            "const O=Symbol.for('transmute.fieldOrder');"
            "const fmt=process.argv[2];"
            "const recs=fmt==='csv'?e.parsers.csv(process.argv[3])"
            ":e.parsers[fmt](process.argv[3]);"
            "const r=recs[0];"
            "console.log(JSON.stringify({keys:Object.keys(r),"
            "order:Array.isArray(r[O])?r[O]:null}));",
            args=(label.split()[0], text),
        )
        if "error" in r:
            rows.append((label, f"REFUSES {r['error']}", "-", "-"))
            continue
        rows.append((label, r.get("keys"), r.get("order"),
                     "HANDS ON" if r.get("order") else "GIVES NOTHING"))
    return rows


def order_table():
    rows = []
    for label, fmt, text, steps, want in CASES:
        r = run_file(text, fmt, steps)
        if "error" in r:
            rows.append({"case": label, "verdict": "REFUSES", "error": r["error"]})
            continue
        cols = columns_of_sql(r["text"])
        rows.append({
            "case": label,
            "want": want,
            "got": cols,
            "order_ok": cols == want,
            "rows": len(r["rows"]),
            "warnings": len(r["warnings"]),
        })
    return rows


def scope_table():
    rows = []
    for label, text, want in SCOPE:
        r = run_file(text, "yaml", [{"op": "flatten", "field": "tags"}])
        if "error" in r:
            rows.append((label, f"REFUSES {r['error']}", "REFUSES"))
            continue
        cols = columns_of_sql(r["text"])
        rows.append((label, cols, "OK" if cols == want else "ORDER LOST"))
    for label, text, steps, want in CONTROLS:
        r = run_file(text, "yaml", steps)
        if "error" in r:
            rows.append((label + " (control)", f"REFUSES {r['error']}", "REFUSES"))
            continue
        cols = columns_of_sql(r["text"])
        rows.append((label + " (control)", cols, "OK" if cols == want else "ORDER LOST"))
    return rows


# The loss question, asked of the carrying itself: does a row keep its values and
# its fields when a hint is attached to it, and can attaching one throw? Values
# are compared as written, the fields as a set, so a swap is not a loss.
LOSS_PROBE = (
    "const e=require(process.argv[1]);"
    "const ORDER=Symbol.for('transmute.fieldOrder');"
    "const data=e.parsers.json('{\"id\":1,\"2026\":2,\"name\":\"x\","
    "\"tags\":[{\"t\":\"a\",\"u\":\"b\"},{\"t\":\"c\"}]}');"
    "const rows=e.operations.flatten(data,{field:'tags'});"
    "const plain=(o)=>JSON.parse(JSON.stringify(o));"
    "let thrown=null;let out;try{out=rows.map(plain);}catch(err){thrown=String(err);}"
    "console.log(JSON.stringify({rows:out,thrown,"
    "hints:rows.map(r=>Array.isArray(r[ORDER])?r[ORDER]:null),"
    "keys:rows.map(r=>Object.keys(r)),"
    "warnings:e.warningsFor?undefined:undefined}));"
)


def loss_table():
    return node(LOSS_PROBE)


def print_table(title, header, rows):
    print(f"\n== {title}")
    print(" | ".join(header))
    print(" | ".join("-" * len(h) for h in header))
    for row in rows:
        print(" | ".join(str(c) for c in row))


if __name__ == "__main__":
    print("T110 — does `flatten` write a row's fields in the order the file had?")

    table = order_table()
    print_table(
        "ORDER — the columns an expanded row is written in",
        ["case", "want", "got", "ok", "rows", "warnings"],
        [(t["case"], t.get("want"), t.get("got"), t.get("order_ok"),
          t.get("rows"), t.get("warnings")) if "error" not in t
         else (t["case"], "REFUSES", t["error"], "-", "-", "-") for t in table],
    )
    print(f"\nORDER: {sum(1 for t in table if t.get('order_ok'))} af "
          f"{len(table)} i filens rækkefølge")

    print_table("READER — hvilken læser afleverer filens rækkefølge overhovedet",
                ["reader", "keys", "order", "verdict"], reader_table())

    print_table("SCOPE — hvilken gren af `flatten` mister den, og hvilke kontroltrin er sunde",
                ["case", "columns", "verdict"], scope_table())
    print(f"\nSCOPE: {collections.Counter(v for _, _, v in scope_table() if v)}")

    loss = loss_table()
    print_table(
        "LOSS — bærer en ordrebog med sig en værdi med",
        ["rows", "thrown", "hints", "keys"],
        [(json.dumps(loss.get("rows")), loss.get("thrown"),
          json.dumps(loss.get("hints")), json.dumps(loss.get("keys")))],
    )
