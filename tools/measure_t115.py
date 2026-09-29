"""Can a language model answer "what does Transmute Pro cost" from the file it is pointed at?

`robots.txt` names one file as the guidance for language models:

    # Guidance for language models: https://transmute.run/llms.txt

That makes `llms.txt` the file a model reads instead of browsing the site. Every
rule that asks "does a reader get a way to the paid product" reads rendered HTML
pages, because a reader arrives on a page. A model does not arrive anywhere: it
is handed a URL and answers from the text. So the question the HTML rules ask —
is there a link on the page — is not the question a model faces. The question is
whether the *facts* are in the file, because the file is all it gets.

This asks that, in three tables held apart on purpose:

  POINTER  what the site tells a crawler, a reader and a model to fetch. Read
           from `robots.txt` itself rather than written out again, so a change
           to the pointer is a change the measurement sees.
  FACTS    per published file: the price, the payment link, the machine count
           and the product key, each counted where it appears. A file that
           names the product and states no price is the failure this measures
           — it is a pointer where a model needed an answer.
  ENTRY    how each file does let a reader through, so "there is no answer in
           the file" is not confused with "there is no way to buy at all". A
           file can have a working pointer and still be silent about the price.

The three are held apart because they have different truths: FACTS is about what
the file says, ENTRY is about where it sends you, and a fix that only moves a
number from ENTRY into FACTS is visible in one table and invisible in the other.
"""

import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONTRACT = ROOT / "tools" / "product-contract.json"

pro = __import__("json").loads(CONTRACT.read_text(encoding="utf-8"))["desktop_pro"]

# The files the site publishes outside HTML: the three a crawler or a model
# reaches the site through, and the sitemap that lists them.
PUBLISHED = ["llms.txt", "llms-full.txt", "robots.txt", "sitemap.xml"]

# The paths tools/verify_contract.mjs accepts as a way to the paid product,
# read out of the rule rather than written again here: a copy would agree with
# the rule by construction and could not see it change.
RULE = re.search(
    r"const buying = new Set\(\[(.*?)\]\);",
    (ROOT / "tools" / "verify_contract.mjs").read_text(encoding="utf-8"),
    re.S,
)
BUYING = re.findall(r"'([^']+)'", RULE.group(1)) if RULE else []
# The set names the payment link as `pro.payment_link` rather than as a string,
# so reading the literals alone drops it — and the one file that hands the
# payment link straight to the reader is then scored as having no way through
# at all. A table that cannot see the value the rule actually uses is a table
# measuring a different rule, so it is resolved here from the contract the
# rule reads it from.
if "pro.payment_link" in RULE.group(1):
    BUYING.append(pro["payment_link"])

# A price is a number and the locked currency. The machine count and the
# product key are read the same loose way the gate reads them, so the
# measurement cannot fail a file the gate would have called fine.
PRICE = re.compile(rf"(\d+)\s*(?:{pro['currency']}|US\$)\b")
PAYMENT = re.compile(r"https://buy\.stripe\.com/[A-Za-z0-9]+")
MACHINES = re.compile(r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+machines\b", re.I)
KEY = re.compile(re.escape(pro["product_key"]))


def read(name):
    return (SITE / name).read_text(encoding="utf-8")


def table(title, header, rows):
    print(f"\n{title}\n")
    widths = [len(h) for h in header]
    for row in rows:
        widths = [max(w, len(str(c))) for w, c in zip(widths, row)]
    print("  " + "  ".join(h.ljust(w) for h, w in zip(header, widths)))
    print("  " + "  ".join("-" * w for w in widths))
    for row in rows:
        print("  " + "  ".join(str(c).ljust(w) for c, w in zip(row, widths)))


def main():
    robots = read("robots.txt")

    # POINTER. The site states its own address, so an address in robots.txt can
    # be read as one this site published rather than a comment about elsewhere.
    pointers = []
    for line in robots.splitlines():
        line = line.strip()
        if line.startswith("#") and ":" in line:
            pointers.append(("comment", line.lstrip("# ").strip()))
        elif re.match(r"^[A-Za-z-]+:", line):
            pointers.append(("directive", line))
    table("POINTER — what robots.txt tells a crawler and a model to fetch",
          ["kind", "line"], pointers)

    pointed = re.search(r"language models:\s*(\S+)", robots)
    named = pointed.group(1).rsplit("/", 1)[-1] if pointed else None
    print(f"\n  The file named as model guidance: {named}")
    if named not in PUBLISHED:
        print("  !! robots.txt names a file that is not one of the published ones")
        return 1

    # FACTS and ENTRY, per published file.
    fact_rows, entry_rows = [], []
    for name in PUBLISHED:
        text = read(name)
        prices = PRICE.findall(text)
        links = PAYMENT.findall(text)
        machines = MACHINES.findall(text)
        entries = [h for h in BUYING if h in text]
        if name == "sitemap.xml":
            # A sitemap is a list of addresses and carries no prose by design;
            # holding it to "does it state a price" would invent a rule nobody
            # asked for. It is listed so its absence of facts is not read as a
            # finding.
            fact_rows.append((name, "-", "-", "-", "-", "not a prose file"))
            continue
        fact_rows.append((
            name,
            ", ".join(prices) or "none",
            ", ".join(sorted(set(links))) or "none",
            ", ".join(m.upper() for m in machines) or "none",
            "yes" if KEY.search(text) else "no",
            "pro named" if re.search(r"desktop[-\s]?app|desktop pro", text, re.I) else "not named",
        ))
        entry_rows.append((name, len(entries), ", ".join(entries) or "none"))

    table("FACTS — what each published file states on its own",
          ["file", "price", "payment link", "machines", "product key", "product"],
          fact_rows)
    table("ENTRY — how each published file lets a reader reach the paid product",
          ["file", "paths", "which"], entry_rows)

    # The measurement's own question, asked once so the answer is a line and
    # not a reading of the table: can the file named as model guidance state
    # the price, and hand over the link to pay?
    text = read(named)
    missing = []
    if not PRICE.findall(text):
        missing.append("the price")
    if not PAYMENT.findall(text):
        missing.append("the payment link")
    if not MACHINES.findall(text):
        missing.append("the machine count")
    if missing:
        print(f"\n  {named} cannot answer the price question on its own. It states none of: "
              + ", ".join(missing) + ".")
        print(f"  It does point at {len([h for h in BUYING if h in text])} of the "
              f"{len(BUYING)} paths to the paid product, so a reader who follows a link gets an answer and a model does not.")
    else:
        print(f"\n  {named} states the price, the machine count and the payment link.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
