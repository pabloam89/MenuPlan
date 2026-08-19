"""Process hogar slot icons: trim white margins and export transparent PNGs.

Run: python scripts/make_hogares_cards.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

SRC = Path("Avatares/cards")
OUT = Path("public/avatares/hogares")
WIDTH = 360
FLOOD_THRESH = 28

CARDS = [
    ("hogar_prop", "hogar_propietario"),
    ("hogar_viewer", "hogar_visitante"),
]


def trim_white_border(img: Image.Image, threshold: int = FLOOD_THRESH) -> Image.Image:
    """Remove outer white canvas via corner flood-fill; keeps in-scene whites."""
    img = img.convert("RGBA")
    w, h = img.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=threshold)
    bbox = img.getbbox()
    img = img.crop(bbox) if bbox else img
    return trim_icon_matte(img)


def trim_icon_matte(img: Image.Image) -> Image.Image:
    """Remove edge-connected white matte; keeps isolated whites (house walls)."""
    img = img.convert("RGBA").copy()
    w, h = img.size
    px = img.load()
    q = []
    seen = set()

    def is_matte(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and r >= 210 and g >= 210 and b >= 210

    for x in range(w):
        for y in (0, h - 1):
            if is_matte(x, y):
                q.append((x, y))
                seen.add((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_matte(x, y) and (x, y) not in seen:
                q.append((x, y))
                seen.add((x, y))

    while q:
        x, y = q.pop()
        px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or (nx, ny) in seen:
                continue
            if is_matte(nx, ny):
                seen.add((nx, ny))
                q.append((nx, ny))

    bbox = img.getbbox()
    img = img.crop(bbox) if bbox else img
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 32:
                px[x, y] = (0, 0, 0, 0)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, name in CARDS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src)
        img = trim_white_border(img)
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, round(img.height * ratio)), Image.LANCZOS)
        dst = OUT / f"{name}.png"
        img.save(dst, "PNG", optimize=True)
        print(f"{name}.png  {img.size[0]}x{img.size[1]}  {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
