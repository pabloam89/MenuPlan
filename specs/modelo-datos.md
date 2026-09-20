# Modelo de datos — auditoría y plan de normalización

Estado medido el 20 sep 2026 contra `src/data/` y los esquemas zod vivos. Todos
los números de este documento salen de scripts ejecutados sobre el catálogo
real, no de lectura de código. El registro declarativo que acompaña a esta
auditoría es [`src/data/model.js`](../src/data/model.js), y `model.test.js` lo
ata a la realidad (cada campo existe en su esquema, cada cobertura es un
trinquete que solo puede subir).

---

## 0 · El patrón de fondo

Hay un solo defecto repetido cinco veces, y hasta que no se vea así cada
arreglo parece un caso aparte. **Toda magnitud del catálogo está a la vez
declarada como escalar y es derivable de sus partes, y ninguna reconcilia.**

| magnitud | declarado | derivable de | ¿reconcilian? |
|---|---|---|---|
| macros | `kcal`, `protein_g`… (100 %) | Σ ingredientes × `nutrition` | **no**: proteína +19,6 % mediana, IC95 [+10, +26] |
| tiempo | `time` (100 %) | Σ `stepsRich[].minutes` (97 %) | **no**: entre +25 % y −28,6 % según el operador |
| gramos | `amount` + `unit` (100 %) | `pieza` del catálogo + `PIECE_WEIGHTS` | **sí, desde hoy** (una sola tabla, `piezaRoundTrip.test.js`) |
| raciones | `baseServings` (100 %) | ratio de proteína + masa/ración | **no**: 51 sospechosas |
| precio | `pricePerUnit` | tabla de precios | **no existe ninguna de las dos**: total = 0 € |

El patrón correcto para todas es el mismo, y ya lo aplicamos una vez con los
gramos: **una tabla canónica, un operador que la lee, y un test que impide la
segunda verdad.** Lo que sigue es aplicarlo a las otras cuatro.

---

## 1 · Los ejes: identidad contra vector

### La pregunta

¿Hace falta `mainProtein` si el vector de ingredientes ya dice qué proteína
domina? ¿Y por qué no hay un `mainHidrato` equivalente?

### Lo medido

Derivando la familia proteica dominante por **gramos de proteína** (resolviendo
por `ingredientId` y `aisle`, no por texto) sobre las 386 recetas Estrella con
proteína declarada y resoluble:

```
coincide con mainProtein declarado:  307/386   79,5 %
discrepa:                             79
```

Y las discrepancias no son errores — son la respuesta:

| discrepancia | n | ejemplo | qué pasa |
|---|---|---|---|
| `legumbre` → cerdo | 13 | Ensalada de garbanzos con chorizo crujiente | el chorizo tiene más proteína, pero el plato **es** una ensalada de garbanzos |
| `cerdo` → huevo | 5 | Tarta de puerros y bacon | el huevo de la quiche gana en gramos |
| `ternera` → huevo | 4 | Milanesa de ternera | el huevo del rebozado |
| `pollo` → cerdo | 7 | Pato a la naranja | el pato etiquetado como pollo, otra vez |

### El veredicto

**No son el mismo dato y no se sustituyen.** El vector responde *qué pesa más*;
`mainProtein` responde *qué es el plato*. Son los planos B (nutrición) y A
(identidad), y coinciden el 80 % del tiempo porque normalmente lo que pesa más
es lo que define. El 20 % restante es justo donde el vector se equivocaría.

Lo que sí hace el vector es ser **el mejor auditor del eje declarado**: volvió a
encontrar los platos de pato sin que nadie se lo pidiera.

### El hidrato

No falta un `mainHidrato`: existe, se llama `mainBase`, y está al 36 % porque
responde a otra pregunta — *«¿qué olla compartes?»* (batch cooking), no *«¿qué
hidrato percibe el comensal?»*. La segunda pregunta la contesta `getCarbType()`,
que usa la tabla `CARB_TYPE_BY_BASE` cuando hay `mainBase` y **cae a un regex
sobre el nombre en el 18,9 % de los casos**.

Derivando el eje de hidrato por masa desde el vector:

```
declarado y derivado coinciden:  268
declarado y derivado difieren:    15      (94,7 % de acuerdo donde hay ambos)
SIN declarar pero derivable:     229      ← esto es lo que se gana
ni declarado ni derivable:       234      (platos sin hidrato: correcto)
```

**Propuesta:** separar las dos preguntas de una vez.

- `mainBase` se queda como está: eje de batch cooking, declarado, 36 %.
- **`carbAxis` nuevo, derivado del vector**, con su procedencia. Sube la
  cobertura del eje de hidrato del 36 % al 66 % y elimina el regex de respaldo
  de `getCarbType`.
- El mismo tratamiento para la proteína: `proteinAxis` derivado **junto a**
  `mainProtein`, no en su lugar, y la discrepancia entre ambos como señal de
  auditoría permanente.

---

## 2 · `scalesWithEaters`: por qué nunca aplicó

### Lo que hay

```js
export function effectiveRecipeTime(recipe, eaters) {
  if (!recipe.scalesWithEaters || !eaters) return recipe.time;
  const extra = Math.max(0, eaters - (recipe.baseServings || 2));
  return recipe.time * (1 + 0.12 * extra);
}
```

`scalesWithEaters` está en **0 de 1.033 recetas**. La condición nunca se cumple,
así que la función devuelve siempre `recipe.time`. Lleva así desde que existe.

Pero el problema no es el flag vacío: es que **el modelo de escalado ya existe y
es bueno, y vive en la entidad equivocada**. `bases.json` tiene, en sus 15 filas:

```
minutosFijos + raciones × minutosPorRacion,  tope en capacidadMax
```

Eso es un modelo de coste correcto: una parte fija que se paga una vez (calentar
la olla) y una parte marginal por ración, con un punto donde deja de caber y hay
que pagar los fijos otra vez. Las recetas, en cambio, recibieron un `×1,12` por
comensal extra, sin origen, detrás de un flag que nadie rellena.

### Propuesta

Subir el modelo de las bases a **todas** las recetas y retirar el factor mágico:

```
tiempo(raciones) = minutosFijos + raciones × minutosPorRacion,  hasta capacidadMax
```

Los dos sumandos **se derivan de los pasos, no se declaran a mano**: un paso
`prep` sobre un ingrediente escala con las raciones (pelar el doble de patatas),
un paso `pasivo` de horno no (la bandeja tarda lo mismo). Ese es el operador que
falta, y `kind` ya tiene la información que necesita.

Con eso, `scalesWithEaters` desaparece: **todas** las recetas escalan, cada una
con sus propios sumandos.

---

## 3 · El tiempo: cuatro representaciones que no reconcilian

| representación | cobertura | qué mide |
|---|---|---|
| `time` (escalar) | 100 % | ¿? — ver abajo |
| `Σ stepsRich[].minutes` | 97 % | todo, incluidas esperas |
| `methods[].time` (por aparato) | 52 % | consistente: error mediano **0,0 %** contra `time` |
| `minutosFijos` + `minutosPorRacion` | 1 % (solo bases) | el único que modela escalado |

Contra `time`, sobre las 1.007 recetas con pasos cronometrados:

```
Σ todos los pasos                    +25,0 %
activeMinutes (sin pasivo/espera)    −28,6 %
+ sin contar los 'paralelo'          −33,3 %
```

**`time` no es ninguna de las tres.** Queda entre la suma bruta y el tiempo
activo, y con el operador más correcto que hay (`activeMinutes`, que ya existe y
descuenta `pasivo`/`espera`) el 55 % de las recetas se va más de un 30 %.

Los peores casos explican una parte: *Carpaccio de salmón* declara `time: 20` y
sus pasos suman **3.138 min** — las 52 h de curado. O sea que `time` y Σpasos
están midiendo cosas distintas y nadie lo ha dicho nunca.

### Propuesta: un solo eje de tiempo, con tres lecturas derivadas

Los pasos ya tienen el dato que hace falta (`kind` distingue si el cocinero está
delante; `during` marca el paralelismo). Lo que falta es **declarar qué significa
cada lectura y derivarlas todas del mismo sitio**:

| lectura | fórmula | para qué |
|---|---|---|
| `activo` | Σ pasos no `pasivo`/`espera`, sin los `paralelo` que caben dentro de otro | el filtro «tengo 20 minutos» |
| `presencia` | `activo` + `pasivo` (el horno trabaja, pero estás en casa) | planificar la tarde |
| `total` | Σ todo, incluidas esperas | «esto hay que empezarlo ayer» |
| `escalado` | `fijo + raciones × marginal` | el modelo de la sección 2 |

Y `time` pasa de ser una fuente a ser **una derivada más** (= `activo`), con el
mismo tratamiento que las macros: se conserva lo declarado, se calcula lo
derivado, y la discrepancia se reporta en vez de esconderse.

---

## 4 · Los gramos: el caso ya resuelto, como plantilla

Es el único eje que **sí** reconcilia, y merece la pena mirar por qué, porque es
el patrón a repetir.

Había dos verdades sobre cuánto pesa una pieza (`ingrediente.pieza` en el
catálogo y `PIECE_WEIGHTS` en `kitchenUnits.js`) y **cuatro puertas de entrada**
que las leían distinto: `pieceGramsFor`, `gramsPerPiece`, `gramsForRecipeQuantity`
y `aggregationUnit`. El desacuerdo costó una regresión real: 21 líneas de la
compra pasaron de piezas a gramos sin vuelta atrás, con los 1.706 tests en verde.

Lo que lo arregló:

1. **Una sola tabla manda** — el catálogo, y el regex queda de red para texto
   libre. Inyectado con `registerPieceCatalog` para no crear un ciclo de imports.
2. **Un test que impide la segunda verdad** — `piezaRoundTrip.test.js` comprueba
   que todo `pieza` del catálogo es lo que ve `kitchenUnits`, y que la lente
   «Unidades» sabe volver a piezas todo lo que el catálogo sabe pesar.
3. **La conversión solo cuando hay algo que fusionar** — `aggregationUnit`
   convierte `ud`→`g` solo si el ingrediente aparece además en peso, no cuando
   simplemente *sabe* pesar.

Las cuatro puertas siguen existiendo pero ya no discrepan. **Siguiente paso:**
agruparlas en un módulo `cantidad` con un `aGramos(linea)` y vistas encima, para
que no haya cuatro criterios distintos de «no sé».

---

## 5 · Normalización del esquema

### 5.1 Ingredientes (383 filas, 15 campos) — está bien

Un plano por campo, sin subtipos, sin grupos repetitivos. El único hueco es de
datos, no de forma: `nutrition` al 52 %, y depende de BEDCA.

### 5.2 Recetas (1.033 filas, 61 campos) — hay tres entidades dentro

**a) La entidad `base`.** Seis campos existen en las 15 bases y en ninguna otra
receta: `rinde`, `minutosFijos`, `minutosPorRacion`, `capacidadMax`,
`reactivacion`, `conservacion`. Más `baseKey` (8/15). Son siete columnas nulas en
1.018 filas. **Debe ser una tabla `bases` 1:1 con `recipes`.**

**b) Tres subtipos por categoría.**

| campo | vive solo en | filas |
|---|---|---|
| `etapaBebe` | `category: bebes` | 59/59 |
| `sauceCompat` | `type: salsa` | 28/28 |
| `dessertKind` | `category: postres` | 6 |

**c) Cuatro campos muertos** — 0 filas los llenan, pero el código los lee:

| campo | lecturas en `src/` | daño |
|---|---|---|
| `scalesWithEaters` | 1 | `effectiveRecipeTime` nunca escala |
| `sauceId` | 16 | la relación plato↔salsa no existe, con 28 salsas y 172 platos que las llevan |
| `aporte` | 3 | se recalcula en runtime en su lugar |
| `canBeGarnish` | 2 | — |

### 5.3 Otros tres defectos de forma

**`methods` es un grupo repetitivo anidado.** 542 recetas con un array de
`{appliance, time, difficulty, prepSummary}`. Es una tabla hija, no un jsonb. Y
solapa con `requiredAppliance` (escalar, 222 recetas, **96 tienen las dos**).

**La nutrición tiene dos formas y dos vocabularios.**

```
receta:       kcal, protein_g, carbs_g, sodium_mg           plano · snake · POR RACIÓN
ingrediente:  kcal100g, protein100g, ..., saturatedFat100g  anidado · camel · POR 100 g
```

Y `allergens` igual: la receta dice `marisco/huevo/lactosa/frutos_secos`, el
ingrediente dice `crustaceos/huevos/leche/frutos_cascara`. Hay un traductor
(`normalizeAllergenId`) que no debería hacer falta.

**`healthFlags` está derivado y almacenado.** `deriveHealthFlags()` lo calcula
para las 1.033 al cargar, y 6 recetas además lo traen escrito. O son overrides y
hay que llamarlos así, o son restos.

---

## 6 · Operadores y calculadoras

14 operadores: 5 conversores, 4 calculadoras, 4 clasificadores, 1 validador.

### Agrupar

| de | a | por qué |
|---|---|---|
| `pieceGramsFor` + `gramsPerPiece` + `gramsForRecipeQuantity` + `convertStockAmount` + `aggregationUnit` | módulo `cantidad`, un `aGramos()` | cinco puertas a la misma pregunta, ya con la misma tabla detrás |
| `activeMinutes` + `effectiveRecipeTime` + el modelo de bases | módulo `tiempo`, un `minutosDe(receta, raciones, lectura)` | tres implementaciones de «cuánto tarda» que no se hablan |

### Separar

`catalogToFrontendRecipe` hace dos cosas sin relación: **escala** por comensales
y **adapta** a restricciones dietéticas. La segunda es un operador propio.

`validateMenu` son **1.920 líneas con 28 reglas**, cada una con id propio
(`proteina_consecutiva`, `guarnicion_repetida`…) pero incrustada en un `if`.
Convertirla en tabla `{id, ámbito, severidad, relajable, predicado}` permite
activarlas por perfil, explicar cuál falló sin leer código, y que el solver y el
prompt lean la misma lista — que es justo la cuarta copia que existe hoy en
`api/_prompts.js`.

### Reescribir por FK

| operador | deuda medida |
|---|---|
| `aporteDe` | clasifica 1.704 de 5.828 líneas por palabras del nombre, y **el 100 % de ellas ya tiene `ingredientId`** |
| `getCarbType` | 18,9 % cae al regex de respaldo |
| `deriveHealthFlags` | 100 % regex sobre nombre + ingredientes |

`resolveIngredient` se queda por texto: es legítimo, las recetas van al 100 % por
FK y esto es la red para lo que escribe el usuario.

### Faltan

- **coste por receta** — no existe, y por eso la cesta da 0 €
- **`aporte` materializado** — se recalcula por petición
- **los sumandos de tiempo** (`fijo`, `marginal`) derivados de los pasos

---

## 7 · Output: el modelo produce datos que el producto no consume

```
consumidores de src/data/derived/*:  model.js, derived.test.js, audit-catalog.mjs
```

`recipeNutrition.json` (1.029 filas) y `recipeParts.json` (el vector por
componente) no llegan a ninguna pantalla. `Menu.jsx` sigue pintando `protein_g`
declarado — el número del que sabemos que discrepa. Y el vector, que ya dice que
la merluza rebozada son 49 g de proteína en el principal contra 9 en la
guarnición, no lo ve nadie.

---

## 8 · Plan, por orden de retorno

Cada fase cierra con su test. Ninguna depende de red ni de clave de API.

| # | qué | por qué primero | riesgo |
|---|---|---|---|
| **1** | Tabla `precios` por ingrediente + operador `costeDeReceta` | es lo único **roto** de cara al usuario: la cesta dice 0 € | bajo |
| **2** | Sacar la entidad `base` (7 campos) y los 3 subtipos | mecánico, no cambia comportamiento, deja el esquema en condiciones para todo lo demás | bajo |
| **3** | Matar los 4 campos muertos; arreglar o retirar `effectiveRecipeTime` | `scalesWithEaters` es una función que no hace nada | bajo |
| **4** | Módulo `cantidad` (5 operadores → 1) | la tabla ya está unificada; falta la puerta | bajo |
| **5** | `aporteDe` por FK | 1.704 líneas con la clave puesta y sin usar; alimenta al solver | medio |
| **6** | Ejes derivados `carbAxis` y `proteinAxis`, con procedencia | +229 recetas con eje de hidrato; elimina el regex de `getCarbType` | medio |
| **7** | Módulo `tiempo`: los cuatro sumandos, `time` pasa a derivada | 55 % de las recetas discrepan hoy y nadie lo sabe | medio |
| **8** | Unificar forma y vocabulario de nutrición y alérgenos | quita dos traductores | medio |
| **9** | `validateMenu` a tabla de reglas | el refactor más grande; hacerlo cuando el resto esté ordenado | alto |
| **10** | Conectar `recipeNutrition` y `recipeParts` a la UI | decide qué número ve el usuario: hace falta cerrar antes la discrepancia | alto |

**Fuera de este plan, y bloqueado por el entorno:** `nutrition` de 185
ingredientes (BEDCA da 403 por política de egress) y `part` de las recetas que
den señal nueva (el pipeline curado necesita `ANTHROPIC_API_KEY`). Ninguno de los
dos se puede estimar: el pipeline lo prohíbe por diseño y con razón.
