#!/usr/bin/env python3
"""Measure what each public file promises its reader, against what it delivers.

T117 ended with a table nobody had read: five files a crawler can reach, scored
out of eight facts, at 3, 3, 3, 3 and 2. Read straight, that says five files are
half wrong. Measured, the eight facts are not one question — they are two, asked
of two different readers:

  * a reader who has **decided to buy** needs the price, the machine count and a
    path to the button;
  * a reader whose **key was refused** needs to know which product this one is,
    because the one licence failure they cannot fix alone is a 403.

Scoring one file against both makes the wrong files look broken and hides the one
that is. So this measure asks, per file, which reader the file has — and scores
each file only against the facts that reader needs.

Three questions, held apart the whole way, for the reason the last three
iterations have: a repair that only moves a fact from one table to another looks
like progress in one of them and changes nothing for the reader.

  PROMISE   which reader does each file have
  ENVELOPE  does a file that names a refused key say which product this one is
  PATH      does a file that states the price reach a working button

The trigger for ENVELOPE is the refusal sentence itself, not a guess about who is
holding a key. The first version of this measure asked "does the file put a key
in the reader's hands", and two of its six controls came back wrong — it read
"CLI'en er gratis, uden konto og uden nøgle" as a reader holding one, and it
missed the very sentence on the support page that says "paste the key". Asking
instead whether the file describes the failure is a question a sentence can
answer, and it is the failure that withholds the remedy.
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
LINK = PRO["payment_link"]
SITE = CONTRACT["site_url"].rstrip("/")

# Everything a crawler or a person can be handed. The rule may not name these:
# it reads the same refusal sentence off whatever the site publishes, so a new
# page is covered the day it is written rather than the day someone remembers.
CRAWLED = [
    "site/index.html",
    "site/da/index.html",
    "site/support/index.html",
    "site/da/support/index.html",
    "site/cheatsheet/index.html",
    "site/llms.txt",
    "site/llms-full.txt",
    "README.md",
    "docs/cli.md",
]

# The parts of the envelope a holder of a key needs. The address and the product
# value are the envelope and the two field names are the letter: a POST missing
# any one of them activates nothing and says nothing about why.
ENVELOPE = [
    ("base url", (API,)),
    ("activate call", (API, "activate")),
    ("license_key field", ("license_key",)),
    ("device_id field", ("device_id",)),
    ("product key", (KEY,)),
]

BUY = [
    ("payment link", (LINK,)),
    ("price", (str(PRO["amount"]),)),
    ("machines", (str(PRO["machines"]),)),
]

# A key bought for another product is refused. English and Danish, and the
# subject may come either side of the product phrase, so the sentence is matched
# as a whole rather than as a phrase.
REFUSED_FOR_OTHER = re.compile(
    r"(?:licence key|license key|licensn[øo]gle|key|n[øo]gle|nøglen)[^.]*?"
    r"(?:different|another)[^.]*?product[^.]*?(?:refused|refuses|afvises|avvises)"
    r"|"
    r"(?:et andet produkt|et andet)[^.]*?afvises",
    re.IGNORECASE,
)

# The paths the pro-path rule already accepts as a way to the button, so a file
# one hop away is compared with the files one hop away rather than called broken.
HOPS = [
    (LINK, "the button"),
    ("/support/#buying-pro", "the button, one hop"),
    ("/da/support/#kob-pro", "the button, one hop"),
    ("/support/", "the button, one hop"),
    ("/da/support/", "the button, one hop"),
    ("/#desktop", "the button, one hop"),
    ("/da/#desktop", "the button, one hop"),
    (SITE + "/", "the front page, which carries the button"),
]


def read(rel):
    path = ROOT / rel
    return path.read_text(encoding="utf-8") if path.exists() else None


def has(text, needle):
    return all(n in text for n in needle)


def row(label, hit, note=""):
    return f"  {'yes' if hit else 'NO ':<3}  {label:<30} {note}"


def main():
    texts = {rel: read(rel) or "" for rel in CRAWLED}

    print("PROMISE — which reader does each file have\n")
    for rel, text in texts.items():
        notes = []
        if REFUSED_FOR_OTHER.search(text):
            notes.append("names a key refused for another product")
        if has(text, BUY[1][1]):
            notes.append(f"states {PRO['amount']} {PRO['currency']}")
        if has(text, BUY[0][1]):
            notes.append("carries the payment link")
        print(row(rel, True, "; ".join(notes) or "neither reader's facts"))

    print("\n\nENVELOPE — a file that names a refused key must say which product this one is\n")
    print("  a wrong product is the one licence failure the reader cannot fix alone:")
    print("  the key is right, the app is right, and the server answers that the key")
    print("  belongs to something else without saying what the right thing is.\n")
    named = 0
    for rel, text in texts.items():
        sentence = REFUSED_FOR_OTHER.search(text)
        if not sentence:
            continue
        named += 1
        have = [n for n, nd in ENVELOPE if has(text, nd)]
        missing = [n for n, nd in ENVELOPE if n not in have]
        note = "all five" if not missing else "MISSING: " + ", ".join(missing)
        print(row(rel, not missing, f"{len(have)} of 5   {note}"))
        print(f"        \"{sentence.group(0).strip()}\"")
    print(f"\n  files that name the failure: {named}")

    print("\n\nPATH — a file that states the price must reach a working button\n")
    for rel, text in texts.items():
        if not has(text, BUY[1][1]):
            continue
        for href, note in HOPS:
            if href in text:
                print(row(rel, True, note))
                break
        else:
            print(row(rel, False, "states the price and no way to a button"))

    print("\n\nCONTROLS — the needle has to be able to say no\n")
    cases = [
        ("the front page's tool list", "EUComply, Clean Copy, DeskUptime, Transmute, BugBottle.", False),
        ("a CLI page promising no key", "The CLI is free, with no account and no key.", False),
        ("the Danish page promising no key", "CLI'en er gratis, uden konto og uden nøgle.", False),
        ("a README pointing at the support page", "see transmute.run/support to buy a key and activate it", False),
        ("the English refusal", "A key bought for a different product is refused.", True),
        ("the Danish refusal", "En nøgle købt til et andet produkt afvises.", True),
    ]
    bad = 0
    for name, text, want in cases:
        got = bool(REFUSED_FOR_OTHER.search(text))
        if got != want:
            bad += 1
        print(row(name, got == want, f"names the failure: {got}"))

    scanned = len(list(ROOT.glob("site/**/*.html"))) + 2
    print(
        f"\nVERDICT: {named} of {scanned} public files name a key refused for another"
        f" product; {sum(1 for rel, t in texts.items() if REFUSED_FOR_OTHER.search(t) and all(has(t, nd) for _, nd in ENVELOPE))} "
        f"of them say which product this one is; {bad} control(s) the needle gets wrong\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
