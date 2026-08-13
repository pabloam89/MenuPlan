"""Process the onboarding / cook-level card illustrations into public/avatares/cards/.

The Midjourney originals are 1024x1024 and weigh ~1MB each; these render as
square cards two-per-row on a phone, so 360px covers a 2x display and lands in
the same 40-180KB band as the other card sets.

Run: python scripts/make_onboarding_cards.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/avatares/cards")
WIDTH = 360
COLORS = 192

# source stem in Avatares/cards -> filename the app requests
CARDS = [
    ("muy pillado",            "cook_con_prisa"),
    ("normal",                 "cook_normal"),
    ("con tiempo",             "cook_con_tiempo"),
    ("depende del dia",        "cook_depende"),
    ("basico",                 "cook_nivel_basico"),
    ("medio",                  "cook_nivel_normal"),
    ("avanzado",               "cook_nivel_pro"),
    ("comemos_lo_mismo",       "comemos_lo_mismo"),
    ("comemos_por_separado",   "comemos_por_separado"),
    # Nothing references this one yet, but it ships alongside the other two
    # family-model cards, so keep it in the same shape as them.
    ("otro_grupo_familiar",    "otro_grupo_familiar"),
    # Downloaded with an "ñ" that survives differently depending on the shell
    # that saved it, so these two are matched by glob rather than exact name.
    ("mismo_menu_ni*os",       "mismo_menu_ninos"),
    ("distinto_menu_ni*os",    "distinto_menu_ninos"),
]


def resolve(stem):
    if "*" in stem:
        hits = sorted(SRC.glob(f"{stem}.png"))
        return hits[0] if hits else None
    path = SRC / f"{stem}.png"
    return path if path.exists() else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name in CARDS:
        src = resolve(stem)
        if src is None:
            print(f"FALTA {stem}.png")
            continue
        img = Image.open(src).convert("RGB")
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, round(img.height * ratio)), Image.LANCZOS)
        dst = OUT / f"{name}.png"
        before = dst.stat().st_size // 1024 if dst.exists() else 0
        img.quantize(colors=COLORS, method=Image.MEDIANCUT).save(dst, optimize=True)
        print(f"{name}.png  {img.size[0]}x{img.size[1]}  {before}KB -> {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
