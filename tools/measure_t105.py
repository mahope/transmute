"""Can a reader who lands on any one page find their way to Pro?

T104's queue was empty except one item that is blocked on the private repo, and
its own four pointers turned out to be stale: (b) is a choice that belongs to
Mads, (d) was already measured by T94, and (a) describes a column
`measure_t104.py` does print. So this iteration measured the surface instead of
the engine.

The question is per page and it is a question about a *reader*, not about a
link: a visitor arrives from a search result on one page, and that page has to
give them one honest, working way to Pro. Not a banner on every page — one path,
on the page where the question is actually asked.

Two things are held apart, because conflating them is how the last few
measurement tables measured nothing:
  PATH     the *body* of the page carries a link a reader can follow to the
           paid product
  CLAIM    the page says something about Pro that is not the contract's
           numbers — checked separately by verify_contract.mjs, not here

The first run of this table counted the shared footer and reported that every
page was fine, which was true and useless: the footer is chrome, identical on
all 17 pages, and a reader who is already on a page does not need to be told
twenty more times where the footer is. Chrome is reported here, but as its own
number, so the finding is the body and not the site furniture.
"""

import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACT = json.load(open(os.path.join(ROOT, "tools", "product-contract.json")))
PRO = CONTRACT["desktop_pro"]
ALLOWED = set(CONTRACT["allowed_desktop_link_targets"])

# The same rule verify_contract.mjs applies to a desktop-labelled link, kept
# here so this table asks the question the gate would ask.
DESKTOP_LABEL = re.compile(r"desktop[-\s]?app|desktopapp|macos,? windows", re.I)


class Links(HTMLParser):
    """Links in the body, with the shared chrome counted separately.

    `<header>` and `<footer>` are stripped before anything else is asked. They
    are the same on every page, so including them makes the table report that
    seventeen pages are fine when the thing being measured is one path on the
    page where the reader is actually stuck.
    """

    def __init__(self):
        super().__init__()
        self.links = []          # (href, text), body only
        self.chrome = []         # (href, text), header + footer
        self._href = None
        self._buf = []
        self._in_chrome = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("header", "footer"):
            self._in_chrome += 1
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._buf = []

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            link = (self._href, re.sub(r"\s+", " ", "".join(self._buf)).strip())
            (self.chrome if self._in_chrome else self.links).append(link)
            self._href = None
            self._buf = []
        if tag in ("header", "footer"):
            self._in_chrome -= 1


def paths_in(links):
    """Ways to reach the paid product among these links.

    Three kinds count, and only because each is one a reader can actually
    follow: the payment link itself, a link into the buying section of the
    support page, and a link to the desktop section of the front page. A bare
    mention is not a path — a sentence that says the app exists but links
    nowhere leaves the reader exactly where they started, and that is the
    state this table is measuring.
    """
    out = []
    for href, _label in links:
        if href == PRO["payment_link"]:
            out.append("buys here")
        elif href in ALLOWED and (href.endswith("#buying-pro") or href.rstrip("/") == "/support"):
            out.append(f"support ({href})")
        elif href in {"/#desktop", "/da/#desktop"}:
            out.append(f"desktop section ({href})")
    return sorted(set(out))


def main():
    files = []
    for base, _dirs, names in os.walk(os.path.join(ROOT, "site")):
        for n in names:
            if n.endswith(".html"):
                files.append(os.path.join(base, n))
    files.sort()

    rows = []
    for f in files:
        rel = os.path.relpath(f, ROOT)
        text = open(f, encoding="utf8").read()
        if "noindex" in text:
            continue                      # not a landing page, not a finding
        p = Links()
        p.feed(text)
        rows.append((rel, paths_in(p.links), paths_in(p.chrome)))

    missing = [r for r in rows if not r[1]]
    for rel, body, chrome in rows:
        print(f'{"PATH " if body else "none  "} {rel}')
        for p in body:
            print(f"        body:   {p}")
        for p in chrome:
            print(f"        chrome: {p}")

    print(f"\n{len(missing)} of {len(rows)} indexable pages give no path to Pro in the body")
    for rel, _b, _c in missing:
        print(f"  {rel}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
