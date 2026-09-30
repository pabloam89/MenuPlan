/**
 * Fase A1 — construye `src/data/alimentos.json` con PROCEDENCIA, que es el dato
 * que el pipeline de BEDCA lleva generando y tirando desde el principio.
 *
 *   node scripts/build-alimentos.mjs [--dry]
 *
 * NO LLAMA A BEDCA. Y no hace falta: el emparejamiento caro ya está pagado y
 * está en disco. Medido antes de escribir esto, sobre los 198 ingredientes que
 * hoy tienen nutrición:
 *
 *   99  con decisión humana registrada en output/bedca-choices.json
 *   76  recuperables porque sus macros coinciden con las de un único candidato
 *    3  ambiguos (dos fichas con macros idénticas)
 *   20  sin rastro en ningún artefacto
 *
 * O sea: el 88 % de la procedencia se reconstruye sin tocar la red. Los 23
 * restantes NO se adivinan — entran con `fuente: "sin_fuente"` y su hueco
 * anotado, que es lo que los hace visibles para ir a buscarlos.
 *
 * QUÉ RELLENA Y QUÉ NO. Solo lo ingerible: procedencia y las seis dimensiones,
 * leídas del propio nombre de BEDCA con scripts/lib/bedcaDimensiones.mjs (tabla
 * de 109 fragmentos, 100 % de cobertura medida, cero adivinación). `familia`,
 * `taxonomia`, `densidad` y `fraccionComestible` son campos CURADOS: se
 * declaran y se anotan como pendientes. Declarar antes de rellenar.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseDimensiones } from "./lib/bedcaDimensiones.mjs";
import { deriveFamilia, deriveRol, LEXICO, stems } from "./lib/familia.mjs";
import { deriveTaxonomia } from "./lib/taxonomia.mjs";
import {
  validateAlimentos, CAMPOS_CONTABLES, FAMILIA_DIMENSIONES,
} from "../src/data/alimentoSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRY = process.argv.includes("--dry");

const leerJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
/** Mismo criterio que build-derived.mjs: CRLF normalizado, 16 caracteres. */
const hash = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);

const ingredientes = leerJson(join(ROOT, "src", "data", "ingredients.json"));
// Las decisiones viven en el repo. La copia de output/ se sigue leyendo como
// respaldo para no romper una máquina a medio migrar, pero la del repo manda:
// output/ está en .gitignore y estas 219 decisiones son la parte cara de la
// ingesta — el emparejamiento, no los números.
const choices = {
  ...(leerJson(join(ROOT, "output", "bedca-choices.json")) ?? {}),
  ...(leerJson(join(ROOT, "src", "data", "bedcaChoices.json")) ?? {}),
};
delete choices._;
const juiciosFamilia = leerJson(join(ROOT, "src", "data", "familiaLabels.json")) ?? {};

// Qué fracción de lo comprado se come. Solo están los que descartan algo; el
// resto se queda a null, que aquí significa «no se tira nada» y no «no se
// sabe» — el consumidor asume 1.
const fraccionComestible = leerJson(join(ROOT, "src", "data", "fraccionComestible.json")) ?? {};
delete fraccionComestible._;

// Gramos por mililitro. Misma convención que la fracción comestible: solo
// están los que se apartan de 1, y ausente significa «pesa como el agua».
const densidad = leerJson(join(ROOT, "src", "data", "densidad.json")) ?? {};
delete densidad._;

// ── LA TABLA MAESTRA SE SOSTIENE A SÍ MISMA ─────────────────────────────────
// La nutrición ya NO se copia de `ingredients.json`. Venía de allí por una
// razón histórica —los números se escribían en el catálogo y esta tabla los
// espejaba— y dejaba la procedencia aguas abajo del número: `alimentos.json`
// sabía de qué ficha de CIQUAL venía el garbanzo, y la copia que la app leía
// de verdad no sabía nada.
//
// Ahora el número y su porqué viven juntos y en un solo sitio. Esta tabla es
// el OUTPUT MAESTRO del embudo de alimentos: lo de antes (BEDCA, CIQUAL, USDA,
// las decisiones curadas) son transformaciones que desembocan aquí, y lo de
// después son lecturas.
//
// Un alimento NUEVO entra sin nutrición y la recibe del pipeline de ingesta,
// que escribe aquí. Sin nutrición no hay ficha que valga: es lo correcto y es
// lo que lo hace visible.
const maestraPrevia = leerJson(join(ROOT, "src", "data", "alimentos.json")) ?? [];
const nutricionDe = new Map(maestraPrevia.map((f) => [f.id, f.nutricion ?? null]));
// La segunda ficha viaja con la nutrición, por el mismo motivo: dice de dónde
// vienen los campos prestados y eso es procedencia, no catálogo.
const complementoDe = new Map(maestraPrevia.filter((f) => f.fuenteComplemento).map((f) => [f.id, f.fuenteComplemento]));

// Las decisiones de CIQUAL, la segunda tabla de composición. Van aparte de las
// de BEDCA y no mezcladas en un mismo fichero porque la FUENTE importa: dos
// tablas nacionales distintas usan laboratorios y métodos distintos, y mezclar
// composiciones tiene un coste pequeño pero real. Para poder discutirlo hay
// que poder verlo, así que cada número dice de dónde viene.
const choicesCiqual = leerJson(join(ROOT, "src", "data", "ciqualChoices.json")) ?? {};
delete choicesCiqual._;
const nombresCiqual = new Map();
try {
  const { cargarCiqual } = await import("./lib/ciqualParse.mjs");
  for (const [code, a] of cargarCiqual(join(ROOT, "output", "ciqual"))) {
    nombresCiqual.set(code, a.nombre);
  }
} catch {
  // Sin la tabla descargada se sigue construyendo: las filas de CIQUAL
  // conservan su id y pierden solo el nombre legible.
}

// Y la tercera, USDA SR Legacy, con el mismo trato y por la misma razón: va
// aparte para que se pueda ver qué fila viene de dónde.
const complementos = leerJson(join(ROOT, "src", "data", "complementoChoices.json")) ?? {};
delete complementos._;
const choicesUsda = leerJson(join(ROOT, "src", "data", "usdaChoices.json")) ?? {};
delete choicesUsda._;
const nombresUsda = new Map();
try {
  const { cargarUsda } = await import("./lib/usdaParse.mjs");
  const dir = join(ROOT, "output", "usda", "FoodData_Central_sr_legacy_food_csv_2018-04");
  for (const [code, a] of cargarUsda(dir)) nombresUsda.set(code, a.nombre);
} catch {
  // Igual que arriba: sin la descarga se construye con el id y sin el nombre.
}

// Índice de candidatos de TODOS los artefactos del pipeline: el triaje, el
// informe original y la repesca. Se unen porque los tres se generaron en
// momentos distintos y ninguno los tiene todos.
const candidatosPorIngrediente = new Map();
const añadir = (id, cands) => {
  if (!cands?.length) return;
  const acc = candidatosPorIngrediente.get(id) ?? [];
  acc.push(...cands);
  candidatosPorIngrediente.set(id, acc);
};
const triaje = leerJson(join(ROOT, "output", "bedca-triage.json"));
for (const r of triaje?.rows ?? []) añadir(r.ingredientId, r.candidates);
for (const r of leerJson(join(ROOT, "output", "bedca-nutrition-review.json")) ?? []) {
  añadir(r.ingredientId, r.candidates);
}
const repesca = leerJson(join(ROOT, "output", "bedca-repesca-review.json"));
for (const r of Array.isArray(repesca) ? repesca : (repesca?.rows ?? [])) {
  añadir(r.ingredientId, r.candidates);
}

const FECHA_INGESTA = triaje?.generadoEn ?? null;

/** Dos fichas son "la misma nutrición" si coinciden los cuatro macros duros. */
const mismasMacros = (a, b) =>
  a && b &&
  a.kcal100g === b.kcal100g && a.protein100g === b.protein100g &&
  a.carbs100g === b.carbs100g && a.fat100g === b.fat100g;

/**
 * De dónde salió la nutrición que hoy tiene este ingrediente.
 * Dos vías, y la humana gana: una decisión registrada es mejor evidencia que
 * una coincidencia de números.
 */
/**
 * Un hueco de nutrición no siempre es trabajo pendiente, y decir que lo es
 * cuando no lo es hace que la lista de pendientes deje de leerse.
 *
 * Los tres estados que existen (alimentoSchema.js:279) y cuándo aplica cada uno:
 *
 *   no_aplica            el alimento no aporta masa, así que NADIE leerá su
 *                        nutrición nunca. No es que falte: es que la pregunta
 *                        no tiene sentido. Lo garantiza `fraccionComestible: 0`,
 *                        y no de palabra — `computeRecipeNutrition` descarta la
 *                        línea con `if (grams <= 0) continue;` ANTES de mirar
 *                        la ficha, igual que composicion.js en su línea 183.
 *
 *   ausente_sin_fuente   se ha buscado en BEDCA, CIQUAL y USDA y no está. Para
 *                        que nadie repita la búsqueda, lo que se probó y lo que
 *                        salió el 22 sep 2026:
 *
 *                          medio-cochinillo  `suckling`, `piglet`, `porcelet`,
 *                            `lechal`, `whole pig`. BEDCA sí tiene cordero y
 *                            cabrito lechal (f_id 2685-2690, con porción
 *                            comestible 0,605-0,737) y NINGÚN cochinillo. Y el
 *                            hueco de verdad aquí es la fracción, no la ficha:
 *                            son 2,5 kg de medio animal con hueso y piel, y
 *                            darle nutrición sin fracción empeoraría el plato.
 *                          gochujang  `chili/chilli paste`, `pepper paste`,
 *                            `fermented soy`, `korean`, `doenjang`. Solo sale
 *                            el miso, y no vale: el gochujang lleva arroz
 *                            glutinoso y por tanto hidratos altos.
 *                          mirin  solo aparece el sake (ciqual:1026), y el
 *                            mirin es vino de arroz DULCE, ~40 g de azúcar
 *                            contra los menos de 5 del sake. Sustituirlo
 *                            equivocaría justo el campo que lo define.
 *                          pulpa-de-acai  `acai`, `assai`, `euterpe`,
 *                            `palm fruit`. USDA solo tiene bebidas de açaí
 *                            fortificadas, que son otro producto.
 *                          tinta-de-calamar  `squid ink`, `cuttlefish ink`,
 *                            `encre`. Están el calamar y la sepia, no su tinta,
 *                            que no es carne.
 *                          colorante  `food colouring`, `colorant`, `dye`,
 *                            `annatto`, `carmine`. Nada.
 *
 *                        Poner la ficha de un alimento parecido sería inventar.
 *                        Lo que SÍ apareció al repasar fue `pata-de-ternera`,
 *                        que se había dado por imposible y está en CIQUAL como
 *                        «Calf, foot, raw» (6580): por eso ya no figura aquí.
 *
 *   ausente_resoluble    lo que de verdad está pendiente. Hoy queda la harissa,
 *                        que SÍ tiene ficha exacta (ciqual:11112) y no se puede
 *                        aplicar porque CIQUAL no publica su energía y el
 *                        pipeline no sabe calcularla por Atwater. Mismo bloqueo
 *                        que `requeson` y `chocolate`, y el día que exista esa
 *                        regla se cierran los tres.
 */
const SIN_FUENTE_CONOCIDA = new Set([
  "medio-cochinillo", "pulpa-de-acai-congelada",
  "mirin", "gochujang", "colorante", "tinta-de-calamar",
]);

function estadoDelHuecoNutricional(id) {
  if (fraccionComestible[id]?.valor === 0) return "no_aplica";
  if (SIN_FUENTE_CONOCIDA.has(id)) return "ausente_sin_fuente";
  return "ausente_resoluble";
}

function procedenciaDe(ing) {
  const nutricion = nutricionDe.get(ing.id) ?? null;
  const cands = candidatosPorIngrediente.get(ing.id) ?? [];

  // El orden es el inverso al de llegada, y por eso: si hay decisión en USDA
  // es porque ni BEDCA ni CIQUAL pudieron, y se tomó después de mirar las dos.
  // La decisión más reciente sobre el mismo ingrediente es la buena.
  const usda = choicesUsda[ing.id];
  if (usda?.foodId != null && nutricion) {
    return {
      via: "usda",
      fuente: "usda",
      foodId: usda.foodId,
      foodName: nombresUsda.get(String(usda.foodId)) ?? null,
      motivo: usda.motivo ?? null,
    };
  }

  const ciqual = choicesCiqual[ing.id];
  if (ciqual?.foodId != null && nutricion) {
    return {
      via: "ciqual",
      fuente: "ciqual",
      foodId: ciqual.foodId,
      foodName: nombresCiqual.get(String(ciqual.foodId)) ?? null,
      motivo: ciqual.motivo ?? null,
    };
  }

  const elegido = choices[ing.id];
  if (elegido?.foodId != null) {
    const ficha = cands.find((c) => c.foodId === elegido.foodId);
    return {
      via: "decision",
      foodId: elegido.foodId,
      foodName: ficha?.foodName ?? null,
      motivo: elegido.motivo ?? null,
    };
  }

  if (!nutricion) return null;
  const casan = cands.filter((c) => mismasMacros(c.nutrition, nutricion));
  const ids = [...new Set(casan.map((c) => c.foodId))];
  if (ids.length === 1) {
    return { via: "macros", foodId: ids[0], foodName: casan[0].foodName, motivo: null };
  }
  // Cero coincidencias o varias fichas distintas con los mismos números: en los
  // dos casos NO se elige. Adivinar aquí sería exactamente el defecto que esta
  // tabla existe para cerrar.
  return null;
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const filas = [];
const dimensionesImposibles = [];
const porViaFamilia = new Map();
const informe = { conDecision: 0, porMacros: 0, ciqual: 0, usda: 0, heredados: 0, vacios: 0 };
const mapaIngredienteAlimento = {};

for (const ing of ingredientes) {
  const proc = procedenciaDe(ing);
  const nombreFuente = proc?.foodName ?? null;
  const parsed = nombreFuente ? parseDimensiones(nombreFuente) : null;

  // UN ALIMENTO POR INGREDIENTE. El id es el del ingrediente, y no se fusiona
  // nada.
  //
  // La primera versión construía el id desde el núcleo de la ficha de BEDCA
  // más sus dimensiones, y fusionaba los ingredientes que caían en el mismo.
  // Parecía normalizar y lo que hacía era mentir: BEDCA no tiene ficha para la
  // judía negra ni para el azúcar blanco, así que
  //
  //     "Azúcar" + "Azúcar glas" + "Azúcar moreno"  → una fila «Azúcar, moreno»
  //     "Judías blancas" + "Judías negras cocidas"  → una fila «Judía blanca»
  //     "Requesón" + "Ricotta"                      → una fila «Requesón»
  //
  // El azúcar blanco no es moreno. Compartir la ficha de origen NO es ser el
  // mismo alimento: es que la fuente no distingue, que es otra cosa y hay que
  // poder verla. Ahora cada ingrediente tiene su fila, varias filas pueden
  // apuntar a la misma `fuenteId`, y eso queda a la vista en vez de fundido.
  //
  // Fusionar dos alimentos es una decisión de identidad, y las decisiones de
  // identidad se registran, no se deducen de que una tabla externa sea más
  // gruesa que la nuestra.
  const id = ing.id;

  const derivadoFam = deriveFamilia(ing, juiciosFamilia);
  const { familia, via: viaFamilia } = derivadoFam;
  const { rol } = deriveRol(ing, juiciosFamilia);
  const taxonomia = deriveTaxonomia(derivadoFam, stems(ing.name), LEXICO);
  if (familia) porViaFamilia.set(viaFamilia, (porViaFamilia.get(viaFamilia) ?? 0) + 1);

  // La familia decide qué dimensiones tienen sentido, así que en cuanto está
  // puesta el resto deja de ser "no lo sabemos" y pasa a ser "no aplica": la
  // harina no tiene corte. Sin esto, el libro de cuentas contaría como deuda
  // preguntas que nunca van a tener respuesta y la tabla no "terminaría" nunca.
  const aplican = familia ? new Set(FAMILIA_DIMENSIONES[familia] ?? []) : null;
  const dims = parsed?.dimensiones ?? {};
  const dimensiones = {};
  for (const dim of ["corte", "estado", "medio", "procesado", "presentacion", "origen"]) {
    if (aplican && !aplican.has(dim)) {
      // BEDCA dijo algo que la familia declara imposible. No se tira en
      // silencio: o la tabla de aplicabilidad está mal o la familia lo está.
      if (dims[dim] != null) {
        dimensionesImposibles.push(`${id}: ${dim}="${dims[dim]}" pero la familia ${familia} no la admite`);
      }
      dimensiones[dim] = "no_aplica";
      continue;
    }
    dimensiones[dim] = dims[dim] ?? null;
  }

  const huecos = {};
  for (const campo of CAMPOS_CONTABLES) huecos[campo] = "ausente_resoluble";
  const nutricion = nutricionDe.get(ing.id) ?? null;
  huecos.nutricion = nutricion ? "relleno" : estadoDelHuecoNutricional(ing.id);
  huecos.procedencia = proc ? "relleno" : "ausente_resoluble";
  huecos.familia = familia ? "relleno" : "ausente_resoluble";
  huecos.rol = rol ? "relleno" : "ausente_resoluble";
  if (fraccionComestible[ing.id]) huecos.fraccionComestible = "relleno";
  if (densidad[ing.id]) huecos.densidad = "relleno";
  if (taxonomia) huecos.taxonomia = "relleno";
  for (const dim of Object.keys(dimensiones)) {
    if (dimensiones[dim] === "no_aplica") { huecos[dim] = "no_aplica"; continue; }
    if (dimensiones[dim] != null) { huecos[dim] = "relleno"; continue; }
    // Distinción que importa: si BEDCA nombró el alimento y NO mencionó esta
    // dimensión, BEDCA no tiene más que dar — hace falta otra fuente. Si ni
    // siquiera hay nombre, basta con ir a preguntar.
    huecos[dim] = nombreFuente ? "ausente_sin_fuente" : "ausente_resoluble";
  }

  filas.push({
    id,
    nombre: nombreFuente ?? ing.name,
    // Cuatro estados: con ficha de BEDCA, con ficha de CIQUAL, con número pero
    // sin ficha, y vacío.
    fuente: proc ? (proc.fuente ?? "bedca") : (nutricion ? "heredado" : "sin_fuente"),
    // La segunda ficha, si la hay: de dónde salen los campos que la propia
    // dejaba vacíos. Se copia tal cual del catálogo, donde la escribió
    // scripts/apply-complemento.mjs con la lista exacta de campos prestados.
    ...(complementoDe.has(ing.id)
      ? { fuenteComplemento: { ...complementoDe.get(ing.id), discrepancia: complementos[ing.id]?.discrepancia ?? null } }
      : {}),
    fuenteId: proc ? String(proc.foodId) : null,
    fuenteNombre: nombreFuente,
    fuenteFecha: proc ? FECHA_INGESTA : null,
    // CON QUÉ AUTORIDAD se eligió esa ficha, y el porqué cuando lo hay.
    //
    // `procedenciaDe` lo calcula en sus cuatro ramas desde el primer día y
    // hasta hoy se tiraba al escribir la fila. El daño no era teórico: 76 de
    // los 377 alimentos con número —el 32 % de la masa servida del catálogo,
    // presentes en 1.010 de las 1.033 recetas— salen de la rama `macros`, que
    // NO es una decisión: es la única ficha candidata cuyos cuatro macros
    // duros coinciden, contra un artefacto que vive en `output/` y está en
    // .gitignore. Sin este campo, `aceite-oliva → bedca/2543` se lee
    // exactamente igual que `garbanzos → ciqual/20507`, y uno es una decisión
    // revisada con su motivo y el otro una conjetura con buena pinta.
    //
    // Es una abstención disfrazada de afirmación, y escribirla es lo único
    // que hace posible el test que la vigila.
    via: proc?.via ?? null,
    motivo: proc?.motivo ?? null,
    familia,
    rol,
    taxonomia,
    dimensiones,
    nutricion,
    densidad: densidad[ing.id]?.valor ?? null,
    fraccionComestible: fraccionComestible[ing.id]?.valor ?? null,
    huecos,
  });
  mapaIngredienteAlimento[ing.id] = id;

  // Los CINCO estados son excluyentes y suman el total: así el informe no
  // puede descuadrar, que es justo lo que hacía la primera versión. Al entrar
  // USDA faltó su rama y sus 33 filas salieron contadas como «heredado»,
  // que es el cajón de «tiene número y no tiene ficha»: el dato estaba bien
  // —`fuente: "usda"` en las 33— y el informe mentía. Contar es cablear.
  if (proc?.via === "usda") informe.usda++;
  else if (proc?.via === "ciqual") informe.ciqual++;
  else if (proc?.via === "decision") informe.conDecision++;
  else if (proc?.via === "macros") informe.porMacros++;
  else if (nutricion) informe.heredados++;
  else informe.vacios++;
}

// ── Blindaje antes de escribir ──────────────────────────────────────────────
// Una tabla que no valida no se publica. El schema comprueba, entre otras, que
// el libro de cuentas no contradiga a la fila: si dice "relleno", el campo
// tiene que estar de verdad.
const errores = validateAlimentos(filas);
if (errores.length > 0) {
  console.error(`\n❌  ${errores.length} errores de validación. No se escribe nada.\n`);
  for (const e of errores.slice(0, 25)) console.error("   " + e);
  if (errores.length > 25) console.error(`   … y ${errores.length - 25} más`);
  process.exit(1);
}

const conNutricion = filas.filter((f) => f.nutricion).length;
const conProcedencia = filas.filter((f) => f.fuenteId).length;
// Solo valores DE VERDAD: "no_aplica" no es una dimensión rellena, es una
// pregunta retirada. Contarlo como relleno inflaría la cifra justo cuando la
// familia empieza a retirar preguntas, que es lo contrario de lo que mide.
const dimsRellenas = filas.reduce(
  (n, f) => n + Object.values(f.dimensiones).filter((v) => v != null && v !== "no_aplica").length, 0,
);
const dimsNoAplica = filas.reduce(
  (n, f) => n + Object.values(f.dimensiones).filter((v) => v === "no_aplica").length, 0,
);

// Cuántas filas se apoyan en una ficha que también usa otra. NO es un
// duplicado: es el aviso de que para esos alimentos BEDCA no distingue, y que
// su nutrición es una aproximación prestada. Se cuenta para que se vea.
const fichasCompartidas = new Map();
for (const f of filas) {
  if (!f.fuenteId) continue;
  fichasCompartidas.set(f.fuenteId, (fichasCompartidas.get(f.fuenteId) ?? 0) + 1);
}
const conFichaPrestada = filas.filter((f) => f.fuenteId && fichasCompartidas.get(f.fuenteId) > 1).length;

console.log(`\n📋  alimentos: ${filas.length} filas, una por ingrediente`);
console.log(`    las ${filas.length} filas, por procedencia — suman el total:`);
console.log(`      ficha por decisión humana  ${informe.conDecision}`);
console.log(`      ficha recuperada por macros ${informe.porMacros}`);
console.log(`      ficha de CIQUAL             ${informe.ciqual}`);
console.log(`      ficha de USDA SR Legacy     ${informe.usda}`);
console.log(`      heredado (número sin ficha) ${informe.heredados}`);
console.log(`      vacío (ni número ni ficha)  ${informe.vacios}`);
console.log(`    con nutrición ${conNutricion} · con procedencia ${conProcedencia} · dimensiones rellenas ${dimsRellenas} (y ${dimsNoAplica} retiradas por la familia)`);

// Ficha conocida y número ausente NO es una inconsistencia: es el filtro de
// Atwater de apply-bedca-nutrition.mjs haciendo su trabajo — la ficha se
// eligió a mano y sus kcal no cuadraban con sus macros, así que no se aplicó.
// Se imprime porque es la lista más corta y más resoluble de toda la tabla.
const fichaSinNumero = filas.filter((f) => f.fuenteId && !f.nutricion);
if (fichaSinNumero.length > 0) {
  console.log(`    ${fichaSinNumero.length} con ficha decidida y sin número (Atwater la rechazó): ${fichaSinNumero.map((f) => f.id).join(", ")}`);
}

const conFamilia = filas.filter((f) => f.familia).length;
console.log(`    con familia ${conFamilia} de ${filas.length} — por vía: ${[...porViaFamilia.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);

if (dimensionesImposibles.length > 0) {
  console.log(`\n⚠️   ${dimensionesImposibles.length} dimensiones que la familia declara imposibles:`);
  for (const d of dimensionesImposibles) console.log("      " + d);
}

if (conFichaPrestada > 0) {
  console.log(`    ${conFichaPrestada} filas con la ficha prestada: BEDCA no distingue entre ellas y su nutrición es aproximada`);
}
console.log();

if (DRY) {
  console.log("--dry: no se ha escrito nada.");
  process.exit(0);
}

// ── Trinquete ───────────────────────────────────────────────────────────────
// `/output/` está en .gitignore: los tres artefactos de los que sale la
// procedencia viven en la máquina donde se corrió el pipeline, no en el repo.
// En un clon limpio este script funciona igual de bien y produce una tabla con
// CERO procedencia — y la escribiría encima de la buena sin avisar. La
// procedencia solo puede subir; si baja, es que faltan los artefactos.
const previo = leerJson(join(ROOT, "src", "data", "alimentos.json"));
if (previo) {
  const antes = previo.filter((f) => f.fuenteId).length;
  if (conProcedencia < antes) {
    console.error(
      `\n❌  La tabla que hay tiene ${antes} filas con procedencia y esta traería ${conProcedencia}.\n` +
      `    Falta output/bedca-*.json (está en .gitignore). No se sobrescribe.\n` +
      `    Si la bajada es intencionada: borra src/data/alimentos.json y vuelve a correr.\n`,
    );
    process.exit(1);
  }
}

writeFileSync(
  join(ROOT, "src", "data", "alimentos.json"),
  JSON.stringify(filas, null, 2) + "\n",
  "utf8",
);
writeFileSync(
  join(ROOT, "src", "data", "alimentoPorIngrediente.json"),
  JSON.stringify(mapaIngredienteAlimento, null, 2) + "\n",
  "utf8",
);

// ── La proyección que baja al navegador ─────────────────────────────────────
// La maestra lleva su auditoría —`via`, `motivo`, `huecos`, `dimensiones`, el
// nombre de la ficha— y eso es lo que la hace valiosa en el repo y lo que NO
// tiene ningún sentido enviarle a cada usuario: son 45 KB brotli de los que la
// app lee 22. Esto NO es una segunda tabla ni un segundo carril: es la misma
// maestra transformada para el transporte, y va sellada con su hash para que
// no pueda quedarse vieja en silencio (lo vigila alimentos.test.js).
//
// Lleva `familia`, `rol` y `taxonomia` además de la composición a propósito:
// son las tres columnas por las que hoy nueve módulos clasifican ingredientes
// leyendo su NOMBRE, teniendo la respuesta por clave al 100 %.
const proyeccion = {
  _: {
    que: "Proyección de src/data/alimentos.json para el cliente. NO SE EDITA: la genera "
      + "scripts/build-alimentos.mjs. Lo que falta aquí (via, motivo, huecos, dimensiones, "
      + "fuenteNombre) vive en la maestra, que es donde se decide y se discute.",
    hash_maestra: hash(JSON.stringify(filas)),
    filas: filas.length,
  },
  filas: filas.map((f) => ({
    id: f.id,
    nutricion: f.nutricion,
    familia: f.familia,
    rol: f.rol,
    taxonomia: f.taxonomia,
    densidad: f.densidad,
    fraccionComestible: f.fraccionComestible,
  })),
};
writeFileSync(
  join(ROOT, "src", "data", "derived", "alimentosApp.json"),
  JSON.stringify(proyeccion) + "\n",
  "utf8",
);

console.log("✅  src/data/alimentos.json");
console.log("✅  src/data/alimentoPorIngrediente.json");
console.log("✅  src/data/derived/alimentosApp.json");
