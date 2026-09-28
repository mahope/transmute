import json, os, subprocess, sys, yaml

ENGINE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "engine.js")

CASES = [
    # test/test.js:5226 - the block that says a stray bracket stays text
    ("A1", "a: {b\n"),
    ("A2", "a: [1\n"),
    ("A3", "- {a\n"),
    # test/test.js:5336-5343 - the block after the colon-in-a-flow-scalar table
    ("B1", "a: {b: c: d}\n"),
    ("B2", "a: {b: 1: }\n"),
    ("B3", "a: {b: x:}\n"),
    ("B4", "a: {x, y}\n"),
    ("B5", "a: {b\n"),
    ("B6", "a: [1\n"),
    # the same two shapes in the root and on a sequence entry
    ("C1", "{b: 1\n"),
    ("C2", "[1, 2\n"),
    ("C3", "{b: 1 c: 2}\n"),
    ("C4", "a: [1, 2\nb: 3\n"),
    ("C5", "- [1, 2\n- 3\n"),
    ("C6", "a: {b: 1\nc: 3\n"),
]


def judge(text):
    try:
        return ("reads", json.dumps(yaml.safe_load(text), sort_keys=True))
    except yaml.YAMLError as err:
        return ("refuses", err.__class__.__name__ + ": " + str(err).split("\n")[0])


out = []
for name, text in CASES:
    proc = subprocess.run(
        ["node", "-e",
         "const e=require(process.argv[1]);"
         "let t='';process.stdin.on('data',d=>t+=d)"
         ".on('end',()=>console.log(JSON.stringify(e.run(t,'yaml'))));", ENGINE],
        input=text, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        tool = ("crash", proc.stderr.strip().split("\n")[-1])
    else:
        r = json.loads(proc.stdout)
        if r.get("error"):
            tool = ("refuses", r["error"])
        else:
            tool = ("reads", json.dumps(r["data"], sort_keys=True))
    out.append({"name": name, "text": text, "pyyaml": judge(text), "tool": tool})

for row in out:
    pv, tv = row["pyyaml"], row["tool"]
    if pv[0] != tv[0]:
        verdict = "DIFFER"            # one reads it, one refuses it
    elif pv[0] == "refuses":
        # Both refuse, so the file is broken either way. The two wordings are not
        # compared: PyYAML wraps its message in a ParserError block and this
        # reader says the same thing in a sentence.
        verdict = "REFUSE-BOTH"
    elif pv[1] == tv[1]:
        verdict = "AGREE"
    else:
        verdict = "DIFFER-VALUE"      # both read it, and they read different things
    row["verdict"] = verdict
    print(f'{row["name"]:3} {verdict:13} {json.dumps(row["text"]):22} '
          f'pyyaml={pv[1][:58]!r}')
    print(f'{"":17} tool  ={tv[1][:58]!r}')

bad = [r for r in out if r["verdict"] != "AGREE"]
print(f'\n{len(bad)} of {len(out)} not agreed on; {len(out) - len(bad)} agree')
for row in bad:
    print(f'  still different: {row["name"]:3} {json.dumps(row["text"])}')
