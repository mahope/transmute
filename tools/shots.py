#!/usr/bin/env python3
"""Screenshots and layout checks for the site at 360/768/1280 px.

Serves site/ locally (or use --base for the live site), screenshots the front
page, Danish page, one guide and the 404, opens the mobile menu, and fails
on horizontal overflow. Requires the Python playwright package with Chromium.

    python tools/shots.py [--base URL] [--out DIR]
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
PAGES = ["/", "/da/", "/guides/json-to-sql/", "/404.html"]
WIDTHS = [360, 768, 1280]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D102
        pass


def serve() -> str:
    handler = lambda *a, **k: Quiet(*a, directory=str(SITE), **k)  # noqa: E731
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--out", default=str(ROOT / "tools" / "shots"))
    args = ap.parse_args()
    base = args.base or serve()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    problems = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w in WIDTHS:
            ctx = browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            for url in PAGES:
                page.goto(base + url, wait_until="networkidle")
                page.wait_for_timeout(700)
                name = url.strip("/").replace("/", "-") or "home"
                sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                if sw > cw:
                    problems += 1
                    wide = page.evaluate("""() => [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map(e => e.tagName + '.' + e.className)""")
                    print(f"OVERFLOW {w}px {url}: scrollWidth {sw} > {cw}: {wide}")
                page.screenshot(path=str(out / f"{name}-{w}.png"), full_page=True)
                if w == 360 and url == "/":
                    btn = page.locator(".nav-toggle")
                    print("toggle visible at 360:", btn.is_visible())
                    btn.click()
                    page.wait_for_timeout(300)
                    print("aria-expanded after click:", btn.get_attribute("aria-expanded"),
                          "nav visible:", page.locator(".site-nav").is_visible())
                    page.screenshot(path=str(out / "home-360-menu.png"))
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(300)
                    print("aria-expanded after Escape:", btn.get_attribute("aria-expanded"))
                    print("copy buttons:", page.locator("pre .copy").count())
            errors = [e for e in errors if "fonts.g" not in e and "ERR_" not in e]
            if errors:
                problems += 1
                print(f"console errors at {w}px:", errors[:5])
            ctx.close()
        browser.close()
    print("problems:", problems)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
