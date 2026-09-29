#!/usr/bin/env python3
"""Measure what the public prose denies about the five readers T114 never asked.

T114 bound a sentence to the parser: it reads six YAML shapes through the
committed `run()`, and a shape the engine really reads may not be denied
anywhere in the public prose. That rule found four pages saying the tool cannot
do what it had been able to do for twenty iterations, and it was written for
exactly one format, because YAML is the format those twenty iterations were
about.

The other five readers were never asked. `docs/cli.md` is 3 000 lines long, it
is the address the CLI itself prints, and it is rendered on npmjs.com — it is
the second most-read document in this repository and the one with the fewest
questions asked of it. Nothing in the gate reads whether it denies a CSV
delimiter, an XML attribute or a JSON nesting that the engine reads today.

Two things are measured, and they are not the same thing:

  READER   a shape, and whether the committed engine can read it
  DENIAL   a public file that says it cannot

READER comes first and it is the honest half: a shape the engine refuses may be
denied in prose without anyone lying. Only a shape that comes back is offered to
the second half, which is what stops the rule from condemning a sentence about a
format feature nobody implemented.

The needles are T114's, unchanged on purpose. A denial has to sit next to the
name it denies, because "no network calls" and "no dependencies" are true of
every format and a rule that read them would condemn the whole document.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# One row per shape: the format it is written in, the file, the words a writer
# would use for it, and the sentences where denying it is true rather than a
# lie. `unless` is the named exemption — a reason the reader can act on.
SHAPES = [
    # --- YAML: T114's six, kept as the control row for this table ------------
    dict(fmt='yaml', text='d: &d\n  a: 1\nc: *d\n', name='anchors and aliases',
         words=r'anchors?\b|\balias(?:es)?\b'),
    dict(fmt='yaml', text='v: |\n  a\n  b\n', name='block scalars',
         words=r'block scalars?\b|multi-?line (?:string|value)'),
    dict(fmt='yaml', text='v: {a: 1, b: [2, 3]}\n', name='flow collections',
         words=r'flow (?:collection|mapping|sequence|node)',
         unless=r'escapes? invalid|hand-building'),
    dict(fmt='yaml', text='a: !!str 7\n', name='tags on values',
         words=r'tags?\b', unless=r'in a (?:key|field name)|resolve[s]? tags?\b|tag prefix'),

    # --- CSV -----------------------------------------------------------------
    dict(fmt='csv', text='a,b\n"x,y",2\n', name='a quoted field with a comma in it',
         words=r'quoted (?:field|value|cell|column)s?'),
    dict(fmt='csv', text='a,b\n"x\ny",2\n', name='a quoted field with a newline in it',
         words=r'(?:embedded|multi-?line) (?:newlines?|line breaks?)'),
    dict(fmt='csv', text='a;b\n1;2\n', name='semicolon and tab and pipe delimiters',
         words=r'alternative (?:delimiters?|separators?)|other delimiters?|semicolons?'),
    dict(fmt='csv', text='# hi\na,b\n1,2\n', name='comment lines',
         words=r'comment lines?'),
    dict(fmt='csv', text='a,b\n1,2,3\n', name='rows with more fields than the header',
         words=r'uneven rows?|ragged rows?|rows with (?:more|fewer) (?:fields|columns)'),
    dict(fmt='csv', text='a,b\n1,2\n', name='a headerless file',
         words=r'headerless|without a header|no header'),

    # --- JSON ----------------------------------------------------------------
    dict(fmt='json', text='{"a": {"b": [1, {"c": 2}]}}\n', name='objects nested in objects',
         words=r'deeply nested|nesting|nested (?:objects?|maps?|dictionaries)'),
    dict(fmt='json', text='[{"a": 1}, {"a": 2}]\n', name='a top-level array',
         words=r'top-?level array|array at the top'),
    dict(fmt='json', text='{"a": "x"}\n', name='a name that is only quoted digits',
         words=r'quoted (?:keys?|names?)|numeric (?:keys?|names?|columns?)'),

    # --- XML -----------------------------------------------------------------
    dict(fmt='xml', text='<r><a k="v">1</a></r>\n', name='attributes',
         words=r'\battributes?\b'),
    dict(fmt='xml', text='<r><a><![CDATA[x < y]]></a></r>\n', name='CDATA sections',
         words=r'CDATA'),
    dict(fmt='xml', text='<r xmlns="urn:x"><a>1</a></r>\n', name='namespaces',
         words=r'namespaces?|xmlns'),
    dict(fmt='xml', text='<r><a>1</a><a>2</a></r>\n', name='a repeated element name',
         words=r'repeated elements?|elements? with the same name'),

    # --- output: the two formats that only exist as an answer ----------------
    dict(fmt='json', text='[{"a": 1}]\n', name='a text table as output',
         words=r'(?:only|just) (?:reads?|takes?|accepts?) (?:files?|input)',
         unless=r'one file at a time|reads one file'),
]


def read_with_engine(fmt, text):
    """Ask the committed engine, through the same entry point the CLI uses."""
    script = (
        "const e=require('./src/engine.js');"
        "try{const out=e.run(process.argv[1], process.argv[2], [], 'json');"
        "const ok=Array.isArray(out.data)?out.data.length>0:out.data!==null&&out.data!==undefined;"
        "console.log(JSON.stringify({ok}));}catch(err){console.log(JSON.stringify({ok:false,msg:String(err&&err.message||err)}));}"
    )
    done = subprocess.run(
        ['node', '-e', script, text, fmt],
        cwd=ROOT, capture_output=True, text=True, timeout=30,
    )
    if done.returncode != 0:
        return False, done.stderr.strip()[:80]
    return json.loads(done.stdout)['ok'], ''


def public_files():
    files = [ROOT / 'README.md']
    files += sorted((ROOT / 'docs').glob('*.md'))
    files += sorted((ROOT / 'site').rglob('*.html'))
    files += sorted((ROOT / 'site').rglob('*.txt'))
    return [f for f in files if f.exists()]


# T114's sentence splitter: a sentence ends at a full stop, a newline or a
# closing block tag, because a cheat-sheet page is one long line of markup.
SENTENCES = re.compile(r'(?<=[.!?])\n?|(?=</(?:p|li|h2|h3|h4|dd|td|section)>)')

SUPPORT_DENIAL = re.compile(r'not supported|unsupported|no support for', re.I)


def denials(path):
    """Sentences in one file that deny one of the readable shapes."""
    text = path.read_text(encoding='utf8')
    found = []
    for sentence in SENTENCES.split(text):
        if not SUPPORT_DENIAL.search(sentence) and not re.search(r'\b(?:does|do)\s+not\b|\bcannot\b|\bcan\'t\b|\bnever\b', sentence, re.I):
            continue
        found.append(re.sub(r'<[^>]+>', ' ', sentence).strip())
    return found


def main():
    files = public_files()
    print(f'ENVELOPE: {len(files)} public files\n')

    readable, refused = [], []
    for shape in SHAPES:
        ok, msg = read_with_engine(shape['fmt'], shape['text'])
        (readable if ok else refused).append((shape, msg))

    print(f'READER: {len(SHAPES)} shapes asked of the committed engine, '
          f'{len(readable)} readable, {len(refused)} refused\n')
    table = {}
    for shape, _ in readable:
        table.setdefault(shape['fmt'], []).append(shape['name'])
    for fmt in sorted(table):
        print(f'  {fmt:<5} {len(table[fmt])} readable')
    for shape, msg in refused:
        print(f'  refused: {shape["fmt"]} — {shape["name"]} ({msg})')

    hits = 0
    print()
    for path in files:
        sentences = denials(path)
        if not sentences:
            continue
        for sentence in sentences:
            for shape, _ in readable:
                if not re.search(shape['words'], sentence, re.I):
                    continue
                if shape.get('unless') and re.search(shape['unless'], sentence, re.I):
                    continue
                before = re.search(r"\b(?:not|never|without|un)\s+(?:supported:?\s*)?(?:\w+\s+)?(?:%s)" % shape['words'], sentence, re.I)
                after = re.search(r"(?:%s)[\w\s,'’/&-]{0,40}?\bnot\s+(?:supported|read|handled|parsed|implemented|resolved|understood)\b" % shape['words'], sentence, re.I)
                if before or after:
                    hits += 1
                    rel = path.relative_to(ROOT)
                    print(f'DENIAL: {rel} denies {shape["name"]}')
                    print(f'         "{sentence[:150]}"')

    print(f'\nDENIAL: {hits} sentence(s) across {len(files)} files')
    return 0


if __name__ == '__main__':
    sys.exit(main())
