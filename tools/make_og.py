#!/usr/bin/env python3
"""Generate Open Graph images (1200x630) in site/og/ for the front pages and every guide.

Reads each page's <h1> so the image always matches the page. Requires Pillow.
Uses IBM Plex Sans if it is installed, otherwise Segoe UI, otherwise Arial.

    python tools/make_og.py
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
OUT = SITE / "og"
W, H = 1200, 630
BG = (21, 24, 28)
FG = (230, 234, 232)
DIM = (151, 161, 167)
ACCENT = (15, 123, 108)
ACCENT_LIGHT = (95, 211, 188)

FONT_DIRS = [Path("C:/Windows/Fonts"), Path.home() / "AppData/Local/Microsoft/Windows/Fonts",
             Path("/usr/share/fonts"), Path("/Library/Fonts"), Path.home() / "Library/Fonts"]
CANDIDATES = {
    "semibold": ["IBMPlexSans-SemiBold.ttf", "segoeuisb.ttf", "seguisb.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"],
    "regular": ["IBMPlexSans-Regular.ttf", "segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"],
    "mono": ["IBMPlexMono-Medium.ttf", "consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for name in CANDIDATES[kind]:
        for d in FONT_DIRS:
            p = d / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    u = size / 64
    draw.rounded_rectangle((x, y, x + size, y + size), radius=int(12 * u), fill=ACCENT)
    draw.rectangle((x + 14 * u, y + 15 * u, x + 50 * u, y + 24 * u), fill=(255, 255, 255))
    draw.rectangle((x + 25.5 * u, y + 15 * u, x + 38.5 * u, y + 49 * u), fill=(255, 255, 255))


def render(title: str, kicker: str, footer: str, out: Path) -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    margin = 80

    # Terminal-style top bar with the wordmark
    d.rectangle((0, 0, W, 96), fill=(30, 34, 38))
    mark(d, margin, 30, 36)
    d.text((margin + 52, 30), "transmute", font=font("semibold", 30), fill=FG)
    d.text((W - margin, 34), "transmute.run", font=font("mono", 24), fill=DIM, anchor="ra")

    # Kicker line ("$ guide" style) and title
    y = 150
    d.text((margin, y), "$", font=font("mono", 30), fill=ACCENT_LIGHT)
    d.text((margin + 30, y), kicker, font=font("mono", 30), fill=DIM)
    y += 64

    size = 64
    f = font("semibold", size)
    lines = wrap(d, title, f, W - 2 * margin)
    while len(lines) > 3 and size > 40:
        size -= 4
        f = font("semibold", size)
        lines = wrap(d, title, f, W - 2 * margin)
    for line in lines:
        d.text((margin, y), line, font=f, fill=FG)
        y += int(size * 1.2)

    # Footer
    d.rectangle((margin, H - 108, margin + 56, H - 104), fill=ACCENT_LIGHT)
    d.text((margin, H - 88), footer, font=font("regular", 26), fill=DIM)

    OUT.mkdir(exist_ok=True)
    img.save(out, optimize=True)
    print(out.relative_to(SITE).as_posix(), out.stat().st_size, "bytes")


def h1(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"<h1>(.*?)</h1>", text, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else "Transmute"


def main() -> None:
    render("Convert JSON, CSV, YAML, XML and SQL from the terminal. Nothing leaves your machine.",
           "npm i -g @mahope/transmute", "Offline CLI and desktop app. MIT licensed. Made by Mads Holst Jensen, mahoje.dk",
           OUT / "home.png")
    render("Konvertér JSON, CSV, YAML, XML og SQL fra terminalen. Intet forlader din maskine.",
           "npm i -g @mahope/transmute", "Offline CLI og desktop-app. MIT-licens. Udviklet af Mads Holst Jensen, mahoje.dk",
           OUT / "home-da.png")
    for page in sorted((SITE / "guides").glob("*/index.html")):
        slug = page.parent.name
        render(h1(page), f"transmute guides/{slug}", "Commands you can paste and the output they produce. Runs locally.",
               OUT / f"{slug}.png")


if __name__ == "__main__":
    main()
