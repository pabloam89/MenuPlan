"""Procesa las ilustraciones de tipo de cocina a public/categories/.

Son las teselas de "Italiana / Mexicana / …" de la rejilla de Recetas
(COCINA_META en CatalogBrowserSheet.jsx). Mismo tratamiento que las facetas
que ya viven ahí (faceta_*.webp): 400x400 webp.

Ojo con los nombres: el fichero fuente no siempre coincide con el valor del
enum `cocina` de recipeSchema.js — "arabic" es "arabe" e "indian" es "india".
El destino usa SIEMPRE el valor del enum, que es la clave con la que la tesela
lo busca.

Run: python scripts/make_cocina_images.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards/cocina")
OUT = Path("public/categories")
SIZE = 400
QUALITY = 82

# fichero fuente (sin extensión) -> valor del enum `cocina`
CARDS = [
    ("italiana_cocina",  "italiana"),
    ("mexicana_cocina",  "mexicana"),
    ("asiatica_cocina",  "asiatica"),
    ("arabic_cocina",    "arabe"),
    ("francesa_cocina",  "francesa"),
    ("americana_cocina", "americana"),
    ("indian_cocina",    "india"),
    ("peruana_cocina",   "peruana"),
    # mediterranea_cocina.png se queda fuera: no hay valor "mediterranea" en el
    # enum. El catálogo es español de serie y no se marca (ver recipeSchema).
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, slug in CARDS:
        src = SRC / f"{stem}.png"
        if not src.exists():
            print(f"FALTA {src}")
            continue
        img = Image.open(src).convert("RGB")
        # Cuadradas de origen (1024x1024), así que basta redimensionar.
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        dst = OUT / f"cocina_{slug}.webp"
        before = dst.stat().st_size // 1024 if dst.exists() else 0
        img.save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"cocina_{slug}.webp  {img.size[0]}x{img.size[1]}  {before}KB -> {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
