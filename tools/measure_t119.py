#!/usr/bin/env python3
"""Measure the four licence failures the support page names, and what each one
offers the reader who just hit it.

T118 wrote a rule for the one licence failure a reader cannot fix alone: a key
bought for another product. Its own note ended by pointing at the siblings, and
this reads that note rather than the rule — so the first question is not "which
files name a refused key" but "which failures exist at all".

The support page names four, and they are not the same kind of thing:

  WRONG    a key bought for another Mahope tool       403
  DEAD     a key that was cancelled or ran out of time 403
  SLOTS    all three machines in use                   409
  SERVER   the licence server is briefly unavailable   503

A wrong product is a field the app sends, so the reader can fix it from the
envelope. The other three are not fields: the key is right, the app is right,
and the server says no. A reader in the middle of a troubleshooting list is
exactly the reader who will not scroll to the buying section, so the remedy has
to sit in the same paragraph as the failure — a page-level "does this file
carry the button" is true of the support page and answers nothing, because the
button is in a section the reader has already passed.

Two questions, held apart the whole way:

  LOCAL    does the paragraph that names a failure also say what to do about it
  ANYWHERE is there a remedy for that failure anywhere in the file at all

LOCAL going from no to yes while ANYWHERE stays no is a reader who can act;
LOCAL and ANYWHERE both no is a dead end. A repair that only moved a remedy
from one table to the other would change neither.
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
# it reads the same sentences off whatever the site publishes, so a new page is
# covered the day it is written rather than the day someone remembers.
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

# A paragraph, a list item, or a bullet of a plain text file. The support pages
# are HTML and split on block tags; the two llms files are markdown and split on
# list items and lines. A remedy in a different block is a remedy the reader has
# to go and find, so the split has to be the one a reader scrolls past.
BLOCK = re.compile(r"</(?:p|li|h[1-6]|td|div)>|(?:^|\n)\s*[-*]\s+", re.IGNORECASE)
HEADING = re.compile(r"^\s*<h[1-6][\s>]", re.IGNORECASE)

# The four failures, each as a sentence a reader can recognise, in the two
# languages the site publishes. The needle is the failure, never the word
# "key": T118's measure already showed a page can mention keys in order to
# promise that it needs none.
SRV_REMEDY = [
    (
        "says what the reader keeps while the server is down",
        re.compile(
            r"(?:seven days|7 days|syv dage|free tier|gratisniveau|gratisn[iı]v"
            r"|cached|cache|stays in the free|forbliver i det gratis"
            r"|keeps the features|beholder de funktioner)",
            re.IGNORECASE,
        ),
    )
]

FAILURES = [
    (
        "WRONG",
        "a key bought for another product (403)",
        # "key ... another ... refused", with the word product optional: the
        # English page says "a key bought for another one of them is refused"
        # and names the product in the quoted server message, while the Danish
        # says "en nøgle købt til et andet af dem afvises". Requiring the word
        # product made the two languages match two different sentences of the
        # same paragraph, and the English one passed by luck of the other.
        re.compile(
            r"(?:licence key|license key|licensn[øo]gle|key|n[øo]gle|nøglen)[^.\n]{0,160}?"
            r"(?:different|another)[^.\n]{0,160}?(?:product|one of them|af dem)?[^.\n]{0,160}?"
            r"(?:refused|refuses|afvises|avvises)"
            r"|"
            r"(?:et andet produkt|et andet)[^.\n]{0,160}?afvises",
            re.IGNORECASE,
        ),
        # The remedy is the value itself, the link to where it is written down,
        # or the receipt that names the product in words.
        [
            (
                "names the product, or the receipt that does",
                re.compile(
                    re.escape(KEY)
                    + r"|#what-the-app-sends|#hvad-appen-sender|receipt|kvittering",
                    re.IGNORECASE,
                ),
            )
        ],
        [
            (
                "names the product, or the receipt that does",
                re.compile(
                    re.escape(KEY)
                    + r"|#what-the-app-sends|#hvad-appen-sender|receipt|kvittering",
                    re.IGNORECASE,
                ),
            )
        ],
    ),
    (
        "DEAD",
        "a key that was cancelled or ran out of time (403)",
        # A key, in either order: a guide that says "no more hiding cancelled
        # orders in Excel filters" is about a spreadsheet, not a licence, and
        # the wider population the gate reads found it the first time.
        re.compile(
            r"(?:key|licens|n[øo]gle)[^.\n]{0,160}?"
            r"(?:cancelled|canceled|revoked|expired|run out of time|annulleret|udl[øo]bet|udl[øo]ber)"
            r"|(?:cancelled|canceled|revoked|expired|annulleret|udl[øo]bet|udl[øo]ber)"
            r"[^.\n]{0,160}?(?:key|licens|n[øo]gle)",
            re.IGNORECASE,
        ),
        # The only thing that revives it is a new purchase, so the remedy is the
        # act of buying again *and* a door to do it in — a page that says "buy
        # again" and puts the button three sections away has not answered a
        # reader who is stuck, so both halves are required.
        [
            (
                "says the way back is a new purchase",
                re.compile(
                    r"(?:buy(?:ing|s)? (?:it |again|a new )|a new purchase|new key|re-?purchase"
                    r"|k[øo]b(?:e)? (?:igen|den igen|ny)|nyt k[øo]b|ny n[øo]gle|genk[øo]b)",
                    re.IGNORECASE,
                ),
            ),
            (
                "and gives a door to the button",
                re.compile(
                    r"#buying-pro|#kob-pro|buy\.stripe\.com|support/#buying|support/#kob",
                    re.IGNORECASE,
                ),
            ),
        ],
        [
            (
                "says the way back is a new purchase",
                re.compile(
                    r"(?:buy(?:ing|s)? (?:it |again|a new )|a new purchase|new key|re-?purchase"
                    r"|k[øo]b(?:e)? (?:igen|den igen|ny)|nyt k[øo]b|ny n[øo]gle|genk[øo]b)",
                    re.IGNORECASE,
                ),
            ),
            (
                "and gives a door to the button",
                re.compile(
                    r"#buying-pro|#kob-pro|buy\.stripe\.com|support/#buying|support/#kob",
                    re.IGNORECASE,
                ),
            ),
        ],
    ),
    (
        "SLOTS",
        "all three machines already in use (409)",
        # The licence is the subject: "--prefix that is not already in use" is
        # about a string, and the first needle counted it as a 409.
        re.compile(
            r"(?:(?:licence|license|licens|machine|device|slot|maskin|enhed)"
            r"[^.\n]{0,160}?(?:already in use|bruger allerede))"
            r"|(?:already uses a licen[cs]e|all three slots|tre pladser"
            r"|device limit|enhedsgr[æa]nse)",
            re.IGNORECASE,
        ),
        [
            (
                "says how a slot is freed",
                re.compile(
                    r"deactivate|release the slot|free the slot|sl[øo]s en plads|deaktiv",
                    re.IGNORECASE,
                ),
            )
        ],
        [
            (
                "says how a slot is freed",
                re.compile(
                    r"deactivate|release the slot|free the slot|sl[øo]s en plads|deaktiv",
                    re.IGNORECASE,
                ),
            )
        ],
    ),
    (
        "SERVER",
        "the licence server is briefly unavailable (503)",
        # Unavailability, not the existence of a server: the front page and the
        # README mention the licence server to say it is there, which is not a
        # failure and owes no remedy.
        re.compile(
            r"(?:licence server|license server|licensserver|serveren|server)[^.\n]{0,160}?"
            r"(?:down|unreachable|unavailable|utilg[æa]ngelig|nede|bad afternoon|dårlig|503)"
            r"|(?:licence server|license server|licensserver)[^.\n]{0,160}?503",
            re.IGNORECASE,
        ),
        # The promise is "you keep what you paid for, for up to seven days, and
        # the app does not pretend to be Pro". The two languages say it in
        # different words, and a needle that knew only one of them would measure
        # the translation instead of the answer.
        SRV_REMEDY,
        # The promise is "you keep what you paid for, for up to seven days, and
        # the app does not pretend to be Pro". The two languages say it in
        # different words, and a needle that knew only one of them would measure
        # the translation instead of the answer.
        SRV_REMEDY,
    ),
]


# The parts of the envelope T118 locked, so a repair that adds prose cannot
# quietly drop them.


ENVELOPE = [API, "activate", "license_key", "device_id", KEY]



def read(rel):
    path = ROOT / rel
    return path.read_text(encoding="utf-8") if path.exists() else ""


TOC = re.compile(r"<aside class=\"toc-side\".*?</aside>", re.IGNORECASE | re.DOTALL)


def blocks(text):
    # A heading is a label for what follows it, not a statement the reader reads
    # on its own: split on the tag that ends a block, then fold a heading into
    # the block under it. Without the fold, "This device already uses a licence"
    # named the 409 and the paragraph below it held the remedy, and the measure
    # reported a page that is answered as missing.
    parts = [b for b in BLOCK.split(TOC.sub(" ", text)) if b.strip()]
    folded = []
    pending = ""
    for part in parts:
        if HEADING.match(part):
            pending = part
            continue
        folded.append(pending + part if pending else part)
        pending = ""
    if pending:
        folded.append(pending)
    return folded


def row(label, hit, note=""):
    return f"  {'yes' if hit else 'NO ':<3}  {label:<30} {note}"


def main():
    texts = {rel: read(rel) for rel in CRAWLED}

    print("LOCAL — does the block that names a failure say what to do about it\n")
    print("  a reader in the middle of a troubleshooting list does not scroll to")
    print("  the buying section, so a remedy in another block is not a remedy.\n")
    misses = []
    for code, what, needle, local_remedy, _ in FAILURES:
        for rel, text in texts.items():
            for block in blocks(text):
                sentence = needle.search(block)
                if not sentence:
                    continue
                got = all(rx.search(block) for _, rx in local_remedy)
                if not got:
                    misses.append((code, rel, sentence.group(0).strip()))
                print(
                    row(
                        f"{code} in {rel}",
                        got,
                        "" if got else f"\"{sentence.group(0).strip()}\"",
                    )
                )

    print("\n\nANYWHERE — is there a remedy for that failure anywhere in the file at all\n")
    still_dead = 0
    for code, what, _, _, anywhere in FAILURES:
        holders = [
            rel for rel, text in texts.items() if all(rx.search(text) for _, rx in anywhere)
        ]
        if not holders:
            still_dead += 1
        print(row(f"{code} — {what}", bool(holders), ", ".join(holders) or "no file says what to do"))

    print("\n\nENVELOPE — T118's five parts must survive whatever else is added\n")
    for rel, text in texts.items():
        if not re.search(
            r"(?:different|another)[^.\n]{0,160}?product[^.\n]{0,160}?(?:refused|refuses)", text, re.IGNORECASE
        ):
            continue
        missing = [n for n in ENVELOPE if n not in text]
        print(
            row(
                rel,
                not missing,
                "all five" if not missing else "MISSING: " + ", ".join(missing),
            )
        )

    print("\n\nCONTROLS — the needles have to be able to say no\n")
    cases = [
        ("the front page's tool list", "EUComply, Clean Copy, DeskUptime, Transmute, BugBottle.", None),
        ("a CLI page promising no key", "The CLI is free, with no account and no key.", None),
        ("the Danish page promising no key", "CLI'en er gratis, uden konto og uden nøgle.", None),
        ("a README pointing at support", "see transmute.run/support to buy a key and activate it", None),
        ("a guide about cancelled orders", "no more hiding cancelled orders in Excel filters", None),
        ("the English wrong-product line", "A key bought for a different product is refused.", "WRONG"),
        ("the Danish wrong-product line", "En nøgle købt til et andet produkt afvises.", "WRONG"),
        ("a key that ran out of time", "and so is a key that has been cancelled or has run out of time.", "DEAD"),
        ("a Danish key that ran out", "en nøgle, der er blevet annulleret eller er udløbet.", "DEAD"),
        ("a key only a writer mentions", "the key is revoked when the subscription lapses", "DEAD"),
        ("all three slots in use", "All three slots are in use. Deactivate a machine you no longer use.", "SLOTS"),
        ("the server having a bad afternoon", "If the licence server is down, the app stays in the free tier.", "SERVER"),
    ]
    bad = 0
    for name, text, want in cases:
        got = [c for c, _, needle, _, _ in FAILURES if needle.search(text)]
        if want is None:
            ok = not got
        else:
            ok = got == [want]
        if not ok:
            bad += 1
        print(row(name, ok, f"names: {', '.join(got) or 'nothing'}"))

    print(
        f"\nVERDICT: {len(misses)} block(s) name a licence failure and say nothing to do"
        f" about it, in {len({m[1] for m in misses})} file(s); {still_dead} failure(s) have no"
        f" remedy in any public file; {bad} control(s) the needles get wrong\n"
    )
    for code, rel, sentence in misses:
        print(f"  {code:<7} {rel}\n          \"{sentence}\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
