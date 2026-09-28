"""What does a column named like a number cost the reader — and what would it cost to fix?

T107 found this one while measuring something else: a file whose header holds a
name that looks like a whole number (`2026`) comes out of every writer with that
column in front, because JavaScript puts keys that look like array positions
first in an object — whatever order they were set in. The finding was written
down as "the class is bigger than CSV", because `JSON.parse` has the same
property and `unionKeys` reads the order from `Object.keys`.

So the task has a boundary and a price, and neither is known yet:

  BOUNDARY which column names actually move, and where the line stands
  LOSS     does every value from the file land in the right column, and does
           anything on stderr say so
  ORDER    do the columns stand in the file's own order, in every reader and in
           every writer
  PRICE    what each of the ways out would cost — not which one is prettier

Two questions are held apart, because the last twenty-six measurement tables
were wrong in the same way: a table that measures loss and order in one column
reports every file as broken or none.
"""

import json, subprocess, os, csv, io, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "src", "engine.js")


def node(code, text=None, args=()):
    """The engine on the real bytes."""
    proc = subprocess.run(
        ["node", "-e", code, ENGINE, *args],
        input=text, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return {"error": proc.stderr.strip().split("\n")[-1]}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"error": "no json", "raw": proc.stdout}


READ = ("const e=require(process.argv[1]);"
        "let t='';process.stdin.on('data',d=>t+=d)"
        ".on('end',()=>{const r=e.run(t,process.argv[2],[],process.argv[3]);"
        "console.log(JSON.stringify(r))});")

# One reader, one writer, per call — the order of the keys in the JSON that comes
# back IS the order `Object.keys` gives, because `JSON.stringify` writes the
# object's own order. That is the order `unionKeys` reads, and the order the
# other five writers print.
def read(text, fmt, out="json"):
    return node(READ, text, (fmt, out))


def write_records(data, fmt):
    """The six writers on records, with the warnings they pushed."""
    r = node("const e=require(process.argv[1]);"
             "const data=JSON.parse(process.argv[2]);"
             "const w=[];const text=e.serializers[process.argv[3]](data,{warnings:w});"
             "console.log(JSON.stringify({text,warnings:w}));",
             args=(json.dumps(data), fmt))
    return r


# ---------------------------------------------------------------------------
# Table A — the boundary. Which column names move, and where the line stands.
# ---------------------------------------------------------------------------
BOUNDARY = [
    ("0", "zero — the first array position"),
    ("1", "one — the second array position"),
    ("2", "two"),
    ("9", "one digit"),
    ("10", "two digits"),
    ("2026", "a year — the shape a customer table really has"),
    ("0074", "leading zero"),
    ("-1", "negative"),
    ("+1", "leading plus"),
    ("1.0", "a whole number written with a fraction"),
    ("1e3", "in exponent"),
    ("0x1", "in hex"),
    ("1n", "as a BigInt literal"),
    (" 2", "a leading space"),
    ("2 ", "a trailing space"),
    ("4294967294", "the largest array index (2^32-2)"),
    ("4294967295", "one past the largest array index"),
    ("9007199254740991", "the largest safe integer"),
]


def boundary_table():
    rows = []
    for name, why in BOUNDARY:
        text = f"id,{name},name\n1,V,x\n"
        r = read(text, "csv")
        if "error" in r:
            rows.append({"name": name, "why": why, "verdict": "REFUSES", "error": r["error"]})
            continue
        keys = list((r.get("data") or [{}])[0].keys())
        file_order = ["id", name, "name"]
        rows.append({"name": name, "why": why, "keys": keys,
                     "moved": keys != file_order, "refused": bool(r.get("error")),
                     "stderr": r.get("error") or ""})
    return rows


# ---------------------------------------------------------------------------
# Table B — LOSS and ORDER, every reader, two questions held apart.
# ---------------------------------------------------------------------------
# One file per reader, all four written with the same three column names in the
# same order, where the middle one looks like a whole number.
READERS = [
    ("json", '[{"id":1,"2026":2,"name":"x"}]'),
    ("csv", "id,2026,name\n1,2,x\n"),
    ("yaml", "- id: 1\n  2026: 2\n  name: x\n"),
    ("xml", "<data><item><id>1</id><2026>2</2026><name>x</name></item></data>"),
]

# The names that must not move, and the file order they are written in.
FILE_ORDER = ["id", "2026", "name"]
FILE_VALUES = {"id": "1", "2026": "2", "name": "x"}


def reader_table():
    rows = []
    for fmt, text in READERS:
        r = read(text, fmt)
        if "error" in r or r.get("error"):
            rows.append({"reader": fmt, "verdict": "REFUSES", "error": r.get("error") or r["error"]})
            continue
        data = r.get("data") or []
        if not data:
            rows.append({"reader": fmt, "verdict": "NO ROWS", "raw": r.get("data")})
            continue
        rec = data[0]
        keys = list(rec.keys())
        # LOSS: is every value from the file in the column the file gave it?
        lost = [k for k, v in FILE_VALUES.items() if str(rec.get(k)) != v]
        rows.append({"reader": fmt, "keys": keys, "order_ok": keys == FILE_ORDER,
                     "lost": lost, "moved": [k for k in keys if k != "2026" and FILE_ORDER.index(k) < FILE_ORDER.index("2026")]
                     if keys != FILE_ORDER else [],
                     "value_of_2026": rec.get("2026"), "stderr": r.get("error") or ""})
    return rows


# ---------------------------------------------------------------------------
# Table C — the six writers. The claim in the queue is that the class is bigger
# than CSV, so every writer is measured with a record whose own order already
# disagrees with JavaScript's.
# ---------------------------------------------------------------------------
WRITERS = ["json", "csv", "yaml", "xml", "table", "sql"]

# A record written in the file's own order. JSON.parse hands it to JavaScript
# with the same disagreement, because the order is a property of the object, not
# of the way the bytes were written.
FILE_ORDERED = {"id": 1, "2026": 2, "name": "x"}


def column_order_of(text, fmt):
    """The column order a reader sees in the written bytes — Python's own order."""
    if fmt == "json":
        return list(json.loads(text)[0].keys())
    if fmt == "csv":
        return next(csv.reader(io.StringIO(text, newline="")))
    if fmt == "yaml":
        # The writer quotes a name YAML would not take bare, so the quotes are
        # the writer's, not the file's.
        return [m.group(1).strip('"\'') for m in
                re.finditer(r"^\s*(?:- )?\"?([\w.' -]+)\"?:", text, re.M)][:3]
    if fmt == "xml":
        # A name XML will not take bare is written as `<field name="…">`, so the
        # children are read as they are and not as their tag names.
        import xml.etree.ElementTree as ET
        root = ET.fromstring(text)
        item = root[0]
        return [c.get("name") or c.tag for c in item]
    if fmt == "table":
        return [c.strip() for c in text.split("\n")[1].strip("|").split("|")]
    if fmt == "sql":
        m = re.search(r"INSERT INTO .*? \((.*?)\) VALUES", text)
        return [c.strip().strip('"') for c in m.group(1).split(",")] if m else []
    return []


def writer_table():
    rows = []
    for fmt in WRITERS:
        w = write_records([FILE_ORDERED], fmt)
        if "error" in w:
            rows.append({"writer": fmt, "verdict": "REFUSES", "error": w["error"]})
            continue
        text = w["text"]
        order = column_order_of(text, fmt)
        rows.append({"writer": fmt, "columns": order, "order_ok": order == FILE_ORDER,
                     "warnings": w.get("warnings") or [], "text": text})
    return rows


# ---------------------------------------------------------------------------
# Table D — the price of each way out, counted, not argued.
# ---------------------------------------------------------------------------
def price_table():
    """How much of the engine assumes a record is a plain object with Object.keys
    order, and how much of a `Map` would break if the records became Maps."""
    counts = {}
    with open(ENGINE, encoding="utf-8") as fh:
        lines = fh.readlines()
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith(("*", "//", "/*")):
            continue
        for pat in ("Object.keys", "Object.entries", "JSON.stringify", "for (const key of"):
            if pat in stripped:
                counts.setdefault(pat, []).append(i)
    return {k: {"count": len(v), "lines": v} for k, v in counts.items()}


def map_probe():
    """What a Map per record would mean, asked of the engine and not argued."""
    code = ("const e=require(process.argv[1]);"
            "const m=new Map([['id',1],['2026',2],['name','x']]);"
            "const out=[];"
            "try{out.push(JSON.stringify(m))}catch(err){out.push('THROWS: '+err.message)}"
            "try{out.push(JSON.stringify(Object.keys(m)))}catch(err){out.push('THROWS: '+err.message)}"
            "try{out.push(String(m['id']))}catch(err){out.push('THROWS: '+err.message)}"
            "try{out.push(JSON.stringify({...m}))}catch(err){out.push('THROWS: '+err.message)}"
            "try{out.push(JSON.stringify(Object.entries(m)))}catch(err){out.push('THROWS: '+err.message)}"
            "console.log(JSON.stringify(out));")
    r = node(code)
    return r


if __name__ == "__main__":
    print("== A. the boundary: which column names move ==")
    for row in boundary_table():
        if row.get("verdict") == "REFUSES":
            print(f"  {row['name']!r:22} REFUSES  {row['error']}")
        else:
            mark = "MOVES " if row["moved"] else "holds "
            print(f"  {row['name']!r:22} {mark} -> {row['keys']}   {row['why']}")

    print("\n== B. every reader: LOSS and ORDER held apart ==")
    for row in reader_table():
        if "verdict" in row:
            print(f"  {row['reader']:5} {row['verdict']}  {row.get('error') or row.get('raw')}")
        else:
            print(f"  {row['reader']:5} order_ok={str(row['order_ok']):5} lost={row['lost']}  keys={row['keys']}")
            if row["stderr"]:
                print(f"        stderr: {row['stderr']}")

    print("\n== C. every writer, a record already in file order ==")
    for row in writer_table():
        if row.get("verdict") == "REFUSES":
            print(f"  {row['writer']:5} REFUSES {row['error']}")
        else:
            mark = "OK   " if row["order_ok"] else "MOVED"
            print(f"  {row['writer']:5} {mark} -> {row['columns']}")
            for w in row["warnings"]:
                print(f"        warning: {w}")

    print("\n== D. the price of each way out ==")
    for pat, info in sorted(price_table().items()):
        print(f"  {pat:20} {info['count']:3} use(s) in the engine: lines {info['lines'][:14]}")
    print("  a Map per record behaves like this where the engine reads one:")
    for line in (map_probe() if isinstance(map_probe(), list) else []):
        print(f"        {line}")


# ---------------------------------------------------------------------------
# Table E — a hint that travels with a record: does it survive the operations?
# A plain object cannot hold its own order, so the order has to live somewhere
# else, and every way out was measured before one was written:
#   symbol key   copied by spread and Object.assign, invisible to Object.keys,
#                Object.entries and JSON.stringify
#   non-enumerable  survives nothing that copies, and is what ownKeys filters
#   Proxy        the only thing that can change the order a writer sees, because
#                [[OwnPropertyKeys]] is what JSON.stringify and Object.keys read
# ---------------------------------------------------------------------------
OPERATIONS = [
    {"op": "pick", "fields": ["id", "2026", "name"]},
    {"op": "map", "expr": "item"},
    {"op": "filter", "expr": "item.id == 1"},
    {"op": "sort", "by": "id"},
    {"op": "unique", "by": "id"},
    {"op": "rename", "mapping": {"2026": "year"}},
    {"op": "add", "field": "extra", "value": 1},
    {"op": "omit", "fields": ["name"]},
    {"op": "head", "n": 1},
    {"op": "group", "by": "id"},
    {"op": "flatten", "field": "name"},
]

HINT_CODE = (
    "const e=require(process.argv[1]);"
    "const ORDER=Symbol.for('transmute.fieldOrder');"
    "const data=e.parsers.csv('id,2026,name\\n1,2,x\\n');"
    "for(const r of data) Object.defineProperty(r,ORDER,{value:['id','2026','name'],enumerable:false,writable:true,configurable:true});"
    "const step=JSON.parse(process.argv[2]);"
    "let rows=e.operations[step.op](data,step);"
    "if(!Array.isArray(rows)) rows=[rows];"
    "console.log(JSON.stringify({keys:rows.map(r=>Object.keys(r)),"
    "hint:rows.map(r=>Array.isArray(r[ORDER])?r[ORDER]:null)}));"
)


def operation_table():
    rows = []
    for step in OPERATIONS:
        r = node(HINT_CODE, args=(json.dumps(step),))
        if "error" in r or not r.get("keys"):
            rows.append({"op": step["op"], "verdict": "REFUSES", "detail": r.get("error") or r})
            continue
        rows.append({"op": step["op"], "keys": r["keys"][0], "hint": r["hint"][0],
                     "hint_survives": r["hint"][0] is not None,
                     "order_ok": r["keys"][0] == ["id", "2026", "name"][:len(r["keys"][0])]})
    return rows


def hint_probe():
    """The three ways a record can carry its own order, measured where the
    engine reads a record — not argued from the spec."""
    code = ("const rec=()=>({id:1,'2026':2,name:'x'});"
            "const order=['id','2026','name'];"
            "const sym=Symbol.for('order'), hidden=Symbol.for('hidden');"
            "const a=rec(); a[sym]=order;"
            "const b=rec(); Object.defineProperty(b,hidden,{value:order,enumerable:false});"
            "const c=new Proxy(rec(),{ownKeys:t=>[...order,...Reflect.ownKeys(t).filter(k=>!order.includes(k))]});"
            "const probe=o=>JSON.stringify({keys:Object.keys(o),entries:Object.entries(o).map(e=>e[0]),"
            "text:JSON.stringify(o),spread:Object.keys({...o})});"
            "console.log(JSON.stringify({symbol:a,hidden:b,proxy:c},null,1));")
    return json.dumps(node(code), indent=1)
