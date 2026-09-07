#!/usr/bin/env python3
"""Apply the shared site chrome to every page in site/.

Rewrites family bar, header, footer, head metadata, breadcrumbs, table of
contents, guide navigation, JSON-LD, the BugBottle tag, the search index and
the sitemap so that all pages stay in the same system. Idempotent: run it
again after editing a page's content and the chrome is regenerated in place.

    python tools/site_chrome.py
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "https://transmute.run"
TODAY = date.today().isoformat()
PUBLISHED = "2026-09-06"
ACCENT = "#0f7b6c"

BUGBOTTLE_SRC = "https://cdn.jsdelivr.net/npm/bugbottle@0.5.0/dist/bugbottle.js"

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

# The Mahope family, in the order every site shows it.
FAMILY = [
    ("EUComply", "https://eucomplypro.com"),
    ("Clean Copy", "https://cleancopy.tools"),
    ("DeskUptime", "https://deskuptime.com"),
    ("Transmute", "https://transmute.run"),
    ("BugBottle", "https://bugbottle.dev"),
]
FAMILY_ALL = ("All tools", "https://mahope.tools")

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
    "search": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "bug": '<path d="M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0z"/><path d="M12 15v6M4 12h4M16 12h4M5 6l3 2M19 6l-3 2M5 19l3-2M19 19l-3-2"/>',
}


def icon(name: str, cls: str = "icon") -> str:
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


MARK = ('<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M6 6h12v3.2h-4.4V19H10.4V9.2H6z"/></svg>')

STRINGS = {
    "en": dict(skip="Skip to content", home="Home", guides="Guides", download="Download", nav="Site",
               search="Search", search_hint="Search guides, operations and questions",
               lang_other=("da", "DA", "Dansk"), theme="Theme", theme_light="Switch to light theme",
               theme_dark="Switch to dark theme", theme_system="Use system theme", menu="Open menu",
               family="Mahope tools:", family_label="Mahope tools",
               f_product="Transmute converts JSON, CSV, YAML, XML and SQL offline, from the terminal or a small desktop app.",
               f_install="Install the CLI", f_desktop="Desktop app", f_releases="Releases", f_cheatsheet="Cheat sheet",
               f_family="Family", f_site="Site", f_privacy="Privacy", f_security="Security", f_sitemap="Sitemap",
               f_report="Report a bug", f_badge="Feedback powered by",
               f_built='Built by Mads Holst Jensen · <a href="https://mahoje.dk">mahoje.dk</a> — developer and technical partner for small businesses, Odense, Denmark.',
               f_cookies="No cookies, no trackers — only an anonymous page-view counter we run ourselves.",
               f_lic="CLI and engine under the MIT licence.",
               prev="Previous guide", next="Next guide", all="All guides", crumb_guides="Guides",
               toc="On this page", updated="Updated", read="min read", share="Copy link", shared="Link copied",
               top="Back to top", footer_nav="Footer"),
    "da": dict(skip="Spring til indhold", home="Forside", guides="Guides", download="Download", nav="Site",
               search="Søg", search_hint="Søg i guides, operationer og spørgsmål",
               lang_other=("en", "EN", "English"), theme="Tema", theme_light="Skift til lyst tema",
               theme_dark="Skift til mørkt tema", theme_system="Brug systemets tema", menu="Åbn menu",
               family="Mahope tools:", family_label="Mahope tools",
               f_product="Transmute konverterer JSON, CSV, YAML, XML og SQL offline, fra terminalen eller en lille desktop-app.",
               f_install="Installér CLI'en", f_desktop="Desktop-app", f_releases="Udgivelser", f_cheatsheet="Cheat sheet",
               f_family="Familie", f_site="Site", f_privacy="Privatliv", f_security="Sikkerhed", f_sitemap="Sitemap",
               f_report="Meld en fejl", f_badge="Feedback drevet af",
               f_built='Lavet af Mads Holst Jensen · <a href="https://mahoje.dk">mahoje.dk</a> — udvikler og teknisk partner for små virksomheder, Odense.',
               f_cookies="Ingen cookies, ingen trackere — kun en anonym sidevisningstæller, vi selv kører.",
               f_lic="CLI og motor under MIT-licensen.",
               prev="Forrige guide", next="Næste guide", all="Alle guides", crumb_guides="Guides",
               toc="På denne side", updated="Opdateret", read="min. læsning", share="Kopiér link", shared="Link kopieret",
               top="Til toppen", footer_nav="Footer"),
}


def home_url(lang: str) -> str:
    return "/da/" if lang == "da" else "/"


def family_bar(lang: str) -> str:
    s = STRINGS[lang]
    items = []
    for name, url in FAMILY:
        cur = ' aria-current="true"' if url == BASE else ""
        items.append(f'<li><a href="{url}"{cur}>{name}</a></li>')
    items.append(f'<li class="all"><a href="{FAMILY_ALL[1]}">{FAMILY_ALL[0]}</a></li>')
    return (f'<div class="family-bar"><nav class="container" aria-label="{s["family_label"]}">'
            f'<span>{s["family"]}</span><ul>{"".join(items)}</ul></nav></div>')


def lang_switch(lang: str, alt_url: str | None, cls: str = "lang-switch") -> str:
    code, label, name = STRINGS[lang]["lang_other"]
    if alt_url:
        return f'<a class="{cls}" href="{alt_url}" lang="{code}" hreflang="{code}" aria-label="{name}">{label}</a>'
    return f'<span class="{cls} is-hidden" aria-hidden="true">{label}</span>'


def header(lang: str, current: str, alt_url: str | None) -> str:
    s = STRINGS[lang]
    home = home_url(lang)
    search = "/da/search/" if lang == "da" else "/search/"
    cur = lambda k: ' aria-current="page"' if current == k else ""  # noqa: E731
    return f'''{family_bar(lang)}
<header class="site-header">
  <div class="container">
    <a class="brand" href="{home}"{cur("home")}>{MARK}<span>transmute</span></a>
    <nav class="site-nav" id="site-nav" aria-label="{s["nav"]}">
      <ul>
        <li><a href="{home}#guides"{cur("guides")}>{s["guides"]}</a></li>
        <li><a href="{home}#install"{cur("download")}>{s["download"]}</a></li>
        <li><a href="https://www.npmjs.com/package/@mahope/transmute">npm</a></li>
        <li><a href="https://github.com/mahope/transmute">GitHub</a></li>
      </ul>
    </nav>
    <div class="header-tools">
      <a class="search-open" href="{search}" aria-keyshortcuts="Control+K" title="{s["search_hint"]}" data-index="{INDEX_URL}">{icon("search")}<span>{s["search"]}</span><kbd>⌘K</kbd></a>
      {lang_switch(lang, alt_url)}
      <button class="theme-toggle" type="button" aria-label="{s["theme"]}" data-light="{s["theme_light"]}" data-dark="{s["theme_dark"]}" data-system="{s["theme_system"]}">{icon("sun", "icon sun")}{icon("moon", "icon moon")}</button>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="{s["menu"]}">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line class="l1" x1="4" y1="6" x2="20" y2="6"/><line class="l2" x1="4" y1="12" x2="20" y2="12"/><line class="l3" x1="4" y1="18" x2="20" y2="18"/></svg>
      </button>
    </div>
  </div>
</header>'''


def footer(lang: str, alt_url: str | None) -> str:
    s = STRINGS[lang]
    home = home_url(lang)
    fam = "".join(f'<li><a href="{u}"{" aria-current=\"true\"" if u == BASE else ""}>{n}</a></li>' for n, u in FAMILY)
    fam += f'<li><a href="{FAMILY_ALL[1]}">{FAMILY_ALL[0]}</a></li>'
    privacy = "/da/privacy/" if lang == "da" else "/privacy/"
    return f'''<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col">
        <a class="brand" href="{home}">{MARK}<span>transmute</span></a>
        <p>{s["f_product"]}</p>
        <ul>
          <li><a href="{home}#install">{s["f_install"]}</a></li>
          <li><a href="https://github.com/mahope/transmute/releases">{s["f_desktop"]}</a></li>
          <li><a href="/cheatsheet/">{s["f_cheatsheet"]}</a></li>
          <li><a href="https://github.com/mahope/transmute">GitHub</a></li>
          <li><a href="https://github.com/mahope/transmute/releases">{s["f_releases"]}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h2>{s["f_family"]}</h2>
        <ul>{fam}</ul>
      </div>
      <div class="footer-col">
        <h2>{s["f_site"]}</h2>
        <ul>
          <li><a href="{privacy}">{s["f_privacy"]}</a></li>
          <li><a href="/.well-known/security.txt">{s["f_security"]}</a></li>
          <li><a href="/llms.txt">llms.txt</a></li>
          <li><a href="/sitemap.xml">{s["f_sitemap"]}</a></li>
          <li><a class="report-bug" href="https://github.com/mahope/transmute/issues">{icon("bug")}{s["f_report"]}</a></li>
        </ul>
        <p class="bb-badge">{s["f_badge"]} <a href="https://bugbottle.dev">BugBottle</a></p>
      </div>
      <div class="footer-col">
        <p>{s["f_built"]}</p>
        <p>{s["f_cookies"]}</p>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© {TODAY[:4]} Mads Holst Jensen · {s["f_lic"]}</p>
      {lang_switch(lang, alt_url, "lang-switch lang-switch-footer")}
    </div>
  </div>
</footer>'''


def bugbottle(lang: str) -> str:
    return (f'<script src="{BUGBOTTLE_SRC}" data-endpoint="https://mahope.tools/api/bugreport" '
            f'data-locale="{lang}" data-primary="{ACCENT}" data-brand="Transmute" data-position="bottom-right" '
            f'data-scrub defer></script>')


def asset(path: str) -> str:
    """Versioned asset URL, so the 24h edge cache never serves a stale stylesheet or script with new HTML."""
    digest = hashlib.md5((SITE / path.lstrip("/")).read_bytes()).hexdigest()[:8]
    return f"{path}?v={digest}"


def head_common(url: str, lang: str, og_image: str, og_type: str, og_alt: str) -> str:
    locale = "da_DK" if lang == "da" else "en_US"
    return f'''<meta name="theme-color" content="{ACCENT}">
<meta name="color-scheme" content="light dark">
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
<link rel="preload" href="/fonts/plex-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{asset("/style.css")}">
<script src="{asset("/theme.js")}"></script>
<script src="{asset("/site.js")}" defer></script>'''


def strip_head(head: str) -> str:
    """Remove everything the chrome regenerates, keep title/description/canonical/hreflang/og:title/og:description/robots."""
    patterns = [
        r'<meta name="theme-color"[^>]*>\n?',
        r'<meta name="color-scheme"[^>]*>\n?',
        r'<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\n?',
        r'<meta property="og:(?:site_name|locale|type|url|image|image:width|image:height|image:alt)"[^>]*>\n?',
        r'<meta property="article:[^"]*"[^>]*>\n?',
        r'<meta name="twitter:[^"]*"[^>]*>\n?',
        r'<link rel="preconnect"[^>]*>\n?',
        r'<link rel="preload"[^>]*>\n?',
        r'<link rel="stylesheet"[^>]*>\n?',
        r'<script src="/(?:site|theme).js[^"]*"[^>]*></script>\n?',
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
WEBSITE = {"@type": "WebSite", "@id": BASE + "/#website", "url": BASE + "/", "name": "Transmute",
           "inLanguage": ["en", "da"], "publisher": {"@id": "https://mahoje.dk/#org"},
           "potentialAction": {"@type": "SearchAction", "target": {"@type": "EntryPoint", "urlTemplate": BASE + "/search/?q={search_term_string}"},
                               "query-input": "required name=search_term_string"}}


def faq_from(body: str, lang: str):
    items = []
    for q, a in re.findall(r"<summary>(.*?)</summary>\s*<p>(.*?)</p>", body, flags=re.S):
        items.append({"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}})
    return {"@type": "FAQPage", "@id": f"{BASE}{home_url(lang)}#faq", "inLanguage": lang, "mainEntity": items}


def clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def slugify(s: str) -> str:
    s = clean(s).lower()
    s = re.sub(r"[^a-z0-9æøå]+", "-", s).strip("-")
    return s[:60] or "section"


def version() -> str:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]


def front_jsonld(lang: str, body: str, title: str, desc: str) -> str:
    url = BASE + home_url(lang)
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
    page = {"@type": "WebPage", "@id": url, "url": url, "name": title, "description": desc, "inLanguage": lang,
            "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#app"},
            "primaryImageOfPage": BASE + "/og/home.png", "dateModified": TODAY}
    return jsonld({"@context": "https://schema.org", "@graph": [app, ORG, PERSON, WEBSITE, page, faq_from(body, lang)]})


def crumb_list(items: list[tuple[str, str]]):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}


def guide_jsonld(slug: str, title: str, desc: str, headline: str, modified: str) -> str:
    url = f"{BASE}/guides/{slug}/"
    art = {
        "@type": "TechArticle", "@id": url + "#article", "headline": headline, "name": title, "description": desc,
        "url": url, "mainEntityOfPage": url, "inLanguage": "en", "proficiencyLevel": "Beginner",
        "image": f"{BASE}/og/{slug}.png", "datePublished": PUBLISHED, "dateModified": modified,
        "author": {"@id": "https://mahoje.dk/#person"}, "publisher": {"@id": "https://mahoje.dk/#org"},
        "about": {"@id": BASE + "/#app"}, "isPartOf": {"@id": BASE + "/#website"},
    }
    crumbs = crumb_list([("Transmute", BASE + "/"), ("Guides", BASE + "/#guides"), (title, url)])
    return jsonld({"@context": "https://schema.org", "@graph": [art, crumbs, PERSON, ORG]})


def doc_jsonld(url: str, lang: str, title: str, desc: str, crumbs: list[tuple[str, str]], modified: str) -> str:
    page = {"@type": "WebPage", "@id": url, "url": url, "name": title, "description": desc, "inLanguage": lang,
            "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#app"}, "dateModified": modified}
    return jsonld({"@context": "https://schema.org", "@graph": [page, crumb_list(crumbs), PERSON, ORG]})


def get(pattern: str, text: str) -> str:
    m = re.search(pattern, text, flags=re.S)
    return html.unescape(m.group(1)).strip() if m else ""


def git_date(path: Path) -> str:
    """Last commit date for a file, falling back to today for uncommitted pages."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        out = ""
    return out or TODAY


def nice_date(iso: str, lang: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    months = {"en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
              "da": ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"]}[lang]
    return f"{d}. {months[m - 1]} {y}" if lang == "da" else f"{d} {months[m - 1]} {y}"


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


def crumbs_html(items: list[tuple[str, str]], lang: str) -> str:
    out = [f'<nav class="crumbs" aria-label="Breadcrumb"><ol>']
    for i, (name, url) in enumerate(items):
        last = i == len(items) - 1
        label = f'{icon("home")}<span>{html.escape(name)}</span>' if i == 0 else html.escape(name)
        if last:
            out.append(f'<li><span aria-current="page">{label}</span></li>')
        else:
            out.append(f'<li><a href="{url}">{label}</a>{icon("chev")}</li>')
    out.append("</ol></nav>")
    return "".join(out)


def add_heading_ids(article: str) -> str:
    seen: set[str] = set()

    def sub(m):
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        idm = re.search(r'\sid="([^"]+)"', attrs)
        if idm:
            seen.add(idm.group(1))
            return m.group(0)
        base = slugify(inner)
        hid, n = base, 2
        while hid in seen:
            hid, n = f"{base}-{n}", n + 1
        seen.add(hid)
        return f'<{tag} id="{hid}"{attrs}>{inner}</{tag}>'

    return re.sub(r"<(h[23])([^>]*)>(.*?)</\1>", sub, article, flags=re.S)


def toc_html(article: str, lang: str) -> str:
    heads = re.findall(r'<(h[23]) id="([^"]+)"[^>]*>(.*?)</\1>', article, flags=re.S)
    heads = [(t, i, clean(x)) for t, i, x in heads if "aside" not in t]
    # headings inside the related-guides aside are not part of the article outline
    aside = re.search(r'<aside class="aside">.*?</aside>', article, flags=re.S)
    if aside:
        inside = set(re.findall(r'<h[23] id="([^"]+)"', aside.group(0)))
        heads = [h for h in heads if h[1] not in inside]
    if len(heads) < 2:
        return ""
    items = "".join(f'<li class="{t}"><a href="#{i}">{html.escape(x)}</a></li>' for t, i, x in heads)
    return (f'<aside class="toc-side"><details class="toc" open><summary>{STRINGS[lang]["toc"]}</summary>'
            f'<nav aria-label="{STRINGS[lang]["toc"]}"><ol>{items}</ol></nav></details></aside>')


def reading_minutes(article: str) -> int:
    words = len(clean(re.sub(r"<pre.*?</pre>", " ", article, flags=re.S)).split())
    code = len(re.findall(r"<pre", article))
    return max(1, round(words / 200 + code * 0.25))


def meta_line(lang: str, modified: str, minutes: int) -> str:
    s = STRINGS[lang]
    return (f'<p class="meta"><span>{s["updated"]} <time datetime="{modified}">{nice_date(modified, lang)}</time></span>'
            f'<span>{minutes} {s["read"]}</span>'
            f'<button class="share" type="button" data-done="{s["shared"]}">{icon("link")}<span>{s["share"]}</span></button></p>')


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


def doc_layout(inner: str, lang: str, crumbs: list[tuple[str, str]], modified: str, with_meta: bool, extra_class: str = "") -> str:
    """Wrap an <article class="prose"> in breadcrumbs + TOC sidebar."""
    inner = re.sub(r'<p class="meta">.*?</p>\n?', "", inner, count=1, flags=re.S)
    inner = add_heading_ids(inner)
    if with_meta:
        inner = re.sub(r"(<h1[^>]*>.*?</h1>)\n*", lambda m: m.group(1) + "\n" + meta_line(lang, modified, reading_minutes(inner)) + "\n", inner, count=1, flags=re.S)
    toc = toc_html(inner, lang)
    cls = "doc-layout" + (" " + extra_class if extra_class else "") + ("" if toc else " no-toc")
    return (crumbs_html(crumbs, lang) + f'\n<div class="{cls}">\n<article class="prose">' + inner + "</article>\n"
            + (toc + "\n" if toc else "") + "</div>")


INDEX: list[dict] = []
INDEX_URL = "/search-index.json"


def excerpt(s: str, n: int = 400) -> str:
    s = re.sub(r"\s+", " ", clean(s)).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def index_add(url: str, title: str, desc: str, lang: str, section: str, body: str, tags: list[str] | None = None) -> None:
    INDEX.append({"url": url, "title": clean(title), "description": excerpt(desc, 200), "lang": lang,
                  "section": section, "body": excerpt(body), "tags": tags or []})


def index_headings(url: str, article: str, lang: str, section: str, parent: str) -> None:
    parts = re.split(r'(?=<h2 id=")', article)
    for part in parts[1:]:
        m = re.match(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>(.*)', part, flags=re.S)
        if not m or m.group(1) in ("running-these-commands",):
            continue
        body = re.sub(r"<aside.*?</aside>|<nav.*?</nav>", "", m.group(3), flags=re.S)
        index_add(f"{url}#{m.group(1)}", clean(m.group(2)), parent, lang, section, body)


def index_faq(body: str, lang: str) -> None:
    for hid, q, a in re.findall(r'<details id="([^"]+)">\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>', body, flags=re.S):
        index_add(f"{home_url(lang)}#{hid}", clean(q), "", lang, "FAQ" if lang == "en" else "Spørgsmål", a)


def index_refs(url: str, article: str) -> None:
    for hid, section, inner in re.findall(r'<section class="ref" id="([^"]+)" data-section="([^"]+)">(.*?)</section>', article, flags=re.S):
        title = get(r"<h3[^>]*><a[^>]*>(.*?)</a>", inner) or get(r"<h3[^>]*>(.*?)</h3>", inner)
        sig = get(r'<span class="sig">(.*?)</span>', inner)
        desc = (sig + " — " if sig else "") + get(r"<p>(.*?)</p>", inner)
        code = " ".join(clean(c) for c in re.findall(r"<code>(.*?)</code>", inner, flags=re.S))
        tags = [t for t in re.findall(r'data-tags="([^"]+)"', inner)]
        index_add(f"{url}#{hid}", title, desc, "en", section, code, (tags[0].split() if tags else []))


def process(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    lang = "da" if '<html lang="da">' in text else "en"
    rel = path.relative_to(SITE).as_posix()
    kind = ("guide" if rel.startswith("guides/") else "404" if rel == "404.html" else "search" if rel.endswith("search/index.html")
            else "home" if rel in ("index.html", "da/index.html") else "doc")
    slug = rel.split("/")[1] if kind == "guide" else ""
    if rel == "try.html":
        return

    head_raw = re.search(r"<head>(.*?)</head>", text, flags=re.S).group(1)
    body = re.search(r"<body>(.*)</body>", text, flags=re.S).group(1)

    title = get(r"<title>(.*?)</title>", head_raw)
    desc = get(r'<meta name="description" content="(.*?)"', head_raw)
    url = get(r'<link rel="canonical" href="(.*?)"', head_raw) or BASE + "/" + rel.replace("index.html", "")
    other = "da" if lang == "en" else "en"
    alt_url = get(rf'<link rel="alternate" hreflang="{other}" href="(.*?)"', head_raw)
    alt_url = alt_url.replace(BASE, "") if alt_url else None
    modified = git_date(path)
    noindex = 'content="noindex"' in head_raw

    kept = strip_head(head_raw)
    if kind == "guide":
        gi = [g[0] for g in GUIDES].index(slug)
        short = GUIDES[gi][1]
        h1 = get(r"<h1[^>]*>(.*?)</h1>", body)
        if 'hreflang="en"' not in kept:
            kept = kept.replace('<link rel="canonical"', f'<link rel="alternate" hreflang="en" href="{url}">\n<link rel="alternate" hreflang="x-default" href="{url}">\n<link rel="canonical"', 1)
        og_image = f"{BASE}/og/{slug}.png"
        extra = head_common(url, lang, og_image, "article", f"{h1} – Transmute guide")
        extra += f'\n<meta property="article:published_time" content="{PUBLISHED}">\n<meta property="article:modified_time" content="{modified}">\n<meta property="article:author" content="https://mahoje.dk">'
        extra += "\n" + guide_jsonld(slug, short, desc, h1, modified)
    elif kind == "404":
        extra = head_common(BASE + "/404.html", lang, f"{BASE}/og/home.png", "website", "Transmute")
        extra = re.sub(r'<meta property="og:url"[^>]*>\n', "", extra)
    elif kind == "home":
        og_image = f"{BASE}/og/home.png" if lang == "en" else f"{BASE}/og/home-da.png"
        extra = head_common(url, lang, og_image, "website", title)
        extra += "\n" + front_jsonld(lang, body, title, desc)
    else:  # doc, search
        og_image = f"{BASE}/og/home.png" if lang == "en" else f"{BASE}/og/home-da.png"
        extra = head_common(url, lang, og_image, "website", title)
        h1 = get(r"<h1[^>]*>(.*?)</h1>", body)
        extra += "\n" + doc_jsonld(url, lang, title, desc, [("Transmute", BASE + home_url(lang)), (h1, url)], modified)
    new_head = kept + extra + "\n"

    # Body chrome
    current = {"guide": "guides", "home": "home"}.get(kind, "none")
    body = re.sub(r'<a class="skip"[^>]*>.*?</a>\n?', "", body, count=1, flags=re.S)
    body = re.sub(r'<div class="family-bar">.*?</div>\n?', "", body, count=1, flags=re.S)
    body = re.sub(r'<header class="site-header">.*?</header>', header(lang, current, alt_url), body, count=1, flags=re.S)
    body = re.sub(r'<footer class="site-footer">.*?</footer>', footer(lang, alt_url), body, count=1, flags=re.S)
    body = re.sub(r'<button class="to-top".*?</button>\n?', "", body, count=1, flags=re.S)
    body = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/bugbottle[^>]*></script>\n?', "", body, count=1, flags=re.S)
    body = f'\n<a class="skip" href="#main">{STRINGS[lang]["skip"]}</a>\n' + body.lstrip("\n")
    body = body.rstrip("\n") + f'\n<button class="to-top" type="button" aria-label="{STRINGS[lang]["top"]}" hidden>{icon("chev")}</button>\n{bugbottle(lang)}\n'

    if kind in ("guide", "doc", "search"):
        m = re.search(r'<main id="main" class="container[^"]*">(.*)</main>', body, flags=re.S)
        inner = m.group(1)
        inner = re.sub(r'<nav class="crumbs".*?</nav>\n?', "", inner, count=1, flags=re.S)
        inner = re.sub(r'<aside class="toc-side">.*?</aside>\n?', "", inner, count=1, flags=re.S)
        inner = re.sub(r'<div class="doc-layout[^"]*">\n?', "", inner, count=1)
        inner = re.sub(r'\n?</div>\s*$', "", inner, count=1)
        am = re.search(r'<article class="prose">(.*)</article>', inner, flags=re.S)
        article = am.group(1)
        h1 = get(r"<h1[^>]*>(.*?)</h1>", article)
        if kind == "guide":
            gi = [g[0] for g in GUIDES].index(slug)
            short = GUIDES[gi][1]
            article = re.sub(r'<nav class="guide-nav".*?</nav>\n?', "", article, count=1, flags=re.S)
            article = article.rstrip("\n") + "\n\n" + guide_nav(gi) + "\n"
            crumbs = [("Transmute", "/"), ("Guides", "/#guides"), (short, url)]
            layout = doc_layout(article, lang, crumbs, modified, with_meta=True)
            index_add(f"/guides/{slug}/", short, desc, "en", "Guides", re.sub(r"<h1.*?</h1>", "", article, flags=re.S))
            index_headings(f"/guides/{slug}/", add_heading_ids(article), "en", "Guides", short)
        else:
            crumbs = [("Transmute", home_url(lang)), (h1, url)]
            wide = "layout-wide" in m.group(0).split(">")[0]
            layout = doc_layout(article, lang, crumbs, modified, with_meta=rel.startswith("cheatsheet"), extra_class="")
            if not noindex:
                index_add(url.replace(BASE, ""), h1, desc, lang, "Pages" if lang == "en" else "Sider", article)
            index_refs(url.replace(BASE, ""), add_heading_ids(article))
        main_open = m.group(0)[: m.group(0).index(">") + 1]
        body = body.replace(m.group(0), main_open + "\n" + layout + "\n</main>", 1)
    elif kind == "home":
        body = re.sub(r'<ul class="guide-list">.*?</ul>', guide_list(lang, body), body, count=1, flags=re.S)
        # FAQ toggles: an inline plus icon that rotates when open, plus stable ids for search hits
        body = re.sub(r"<summary>(?:<span>)?(.*?)(?:</span>)?(?:<svg class=\"icon\".*?</svg>)?</summary>",
                      lambda m: f"<summary><span>{m.group(1)}</span>{icon('plusfaq')}</summary>", body, flags=re.S)
        body = re.sub(r"<details(?: id=\"[^\"]*\")?>\s*<summary><span>(.*?)</span>",
                      lambda m: f'<details id="faq-{slugify(m.group(1))}">\n      <summary><span>{m.group(1)}</span>', body, flags=re.S)
        hero = get(r'<section class="hero">(.*?)</section>', body)
        index_add(home_url(lang), "Transmute", desc, lang, "Pages" if lang == "en" else "Sider", hero)
        index_faq(body, lang)
        for sid, name in re.findall(r'<section class="section[^"]*" id="([^"]+)">\s*<(?:div[^>]*>\s*<div>\s*)?h2>(.*?)</h2>', body, flags=re.S):
            sec = get(rf'<section class="section[^"]*" id="{sid}">(.*?)</section>', body)
            index_add(f"{home_url(lang)}#{sid}", name, "Transmute", lang, "Pages" if lang == "en" else "Sider",
                      re.sub(r"<pre.*?</pre>", " ", sec, flags=re.S))

    body = body.replace('<main class="', '<main id="main" class="', 1) if '<main id=' not in body else body

    out = re.sub(r"<head>.*?</head>", lambda m: "<head>\n" + new_head + "</head>", text, count=1, flags=re.S)
    out = re.sub(r"<body>.*</body>", lambda m: "<body>" + body + "</body>", out, count=1, flags=re.S)
    if out != text:
        path.write_text(out, encoding="utf-8", newline="\n")
        print("updated", rel)


def write_sitemap(pages: list[Path]) -> None:
    urls = []

    def entry(loc, alts=None, lastmod=TODAY):
        s = f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n"
        for hl, href in (alts or []):
            s += f'    <xhtml:link rel="alternate" hreflang="{hl}" href="{href}"/>\n'
        return s + "  </url>"

    for p in pages:
        rel = p.relative_to(SITE).as_posix()
        text = p.read_text(encoding="utf-8")
        if rel == "404.html" or rel == "try.html" or 'content="noindex"' in text:
            continue
        loc = BASE + "/" + rel.replace("index.html", "")
        alts = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', text)
        urls.append(entry(loc, alts, git_date(p)))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    (SITE / "sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")


def write_index() -> None:
    order = {"Guides": 0, "Operations": 1, "CLI": 2, "Formats": 3, "FAQ": 4, "Spørgsmål": 4, "Pages": 5, "Sider": 5}
    INDEX.sort(key=lambda e: (order.get(e["section"], 9), e["url"]))
    (SITE / "search-index.json").write_text(json.dumps(INDEX, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")


def main() -> int:
    global INDEX_URL
    # The browser playground runs the real engine; keep site/engine.js a byte-for-byte copy of src/engine.js.
    shutil.copyfile(ROOT / "src" / "engine.js", SITE / "engine.js")
    tp = SITE / "try.html"
    tp.write_text(re.sub(r'src="/engine\.js[^"]*"', f'src="{asset("/engine.js")}"', tp.read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    pages = sorted(SITE.rglob("*.html"))
    # Two passes: the first builds the search index, the second stamps its hash into every header.
    for path in pages:
        process(path)
    write_index()
    INDEX_URL = asset("/search-index.json")
    INDEX.clear()
    for path in pages:
        process(path)
    write_sitemap(pages)
    write_index()
    print(f"search index: {len(INDEX)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
