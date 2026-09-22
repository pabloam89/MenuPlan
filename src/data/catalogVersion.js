// Bundled catalog version — the anti-degradation "gate".
//
// The reviewed JSON in src/data/recipes/*.json is versioned by this integer.
// Supabase's `recipes` table is allowed to override the bundled catalog ONLY
// when its stored version (catalog_meta.version) is >= this number. If the DB
// is behind (an older seed that predates, say, an allergen fix), the app falls
// back to the bundled JSON instead of silently serving stale, medically
// relevant data. See src/data/recipeCatalog.js.
//
// BUMP THIS whenever you change src/data/recipes/*.json in a way that must
// reach production, then regenerate + apply the seed
// (scripts/generate-supabase-seed.mjs) so Supabase's catalog_meta.version
// matches. Forgetting to push just means the app keeps using the (correct)
// bundled JSON — safe by design.
// v19 (2026-09-01): 63 alérgenos añadidos a 60 recetas por
// scripts/apply-allergen-findings.mjs — gluten de la salsa de soja, sulfitos de
// encurtidos y desecados, huevo de la pasta al huevo, apio, mostaza, pescado y
// lactosa. Médicamente relevante: hasta que la seed llegue a Supabase, este
// número es lo único que impide que la BD sirva las declaraciones viejas.
// v20 (2026-09-03): campo `occasion` en 15 platos de ocasión (marisco de
// ración, arroces de bogavante, paella de marisco, ragú de pato) y las dos
// recetas de orzo fuera del Recetario Estrella. Sin subir este número no
// habrían llegado a producción: Supabase estaba ya en 19, o sea EMPATADO con
// el bundle, así que la nube ganaba y el JSON editado no se leía. Es
// exactamente el caso para el que existe esta puerta.
// v21 (2026-09-04): cuatro ejes rellenados. `mainIngredients` pasa de 6
// recetas a 398 con verdura, 279 con lácteo, 67 fruta, 52 frutos secos, 45
// setas y 32 encurtidos — derivado de la cantidad POR RACIÓN de cada
// ingrediente, no de su presencia (scripts/derive-main-ingredients.mjs).
// `montaje` 58 → 110, `occasion` 15 → 45, y tres ejes nuevos: `kidFavourite`
// (62), `tecnica` (olla 298 / sartén 225 / horno 156 / crudo 110 / plancha 82)
// y `cocina` (italiana 74, mediterránea 20, mexicana 9, asiática 8; ausente =
// española). Ver scripts/mark-catalog-axes.mjs y, para saber si cada eje da
// para servir una petición sin repetir plato, scripts/axis-coverage.mjs.
// v26 (2026-09-07): `estrella: true` en los 20 sólidos de bebé. Entraron en
// v25 sin la marca, y el Recetario Estrella es el único catálogo elegible
// (ver onlyPrimaryCatalog en CatalogBrowserSheet y isPrimaryCatalog en
// filterRecipes), así que la teja "Sólidos de bebé" salía a CERO en
// producción con las 20 recetas ahí, empaquetadas y sin poder verse.
//
// Que solo lleguen a los bebés que ya comen sólido lo garantiza el filtro por
// etapa (filterRecipes.js:252), no la estrella: son dos puertas distintas y
// esta solo abre la de "existe en el catálogo".
//
// v27 (2026-09-08): segunda tanda de sólidos de bebé (bebes_043 → bebes_062),
// con `estrella: true` puesta DESDE EL PRINCIPIO — el fallo de v25/v26 fue
// justo ese, y repetirlo habría vuelto a dejar la teja a cero.
//
// Además, `methods[]` en las 59 recetas de bebé, que estaban a cero mientras
// carnes iba 140/159. Los aparatos se reparten como tienen que repartirse:
// airfryer 0 en cremas y 29 en sólidos, thermomix y olla exprés al revés.
// El prompt de bebés es propio (gen-appliance-methods.mjs): el genérico dice
// "chef experto en cocina española" y devolvía "salpimentar" en el resumen
// que lee un padre.
//
// Sin subir este número no llegan a producción: Supabase está en 26 y empate
// significa que gana la nube.
// v28 (2026-09-10): las BASES, que es la mitad que le faltaba al batch cooking.
//
// Tres cosas, y el orden importa porque cada una habilita la siguiente:
//
// 1. `mainBase` deja de ser string libre y pasa a enum (MAIN_BASES). Convivían
//    `patata` (8 recetas) y `patatas` (81), más `cuscús`/`cuscus`/`sémola` y
//    `lentejas`/`garbanzos` pisando a `legumbre` — 17 recetas, todas de bebés.
//    No rompía nada, que es lo peor: el sesgo "más patatas" del panel se
//    saltaba en silencio esas 8 porque comparaba contra su propio dominio
//    cerrado. Ver scripts/normalize-main-base.mjs.
//
// 2. `baseMode` ("aparte" | "dentro") en 448 platos. Es la distinción que
//    `mainBase` no daba: dice QUÉ fécula lleva el plato, no si esa fécula se
//    puede tener hecha del domingo. El arroz de un bowl se hierve aparte (247
//    platos); el de un risotto se cocina dentro absorbiendo su caldo (201), y
//    precocinarlo no ahorra: arruina el plato. Ver scripts/mark-base-mode.mjs.
//
// 3. bases.json: 7 recetas nuevas con `type: "base"`, off-menu como las
//    salsas. `pan` y `avena` no tienen base y no es un olvido — sus 92 platos
//    están todos marcados "dentro", así que no hay tanda que cocinar.
//
// Sin subir este número no llegan: Supabase está en 27 y empate significa que
// gana la nube. Y aquí el empate haría algo peor que servir datos viejos —
// devolvería `mainBase` sucio a un campo que ya es enum, y el catálogo remoto
// fallaría la validación entera al cargar (recipeCatalog.js cae al bundle,
// así que es seguro, pero el hot-swap dejaría de servir para nada).
// v29 (15 sep 2026): `stepsRich[i].base` en 747 pasos de 266 platos — qué paso
// desaparece cuando esa base ya viene hecha del domingo.
//
// v28 trajo la mitad de la pregunta ("este plato lleva sofrito aparte"); esta
// trae la otra, que es la única que el usuario nota: cuánto trabajo te quitas
// el martes por haberlo cocinado. Hasta ahora el ahorro se medía sobre la
// receta de la BASE (lo que cuesta la olla) y nunca sobre el plato que la usa,
// así que no se podía decir "con el sofrito hecho, esto son ocho minutos".
//
// Lo lee lib/bases.js (montajeTrasBases, esMontajeRapido). Con el dato medido,
// 103 platos estrella se quedan en 15 minutos de manos o menos.
//
// Supabase sigue en 27, así que el bundle ya ganaba con 28. Se sube igual para
// que el margen no se cierre: si alguien sincroniza la nube a 28, el empate se
// lo llevaría ella — y su espejo no tiene estos pasos marcados.
//
// v30 — saneamiento de datos de la auditoría de veracidad: 7 recetas pasan de
// `mainBase: patatas` a `boniato` (no llevaban ni un gramo de patata) y el
// gravlax pasa de `tecnica: sarten` a `crudo`. La nube no tiene ninguno de los
// dos, así que el bundle tiene que ganar.
// v31 (21 sep 2026): el animal correcto en 33 platos, y tres palabras nuevas
// en `mainProtein` para poder decirlo.
//
// El enum tenía diez valores y el recetario once animales, así que trece
// platos declaraban una proteína que no era la suya: siete de pato salían
// como "pollo", dos de cordero y el ragú de jabalí como "ternera", la
// codorniz y la perdiz como lo que tocara. Entran `pato`, `cordero` y `caza`
// —esta última agrupa jabalí, conejo, codorniz y perdiz, igual que la
// subclase `carne_caza` del árbol de alimentos—. No es una etiqueta más fina
// por gusto: quien filtra "pollo" recibía pato, y quien no come cordero lo
// recibía llamado ternera.
//
// Y once líneas de receta pedían un animal y apuntaban al FK de otro, porque
// el catálogo usaba los ALIAS para dos cosas distintas: escribir el mismo
// alimento de otra forma, y nombrar uno parecido. «Solomillo de cerdo» era un
// alias de «Solomillo de ternera», «Carne picada de cerdo» de la de ternera, y
// «Costillas de cordero» y «Costillas de ternera» lo eran de las de cerdo. Un
// alias que cambia de animal no es un alias. Nacen `solomillo-de-cerdo`,
// `carne-picada-de-cerdo` y `costilla-de-ternera`, con su ficha de CIQUAL o
// USDA, y `carrillada` deja de tomar prestada la nutrición de la carrillera de
// ternera. Es el mismo defecto que ya apareció con «Hueso de jamón».
//
// Seis pescados más, y aquí manda el árbol en las dos direcciones: la trucha
// y el emperador se declaraban blancos y son azules; el salmonete se
// declaraba azul y con 3,7 g de grasa es blanco, como el rodaballo. Y
// «Salmonetes limpios» era un alias de los LOMOS DE SALMÓN, que es otro pez.
//
// Campo nuevo, `preparacion` en la línea de ingrediente: en qué se convierte
// la harina dentro de este plato (`masa_pasta` | `masa_pan`). Son 30 líneas
// en 7.415 y existe porque la harina es el único ingrediente cuyo papel
// cambia del todo con la receta — 20 g de rebozado en el pollo crujiente,
// 300 g que SON el naan— y el árbol de alimentos no puede saberlo. Se
// intentaron dos operadores (por cantidad y por composición) y los dos fallan;
// el razonamiento está en IngredientSchema. Lo lee `getCarbType`.
//
// Y tres platos que declaraban la proteína que no manda, cada uno contra la
// convención que el propio catálogo ya sigue: la tortilla de pavo (23 de las
// 24 tortillas declaran `huevo`, incluidas la de gambas y la de pulpo) y dos
// purés de bebé de legumbre con carne (el esquema ya dice que ahí manda la
// legumbre y la carne va en `extraProteins`). En los tres la carne no se
// pierde: pasa a `extraProteins`.
//
// Supabase sigue en 27, así que el bundle ya ganaba. Se sube igual, por el
// mismo motivo que v29: para que el margen no se cierre.
export const BUNDLED_CATALOG_VERSION = 31;
