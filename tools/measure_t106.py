"""Does the CSV reader split files the way Python's `csv` module splits them?

Twenty-five iterations have measured one reader — the YAML one. `parseCSV` and
its `countUnquoted` have been read, patched and argued about, but never measured
against the module every other Python tool in the world uses, on the same bytes.

Two questions are held apart, because the last twenty-four measurement tables
were wrong in the same way: a table that compares two things without being able
to tell them apart reports everything or nothing.

  SHAPE   how many records, how many fields in each  — the reader's job
  VALUE   what each field says                        — the reader's job, minus
                                                         the choices the docs
                                                         make on purpose

A disagreement is then named, not counted:

  TYPE    the file said `1` and the tool holds the number 1.  Documented, warned
          about per column by `reportCSVTypeLoss`, and not a bug.
  TRIM    the file said ` x ` and the tool holds `x`.  Documented: every
          spreadsheet export has stray padding, and trimming unquoted fields is
          the behaviour the docs promise.
  BLANK   a record holding only whitespace.  The reader drops it; RFC 4180 calls
          a blank line between records legal, so this is a choice about what
          "blank" means.
  CITE    a quote somewhere the reader does not expect one, so the two readers
          disagree about where the quoted section ends.
  COUNT   records or fields gained or lost for any other reason.  This is the
          class that eats data, and the one this table is looking for.
"""

import json, os, subprocess, csv, io, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "src", "engine.js")

CASES = [
    # --- the RFC 4180 forms a well-formed export uses -------------------------
    ("Q1",  'a,b\n"x,1",2\n', "quoted field holding the delimiter"),
    ("Q2",  'a,b\n"x\n1",2\n', "quoted field holding a newline"),
    ("Q3",  'a,b\n"he said ""hi""",2\n', "doubled quote inside a quoted field"),
    ("Q4",  'a,b,c\n1,,3\n', "empty field in the middle"),
    ("Q5",  'a,b\n1,2,\n', "trailing delimiter"),
    ("Q6",  'a,b\n1,2', "no final newline"),
    ("Q7",  'a,b\r\n1,2\r\n', "CRLF line endings"),
    ("Q8",  'a,b\n"x\r\ny",2\r\n', "CRLF inside a quoted field"),
    ("Q9",  'a,b\n1,2\n\n3,4\n', "blank line between records"),

    # --- quotes in places the reader has to decide about ----------------------
    ("C1",  'a,b\nx"y,2\n', "quote in the middle of an unquoted field"),
    ("C2",  'a,b\n"x"y,2\n', "text after the closing quote"),
    ("C3",  'a,b\n "x",2\n', "whitespace before the opening quote"),
    ("C4",  'a,b\n"x" ,2\n', "whitespace after the closing quote"),
    ("C5",  'a,b\n""x,2\n', "quote pair then text, no comma inside"),
    ("C6",  'a,b\n"x,2\n', "quote that is never closed"),
    ("C7",  'a,b\nx"y"z,2\n', "quote pair in the middle of a bare field"),
    ("C8",  'a,b\n",2\n', "a quoted field that is just the delimiter"),
    ("C9",  'a,b\n"",2\n', "a quoted empty field"),
    ("C10", 'a,b\n"""",2\n', "a quoted field holding one quote"),

    # --- whitespace ------------------------------------------------------------
    ("W1",  'a,b\n  x  ,2\n', "unquoted field padded with spaces"),
    ("W2",  'a,b\nx ,2\n', "trailing space before the delimiter"),
    ("W3",  'a,b\n1,2\n \n3,4\n', "line holding only a space"),
    ("W4",  'a,b\n1,2\n\t\n3,4\n', "line holding only a tab"),

    # --- what a spreadsheet writes that is not RFC 4180 -----------------------
    ("S1",  'a,b\n#note,2\n', "comment line"),
    ("S2",  'a,b\n"#note",2\n', "quoted hash in the first field"),
    ("S3",  'a,b\n1,#2\n', "hash in the second field only"),
    ("S4",  'a,b\r"x"\r,2\r', "bare CR as the record end"),
    ("S5",  'a;b\n"x;y";2\n', "semicolon file whose quoted field holds a semicolon"),
    ("S6",  '"a,b",c\n1,2,3\n', "comma file whose header holds a comma"),
    ("S7",  'a\tb\n"x\ty"\t2\n', "tab file whose quoted field holds a tab"),
    ("S8",  'a|b\n"x|y"|2\n', "pipe file whose quoted field holds a pipe"),
    ("S9",  'a,b\n"1",2\n', "quoted number"),
    ("S10", 'a,b\n007,1.50\n', "leading zeros and a decimal"),
    ("S11", 'a,b\ntrue,false\n', "words a spreadsheet writes as text"),
    ("S12", '# exported 2026-09-28\na,b\n1,2\n', "comment above the header"),
    ("S13", 'a,b\n1,2\n#trailer,3\n', "comment below the data"),
    ("S14", 'a,b\n1,2,3\n', "row longer than the header"),
    ("S15", 'a,b,c\n1,2\n', "row shorter than the header"),
    ("S16", 'a\n1\n', "single column, no delimiter at all"),
    ("S17", 'a,b\n"x;y",2\n', "comma file whose quoted field holds a semicolon"),
    ("S18", 'a,b\n"x|y",2\n', "comma file whose quoted field holds a pipe"),
    ("S19", 'a,b\n"x\ty",2\n', "comma file whose quoted field holds a tab"),
]

# The detector is a *different* question from the reader: `detectDelimiter` reads
# one line — the first that is not a comment — and every delimiter on it, while
# the reader then splits the whole file with whatever it picked. So a file whose
# first line is not shaped like the rest of it is decided on a line that cannot
# decide it. Python is told the true delimiter here, because it has no
# auto-detection; the question is only whether the guess matches the file.
DETECTOR_CASES = [
    ("D1",  'Report\nid\tname\tprice\n1\tx\t2\n', "\t", "tab file behind a one-column title row"),
    ("D2",  'Report\nid|name|price\n1|x|2\n', "|", "pipe file behind a one-column title row"),
    ("D3",  'Report\nid;name;price\n1;x;2\n', ";", "semicolon file behind a one-column title row"),
    ("D4",  'Report\nid,name,price\n1,x,2\n', ",", "comma file behind a one-column title row"),
    ("D5",  'a\tb\n1\tx\t2\n', "\t", "tab file whose title row has fewer tabs than the data"),
    ("D6",  '"Report"\nid\tname\n1\tx\n', "\t", "tab file behind a quoted title row"),
    ("D7",  '"a,b,c"\n1,2,3\n', ",", "comma file whose header is one quoted cell"),
    ("D8",  '"a;b;c"\n1;2;3\n', ";", "semicolon file whose header is one quoted cell"),
    ("D9",  'id,name\n1\n2,3\n', ",", "comma file whose first row is short"),
    ("D10", 'a\t"b\nc\td\te\n', "\t", "tab file whose title row has an unclosed quote"),
    ("D11", 'id,navn\n1,x\n', ";", "comma file that a reader is told is a semicolon file"),
    ("D12", 'a,b\n1,2\n', "\t", "comma file that a reader is told is a tab file"),
]


def judge(text, delimiter=","):
    """What Python's own csv module makes of the same bytes.

    The delimiter is handed to Python rather than sniffed, because a file with
    a tab in it has to be read as a tab file for the comparison to mean
    anything: Python's module has no auto-detection at all, and a question it
    cannot answer is not evidence of a disagreement.
    """
    try:
        rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))
    except csv.Error as err:
        return ("refuses", "csv.Error: " + str(err))
    return ("reads", rows)


def tool_run(text, fmt="csv"):
    proc = subprocess.run(
        ["node", "-e",
         "const e=require(process.argv[1]);"
         "let t='';process.stdin.on('data',d=>t+=d)"
         ".on('end',()=>console.log(JSON.stringify(e.run(t,process.argv[2]))));",
         ENGINE, fmt],
        input=text, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return ("crash", proc.stderr.strip().split("\n")[-1])
    r = json.loads(proc.stdout)
    if r.get("error"):
        return ("refuses", r["error"])
    return ("reads", r["data"])


def as_record(row):
    """One record as a list of strings, so shape and value can be asked apart.

    A value that came back as a number or a boolean is written the way the file
    wrote it, because the type is question VALUE asks separately.
    """
    out = []
    for v in row.values():
        if isinstance(v, bool):
            out.append("true" if v else "false")
        elif v is None:
            out.append("")
        else:
            out.append(str(v))
    return out


def classify(py_row, tl_row):
    """Name the difference, or return None when the two agree."""
    if len(py_row) != len(tl_row):
        return "COUNT"
    for p, t in zip(py_row, tl_row):
        if p == t:
            continue
        ps = p.strip()
        if ps == t and ps != p:
            return "TRIM"
        try:
            if float(ps) == float(t) or ps == t.lower():
                return "TYPE"
        except (ValueError, TypeError):
            pass
        return "VALUE"
    return None


rows = []
for name, text, label in CASES:
    pk, pv = judge(text)
    tk, tv = tool_run(text)
    if tk != "reads":
        rows.append({"name": name, "label": label, "verdict": "REFUSES",
                     "py": pk, "py_value": pv, "tool": tv})
        continue
    tool_rows = [as_record(r) for r in tv]
    # The first record is the header in both readers: this tool turns it into
    # field names, Python's module hands it back as the first row. Comparing
    # them as two lists of records is how the first run of this table reported
    # 0 af 42 on files every CSV reader splits the same way — the header is not
    # a data row, so it is taken off both sides before anything is asked.
    py_rows = pv[1:] if pv else []
    if pk == "reads" and pv:
        head = [h.strip() for h in pv[0]]
        # Only the first record's own field names are the header's; a name like
        # `column3` is T14's invented home for values past the end of the header
        # and is not a disagreement about the header.
        names = list(tv[0].keys())[:len(head)] if tv else []
        if names != head:
            rows.append({"name": name, "label": label, "verdict": "HEADER",
                         "py": pk, "py_value": head, "tool": names})
            continue
    if len(py_rows) != len(tool_rows):
        # Same number of records or not: hold the class open and look at the
        # first record pair, so a table can say *which* record went missing.
        cls = "COUNT"
        for p, t in zip(py_rows, tool_rows):
            c = classify(p, t)
            if c:
                cls = "COUNT/" + c
                break
        rows.append({"name": name, "label": label, "verdict": cls,
                     "py": pk, "py_value": py_rows, "tool": tool_rows})
        continue
    classes = []
    for p, t in zip(py_rows, tool_rows):
        c = classify(p, t)
        if c:
            classes.append(c)
    verdict = "OK" if not classes else "/".join(sorted(set(classes)))
    rows.append({"name": name, "label": label, "verdict": verdict,
                 "py": pk, "py_value": py_rows, "tool": tool_rows})

print(f"{len(CASES)} filer gennem laeseren: "
      f"{len([r for r in rows if r['verdict'] == 'OK'])} i overensstemmelse, "
      f"{len([r for r in rows if r['verdict'] != 'OK'])} i en navngiven klasse\n")
for r in rows:
    if r["verdict"] == "OK":
        continue
    print(f"  {r['name']:4s} {r['verdict']:16s} {r['label']}")
    print(f"        python  {json.dumps(r['py_value'], ensure_ascii=False)}")
    print(f"        tool    {json.dumps(r['tool'], ensure_ascii=False)}")
print()

# --- the detector -------------------------------------------------------------
detect_rows = []
for name, text, delimiter, label in DETECTOR_CASES:
    pk, pv = judge(text, delimiter)
    tk, tv = tool_run(text)
    detected = None
    proc = subprocess.run(
        ["node", "-e",
         "const e=require(process.argv[1]);"
         "let t='';process.stdin.on('data',d=>t+=d)"
         ".on('end',()=>{const d=e.detectCSVDelimiter?e.detectCSVDelimiter(t):"
         "JSON.parse(process.argv[2]);console.log(JSON.stringify(d))});",
         ENGINE, json.dumps({"n": "no-export"})],
        input=text, capture_output=True, text=True,
    )
    py_rows = pv[1:] if pv else []
    names = list(tv[0].keys()) if tk == "reads" and tv else None
    width = {len(p) for p in py_rows} if py_rows else set()
    if tk != "reads":
        verdict = "REFUSES"
    elif names is None:
        verdict = "NO ROWS"
    elif len(names) == 1 and max(width or {1}) > 1:
        verdict = "COLLAPSE"          # every column but one gone
    elif names != [h.strip() for h in pv[0]]:
        verdict = "HEADER"
    else:
        verdict = "OK"
    detect_rows.append({"name": name, "label": label, "verdict": verdict,
                        "delimiter": delimiter, "py": pv, "tool": names,
                        "tool_error": None if tk == "reads" else tv})

print(f"{len(DETECTOR_CASES)} filer gennem delimiter-detektoren: "
      f"{len([r for r in detect_rows if r['verdict'] == 'OK'])} i overensstemmelse, "
      f"{len([r for r in detect_rows if r['verdict'] != 'OK'])} i en navngiven klasse\n")
for r in detect_rows:
    if r["verdict"] == "OK":
        continue
    shown = dict((c[0], c[1]) for c in DETECTOR_CASES)[r["name"]]
    print(f"  {r['name']:4s} {r['verdict']:10s} {r['label']}  (sand delimiter {r['delimiter']!r})")
    print(f"        file    {shown!r}")
    print(f"        python  {json.dumps(r['py'], ensure_ascii=False)}")
    print(f"        tool    {json.dumps(r['tool'], ensure_ascii=False)} {r['tool_error'] or ''}")
    print()
