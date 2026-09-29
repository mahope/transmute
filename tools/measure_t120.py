#!/usr/bin/env python3
"""Measure the two documents the gate opens for their claims but not for their
shape: README.md and docs/cli.md.

T114 wrote the rule that follows every address the site publishes, and its own
note ended by naming its own reach: it reads `site/`. The two files a reader is
most likely to be holding — the README on GitHub and on npmjs.com, and the
reference the CLI itself points to — publish addresses too, and nothing follows
them. This reads that note rather than the rule, so the first question is not
"does the address rule work" but "who else publishes an address at all".

Two things are measured, and they are not the same thing:

  ENVELOPE  a file that publishes an address, and whether the rule follows it
  STRUCTURE a section of a public document named twice, and a block of lines
             printed twice

The first is a coverage question and the second is a correctness one, and they
are held apart because a rule that covers more files and a file that is more
correct are separate repairs: fixing the duplicate in README.md raises nothing
in ENVELOPE, and widening the address rule finds nothing in STRUCTURE.

The needle in STRUCTURE is a *block*, not a heading. A document that prints the
same eighteen lines twice has one duplicated heading, but a document that
prints the same paragraph twice under two different headings has none, and the
second is the more common accident once a section is written in a hurry. So the
question is asked of consecutive runs of non-trivial lines, which finds both.

Fenced code is stripped before anything is read as a heading or a line: a
`# comment` in a shell example is not a section, and a line of shell inside a
fence is not a paragraph printed twice. Counting those is the mistake this
repository's measurements have made most often.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "tools" / "product-contract.json").read_text(encoding="utf-8"))
SITE = CONTRACT["site_url"].rstrip("/")

# Every published file, by the same three categories the rule uses: the public
# Markdown at the root, everything under docs/, and everything the site
# publishes. The implementation plan is a log, not a document, and is left out —
# for the same reason it is left out of the rule, so the two agree. Bounded by
# category rather than by walking the tree: a walk finds `.venv-site/`, which
# holds a Playwright install with its own Markdown, and a rule that reads another
# project's documentation is a rule that cannot be believed.
def published():
    files = sorted(ROOT.glob("*.md"))
    files += sorted((ROOT / "docs").rglob("*.md"))
    files += sorted(p for p in (ROOT / "site").rglob("*") if p.suffix in {".html", ".txt", ".xml"} and p.is_file())
    return [p for p in files if p.name != "IMPLEMENTATION_PLAN.md"]


PUBLIC = published()

# The four the address rule follows today, read out of tools/verify_contract.mjs
# rather than repeated here, so this measurement cannot drift from the rule it
# is measuring.
RULE_SOURCE = (ROOT / "tools" / "verify_contract.mjs").read_text(encoding="utf-8")
ADDRESS_FILES_DECL = re.search(r"const ADDRESS_FILES = \[(.*?)\];", RULE_SOURCE, re.S)
FOLLOWED = set(re.findall(r"'([^']+)'", ADDRESS_FILES_DECL.group(1))) if ADDRESS_FILES_DECL else set()

FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


def unfenced(text):
    """The document with every fenced block removed, line for line.

    Returns (lines_outside_fences, in_fence_flags) so a caller can tell a
    section from a comment in a shell example.
    """
    out, fence = [], None
    for line in text.splitlines():
        marker = FENCE.match(line)
        if fence:
            if marker and line.strip().startswith(fence):
                fence = None
            continue
        if marker:
            fence = line.strip()[:3]
            continue
        out.append(line)
    return out


def slug(text):
    s = re.sub(r"[`*_\[\]()]", "", text.strip().lower())
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"\s+", "-", s)


def addresses(text):
    """Every address the site publishes, whole and as a sitemap entry."""
    pattern = re.escape(SITE) + r"""[^\s)\]"'><]*[A-Za-z0-9/]"""
    return sorted({m.group(0) for m in re.finditer(pattern, text)} | set(re.findall(r"<loc>([^<]+)</loc>", text)))


def to_file(url, site):
    """The file under site/ an address names, the way the rule resolves it.

    /try/ is try.html and /cheatsheet/ is cheatsheet/index.html, so the shape of
    the address does not say which one a page lives as.
    """
    path = url.split("#")[0].split("?")[0][len(site):]
    if not path or path == "/":
        return "index.html"
    relative = path.strip("/")
    if (ROOT / "site" / (relative + ".html")).exists():
        return relative + ".html"
    if relative.endswith("/") or not re.search(r"\.[a-z0-9]+$", relative, re.I):
        return relative + "/index.html"
    return relative


def blocks(lines, minimum=4):
    """Consecutive runs of non-trivial lines, keyed by their own text."""
    runs, current = [], []
    for line in lines:
        if line.strip() and line.strip() not in {"|", "```", "---", "==="}:
            current.append(line.rstrip())
        else:
            if len(current) >= minimum:
                runs.append(current)
            current = []
    if len(current) >= minimum:
        runs.append(current)
    return runs


print("=" * 78)
print("ENVELOPE — a published file that publishes an address, and who follows it")
print("=" * 78)
print(f"{'file':<34} {'addresses':>9}  {'followed before':>16}  {'resolves':>9}")
envelope = 0
blind_ok = 0
resolves = 0
for path in PUBLIC:
    found = addresses(path.read_text(encoding="utf-8"))
    if not found:
        continue
    rel = path.relative_to(ROOT).as_posix()
    name = rel[len("site/"):] if rel.startswith("site/") else None
    followed_before = name is not None and name in FOLLOWED
    broken = [u for u in found if not (ROOT / "site" / to_file(u, SITE)).exists()]
    if not followed_before:
        envelope += 1
        if not broken:
            blind_ok += 1
    if not broken:
        resolves += 1
    print(f"{rel:<34} {len(found):>9}  {('yes' if followed_before else 'NO'):>16}  {('yes' if not broken else str(len(broken)) + ' broken'):>9}")
    for url in found[:3]:
        print(f"    {url}")
    if len(found) > 3:
        print(f"    … and {len(found) - 3} more")
    for url in broken:
        print(f"    DEAD: {url}")
print(f"\n  published files publishing an address, none of which the old rule followed: {envelope}")
print(f"  of those {envelope}, files whose every address resolves: {blind_ok} of {envelope}")
print(f"  (of {len(PUBLIC)} published files; the implementation plan and .venv-site/ are not published documents)")

print()
print("=" * 78)
print("STRUCTURE — a section named twice, and a block printed twice")
print("=" * 78)
structure = 0
for path in PUBLIC:
    if path.suffix != ".md":
        continue
    rel = path.relative_to(ROOT).as_posix()
    lines = unfenced(path.read_text(encoding="utf-8"))

    headings = [slug(m.group(2)) for m in (HEADING.match(l) for l in lines) if m]
    seen, dup_headings = set(), []
    for name in headings:
        if name in seen and name not in dup_headings:
            dup_headings.append(name)
        seen.add(name)

    runs = blocks(lines)
    counts = {}
    for run in runs:
        counts.setdefault("\n".join(run), []).append(run)
    dup_blocks = [k for k, v in counts.items() if len(v) > 1]

    if dup_headings or dup_blocks:
        structure += len(dup_headings) + len(dup_blocks)
        print(f"\n{rel}: {len(headings)} sections, {len(runs)} blocks")
        for name in dup_headings:
            first = next(i for i, l in enumerate(lines) if HEADING.match(l) and slug(HEADING.match(l).group(2)) == name)
            again = next(i for i, l in enumerate(lines[first + 1:], first + 1) if HEADING.match(l) and slug(HEADING.match(l).group(2)) == name)
            print(f"  section named twice: {name!r} at lines {first + 1} and {again + 1}")
        for key in dup_blocks:
            first = next(i for i, run in enumerate(runs) if "\n".join(run) == key)
            length = len(runs[first])
            print(f"  block printed {len(counts[key])}×: {length} lines, first {length} shown, starting \"{runs[first][0].strip()[:60]}\"")
print(f"\n  duplicated sections and blocks, in total: {structure}")

print()
print("=" * 78)
print("SUMMARY")
print("=" * 78)
print(f"  ENVELOPE files the rule could not see ... {envelope}")
print(f"  STRUCTURE duplicates ........ {structure}")
sys.exit(0)
