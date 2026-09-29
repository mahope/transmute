#!/usr/bin/env python3
"""Measure what the public prose answers when a documented file is not there.

T122 bound `docs/cli.md`'s own commands to the suite: the page reads each
command off itself and runs it, so a block that is not what the tool prints
turns the gate red. The commands it could bind are the ones that name a file
this repository ships. The rest name a file the reader is supposed to have —
`people.csv`, `customers.csv`, `orders.json` — and those were excluded with a
comment in the test.

The exclusion is the finding. It is the first command on the page, and a reader
who types it on a machine without that file gets one line on stderr and exit 3.
The page has 3 130 lines of exact output, every other error class is written out
verbatim, and this one is not written anywhere.

Three things are measured, and they are kept apart on purpose. A rule that only
looked at the file would not see the difference between a command the suite can
run and a command it cannot, and a fix that moved a sentence from one section
to another would look like progress in one table and do nothing for the reader:

  INPUT     a documented command, and whether this repository ships the file it reads
  ANSWER    what the tool prints when that file is not there
  PROMISE   what the page says about the commands the suite cannot run

INPUT is first and it is the honest half: a command reading a shipped fixture is
bound by T122's test whether anyone looks here or not. Only the unbound half is
offered to the second table, which is what stops the rule from demanding an
answer for a file the repository has.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The two spellings the page itself uses. Anything else in a fence is prose the
# page wraps in a shell block — `iconv`, `git clone`, `node -e` — and naming a
# file there is not a command the reader runs against their data.
BINARIES = re.compile(r'^(?:npx @mahope/transmute|transmute|node src/cli\.js) ')

# The engine's own reading of a file extension. A positional that does not end
# in one of these is a flag, a shell word or a path the page builds earlier.
DATA = re.compile(r'\.(?:csv|tsv|json|jsonl|ndjson|ya?ml|xml|txt)$', re.I)


def public_files():
    files = [ROOT / 'README.md']
    files += sorted((ROOT / 'docs').glob('*.md'))
    files += sorted((ROOT / 'site').rglob('*.html'))
    files += sorted((ROOT / 'site').rglob('*.txt'))
    return [f for f in files if f.exists()]


def commands(text):
    """Every command the page spells out, with the fence it sits in.

    A command is a line that starts with one of the page's two binary names.
    A backslash continues it onto the next line, because two of them are.
    """
    out = []
    for block in re.finditer(r'```bash\n(.*?)```', text, re.S):
        current = None
        for line in block.group(1).split('\n'):
            line = line.strip()
            if BINARIES.match(line):
                current = line
                out.append({'command': line, 'fence': block.start()})
            elif current is not None and line.endswith('\\'):
                current = current[:-1].rstrip() + ' ' + line[:-1].rstrip()
                out[-1]['command'] = current
    return out


def read_file_of(command):
    """The positional file a command reads: the word right after the binary.

    Not "the first word that is not a flag" — that is `--out top.json`'s value
    when the command puts the input somewhere else, and a measurement that
    calls an output file the input is a measurement of nothing.
    """
    rest = BINARIES.sub('', command)
    # The binary name is quoted or prefixed in a shell block; everything up to
    # the first space is the binary.
    first = rest.split(None, 1)[0] if rest.split() else ''
    return first if DATA.search(first) else None


def missing_file_answer():
    """What the committed tool prints for a file that is not there."""
    done = subprocess.run(
        ['node', str(ROOT / 'src' / 'cli.js'), 'not-a-file.csv', '-o', 'json'],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    return done.stderr.strip(), done.returncode


# The page's own promise, read as the sentence it is. "every command on this
# page" is a claim about coverage, and the question is not whether it is kind
# but whether the page says which commands the suite skips.
PROMISE_SECTION = re.compile(r'## Keeping this page honest(.*?)(?=\n## |\Z)', re.S)
CLAIM = re.compile(r'every command on this page|all (?:of )?the (?:commands|examples)', re.I)
# A sentence that names the excluded set: the file the reader brings, the words
# "your own", the words "cannot be run".
EXCLUSION = re.compile(r'your own file|file you (?:have|bring)|the reader\'s own|'
                       r'cannot be run|not run by|no fixture|shipped fixture|'
                       r'only (?:the )?commands that', re.I)

SENTENCE = re.compile(r'(?<=[.!?])\s')


def sentences(text):
    """Sentences with the line wrapping taken out first.

    The claim sits in a numbered list, and the page wraps at 80 columns, so
    "every command on this" ends one line and "page" starts the next. Split on
    the line break and the claim is two sentences and neither of them is it —
    a needle that cannot see a wrapped phrase finds nothing, and "found nothing"
    is the answer a measurement gives when it is wrong.
    """
    return SENTENCE.split(re.sub(r'\s+', ' ', text))


def main():
    files = public_files()
    print(f'ENVELOPE: {len(files)} public files\n')

    message, code = missing_file_answer()
    print(f'TOOL: `transmute not-a-file.csv -o json` prints, exit {code}:')
    print(f'  {message}\n')

    # --- INPUT -------------------------------------------------------------
    table = {}
    unbound = []
    for path in files:
        if path.suffix not in ('.md', '.txt'):
            continue
        text = path.read_text(encoding='utf8')
        for entry in commands(text):
            name = read_file_of(entry['command'])
            if name is None:
                continue
            row = (str(path.relative_to(ROOT)), entry['command'], name)
            table.setdefault('shipped' if (ROOT / name).exists() else 'reader', []).append(row)
            if not (ROOT / name).exists():
                unbound.append(row)

    print(f'INPUT: {len(table.get("shipped", [])) + len(table.get("reader", []))} documented commands '
          f'name a file they read')
    print(f'  {len(table.get("shipped", []))} read a file this repository ships — bound by T122\'s test')
    print(f'  {len(unbound)} read a file only the reader has — bound by nothing\n')

    # --- ANSWER ------------------------------------------------------------
    # The needle is the tool's own sentence, not a word a writer would reach
    # for. "does not exist" would also match a page talking about something
    # else entirely, and the message is what the reader is looking at.
    hits = 0
    print('ANSWER: does a public file show what the tool prints for a file that is not there?')
    for path in files:
        text = path.read_text(encoding='utf8')
        if 'File not found' in text:
            hits += 1
            for line in text.split('\n'):
                if 'File not found' in line:
                    print(f'  {path.relative_to(ROOT)}: {line.strip()[:120]}')
    if not hits:
        print('  nothing. The message above appears in no public file.\n')

    # --- PROMISE -----------------------------------------------------------
    # Two questions, because the fix could have gone either way: the false
    # claim is gone, and the page says what the suite skips instead. A page that
    # only dropped the claim would pass the first and fail the second, and that
    # is the version where the reader is told nothing at all.
    promises = claims = excused = named = 0
    print('PROMISE: the page\'s coverage claim, and whether it names what it skips')
    for path in files:
        if path.suffix != '.md':
            continue
        text = path.read_text(encoding='utf8')
        for section in PROMISE_SECTION.findall(text):
            for sentence in sentences(section):
                if CLAIM.search(sentence):
                    promises += 1
                    if EXCLUSION.search(sentence):
                        excused += 1
                        print(f'  {path.relative_to(ROOT)}: claims coverage and names the exception — "{sentence.strip()[:110]}"')
                    else:
                        claims += 1
                        print(f'  {path.relative_to(ROOT)}: claims coverage with no exception — "{sentence.strip()[:110]}"')
            if EXCLUSION.search(re.sub(r'\s+', ' ', section)):
                named += 1
                print(f'  {path.relative_to(ROOT)}: names the set the suite cannot run')
    print()
    print(f'PROMISE: {claims} unqualified claim(s), {excused} qualified, {named} file(s) name the skip, '
          f'{len(unbound)} commands skip')
    return 0


if __name__ == '__main__':
    sys.exit(main())
