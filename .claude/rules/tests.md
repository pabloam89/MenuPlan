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
  del CI del PR; en local, `npm run vecinos`: lo que tocas más los vigilantes de
  conjunto que lo miran (CLAUDE.md, «Antes del PR»). Un test nuevo que recorra
  ficheros del repo entra en `ops/vigilantes.json`; `ops/vigilantes.test.js` lo comprueba.
  `vecinos` no cubre los pasos «Normas del PR» ni «Runbook del PR» (necesitan el cuerpo
  del PR): con texto nuevo en una norma, `node scripts/normas.mjs` antes y después.
- **Un test que mide tiempo** usa `scripts/lib/medirTiempo.mjs`: la mediana de
  varias medidas (`medianaMs`) contra `topeMs(<lo medido suelto>)`, que deja 20×
  de margen. Repetir sin margen no basta (#499: el mejor de tres a 8× falló).
  Si lanza procesos, `topeConTestigo`: un testigo de la misma tanda sube el
  límite con la carga, y con la máquina saturada (`maquinaSaturada`) el tiempo
  no se compara, solo lo funcional. Mejor aún, el orden de los eventos o dos medidas entre
  sí (`// tiempo: relación — …`). Si no cabe, la marca `// tiempo: margen Nx
  medido AAAA-MM-DD` encima; lo vigila `ops/testsDeTiempo.test.js`. Una razón
  entre dos tamaños puede repetir hasta que una salga bien (#407).
