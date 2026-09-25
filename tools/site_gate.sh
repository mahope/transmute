#!/usr/bin/env bash
# Reproducerbar site-gate: samme værktøj, samme kommando lokalt og i CI.
#
#   npm run check:site
#
# Skaffer et isoleret venv med hash-låste afhængigheder, installerer Chromium,
# logger de faktiske versioner og kører SEO- og layoutkontrollen.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${TRANSMUTE_SITE_VENV:-$ROOT/.venv-site}"
REQ="$ROOT/tools/site-requirements.txt"
WANT_PYTHON="3.13.15"

find_python() {
  if [ -n "${TRANSMUTE_SITE_PYTHON:-}" ]; then
    echo "$TRANSMUTE_SITE_PYTHON"
    return
  fi
  for candidate in python3.13 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" -c "import sys; raise SystemExit(0 if sys.version_info[:3] == (3, 13, 15) else 1)"; then
        echo "$candidate"
        return
      fi
    fi
  done
  echo "FEJL: python $WANT_PYTHON er påkrævet. Sæt TRANSMUTE_SITE_PYTHON=/sti/til/python3.13" >&2
  exit 1
}

if [ ! -x "$VENV/bin/python" ]; then
  PYTHON="$(find_python)"
  echo "Opretter $VENV med $PYTHON ($("$PYTHON" -V 2>&1))"
  "$PYTHON" -m venv "$VENV"
fi

PY="$VENV/bin/python"
"$PY" -VV

# Genopbyg venvet, hvis lockfilen er ændret siden sidste install.
STAMP="$VENV/.requirements.sha256"
WANT="$("$PY" -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$REQ")"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$WANT" ]; then
  echo "Installerer hash-låste siteværktøjer"
  "$PY" -m pip install --quiet --upgrade pip
  "$PY" -m pip install --quiet --require-hashes -r "$REQ"
  echo "$WANT" > "$STAMP"
fi

"$PY" -m playwright install chromium
if [ "${TRANSMUTE_PLAYWRIGHT_DEPS:-0}" = "1" ]; then
  "$PY" -m playwright install-deps chromium
fi

"$PY" - <<'PY'
from importlib.metadata import version
from playwright.sync_api import sync_playwright

print(f"playwright {version('playwright')}")
with sync_playwright() as p:
    browser = p.chromium.launch()
    print(f"chromium {browser.version}")
    browser.close()
PY

status=0
"$PY" "$ROOT/tools/seo_check.py" || status=1
"$PY" "$ROOT/tools/layout_check.py" || status=1
"$PY" "$ROOT/tools/site_gate_selftest.py" || status=1

if [ "$status" -eq 0 ]; then
  echo "Site-gate grøn."
else
  echo "Site-gate rød." >&2
fi
exit "$status"
