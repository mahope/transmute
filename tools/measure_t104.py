"""Does a less-indented sibling lose its key, its value, or the whole document?

T103 left this as the worst of the seven rows still in the table, and it is a
different reader from the one T103 fixed: `  a: 1` + ` b: 2` comes back as
`{"a": 1}`, so the key `b` is gone with exit 0 and an empty stderr, while PyYAML
refuses the file. `  - 1` + `- 2` is the same loss as `[1]`.

Two questions, kept apart because they are two:
  LOSES-KEY      a sibling is dropped, and the record still has other fields
  LOSES-ALL      a sibling is dropped and what is left is one shape of data
  ok             the two readers agree, one of them refuses and the tool refuses
                 too, or the tool reads it as text on purpose
"""

import json, os, re, subprocess, sys, yaml

ENGINE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "engine.js"
)

CASES = [
    # a) the two shapes the plan named: a sibling indented less than the first
    ("A1", "  a: 1\n b: 2\n"),
    ("A2", "  - 1\n- 2\n"),
    ("A3", "   a: 1\n  b: 2\n"),
    ("A4", "    - 1\n  - 2\n"),
    # b) the same loss one line deeper, under a key
    ("B1", "root:\n   a: 1\n  b: 2\n"),
    ("B2", "root:\n  - 1\n- 2\n"),
    ("B3", "root:\n    a: 1\n   b: 2\n"),
    # c) three siblings, so the table can say how much of the file survives
    ("C1", "   a: 1\n  b: 2\n c: 3\n"),
    ("C2", "   a: 1\n b: 2\n"),
    ("C3", "  a: 1\n b: 2\n c: 3\n"),
    # d) the same shape with a value that is a collection, and with an anchor
    ("D1", "  a:\n   - 1\n  b:\n   - 2\n"),
    ("D2", "  a: 1\n b: 2\nc: 3\n"),
    ("D3", "  a: &x 1\n b: *x\n"),
    # e) controls: the same file with the indentation PyYAML wants
    ("E1", "  a: 1\n  b: 2\n"),
    ("E2", "  - 1\n  - 2\n"),
    ("E3", "root:\n   a: 1\n   b: 2\n"),
    ("E4", "root:\n  - 1\n  - 2\n"),
    # f) controls: a deeper sibling is legal, and a comment may sit at column 0
    ("F1", "  a: 1\n   b: 2\n"),
    ("F2", "# lead\n  a: 1\n b: 2\n"),
    ("F3", "  a: 1\n# between\n  b: 2\n"),
    ("F4", "a: 1\n  b: 2\n"),
    # g) controls: a tab where the indentation goes, and a line that is only
    #    whitespace, so the table can see whether this is about width or column
    ("G1", "  a: 1\n\tb: 2\n"),
    ("G2", "  a: 1\n   \n b: 2\n"),
    ("G3", "  a: 1\n\n b: 2\n"),
    # h) controls: the flow spelling of the same idea, which has no indentation
    ("H1", "{a: 1, b: 2}\n"),
    ("H2", "a: 1\nb: 2\n"),
    # i) a non-mapping key, so the loss is not only in mappings
    ("I1", "  a: 1\n b: 2 3\n"),
    ("I2", "  a: 1\n b: 2\nd: 4\n"),
]


def tool_error(text):
    proc = subprocess.run(
        [
            "node",
            "-e",
            "const e=require(process.argv[1]);"
            "let t='';process.stdin.on('data',d=>t+=d)"
            ".on('end',()=>console.log(JSON.stringify(e.run(t,'yaml'))));",
            ENGINE,
        ],
        input=text,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return "CRASH " + proc.stderr.strip().split("\n")[-1]
    r = json.loads(proc.stdout)
    if r.get("error"):
        return "refuses " + r["error"]
    return "reads " + json.dumps(r["data"], sort_keys=True)


def judge(text):
    try:
        return "reads " + json.dumps(yaml.safe_load(text), sort_keys=True)
    except yaml.YAMLError as err:
        return "refuses " + err.__class__.__name__ + ": " + str(err).split("\n")[0]


def as_records(answer):
    """The answer as the document, not as the record list the pipeline sees.

    `run` hands the pipeline one record at a time, so a document that is a
    single mapping comes back as a list of one and a sequence is the list
    itself. Without this every mapping in the table reads as a difference and
    the table measures nothing.
    """
    v = json.loads(answer[6:])
    if v is None:
        return []
    if isinstance(v, dict):
        return [v]
    return v if isinstance(v, list) else [v]


def missing_keys(tool, py):
    """Keys PyYAML would have given and the tool did not, at any depth.

    Only meaningful when PyYAML reads the file; when it refuses there is no set
    of keys to be missing, and the row is a refusal difference instead.
    """
    if py.startswith("refuses") or tool.startswith("refuses"):
        return []

    def keys(value):
        out = set()
        if isinstance(value, dict):
            for k, v in value.items():
                out.add(k if isinstance(k, str) else json.dumps(k, sort_keys=True))
                out |= keys(v)
        elif isinstance(value, list):
            for v in value:
                out |= keys(v)
        return out

    return sorted(keys(as_records(py)) - keys(as_records(tool)))


def missing_values(tool, py):
    """Values PyYAML would have given and the tool did not, counted as leaves.

    A sequence sibling that is lost leaves no key behind, so the key question
    above cannot see it: `  - 1` + `- 2` keeps the key set empty and drops the
    number. Counting the leaves answers the other half of the same loss.
    """
    if py.startswith("refuses") or tool.startswith("refuses"):
        return []

    def leaves(value):
        out = []
        if isinstance(value, dict):
            for v in value.values():
                out += leaves(v)
        elif isinstance(value, list):
            for v in value:
                out += leaves(v)
        else:
            out.append(json.dumps(value, sort_keys=True))
        return out

    p, t = leaves(as_records(py)), leaves(as_records(tool))
    return sorted(set(p) - set(t))


def dropped(text, tool):
    """Keys and scalars the file writes that the answer does not contain.

    This one asks nothing of PyYAML, and that is the point: the judge *refuses*
    every file in the class, so there is no set of keys to compare against, and
    a table whose loss column is empty for fourteen files measures nothing.

    Three rules keep it from inventing findings, and each of them is a question
    this detector has to be able to answer before it asks it:
      - a refusal is not a loss. Nothing was read, so nothing can be missing,
        and counting an empty answer against a written file turns every correct
        refusal into a finding.
      - the answer is compared as data, not as text. `"1"` is a substring of
        `[1, 2]` only as `"1"` with the quotes, so matching the raw JSON asked
        whether the number appeared *quoted* and reported two lost items on a
        file that is read correctly.
      - a scalar is a leaf. A key that holds a list is not the list's numbers,
        and a `- 1` line under it is not a lost root item.
    """
    if not tool.startswith("reads"):
        return []

    def keys_of(value):
        out = set()
        if isinstance(value, dict):
            for k, v in value.items():
                out.add(str(k))
                out |= keys_of(v)
        elif isinstance(value, list):
            for v in value:
                out |= keys_of(v)
        return out

    def leaves_of(value):
        out = set()
        if isinstance(value, dict):
            for v in value.values():
                out |= leaves_of(v)
        elif isinstance(value, list):
            for v in value:
                out |= leaves_of(v)
        else:
            out.add(json.dumps(value))
        return out

    have_keys, have_leaves = keys_of(as_records(tool)), leaves_of(as_records(tool))
    out = []
    for line in text.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"\s*([A-Za-z0-9_.$-]+):(?:\s|$)", line)
        if m:
            if m.group(1) not in have_keys:
                out.append("key " + m.group(1))
            continue
        m = re.match(r"\s*-\s+(\S+)\s*$", line)
        if m:
            # Read the written text as the scalar it is, not as a string. `- 1`
            # and a leaf of `1` are the same value, and asking whether `"1"` is
            # a substring of `[1, 2]` reported two lost items on a file that is
            # read correctly — the third question this detector could not
            # answer, and the second time in this one table.
            try:
                written = yaml.safe_load(m.group(1))
            except yaml.YAMLError:
                continue
            if json.dumps(written) not in have_leaves:
                out.append("item " + m.group(1).strip("\"'"))
    return out


rows = []
for name, text in CASES:
    tool = tool_error(text)
    py = judge(text)
    lost = missing_keys(tool, py) + missing_values(tool, py)
    gone = dropped(text, tool)
    if gone:
        verdict = "LOSES-DATA"
    elif lost:
        verdict = "LOSES-DATA"
    elif tool.startswith("refuses") != py.startswith("refuses"):
        verdict = "DIFFER"
    elif tool.startswith("refuses") and py.startswith("refuses"):
        verdict = "ok"
    elif json.dumps(as_records(tool), sort_keys=True) == json.dumps(
        as_records(py), sort_keys=True
    ):
        verdict = "ok"
    else:
        verdict = "DIFFER-VALUE"
    rows.append(
        {
            "name": name,
            "text": text,
            "pyyaml": py,
            "tool": tool,
            "verdict": verdict,
            "lost": lost,
            "gone": gone,
        }
    )

for r in rows:
    print(f'{r["name"]:3} {r["verdict"]:13} {json.dumps(r["text"]):26}')
    print(f'{"":4} tool  = {r["tool"][:100]!r}')
    print(f'{"":4} pyyaml= {r["pyyaml"][:100]!r}')
    if r["gone"]:
        print(f'{"":4} written in the file, absent from the answer: {r["gone"]!r}')

bad = [r for r in rows if r["verdict"] != "ok"]
print(f"\n{len(bad)} of {len(rows)} are not ok")
for r in bad:
    print(f'  {r["name"]:3} {r["verdict"]:13} {json.dumps(r["text"]):26} gone {r["gone"]!r}')
