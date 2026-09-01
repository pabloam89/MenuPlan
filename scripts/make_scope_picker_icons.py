"""Process the wizard-topic icon renders into public/avatares/cards/scope_picker/.

Son los 12 temas del picker "¿Qué quieres ajustar de tu menú?"
(ScopePickerScreen.jsx, modo Filas): un objeto en 3D estilo Pixar sobre un
fondo de color propio, que sustituye al icono lucide del badge de la fila —
a 34px el color llega antes que la forma. Prompts en
scripts/mj-prompts-scope-picker-icons.txt.

Electros es el único que no sale de aquí: enseña /avatares/cards/
electrodomesticos/thermomix.webp tal cual — son 11KB y ya los carga el paso 14
del asistente, así que comparten caché (ver ROW_ICON en la pantalla).

Run: python scripts/make_scope_picker_icons.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("Avatares/cards/iconos wizard")
OUT = Path("public/avatares/cards/scope_picker")
SIZE = 256  # el badge son 34px; 256 cubre de sobra hasta 3x
QUALITY = 82

# Midjourney nombra los ficheros u<id>_<slug>_cute_stylized_...png, así que el
# slug del tema es suficiente para localizar cada render.
SLUGS = [
    "semana", "compra",
    "horario", "cole", "ninos",
    "estilo", "estructura", "extras",
    "despensa", "cocina", "tiempos",
]


def resolve(slug):
    hits = sorted(SRC.glob(f"*_{slug}_cute_stylized*.png"))
    return hits[0] if hits else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for slug in SLUGS:
        src = resolve(slug)
        if src is None:
            print(f"FALTA {slug}")
            continue
        img = Image.open(src).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
        dst = OUT / f"{slug}.webp"
        img.save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"{slug}.webp  {SIZE}x{SIZE}  {dst.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
