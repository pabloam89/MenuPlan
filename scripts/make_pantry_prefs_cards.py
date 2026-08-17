"""Copy/process the Midjourney pantry-prefs wizard renders.

Source PNGs live in Avatares/cards/wizard_pantry/ with descriptive names;
this maps each one to the slug the app expects and crops to a centered square.

Run: python scripts/make_pantry_prefs_cards.py
"""

from pathlib import Path

from PIL import Image

SRC = Path("Avatares/cards/wizard_pantry")
OUT = Path("public/avatares/cards/pantry_prefs")
TARGET = 512

# slug (used by the app) -> source filename in wizard_pantry/
MAPPING = {
    "snapshot": "p1_snapshot.png",
    "onShop": "p1_compra.png",
    "live": "p1_live.png",
    "nearest": "p2_nearest.png",
    "all": "p2_todas.png",
    "spread": "p2_spread.png",
    "weekly": "p3_weekyl.png",
    "persist": "p3_persist.png",
    "endOfDay": "p4_findia.png",
    "onGenerate": "p4_generate.png",
    "onCook": "p4_al_marcar_cocinado.png",
    "none": "p4_almarcarlo_yo.png",
}


def process_one(src: Path, dst: Path) -> bool:
    if not src.is_file():
        return False
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((TARGET, TARGET), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, optimize=True)
    return True


def main() -> None:
    ok = 0
    for slug, fname in MAPPING.items():
        src = SRC / fname
        if not src.is_file():
            print(f"skip (missing): {slug} <- {fname}")
            continue
        if process_one(src, OUT / f"{slug}.png"):
            print(f"ok: {src.name} -> {OUT / f'{slug}.png'}")
            ok += 1
    print(f"\nDone: {ok}/{len(MAPPING)} cards in {OUT}")


if __name__ == "__main__":
    main()
