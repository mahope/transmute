"""Do the JSON reader and the YAML flow reader hand the file's column order on?

T110 measured that only one of the four readers ever gave the file's order on:
`csv` did, and `json`, `xml` and YAML's flow form gave `null`, so a quoted
`"2026"` in a JSON file led every one of the six writers. It wrote the two
remaining readers down as the next task and measured `xml` out of the class,
because an element name may not start with a digit.

That leaves exactly two readers, and the two are not the same problem:

  * YAML's **flow form** `{id: 1, "2026": 2}` is a document the flow mapping
    builds. `parseYAMLMapping` got the order on in T110 from the `seen` map it
    already kept; `parseYAMLFlow`'s `mapping` keeps a `seen` map too, and never
    asked. So this is the same question, already asked once.
  * **JSON** is the harder one, and T108 measured why: `JSON.parse` hands back
    *JavaScript's* order, not the text's, and a reviver does not change that —
    the order is in the bytes, so the only way in is to read the text. The
    reader already reads the text as text, for duplicate keys.

So this asks, with the same three questions held apart:

  READER   which readers hand an order on at all?
  SCOPE    which shapes of the two forms lose it — nested, in a sequence, in a
           list, empty, a merged field, a duplicate key?
  LOSS     does handing the order on cost a value, or refuse a file the reader
           could read? A hint holds names, not values, so the only ways to lose
           something are to drop a field or to fail a valid file.
  CONTROLS the six steps T109 fixed, through both new readers, so a table that
           cannot say which of the two moved cannot be used to say the readers
           did.
"""

import collections, json, os, subprocess, sys

try:
    import yaml as pyyaml
except ImportError:  # PyYAML 6.0.3 is the judge in the system python3, not the site venv
    sys.exit("needs PyYAML: python3 tools/measure_t111.py")

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
        return {"error": "no json", "raw": proc.stdout[:200]}


PIPE = (
    "const e=require(process.argv[1]);"
    "const r=e.run(process.argv[2],process.argv[3],JSON.parse(process.argv[4]),process.argv[5]);"
    "const out=r.error?{error:r.error}:{text:r.text,warnings:r.warnings||[],"
    "rows:JSON.parse(JSON.stringify(r.data||[]))};"
    "console.log(JSON.stringify(out));"
)


def run_file(text, fmt, steps, out="sql"):
    return node(PIPE, args=(text, fmt, json.dumps(steps), out))


def columns_of_sql(text):
    """The column list out of the INSERT line — what the file says, not a guess."""
    if not text or "INSERT INTO" not in text:
        return None
    head = text.split("INSERT INTO", 1)[1].split("VALUES", 1)[0]
    return [c.strip().strip('"') for c in head.split("(", 1)[1].rstrip(") ").split(",")]


def json_field_order(text, fmt="json"):
    """The keys of the first record in the file, as the text wrote them.

    Python keeps insertion order in both `json` and `yaml.safe_load`, and both
    walk the text as written, so this is the *text's* order and nothing else —
    the same question asked in a language that does not rearrange the names. It
    is the only honest expectation for this table: comparing against
    `Object.keys` would call `["2026","id","name"]` correct, which is the very
    thing under test.
    """
    try:
        if fmt == "yaml":
            shape = pyyaml.safe_load(text)
        else:
            shape = json.loads(text)
    except Exception:
        return None
    while isinstance(shape, list):
        if not shape:
            return None
        shape = shape[0]
    return list(shape.keys()) if isinstance(shape, dict) else None


# A column that looks like a whole number, so JavaScript's own order (`2026`
# first) and the file's order (`id` first) disagree. Without one every row here
# reads "fine".
FILE_ORDER = ["id", "2026", "name"]

# ── READER ──────────────────────────────────────────────────────────────────
# The reader question as its own table: which of the four hands an order on at
# all. The order a reader hands on must be the text's, which is why the column
# next to it is what the text says — a table that only compared against
# `Object.keys` would call `["2026","id","name"]` correct.
READERS = [
    ("csv", "csv", "id,2026,name\n1,2,x\n", FILE_ORDER),
    ("yaml, block", "yaml", 'id: 1\n"2026": 2\nname: x\n', FILE_ORDER),
    ("yaml, flow", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n', FILE_ORDER),
    ("yaml, flow in a block", "yaml", 'a: {id: 1, "2026": 2, "name": "x"}\n', None),
    ("json", "json", '{"id":1,"2026":2,"name":"x"}\n', FILE_ORDER),
    ("json, a list of two", "json", '[{"id":1,"2026":2},{"id":3,"2026":4}]\n', ["id", "2026"]),
    ("xml (not the class)", "xml", "<r><id>1</id><name>x</name></r>", None),
]


def reader_table():
    rows = []
    for label, fmt, text, want in READERS:
        r = node(
            "const e=require(process.argv[1]);"
            "const O=Symbol.for('transmute.fieldOrder');"
            "const recs=e.parsers[process.argv[2]](process.argv[3]);"
            "const r=recs[0];"
            "console.log(JSON.stringify({keys:Object.keys(r),"
            "order:Array.isArray(r[O])?r[O]:null}));",
            args=(fmt, text),
        )
        if "error" in r:
            rows.append((label, f"REFUSES {r['error']}", "-", "-", "-"))
            continue
        order = r.get("order")
        # An order that names something the record does not have would be a
        # wrong answer that still looks like an answer, so it is called out.
        sane = order is None or all(k in r.get("keys", []) for k in order)
        rows.append((
            label,
            r.get("keys"),
            order,
            "GIVES NOTHING" if not order else ("HANDS ON" if sane else "HANDS A NAME IT HAS NOT"),
            "the text: " + str(want) if want else "n/a — nested / not the class",
        ))
    return rows


# ── SCOPE ───────────────────────────────────────────────────────────────────
# Which shape loses it. The input is written so the file's order and
# JavaScript's order disagree in every row, and the expectation comes from the
# text (YAML and JSON parsed by Python) and not from what the engine answers.
SCOPE = [
    ("yaml flow, a whole document", "yaml",
     '{"id": 1, "2026": 2, "name": "x"}\n', []),
    ("yaml flow, in a block", "yaml",
     'a: {id: 1, "2026": 2, "name": "x"}\n', []),
    ("yaml flow, in a list", "yaml",
     '- {id: 1, "2026": 2}\n- {id: 3, "2026": 4}\n', []),
    ("yaml flow, in a flow list", "yaml",
     'root: [{id: 1, "2026": 2}]\n', []),
    ("yaml flow, two levels down", "yaml",
     'a: {b: {id: 1, "2026": 2}}\n', []),
    ("yaml flow, an explicit key", "yaml",
     '{? id : 1, "2026": 2}\n', []),
    ("yaml flow, a repeat of a name", "yaml",
     '{"id": 1, "2026": 2, "id": 3}\n', []),
    ("yaml flow, a merge key", "yaml",
     'b: &b {"2026": 9, "z": 0}\na: {<<: *b, id: 1}\n', []),
    ("yaml flow, a key in single quotes", "yaml",
     "{'id': 1, \"2026\": 2}\n", []),
    ("yaml flow, no fields", "yaml", '{}\n', []),
    ("json, a whole document", "json",
     '{"id":1,"2026":2,"name":"x"}\n', []),
    ("json, a list of records", "json",
     '[{"id":1,"2026":2},{"id":3,"2026":4}]\n', []),
    # Two documents are not one document: `JSON.parse` refuses, and the reader
    # must keep refusing. It is here so the table can tell that refusal from the
    # order being wrong — the LOSS table asks it again on purpose.
    ("json, two documents (must refuse)", "json",
     '{"id":1,"2026":2}\n{"id":3,"2026":4}\n', []),
    ("json, nested", "json",
     '{"id":1,"2026":2,"sub":{"2026":9,"q":8}}\n', []),
    ("json, in a list", "json",
     '[{"2026":1,"id":2}]\n', []),
    ("json, a key in an escape", "json",
     '{"a\\u0031": 1, "2026": 2}\n', []),
    ("json, a name inside a string", "json",
     '{"note": "2026: not a key", "2026": 2, "id": 1}\n', []),
    ("json, a repeat of a name", "json",
     '{"id":1,"2026":2,"id":3}\n', []),
    ("json, a null in the list", "json",
     '[null,{"id":1,"2026":2}]\n', []),
    ("json, no fields", "json", '{}\n', []),
    ("json, a number at the top", "json", '1\n', []),
    ("json, a string at the top", "json", '"x"\n', []),
]


def top_keys_of(text, fmt="json"):
    """The keys of the first record in the file, as the text wrote them.

    A thin name for the one question this table holds against the engine, kept
    separate so no row can answer it with the engine's own answer.
    """
    return json_field_order(text, fmt)


def probe(text, fmt, steps=(), out="sql"):
    """Ask the whole path in one process: what the reader hinted, and what the
    writer wrote.

    In one process because the order lives on a symbol — a hint cannot cross
    `run`'s JSON output, so a table that read the rows back as JSON would be
    reading JavaScript's order every time and calling it right.
    """
    return node(
        "const e=require(process.argv[1]);"
        "const O=Symbol.for('transmute.fieldOrder');"
        "const out=(r)=>(r&&Array.isArray(r[O]))?r[O]:null;"
        "const text=process.argv[2],fmt=process.argv[3],steps=JSON.parse(process.argv[4]),"
        "of=process.argv[5];"
        "let rows;"
        "try{rows=e.parsers[fmt](text);}catch(err){"
        "console.log(JSON.stringify({refuses:String(err.message||err)}));process.exit(0);}"
        "const hint=rows.map(out);"
        "let r;"
        "try{r=e.run(text,fmt,steps,of);}catch(err){"
        "console.log(JSON.stringify({reader:rows.map(r0=>r0&&typeof r0==='object'?Object.keys(r0):r0),"
        "hint,run_error:String(err.message||err)}));process.exit(0);}"
        "console.log(JSON.stringify({reader:rows.map(r0=>r0&&typeof r0==='object'?Object.keys(r0):r0),"
        "hint,error:r.error||null,text:r.text||'',"
        "rows:JSON.parse(JSON.stringify(r.data||[])),"
        "hint_after:(r.data||[]).map(out),warnings:r.warnings||[]}));",
        args=(text, fmt, json.dumps(list(steps)), out),
    )


def scope_table():
    rows = []
    for label, fmt, text, steps in SCOPE:
        r = probe(text, fmt, steps)
        if "refuses" in r:
            rows.append({"case": label, "verdict": "REFUSES", "error": r["refuses"]})
            continue
        want = top_keys_of(text, fmt)
        got = columns_of_sql(r.get("text") or "")
        # Three questions, kept apart: did the reader hint, did the writer use
        # it, and did anything go missing on the way.
        reader_ok = (not want) or (r.get("hint") or [None])[0] == want
        writer_ok = (not want) or got == want
        lost = None
        if want and r.get("reader") and isinstance(r["reader"][0], list):
            lost = set(want) - set(r["reader"][0])
        rows.append({
            "case": label,
            "want": want,
            "hint": r.get("hint"),
            "got": got,
            "reader_ok": reader_ok,
            "writer_ok": writer_ok,
            "lost": lost,
            "warnings": r.get("warnings"),
            "error": r.get("error") or r.get("run_error"),
        })
    return rows



# ── CONTROLS ────────────────────────────────────────────────────────────────
# The six steps T109 fixed, through both readers, so a table that cannot say
# which of the two moved the order cannot be used to say the readers did.
CONTROLS = [
    ("pick", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "pick", "fields": ["id", "2026", "name"]}], ["id", "2026", "name"]),
    ("add", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "add", "fields": {"extra": "1"}}], ["id", "2026", "name", "extra"]),
    ("omit", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "omit", "fields": ["name"]}], ["id", "2026"]),
    ("rename", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "rename", "mapping": {"2026": "year"}}], ["id", "year", "name"]),
    ("filter", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "filter", "expr": "item.id == 1"}], ["id", "2026", "name"]),
    ("group", "yaml", '{"id": 1, "2026": 2, "name": "x"}\n',
     [{"op": "group", "by": "id"}], ["key", "count", "items"]),
    ("pick, json", "json", '{"id":1,"2026":2,"name":"x"}\n',
     [{"op": "pick", "fields": ["name", "id"]}], ["name", "id"]),
    ("rename, json", "json", '{"id":1,"2026":2,"name":"x"}\n',
     [{"op": "rename", "mapping": {"2026": "year"}}], ["id", "year", "name"]),
    ("add, json", "json", '{"id":1,"2026":2,"name":"x"}\n',
     [{"op": "add", "fields": {"extra": "1"}}], ["id", "2026", "name", "extra"]),
    ("omit, json", "json", '{"id":1,"2026":2,"name":"x"}\n',
     [{"op": "omit", "fields": ["name"]}], ["id", "2026"]),
    ("flatten, json", "json", '{"id":1,"2026":2,"tags":[{"2026":9,"q":8}]}\n',
     [{"op": "flatten", "field": "tags"}], ["id", "2026", "tags", "2026", "q"]),
]


def control_table():
    rows = []
    for label, fmt, text, steps, want in CONTROLS:
        r = run_file(text, fmt, steps)
        if "error" in r:
            rows.append({"step": label, "verdict": "REFUSES", "error": r["error"]})
            continue
        got = columns_of_sql(r["text"])
        rows.append({"step": label, "want": want, "got": got, "ok": got == want})
    return rows


# ── LOSS ────────────────────────────────────────────────────────────────────
# Can handing the order on cost a value? Three ways it could: drop a field the
# record has, refuse a file the reader could read, or put a name in the hint
# that is not on the record. A hint holds names and not values, so the first is
# the only one a real bug would come through — and the last is checked here too,
# because a stale name in a hint is a name a later `ownNames` would drop.
LOSS = [
    ("json, a key named __proto__", '{"__proto__": 1, "2026": 2, "id": 3}\n', "json"),
    ("json, a key named constructor", '{"constructor": 1, "2026": 2}\n', "json"),
    ("json, a key named toString", '{"toString": 1, "2026": 2}\n', "json"),
    ("json, a key that is empty", '{"": 1, "2026": 2}\n', "json"),
    ("json, an escaped name", '{"a\\u0031": 1, "2026": 2}\n', "json"),
    ("json, a name with a quote", '{"a\\"b": 1, "2026": 2}\n', "json"),
    ("json, a name with a backslash", '{"a\\\\b": 1, "2026": 2}\n', "json"),
    ("json, a unicode name", '{"\\u00e5r": 1, "2026": 2}\n', "json"),
    ("json, a byte order mark", '﻿{"id":1,"2026":2}\n', "json"),
    ("json, two documents", '{"id":1,"2026":2}\n{"id":3,"2026":4}\n', "json"),
    ("yaml flow, a key named __proto__", '{"__proto__": 1, "2026": 2}\n', "yaml"),
    ("yaml flow, a name with a colon", '{"a:b": 1, "2026": 2}\n', "yaml"),
    ("yaml flow, a name in single quotes", "{'a,b': 1, \"2026\": 2}\n", "yaml"),
    ("yaml flow, a trailing comma", '{"id": 1, "2026": 2, }\n', "yaml"),
    ("yaml flow, unclosed", '{"id": 1, "2026": 2\n', "yaml"),
    ("yaml flow, a name with a brace", '{"a}b": 1, "2026": 2}\n', "yaml"),
]


def loss_table():
    rows = []
    for label, text, fmt in LOSS:
        r = node(
            "const e=require(process.argv[1]);"
            "const O=Symbol.for('transmute.fieldOrder');"
            "let recs;"
            "try{recs=e.parsers[process.argv[2]](process.argv[3]);}"
            "catch(err){console.log(JSON.stringify({refuses:String(err.message||err)}));"
            "process.exit(0);}"
            "console.log(JSON.stringify({rows:recs.map(r=>r&&typeof r==='object'?{"
            "keys:Object.keys(r),order:Array.isArray(r[O])?r[O]:null,"
            "values:Object.fromEntries(Object.keys(r).map(k=>[k,r[k]]))}:r)}));",
            args=(fmt, text),
        )
        if "refuses" in r:
            rows.append({"case": label, "read": "REFUSES", "why": r["refuses"]})
            continue
        first = r["rows"][0] if r["rows"] else None
        if not isinstance(first, dict):
            rows.append({"case": label, "read": "read", "keys": first, "order": None})
            continue
        order = first.get("order")
        rows.append({
            "case": label,
            "read": "read",
            "keys": first["keys"],
            "order": order,
            "no_value_lost": set(first["values"]) == set(first["keys"]),
            "order_sane": order is None or all(k in first["keys"] for k in order),
        })
    return rows


def main():
    print("=" * 78)
    print("READER — which reader hands the file's order on at all?")
    print("=" * 78)
    for row in reader_table():
        print(f"  {row[0]:<28} keys={row[1]!s:<34} order={row[2]!s:<24} {row[3]}")

    print()
    print("=" * 78)
    print("SCOPE — which shape of the two forms loses it?")
    print("=" * 78)
    for row in scope_table():
        if row.get("verdict") == "REFUSES":
            print(f"  {row['case']:<36} REFUSES {row['error']}")
            continue
        print(f"  {row['case']:<36} want={row['want']!s:<36} hint={row['hint']!s:<36} "
              f"cols={row['got']!s:<36} reader={row['reader_ok']} writer={row['writer_ok']}"
              + (f"  LOST {row['lost']}" if row["lost"] else "")
              + (f"  {row['error']}" if row.get("error") else "")
              + (f"  warnings={row['warnings']}" if row.get("warnings") else ""))

    print()
    print("=" * 78)
    print("CONTROLS — the six steps T109 fixed, through both readers")
    print("=" * 78)
    for row in control_table():
        if row.get("verdict") == "REFUSES":
            print(f"  {row['step']:<16} REFUSES {row['error']}")
            continue
        print(f"  {row['step']:<16} want={row['want']!s:<44} got={row['got']!s:<44} ok={row['ok']}")

    print()
    print("=" * 78)
    print("LOSS — can handing the order on cost a value, or refuse a file?")
    print("=" * 78)
    for row in loss_table():
        if row.get("read") == "REFUSES":
            print(f"  {row['case']:<36} REFUSES: {row['why']}")
            continue
        print(f"  {row['case']:<36} keys={row.get('keys')!s:<40} order={row.get('order')!s:<26} "
              f"no_value_lost={row.get('no_value_lost')} sane={row.get('order_sane')}")

    counts = collections.Counter()
    for row in scope_table():
        if row.get("verdict") == "REFUSES":
            counts["refuses"] += 1
        elif row["reader_ok"] and row["writer_ok"]:
            counts["ok"] += 1
        else:
            counts["broken"] += 1
    print()
    print(f"SCOPE: {counts['ok']} of {len(SCOPE)} hand the text's order on and keep it, "
          f"{counts['broken']} do not, {counts['refuses']} refused.")


if __name__ == "__main__":
    main()
