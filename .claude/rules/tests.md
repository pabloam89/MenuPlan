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
- Con varias sesiones o agentes en la misma carpeta, no lances la suite
  entera a la vez: la contención de CPU da timeouts falsos. La suite entera es
  del CI del PR; en local, solo los ficheros que tocas (CLAUDE.md, «Antes del PR»).
- **Un test que mide tiempo** deja al menos 20× de margen sobre lo que tarda
  suelto, o repite la medida y vale con que una salga bien (#407: una razón
  con umbral 8× entre 4× y 16× falló cuatro veces bajo carga).
