---
paths:
  - "src/data/**"
  - "src/utils/**"
  - "src/lib/**"
  - "api/_bot/**"
  - "scripts/*catalog*"
  - "scripts/bedca*"
  - "scripts/ciqual*"
---

# Catálogo, alimentos y nutrición

- **Regex sobre nombres de alimento: `\b` por defecto**, y probado contra el
  catálogo entero, no contra los tres ejemplos del fallo. La frontera no
  siempre basta: «Vinagre de vino» contiene «vino» como palabra. Si la palabra
  va dentro del nombre de otro ingrediente, quita antes ese otro nombre; si
  puede ser adjetivo («tostada»), usa una lista de exclusión (`NO_ES_BASE` en
  `src/utils/validateMenu.js`).
- **Un `foodId: null`** en `src/data/bedcaChoices.json` o
  `src/data/ciqualChoices.json` se decide mirando **todos** los candidatos, no
  el primero, y preguntando a **las dos tablas** (BEDCA es española, CIQUAL
  francesa).
- **Masa que no se come**: fracción comestible (`src/data/fraccionComestible.json`),
  el 6 % de aceite absorbido al freír, la costra de sal. Se descuenta de la
  nutrición, no de la lista de la compra. Una clave que no casa ningún
  `ingredientId` no falla: no hace nada.
- **Catálogo estrella**: solo se propone lo que tiene `estrella: true`. El
  antiguo no se usa nunca; una receta sube a mano y con foto en
  `src/assets/dishes/dishImages.json`. Si el pool se queda corto, error, no
  relleno. `estrella` ausente no se toca.
- **La puerta de cocinas** (`src/utils/filterRecipes.js`, `src/lib/cocinaTopes.js`):
  `estrella` dice si un plato PUEDE salir; la puerta, si sale sin pedirlo. Las
  extranjeras, apagadas salvo que la casa las marque.
- **Sin pairing**: no se combinan platos con guarniciones; una receta, una
  foto.
- `npm run build` corre `scripts/validate-catalog.mjs`: es el filtro que usa
  Vercel.
