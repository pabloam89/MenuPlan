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
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseDimensiones } from "./lib/bedcaDimensiones.mjs";
import { deriveFamilia, deriveRol } from "./lib/familia.mjs";
import {
  validateAlimentos, CAMPOS_CONTABLES, FAMILIA_DIMENSIONES,
} from "../src/data/alimentoSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRY = process.argv.includes("--dry");

const leerJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

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
function procedenciaDe(ing) {
  const cands = candidatosPorIngrediente.get(ing.id) ?? [];

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

  if (!ing.nutrition) return null;
  const casan = cands.filter((c) => mismasMacros(c.nutrition, ing.nutrition));
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
const informe = { conDecision: 0, porMacros: 0, heredados: 0, vacios: 0 };
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

  const { familia, via: viaFamilia } = deriveFamilia(ing, juiciosFamilia);
  const { rol } = deriveRol(ing, juiciosFamilia);
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
  huecos.nutricion = ing.nutrition ? "relleno" : "ausente_resoluble";
  huecos.procedencia = proc ? "relleno" : "ausente_resoluble";
  huecos.familia = familia ? "relleno" : "ausente_resoluble";
  huecos.rol = rol ? "relleno" : "ausente_resoluble";
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
    // Tres estados, no dos: con ficha, con número pero sin ficha, y vacío.
    fuente: proc ? "bedca" : (ing.nutrition ? "heredado" : "sin_fuente"),
    fuenteId: proc ? String(proc.foodId) : null,
    fuenteNombre: nombreFuente,
    fuenteFecha: proc ? FECHA_INGESTA : null,
    familia,
    rol,
    taxonomia: null,
    dimensiones,
    nutricion: ing.nutrition ?? null,
    densidad: null,
    fraccionComestible: null,
    huecos,
  });
  mapaIngredienteAlimento[ing.id] = id;

  // Los cuatro estados son excluyentes y suman el total: así el informe no
  // puede descuadrar, que es justo lo que hacía la primera versión.
  if (proc?.via === "decision") informe.conDecision++;
  else if (proc?.via === "macros") informe.porMacros++;
  else if (ing.nutrition) informe.heredados++;
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
console.log("✅  src/data/alimentos.json");
console.log("✅  src/data/alimentoPorIngrediente.json");
