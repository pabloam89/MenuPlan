# Modelo de datos — auditoría y plan de normalización

Estado medido el 20-21 sep 2026 contra `src/data/` y los esquemas zod vivos.
Las secciones 0-7 son la primera pasada (normalización de campos, magnitudes y
operadores); las 8-12, la segunda (el mapa por ámbito, los bloques que faltaban,
dos correcciones a la primera y los ejes de sesgos y batch cooking). Todos
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
| precio | `pricePerUnit` (el catálogo nunca lo rellena) | SKU de Mercadona, emparejado en runtime | **sí, y funciona** — ver la corrección de §6 |

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

- **coste por receta** — CORREGIDO el 21 sep 2026: la cesta NO da 0 €. lib/listPricing.js la valora con SKUs reales al 92 %. Lo que sí da 0 es shoppingBuilder.total, que multiplica un pricePerUnit que el catálogo nunca rellena; su maquinaria está probada (los tests le pasan precios sintéticos) y solo le faltan datos, así que NO es código muerto y no se retira
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

## 8 · El mapa: una rejilla, no una pila

Las secciones de arriba auditan pieza a pieza. Esta es la vista de conjunto, y
el eje que la ordena NO es "fijo contra cambiante" sino **de quién es el dato**.

```
                    ÁMBITO GLOBAL                  ÁMBITO HOGAR
                    build · versionado · bundle    runtime · por hogar · BD
   ─────────────────────────────────────────────────────────────────────────
   REFERENCIA       alimentos · taxonomía          —
                    transformaciones
                    ingredientes · productos

   CONTENIDO        recetas · bases · pasos        recetas propias
                                                   recetas importadas/compartidas
                          │                              │
                          └──────── MISMO TUBO ──────────┘
                                         │
   L1 · LÍNEAS      precomputado              calculado al guardar
   L2 · DERIVADO    en el bundle              + coverage + nutritionSource

   PREFERENCIAS     reglas_dominio (28)            reglas_usuario · salud · sesgos

   ESTADO           —                              despensa · existencias
                                                   historial · feedback · roster

   EXTERNO          bedca · precios                menú escolar · ticket OCR
   ─────────────────────────────────────────────────────────────────────────
                                         ↓
   L3 · SOLVER      lee las dos columnas a la vez
                                         ↓
   L4 · SALIDA      pantallas · insights · export · seed
```

El eje horizontal es el ámbito; el vertical, el papel en el pipeline. Y la
regla que sale sola: **el pipeline es el mismo código, lo que cambia es cuándo
corre y dónde vive el resultado.** Nunca se escribe una segunda
implementación para las recetas de usuario — y de hecho no está escrita:
`computeRecipeNutrition` es compartida.

### Una receta de otro no es un caso especial

Entra por el mismo tubo, y el código ya lo hace (`userRecipes.js`):

```js
const NUTRITION_COVERAGE_THRESHOLD = 0.7;
const computed = computeRecipeNutrition({ ingredients }, baseServings);
if (computed && computed.coverage >= 0.7) { …usar lo derivado; nutritionSource = "computed"; }
else { nutritionSource = "ai"; }
```

Se resuelven sus líneas, se mide la cobertura, y por encima del 70 % se usa lo
derivado. Y **ya lleva procedencia**: `nutritionSource` es exactamente la
columna `fuente` de esta auditoría, implementada para este caso.

Donde sí degrada, y hay que saberlo:

1. **Cobertura más baja** — sus ingredientes son texto libre. Por eso
   `resolveIngredient` por regex es legítimo aquí y no es deuda.
2. **Le faltan los ejes derivados** — sin `part`, sin `tecnica` curada, sin
   `mainBase`. Y ese es el riesgo real: *una receta propia se hace invisible a
   las reglas que leen esos campos*. No falla; deja de ser evaluable, que es
   peor porque no avisa.
3. **Las compartidas traen procedencia ajena** — si llega con
   `nutritionSource: "computed"` de otro hogar, con otra versión del catálogo
   da otro número. Hay que recalcular siempre y guardar de dónde vino.

### La consecuencia para el modelo de reglas

Hoy una regla tiene dos salidas y le falta la tercera:

| | |
|---|---|
| cumple | adelante |
| no cumple | conflicto, con su coste de relajación |
| **no evaluable** | adelante, **pero contándolo** |

Un menú lleno de platos no evaluables es un menú sin control aunque no viole
nada. Es la misma distinción de cuatro estados del ledger de completitud,
ahora en el solver. Es barato: `reglas_usuario` ya está versionada y tiene
`EFECTOS`; el tercer estado es una columna más.

---

## 9 · Los siete bloques que la primera versión de esta auditoría se dejó

Cruzando los ~130 módulos de `src/lib` contra el mapa, faltaban:

**1. La casa no es una persona.** `reglas.js` declara
`SUJETOS = ["casa", "grupo", "miembro", "invitado"]`, y
`slotEaters.eatersForSlot(group, members, schedule, day, meal)` — **quién come
cambia por día y por comida**. Es una dimensión que atraviesa todo L3, no un
campo del perfil. Añade `groups`, `rosters`, `profileMerge`, `babyStage`.

**2. Despensa y congelador como estado que resta.** `pantry`, `pantryDeltas`,
`cookPantry`, `freezer` (385 líneas), `cookings`. Los tuppers cubren comensales
y descuentan de la compra. Con su propia entrada: foto → `visionImage` →
`receiptParser` → items.

**3. El menú escolar.** `schoolMenu`, `schoolMenuImport`, `kidsMenu`,
`fixedDishes`. Entrada externa que **restringe** el menú.

**4. El historial.** `recientes`, `menuArchive`, `recipeDiversity`. Alimenta el
`PESO_RECIENTE` del solver. Es input, no output.

**5. El bucle de feedback.** `recipeVotes`, `householdFavoritesSync`,
`recipeDiscardsSync`, `recipeCollections`.

**6. El calendario de cocina.** `mealTimes`, `weekCalendar`, `schedulePresets`,
`cookTime`, `cuotaCocinas`. Cuánto tiempo hay **cada día**.

**7. Salidas no listadas.** `menuInsights`, `menuStats`, `consumptionInsights`,
`menuExport`, `sharedMenu`, y el pipeline de imágenes.

---

## 10 · Dos correcciones a lo que esta auditoría afirmó primero

### Las reglas YA son tabla — la mitad de ellas

`reglas.js` son 1.200 líneas y es un modelo de reglas como datos, versionado:

```js
REGLAS_VERSION = 1
SUJETOS  = ["casa", "grupo", "miembro", "invitado"]
EFECTOS  = ["excluir", "presente", "sesgo"]
ORIGENES = ["wizard", "panel", "texto", "manual"]
```

Lo que pasa es que hay **dos sistemas de reglas que no se hablan**: las del
usuario (arriba, ya modeladas) y las del dominio (las 28 de `validateMenu`,
en `if`s). El trabajo no es inventar el modelo: es llevar las 28 al que ya
existe. Mucho más barato de lo que decía la sección 6.

### Los dos "pesos" no son escalas incomparables

Se afirmó que `PESO_SESGO = 12` y `PESO_RECIENTE = 6e3` eran dos funciones
objetivo que no se pueden sumar. **Es falso, y el diseño real es bueno.**

`sesgos.js` no puntúa el menú: **ordena la cola de platos**. El solver recibe
el pool ya ordenado y usa la **posición** como último desempate
(`indice.get(r.id) * 0.5`). Su escala propia está calibrada y documentada:

```
déficit de familia que falta   10.000   ← si falta pescado, sale pescado
completitud (plato solo)        4.000
recientes                       6.000   ← variedad, por debajo del déficit
coste de tiempo                 1.000
posición en la cola                0,5 × puesto  (≈ hasta 500)
ruido                              …    ← los dos últimos no llegan a 700
```

El 12 nunca se encuentra con el 6.000: se convierte en "eres el puesto 37", y
eso cuesta 18 puntos, que es ruido.

**Lo que sí es frágil:** es una dependencia implícita. El solver da por hecho
que alguien llamó a `ordenarPorSesgo` antes. Con el pool sin ordenar, el
término de posición deja de ser preferencia y pasa a ser azar, y nada lo avisa.

---

## 11 · Sesgos: qué toca y cómo mejorarlo

Lee **cuatro cosas** de la receta y nada más:

| lee | cobertura | consecuencia |
|---|---|---|
| `tecnica` | 88 % | bien |
| `mainBase` + `basesAparte` | 36 % | "más arroz" mueve un tercio del catálogo |
| `llevaSalsa` | 17 % | "platos con salsa" ve 172 recetas |
| `ingredients[].name` | por **substring** | bug, ver abajo |

De los 10 campos del wizard solo 4 pasan por aquí; `esfuerzo` **no llega a
ningún sitio**, y el código lo dice: *"se queda fuera A PROPÓSITO: no hay un
campo del plato que lo represente sin ambigüedad"*.

### Bug vivo en favoritos

El match es `nombreIngrediente.includes(favorito)`:

```
"te"    casa con  972 de 1033 recetas   ← tomate, aceite, lentejas…
"ajo"   casa con  435                   ← ajonjolí, ajoblanco
"pan"   casa con  130                   ← 8 solo llevan PANceta
"col"   casa con   40                   ← coliflor
```

Marcar "te" como favorito sube el 94 % del catálogo: **el sesgo se anula solo**.
Y el arreglo está escrito 20 líneas más allá, en `kitchenUnits.js`, cuyo
comentario dice *"`pan` con frontera por los DOS lados: sin la de la derecha se
comía la PANceta"*. La lección se aprendió en un módulo y no se aplicó aquí.

### Las tres mejoras, y dos son gratis

1. **`favoritos` por FK, no por substring.** El `ingredientId` está al 100 % y
   no se usa. Arregla el bug y, con la taxonomía, permite "más pescado azul".
   Cero campos nuevos.
2. **`esfuerzo` es derivable.** Con el modelo de tiempo de L2
   (`activo`/`presencia`/`total`) más `difficulty` y el número de pasos, cae
   solo. No hay que inventar campo.
3. **Los sesgos son débiles porque los campos están vacíos**, no porque el
   mecanismo esté mal. Al derivar `carbAxis` el sesgo de base se fortalece sin
   tocar `sesgos.js`.

---

## 12 · Batch cooking: casi todo existe, y en 15 filas

Bases, semi-elaborados y cocinados son **lo mismo — existencias** — y solo se
diferencian en el estado. Lo que necesitan y ninguna otra tabla tiene: estado ·
raciones (no gramos) · ubicación · fecha de hecho · caducidad · coste de
recalentar.

**La calculadora que haría falta ya está escrita.** `tiempoDeBase(base,
raciones, metodo)` hace `minutosFijos + raciones × minutosPorRacion`, parte en
tandas al superar `capacidadMax`, cruza la capacidad del aparato
(`CAPACIDAD_POR_APARATO`) con lo que ocupa una ración según el `rinde`, y
calcula el ahorro contra cocinar cada plato aparte.

Y la "activación" tampoco hay que inventarla: `reactivacion` **no es un número,
son pasos reales** con sus `minutes` y su `kind`. Los pasos que desaparecen
cuando la base ya está hecha son `stepsRich[].base` (29,3 %), y los calcula
`recetaConBases.js`.

### El hueco real

No es el modelo: es que está **al 100 % en 15 filas y al 0 % en el resto**.

| coeficiente | dónde está | dónde falta |
|---|---|---|
| `minutosFijos`, `minutosPorRacion`, `capacidadMax`, `rinde` | 15/15 bases | las ~300 batcheables |
| `reactivacion` | 15/15 bases | los cocinados de nevera |
| `conservacion` `{nevera: 2}` | **15 recetas** | **las 293 con `thawSteps`** |

Ese último es el que importa: **hay 293 recetas que saben cómo descongelarse y
ninguna sabe cuánto dura**. Y las existencias no tienen fecha — lo único que
hay sobre caducidad en `freezer.js` es una heurística de orden (*"Nevera va
antes porque caduca antes"*).

### Lo genuinamente nuevo de todo el batch cooking

Descontando lo que ya existe: **poner fechas al inventario.** Nada más. El
resto es extender cuatro campos fuera de las 15 bases.

`existencias` es además **la única tabla que está a la vez en L0 y en L3**:
entrada del solver y salida del menú. Ese es el bucle, y es donde el tiempo
entra en el modelo — un tupper del domingo vale el martes y no el viernes. Eso
convierte el problema de "resolver una semana" en "resolver una semana dado un
inventario con fechas", que es planificación con recursos perecederos. Va
aparte, en la fase G.

---

## 13 · Plan, por orden de retorno

Cada fase cierra con su test. Ninguna depende de red ni de clave de API.

Antes que todas ellas existe una **Fase A** —partir `alimentos`/`productos`/
`ingredientes` y cerrar L0 por ingesta— que está escrita en §14 y §15 y
**no está arrancada**. Las fases 1–12 no dependen de ella: se puede hacer A
primero o dejarla para después de la 1.

| # | qué | por qué primero | riesgo |
|---|---|---|---|
| **1** | Afinar el emparejamiento ingrediente→SKU | **PREMISA CORREGIDA (21 sep 2026)**: la cesta NO dice 0 €. `lib/listPricing.js` la valora con SKUs reales de Mercadona, al 92 % de cobertura y contando envases enteros. No falta una tabla de precios: falta curación — 31 ingredientes sin SKU y 89 con confianza < 0,6 | bajo |
| **2** | Sacar la entidad `base` (7 campos) y los 3 subtipos | mecánico, no cambia comportamiento, deja el esquema en condiciones para todo lo demás | bajo |
| **3** | Matar los 4 campos muertos; arreglar o retirar `effectiveRecipeTime` | `scalesWithEaters` es una función que no hace nada | bajo |
| **4** | Módulo `cantidad` (5 operadores → 1) | la tabla ya está unificada; falta la puerta | bajo |
| **5** | `aporteDe` por FK | 1.704 líneas con la clave puesta y sin usar; alimenta al solver | medio |
| **6** | Ejes derivados `carbAxis` y `proteinAxis`, con procedencia | +229 recetas con eje de hidrato; elimina el regex de `getCarbType` | medio |
| **7** | Módulo `tiempo`: los cuatro sumandos, `time` pasa a derivada | 55 % de las recetas discrepan hoy y nadie lo sabe | medio |
| **8** | Unificar forma y vocabulario de nutrición y alérgenos | quita dos traductores | medio |
| **9** | `validateMenu` a tabla de reglas, con el tercer estado `no evaluable` | más barato de lo que parecía: `reglas.js` ya tiene el modelo | medio |
| **10** | Conectar `recipeNutrition` y `recipeParts` a la UI | decide qué número ve el usuario: hace falta cerrar antes la discrepancia | alto |
| **11** | Coeficientes de tanda fuera de las 15 bases + `conservacion` en las 293 | extender campos existentes, no crear | medio |
| **12** | La casa como sujeto múltiple en L3 (hoy repartido entre `groups`, `slotEaters`, `profileMerge`) | toca el solver | alto |
| **G** | **Fechas en `existencias`** y el solver con inventario perecedero | problema distinto y más difícil que las macros: planificación con recursos que caducan | alto |

**Fuera de este plan, y bloqueado por el entorno:** `nutrition` de 185
ingredientes (BEDCA da 403 por política de egress) y `part` de las recetas que
den señal nueva (el pipeline curado necesita `ANTHROPIC_API_KEY`). Ninguno de los
dos se puede estimar: el pipeline lo prohíbe por diseño y con razón.

---

## 14 · Fase A — `alimentos`: el esquema, y por qué la ingesta de hoy no vale

> **Esta fase no está arrancada.** Queda escrita aquí para decidirla antes de
> tocar el pipeline, no para ejecutarla. Las fases 1–12 de arriba no dependen
> de ella.

### El diagnóstico, en una línea de código

```js
// scripts/apply-bedca-nutrition.mjs:169
ing.nutrition = chosen.nutrition;
```

`chosen` trae `foodId` y `foodName` de BEDCA. Se copian los ocho números y se
tira todo lo demás. Resultado medido: **198 ingredientes con `nutrition`, 0 con
procedencia.** No se puede responder "¿de qué ficha salió esta proteína?" ni
"¿esta ficha es del atún fresco o del de lata?" — y esas dos preguntas son la
misma pregunta.

El emparejamiento ingrediente↔BEDCA es lo caro de este pipeline (triaje,
selección, filtro de Atwater). Ingerir ahora contra `ingredients.json` y partir
las entidades después significa **pagarlo dos veces**. Por eso Fase A no es
"añadir una tabla": es cambiar el destino de escritura del último script.

### Las tres entidades, y la regla que las separa

La regla es **antes o después de la caja del súper**:

| | `alimentos` | `productos` | `ingredientes` |
|---|---|---|---|
| qué es | lo que existe y se puede analizar | lo que tiene código de barras | lo que una receta pide |
| lo define | BEDCA / composición | el súper | el catálogo |
| clave | `alimentoId` | `sku` / `ean` | `ingredientId` (ya existe) |
| cambia | cada años | cada semana (precio) | cuando se edita una receta |
| ámbito | global, bundle | global, cron | global, bundle |
| trae | macros, micros, densidad, fracción comestible | precio, formato, marca, alérgenos de etiqueta | alias, pieza, política de compra |

El ingrediente **no desaparece ni se duplica**: se queda como lo que ya es —el
nombre con el que hablan las recetas— y pasa a ser un puntero:

```
ingrediente ──apunta a──► alimento   (de dónde salen sus macros)
            ──apunta a──► producto   (qué se compra por defecto, y a qué precio)
```

Las 383 filas de hoy sobreviven intactas. Lo que se mueve es `nutrition`, que
deja de vivir en el ingrediente y pasa a leerse del alimento al que apunta.

### El esquema

```js
// src/data/alimentoSchema.js  (propuesto)
export const AlimentoSchema = z.object({
  id: z.string().regex(SLUG_RE),          // "atun-conserva-aceite-escurrido"
  nombre: z.string().min(1),

  // ── Procedencia: lo que hoy se tira ──────────────────────────────────
  fuente: z.enum(["bedca", "etiqueta", "manual"]),
  fuenteId: z.string().nullable(),        // foodId de BEDCA
  fuenteNombre: z.string().nullable(),    // "Atún, en aceite, enlatado, escurrido"
  fuenteFecha: z.string().nullable(),     // cuándo se leyó

  // ── Plano A: identidad ───────────────────────────────────────────────
  familia: z.enum(FAMILIAS),              // "pescado_azul"
  taxonomia: z.object({                   // solo proteínas, 5 niveles
    reino: z.string(), clase: z.string(), subclase: z.string(),
    especie: z.string().nullable(), variedad: z.string().nullable(),
  }).nullable(),

  // ── Las siete dimensiones de variedad ────────────────────────────────
  // Enums condicionados: qué dimensiones aplican a cada familia lo dice
  // FAMILIA_DIMENSIONES. Una dimensión que no aplica NO es null: es
  // "no_aplica". Un null aquí significa "aplica y no lo sabemos".
  dimensiones: z.object({
    corte:        DimEnum(CORTES),        // lomo / ventresca / migas
    estado:       DimEnum(ESTADOS),       // fresco / congelado / seco / conserva
    medio:        DimEnum(MEDIOS),        // aceite / agua / escabeche / natural
    procesado:    DimEnum(PROCESADOS),    // crudo / cocido / ahumado / curado
    presentacion: DimEnum(PRESENTACIONES),// entero / fileteado / triturado
    origen:       DimEnum(ORIGENES),      // salvaje / cultivo / almadraba
  }),

  // ── Plano B: nutrición, por 100 g de PARTE COMESTIBLE ────────────────
  nutricion: NutricionSchema.nullable(),  // la de hoy, sin cambios de forma

  // ── Conversión física (§15) ──────────────────────────────────────────
  densidad: z.number().positive().nullable(),        // g/ml
  fraccionComestible: z.number().min(0).max(1).nullable(), // 1 = todo se come

  // ── Libro de cuentas: por qué falta lo que falta ─────────────────────
  huecos: z.record(z.enum([
    "relleno", "no_aplica", "ausente_resoluble", "ausente_sin_fuente",
  ])),
}).strict();
```

`familia` es enum y no texto libre a propósito, por lo mismo que lo son
`SHOPPING_AISLES` y `INGREDIENT_CATEGORIES`: **añadir un valor obliga a tocar
este fichero**, así que es una decisión, no un typo.

### El parseo ya está escrito — y tira su resultado

Esto es lo que hace defendible la fase. `scripts/lib/bedcaState.mjs` ya lee las
dimensiones de los nombres de BEDCA:

| lo que hay hoy | qué dimensión es en realidad | qué hace con ella |
|---|---|---|
| `cookState()` → crudo/cocinado/neutro | `procesado` | **descarta** el candidato |
| `COOKED_STATE_WORDS` (56 palabras) | `procesado` | filtro |
| `RAW_STATE_WORDS` (8) | `estado` | filtro |
| `DISH_FORM_WORDS` (53) | `presentacion` + `procesado` | filtro |
| `coreWords()` | **el alimento sin dimensiones** | clave de matching, no se guarda |

`coreWords()` es literalmente "quítale las dimensiones al nombre y quédate con
el alimento". El parser existe, funciona y se usa como criba. Fase A no lo
escribe: lo **guarda**.

El parseo completo sale de la forma en que BEDCA nombra sus fichas, que es
regular:

```
"Atún, en aceite, enlatado, escurrido"
  └─ núcleo ──┘ └ medio ┘ └ estado ┘ └ presentación ┘
```

Se corta por comas, cada fragmento se busca en el vocabulario de una dimensión
y el núcleo va contra la familia. **Un fragmento que no case con ninguna
dimensión no se adivina**: la fila entra con esa dimensión en
`ausente_resoluble` y el fragmento se apunta en un informe. Es el mismo
contrato que ya cumple el pipeline de `part`: sin señal, no se escribe.

### Lo que NO hace Fase A

- No infla el catálogo a 3.000 filas de golpe. Se crea una fila de `alimentos`
  por cada ficha de BEDCA que el catálogo ya usa (198 hoy) más las variedades
  que una receta distinga de verdad. Las variedades sin consumidor no se crean.
- No toca `ingredients.json` salvo para añadirle un `alimentoId`.
- No cambia ningún número que vea el usuario hasta la fase 10.

---

## 15 · Curación: `familia`, `densidad` y `rendimiento` — para qué son

Las tres son campos **curados**, no ingeridos: BEDCA da los dos últimos solo a
veces y la familia no la da nunca. Van después de la ingesta y antes de
cablear. Esta sección es la respuesta a "¿para qué queríamos estos valores?",
con la medida de lo que cada uno compra.

### 15.1 `familia` — hoy el catálogo agrupa por pasillo, no por alimento

Lo medido en `ingredients.json`:

```
383 ingredientes, 6 categorías:
  Verduras y frutas 209 · Carnes y pescados 84 · Despensa 38
  Lácteos y huevos 24 · Legumbres y pasta 19 · Panadería y cereales 9
```

`category` **es el pasillo del súper**: 209 filas en un solo valor, y atún y
pollo en el mismo. Sirve para ordenar la lista de la compra, que es para lo que
se hizo, y no sirve para nada de lo que el modelo necesita. `familia` es la
clave de agrupación que falta, y compra cuatro cosas concretas:

1. **La vista de libro de cuentas.** "De la familia `atun`, ¿cuántas variedades
   y cuántas rellenas?" no se puede preguntar hoy. Es la pregunta que convierte
   el relleno de tablas en un trabajo con final, en vez de en martillazos.
2. **El bug vivo de favoritos (§11).** El sesgo casa por subcadena, y `"te"`
   entra en **972 de 1.033** recetas. Con familia, un favorito es una FK y el
   bug desaparece por construcción, no por un parche al `includes`.
3. **`aporteDe` por FK (§6).** Clasifica **1.704 de 5.828 líneas por palabras
   del nombre** teniendo el `ingredientId` puesto en el 100 % de ellas. Le
   falta a dónde apuntar: la familia es ese destino.
4. **Es de donde cuelga la taxonomía de 5 niveles**, y el solver ya la usa sin
   tenerla: el peso más alto de toda la jerarquía —`déficit de familia que
   falta`, 10.000 (§10)— decide por familia proteica hoy, derivándola a mano.

Coste: **383 filas × 1 campo**, la mayoría deducible de la taxonomía que ya
existe en `PROTEIN_GROUP_BY_MAIN_PROTEIN`.

### 15.2 `densidad` — 1 de cada 4 líneas del catálogo se pesa a ojo

Lo medido sobre las 7.586 líneas de ingrediente del catálogo:

```
unidades:  g 5.248 · ml 1.776 · ud 562
en ml:     1.776 líneas = 23,4 % del catálogo
```

Todas esas líneas, al convertirse a gramos, asumen **1 g/ml** — porque no hay
otro número. Las que más pesan:

| línea | veces | densidad real |
|---|---|---|
| Aceite de oliva | 705 | 0,92 |
| Aceite de oliva virgen extra | 118 | 0,92 |
| Tomate triturado | 114 | ~1,05 |
| Vino blanco | 81 | ~0,99 |
| Leche | 71 | 1,03 |
| Nata para cocinar | 68 | ~1,01 |
| Zumo de limón | 56 | ~1,03 |
| Caldo de verduras | 47 | ~1,00 |

Solo el aceite: **36.054 ml en el catálogo, contados como 36.054 g cuando son
33.170 g** — un 9 % de error, y no en un ingrediente cualquiera. El aceite es
el término que más mueve la medición de macros: en el bloque 1 de la auditoría,
contarlo o no contarlo lleva la grasa de **−39,1 % a +18,9 %**. Es decir, el
aceite es la palanca dominante del único macro que no cuadra, y su masa se está
calculando con un 9 % de sesgo sistemático. No explica el hueco entero; es la
parte del hueco que se arregla con un número.

Qué compra: que los gramos reconcilien también en las líneas de ml —hoy
reconcilian solo las de `g` y `ud` (§4)—, que la lista de la compra pueda decir
"1 botella de 1 L" en vez de "920 g", y que la grasa deje de tener un sesgo
conocido y no corregido.

Coste: **unas 40 filas cubren el 90 % del volumen en ml.** No hacen falta las
383.

`densidad` va en `alimentos` y no en `ingredientes` porque es una propiedad
física del alimento, y porque el mismo ingrediente en dos estados tiene dos
densidades.

### 15.3 `rendimiento` — no es un campo: son dos cosas, y van a dos tablas

Esta es la corrección importante. "Rendimiento" mezcla dos fenómenos que
ocurren en momentos distintos y que pertenecen a sujetos distintos. La misma
regla de antes: **antes o después del fuego.**

**(a) Fracción comestible — antes del fuego, propiedad del alimento.**

Lo que se tira: cáscara, hueso, espinas, concha. Medido: **16 líneas** del
catálogo nombran explícitamente el entero o el no pelado, en 14 nombres:

```
Pollo entero · Codorniz limpia entera · Jarrete de ternera con hueso (ossobuco)
Lubina entera · Lubina entera limpia · Dorada entera · Dorada (limpia, entera)
Dorada entera limpia sin escamar · Rodaballo entero limpio
Langostinos frescos con cáscara · Vieiras limpias en su concha
Lomo de salmón fresco con piel · Coliflor entera · Champiñones enteros
```

Son pocas y son las peores: una dorada entera es ~45 % descarte, así que sus
macros por 100 g de compra están **casi al doble** de lo que el comensal come.
Van a `alimentos.fraccionComestible`, y son 14 filas de curación manual.

**(b) Cambio en cocción — después del fuego, propiedad de la técnica.**

Agua que se pierde, grasa que se absorbe. No es del alimento ni del
ingrediente: es del par **(familia, técnica)**. Va a `transformaciones`, con dos
coeficientes por par: `factorPeso` y `factorGrasa`.

Y aquí está el bloqueo que hay que decir en voz alta: **no existe campo de
técnica.** Lo comprobado:

```
methods: 1.256 entradas, y su forma es
  { appliance, time, difficulty, prepSummary }   ← electrodoméstico, no técnica
491 de 1.033 recetas no tienen methods siquiera
```

La técnica vive en el texto de los pasos. Señal medida por regex sobre
`stepsRich` (solapan entre sí, no suman 1.033):

```
plancha/salteado 527 · frito 467 · asado/horno 286 · vapor 109 · hervido 100
sin ninguna señal: 180 recetas
```

Es señal, no dato. Declarar la técnica es un campo **juzgado**, no ingerible, y
por tanto **(b) va detrás del pipeline curado, no dentro de la ingesta de L0**.
Meterlo en Fase A sería adivinarlo con un regex sobre texto libre, que es
exactamente lo que esta auditoría ha desmontado tres veces (`getCarbType`,
`SE_COME_CRUDO`, el `/aceite/` que casaba "Anchoas en aceite").

### 15.4 El orden que sale de esto

| | qué | ingerido o juzgado | coste | desbloquea |
|---|---|---|---|---|
| **A1** | `alimentos` con procedencia y dimensiones | ingerido (BEDCA) | reescribir el destino de 1 script | que las macros tengan de dónde |
| **A2** | `productos` con SKU y precio | ingerido (cron Mercadona) | **mucho menos de lo que parecía**: `public/store/mercadona.json` ya está en el repo con 3.051 productos y sus precios, y `lib/productMatcher.js` ya empareja en runtime | curar los 31 sin SKU y los 89 débiles |
| **A3** | `familia` en las 383 filas | juzgado, pero derivable de la taxonomía | 1 campo × 383 | §11 favoritos, §6 `aporteDe`, el libro de cuentas |
| **A4** | `densidad` en ~40 filas | curado | 40 números | 23,4 % del catálogo deja de pesarse a ojo |
| **A5** | `fraccionComestible` en 14 filas | curado | 14 números | los enteros dejan de contar el hueso como comida |
| **—** | `tecnica` por paso + `transformaciones` | **juzgado, sin fuente** | pipeline curado | (b), y queda **fuera** de L0 |

A1–A5 cierran L0 de verdad. A lo que sigue después ya se le puede llamar
"rellenar tablas" sin que sea un eufemismo de adivinar.
