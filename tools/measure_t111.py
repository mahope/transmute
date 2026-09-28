"""Does `flatten` keep the file's own order when the field really is a list?

T109 measured the order through twelve operations, and in that table `flatten`
was one of the six that let the record stay the same — so it read as the one
list operation that was already answered. It was not. That row was a CSV, and
**a CSV cannot hold a list**: the reader makes every cell a scalar, so
`flatten` never entered its list branch, never built a new record, and the
order survived because nothing happened. T109's own harness found the boundary
of that probe late — it named a column with strings, `Array.isArray` was false,
and the table wrote a clean row for a path nobody asked about.

So this measures the branch. The file is JSON or YAML, `field` holds a real
list, and the question is asked of the two readers that can carry one:

  ORDER  does the expanded row keep the file's own order, or does it become the
         language's?
  LOSS   does expanding cost a value? A row that had four fields and a list of
         two members must come out with four fields' worth, not three.
  WARN   does `reportFlattenCollisions` still fire when the reader is JSON or
         YAML, or is the warning tied to a shape only CSV produces?

Three questions held apart, because one column that measures order and loss
calls every file broken or none.
"""

import json, subprocess, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Absolute, because `node -e` resolves a relative `require` against the working
# directory and not against this file — a table that reads `MODULE_NOT_FOUND` for
# every row is the harness's own bug and not a finding.
ENGINE = os.path.abspath(os.path.join(ROOT, "src", "engine.js"))

# A column that looks like a whole number, so the language's own order and the
# file's order disagree — without that every table here says "fine".
JSON_FILE = json.dumps(
    [
        {"id": 1, "2026": "2", "name": "x", "tags": [{"kind": "a"}, {"kind": "b"}]},
        {"id": 2, "2026": "3", "name": "y", "tags": [{"kind": "c"}]},
    ]
)

YAML_FILE = (
    "- id: 1\n"
    "  2026: '2'\n"
    "  name: x\n"
    "  tags:\n"
    "    - kind: a\n"
    "    - kind: b\n"
    "- id: 2\n"
    "  2026: '3'\n"
    "  name: y\n"
    "  tags:\n"
    "    - kind: c\n"
)

# `run` is the real path: reader, operation, writer. No top-level `return`:
# `node -e` compiles this as a script, not a function.
PIPE = (
    "const e=require(process.argv[1]);"
    "const r=e.run(process.argv[2],process.argv[3],JSON.parse(process.argv[4]),process.argv[5]);"
    "const out=r.error?{error:r.error}:"
    "{text:r.text,warnings:r.warnings||[],rows:JSON.parse(JSON.stringify(r.data||[]))};"
    "console.log(JSON.stringify(out));" )


def run_step(fmt, source, out, step):
    proc = subprocess.run(
        ["node", "-e", PIPE, ENGINE, source, fmt, json.dumps([step]), out],
        capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().split("\n")[-1]}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"error": "no json", "raw": proc.stdout}


def columns_of_sql(text):
    """The column list out of the INSERT line — what the file says, not a guess."""
    if not text or "INSERT INTO" not in text:
        return None
    head = text.split("INSERT INTO", 1)[1].split("VALUES", 1)[0]
    return [c.strip().strip('"') for c in head.split("(", 1)[1].rstrip(") ").split(",")]


def field_order(rows):
    """The keys of the first row, as the writer would print them."""
    if not rows:
        return None
    return list(rows[0].keys())


def order_table():
    """A real list, in both readers that can hold one, through every writer."""
    rows = []
    for fmt, source in (("json", JSON_FILE), ("yaml", YAML_FILE)):
        for out in ("sql", "json", "csv", "yaml"):
            r = run_step(fmt, source, out, {"op": "flatten", "field": "tags"})
            if "error" in r:
                rows.append({"fmt": fmt, "out": out, "verdict": "REFUSES",
                             "error": r["error"]})
                continue
            if out == "sql":
                cols = columns_of_sql(r["text"])
            elif out == "json":
                cols = field_order(r["rows"])
            else:
                cols = r["text"].split("\n")[0].split(",") if r["text"] else None
            want = ["id", "2026", "name", "kind"]
            rows.append({
                "fmt": fmt,
                "out": out,
                "columns": cols,
                "order_ok": cols == want,
                "rows": len(r["rows"]),
                "warnings": r["warnings"],
            })
    return rows


# The same file, without a list: the control. A field that is not a list leaves
# the record alone, so any difference between this and the table above is the
# branch and not the writer.
CONTROL_SQL = [
    ("json", "a list", JSON_FILE),
    ("yaml", "a list", YAML_FILE),
    ("json", "no list", json.dumps([{"id": 1, "2026": "2", "name": "x"}])),
    ("yaml", "no list", "- id: 1\n  2026: '2'\n  name: x\n"),
]


def control_table():
    rows = []
    for fmt, label, source in CONTROL_SQL:
        r = run_step(fmt, source, "sql", {"op": "flatten", "field": "tags"})
        if "error" in r:
            rows.append({"fmt": fmt, "label": label, "verdict": "REFUSES",
                         "error": r["error"]})
            continue
        rows.append({
            "fmt": fmt,
            "label": label,
            "columns": columns_of_sql(r["text"]),
            "warnings": r["warnings"],
        })
    return rows


# A member named after a field the row already has: the warning, in the readers
# that can hold a list. A member named after `tags` itself is the control that
# keeps the rule from being too broad.
COLLIDE_JSON = json.dumps(
    [{"id": 1, "2026": "2", "name": "outer",
      "tags": [{"name": "inner", "weight": 10}, {"weight": 11}]}]
)
COLLIDE_YAML = (
    "- id: 1\n"
    "  2026: '2'\n"
    "  name: outer\n"
    "  tags:\n"
    "    - name: inner\n"
    "      weight: 10\n"
    "    - weight: 11\n"
)
COLLIDE_CONTROL = json.dumps(
    [{"id": 1, "2026": "2", "name": "outer", "tags": [{"tags": "me", "kind": "a"}]}]
)


def collision_table():
    rows = []
    for fmt, source in (("json", COLLIDE_JSON), ("yaml", COLLIDE_YAML)):
        r = run_step(fmt, source, "sql", {"op": "flatten", "field": "tags"})
        rows.append({
            "fmt": fmt,
            "verdict": "REFUSES" if "error" in r else "reads",
            "columns": columns_of_sql(r.get("text")),
            "warned": bool(r.get("warnings")),
            "warnings": r.get("warnings", []),
        })
    c = run_step("json", COLLIDE_CONTROL, "sql", {"op": "flatten", "field": "tags"})
    rows.append({
        "fmt": "json",
        "verdict": "control: member named after the list itself",
        "columns": columns_of_sql(c.get("text")),
        "warned": bool(c.get("warnings")),
        "warnings": c.get("warnings", []),
    })
    return rows


if __name__ == "__main__":
    for name, table in (("ORDER", order_table()), ("CONTROL", control_table()),
                        ("WARN", collision_table())):
        print(f"== {name}")
        for row in table:
            print(json.dumps(row, ensure_ascii=False))
