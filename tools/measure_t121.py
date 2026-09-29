#!/usr/bin/env python3
"""Measure the pages the site shows a reader, and that no rule asks what they
are shaped like.

T120 closed a real accident: README.md named `## Publishing the site` twice,
eighteen lines apart, byte for byte identical, and the commit that wrote it had
been on GitHub and npmjs.com since the 27th. It fixed it by writing two rules,
and both of them open with `if (!file.endsWith('.md')) continue;`.

That guard was written for a Markdown reason — `#` is a comment inside a fence —
and it silently carried over to the twenty-three published HTML pages, which is
where the readers of this site actually arrive: the front page, the cheatsheet,
the ten guides, the two support pages, and the Danish front page. Nothing in the
gate reads whether any of them names a section twice or says the same paragraph
twice. This reads that guard rather than the bug it was written for, so the first
question is not "is there a duplicate" but "who is asked at all".

Three things are measured, and they are not the same thing:

  ENVELOPE  a published page, and whether any rule asks about its shape
  HEADINGS  a visible heading on one page that is written twice
  PROSE     a run of consecutive prose lines on one page that is printed twice
  NAMES     an `id` written twice on one page, and an `#anchor` that names nothing

ENVELOPE is coverage, HEADINGS and PROSE are correctness, and they are held
apart because they are separate repairs: widening the rules to HTML raises
nothing in HEADINGS, and fixing a duplicated section on one page covers nothing
in ENVELOPE.

NAMES is where the finding is, and it is asked in HTML's own vocabulary rather
than Markdown's. An `id` *is* a name: it is what `#count` resolves to, and a
document that holds one twice holds a name no link can reach. T120's rule
compared heading slugs because Markdown calls a heading's name a slug; on a page
the name is written down, which makes the same accident both cheaper to make and
easier to see. HEADINGS and NAMES are both kept, because they are not the same
question — a page can name two different elements "Gotchas", which is a
confusing outline, and hold one name twice, which is an unreachable anchor.

PROSE is asked of the *visible text* and not of the markup, because a block of
identical markup is a stylesheet or a template and a block of identical prose is
what a reader reads twice. Two false positives are removed before anything is
counted, and both are the mistake this repository's measurements have made most
often: reading something that is not prose as prose (`<head>` metadata, a
`class="note"` attribute, a `<pre>` shell example), and counting a repeat the
reader cannot see (the same footer on every page of a site is not a page that
prints its footer twice).

The needles are deliberately blunt. A page that is 3 % wrong in a way nobody
notices is not worth a rule; a page that shows a reader the same four sentences
twice is.
"""

import json
import re
import sys
from collections import Counter
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "tools" / "product-contract.json").read_text(encoding="utf-8"))

# Bounded by category, exactly as tools/measure_t120.py and the rule both do, and
# for the same reason: a walk of the repository finds `.venv-site/`'s Playwright
# install and its own Markdown, and a measurement that reads another project's
# documentation is a measurement nobody can believe.
def published_html():
    return sorted(p for p in (ROOT / "site").rglob("*.html") if p.is_file())


PAGES = published_html()

# Stripped before anything is read as text. `<head>` is metadata a reader never
# sees — the same `<meta name="description">` is on every page and is not a page
# that repeats itself. `<script>` and `<style>` are not prose in any language.
#
# `<pre>` goes with them, and it is the same reason the Markdown rules strip a
# fence: a shell example printed twice is a "before and after", and a `<pre>` is
# an example. The HTML is matched first so its contents are removed whole — the
# rule has to drop the block, not the tag, or the example's words are left behind
# as two orphan lines that no reader ever saw next to each other.
DROP = re.compile(
    r"<head\b.*?</head>|<pre\b.*?</pre>|<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->",
    re.S | re.I,
)

# A block boundary. One of these *closes*, so the prose before it is a line and
# the prose after it is the next one.
BLOCK_END = re.compile(
    r"</(?:p|div|li|h[1-6]|td|th|tr|section|aside|nav|header|footer|blockquote|"
    r"figcaption|dt|dd|ul|ol|table|main|article|summary|details)>\s*|<br\s*/?>",
    re.I,
)

# A heading. The tags inside it go; the words stay.
TAG = re.compile(r"<[^>]+>")
# A visible heading. `<h1>`..`<h4>` because the deepest a page on this site goes
# is a `<h3>`, and a `<h5>` is inside a card, not a section of the page.
HEADING = re.compile(r"<h([1-4])\b[^>]*>(.*?)</h\1>", re.S | re.I)


def visible(html):
    """The prose a reader sees, one line per block element.

    Splitting at *every* tag is the mistake this measurement made first: a
    paragraph with two links in it came back as three short fragments, so no two
    paragraphs were ever neighbours and the needle found three blocks on twenty-
    one pages. The line is the block element, not the text node — which is what
    a reader's eye calls a line too.
    """
    text = DROP.sub("\n", html)
    out = []
    for chunk in BLOCK_END.split(text):
        line = re.sub(r"\s+", " ", unescape(TAG.sub(" ", chunk))).strip()
        if line:
            out.append(line)
    return out


def slug(text):
    """A heading name compared the way a reader's outline compares it."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", "", unescape(text)).strip().lower()).strip()


def heading_rows():
    """Every visible heading on every page, with its page and where it stands."""
    rows = []
    for page in PAGES:
        raw = DROP.sub("\n", page.read_text(encoding="utf-8"))
        for match in HEADING.finditer(raw):
            name = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", match.group(2)))).strip()
            if name:
                rows.append((page.relative_to(ROOT).as_posix(), int(match.group(1)), name))
    return rows


ID = re.compile(r'\sid="([^"]+)"', re.I)
ANCHOR = re.compile(r'href="#([^"]+)"', re.I)


def prose_runs(lines, width=4, floor=60):
    """Consecutive runs of prose lines, `width` long or longer.

    `floor` is letters, not characters: a nav link and a breadcrumb are text,
    and a nav list repeats on every page by design, so a line has to be a
    sentence before it counts.
    """
    runs, current = [], []
    for line in lines:
        if len(re.sub(r"\W", "", line)) >= floor:
            current.append(line)
        else:
            if len(current) >= width:
                runs.append(current)
            current = []
    if len(current) >= width:
        runs.append(current)
    return runs


def main():
    rules = (ROOT / "tools" / "verify_contract.mjs").read_text(encoding="utf-8")
    guard = rules.count("endsWith('.md')) continue")

    print("== ENVELOPE: published pages, and whether a rule asks about their shape ==")
    print(f"{'page':52}  md-guarded")
    for page in PAGES:
        rel = page.relative_to(ROOT).as_posix()
        print(f"{rel:52}  {'skipped' if guard else 'read'}")
    print(f"\n{len(PAGES)} published pages, {guard} `endsWith('.md')) continue` guards in the gate")

    print("\n== HEADINGS: a visible heading written twice on one page ==")
    seen = {}
    dupes = 0
    for page, level, name in heading_rows():
        key = (page, slug(name))
        if key in seen:
            dupes += 1
            print(f"  {page}: {name!r} (h{level}) at line {seen[key]} and again")
        else:
            seen[key] = level
    total = len(heading_rows())
    print(f"\n{dupes} of {total} headings on {len(PAGES)} pages are written twice")

    print("\n== PROSE: the same run of prose printed twice on one page ==")
    runs_found = 0
    blocks = 0
    for page in PAGES:
        lines = visible(page.read_text(encoding="utf-8"))
        seen_block = {}
        for run in prose_runs(lines):
            blocks += 1
            block = "\n".join(run)
            if block in seen_block:
                runs_found += 1
                print(f"  {page.relative_to(ROOT).as_posix()}: "
                      f"{len(run)} lines from {run[0][:70]!r} printed again")
            else:
                seen_block[block] = True
    print(f"\n{runs_found} of {blocks} blocks of {4}+ prose lines are printed twice on their own page")

    print("\n== NAMES: an id written twice on a page, and an #anchor that names nothing ==")
    names = twice = dead = 0
    for page in PAGES:
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(ROOT).as_posix()
        counts = Counter(ID.findall(text))
        for name, n in counts.items():
            names += 1
            if n > 1:
                twice += 1
                print(f"  {rel}: id={name!r} is written {n} times")
        held = set(counts)
        for frag in ANCHOR.findall(text):
            if frag not in held:
                dead += 1
                print(f"  {rel}: href=#{frag} names nothing on this page")
    print(f"\n{names} ids on {len(PAGES)} pages, {twice} written twice, {dead} #anchors that name nothing")

    return 0 if (guard and not dupes and not runs_found and not twice and not dead) else 1


if __name__ == "__main__":
    sys.exit(main())
