"""What does a title row above the header cost the reader — and would skipping it be safe?

T106 measured the CSV reader in two halves and the second one is still unread: a
file whose *header* line holds fewer fields than the lines below it, so the
columns get named after a report title. T106 wrote it as a choice — *should the
reader skip a line when the next one has more fields?* — and a choice needs a
measurement behind it, not a preference.

Two questions are held apart, because the last twenty-five measurement tables
were wrong in the same way: a table that compares two things without being able
to tell them apart reports everything or nothing.

  LOSS     does a value from the file fail to reach the output at all — and does
           anything on stderr say so
  NAME     which line the columns are named after, and whether the message that
           fires describes *that* line or only the ragged rows below it

Then a third table, because the choice has two answers and only one of them is
free: what a "drop the first line when it is narrower than the rest" rewrite
would do — how many files it fixes, and how many values it eats.
"""

import json, subprocess, csv, io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "src", "engine.js")

CASES = [
    # --- a title row over the header, in the four delimiters -------------------
    ("T1", 'Report\nid\tname\tprice\n1\tx\t2\n', "\t", "one-column title over a tab file"),
    ("T2", 'Report, Q3\nid,name,price\n1,x,2\n', ",", "two-field title over a comma file"),
    ("T3", 'Report;;\nid;name;price\n1;x;2\n', ";", "title with two empty fields, semicolon file"),
    ("T4", '"Report"\nid|name|price\n1|x|2\n', "|", "quoted title over a pipe file"),
    ("T5", 'Quarterly report, generated 2026-09-28\nid,name,price\n1,x,2\n3,y,4\n', ",",
     "title holding a comma over a comma file, two data rows"),
    ("T6", 'Report;Q3\nid;name;price\n1;x;2\n', ";", "two-field title over a semicolon file"),
    ("T7", 'Report;;;\nid;name;price\n1;x;2\n3;y;4\n', ";", "title with three empty fields"),
    ("T8", 'Report\nid;name;price\n1;x;2\n', ";", "one-column title over a semicolon file"),
    ("T9", 'Report;Q3;2026\nid;name;price\n1;x;2\n', ";", "title as wide as the header"),

    # --- files that are not a title row, and must not be told they are ---------
    ("C1", 'id,name\n1,x\n2,y\n', ",", "an ordinary file"),
    ("C2", 'a,b,c\n1,2\n3,4,5,6\n', ",", "ragged rows that disagree with each other"),
    ("C3", '"a,b",c\n1,2,3\n', ",", "RFC 4180 header that holds a comma"),
    ("C4", 'a,b\n"x;y",2\n', ",", "comma file whose quoted field holds a semicolon"),
    ("C5", '# exported 2026-09-28\nid,name\n1,x\n', ",", "comment above the header"),
    ("C6", 'a\nhello world\nsecond line\n', ",", "one column of prose"),
    ("C7", 'id,name\n1\n2,3\n', ",", "a short first row, the rest full"),
    ("C8", 'a\tb\n1\tx\n2\ty\n', "\t", "an ordinary tab file"),
    ("C9", 'id,name\n1,x\n\n2,y\n', ",", "blank line between rows"),
]

# The rewrite T106's point called a choice: *drop the first line when it is
# narrower than the lines below it*. Measured on its own, because the question
# is not whether the reader should reshape a file — it is whether a user could
# tell the reader apart from itself. These five files answer that: the rule fires
# on the title case and on a header that is simply narrower than its rows, which
# are the same bytes in a different order and cannot be told apart without
# guessing. The judge is Python's `csv` again, because the point is the *shape*.
RESHAPE_CASES = [
    ("X1", 'Report, Q3\nid,name,price\n1,x,2\n', ",", "a title row over the header"),
    ("X2", 'id\n1,2\n3,4\n', ",", "a header with one name and rows with two"),
    ("X3", 'id,name\n1,2,3\n4,5,6\n', ",", "a header with two names and rows with three"),
    ("X4", 'a\n1,2\n', ",", "a header with one name and a single row with two"),
    ("X5", 'id\tname\n1\tx\n', "\t", "an ordinary tab file"),
]


def tool_run(text, fmt="csv"):
    """The engine on the real bytes, with the warnings it pushed."""
    proc = subprocess.run(
        ["node", "-e",
         "const e=require(process.argv[1]);"
         "let t='';process.stdin.on('data',d=>t+=d)"
         ".on('end',()=>console.log(JSON.stringify(e.run(t,process.argv[2]))));",
         ENGINE, fmt],
        input=text, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().split("\n")[-1], "data": None, "warnings": []}
    r = json.loads(proc.stdout)
    return {"error": r.get("error"), "data": r.get("data"), "warnings": r.get("warnings") or []}


def judge(text, delimiter=","):
    """What Python's own csv module makes of the same bytes, with the true delimiter."""
    try:
        return list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))
    except csv.Error as err:
        return None


def widths(rows):
    return [len(r) for r in rows]


def values_of(records):
    out = []
    for r in records or []:
        for v in r.values():
            if isinstance(v, bool):
                out.append("true" if v else "false")
            elif v is None:
                out.append("")
            else:
                out.append(str(v))
    return out


def reshape(rows):
    """What a "drop the first line when it is narrower than the rest" rewrite does."""
    w = widths(rows)
    if len(w) < 3:
        return {"dropped": False, "why": "too few records to compare"}
    if w[0] >= max(w[1:]):
        return {"dropped": False, "why": "the first line is not narrower"}
    if len(set(w[1:])) != 1:
        return {"dropped": False, "why": "the lines below disagree with each other"}
    kept = rows[1:]
    return {"dropped": True, "header": kept[0], "rows": kept[1:],
            "values_lost": sum(len(r) for r in rows[1:]) - sum(len(r) for r in kept[1:])}


rows = []
for name, text, delimiter, label in CASES:
    py = judge(text, delimiter)
    t = tool_run(text)
    if t["error"]:
        rows.append({"name": name, "label": label, "verdict": "REFUSES", "error": t["error"],
                     "warnings": t["warnings"]})
        continue
    data = t["data"] or []
    tool_names = list(data[0].keys()) if data else []
    true_names = [h.strip() for h in py[0]] if py else []
    py_values = [v for r in (py or [])[1:] for v in r if v != ""]
    tool_values = values_of(data)
    lost = [v for v in py_values if v not in tool_values]
    w = widths(py) if py else []
    classes = []
    if tool_names != true_names:
        classes.append("NAMED-AFTER-TITLE" if w and w[0] < max(w[1:]) else "NAMED")
    if lost:
        classes.append("LOST:" + ",".join(lost[:4]))
    rows.append({
        "name": name, "label": label,
        "verdict": "+".join(classes) if classes else "OK",
        "widths": w, "true_names": true_names, "tool_names": tool_names,
        "tool_data": data,
        "warnings": t["warnings"],
        "mentions_first_line": any("first line" in wm or "header" in wm for wm in t["warnings"]),
        "reshape": reshape(py) if py else None,
    })

print(f"{len(CASES)} filer: {len([r for r in rows if r['verdict'] == 'OK'])} i overensstemmelse, "
      f"{len([r for r in rows if r['verdict'] != 'OK'])} i en navngiven klasse\n")
for r in rows:
    print(f"  {r['name']:3s} {r['verdict']:22s} {r['label']}")
    if r.get("error"):
        print(f"        tool    REFUSES: {r['error']}")
        continue
    print(f"        bredder {r['widths']}  python {json.dumps(r['true_names'], ensure_ascii=False)}"
          f"  tool {json.dumps(r['tool_names'], ensure_ascii=False)}")
    if r["verdict"] != "OK":
        print(f"        data    {json.dumps(r['tool_data'], ensure_ascii=False)}")
    for wm in r["warnings"]:
        print(f"        stderr  {wm}")
    if not r["warnings"]:
        print("        stderr  (tom)")
    rs = r.get("reshape")
    if rs:
        if rs.get("dropped"):
            print(f"        skip    hoved {json.dumps(rs['header'], ensure_ascii=False)} "
                  f"({rs['values_lost']} værdier tabt), {len(rs['rows'])} rækker tilbage")
        else:
            print(f"        skip    nej: {rs['why']}")
    print()

print("--- hvad en 'spring den forrende linje over'-omskrivning gør -----------------\n")
for name, text, delimiter, label in RESHAPE_CASES:
    py = judge(text, delimiter) or []
    rs = reshape(py)
    if not rs.get("dropped"):
        print(f"  {name:3s} springer ikke  {label}")
        continue
    kept = [r[0] for r in rs["rows"]]
    print(f"  {name:3s} springer        {label}: kolonnerne bliver "
          f"{json.dumps(rs['header'], ensure_ascii=False)} og {len(rs['rows'])} rækker(er) "
          f"tilbage {json.dumps(kept, ensure_ascii=False)}")
