#!/usr/bin/env python3
"""Measure what a reader holding a licence key can actually be told.

The question T115's measurement left open: neither llms.txt nor llms-full.txt
names the product key, and the licence API requires it. So a language model —
or a person — asked "I have a key, how do I activate it?" has to guess the
`product` field, and a wrong guess is a 403 that says only "This licence key
is for another product."

Three questions, held apart the whole way, because the answers fail in
different ways and a rettelse that only moves a fact between two tables would
look like progress in one of them:

  KEY      which files publish the product key at all
  CALL     which files publish the parts of the call at all
  ANSWER   can a single file answer the question on its own

The third table is the only one that decides anything, and it is the reason the
first two exist: a fact can be present in a file the reader is never sent to,
and a link can be present in a file the reader cannot follow.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "tools" / "product-contract.json").read_text(encoding="utf-8"))
PRO = CONTRACT["desktop_pro"]

KEY = PRO["product_key"]
API = PRO["licence_api"]

# The files a reader with a key in hand plausibly lands on. robots.txt names the
# first of them; the rest are reached by following a link, which a language model
# cannot do.
FILES = [
    ("site/llms.txt", "named by robots.txt — a model is handed this one URL"),
    ("site/llms-full.txt", "linked as 'Optional' from llms.txt"),
    ("site/support/index.html", "the human page for buying, activating, troubleshooting"),
    ("site/da/support/index.html", "the same page in Danish"),
    ("site/index.html", "front page"),
    ("README.md", "npm page and GitHub front page"),
    ("docs/cli.md", "the full CLI reference"),
]

# The things the licence API needs, as the Stripe contract states them. A reader
# with a key needs all of them to make one call unaided. A needle is a tuple when
# a fact only counts as present if several strings are present together.
#
# First measurement run wrote ("activate endpoint", "activate", ...) and the CALL
# table came back "yes" for four files. Every one of the four was wrong: `activate`
# is ordinary English on a page that says "Paste the key and activate", and a bare
# word cannot tell a verb from a path segment. Second run asked for the joined
# address `.../license/activate` and produced the opposite error — llms.txt states
# the base and the three call names, which is the same information, and the table
# called it absent. So the call is asked for as base AND name, together: a word
# beside the address is a call, a word on a page that never names the address is
# prose.
NEEDED = [
    ("base url", (API,), "which host to send the request to"),
    ("activate call", (API, "activate"), "the one call that activates, named beside the address"),
    ("license_key field", ("license_key",), "the field the key goes in"),
    ("device_id field", ("device_id",), "the field that identifies the machine"),
    ("product key", (KEY,), "the value the API rejects with 403 if it is wrong"),
]


def read(rel):
    path = ROOT / rel
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def row(label, hit, note=""):
    return f"  {'yes' if hit else 'NO ':<3}  {label:<28} {note}"


def main():
    texts = {}
    print("KEY — which files publish the product key at all\n")
    for rel, why in FILES:
        text = texts.setdefault(rel, read(rel))
        if text is None:
            print(row(rel, False, "(file does not exist)"))
            continue
        hit = KEY in text
        print(row(rel, hit, why if not hit else ""))
    key_published = [rel for rel, _ in FILES if texts.get(rel) and KEY in texts[rel]]

    print("\n\nCALL — which files publish the parts of the call at all\n")
    for name, needle, why in NEEDED:
        holders = [rel for rel, _ in FILES if texts.get(rel) and all(n in texts[rel] for n in needle)]
        note = why if not holders else ", ".join(holders)
        print(row(name, bool(holders), note))
    call_complete = [rel for rel, _ in FILES if all(all(n in texts.get(rel, "") for n in needle) for _, needle, _ in NEEDED)]

    print("\n\nANSWER — can one file answer \"I have a key, how do I activate it?\" alone\n")
    for rel, why in FILES:
        text = texts.get(rel) or ""
        missing = [name for name, needle, _ in NEEDED if not all(n in text for n in needle)]
        if not text:
            print(f"  n/a   {rel:<28} (file does not exist)")
        elif not missing:
            print(f"  YES   {rel:<28} all {len(NEEDED)} parts present")
        else:
            print(f"  no    {rel:<28} missing: {', '.join(missing)}")

    print("\n\nWHERE THE KEY ACTUALLY LIVES\n")
    published = subprocess_grep()
    for rel in published:
        print(f"  {rel}")

    print(
        f"\nVERDICT: product key in {len(key_published)} of {len(FILES)} files; "
        f"a file that can answer the question on its own: {len(call_complete)}\n"
    )
    return 0


def subprocess_grep():
    """Every tracked file that mentions the key, so the answer cannot be a list
    this script wrote itself."""
    import subprocess

    out = subprocess.run(
        ["git", "grep", "-l", "-F", KEY, "--", "."],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return [line for line in out.stdout.splitlines() if line and line not in {".venv-site/**"}]


if __name__ == "__main__":
    sys.exit(main())
