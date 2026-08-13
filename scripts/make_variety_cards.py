"""Process the three variety-mode card illustrations into public/variety-cards/.

Run: python scripts/make_variety_cards.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/variety-cards")
WIDTH = 300
COLORS = 192

CARDS = [
    ("maxima_variacion",  "strict"),
    ("repetir_plato",     "moderate"),
    ("repetir_tuppers",   "relaxed"),
]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name in CARDS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src).convert("RGB")
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, round(img.height * ratio)), Image.LANCZOS)
        dst = OUT / f"{name}.png"
        img.quantize(colors=COLORS, method=Image.MEDIANCUT).save(dst, optimize=True)
        print(f"{name}.png  {img.size[0]}x{img.size[1]}  {dst.stat().st_size // 1024}KB")

if __name__ == "__main__":
    main()
