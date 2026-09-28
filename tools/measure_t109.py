"""What does a step that *builds* a record do to the file's own order?

T108 measured the order and gave it a home: a non-enumerable symbol beside the
record, read by `unionKeys` and by a `Proxy` for the JSON writer. The price of
that home was measured too, and it was written down as a number — the order
survives 6 of the 11 operations and dies in the 5 that build a record field by
field (`add`, `pick`, `rename`, `omit`, `group`).

So this is the other half of T108's price, and it has a boundary nobody has
asked about yet:

  LOSS   does carrying the order into the new record cost a value? (A hint
         holds names, not values, so the question is whether the carrying
         itself can throw a record away.)
  ORDER  where does a *new* field land — at the end, where the engine has
         always put it, or where the user named it? And does a renamed field
         keep the place of the field it replaced?
  SCOPE  which operations really lose it, and is one rule enough for the five?

Three questions held apart, because the tables that measure loss and order in
one column call every file broken or none.
"""

import json, subprocess, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Absolute, because `node -e` resolves a relative `require` against the working
# directory and not against this file — a table that reads `MODULE_NOT_FOUND`
# for every row is the harness's own bug and not a finding.
ENGINE = os.path.abspath(os.path.join(ROOT, "src", "engine.js"))

# A column that looks like a whole number, so JavaScript's own order and the
# file's order disagree — without that, every table here says "fine".
CSV = "id,2026,name\n1,2,x\n"


def node(code, args=()):
    proc = subprocess.run(["node", "-e", code, ENGINE, *args],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().split("\n")[-1]}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"error": "no json", "raw": proc.stdout}


# The step, on a file whose own order disagrees with JavaScript's, through every
# writer. `run` is the real path: the readers, the operations and the writers.
# No top-level `return`: `node -e` compiles this as a script, not a function.
PIPE = (
    "const e=require(process.argv[1]);"
    "const r=e.run(process.argv[2],'csv',JSON.parse(process.argv[3]),process.argv[4]);"
    "const out=r.error?{error:r.error}:"
    "{text:r.text,warnings:r.warnings||[],rows:JSON.parse(JSON.stringify(r.data||[]))};"
    "console.log(JSON.stringify(out));"
)


def run_step(step, out="sql", csv=CSV):
    return node(PIPE, args=(csv, json.dumps([step]), out))


# Every operation, the five that build a record among them.
STEPS = [
    {"op": "pick", "fields": ["id", "2026", "name"]},
    {"op": "map", "expr": "item"},
    {"op": "filter", "expr": "item.id == 1"},
    {"op": "sort", "by": "id"},
    {"op": "unique", "by": "id"},
    {"op": "rename", "mapping": {"2026": "year"}},
    {"op": "add", "fields": {"extra": "1"}},
    {"op": "omit", "fields": ["name"]},
    {"op": "head", "n": 1},
    {"op": "group", "by": "id"},
    {"op": "flatten", "field": "name"},
    {"op": "join", "with": [{"id": "1", "extra": "z"}], "on": "id"},
]

# The order a reader is supposed to hand on, in each of its shapes. Written out
# rather than derived, so the table can be wrong about the engine and not about
# the file.
EXPECTED = {
    "pick": ["id", "2026", "name"],
    "map": ["id", "2026", "name"],
    "filter": ["id", "2026", "name"],
    "sort": ["id", "2026", "name"],
    "unique": ["id", "2026", "name"],
    "rename": ["id", "year", "name"],
    "add": ["id", "2026", "name", "extra"],
    "omit": ["id", "2026"],
    "head": ["id", "2026", "name"],
    "group": ["key", "count", "items"],
    "flatten": ["id", "2026", "name"],
    "join": ["id", "2026", "name", "extra"],
}


def columns_of_sql(text):
    """The column list out of the INSERT line — what the file says, not a guess."""
    if not text or "INSERT INTO" not in text:
        return None
    head = text.split("INSERT INTO", 1)[1].split("VALUES", 1)[0]
    return [c.strip().strip('"') for c in head.split("(", 1)[1].rstrip(") ").split(",")]


def scope_table():
    """Which operations lose the file's order, and does anything else move."""
    rows = []
    for step in STEPS:
        r = run_step(step)
        if "error" in r:
            rows.append({"op": step["op"], "verdict": "REFUSES", "error": r["error"]})
            continue
        cols = columns_of_sql(r["text"])
        want = EXPECTED[step["op"]]
        rows.append({
            "op": step["op"],
            "columns": cols,
            "order_ok": cols == want,
            "loss": all(v is not None for v in [r["rows"]]) and r["rows"] != [],
        })
    return rows


# A `pick` that names the fields in another order than the file has: which of
# the two orders the user sees is a question, not a bug, so it is asked here and
# not answered here.
PICK_PROBES = [
    ("file order, fields in file order", {"op": "pick", "fields": ["id", "2026", "name"]}),
    ("file order, fields reversed", {"op": "pick", "fields": ["name", "2026", "id"]}),
    ("file order, two fields only", {"op": "pick", "fields": ["2026", "id"]}),
    ("file order, a field the file lacks", {"op": "pick", "fields": ["id", "nope"]}),
]

RENAME_PROBES = [
    ("rename the year column", {"op": "rename", "mapping": {"2026": "year"}}),
    ("rename the first column", {"op": "rename", "mapping": {"id": "key"}}),
    ("rename two columns", {"op": "rename", "mapping": {"id": "key", "name": "who"}}),
]


def probe_table(probes):
    """`(label, step)` in, one row of printed text out — a table that returns
    dicts and is unpacked as pairs is the harness's own bug."""
    rows = []
    for label, step in probes:
        r = run_step(step)
        if "error" in r:
            rows.append((label, f"REFUSES {r['error']}"))
        else:
            rows.append((label, columns_of_sql(r["text"])))
    return rows


# The loss question, asked of the carrying itself: does a record keep its values
# when a hint is attached to it, and can attaching one throw?
LOSS_PROBE = (
    "const e=require(process.argv[1]);"
    "const ORDER=Symbol.for('transmute.fieldOrder');"
    "const data=e.parsers.csv('id,2026,name\\n1,2,x\\n');"
    "const probe=(o)=>({keys:Object.keys(o),text:JSON.stringify(o),"
    "hint:Array.isArray(o[ORDER])?o[ORDER]:null});"
    "const before=data.map(probe);"
    "let thrown=null;try{"
    "const rows=e.operations.pick(data,{fields:['id','2026','name']});"
    "console.log(JSON.stringify({before,after:rows.map(probe),thrown}));"
    "}catch(err){console.log(JSON.stringify({before,thrown:String(err)}));}"
)


def loss_table():
    return node(LOSS_PROBE)


# The price of one rule for the five: where a new field lands, and whether the
# rule can put a name where the record has no value for it.
NEW_FIELD = [
    ("a name that is a number", {"op": "add", "fields": {"2027": "1"}}),
    ("a name already in the file", {"op": "add", "fields": {"name": "'overwritten'"}}),
    ("a name that sorts first in JavaScript", {"op": "add", "fields": {"0": "1"}}),
]

# The paths table A did not reach, because its own step never took them:
# `flatten` only spreads a record when the field really holds a list, and `map`
# only builds a new record when the expression writes one. A table that measures
# a step it never made the engine run reports a clean row for a path nobody
# asked about.
CLEAN = "a,b,c\n1,2,3\n"          # no name that looks like a number
DEEP_PROBES = [
    ("flatten a list field", {"op": "flatten", "field": "b"}, "id,2026,tags\n1,2,x\n1,2,y\n"),
    ("map that writes a new record", {"op": "map", "expr": "({...item, n: 1})"}, CSV),
    ("map that writes a number", {"op": "map", "expr": "item.id"}, CSV),
    ("pick reversed on a clean file", {"op": "pick", "fields": ["c", "a"]}, CLEAN),
    ("pick in file order on a clean file", {"op": "pick", "fields": ["a", "c"]}, CLEAN),
    ("rename on a clean file", {"op": "rename", "mapping": {"a": "z"}}, CLEAN),
    ("add on a clean file", {"op": "add", "fields": {"z": "1"}}, CLEAN),
    ("join on a clean file", {"op": "join", "with": [{"a": "1", "q": "9"}], "on": "a"}, CLEAN),
    # A list that really is a list: the probe above named a column that held
    # strings, so `Array.isArray` was false and the branch that spreads a record
    # never ran — a clean row for a path nobody asked about.
    ("flatten a real list, number column", {"op": "flatten", "field": "tags"}, 'id,tags,2026\n1,"x",2\n1,"y",3\n'),
    # Does a map that deliberately reorders look different from one that only
    # spreads? A rule that carried the file's order into a map would have to
    # undo the swap, so the two are measured apart.
    ("map that swaps two fields on purpose", {"op": "map", "expr": "({b: item.a, a: item.b})"}, CLEAN),
    ("map that renames a field", {"op": "map", "expr": "({a: item.a, z: item.b, c: item.c})"}, CLEAN),
]


def deep_table():
    rows = []
    for label, step, csv in DEEP_PROBES:
        r = run_step(step, csv=csv)
        if "error" in r:
            rows.append((label, f"REFUSES {r['error']}"))
        else:
            rows.append((label, columns_of_sql(r["text"])))
    return rows


def main():
    print("== A. SCOPE: which operations lose the file's order ==")
    for row in scope_table():
        if row.get("verdict") == "REFUSES":
            print(f"  {row['op']:9} REFUSES  {row['error']}")
            continue
        mark = "ok   " if row["order_ok"] else "MOVED"
        print(f"  {row['op']:9} {mark} -> {row['columns']}")

    print("\n== B. LOSS: does carrying an order cost a value ==")
    print(json.dumps(loss_table(), indent=1))

    print("\n== C. ORDER: a picked field, a renamed field, a new field ==")
    for label, row in probe_table(PICK_PROBES):
        print(f"  pick   {label:36} -> {row}")
    for label, row in probe_table(RENAME_PROBES):
        print(f"  rename {label:36} -> {row}")
    for label, row in probe_table(NEW_FIELD):
        print(f"  add    {label:36} -> {row}")

    print("\n== D. the paths table A never reached ==")
    for label, cols in deep_table():
        print(f"  {label:36} -> {cols}")


if __name__ == "__main__":
    main()
