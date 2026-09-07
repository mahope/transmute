#!/usr/bin/env python3
"""Generate favicon.ico, apple-touch-icon.png, icon-192.png and icon-512.png in site/.

The mark is a "T" monogram in the accent colour, drawn from rectangles so it
matches site/favicon.svg exactly and needs no font. Requires Pillow.

    python tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

SITE = Path(__file__).resolve().parents[1] / "site"
ACCENT = (15, 123, 108)
WHITE = (255, 255, 255)


def mark(size: int, padding_ratio: float = 0.0) -> Image.Image:
    """Render at 8x and downsample so edges are crisp."""
    s = size * 8
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(s * padding_ratio)
    box = s - 2 * pad
    radius = int(box * 12 / 64)
    d.rounded_rectangle((pad, pad, pad + box, pad + box), radius=radius, fill=ACCENT)
    u = box / 64  # units of the 64-grid used by favicon.svg
    x0, y0 = pad, pad
    d.rectangle((x0 + 14 * u, y0 + 15 * u, x0 + 50 * u, y0 + 24 * u), fill=WHITE)
    d.rectangle((x0 + 25.5 * u, y0 + 15 * u, x0 + 38.5 * u, y0 + 49 * u), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    mark(180).save(SITE / "apple-touch-icon.png", optimize=True)
    mark(192).save(SITE / "icon-192.png", optimize=True)
    # Maskable icons need the mark inside the safe zone; a little padding keeps the T intact.
    mark(512, 0.06).save(SITE / "icon-512.png", optimize=True)
    ico = mark(32)
    ico.save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32)], append_images=[mark(16)])
    for name in ("apple-touch-icon.png", "icon-192.png", "icon-512.png", "favicon.ico"):
        print(name, (SITE / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
