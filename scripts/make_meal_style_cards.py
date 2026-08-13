"""Process the four meal-style card illustrations into public/meal-styles/.

The cards render at ~85 px wide in a 4-across row; serving at 300 px covers
2× displays with room to crop. Height is unconstrained (4:5 source ratio) so
we just scale to width and let the CSS clip the bottom via object-fit: cover.

Run: python scripts/make_meal_style_cards.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/meal-styles")
WIDTH = 300
COLORS = 192

CARDS = [
    ("de todo",     "de_todo"),
    ("equilibrado", "equilibrado"),
    ("ligero",      "ligero"),
    ("a tu gusto",  "a_tu_gusto"),
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
