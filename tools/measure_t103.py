"""Does an error message quote a whole node, or a piece of one?

`endsFlowNode` stops a plain flow node at `,`, `]` or `}`, so the raw text it
leaves behind can be a *fragment* of the value that stands there. A substring
test cannot see that: `[1` is inside `[1, 2]`, so "the quote is in the file"
passes on a message that names a value the file does not have. The test that
separates the two is where the quote *stops* — if the file continues with a flow
delimiter right after it, the reader cut mid-node and the message is describing
a file nobody wrote.

The table keeps three questions apart, because they are three:
  QUOTES-FRAGMENT  both refuse, but the message names a piece of a node
  DIFFER           one reads what the other refuses, or they read different values
  ok               they agree, or both refuse and the quote is the whole node
"""

import json, os, re, subprocess, sys, yaml

ENGINE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "engine.js"
)

CASES = [
    # a) a tag on a collection inside a flow collection — the shape the plan named
    ("A1", "a: {b: !!int [1, 2]}\n"),
    ("A2", "a: {b: !!float [1, 2]}\n"),
    ("A3", "a: {b: !!bool [1, 2]}\n"),
    ("A4", "a: {b: !!null [1, 2]}\n"),
    ("A5", "a: {b: !!int {x: 1, y: 2}}\n"),
    # b) the same shapes as a bare flow document
    ("B1", "{b: !!int [1, 2]}\n"),
    ("B2", "[!!int [1, 2]]\n"),
    # c) the block reader's own spelling of the same files
    ("C1", "b: !!int [1, 2]\n"),
    ("C2", "b: !!int {x: 1}\n"),
    # d) a tag on a plain scalar that the flow reader cuts at a comma
    ("D1", "a: {b: !!int 1, c: 2}\n"),
    ("D2", "a: {b: !!bool yes, c: 2}\n"),
    ("D3", "a: {b: !!str x, c: 2}\n"),
    ("D4", "a: [!!int 1, 2]\n"),
    # e) an alias and an anchor whose name is cut
    ("E1", "a: {b: &x 1, c: 2}\n"),
    ("E2", "a: &x {p: 1, q: 2}\nb: *x\n"),
    ("E3", "a: {&x 1, 2}\n"),
    # f) a key that is a collection, and one that is cut
    ("F1", "a: {b, c: 2}\n"),
    ("F2", "a: {b: 1, c: 2}\n"),
    # g) the messages that quote a whole line, not a node
    ("G1", "b c\n"),
    ("G2", "a: b c\n"),
    ("G3", "  a: 1\n b: 2\n"),
    # h) two tags, and a name given twice — these quote `rest`
    ("H1", "a: !!int !!float 1\n"),
    ("H2", "a: &x &y 1\n"),
    ("H3", "a: &x *y\n"),
    # i) an undefined alias inside a flow, for the control column
    ("I1", "a: {b: *nope}\n"),
    ("I2", "a: {b: *nope, c: 1}\n"),
    # j) the same cut where a *plain* flow scalar holds the collection, so the
    #    tag is not the only way in — `a: [1, 2] tail` and the two shapes beside it
    ("J1", "a: {b: [1, 2] c: 3}\n"),
    ("J2", "a: {b: !!int [1, 2], c: 3}\n"),
    ("J3", "a: {b: !!int [[1, 2], 3]}\n"),
    ("J4", "a: [!!float 1.5, 2]\n"),
    # k) a flow scalar holding a `{` that never closes, and one holding a comma
    ("K1", "a: {b: x, c: 2}\n"),
    ("K2", "a: {b: 'x, y', c: 2}\n"),
    ("K3", "a: {b: \"x, y\", c: 2}\n"),
    # l) the block reader's spelling of the same four tags on a collection
    ("L1", "b: !!float [1, 2]\n"),
    ("L2", "b: !!bool [1, 2]\n"),
    ("L3", "b: !!null {x: 1}\n"),
    ("L4", "b: !!str [1, 2]\n"),
    # m) a dedent that leaves a second key behind — the other class the table saw
    ("M1", "  a: 1\n b: 2\n"),
    ("M2", "a: 1\n  b: 2\n c: 3\n"),
    ("M3", "  - 1\n- 2\n"),
    # n) a key with no value, which is `null` in YAML and a whole other question
    ("N1", "a: {b, c: 2}\n"),
    ("N2", "a: {&x 1, 2}\n"),
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
    # `run` hands the pipeline one record at a time, so a document that is a
    # single mapping comes back as a list of one. Unwrapping it here is what lets
    # the column tell a real difference from the shape of the answer — without it
    # every mapping in the table reads as a difference and the table measures
    # nothing.
    return "reads " + json.dumps(r["data"], sort_keys=True)


def judge(text):
    try:
        return "reads " + json.dumps(yaml.safe_load(text), sort_keys=True)
    except yaml.YAMLError as err:
        return "refuses " + err.__class__.__name__ + ": " + str(err).split("\n")[0]


def same_value(tool, py):
    """Do the two readers hold the same data, once the record list is unwrapped?

    One document is a list of records: a mapping is a list holding it, a sequence
    is the list itself, a scalar is a list holding it. A document that is `None`
    or empty has no records at all.
    """
    t, p = json.loads(tool[6:]), json.loads(py[6:])
    if p is None:
        records = []
    elif isinstance(p, dict):
        records = [p]
    else:
        records = p if isinstance(p, list) else [p]
    return json.dumps(t, sort_keys=True) == json.dumps(records, sort_keys=True)


def quoted_spans(message):
    """Every run the message puts between straight double quotes."""
    return re.findall(r'"([^"]*)"', message)


def is_fragment(span, text):
    """True when the file continues past `span` with a flow delimiter.

    That is the cut `endsFlowNode` makes, and it is the whole difference between
    naming the value that stands there and naming a piece of it. A span the
    reader wrote out by hand — a tag, a line — never ends this way, because the
    thing it came from is a whole node or a whole line.
    """
    at = text.find(span)
    if at < 0:
        return False
    after = text[at + len(span):at + len(span) + 1]
    return after in (",", "]", "}")


rows = []
for name, text in CASES:
    tool = tool_error(text)
    py = judge(text)
    # A fragment only misleads when the reader is describing the file. A reading
    # quotes nothing, so a node that merely happens to be followed by a comma is
    # a whole node there, and testing it for one is how the table invents a
    # finding it has not got.
    cut = (
        [s for s in quoted_spans(tool) if s and is_fragment(s, text)]
        if tool.startswith("refuses")
        else []
    )
    if cut:
        verdict = "QUOTES-FRAGMENT"
    elif tool.startswith("refuses") != py.startswith("refuses"):
        verdict = "DIFFER"
    elif tool.startswith("refuses"):
        verdict = "ok"
    elif same_value(tool, py):
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
            "cut": cut,
        }
    )

for r in rows:
    print(f'{r["name"]:3} {r["verdict"]:16} {json.dumps(r["text"]):26}')
    print(f'{"":4} tool  = {r["tool"][:104]!r}')
    print(f'{"":4} pyyaml= {r["pyyaml"][:104]!r}')
    if r["cut"]:
        print(f'{"":4} quotes a piece of a node: {r["cut"]!r}')

bad = [r for r in rows if r["verdict"] != "ok"]
print(f"\n{len(bad)} of {len(rows)} are not ok")
for r in bad:
    print(f'  {r["name"]:3} {r["verdict"]:16} {json.dumps(r["text"]):26} -> {r["cut"]!r}')
