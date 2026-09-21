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
import { validateAlimentos, CAMPOS_CONTABLES } from "../src/data/alimentoSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRY = process.argv.includes("--dry");

const leerJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

const ingredientes = leerJson(join(ROOT, "src", "data", "ingredients.json"));
const choices = leerJson(join(ROOT, "output", "bedca-choices.json")) ?? {};

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
const porId = new Map();
const divergencias = [];
const informe = { conDecision: 0, porMacros: 0, heredados: 0, vacios: 0, compartidos: 0 };
const mapaIngredienteAlimento = {};

for (const ing of ingredientes) {
  const proc = procedenciaDe(ing);
  const nombreFuente = proc?.foodName ?? null;
  const parsed = nombreFuente ? parseDimensiones(nombreFuente) : null;

  // El id sale del núcleo del nombre de BEDCA más las dimensiones que lo
  // distinguen — así "Atún, en aceite, enlatado" y "Atún, fresco, crudo" son
  // dos filas y se ve por qué. Sin ficha, el id cae al del ingrediente: es
  // trazable y no colisiona, porque los ids de ingrediente ya son únicos.
  const sufijos = parsed ? Object.values(parsed.dimensiones).sort() : [];
  const nucleoSlug = parsed ? slug([parsed.nucleo, ...parsed.nucleoExtra].join(" ")) : null;
  const id = nucleoSlug ? [nucleoSlug, ...sufijos.map(slug)].join("-") : slug(ing.id);

  // Varios ingredientes pueden apuntar al MISMO alimento, y eso es correcto,
  // no un duplicado: "Aceite de oliva" y "Aceite de oliva virgen extra" son un
  // ingrediente distinto cada uno pero pueden compartir ficha. La fila se crea
  // una vez; los dos ingredientes la apuntan.
  if (porId.has(id)) {
    // Compartir ficha es correcto, pero solo si los números coinciden. Dos
    // ingredientes apuntando a la misma ficha de BEDCA con macros distintas
    // significa que alguien editó una a mano, y entonces el deduplicado
    // estaría eligiendo una de las dos por orden del array — en silencio.
    const yaEsta = porId.get(id);
    if (ing.nutrition && yaEsta.nutricion && !mismasMacros(ing.nutrition, yaEsta.nutricion)) {
      divergencias.push(`${ing.id} y ${yaEsta.origen} comparten la ficha ${id} con macros distintas`);
    }
    if (ing.nutrition && !yaEsta.nutricion) {
      divergencias.push(`${ing.id} trae nutrición y ${yaEsta.origen}, que comparte ficha ${id}, no`);
    }
    mapaIngredienteAlimento[ing.id] = id;
    informe.compartidos++;
    continue;
  }

  const dims = parsed?.dimensiones ?? {};
  const dimensiones = {
    corte: dims.corte ?? null,
    estado: dims.estado ?? null,
    medio: dims.medio ?? null,
    procesado: dims.procesado ?? null,
    presentacion: dims.presentacion ?? null,
    origen: dims.origen ?? null,
  };

  const huecos = {};
  for (const campo of CAMPOS_CONTABLES) huecos[campo] = "ausente_resoluble";
  huecos.nutricion = ing.nutrition ? "relleno" : "ausente_resoluble";
  huecos.procedencia = proc ? "relleno" : "ausente_resoluble";
  for (const dim of Object.keys(dimensiones)) {
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
    familia: null,
    taxonomia: null,
    dimensiones,
    nutricion: ing.nutrition ?? null,
    densidad: null,
    fraccionComestible: null,
    huecos,
  });
  porId.set(id, { origen: ing.id, nutricion: ing.nutrition ?? null });
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
const dimsRellenas = filas.reduce(
  (n, f) => n + Object.values(f.dimensiones).filter((v) => v != null).length, 0,
);

console.log(`\n📋  alimentos: ${filas.length} filas (de ${ingredientes.length} ingredientes; ${informe.compartidos} comparten ficha con otro)`);
console.log(`    las ${filas.length} filas, por procedencia — suman el total:`);
console.log(`      ficha por decisión humana  ${informe.conDecision}`);
console.log(`      ficha recuperada por macros ${informe.porMacros}`);
console.log(`      heredado (número sin ficha) ${informe.heredados}`);
console.log(`      vacío (ni número ni ficha)  ${informe.vacios}`);
console.log(`    con nutrición ${conNutricion} · con procedencia ${conProcedencia} · dimensiones rellenas ${dimsRellenas}`);

// Ficha conocida y número ausente NO es una inconsistencia: es el filtro de
// Atwater de apply-bedca-nutrition.mjs haciendo su trabajo — la ficha se
// eligió a mano y sus kcal no cuadraban con sus macros, así que no se aplicó.
// Se imprime porque es la lista más corta y más resoluble de toda la tabla.
const fichaSinNumero = filas.filter((f) => f.fuenteId && !f.nutricion);
if (fichaSinNumero.length > 0) {
  console.log(`    ${fichaSinNumero.length} con ficha decidida y sin número (Atwater la rechazó): ${fichaSinNumero.map((f) => f.id).join(", ")}`);
}

if (divergencias.length > 0) {
  console.log(`\n⚠️   ${divergencias.length} ingredientes comparten ficha con números que no coinciden:`);
  for (const d of divergencias) console.log("      " + d);
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
