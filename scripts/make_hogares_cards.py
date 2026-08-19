"""Process hogar slot icons into public/avatares/hogares/.

Run: python scripts/make_hogares_cards.py
"""
from pathlib import Path

from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/avatares/hogares")
WIDTH = 360
COLORS = 192

CARDS = [
    ("hogar_prop", "hogar_propietario"),
    ("hogar_viewer", "hogar_visitante"),
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
        dst = OUT / f"{name}.jpg"
        img.save(dst, "JPEG", quality=85, optimize=True)
        print(f"{name}.jpg  {img.size[0]}x{img.size[1]}  {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
