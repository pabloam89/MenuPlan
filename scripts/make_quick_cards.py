"""Turn the Midjourney quick-action scenes into card art.

Three of the four renders sit on a light background but not the *same* light
background — one is pure white, one off-white, one cream — and side by side in
a 2x2 grid the cream one reads as dirty. So the light ones get their backdrop
flattened to a single warm white; the night terrace is left alone, it's meant
to be dark.

Run: python scripts/make_quick_cards.py
"""

from pathlib import Path

from PIL import Image

SRC = Path("Avatares/cards")
OUT = Path("public/quick")

# Drawn at ~168px wide, so 480 covers 2x displays with room to crop.
WIDTH = 480
COLORS = 128

CARDS = [
    # (source stem, output name, flatten the backdrop?)
    ("quick_ninos_cole", "cole", True),
    ("quick_comida_fuera_adultos_Entre seman", "fuera", True),
    ("quick_cena_sabado", "cena", False),
    ("quick_familia_domingos_comida", "familia", True),
]

BACKDROP = (253, 252, 250)
# Anything this close to the sampled corner colour is backdrop, not subject.
TOLERANCE = 26


def flatten_backdrop(img):
    """Repaint the near-uniform border colour to one shared white.

    A plain threshold on brightness would eat the white shirts and plates, so
    the reference is the actual corner pixel and the tolerance is tight.
    """
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    ref = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))
    if min(ref) < 200:
        return img  # not a light backdrop, leave it

    out = img.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = opx[x, y][:3]
            if (abs(r - ref[0]) <= TOLERANCE
                    and abs(g - ref[1]) <= TOLERANCE
                    and abs(b - ref[2]) <= TOLERANCE):
                opx[x, y] = BACKDROP
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name, flatten in CARDS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src).convert("RGB")
        if flatten:
            img = flatten_backdrop(img)
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, round(img.height * ratio)), Image.LANCZOS)
        dst = OUT / f"{name}.png"
        img.quantize(colors=COLORS, method=Image.MEDIANCUT).save(dst, optimize=True)
        print(f"{name}.png  {img.size[0]}x{img.size[1]}  {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
