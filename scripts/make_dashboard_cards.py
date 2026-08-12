"""Process the three Midjourney dashboard card renders.

These go to src/assets/dashboard/ with the exact filenames already
imported in Dashboard.jsx, so no code changes are needed.

Run: python scripts/make_dashboard_cards.py
"""

from pathlib import Path

from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("src/assets/dashboard")

# MenuHeroCard is 16:7 — serve at 800px wide (2x for ~400px rendered).
# QuickActionTile is 4:5 — serve at 560px wide (2x for ~280px rendered).
CARDS = [
    # (source stem,       output name,      target_w, flatten_backdrop?)
    ("generar menu",      "menu-card",       800,      False),
    ("actualizar despensa", "pantry-card",   560,      False),
    ("generar receta",    "recipes-card",    560,      False),
]

# Quantize enough colours to keep the illustration looking crisp.
COLORS = 192


def resize_to_width(img, width):
    ratio = width / img.width
    return img.resize((width, round(img.height * ratio)), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name, width, flatten in CARDS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src).convert("RGB")
        img = resize_to_width(img, width)
        dst = OUT / f"{name}.png"
        img.quantize(colors=COLORS, method=Image.MEDIANCUT).save(dst, optimize=True)
        kb = dst.stat().st_size // 1024
        print(f"{name}.png  {img.size[0]}x{img.size[1]}  {kb}KB")


if __name__ == "__main__":
    main()
