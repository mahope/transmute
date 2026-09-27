#!/usr/bin/env python3
"""Selvtest af deploy-friskhedskontrollen: bevis at den kan se drift.

Uden denne test er en grøn kontroll meningsløs — den kan være grøn fordi den
intet kontrollerer. Selvtesten bygger et midlertidigt git-repo med to commits
og et falsk "live"-site i en mappe, og kræver at kontrollen:

  1. siger "i sync", når live svarer til nyeste commit,
  2. opdager en side der ikke er deployet, og navngiver filen,
  3. IKKE melder drift, når live er Cloudflare-obfuskeret (e-mail + script),
  4. IKKE regner en gammel `lastmod` i sitemap'en som drift, og
  5. opdager en side der ikke kan hentes.

Punkt 4 findes, fordi det var den fejl, der holdt fem iterationer fast: planen
læste `sitemap.xml`'s `lastmod` som en deploy-dato, selv om feltet kun skrives
når `site_chrome.py` regenererer sitemap'en.

Ingen netværkskald, ingen skrivninger uden for den midlertidige mappe.

    python tools/deploy_freshness_selftest.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_deploy_freshness as checker  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

PAGE_V1 = "<!doctype html><html><head><title>kontakt</title></head><body>\n<p>Vi svarer p\u00e5 alice@example.com</p>\n</body></html>\n"
PAGE_V2 = PAGE_V1.replace("Vi svarer p\u00e5", "Skriv til os p\u00e5")
SITEMAP_V1 = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n  <url>\n    <loc>https://transmute.run/</loc>\n    <lastmod>2026-09-08</lastmod>\n  </url>\n</urlset>\n'
CF_SCRIPT = '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
CF_ANCHOR = '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="8dece1e4eee8cde8f5ece0fde1e8a3eee2e0">[email&#160;protected]</a>'

failures = 0


def report(ok: bool, message: str, out: str = "") -> None:
    global failures
    if not ok:
        failures += 1
    print(("  ok   " if ok else "  FEJL ") + message)
    if not ok and out:
        print("\n".join("      | " + line for line in out.rstrip().splitlines()[-20:]))


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def build_repo(repo: Path, site: dict[str, str]) -> None:
    (repo / "site").mkdir(parents=True)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "selftest@example.com")
    git(repo, "config", "user.name", "selftest")
    for name, body in site.items():
        (repo / "site" / name).write_text(body, encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "første site-commit")


def serve(live: Path, mapping: dict[str, str | None]):
    """Erstat netværkskaldet med et lokalt 'live'-site."""

    def fetch(base: str, url_path: str) -> str | None:
        return mapping.get(url_path)

    return fetch


def run_check(repo: Path, live: Path, mapping: dict[str, str | None]) -> tuple[int, str]:
    real_root, real_fetch = checker.ROOT, checker.fetch
    checker.ROOT, checker.fetch = repo, serve(live, mapping)
    try:
        argv = sys.argv
        sys.argv = ["check_deploy_freshness.py", "--ref", "main", "--base", "https://live.test"]
        import io
        from contextlib import redirect_stdout

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = checker.main()
        return code, buffer.getvalue()
    finally:
        checker.ROOT, checker.fetch = real_root, real_fetch
        sys.argv = argv


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="transmute-deploy-selftest-"))
    try:
        repo, live = tmp / "repo", tmp / "live"
        live.mkdir(parents=True)
        build_repo(repo, {"index.html": PAGE_V1, "sitemap.xml": SITEMAP_V1})

        print("Deploy-friskhed: udgangspunkt")

        # 1. Live svarer til nyeste commit.
        code, out = run_check(repo, live, {"/index.html": PAGE_V1, "/sitemap.xml": SITEMAP_V1})
        report(code == 0 and "DEPLOY OK" in out, "live i sync med nyeste commit -> exit 0", out)
        report(
            "<lastmod>2026-09-08</lastmod>" in SITEMAP_V1 and code == 0,
            "sitemap-lastmod 2026-09-08 er ikke i sig selv drift",
            out,
        )

        # 2. Cloudflare-obfuskering er ikke drift. Det er den regression, der
        #    ville have gjort hver eneste kørsel rød, fordi forsiden har en e-mail.
        code, out = run_check(
            repo,
            live,
            {
                "/index.html": CF_SCRIPT + PAGE_V1.replace("alice@example.com", CF_ANCHOR),
                "/sitemap.xml": SITEMAP_V1,
            },
        )
        report(code == 0 and "DEPLOY OK" in out, "Cloudflare e-mail-obfuskering + indsprøjtet script -> exit 0", out)

        # 3. Et nyt site-commit der ikke er deployet.
        (repo / "site" / "index.html").write_text(PAGE_V2, encoding="utf-8")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "andet site-commit")
        code, out = run_check(repo, live, {"/index.html": PAGE_V1, "/sitemap.xml": SITEMAP_V1})
        report(code == 1 and "DEPLOY-MISSING" in out, "udeployet site-commit -> exit 1 + DEPLOY-MISSING", out)
        report("andet site-commit" in out, "det udeployede commit navngives i output", out)
        report("/index.html" in out, "den afvigende fil navngives i output", out)

        # 4. Live forældet, så content afviger uden at nyt commit findes.
        code, out = run_check(repo, live, {"/index.html": PAGE_V1 + "<p>drift</p>", "/sitemap.xml": SITEMAP_V1})
        report(code == 1, "live-indhold der afviger uden nyeste commit -> exit 1", out)

        # 5. En side der ikke kan hentes.
        code, out = run_check(repo, live, {"/index.html": None, "/sitemap.xml": SITEMAP_V1})
        report(code == 1 and "utilgængelig" in out, "side der ikke kan hentes -> exit 1", out)

        # 6. Selvtesten skal kunne fejle: en normalisering, der er for aggressiv,
        #    ville slå alle scenarier ned. Kræv at den rørede tekst stadig
        #    opdages, så en "fast" kontrol ikke kan bestå ved at slå alt fra.
        report(
            checker.normalize(PAGE_V1 + "<p>skal findes</p>") != checker.normalize(PAGE_V1),
            "normaliseringen fjerner ikke reel drift",
        )
        report(
            '<a class="btn" href="/support/#buying-pro">Køb</a>' in checker.normalize(
                '<a class="btn" href="/support/#buying-pro">Køb</a>'
            ),
            "rigtige links overlever normaliseringen — kun __cf_email__-ankre spises",
        )
        report(
            checker.normalize("a\r\nb") == "a\nb",
            "CRLF normaliseres, så et linjeskift ikke tæller som drift",
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print(f"\nDeploy-friskhed: {failures} fejl.", file=sys.stderr)
        return 1
    print("Deploy-friskhed: selvfest er grøn.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
