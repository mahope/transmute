#!/usr/bin/env python3
"""Apply the shared site chrome to every page in site/.

Rewrites header, footer, head metadata, breadcrumbs, guide navigation and
JSON-LD so that all pages stay in the same system. Idempotent: run it again
after editing a page's content and the chrome is regenerated in place.

    python tools/site_chrome.py
"""
from __future__ import annotations

import html
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "https://transmute.run"
TODAY = date.today().isoformat()
PUBLISHED = "2026-09-06"

FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"

# Order matters: it is the order on the front page and for previous/next links.
GUIDES = [
    ("json-to-csv-pipeline", "JSON to CSV with filters", "Clean spreadsheets from API data: pick columns, filter rows, sort, dedupe.", "table"),
    ("csv-to-sql", "CSV to SQL INSERT statements", "Seed Postgres, MySQL or SQLite from a spreadsheet export.", "db"),
    ("json-to-sql", "JSON to SQL INSERT statements", "Shape rows first, then generate statements with correct escaping and NULLs.", "db"),
    ("flatten-nested-json", "Flatten nested JSON arrays", "One row per array element, ready for CSV.", "flatten"),
    ("join-two-files", "Join two files by a shared key", "A left join from the terminal, without Python or SQLite.", "join"),
    ("add-computed-fields", "Add computed fields", "Totals, tax and derived flags from existing columns.", "plus"),
    ("jq-alternative", "Filtering JSON without learning jq", "Named steps instead of jq syntax, with format conversion built in.", "filter"),
    ("xml-to-json", "XML to JSON", "From the command line or in Python, with the caveats spelled out.", "braces"),
    ("json-to-xml", "JSON to XML", "Well-formed XML from a JSON array, plus the Python equivalent.", "tag"),
    ("csv-to-xml", "CSV to XML", "Spreadsheet exports as XML, with filtering on the way.", "tag"),
]

ICONS = {
    "table": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/>',
    "db": '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    "flatten": '<path d="M4 6h16M4 12h10M4 18h16"/><path d="M17 10l3 2-3 2"/>',
    "join": '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
    "plus": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 9v6M9 12h6"/>',
    "filter": '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
    "braces": '<path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3"/>',
    "tag": '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    "home": '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    "chev": '<path d="M9 6l6 6-6 6"/>',
    "chevl": '<path d="M15 6l-6 6 6 6"/>',
    "plusfaq": '<path d="M12 5v14M5 12h14"/>',
}


def icon(name: str, cls: str = "icon") -> str:
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


MARK = ('<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M6 6h12v3.2h-4.4V19H10.4V9.2H6z"/></svg>')

STRINGS = {
    "en": dict(skip="Skip to content", home="Home", guides="Guides", lang_link=("/da/", "da", "Dansk"),
               menu="Open menu", nav="Site", footer_by="Transmute is developed by",
               footer_place="Odense, Denmark.", footer_lic="CLI released under the MIT licence.",
               releases="Releases", security="Security", prev="Previous guide", next="Next guide",
               all="All guides", crumb_guides="Guides"),
    "da": dict(skip="Spring til indhold", home="Forside", guides="Guides", lang_link=("/", "en", "English"),
               menu="Åbn menu", nav="Site", footer_by="Transmute er udviklet af",
               footer_place="Odense, Danmark.", footer_lic="CLI'en er udgivet under MIT-licensen.",
               releases="Udgivelser", security="Sikkerhed", prev="Forrige guide", next="Næste guide",
               all="Alle guides", crumb_guides="Guides"),
}


def header(lang: str, current: str) -> str:
    s = STRINGS[lang]
    home = "/da/" if lang == "da" else "/"
    guides = "#guides" if current == "home" else "/#guides"
    cur_home = ' aria-current="page"' if current == "home" else ""
    cur_guides = ' aria-current="page"' if current == "guide" else ""
    ll = s["lang_link"]
    return f'''<header class="site-header">
  <div class="wrap">
    <a class="wordmark" href="{home}">{MARK}<span>transmute</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="{s["menu"]}">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line class="l1" x1="4" y1="6" x2="20" y2="6"/><line class="l2" x1="4" y1="12" x2="20" y2="12"/><line class="l3" x1="4" y1="18" x2="20" y2="18"/></svg>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="{s["nav"]}">
      <ul>
        <li><a href="{home}"{cur_home}>{s["home"]}</a></li>
        <li><a href="{guides}"{cur_guides}>{s["guides"]}</a></li>
        <li><a href="https://github.com/mahope/transmute">GitHub</a></li>
        <li><a href="https://www.npmjs.com/package/@mahope/transmute">npm</a></li>
        <li><a href="{ll[0]}" lang="{ll[1]}" hreflang="{ll[1]}">{ll[2]}</a></li>
      </ul>
    </nav>
  </div>
</header>'''


def footer(lang: str) -> str:
    s = STRINGS[lang]
    ll = s["lang_link"]
    return f'''<footer class="site-footer">
  <div class="wrap">
    <div>
      <p>{s["footer_by"]} <a href="https://mahoje.dk">Mads Holst Jensen, mahoje.dk</a>, {s["footer_place"]}</p>
      <p>{s["footer_lic"]}</p>
    </div>
    <ul>
      <li><a href="/#guides">{s["guides"]}</a></li>
      <li><a href="https://github.com/mahope/transmute">GitHub</a></li>
      <li><a href="https://www.npmjs.com/package/@mahope/transmute">npm</a></li>
      <li><a href="https://github.com/mahope/transmute/releases">{s["releases"]}</a></li>
      <li><a href="/.well-known/security.txt">{s["security"]}</a></li>
      <li><a href="{ll[0]}" lang="{ll[1]}" hreflang="{ll[1]}">{ll[2]}</a></li>
    </ul>
  </div>
</footer>'''


def head_common(url: str, lang: str, og_image: str, og_type: str, og_alt: str) -> str:
    locale = "da_DK" if lang == "da" else "en_US"
    return f'''<meta name="theme-color" content="#0f7b6c">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:site_name" content="Transmute">
<meta property="og:locale" content="{locale}">
<meta property="og:type" content="{og_type}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{html.escape(og_alt, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{og_image}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="/style.css">
<script src="/site.js"></script>'''


def strip_head(head: str) -> str:
    """Remove everything the chrome regenerates, keep title/description/canonical/hreflang/og:title/og:description/robots."""
    patterns = [
        r'<meta name="theme-color"[^>]*>\n?',
        r'<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\n?',
        r'<meta property="og:(?:site_name|locale|type|url|image|image:width|image:height|image:alt)"[^>]*>\n?',
        r'<meta name="twitter:[^"]*"[^>]*>\n?',
        r'<link rel="preconnect"[^>]*>\n?',
        r'<link rel="stylesheet"[^>]*>\n?',
        r'<script src="/site.js"></script>\n?',
        r'<script type="application/ld\+json">.*?</script>\n?',
    ]
    for p in patterns:
        head = re.sub(p, "", head, flags=re.S)
    return head.strip("\n") + "\n"


def jsonld(data) -> str:
    return '<script type="application/ld+json">\n' + json.dumps(data, ensure_ascii=False, indent=2) + '\n</script>'


PERSON = {"@type": "Person", "@id": "https://mahoje.dk/#person", "name": "Mads Holst Jensen", "url": "https://mahoje.dk"}
ORG = {"@type": "Organization", "@id": "https://mahoje.dk/#org", "name": "mahoje.dk", "url": "https://mahoje.dk",
       "founder": {"@id": "https://mahoje.dk/#person"}, "logo": BASE + "/icon-512.png"}


def faq_from(body: str, lang: str):
    items = []
    for q, a in re.findall(r"<summary>(.*?)</summary>\s*<p>(.*?)</p>", body, flags=re.S):
        items.append({"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}})
    return {"@type": "FAQPage", "@id": f"{BASE}/{'da/' if lang == 'da' else ''}#faq", "inLanguage": lang, "mainEntity": items}


def clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def front_jsonld(lang: str, body: str, title: str, desc: str) -> str:
    url = BASE + ("/da/" if lang == "da" else "/")
    app = {
        "@type": "SoftwareApplication", "@id": BASE + "/#app", "name": "Transmute",
        "url": BASE + "/", "description": desc, "inLanguage": lang,
        "applicationCategory": "DeveloperApplication", "applicationSubCategory": "Data conversion",
        "operatingSystem": "macOS, Windows, Linux", "softwareVersion": version(),
        "downloadUrl": "https://www.npmjs.com/package/@mahope/transmute",
        "installUrl": "https://www.npmjs.com/package/@mahope/transmute",
        "softwareHelp": {"@type": "CreativeWork", "url": BASE + "/#guides"},
        "license": "https://opensource.org/licenses/MIT",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "author": {"@id": "https://mahoje.dk/#person"}, "publisher": {"@id": "https://mahoje.dk/#org"},
        "image": BASE + "/og/home.png",
    }
    site = {"@type": "WebSite", "@id": BASE + "/#website", "url": BASE + "/", "name": "Transmute",
            "inLanguage": ["en", "da"], "publisher": {"@id": "https://mahoje.dk/#org"}}
    page = {"@type": "WebPage", "@id": url, "url": url, "name": title, "description": desc, "inLanguage": lang,
            "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#app"},
            "primaryImageOfPage": BASE + "/og/home.png", "dateModified": TODAY}
    return jsonld({"@context": "https://schema.org", "@graph": [app, ORG, PERSON, site, page, faq_from(body, lang)]})


def guide_jsonld(slug: str, title: str, desc: str, headline: str) -> str:
    url = f"{BASE}/guides/{slug}/"
    art = {
        "@type": "TechArticle", "@id": url + "#article", "headline": headline, "name": title, "description": desc,
        "url": url, "mainEntityOfPage": url, "inLanguage": "en", "proficiencyLevel": "Beginner",
        "image": f"{BASE}/og/{slug}.png", "datePublished": PUBLISHED, "dateModified": TODAY,
        "author": {"@id": "https://mahoje.dk/#person"}, "publisher": {"@id": "https://mahoje.dk/#org"},
        "about": {"@id": BASE + "/#app"}, "isPartOf": {"@id": BASE + "/#website"},
    }
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Transmute", "item": BASE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Guides", "item": BASE + "/#guides"},
        {"@type": "ListItem", "position": 3, "name": title, "item": url},
    ]}
    return jsonld({"@context": "https://schema.org", "@graph": [art, crumbs, PERSON, ORG]})


def version() -> str:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]


def get(pattern: str, text: str) -> str:
    m = re.search(pattern, text, flags=re.S)
    return html.unescape(m.group(1)).strip() if m else ""


def guide_nav(i: int) -> str:
    s = STRINGS["en"]
    parts = ['<nav class="guide-nav" aria-label="Guide navigation">']
    if i > 0:
        slug, title = GUIDES[i - 1][0], GUIDES[i - 1][1]
        parts.append(f'  <a class="prev" href="/guides/{slug}/"><small>{icon("chevl")}{s["prev"]}</small><strong>{title}</strong></a>')
    else:
        parts.append(f'  <a class="prev" href="/#guides"><small>{icon("chevl")}{s["all"]}</small><strong>Transmute</strong></a>')
    if i < len(GUIDES) - 1:
        slug, title = GUIDES[i + 1][0], GUIDES[i + 1][1]
        parts.append(f'  <a class="next" href="/guides/{slug}/"><small>{s["next"]}{icon("chev")}</small><strong>{title}</strong></a>')
    else:
        parts.append(f'  <a class="next" href="/#guides"><small>{s["all"]}{icon("chev")}</small><strong>Transmute</strong></a>')
    parts.append("</nav>")
    return "\n".join(parts)


def crumbs(title: str) -> str:
    return (f'<nav class="crumbs" aria-label="Breadcrumb"><ol>'
            f'<li><a href="/">{icon("home")}<span>Transmute</span></a>{icon("chev")}</li>'
            f'<li><a href="/#guides">Guides</a>{icon("chev")}</li>'
            f'<li><span aria-current="page">{html.escape(title)}</span></li></ol></nav>')


def guide_list(lang: str, body: str) -> str:
    """Rebuild the guide list on the front page, keeping the page's own link texts."""
    out = ['<ul class="guide-list">']
    for slug, title, desc, ic in GUIDES:
        m = re.search(rf'<li><a href="/guides/{slug}/"[^>]*>(.*?)</a><span>(.*?)</span></li>', body, flags=re.S)
        text, sub = (m.group(1), m.group(2)) if m else (title, desc)
        hl = ' hreflang="en"' if lang == "da" else ""
        out.append(f'      <li><a href="/guides/{slug}/"{hl}>{icon(ic)}<span class="t">{text}<span>{sub}</span></span></a></li>')
    out.append("    </ul>")
    return "\n".join(out)


def process(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    lang = "da" if '<html lang="da">' in text else "en"
    rel = path.relative_to(SITE).as_posix()
    is_guide = rel.startswith("guides/")
    is_404 = rel == "404.html"
    slug = rel.split("/")[1] if is_guide else ""

    head = get(r"<head>(.*?)</head>", text)
    head_raw = re.search(r"<head>(.*?)</head>", text, flags=re.S).group(1)
    body = re.search(r"<body>(.*)</body>", text, flags=re.S).group(1)

    title = get(r"<title>(.*?)</title>", head_raw)
    desc = get(r'<meta name="description" content="(.*?)"', head_raw)
    url = get(r'<link rel="canonical" href="(.*?)"', head_raw)

    kept = strip_head(head_raw)
    if is_guide:
        gi = [g[0] for g in GUIDES].index(slug)
        short = GUIDES[gi][1]
        h1 = get(r"<h1>(.*?)</h1>", body)
        if 'hreflang="en"' not in kept:
            kept = kept.replace('<link rel="canonical"', f'<link rel="alternate" hreflang="en" href="{url}">\n<link rel="alternate" hreflang="x-default" href="{url}">\n<link rel="canonical"', 1)
        og_image = f"{BASE}/og/{slug}.png"
        og_alt = f"{h1} – Transmute guide"
        extra = head_common(url, lang, og_image, "article", og_alt)
        extra += f'\n<meta property="article:published_time" content="{PUBLISHED}">\n<meta property="article:modified_time" content="{TODAY}">\n<meta property="article:author" content="https://mahoje.dk">'
        extra += "\n" + guide_jsonld(slug, short, desc, h1)
    elif is_404:
        og_image = f"{BASE}/og/home.png"
        extra = head_common(BASE + "/404.html", lang, og_image, "website", "Transmute")
        extra = re.sub(r'<meta property="og:url"[^>]*>\n', "", extra)
    else:
        og_image = f"{BASE}/og/home.png" if lang == "en" else f"{BASE}/og/home-da.png"
        extra = head_common(url, lang, og_image, "website", title)
        extra += "\n" + front_jsonld(lang, body, title, desc)

    new_head = kept + extra + "\n"

    # Body chrome
    current = "guide" if is_guide else ("home" if not is_404 else "none")
    body = re.sub(r'<a class="skip"[^>]*>.*?</a>\n?', "", body, count=1, flags=re.S)
    body = re.sub(r'<header class="site-header">.*?</header>', header(lang, current), body, count=1, flags=re.S)
    body = re.sub(r'<footer class="site-footer">.*?</footer>', footer(lang), body, count=1, flags=re.S)
    body = f'\n<a class="skip" href="#main">{STRINGS[lang]["skip"]}</a>\n' + body.lstrip("\n")

    if is_guide:
        gi = [g[0] for g in GUIDES].index(slug)
        short = GUIDES[gi][1]
        body = re.sub(r'<nav class="crumbs".*?</nav>\n?', "", body, count=1, flags=re.S)
        body = re.sub(r'<nav class="guide-nav".*?</nav>\n?', "", body, count=1, flags=re.S)
        body = body.replace("<article>\n", "<article>\n" + crumbs(short) + "\n", 1)
        body = re.sub(r"(<h1>.*?</h1>)\n+", r"\1\n\n", body, count=1, flags=re.S)
        body = body.replace("</aside>\n", "</aside>\n\n" + guide_nav(gi) + "\n", 1)
    elif not is_404:
        body = re.sub(r'<ul class="guide-list">.*?</ul>', guide_list(lang, body), body, count=1, flags=re.S)
        # FAQ toggles: an inline plus icon that rotates when open
        body = re.sub(r"<summary>(?:<span>)?(.*?)(?:</span>)?(?:<svg class=\"icon\".*?</svg>)?</summary>",
                      lambda m: f"<summary><span>{m.group(1)}</span>{icon('plusfaq')}</summary>", body, flags=re.S)

    if not is_404:
        # main must carry id=main for the skip link
        body = body.replace('<main class="', '<main id="main" class="', 1) if '<main id=' not in body else body

    out = re.sub(r"<head>.*?</head>", lambda m: "<head>\n" + new_head + "</head>", text, count=1, flags=re.S)
    out = re.sub(r"<body>.*</body>", lambda m: "<body>" + body + "</body>", out, count=1, flags=re.S)
    if out != text:
        path.write_text(out, encoding="utf-8", newline="\n")
        print("updated", rel)


def write_sitemap() -> None:
    urls = []
    def entry(loc, alts=None, lastmod=TODAY):
        s = f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n"
        for hl, href in (alts or []):
            s += f'    <xhtml:link rel="alternate" hreflang="{hl}" href="{href}"/>\n'
        return s + "  </url>"
    home_alts = [("en", BASE + "/"), ("da", BASE + "/da/"), ("x-default", BASE + "/")]
    urls.append(entry(BASE + "/", home_alts))
    urls.append(entry(BASE + "/da/", home_alts))
    for slug, *_ in GUIDES:
        u = f"{BASE}/guides/{slug}/"
        urls.append(entry(u, [("en", u), ("x-default", u)]))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    (SITE / "sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")


def main() -> int:
    for path in sorted(SITE.rglob("*.html")):
        process(path)
    write_sitemap()
    return 0


if __name__ == "__main__":
    sys.exit(main())
