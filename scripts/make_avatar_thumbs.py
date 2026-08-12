"""Generate square head-and-shoulders crops of the illustrated avatars.

The source art is a 1024x1024 full-body render where the character occupies a
narrow central column, so shrinking it into a 20-34px circle leaves a person a
few pixels tall. Small UI (group circles, member rows, chips) uses these crops
instead; the full-body originals stay for the big onboarding picker.

Run: python scripts/make_avatar_thumbs.py
"""

from pathlib import Path

from PIL import Image

SRC = Path("public/avatares")
OUT = SRC / "thumbs"
FOLDERS = ["papa", "mama", "hijo", "hija", "bebe", "abuelo", "abuela", "adulto"]
# Never drawn larger than ~58px, so 192px still covers 3x displays while
# keeping each thumb around 9KB instead of the 62KB of a full-colour 256px one.
THUMB_PX = 192
THUMB_COLORS = 192
ALPHA_MIN = 12

# Crop side as a fraction of the figure's own height. Detecting the neck from
# the silhouette is unreliable — long hair is as wide as the shoulders, so the
# usual width-jump never happens — but head-to-body ratio is consistent within
# a role, so the framing is set per folder instead. Babies are ~1:2, adults
# ~1:4, and teens sit in between.
CROP_FRACTION = {
    "papa": 0.46, "mama": 0.46, "abuelo": 0.46, "abuela": 0.46,
    "adulto": 0.46, "hijo": 0.48, "hija": 0.48,
    "bebe": 0.78,
}
DEFAULT_FRACTION = 0.46
# Headroom above the crown, as a fraction of the crop side.
HEADROOM = 0.05


def row_extents(alpha, box):
    """Left/right edge of the opaque pixels for every row inside `box`."""
    x0, y0, x1, y1 = box
    px = alpha.load()
    out = []
    for y in range(y0, y1):
        left, right = None, None
        for x in range(x0, x1):
            if px[x, y] > ALPHA_MIN:
                if left is None:
                    left = x
                right = x
        out.append((left, right))
    return out


def head_center_x(alpha, bbox, side):
    """Horizontal centre of the head, measured from the rows just below the
    crown so a hand or an outstretched arm lower down can't pull it sideways."""
    x0, y0, x1, y1 = bbox
    band = (x0, y0, x1, min(y1, y0 + max(1, round(side * 0.45))))
    rows = [e for e in row_extents(alpha, band) if e[0] is not None]
    if not rows:
        return (x0 + x1) / 2
    return (min(e[0] for e in rows) + max(e[1] for e in rows)) / 2


def portrait_crop(img, folder):
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return img
    x0, y0, x1, y1 = bbox
    side = (y1 - y0) * CROP_FRACTION.get(folder, DEFAULT_FRACTION)
    cx = head_center_x(alpha, bbox, side)
    top = y0 - side * HEADROOM
    left = cx - side / 2
    return img.crop((round(left), round(top), round(left + side), round(top + side)))


def main():
    total = 0
    for folder in FOLDERS:
        src_dir = SRC / folder
        if not src_dir.is_dir():
            continue
        dst_dir = OUT / folder
        dst_dir.mkdir(parents=True, exist_ok=True)
        for png in sorted(src_dir.glob("*.png")):
            img = Image.open(png).convert("RGBA")
            crop = portrait_crop(img, folder).resize((THUMB_PX, THUMB_PX), Image.LANCZOS)
            crop.quantize(colors=THUMB_COLORS, method=Image.FASTOCTREE).save(
                dst_dir / png.name, optimize=True
            )
            total += 1
        print(f"{folder}: {len(list(dst_dir.glob('*.png')))} thumbs")
    print(f"\n{total} thumbs -> {OUT}")


if __name__ == "__main__":
    main()
