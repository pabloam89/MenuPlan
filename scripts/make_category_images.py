"""Process category illustrations into public/categories/.

Outputs one PNG per unique recipe-category ID and one per shopping-aisle slug.
Shared subjects (e.g. verduras) are written under both names.

Run: python scripts/make_category_images.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards/ingredientes_recetas")
OUT = Path("public/categories")
SIZE = 200   # square thumbnail
COLORS = 128  # cartoon illustrations need fewer colours

# (source stem, [output names])
MAPS = [
    # shared recipe + shopping
    ("verduras",          ["verduras", "ensaladas_verduras"]),
    ("carne",             ["carne", "carnes"]),
    ("pescado",           ["pescado", "pescados"]),
    ("legumbres",         ["legumbres"]),
    ("pasta y arroz",     ["pasta_arroz", "pasta_arroces"]),
    ("huevos",            ["huevos"]),
    # recipe-only
    ("sopas_cremas",      ["sopas_cremas"]),
    ("plato_unico",       ["platos_unicos"]),
    ("cenas_rapidas",     ["cenas_rapidas"]),
    ("bebe",              ["bebes"]),
    ("desayunos2",        ["desayunos"]),
    ("meriendas",         ["meriendas"]),
    ("postres",           ["postres"]),
    ("guarnicion",        ["guarniciones"]),
    # shopping-only
    ("fruta",             ["frutas"]),
    ("lacteos2",          ["lacteos"]),
    ("panaderia",         ["panaderia"]),
    ("especias",          ["especias"]),
    ("aceites y conservas", ["aceites_conservas"]),
]


def square_crop(img):
    """Centre-crop to square."""
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return img.crop((left, top, left + s, top + s))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, names in MAPS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA  {src}")
            continue
        img = Image.open(src).convert("RGB")
        img = square_crop(img)
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        quantized = img.quantize(colors=COLORS, method=Image.MEDIANCUT)
        for name in names:
            dst = OUT / f"{name}.png"
            quantized.save(dst, optimize=True)
            print(f"{name}.png  {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
