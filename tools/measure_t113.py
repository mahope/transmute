"""Does a hreflang link point at a page that exists, and point back?

T111's (a) asked whether a guide's own `hreflang` is right, and said the reason
it is still unasked is that `/da/` links all ten guides to the English ones and
`/da/guides/` does not exist, so the whole subject was measured on `/da/index.html`
and never on the links themselves. That is the same shape as T105's first run and
T107's first run: a table asked a question about the *page* instead of the thing
the reader follows.

So this table asks the link, not the page. Four questions, held apart the whole
way, because each has a different answer and a fix for one is a lie for another:

  EXISTS     every hreflang target is a page this site serves
  SELF       every page lists its own language, pointing at itself
  BACK       every page that names a translated version is named back, in the
             other language, by that page  (Google's reciprocity rule — without
             it the whole annotation set is ignored)
  SAYS       a link that crosses from a Danish page into English content says so
             where the reader is about to click, not only in a language tag
             neither reader sees

EXISTS/SELF/BACK are properties of the machine-readable set. SAYS is a property
of the sentence next to the link, and it is the only one of the four a reader can
act on.

`hreflang` is the one annotation on this site nothing measures. seo_check.py asks
whether `x-default` and `en` exist and whether `da` exists on the six paired
pages; verify_contract.mjs asks for a `hreflang` to the counterpart on the two
support pages. Both ask *is the link written*. None of them asks *does the target
exist* and *does it point back*, so a set can be complete and still describe
nothing.
"""

import os, re, sys
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
BASE = "https://transmute.run"
PAIRS = ("/", "/da/")  # the two language roots; the rest hang off them


def pages():
    """Every page the site serves, as (url_path, absolute_path, text)."""
    out = []
    for dirpath, dirnames, filenames in os.walk(SITE):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in sorted(filenames):
            if not name.endswith(".html"):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, SITE)
            url = "/" + ("" if rel == "index.html"
                         else rel[:-len("index.html")] if rel.endswith("index.html")
                         else rel)
            out.append((url, full, open(full, encoding="utf-8").read()))
    return sorted(out)


def head_of(text):
    m = re.search(r"<head>(.*?)</head>", text, flags=re.S)
    return m.group(1) if m else text[:4000]


def alternates(text):
    """hreflang -> url, and the order they were written in."""
    head = head_of(text)
    pairs = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', head)
    return dict(pairs), pairs


def canon_lang(text):
    m = re.search(r'<html lang="([a-z]{2})"', text)
    return m.group(1) if m else None


def to_path(url):
    """A site-absolute url, as the path the file sits at. None if it is off-site."""
    p = urlparse(url)
    if p.netloc and p.netloc != urlparse(BASE).netloc:
        return None
    path = unquote(p.path) or "/"
    if not path.endswith("/"):
        path += "/"  # /privacy and /privacy/ name the same page
    return path


def exists(path):
    if path is None:
        return None
    if path == "/":
        return os.path.isfile(os.path.join(SITE, "index.html"))
    return os.path.isfile(os.path.join(SITE, path.lstrip("/"), "index.html"))


def main():
    ps = pages()
    by_path = {p[0] for p in ps}
    canonical = {p[0]: p[2] for p in ps}

    print(f"{len(ps)} sider under site/ — fire spørgsmål, holdt adskilt hele vejen\n")

    # ---- table 1: EXISTS + SELF, one row per page -------------------------
    t1 = []
    for url, full, text in ps:
        hl, order = alternates(text)
        own = canon_lang(text)
        bad = []
        for lang, target in order:
            p = to_path(target)
            if p not in by_path:
                bad.append(f"{lang}->{target} findes ikke")
        if not order:
            bad.append("ingen hreflang")
        elif own and own not in hl:
            bad.append(f"angiver ikke sit eget sprog ({own})")
        elif own and to_path(hl.get(own, "")) != url:
            bad.append(f"{own}->{hl[own]} er ikke siden selv")
        t1.append((url, own, " ".join(f"{k}={v}" for k, v in order) or "-",
                   "; ".join(bad) or "REN"))
    w = max(len(r[0]) for r in t1)
    print("TABEL 1 — EXISTS + SELF (findes hver adresse, og angiver siden sit eget sprog?)")
    for r in t1:
        print(f"  {r[0]:<{w}}  {r[1] or '?':<3} {r[2][:60]:<60} {r[3]}")
    t1_bad = [r for r in t1 if r[3] != "REN"]
    print(f"  -> {len(t1) - len(t1_bad)} af {len(t1)} i overensstemmelse, {len(t1_bad)} i navngiven klasse\n")

    # ---- table 2: BACK, one row per *pair*, both directions ---------------
    t2 = []
    for url, full, text in ps:
        hl, order = alternates(text)
        own = canon_lang(text)
        for lang, target in order:
            p = to_path(target)
            if p is None or p not in by_path:
                continue
            if p == url:
                continue
            other, _ = alternates(canonical[p])
            other_own = canon_lang(canonical[p])
            if own and own not in other:
                t2.append((url, f"{lang}->{target}", "NEJ",
                           f"{p} svarer ikke tilbage med {own} (den har {','.join(other) or 'intet'})"))
            elif to_path(other.get(own, "")) != url:
                t2.append((url, f"{lang}->{target}", "NEJ",
                           f"{p} svarer tilbage med {own}->{other.get(own)} (skal være {url})"))
            else:
                t2.append((url, f"{lang}->{target}", "JA", f"{p} svarer tilbage med {own}"))
    w2 = max((len(r[1]) for r in t2), default=20)
    print("TABEL 2 — BACK (finder den side der navngives svar tilbage med sit eget sprog?)")
    for r in t2:
        print(f"  {r[0]:<{w}}  {r[1]:<{w2}}  {r[2]:<4} {r[3]}")
    t2_bad = [r for r in t2 if r[2] == "NEJ"]
    print(f"  -> {len(t2) - len(t2_bad)} af {len(t2)} par i overensstemmelse, {len(t2_bad)} i navngiven klasse\n")

    # ---- table 3: SAYS, the ten guide links on the Danish front page ------
    t3 = []
    for url, full, text in ps:
        if not url.startswith("/da/"):
            continue
        for m in re.finditer(r'<a href="(/guides/[^"#?]+)"[^>]*>(.*?)</a>', text, flags=re.S):
            target, label = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
            label = re.sub(r"\s+", " ", label).strip()
            # the sentence the link sits in, and the card it sits in
            before = text[max(0, m.start() - 400):m.start()]
            card = re.findall(r'<a[^>]*href="/guides/[^"#?]+"', before)
            lang_note = re.findall(r"(?:på engelsk|engelsk|english|\(EN\))", before, flags=re.I)
            t3.append((url, target, label, bool(lang_note), len(card) > 1))
    w3 = max((len(r[1]) for r in t3), default=20)
    print("TABEL 3 — SAYS (siger den danske side, at linket fører til engelsk?)")
    for r in t3:
        print(f"  {r[0]:<{w}}  {r[1]:<{w3}}  note={str(r[3]):<5} i_kort={str(r[4]):<5} {r[2][:40]}")
    t3_bad = [r for r in t3 if not r[3]]
    print(f"  -> {len(t3) - len(t3_bad)} af {len(t3)} links med en note, {len(t3_bad)} uden\n")

    # ---- what a Danish reader actually follows ----------------------------
    print("HVAD EN DANSK LÆSER FØLGER")
    for url, full, text in ps:
        if not url.startswith("/da/"):
            continue
        en = sorted({m.group(1) for m in re.finditer(r'href="(/guides/[^"#?]+)"', text)})
        da_guides = sorted({m.group(1) for m in re.finditer(r'href="(/da/guides/[^"#?]+)"', text)})
        exists_ = os.path.isdir(os.path.join(SITE, "da", "guides"))
        print(f"  {url}: {len(en)} links til /guides/…, {len(da_guides)} til /da/guides/…, "
              f"/da/guides/ {'findes' if exists_ else 'findes IKKE'}")
        for e in en:
            print(f"      {e} -> {canon_lang(open(os.path.join(SITE, e.lstrip('/'), 'index.html'), encoding='utf-8').read())}")

    print(f"\nTABEL 1: {len(t1_bad)} af {len(t1)}   TABEL 2: {len(t2_bad)} af {len(t2)}   "
          f"TABEL 3: {len(t3_bad)} af {len(t3)}")
    return 0 if not (t1_bad or t2_bad) else 0


if __name__ == "__main__":
    sys.exit(main())
