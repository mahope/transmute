#!/usr/bin/env python3
"""T114: measure what a gate that read llms.txt, llms-full.txt and sitemap.xml would find.

Three questions, held apart the whole way: do the addresses resolve, do the
lists cover what they should, and does what the files say about the tool match
what the tool does.
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "https://transmute.run"

TXT = ["llms.txt", "llms-full.txt", "robots.txt"]


def site_url_to_path(url):
    url = url.split("#")[0].split("?")[0]
    if not url.startswith(BASE):
        return None
    path = url[len(BASE):] or "/"
    if path.endswith("/"):
        path += "index.html"
    elif "." not in Path(path).name:
        path += "/index.html"
    return path.lstrip("/")


def indexable_pages() -> set[str]:
    out = set()
    for p in SITE.rglob("index.html"):
        out.add(p.relative_to(SITE).as_posix())
    return out


def run_engine(text: str, fmt: str) -> tuple[int, str]:
    with tempfile.NamedTemporaryFile("w", suffix="." + fmt, delete=False) as fh:
        fh.write(text)
        name = fh.name
    proc = subprocess.run(
        ["node", str(ROOT / "src" / "cli.js"), name, "-f", fmt, "-o", "json"],
        capture_output=True, text=True,
    )
    Path(name).unlink(missing_ok=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


# --- Q1: do the addresses in the three text files resolve? -----------------
print("LINKS — every address on the site's own domain, in the three files no HTML rule reads")
for name in TXT:
    text = (SITE / name).read_text(encoding="utf-8")
    urls = sorted(set(re.findall(r"https://transmute\.run[^\s)\]\"'>]*[A-Za-z0-9/]", text)))
    broken = []
    for url in urls:
        rel = site_url_to_path(url)
        if rel and not (SITE / rel).exists():
            broken.append(f"{url} -> {rel} MISSING")
    print(f"  {name:14} {len(urls):2d} addresses, {len(broken)} missing" + ("" if not broken else ": " + "; ".join(broken)))

sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
locs = sorted(set(re.findall(r"<loc>([^<]+)</loc>", sitemap)))
missing = []
for url in locs:
    rel = site_url_to_path(url)
    if rel and not (SITE / rel).exists():
        missing.append(f"{url} -> {rel} MISSING")
print(f"  {'sitemap.xml':14} {len(locs):2d} addresses, {len(missing)} missing" + ("" if not missing else ": " + "; ".join(missing)))

# --- Q2: do the lists cover what they should? ------------------------------
print("\nCOVERAGE — every guide in llms.txt, every indexable page in the sitemap")
guides = sorted(p.parent.name for p in (SITE / "guides").glob("*/index.html"))
llms = (SITE / "llms.txt").read_text(encoding="utf-8")
absent = [g for g in guides if f"/guides/{g}/" not in llms]
print(f"  llms.txt lists {len(guides) - len(absent)} of {len(guides)} guides" + ("" if not absent else f", missing {absent}"))

in_sitemap = {site_url_to_path(u) for u in locs}
pages = indexable_pages()
absent_pages = sorted(pages - in_sitemap)
print(f"  sitemap.xml lists {len(pages & in_sitemap)} of {len(pages)} pages with an index.html" + ("" if not absent_pages else f", missing {absent_pages}"))

# The playground is the one page a reader can use without installing Node, and
# it is the answer to "can I try this first".
print(f"  llms.txt mentions the playground (/try/): {'/try/' in llms or 'try' in llms.split('## Pages')[1].lower() if '## Pages' in llms else '? /try/ in llms =', '/try/' in llms}")
print(f"  llms.txt carries a payment link: {'buy.stripe.com' in llms}")

# --- Q3: does what they say about the parsers match what they do? -----------
print("\nCLAIMS — shapes the engine reads, and every sentence that denies one of them")
SHAPES = {
    "anchors and aliases": "defaults: &d\n  retries: 3\ncopy: *d\n",
    "the << merge key": "base: &b\n  a: 1\nchild:\n  <<: *b\n  b: 2\n",
    "block scalars (multi-line strings)": "v: |\n  a\n  b\n",
    "folded block scalars": "v: >\n  a\n  b\n",
    "flow collections": "v: {a: 1, b: [2, 3]}\n",
    "nested mappings and sequences at any depth": "a:\n  b:\n    c:\n      - 1\n      - 2\n",
    "tags on values": "a: !!str 7\n",
}
reads = {}
for label, text in SHAPES.items():
    code, out = run_engine(text, "yaml")
    reads[label] = code == 0 and out.startswith("[")
    print(f"  {'reads ' if reads[label] else 'REFUSES'} {label}")

DENY = re.compile(
    r"([^.\n]*(?:not (?:supported|covered|handled)|no support for|does not support|doesn't support|without)[^.\n]*)",
    re.I,
)
NAMES = [
    ("anchors and aliases", r"anchor|alias|&[A-Za-z]|\*[A-Za-z]"),
    ("the << merge key", r"<<"),
    ("block scalars (multi-line strings)", r"block scalar|multi-?line string|multi-?line value"),
    ("folded block scalars", r"fold"),
    ("flow collections", r"flow (?:collection|mapping|sequence|node)|\{k: v\}|\[a, b\]"),
    ("nested mappings and sequences at any depth", r"nested|any depth"),
    ("tags on values", r"tag"),
]
seen = set()
targets = [
    "docs/cli.md", "README.md",
    "site/llms.txt", "site/llms-full.txt",
    "site/index.html", "site/da/index.html",
]
for rel in targets:
    p = ROOT / rel
    if not p.exists():
        continue
    for lineno, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        for sentence in DENY.findall(line):
            for shape, pattern in NAMES:
                if not reads[shape]:
                    continue
                if re.search(pattern, sentence, re.I):
                    key = (rel, lineno)
                    if key in seen:
                        continue
                    seen.add(key)
                    print(f"  DENIES {shape:42} {rel}:{lineno}: {sentence.strip()[:120]}")

print(json.dumps({"engines_ok": all(reads.values())}))
sys.exit(0)
