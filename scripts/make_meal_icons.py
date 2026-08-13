"""Process the three meal-time icons (sun, moon, cup) into public/meal-icons/.

They render at 36x36 px in the UI, but phone screens are 2x–3x so we target
180px — same as the avatar thumbnails. Square crop + quantize keeps them small.

Run: python scripts/make_meal_icons.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/meal-icons")
SIZE = 180
COLORS = 128

ICONS = [
    ("taza_desayuno", "desayuno"),
    ("sol_comida",    "comida"),
    ("luna_cena",     "cena"),
]

def square_crop(img):
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top  = (h - s) // 2
    return img.crop((left, top, left + s, top + s))

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name in ICONS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src).convert("RGBA")
        img = square_crop(img)
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        dst = OUT / f"{name}.png"
        # MEDIANCUT doesn't support RGBA; FASTOCTREE does.
        img.quantize(colors=COLORS, method=Image.FASTOCTREE).save(dst, optimize=True)
        print(f"{name}.png  {SIZE}x{SIZE}  {dst.stat().st_size // 1024}KB")

if __name__ == "__main__":
    main()
