# Dominio: Batch cooking (bases)

Estado: **fase 1 implementada** (modelo de datos + catálogo de bases + librería
pura). Sin UI todavía y sin tocar el generador de menús — ver §6.

## 1. Contrato funcional

**Qué hace.** Detecta qué platos de una semana comparten una *base* cocinable
por separado, y calcula la sesión de cocinado: qué bases, cuántas raciones de
cada una, cuánto se tarda y a qué huecos alimenta cada tanda.

**Qué es una base.** Algo que se cocina una vez y alimenta a varios platos: una
olla de arroz, una de legumbre, una bandeja de boniato. Está a caballo entre el
ingrediente (no se compra hecho: hay que cocinarlo) y la receta (nadie cena un
táper de arroz).

**Dónde vive.** En el catálogo, con `type: "base"` — el mismo patrón que ya
usaban las 28 salsas y las 41 guarniciones: receta completa con sus pasos, que
nunca ocupa un hueco de menú (`mealRole: ["base"]`, aislada del generador) y
vive en su propio fichero, `src/data/recipes/bases.json`.

**La invariante que lo sostiene** (`lib/bases.js`): un plato solo aprovecha una
base si declara `baseMode: "aparte"`. Ausente **no** es "dentro": es "sin
revisar", y se trata como "no". El riesgo es asimétrico — proponer precocinar
el arroz de un risotto arruina la cena; no proponerlo solo deja de ahorrar
tiempo.

## 2. Modelo de datos

Todo en el bundle. **Cero migraciones**: los enums de Postgres `recipe_type` y
`meal_role` (`0001_recipe_catalog.sql:24-26`) nunca recibieron `salsa` ni
`desayuno`/`merienda`/`postre`, así que las salsas ya viven solo en el JSON.
`base` entra por esa misma puerta, que además es la prudente dado el problema
de deriva migración↔producción documentado en `INDEX.md`.

### Campos nuevos en `recipeSchema.js`

| Campo | Dónde | Qué resuelve |
|---|---|---|
| `mainBase` | ya existía, **ahora enum** (`MAIN_BASES`, 9 valores) | Era `z.string()` libre y por eso convivían `patata` (8) y `patatas` (81). Es la clave del emparejamiento plato↔base: si no se escribe siempre igual, no se puede agrupar por él |
| `baseMode` | platos con `mainBase` | `"aparte"` \| `"dentro"`. La distinción que hace posible todo esto |
| `rinde` | solo `type: "base"` | `{amount, unit}`. Una base rinde 800 g de arroz, no "4 raciones" |
| `minutosFijos`, `minutosPorRacion`, `capacidadMax` | solo `type: "base"` | El modelo de tiempo afín — ver §3 |

Guardas en el `superRefine`, copiadas del patrón de `salsa`: `type: "base"` ⇔
`mealRole: ["base"]`; una base exige `rinde` y `mainBase`; los cuatro campos de
tanda solo valen en `type: "base"`; `baseMode` exige `mainBase`.

### Por qué NO hay tabla intermedia `recipe_bases`

Porque `mainBase` **ya es** el puntero. Las bases del usuario resultaron ser
una por valor de `mainBase`, así que la relación es 1:N por esa clave y no N:M
con carga útil. Se valoró y se descartó, con evidencia del propio repo:
`sauceId` es el intento anterior de enganchar una preparación a un plato con
una columna, y está declarado en **0 de 1004 recetas**. Añadir una tabla que
no hace falta habría sido repetir ese error por el otro lado.

Si algún día una misma `mainBase` necesita dos bases distintas (arroz blanco vs
arroz rehogado), *ahí* aparece la tabla. Hoy no.

### El catálogo de bases

7 bases, una por cada `mainBase` con platos marcados `"aparte"`:

```
bases_001  Arroz blanco rehogado   arroz     rinde 800 g   18 min fijos + 0,5/ración (máx 12)
bases_002  Pasta cocida al dente   pasta     rinde 700 g   10 min + 0,5 (máx 8)
bases_003  Patatas cocidas         patatas   rinde 900 g   28 min + 1   (máx 12)
bases_004  Legumbre cocida         legumbre  rinde 1000 g  55 min + 1   (máx 16)
bases_005  Quinoa cocida           quinoa    rinde 700 g   18 min + 0,5 (máx 8)
bases_006  Cuscús hidratado        cuscus    rinde 600 g    6 min + 0,3 (máx 10)
bases_007  Boniato asado           boniato   rinde 800 g   42 min + 1   (máx 8)
```

`pan` (83 platos) y `avena` (9) están en `MAIN_BASES` pero **no tienen base**, y
no es un olvido: sus platos están todos marcados `"dentro"`. En `pan` eso
significa Wellington, hamburguesas y tostas — ahí "pan" quiere decir que el
plato lleva pan, no que haya nada que hornear el domingo. La ausencia la decide
el dato, no una excepción escrita en el motor.

Se generan con `scripts/build-bases.mjs`, que deriva `steps` de `stepsRich` con
la misma `richToPlainSteps()` del resto del sistema — mantener las dos copias a
mano es exactamente como se desincronizan.

## 3. El tiempo es afín, no proporcional

Es la razón entera de que el batch cooking ahorre algo:

> Una olla de garbanzos tarda 55 min tanto para 2 raciones como para 16.

`tiempoDeBase(base, raciones)` devuelve `{tandas, minutos, minutosSueltos,
ahorro}`. Dentro de una tanda el tiempo es `minutosFijos + n ×
minutosPorRacion`; pasada `capacidadMax` hace falta otra olla y el tiempo se
suma **entero**, porque nadie tiene dos ollas grandes hirviendo a la vez. Sin
ese tope el modelo prometería cocinar para 40 en el mismo cazo.

`minutosSueltos` es lo que costaría plato a plato (los fijos se pagan enteros
cada vez), y `ahorro` la diferencia — que es el número que entiende el usuario.

## 4. El eje nuevo del generador (todavía NO conectado)

`coberturaDeBases()` cuenta cuántos platos del catálogo comparten cada base. Es
lo que necesita `filterRecipes` para sesgar hacia platos que comparten olla.

**Y no pelea con la variedad**, que era la duda inicial:

> La variedad se mide en platos. El ahorro se mide en bases.

Diez platos distintos que comparten tres bases no violan ninguna de las reglas
de `validateMenu.js` — ni repiten plato, ni encadenan proteína. El motor no
necesita relajarse: necesita un objetivo más (entre dos candidatos igual de
válidos, preferir el que reutilice una base ya presente en la sesión). Es un
término de puntuación, no una excepción a una regla.

Lo que **sí** chocaría de frente es el "cocina una vez, come dos" puro (el mismo
plato en dos huecos), que necesita exención a la no-repetición. Es otra feature
y no está aquí.

## 5. Reparto medido del catálogo

Sobre 1004 recetas, 448 declaran `mainBase`:

```
baseMode aparte  247      baseMode dentro  201      sin decidir  0
patatas 119 · legumbre 83 · pan 83 · pasta 74 · arroz 65 · avena 9 · quinoa 6 · cuscus 5 · boniato 4
```

El marcado lo hizo `scripts/mark-base-mode.mjs` con reglas ordenadas sobre el
nombre, y el criterio vive ahí documentado. La regla que mejor funciona es
gramatical: en castellano de cocina, *"Arroz con X"* es un arroz (el grano se
hace en el plato) y *"X con arroz"* es un plato acompañado de arroz hervido.
Las tres recetas que el nombre no resolvía (Ossobuco, Rabo de toro, Tumbet) se
comprobaron paso a paso y están anotadas como excepción.

## 6. Qué falta

1. **UI**: nada pinta las bases todavía. La ficha de una base se renderiza sola
   (es una receta normal para `RecipeSteps.jsx`), pero no hay pantalla de sesión.
2. **El generador** no sesga hacia bases compartidas: `coberturaDeBases()` está
   escrita y sin consumidor.
3. **Materializar la tanda**: al cerrar una sesión, las raciones sobrantes deben
   escribirse como filas `cooked_dish` en `user_pantry` (`portions`,
   `recipe_ref` → id de la base, `frozen`). Ahí engancha con el flujo de
   nevera/congelador que ya existe y que ya sabe repartir tuppers entre huecos
   (`assignPreparedToPlan`, `lib/freezer.js`) y descontarlos de la compra
   (`cookedEatersFor`, `lib/shoppingBuilder.js`). **Esta es la pieza que cierra
   el círculo** y es la siguiente.
4. **`shelfLifeDays` por receta**: hoy la caducidad de un táper es una etiqueta
   ("hace 3 días", `daysSinceCooked`) y el planner solo sabe "nevera antes que
   congelador". Sin caducidad por receta no se puede ordenar la semana.
5. **`resource` por paso** (horno/fuego/manos) para una línea de tiempo que
   solape varias bases. `cookTimeline.js` ya sabe que un paso `pasivo` no
   bloquea; lo que no sabe es qué aparato ocupa. Medido: solo 344 de 8590 pasos
   llevan marcador `{{@utensilio}}`, así que hace falta una pasada de
   enriquecimiento, no un regex.

## 7. Deuda y hallazgos colaterales

1. **`npm run build:ingredients` está roto** e **independientemente de esto**:
   `src/lib/allergens.js:15` importa `../components/icons.jsx`, y Node no carga
   `.jsx`. Está así ya en HEAD. Por eso "Garbanzos secos" se añadió como alias
   del ingrediente `garbanzos` a mano en `ingredients.json` (la lista ya
   contemplaba "Garbanzos secos crudos (en remojo)", así que es la misma
   decisión que ya estaba tomada, no una nueva).
2. **El dominio `base` del panel era una copia a mano** que ya había derivado
   del catálogo: le faltaba `boniato`. Ahora importa `MAIN_BASES`, así que no
   puede volver a quedarse atrás.
3. **`sauceId` está declarado en 0 recetas** — campo muerto, leído en
   `App.jsx`, `aiPlanner.js` y `recipeCatalog.js`. No es de este dominio, pero
   es la evidencia de por qué aquí no se hizo tabla intermedia.

4. **El prompt del planner enumera mal `mainBase`, y NO se ha tocado.**
   `api/_prompts.js:24` le dice al modelo que la base de carbohidrato es
   *"(arroz/pasta/patatas/quinoa/cuscus/pan/avena)"* — le faltan **`legumbre`
   (83 platos)** y `boniato` (4). O sea que la regla "primero y segundo no
   comparten base de carbohidrato" no ve hoy las repeticiones de legumbre:
   lentejas de primero y garbanzos de segundo pasan el filtro. `filterRecipes.js:549`
   arrastra la misma lista incompleta en un comentario.

   Se deja **deliberadamente sin corregir**: arreglarlo cambia qué menús genera
   el motor para todo el mundo (empezaría a rechazar combinaciones que hoy
   acepta), y eso es una decisión de producto, no una consecuencia colateral de
   haber cerrado el campo a enum. Es exactamente el patrón de duplicación
   código↔prompt que `INDEX.md` ya documenta como transversal.
