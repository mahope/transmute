#!/usr/bin/env python3
"""Measure which files the site can hand a language model, and what each can answer.

T115 bound the price to the file robots.txt names. T116 bound the product key and
the licence API address to the same file. Point 116's (a) is the reach of that
rule: it asks the one file the pointer names, and `llms-full.txt` — the other
file a model can be handed — has 0 of the 5 parts of the call, with nothing
enforcing it.

Three questions, held apart the whole way, for the same reason as T116: a
repair that only moves a fact from one table to another looks like progress in
one of them and changes nothing for the reader.

  REACH    which files can a model be handed at all, and by what pointer
  FACTS    which of the locked facts each of those files states
  ANSWER   can a single file answer the buyer's two questions on its own

REACH is the table that decides the rule. FACTS and ANSWER say what has to be
added; REACH says which files the rule may name, and naming them by hand is the
thing T115's rule deliberately avoided — a file list is a rule that goes green
the moment the site publishes somewhere else.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "tools" / "product-contract.json").read_text(encoding="utf-8"))
PRO = CONTRACT["desktop_pro"]

KEY = PRO["product_key"]
API = PRO["licence_api"]
LINK = PRO["payment_link"]
SITE = CONTRACT["site_url"]

# Every file a model can be sent to, and the pointer that sends it there. The
# first is a pointer written by hand in robots.txt; the second is reached by
# following llms.txt's own "Optional" list, which a model cannot follow but a
# crawler and a person can.
POINTERS = [
    ("site/robots.txt", "# Guidance for language models: …", "handed the URL, answers from the text"),
    ("site/llms.txt", "named by that comment", "handed the URL, answers from the text"),
    ("site/llms-full.txt", "linked as 'Optional' from llms.txt", "a model given the full file directly"),
]

# The convention the ecosystem reads by: llmstxt.org says /llms.txt is the index
# and /llms-full.txt is the whole text. So a site publishes files by *shape*, and
# a rule that names files by hand goes green the day the site adds llms-de.txt.
CONVENTION = re.compile(r"^llms[A-Za-z0-9-]*\.txt$")

# The two questions a buyer with a key in hand asks, and what each needs.
QUESTIONS = [
    (
        "what does Desktop Pro cost",
        [
            ("payment link", (LINK,), "the only link that works"),
            ("price", (str(PRO["amount"]),), "the contract locks it"),
            ("machines", (str(PRO["machines"]),), "19 USD is per machine, not per seat"),
        ],
    ),
    (
        "how do I activate the key I bought",
        [
            ("base url", (API,), "which host to send the request to"),
            ("activate call", (API, "activate"), "the call that activates, named beside the address"),
            ("license_key field", ("license_key",), "the field the key goes in"),
            ("device_id field", ("device_id",), "the field that identifies the machine"),
            ("product key", (KEY,), "the value a wrong guess is refused with 403 for"),
        ],
    ),
]

# The facts the site has to be able to state somewhere, counted across every file
# it publishes that a model can reach — including the HTML a crawler can read.
CRAWLED = [
    "site/support/index.html",
    "site/da/support/index.html",
    "site/index.html",
    "README.md",
    "docs/cli.md",
]


def read(rel):
    path = ROOT / rel
    return path.read_text(encoding="utf-8") if path.exists() else None


def row(label, hit, note=""):
    return f"  {'yes' if hit else 'NO ':<3}  {label:<28} {note}"


def main():
    site = ROOT / "site"

    print("REACH — which files can a model be handed, and by what pointer\n")
    named = []
    for rel, pointer, why in POINTERS:
        text = read(rel)
        exists = text is not None
        print(row(rel, exists, f"via {pointer} — {why}" if not exists else ""))
        if exists:
            named.append(rel)

    convention = sorted(
        p.name for p in site.iterdir() if p.is_file() and CONVENTION.match(p.name)
    )
    hand_written = {rel.split("/")[-1] for rel in named}
    unlisted = [n for n in convention if n not in hand_written]
    print(f"\n  the site's files by the llms.txt convention: {', '.join(convention)}")
    print(f"  of those, nothing in the rule names: {', '.join(unlisted) or '(none)'}")

    print("\n\nFACTS — what each of those files states\n")
    texts = {rel: read(rel) or "" for rel in named}
    for question, facts in QUESTIONS:
        print(f"  {question}")
        for rel in named:
            have = [name for name, needle, _ in facts if all(n in texts[rel] for n in needle)]
            missing = [name for name, needle, _ in facts if name not in have]
            mark = "all" if not missing else "missing: " + ", ".join(missing)
            print(f"    {rel:<24} {len(have)} of {len(facts)}  {mark}")
        print()

    print("ANSWER — can one file answer both questions on its own\n")
    for rel in named:
        answered = []
        for _, facts in QUESTIONS:
            answered.append(
                all(all(n in texts[rel] for n in needle) for _, needle, _ in facts)
            )
        verdict = (
            "answers both" if all(answered)
            else "answers " + ", ".join(
                q for (q, _), ok in zip(QUESTIONS, answered) if ok
            ) or "neither"
        )
        print(f"  {row(rel, all(answered), verdict)}")

    print("\n\nWHERE THE FIVE PARTS LIVE ANYWHERE IN THE REPO\n")
    for name, needle, _ in QUESTIONS[1][1]:
        hits = git_grep(needle[0])
        print(f"  {name:<20} {', '.join(hits) or '(nowhere)'}")

    print("\n\nCRAWLED HTML — what a crawler that can follow links reaches\n")
    for rel in CRAWLED:
        text = read(rel)
        if text is None:
            print(row(rel, False, "(missing)"))
            continue
        have = sum(
            1
            for _, facts in QUESTIONS
            for _, needle, _ in facts
            if all(n in text for n in needle)
        )
        total = sum(len(facts) for _, facts in QUESTIONS)
        print(row(rel, have == total, f"{have} of {total} facts"))

    print(
        f"\nVERDICT: {len(named)} files can be handed a model; "
        f"{sum(1 for rel in named if all(all(n in texts[rel] for n in needle) for _, facts in QUESTIONS for _, needle, _ in facts))} "
        f"can answer both questions alone; {len(unlisted)} file(s) by the convention nothing in the rule names\n"
    )
    return 0


def git_grep(needle):
    out = subprocess.run(
        ["git", "grep", "-l", "-F", needle, "--", "."],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return [line for line in out.stdout.splitlines() if line and not line.startswith(".venv-site")]


if __name__ == "__main__":
    sys.exit(main())
