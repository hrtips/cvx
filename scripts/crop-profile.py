#!/usr/bin/env python3
"""
Crops the profile photo to a clean square (head + shoulders)
optimised for a circular CV profile image.

Usage: python3 scripts/crop-profile.py
"""
import sys
import os

try:
    from PIL import Image
except ImportError:
    print("Installing Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow --quiet")
    from PIL import Image

# Find the source file (accepts jpg, jpeg, png, heic)
src_dir = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets')
src_dir = os.path.abspath(src_dir)

candidates = [f for f in os.listdir(src_dir)
              if f.lower().startswith('profile') and
              f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]

if not candidates:
    print(f"No profile image found in {src_dir}")
    print("Drop your photo there and name it profile.jpg (or profile.png)")
    sys.exit(1)

src_path = os.path.join(src_dir, sorted(candidates)[0])
print(f"Processing: {src_path}")

img = Image.open(src_path)
w, h = img.size
print(f"Original size: {w} x {h}")

# Take the full width as a square — ensures full face + chin + some shoulders
crop_size = w                       # square = full image width
left   = 0
top    = 0                          # start from top of image
right  = w
bottom = crop_size

cropped = img.crop((left, top, right, bottom))

# Resize to 400×400 (plenty for a 80px circle on screen)
cropped = cropped.resize((400, 400), Image.LANCZOS)

out_path = os.path.join(src_dir, 'profile.jpg')
# Flatten RGBA to RGB with white background before saving as JPEG
if cropped.mode in ('RGBA', 'LA', 'P'):
    background = Image.new('RGB', cropped.size, (255, 255, 255))
    background.paste(cropped, mask=cropped.split()[-1] if 'A' in cropped.mode else None)
    cropped = background
else:
    cropped = cropped.convert('RGB')
cropped.save(out_path, 'JPEG', quality=92)
print(f"Saved cropped profile to: {out_path}")
print("Done — refresh your browser to see the photo.")
