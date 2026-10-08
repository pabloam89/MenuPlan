---
paths:
  - "**/*.test.{js,jsx,mjs}"
---

# Tests

- **Un test nuevo se ve fallar una vez** (rompe a propósito lo que mide)
  antes de creértelo. Ya van cinco tests que no medían nada.
- **Prueba con lo que entrega el motor** (`RECIPES_BY_ID` de
  `src/data/recipes.js`), no con el JSON del catálogo: el motor normaliza y el
  JSON no.
- **No copies la verdad.** `expect(UMBRAL).toBe(4.2)` no vigila nada; fija
  suelos y relaciones (`expect(a).toBeLessThan(b)`).
- Cada caso malo cambia **una** cosa y debe disparar exactamente esa regla.
- `src/lib/solver.test.js` está fuera del CI a propósito (ver
  `.github/workflows/tests.yml`).
- Con varias sesiones o agentes en la misma carpeta, no lances la suite
  entera a la vez: la contención de CPU da timeouts falsos.
