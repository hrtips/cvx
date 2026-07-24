#!/usr/bin/env python3
"""
Generates the GitHub social preview card for CVX.

Composes the approved horizontal lockup (logo + tagline) centered on a
flat brand-pale canvas at the exact size GitHub requires for social
preview images (1280x640).

Usage: python3 scripts/make-social-preview.py
"""
import os
import sys

try:
    from PIL import Image, ImageChops
except ImportError:
    print("Installing Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow --quiet")
    from PIL import Image, ImageChops

# --- Paths -----------------------------------------------------------------

BRAND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'brand'))
SRC_PATH = os.path.join(BRAND_DIR, 'logos', 'cvx-horizontal-lockup-with-tagline.png')
OUT_PATH = os.path.join(BRAND_DIR, 'social-preview.png')

# --- Brand constants ---------------------------------------------------------

CANVAS_W, CANVAS_H = 1280, 640
PALE_BACKGROUND = (0xF5, 0xF7, 0xFA)  # #F5F7FA — matches assets/brand/README.txt

# Keep all content inside a centered "safe area" so platforms that crop
# the edges of a social card never clip the lockup or its tagline.
SAFE_AREA_RATIO = 0.87


def find_content_bbox(img, bg, threshold=10, pad=10):
    """Returns a bounding box tightly around the artwork, ignoring the
    baked-in pale background the source lockup already sits on.

    A loose threshold plus a small pixel pad keeps soft anti-aliased edges
    (e.g. the thin divider rule, letterforms) from being clipped.
    """
    rgb = img.convert('RGB')
    diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, bg))
    mask = diff.convert('L').point(lambda p: 255 if p > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return (0, 0, img.width, img.height)
    left, top, right, bottom = bbox
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(img.width, right + pad),
        min(img.height, bottom + pad),
    )


def main():
    print(f"Source: {SRC_PATH}")
    src = Image.open(SRC_PATH)
    print(f"Source size: {src.size}, mode: {src.mode}")

    bg = src.convert('RGB').getpixel((0, 0))
    content_box = find_content_bbox(src, bg)
    lockup = src.crop(content_box).convert('RGB')
    print(f"Cropped to content bbox {content_box} -> {lockup.size}")

    # Fit the lockup inside the safe area, preserving aspect ratio.
    # We only ever downsample the (much larger) source artwork.
    safe_w = int(CANVAS_W * SAFE_AREA_RATIO)
    safe_h = int(CANVAS_H * SAFE_AREA_RATIO)
    scale = min(safe_w / lockup.width, safe_h / lockup.height)
    target_w = max(1, round(lockup.width * scale))
    target_h = max(1, round(lockup.height * scale))
    lockup = lockup.resize((target_w, target_h), Image.LANCZOS)
    print(f"Resized lockup to {lockup.size} (scale {scale:.3f})")

    canvas = Image.new('RGB', (CANVAS_W, CANVAS_H), PALE_BACKGROUND)
    offset_x = (CANVAS_W - lockup.width) // 2
    offset_y = (CANVAS_H - lockup.height) // 2
    canvas.paste(lockup, (offset_x, offset_y))
    print(f"Pasted lockup at ({offset_x}, {offset_y})")

    canvas.save(OUT_PATH, 'PNG', optimize=True)
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Saved social preview to: {OUT_PATH}")
    print(f"Final size: {canvas.size[0]}x{canvas.size[1]}, {size_kb:.1f} KB")


if __name__ == '__main__':
    main()
