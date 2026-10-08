# Diseño: estado y plan de orden

Diagnóstico medido el 7 oct 2026 sobre `staging` (655ce72), y la
organización a la que vamos. Lo mantiene el agente `diseno`: cuando una cifra
cambie, se actualiza aquí con la fecha. `DESIGN_SYSTEM.md` sigue siendo la
descripción de componentes y voz; este fichero dice qué falta y en qué orden.

## Decisiones pendientes (bloquean los tokens)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Color de marca | verde `#2d5a3d` (favicon, PWA, 374 usos) · teal `#0f766e` (logo de `brand/`, 43 usos como «seleccionado») · terracota `rgb(163,99,90)` (`public/logo-homenu.svg`) | Verde como marca, teal como acento de selección; terracota fuera |
| D2 | Nombre en docs | MenuPlan · HoMenu | HoMenu (es lo que dicen `index.html` y el manifest) |
| D3 | Idioma de carpetas de assets | castellano · inglés | Uno solo; castellano, como el resto del repo |
| D4 | Dónde viven los originales (1024 px, Midjourney) | Git LFS · Vercel Blob · carpeta compartida | Blob o LFS, nunca `public/` ni el repo normal |

## Lo que hay

**Tokens: no existen.** Sin Tailwind, sin variables CSS globales (solo
`--pz-*` de la pizarra en `src/index.css`), sin objeto de tema.

| Medida | Valor |
|---|---|
| Estilos inline `style={{` | 3.781 |
| Apariciones de hex / colores distintos | 4.303 / 764 (398 usados una sola vez) |
| Colores usados que no están en `DESIGN_SYSTEM.md` | 686 |
| `rgba()` distintos | 252 |
| Tamaños de letra distintos | 29 (con medios puntos: 9.5, 10.5…) |
| Radios / sombras distintos | 25 / 148 |
| `const GREEN = "#2d5a3d"` redefinido | en 28 ficheros (uno con otro valor) |
| Ficheros con su propio overlay `position:fixed; inset:0` | 27, con 6 opacidades |
| Componentes `*Sheet`/`*Modal` / `*Card` locales | 43 / 26 |

Más hex por fichero: `Onboarding.jsx` 535, `Menu.jsx` 448, `Shopping.jsx` 225,
`CatalogBrowserSheet.jsx` 221. Biblioteca única: `src/components/ui.jsx`
(1.714 líneas, 25 exports).

**Contradicciones en la documentación**
- Logo en tres colores (ver D1); el teal se usa en la UI y el doc no lo
  menciona. Morado `#7c3aed` suelto, sin documentar.
- `DESIGN_SYSTEM.md` se titula MenuPlan; la app es HoMenu. `README.md` es la
  plantilla de Vite.
- «Iconografía única Nucleo», pero `src/lib/menuExport.js` dibuja con lucide y
  hay 11 `<svg>` a mano fuera de `src/components/icons.jsx`.
- «Pesos 600–900», pero el `Chip` documentado usa 500.
- `ILUSTRACIONES-PASOS.md` planifica 20 ilustraciones que no existen.

**Assets**

| Carpeta | Tamaño | Nota |
|---|---|---|
| `public/` | 56 MB, 919 ficheros | 751 png, 110 jpg, solo 50 webp |
| `public/avatares/` | 38 MB | avatares de 1024 px (~600 KB) servidos tal cual |
| `public/ingredients/` | 8,8 MB | 479 ilustraciones |
| `public/categories/` | 2,9 MB | 4 pares duplicados (`carne`/`carnes`…) |
| `Avatares/` (raíz) | 49 MB | en `.gitignore` pero commiteada; 71 de 83 iguales a `public/avatares/` |
| `src/assets/` | 2,4 MB | logos de tiendas en svg y png a la vez |
| `menus_cole/`, `dish-gallery/` | 3 MB | sin referencias / app aparte en la raíz |

- 70 MB en copias duplicadas (75 hashes repetidos).
- Los originales de las tarjetas no están en el repo: los `make_*.py` leen
  carpetas que no existen. Hoy no se pueden regenerar desde un clon limpio.
- Las fotos de platos (1.035) viven en Vercel Blob; sus originales (~2,5 GB)
  solo en el PC de alguien.
- Nombres en kebab, snake y camelCase; carpetas en castellano e inglés;
  espacios y erratas en `Avatares/cards/`.
- Más de 30 scripts de pipeline sueltos en `scripts/` (Midjourney → recorte →
  tarjeta → optimizado → Blob); solo `build:icons` tiene comando npm, y lee
  de una carpeta con licencia que solo existe en un PC.

## Adónde vamos

**Una sola fuente de tokens.** `src/design/tokens` exporta color (marca,
acento, tinta, fondos, bordes, estados, categorías), escala de letra de 8
pasos (10/11/12/13/14/16/20/26), pesos 600–900, radios (8/12/16/20/26/999),
espaciado (4–24), sombras (0–3), z y motion; un script genera las variables
CSS. `DESIGN_SYSTEM.md` se comprueba contra los tokens, no al revés.

**Cumplimiento.**
1. Regla de ESLint local en `eslint-rules/` que prohíbe hex, rgb y tamaños o
   radios fuera de escala en `src/**`, salvo en `src/design/`.
2. Línea base congelada por fichero: el número de valores sueltos solo puede
   bajar (mismo patrón de trinquete que `src/data/model.test.js`).
3. Test de que favicon, manifest, `theme-color` y logo usan el color de marca.

**Primitivos.** `Sheet` (un solo overlay), `Button`, `Card`, `Field`, `Badge`.
Los 43 sheets se migran poco a poco: una pantalla por PR.

**Assets.**
```
design/sources/<familia>/   originales (Blob o LFS; nunca en public)
design/prompts/<familia>    prompts y seed de cada familia
design/brand/               logo maestro único
design/manifest             id, familia, fuente, prompt+seed, derivados, usado_en
public/img/<familia>/       solo derivados optimizados (webp, tamaños fijos)
src/assets/                 solo lo que importa el código
scripts/design/             recorte, tarjetas, optimizado, iconos, logo
```
Nombres en kebab-case ASCII: `familia/slug@tamaño.webp`. Un formato por
familia. `npm run assets:build` y `npm run assets:check` (en CI): todo
derivado tiene fuente y entrada en el manifiesto, sin duplicados, cada ruta
usada existe, pesos por debajo del límite de su familia.

## Orden propuesto

1. Decidir D1–D4.
2. Tokens + regla de lint en modo aviso + línea base.
3. Primitivo `Sheet` y migrar los overlays.
4. Pipeline de assets y manifiesto; WebP de avatares y cabecera `immutable`.
5. Limpieza (con OK, porque es borrar): `Avatares/` fuera del índice, pares de
   `categories/`, logos duplicados, `dish-gallery/` y `menus_cole/` fuera de
   la raíz.
6. Migrar pantallas por orden de hex: Onboarding, Menu, Shopping, Catálogo.

## Sin comprobar

Si los 86 avatares sin referencia literal se usan de verdad (hay rutas que se
construyen en tiempo de ejecución); qué entra de verdad en el precache; si
los originales que faltan existen en algún PC o en Blob.
