#!/usr/bin/env python3
"""
Generates the GitHub organization avatar for hrtips.

The standalone icon has baked-in rounded corners with transparent cutouts;
uploaded as-is, GitHub's own avatar mask double-rounds it and the corners
show as background notches. This script extracts just the artwork (letters,
document, superscript X) off the icon's textured navy and composites it onto
a full-bleed flat ink-navy square, so GitHub's mask does the rounding.

Usage: python3 scripts/make-org-avatar.py
"""
import os
import sys

try:
    from PIL import Image, ImageChops
except ImportError:
    print("Installing Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow --quiet")
    from PIL import Image, ImageChops

BRAND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'brand'))
SRC_PATH = os.path.join(BRAND_DIR, 'logos', 'cvx-standalone-icon-1024.png')
OUT_PATH = os.path.join(BRAND_DIR, 'hrtips-org-avatar.png')

INK_NAVY = (11, 18, 32)          # brand #0B1220
ICON_NAVY = (5, 20, 41)          # median of the icon's own textured background
BORDER_BAND = 100                # px; the icon's edge highlight lives here, the art doesn't

icon = Image.open(SRC_PATH).convert('RGBA')
rgb = icon.convert('RGB')
w, h = icon.size

# Artwork mask: per-pixel max-channel distance from the icon's background navy,
# ramped so anti-aliased art edges stay soft (<=30 background, >=90 art).
diff = ImageChops.difference(rgb, Image.new('RGB', icon.size, ICON_NAVY))
r, g, b = diff.split()
dist = ImageChops.lighter(ImageChops.lighter(r, g), b)
mask = dist.point(lambda v: 0 if v <= 30 else (255 if v >= 90 else int((v - 30) * 255 / 60)))
mask = ImageChops.multiply(mask, icon.getchannel('A'))

# The icon's rounded border carries a faint highlight that survives the color
# threshold; the artwork is central, so clear the whole perimeter band.
inner = mask.crop((BORDER_BAND, BORDER_BAND, w - BORDER_BAND, h - BORDER_BAND))
mask = Image.new('L', (w, h), 0)
mask.paste(inner, (BORDER_BAND, BORDER_BAND))

canvas = Image.new('RGB', (w, h), INK_NAVY)
canvas.paste(rgb, (0, 0), mask)
canvas.save(OUT_PATH, optimize=True)

print(f"Wrote {OUT_PATH} ({w}x{h}, {os.path.getsize(OUT_PATH)} bytes)")
