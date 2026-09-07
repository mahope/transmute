#!/usr/bin/env python3
"""SEO and metadata check for every page in site/ (or against a live site).

Reports, per page, what is missing or wrong: title, description, canonical,
hreflang, Open Graph, Twitter card, JSON-LD, single h1, alt texts, lang,
viewport, icons. Exit code is the number of findings, so 0 means clean.

    python tools/seo_check.py                       # local files in site/
    python tools/seo_check.py --base https://transmute.run   # fetch live pages
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "https://transmute.run"


def pages() -> list[tuple[str, Path]]:
    out = []
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).as_posix()
        if rel == "404.html":
            url = "/404.html"
        else:
            url = "/" + rel.replace("index.html", "")
        out.append((url, p))
    return out


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "transmute-seo-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def attr(tag_re: str, text: str) -> list[str]:
    return re.findall(tag_re, text, flags=re.S)


def check(url: str, text: str) -> list[str]:
    f: list[str] = []
    head = re.search(r"<head>(.*?)</head>", text, flags=re.S)
    head = head.group(1) if head else ""
    body = re.search(r"<body[^>]*>(.*)</body>", text, flags=re.S)
    body = body.group(1) if body else text
    is_404 = url.endswith("404.html")
    full = BASE + url

    lang = re.search(r'<html lang="([a-z]{2})"', text)
    if not lang:
        f.append("missing <html lang>")
    if '<meta charset="utf-8">' not in head.lower():
        f.append("missing charset")
    if 'name="viewport"' not in head:
        f.append("missing viewport")

    title = attr(r"<title>(.*?)</title>", head)
    if not title:
        f.append("missing <title>")
    elif not (10 <= len(title[0]) <= 70):
        f.append(f"title length {len(title[0])} (want 10-70)")

    desc = attr(r'<meta name="description" content="(.*?)"', head)
    if not is_404:
        if not desc:
            f.append("missing meta description")
        elif not (50 <= len(desc[0]) <= 320):
            f.append(f"description length {len(desc[0])} (want 50-320)")

    canon = attr(r'<link rel="canonical" href="(.*?)"', head)
    if is_404:
        if 'name="robots" content="noindex"' not in head:
            f.append("404 should be noindex")
    else:
        if not canon:
            f.append("missing canonical")
        elif canon[0] != full:
            f.append(f"canonical {canon[0]} != {full}")
        hl = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', head))
        if "x-default" not in hl:
            f.append("missing hreflang x-default")
        if "en" not in hl:
            f.append("missing hreflang en")
        if url in ("/", "/da/") and "da" not in hl:
            f.append("missing hreflang da")

    for prop in ("og:title", "og:description", "og:url", "og:type", "og:image", "og:site_name", "og:locale", "og:image:alt"):
        if is_404 and prop in ("og:url", "og:description"):
            continue
        if f'property="{prop}"' not in head:
            f.append(f"missing {prop}")
    ogurl = attr(r'<meta property="og:url" content="(.*?)"', head)
    if ogurl and ogurl[0] != full and not is_404:
        f.append(f"og:url {ogurl[0]} != {full}")
    if 'name="twitter:card"' not in head:
        f.append("missing twitter:card")
    ogimg = attr(r'<meta property="og:image" content="(.*?)"', head)
    if ogimg and not ogimg[0].startswith("https://"):
        f.append("og:image not absolute")

    for rel in ("icon", "apple-touch-icon", "manifest"):
        if f'rel="{rel}"' not in head:
            f.append(f"missing link rel={rel}")

    ld = attr(r'<script type="application/ld\+json">(.*?)</script>', head)
    if not is_404:
        if not ld:
            f.append("missing JSON-LD")
        for block in ld:
            try:
                data = json.loads(block)
            except json.JSONDecodeError as e:
                f.append(f"JSON-LD invalid: {e}")
                continue
            types = {n.get("@type") for n in data.get("@graph", [data])}
            if url.startswith("/guides/") and not types & {"TechArticle", "HowTo", "Article"}:
                f.append("guide JSON-LD lacks TechArticle/HowTo")
            if url.startswith("/guides/") and "BreadcrumbList" not in types:
                f.append("guide JSON-LD lacks BreadcrumbList")
            if url in ("/", "/da/") and not {"SoftwareApplication", "FAQPage", "Organization"} <= types:
                f.append("front JSON-LD lacks SoftwareApplication/FAQPage/Organization")

    h1s = attr(r"<h1[^>]*>", body)
    if len(h1s) != 1:
        f.append(f"{len(h1s)} h1 elements (want 1)")
    for img in attr(r"<img[^>]*>", body):
        if 'alt="' not in img:
            f.append("img without alt")
    for svg in attr(r"<svg[^>]*>", body):
        if 'aria-hidden="true"' not in svg and "<title>" not in svg and 'role="img"' not in svg:
            f.append("inline svg without aria-hidden or title")
    if '<main' not in body:
        f.append("missing <main>")
    if 'class="skip"' not in body:
        f.append("missing skip link")
    if "<nav" not in body:
        f.append("missing <nav>")
    if "nav-toggle" not in body:
        f.append("missing mobile nav toggle")
    if url.startswith("/guides/"):
        if 'class="crumbs"' not in body:
            f.append("guide without breadcrumb")
        if 'class="guide-nav"' not in body:
            f.append("guide without previous/next navigation")
    for a in re.findall(r'<a ([^>]*)>', body):
        if 'href="http' in a and 'target="_blank"' in a and 'rel="' not in a:
            f.append("target=_blank without rel")
    return f


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="check live pages under this base URL instead of local files")
    args = ap.parse_args()
    total = 0
    for url, path in pages():
        if args.base:
            status, text = fetch(args.base.rstrip("/") + url)
            if status != (404 if url.endswith("404.html") else 200):
                print(f"{url}: HTTP {status}")
                total += 1
        else:
            text = path.read_text(encoding="utf-8")
        findings = check(url, text)
        total += len(findings)
        print(f"{url}: {'ok' if not findings else ''}")
        for line in findings:
            print(f"  - {line}")
    print(f"\n{total} finding(s) across {len(pages())} pages")
    return min(total, 255)


if __name__ == "__main__":
    sys.exit(main())
