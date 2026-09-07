#!/usr/bin/env python3
"""Layout-shift test: every page must place header and main identically.

Opens every HTML page in site/ (or under --base) at 360, 768 and 1280 px and
measures the bounding boxes of the family bar, header, header .container,
main and footer. Within one viewport all pages must agree on left/width/top
(±1px), and the page must not scroll horizontally. Prints the numbers and
exits with the number of deviations.

    python tools/layout_check.py [--base https://transmute.run]
"""
from __future__ import annotations

import argparse
import http.server
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
WIDTHS = [360, 768, 1280]
BOXES = {
    "family": ".family-bar",
    "header": ".site-header",
    "header-box": ".site-header .container",
    "main": "main.container",
    "footer-box": ".site-footer .container",
}
TOL = 1


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D102
        pass

    def translate_path(self, path):  # Cloudflare Pages serves try.html at /try
        p = super().translate_path(path)
        return p + ".html" if path.split("?")[0] == "/try" else p


def serve() -> str:
    handler = lambda *a, **k: Quiet(*a, directory=str(SITE), **k)  # noqa: E731
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}"


def pages() -> list[str]:
    out = []
    for p in sorted(SITE.rglob("*.html")):
        rel = p.relative_to(SITE).as_posix()
        if rel == "try.html":
            continue
        out.append("/404.html" if rel == "404.html" else "/" + rel.replace("index.html", ""))
    return out


JS = """(sels) => {
  const r = {};
  for (const [k, sel] of Object.entries(sels)) {
    const el = document.querySelector(sel);
    if (!el) { r[k] = null; continue; }
    const b = el.getBoundingClientRect();
    r[k] = { left: Math.round(b.left), width: Math.round(b.width), top: Math.round(b.top + window.scrollY), height: Math.round(b.height) };
  }
  r.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return r;
}"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    args = ap.parse_args()
    base = args.base or serve()
    urls = pages()
    problems = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w in WIDTHS:
            ctx = browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()
            page.route("**/bugbottle.js", lambda route: route.abort())
            rows = {}
            for url in urls:
                page.goto(base + url, wait_until="load")
                page.wait_for_timeout(150)
                rows[url] = page.evaluate(JS, BOXES)
            ctx.close()
            ref_url = urls[0]
            ref = rows[ref_url]
            print(f"\n== {w}px  (reference {ref_url}) ==")
            for k in BOXES:
                b = ref[k]
                print(f"  {k:11s} left={b['left']:5d} width={b['width']:5d} top={b['top']:5d} height={b['height']:4d}" if b else f"  {k:11s} MISSING")
            for url, r in rows.items():
                bad = []
                if r["overflow"] > 0:
                    bad.append(f"horizontal overflow {r['overflow']}px")
                for k in BOXES:
                    a, b = ref[k], r[k]
                    if not b:
                        bad.append(f"{k} missing")
                        continue
                    for prop in ("left", "width", "top"):
                        if k == "footer-box" and prop == "top":
                            continue  # the footer sits below content of varying length
                        if abs(a[prop] - b[prop]) > TOL:
                            bad.append(f"{k}.{prop} {b[prop]} vs {a[prop]}")
                if bad:
                    problems += len(bad)
                    print(f"  DEVIATION {url}: {'; '.join(bad)}")
            print(f"  {len(urls)} pages checked")
    print(f"\ndeviations: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
