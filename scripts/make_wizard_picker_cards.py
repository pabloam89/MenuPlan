"""Process the three "¿cuánto quieres ajustar?" card illustrations into
public/avatares/cards/. Son los 3 modos del picker (ScopePickerScreen): el que
delega, el que se mete a medias y la que lo lleva todo.

Verticales (4:5) porque las cards del picker son verticales, una por fila.

Run: python scripts/make_wizard_picker_cards.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards/wizard picker")
OUT = Path("public/avatares/cards/wizard_picker")
WIDTH = 800
QUALITY = 82

# source stem (glob, no extension) -> filename the app requests
CARDS = [
    ("*nivel_basico*",   "nivel_basico"),
    ("*nivel_medio*",    "nivel_medio"),
    ("*nivel_avanzado*", "nivel_avanzado"),
]


def resolve(pattern):
    hits = sorted(SRC.glob(f"{pattern}.png"))
    return hits[0] if hits else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for pattern, name in CARDS:
        src = resolve(pattern)
        if src is None:
            print(f"FALTA {pattern}.png")
            continue
        img = Image.open(src).convert("RGB")
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, round(img.height * ratio)), Image.LANCZOS)
        dst = OUT / f"{name}.webp"
        before = dst.stat().st_size // 1024 if dst.exists() else 0
        img.save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"{name}.webp  {img.size[0]}x{img.size[1]}  {before}KB -> {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
