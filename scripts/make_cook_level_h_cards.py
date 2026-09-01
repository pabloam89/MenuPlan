"""Process the horizontal (16:9) cook-level card illustrations into
public/avatares/cards/. These are the "chef pelirroja" style renders used by
OnboardingCooking (Onboarding.jsx) — one card per row, so full width matters
more than a square crop.

Run: python scripts/make_cook_level_h_cards.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards/niveles cocina")
OUT = Path("public/avatares/cards")
WIDTH = 900
QUALITY = 82

# source stem (glob, no extension) -> filename the app requests
CARDS = [
    ("*blond-haired_dad*",        "cook_nivel_basico_h"),
    ("*black-haired_woman_chef*", "cook_nivel_normal_h"),
    ("*red-haired_woman_chef*",   "cook_nivel_pro_h"),
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
