"""Does the path to the paid product land in the reader's own language?

T105 measured that eleven of the seventeen indexable pages carried the paid
product in the shared footer and nowhere else, and put a rule on it: every page
a reader lands on has to give them a way through the body. That rule is a set
of strings — `/support/#buying-pro`, `/da/support/#buying-pro`, `/#desktop` and
four more — and it asks only whether one of them is present.

A set of strings cannot see *where* it lands. This asks that, per page:

  PATHS     the language of the page, and the language of every page its path
            to the paid product actually opens. A mismatch is a reader who has
            decided to buy and is handed a page in a language they did not ask
            for, at the one step where the price is stated.
  WHITELIST every path the rule accepts, and whether it resolves at all. A
            whitelisted path that leads nowhere is the rule crediting a page
            for a door that is not there, and it is invisible to the rule
            because the rule never follows it.

The two questions are held apart on purpose: PATHS is about the reader's
experience, WHITELIST is about the rule's own bookkeeping.
"""

import collections, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONTRACT = ROOT / "tools" / "verify_contract.mjs"

# The paths tools/verify_contract.mjs accepts as "a way to the paid product",
# read out of the rule rather than written out again here: a copy of the list
# would agree with the rule by construction and could not see it change.
RULE = re.search(
    r"const buying = new Set\(\[(.*?)\]\);", CONTRACT.read_text(encoding="utf-8"), re.S
)
if not RULE:
    sys.exit("could not find the buying set in tools/verify_contract.mjs")
BUYING = re.findall(r"'([^']+)'", RULE.group(1))

# The pages nobody arrives on from a search result to buy something, copied
# from the rule's own exemptions so the measurement asks the same question.
EXEMPT = re.compile(r"privacy|404\.html$|search/|support/")


def url_of(page: Path) -> str:
    rel = page.relative_to(SITE).as_posix()
    return "/404.html" if rel == "404.html" else "/" + rel.replace("index.html", "")


PAGES = sorted(SITE.rglob("*.html"))
URLS = {url_of(p): p for p in PAGES}
LANGS = {u: re.search(r'<html[^>]*\blang="([^"]+)"', p.read_text(encoding="utf-8")) for u, p in URLS.items()}
LANG = {u: (m.group(1) if m else "?") for u, m in LANGS.items()}
IDS = {u: set(re.findall(r'\bid="([^"]+)"', p.read_text(encoding="utf-8"))) for u, p in URLS.items()}


def body_of(page: Path) -> str:
    """The page without its chrome, because chrome is identical everywhere."""
    text = page.read_text(encoding="utf-8")
    return re.sub(r"<header\b[\s\S]*?</header>|<footer\b[\s\S]*?</footer>", "", text)


def strip(href: str) -> tuple[str, str]:
    path, _, frag = href.partition("#")
    return path, frag


def table(title: str) -> None:
    print(f"\n{title}\n" + "-" * len(title))


def main() -> int:
    table("PATHS — the language a reader is handed at the step where the price is stated")
    print(f"{'page':<34} {'lang':<5} {'path in the body':<34} {'lands in':<9} verdict")
    held, mismatched = 0, 0
    for page in PAGES:
        rel = page.relative_to(SITE).as_posix()
        if "noindex" in page.read_text(encoding="utf-8") or EXEMPT.search(rel):
            continue
        url = url_of(page)
        held += 1
        paths = [h for h in re.findall(r'<a\b[^>]*href="([^"]+)"', body_of(page)) if h in BUYING]
        if not paths:
            print(f"{rel:<34} {LANG[url]:<5} {'— none —':<34} {'':<9} held, no path")
            continue
        for href in paths:
            target, _ = strip(href)
            # A path off this site is the payment link itself, which has one
            # language and is not a page that can be written in two.
            if not target.startswith("/"):
                print(f"{rel:<34} {LANG[url]:<5} {href:<34} {'(off-site)':<9} ok")
                continue
            if target not in LANG:
                print(f"{rel:<34} {LANG[url]:<5} {href:<34} {'(no page)':<9} BROKEN PAGE")
                mismatched += 1
                continue
            ok = LANG[target] == LANG[url]
            mismatched += 0 if ok else 1
            print(f"{rel:<34} {LANG[url]:<5} {href:<34} {LANG[target]:<9} {'ok' if ok else 'WRONG LANGUAGE'}")
    print(f"\n{held} pages held to the question, {mismatched} handing the reader the wrong language")

    table("WHITELIST — every path the rule accepts, and whether it leads anywhere")
    print(f"{'accepted path':<34} {'page':<12} fragment")
    dead = 0
    for href in BUYING:
        target, frag = strip(href)
        if not target.startswith("/"):
            print(f"{href:<34} {'(off-site)':<12} n/a — the payment link itself")
            continue
        if target not in LANG:
            dead += 1
            print(f"{href:<34} {'MISSING':<12} no such page")
            continue
        present = frag in IDS[target] if frag else True
        if not present:
            dead += 1
        print(f"{href:<34} {LANG[target]:<12} {'present' if present else 'NO SUCH ANCHOR'}")
    print(f"\n{len(BUYING)} paths accepted, {dead} leading nowhere")

    return 0


if __name__ == "__main__":
    sys.exit(main())
