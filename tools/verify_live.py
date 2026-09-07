#!/usr/bin/env python3
"""End-to-end check of the live site (spec §7).

Screenshots the front page, a guide, the open search palette and the open
BugBottle panel at 360/768/1280 px, confirms the playground runs the engine in
the browser, sends one real BugBottle report and, when BB_ADMIN_KEY is set,
confirms it landed in the inbox at mahope.tools. Never prints the key.

    BB_ADMIN_KEY=... python tools/verify_live.py [--base https://transmute.run] [--out DIR] [--no-report]
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = [360, 768, 1280]
INBOX = "https://mahope.tools/api/bugreport"


def bb(page):
    """Locator for BugBottle's shadow root host (the only shadow host on the page)."""
    return page.locator("div:has(> .wrap)").first


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://transmute.run")
    ap.add_argument("--out", default=str(ROOT / "tools" / "shots" / "live"))
    ap.add_argument("--no-report", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    problems = 0
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    message = f"Test fra Claude transmute.run {stamp}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w in WIDTHS:
            ctx = browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            page.goto(args.base + "/", wait_until="networkidle")
            page.wait_for_timeout(800)
            page.screenshot(path=str(out / f"home-{w}.png"), full_page=True)

            # Playground: the engine must run in the browser and react to edits.
            live = page.locator(".try.is-live").count() == 1
            page.fill("#try-pipe", '[{"op":"count"}]')
            page.wait_for_timeout(700)
            text = page.locator("[data-role=output]").inner_text().strip()
            ok = live and text.startswith("count") and "3" in text
            print(f"{w}px playground: live={live} output={text.replace(chr(10), ' / ')!r} -> {'ok' if ok else 'FAIL'}")
            problems += 0 if ok else 1

            # Search palette with a query that hits FAQ and operations, not only guides.
            page.keyboard.press("Control+K")
            page.wait_for_timeout(200)
            page.keyboard.type("join")
            page.wait_for_timeout(500)
            hits = page.locator(".palette li[role=option]").count()
            groups = [g for g in page.locator(".palette .search-group").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")]
            print(f"{w}px palette: {hits} hits, groups={groups[:6]}")
            problems += 0 if hits else 1
            page.screenshot(path=str(out / f"palette-{w}.png"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)

            # BugBottle panel.
            host = page.locator("body > div:not([class])").filter(has=page.locator("button.trigger"))
            trigger = page.locator("button.trigger")
            if trigger.count() == 0:
                print(f"{w}px BugBottle: trigger not found")
                problems += 1
            else:
                trigger.first.click()
                page.wait_for_timeout(400)
                panel = page.locator(".panel[role=dialog]")
                visible = panel.is_visible()
                print(f"{w}px BugBottle panel visible: {visible}")
                problems += 0 if visible else 1
                if w == 1280 and not args.no_report and visible:
                    page.fill("#bb-message", message)
                    page.locator("button.send").first.click()
                    for _ in range(40):
                        page.wait_for_timeout(250)
                        if page.locator(".thanks").is_visible():
                            break
                    thanks = page.locator(".thanks").is_visible()
                    status = page.locator(".status").inner_text()
                    print(f"BugBottle report sent: thanks={thanks} status={status!r}")
                    problems += 0 if thanks else 1
                page.screenshot(path=str(out / f"bugbottle-{w}.png"))
                page.keyboard.press("Escape")

            page.goto(args.base + "/guides/json-to-sql/", wait_until="networkidle")
            page.wait_for_timeout(500)
            page.screenshot(path=str(out / f"guide-{w}.png"), full_page=True)

            errors = [e for e in errors if "ERR_" not in e]
            if errors:
                problems += 1
                print(f"console errors at {w}px:", errors[:5])
            ctx.close()
        browser.close()

    key = os.environ.get("BB_ADMIN_KEY")
    if key and not args.no_report:
        time.sleep(2)
        req = urllib.request.Request(f"{INBOX}?key={key}", headers={"User-Agent": "transmute-verify"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        items = data if isinstance(data, list) else data.get("items") or data.get("reports") or []
        found = [i for i in items if message in json.dumps(i, ensure_ascii=False)]
        print(f"inbox: {len(items)} reports listed, test report found: {bool(found)}")
        if found:
            i = found[0]
            print("  site:", i.get("site") or i.get("origin"), "| type:", i.get("type"), "| page:", i.get("page") or i.get("url"))
        else:
            problems += 1
    elif not args.no_report:
        print("BB_ADMIN_KEY not set: inbox not checked")

    print("problems:", problems)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
