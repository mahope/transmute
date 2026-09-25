#!/usr/bin/env python3
"""Selvtest af site-gaten: bevis at den fejler på bevidste regressioner.

Uden denne test er en grøn gate meningsløs — den kan være grøn fordi den
intet kontrollerer. Selvtesten kopierer site/ til en midlertidig mappe, indbygger
én SEO-regression og én layout-regression og kræver, at kontrollerne
registrerer dem. Det uvændrede site skal bestå SEO-kontrollen, ellers fanger
selvtesten ikke sin egen fejl.

    python tools/site_gate_selftest.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SKIP = shutil.ignore_patterns("og", "fonts")
CANONICAL = '<link rel="canonical" href="https://transmute.run/"'
WIDE = '<div style="width:2400px;height:8px"></div>'


def run(script: str, site: Path) -> tuple[int, str]:
    env = dict(os.environ, TRANSMUTE_SITE=str(site))
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tools" / script)],
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, proc.stdout + proc.stderr


def edit(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"SELVTEST kan ikke finde {old!r} i {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def expect(condition: bool, message: str, out: str = "") -> None:
    # Uden out ved en fejl er en rød gate ufortolkelig: exit-koden alene kan
    # ikke skelne mellem "kontrollen fangede regressionen" og "kontrollen gik
    # i stykker". Derfor hægtes checkerens egen output altid på fejlen.
    print(("  ok   " if condition else "  FEJL ") + message)
    if not condition:
        if out:
            print("\n".join("      | " + line for line in out.rstrip().splitlines()[-25:]))
        raise SystemExit(1)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp) / "site"
        shutil.copytree(SITE, site, ignore=SKIP)
        home = site / "index.html"
        guide = site / "cheatsheet" / "index.html"

        code, out = run("seo_check.py", site)
        expect(code == 0, f"uvændret site består SEO-kontrollen (exit {code})\n{out}")

        edit(home, CANONICAL, "<!-- canonical fjernet af selftesten -->")
        code, out = run("seo_check.py", site)
        expect(code != 0 and "canonical" in out, f"SEO-regression fanges (exit {code})", out)
        edit(home, "<!-- canonical fjernet af selftesten -->", CANONICAL)

        edit(guide, "</body>", f"{WIDE}</body>")
        code, out = run("layout_check.py", site)
        expect(code != 0 and "overflow" in out, f"layout-regression fanges (exit {code})", out)
        edit(guide, WIDE, "")

        code, out = run("layout_check.py", site)
        expect(code == 0, f"repareret site består layoutkontrollen igen (exit {code})", out)

    print("Site-gatens selftest er grøn.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
