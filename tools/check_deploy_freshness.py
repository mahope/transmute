#!/usr/bin/env python3
"""Bevis om det publicerede site faktisk er deployet — uden at gætte.

    npm run check:deploy
    python tools/check_deploy_freshness.py [--base https://transmute.run] [--ref origin/main] [--limit 40]

Værktøjet henter hver tekstfil under `site/` fra det live site **én gang** og
sammenligner den med det samme træ i git, commit for commit fra nyeste til
ældste. Det første matchende commit er det, live faktisk serverer.

Hvorfor dette findes: planen antog i flere iterationer, at sitet var 18 dage
gammelt, fordi `sitemap.xml`'s `lastmod` sagde 2026-09-08. Men `lastmod'
skrives kun af `site_chrome.py`, altså når chrome regenereres — ikke når der
deployes. Beviset var altså en målefejl, ikke en udløst fejl. Et HTTP 200 er
på samme måde intet bevis, og en cachelaget CDN kan servere gammel kode i
dagevis. Derfor sammenligner dette værktøj **indhold mod git** og udskriver det
commit, live svarer til.

Kun GET. Ingen skrivninger, ingen rapporter, ingen secrets.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Binære filer kan ikke sammenlignes som tekst, og de siger intet om deployets
# alder. Alt andet under site/ tages med.
TEXT_SUFFIXES = {".html", ".txt", ".json", ".css", ".js", ".xml", ".webmanifest"}

CF_SCRIPT = re.compile(r'<script[^>]*?/cdn-cgi/scripts/[^>]*?>\s*</script>')
CF_EMAIL = re.compile(r'<a\b[^>]*class="__cf_email__"[^>]*>.*?</a>')


def decode_cfemail(value: str) -> str:
    """Gendan den e-mail, Cloudflare har kodet omkring med `data-cfemail`."""
    try:
        key = int(value[:2], 16)
        return "".join(chr(int(value[i : i + 2], 16) ^ key) for i in range(2, len(value), 2))
    except ValueError:
        return value


def normalize(text: str) -> str:
    """Gør live-indhold sammenligneligt med git-indhold.

    Cloudflare skriver to ting ind i HTML'en, som ikke findes i kilden: det
    indsætter sit eget `/cdn-cgi/scripts/...`-script, og det erstatter alle
    e-mailadresser med en obfuskeret `<a class="__cf_email__">`. Uden denne
    normalisering ville enhver side med en e-mail i sig aldrig matche, og
    værktøjet ville rapportere drift på hver eneste kørsel.
    """
    text = CF_SCRIPT.sub("", text)
    text = CF_EMAIL.sub(lambda m: decode_cfemail(_cfemail_attr(m.group(0))), text)
    return text.replace("\r\n", "\n").strip()


def _cfemail_attr(anchor: str) -> str:
    match = re.search(r'data-cfemail="([0-9a-fA-F]+)"', anchor)
    return match.group(1) if match else ""


def site_paths(ref: str) -> list[str]:
    """Alle tekstfiler under `site/` i `ref`, som URL-stier."""
    out = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", ref, "--", "site/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    return [
        "/" + name[len("site/") :]
        for name in out
        if Path(name).suffix in TEXT_SUFFIXES
    ]


def read_ref(ref: str, url_path: str) -> str | None:
    proc = subprocess.run(
        ["git", "show", f"{ref}:site{url_path}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout


def fetch(base: str, url_path: str) -> str | None:
    url = base.rstrip("/") + url_path
    request = urllib.request.Request(url, headers={"User-Agent": "transmute-deploy-check"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            if response.status != 200:
                return None
            return response.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, ValueError):
        return None


def commit_sites(ref: str, limit: int) -> list[str]:
    """Commits der rører `site/`, nyeste først."""
    out = subprocess.run(
        ["git", "log", f"-{limit}", "--format=%H", ref, "--", "site/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    return out


def describe(ref: str) -> str:
    out = subprocess.run(
        ["git", "log", "-1", "--format=%h %ci %s", ref],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return out


def compare(live: dict[str, str | None], ref: str, paths: list[str]) -> list[str]:
    """URL-stier hvor live afviger fra `ref`."""
    drift = []
    for path in paths:
        want = read_ref(ref, path)
        got = live.get(path)
        if want is None:
            continue
        if got is None:
            drift.append(path)
        elif normalize(got) != normalize(want):
            drift.append(path)
    return drift


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://transmute.run")
    ap.add_argument("--ref", default="origin/main", help="ref, live skal svare til")
    ap.add_argument("--limit", type=int, default=40, help="hvor mange site-commits der søges baglæns")
    args = ap.parse_args()

    paths = site_paths(args.ref)
    if not paths:
        print(f"FEJL: ingen tekstfiler under site/ i {args.ref}", file=sys.stderr)
        return 2

    print(f"Henter {len(paths)} sider fra {args.base} …")
    live: dict[str, str | None] = {}
    unreachable = []
    for path in paths:
        body = fetch(args.base, path)
        live[path] = body
        if body is None:
            unreachable.append(path)
    if unreachable:
        print(f"  {len(unreachable)} utilgængelig(e): {', '.join(unreachable[:6])}")

    # Find det nyeste commit, hvis site-træ live svarer til.
    matched: str | None = None
    for candidate in commit_sites(args.ref, args.limit):
        if not compare(live, candidate, paths):
            matched = candidate
            break

    newest = commit_sites(args.ref, 1)[0]
    print()
    if matched is None:
        print(f"Live svarer til INGEN af de {args.limit} seneste site-commits.")
        print("Sitet er ældre end git, eller live er ikke bygget fra dette repo.")
        drift = compare(live, newest, paths)
        print(f"\nAfvigelser mod {describe(newest)} ({len(drift)} filer):")
        for path in drift[:20]:
            print(f"  {path}")
        print("\nDEPLOY-MISSING. Skriv det i planen og stop med at merge til default-branchen.")
        return 1

    print(f"Live svarer til {describe(matched)}")
    if matched == newest:
        print(f"DEPLOY OK — live er i sync med {args.ref} ({describe(newest)}).")
        return 0

    missing = commit_sites(args.ref, args.limit)
    pending = missing[: missing.index(matched)] if matched in missing else []
    print(f"\n{len(pending)} site-commit(s) er ikke deployet:")
    for sha in pending:
        print(f"  {describe(sha)}")
    drift = compare(live, newest, paths)
    print(f"\nAfvigelser mod {describe(newest)} ({len(drift)} filer):")
    for path in drift[:20]:
        print(f"  {path}")
    if len(drift) > 20:
        print(f"  … og {len(drift) - 20} mere")
    print("\nDEPLOY-MISSING. Skriv det i planen og stop med at merge til default-branchen.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
