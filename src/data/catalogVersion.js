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
// v32 (22 sep 2026): once recetas cuyas calorías estaban mal entre 88 y 265
// kcal POR RACIÓN, y la causa era la misma que la de los alias de animal de
// v31: un `ingredientId` sirviendo dos alimentos distintos.
//
// `computeRecipeNutrition` (ingredients.js:334) multiplica la ficha por los
// gramos pedidos, así que el peso de la receta y la ficha tienen que hablar
// del MISMO estado del alimento. No lo hacían:
//
//   `lentejas`   ficha «Lenteja, seca, cruda» (309 kcal) y cuatro líneas que
//                dicen «cocidas»     → +253 kcal/ración en cuatro ensaladas
//   `garbanzos`  ficha «Chick pea, boiled» (147) y líneas que dicen «secos»
//                                    → −176 kcal/ración
//   `arroz`      ficha cruda (386) y una línea «Arroz cocido» en los burritos
//                                    → +106 kcal/ración
//
// Nacen `lentejas-cocidas`, `garbanzos-secos`, `alubias-secas` y
// `arroz-cocido`, cada uno con su ficha de CIQUAL. Y siete guisos largos
// —dos cocidos madrileños, el puchero andaluz, la alubiada, dos potajes y el
// seco de res— pasan a pedir la legumbre «seca» en el nombre: nadie cuece un
// bote dos horas y media, y ahora la lista de la compra tampoco lo manda.
//
// Dos fichas ROTAS, que es otra cosa: `judia-blanca` y `judia-negra`
// compartían la de BEDCA 2199, que se llama «Judías blancas, COCIDAS» y trae
// 322,9 kcal — composición de alubia SECA. Más energía que la seca es
// imposible, y el motivo de `alubias` ya documentaba ese mismo fallo de
// BEDCA: se arregló allí en su día y se dejó aquí.
//
// Se retira `fabes`, que se quedaba sin usos y cuya ficha «Judía blanca» de
// 241 kcal no describe ningún estado real: ni seca (~330) ni cocida (~112).
// v33 (2026-09-22): el gluten del surimi, y tres correcciones de masa.
//
// MÉDICAMENTE RELEVANTE, y por eso este número sube: «Salpicón de marisco»
// lleva surimi, el surimi comercial lleva almidón de trigo, y ni el
// ingrediente ni la receta declaraban gluten. Declaraban `crustaceos`, que
// SOBRA —es pasta de abadejo, no cangrejo— y no se ha quitado: avisar de más
// es inofensivo y quitar un alérgeno pide más prueba de la que hay.
//
// Y tres cosas que movían gramos:
//
//   · 810 g de atún rojo de sashimi cobraban la ficha de la conserva en
//     aceite (203,7 kcal contra 144). Tres líneas pasan de `atun` a
//     `atun-fresco`, que ya existía con la ficha buena y que otras cuatro
//     recetas usaban bien. Los alias se mueven con ellas: el nombre y la
//     clave tienen que resolver al mismo sitio o el test lo canta.
//
//   · Nueve líneas de pescado YA fileteado volvían a perder cabeza y espina,
//     entre 16 y 77 kcal por ración. El regex conocía «Merluza EN LOMOS» y no
//     «LOMOS DE merluza», y el catálogo escribe las dos. Es la segunda vez que
//     se arregla —el parche de septiembre cerró 18 líneas y dejó estas nueve—
//     y ahora hay un test que prueba las dos formas de cada palabra.
//
//   · 2 kg de cola de rape se contaban como carne. `monkfish` recibe 0,73
//     (BEDCA f_id 2623, consultado en vivo y confirmado en su duplicado
//     f_id 1918) y `rodajas-de-emperador` 0,94. Con ellos, 21 alimentos más
//     declaran explícitamente que se comen enteros: hasta ahora la ausencia
//     significaba a la vez «no se tira nada» y «nadie lo ha mirado», y eran
//     el mismo silencio para «Gambas peladas» y para «Rape».
//
// Quedan tres huecos declarados y escritos en fraccionComestible.json:
// `gambas` (hay que partir el alimento, no darle un número), `caballa` y
// `cabracho` (sus recetas dicen que se tira, y no hay fuente en BEDCA,
// CIQUAL ni USDA: se cierran con una báscula).
// v34 (2026-09-22): la tabla de alimentos, curada. 76 fichas que no eligió
// nadie → 67, y 14 huecos de nutrición → 1.
//
// `via: "macros"` significaba que el emparejador había cogido, entre candidatos
// que viven en output/ (gitignored), la única ficha cuyos cuatro macros duros
// coincidían. Desde el repo era indistinguible de una decisión revisada. De las
// 76, nueve estaban MAL:
//
//   pechuga-de-pollo  «Pollo, pechuga, PLANCHA» sobre peso crudo → ciqual:36017
//                     crudo sin piel. −35 kcal/100 g en 13,4 kg. Es el fallo de
//                     la v32 (lentejas, garbanzos) en la proteína más usada.
//   tomate-triturado  compartía la ficha del tomate FRESCO con `tomate`
//                     → ciqual:20169 «Tomato pulp, canned». 25 kg.
//   pan-rallado       la ficha de BEDCA tiene 34,9 % de agua: eso es una barra
//                     de pan, no rallado de paquete → ciqual:7500, 7,3 %.
//   aceitunas         54 mg de sodio en una aceituna de salmuera. Las CUATRO
//   aceitunas-negras  fichas de aceituna de BEDCA traen ese 54, que es aceituna
//                     de árbol → ciqual:13033, en salmuera. Y aquí el error
//                     había SOBREVIVIDO a la revisión humana.
//   mantequilla       «Mantequilla salada», 870 mg de sodio, sobre 146 líneas
//                     que dicen «Mantequilla» a secas → sin sal. En una receta
//                     la sal va en su propia línea; contarla dos veces son
//                     ~48 g de sodio que el catálogo no tiene.
//   lima              8,3 kcal contra 40,2 de CIQUAL y 30 de USDA. Cuando una
//                     fuente se sale 4× contra dos que concuerdan, pierde ella.
//
// DOS ALIMENTOS PARTIDOS, y los dos por el mismo motivo que ya separó
// `merluza` de `merluza-lomos`: un id no puede servir dos productos.
//
//   gambas → gambas + gambas-enteras. El ingrediente se llama «Gambas peladas»
//     y 14 líneas decían «Gambas» a secas. 13 pasan a enteras (0,47): nueve
//     porque su propio paso dice «Pelar gambas, reservar las cabezas», cuatro
//     arroces por criterio declarado. La del revuelto se queda pelada y se le
//     cambia el NOMBRE, porque si no «Gambas» resolvería a dos alimentos.
//     Son 917 g de gamba fantasma fuera: en «Gambas al ajillo», −18,3 g de
//     proteína por ración.
//
//   bonito-del-norte → + bonito-fresco (ciqual:26076 «Albacore, raw»; bonito
//     del norte es Thunnus alalunga, coincidencia de especie). 500 g de bonito
//     fresco cobraban ficha de conserva escurrida: no son las 13 kcal, son
//     217 mg de sodio fantasma por ración en el marmitako.
//
// Y los huecos dejan de mentir: `no_aplica` para los tres que no aportan masa
// (el código descarta la línea antes de leer la ficha) y `ausente_sin_fuente`
// para los siete que no están en BEDCA, CIQUAL ni USDA. **Cero pendientes.**
//
// Los tres últimos se creyeron bloqueados durante unas horas, y la historia
// vale más que el arreglo: `harissa`, `requeson` y `chocolate` tenían ficha
// exacta en CIQUAL y se dieron por imposibles porque CIQUAL deja el campo de
// energía vacío cuando su balance de materia no cierra. Tres revisiones
// distintas lo leyeron en el XML crudo y las tres concluyeron que el pipeline
// no sabía calcularla.
//
// Sí sabía. `fichasUtiles` (scripts/lib/ciqualParse.mjs) calcula la energía por
// Atwater desde hace tiempo, con la fibra a 2 kcal/g del Reglamento UE
// 1169/2011, y basta con no leer el XML a mano:
//
//   requeson   la ficha de BEDCA dice «Cottage cheese» en inglés y trae un
//              tercio de la grasa → ciqual:19585 «Ricotta», 158 kcal
//   chocolate  bedca:788 es un ~50 % → ciqual:31005, 526 kcal y 12 g de fibra
//   harissa    último hueco del catálogo → ciqual:11112, 76 kcal
//
// La lección no es sobre la harissa: es que tres lecturas del dato crudo
// coincidieron en una conclusión que el código desmentía en diez líneas.
//
// DOS ALIAS MÁS QUE ERAN OTRO ALIMENTO. Nadie los estaba mirando porque no
// fallaban: resolvían, tenían ficha y daban un número.
//
//   vino-generoso  Pedro Ximénez, Oporto, Jerez, oloroso y vino rancio colgaban
//     de `vino-blanco` y cobraban sus 60 kcal. Son vinos de 15-20° contra los
//     12° de uno de mesa: 1.080 ml del catálogo a menos de la mitad de su
//     energía. Van a usda:173176 (160 kcal). No a BEDCA, cuyas TRES fichas de
//     «Vino dulce, tipo oporto» (308, 1444, 2463) vienen vacías; ni a CIQUAL,
//     que da 17 kcal a un vino blanco seco porque su energía no cuenta el
//     etanol — un recordatorio de que una fuente puede ser buena para la
//     verdura y no servir para la bodega.
//
//     Y ojo, que esto SÍ cambia lo que ve el usuario: al tener id propio, el
//     generoso hereda el criterio que ya estaba escrito para el brandy y el
//     ron —no existe sin alcohol en ningún súper, así que no se adapta: se
//     excluye—. Tres platos (pluma al Pedro Ximénez, carrillada al oporto,
//     gambas al jerez) pasan a quedar FUERA en embarazo en vez de ofrecerse
//     con un «sin alcohol» que no se puede comprar. Antes colgaban de
//     `vino-blanco` y se adaptaban como si fueran vino de mesa.
//
//   canonigos  660 g colgaban de `lechuga`, y Valerianella locusta no es
//     Lactuca sativa: 2 mg de hierro contra 0,7 y 2.655 µg de betacaroteno.
//     Va a bedca:2379, que existía desde siempre.
//
// Y LOS 67 QUE ESTABAN BIEN también se escriben, que es la otra mitad del
// trabajo. `via: "macros"` pasa de 76 a CERO: ya no queda ninguna ficha elegida
// por el emparejador y no por alguien. Los 67 se revisaron contra BEDCA en
// vivo, CIQUAL crudo y USDA SR Legacy, y cada uno se lleva su motivo diciendo
// QUÉ se comprobó —la patata es cruda porque tiene 80,6 % de agua, el bogavante
// es crudo porque BEDCA tiene el hervido como ficha aparte— y una `confianza`
// acorde a que la revisión fue automática, no una decisión humana sentada. Eso
// último va en `modelo` y no se disimula.
//
// Tres se quedan con confianza baja y el problema escrito, porque declararlos
// correctos sería mentir: `romero` (ficha SECA y 7 de sus 15 líneas dicen
// «fresco», que son 2,8 veces menos energía), `coles-de-bruselas` (su nombre
// español dice «cruda» y el inglés «frozen», y no hay alternativa: la única
// fila «raw» de BEDCA viene vacía) y `arandanos` (su f_eng_name es «Bilberry»,
// el silvestre, no el cultivado — hoy da igual porque no lo usa nadie).
//
// El trinquete de `procedencia.test.js` baja de 76 a 0, y a partir de ahí
// significa otra cosa: que no entre ni uno nuevo.
//
// Y queda un fusible nuevo (`fraccionImportada.test.js`) contra la trampa que
// asomó al mirar de dónde salían las fracciones: 33 de las de este catálogo
// están copiadas del `edible_portion` de BEDCA, y ese campo rellena con 0 y con
// 1,00 lo que no tiene. El ajo figura ahí con un 0,01. Hoy no ha entrado
// ninguno; el test es para la próxima pasada, que es cuando entraría.
// v35 (2026-09-22): los cuatro que quedaban, y uno que se había dado por
// imposible sin serlo.
//
//   romero → romero + romero-fresco (ciqual:11068, 121 kcal). Llevaba la ficha
//     del SECO —343 kcal— para las SIETE de sus quince líneas que dicen
//     «Romero fresco»: 2,8 veces de más. BEDCA solo tiene el seco (y sus dos
//     fichas son la misma fila duplicada), así que la única salida era CIQUAL.
//
//   azucar y azucar-glas → ciqual:31016 «Sugar, white». Los dos cobraban
//     bedca:780, que es «Azúcar, MORENO». Coincidían en macros —los tres
//     azúcares son sacarosa— y discrepaban en lo único que los separa: el
//     moreno trae melaza, y con ella hierro, calcio y potasio. Es el caso de
//     libro de por qué emparejar por macros no basta. El glas comparte ficha
//     con el blanco a propósito: es azúcar blanco molido con un 2-3 % de
//     almidón, y ninguna de las tres tablas le da fila propia.
//
//   pata-de-ternera → ciqual:6580 «Calf, foot, raw», 184 kcal. Estaba en la
//     lista de «no hay fuente en ninguna tabla» y sí la había, con ese nombre
//     exacto. Los callos pasan de 94 % a 100 % de cobertura. Conviene que
//     quede escrito: un «no existe» también se revisa.
//
// Los otros SEIS huecos siguen sin fuente y ahora el build documenta con qué
// términos se buscó cada uno —cochinillo, gochujang, mirin, açaí, tinta de
// calamar y colorante— para que nadie repita el trabajo. El cochinillo se
// queda con su receta al 16 % de cobertura, que es la señal honrada de que
// sus números no valen; darle una ficha sin darle antes la fracción comestible
// lo empeoraría, porque son 2,5 kg de medio animal con hueso y piel.
export const BUNDLED_CATALOG_VERSION = 35;
