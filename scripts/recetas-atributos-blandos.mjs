/**
 * Atributos «blandos» del Recetario Estrella, para que peticiones reales («algo
 * reconfortante», «de cuchara», «que no pique», «que les guste a los niños»,
 * «algo especial») sean un filtro y no una intuición de Lola.
 *
 * Pedido por Pablo (30 sep 2026). Solo recetas `estrella: true` (la política
 * del catálogo: el antiguo no se propone nunca).
 *
 * Campos (vocabulario cerrado, validado):
 *   connotacion  [] de reconfortante · fresco · casero · festivo   (eje n13 del registro)
 *   textura      cuchara · tenedor · mano                           (eje n8)
 *   picante      no · suave · picante
 *   sabor        [] de suave · intenso · especiado · dulce · acido · ahumado
 *   occasion     diario · especial      — SOLO donde falta: lo curado a mano manda
 *   kidFavourite true · false           — SOLO donde falta
 *
 *   node scripts/recetas-atributos-blandos.mjs --pasada=a
 *   node scripts/recetas-atributos-blandos.mjs --pasada=b
 *   node scripts/recetas-atributos-blandos.mjs --juez
 *   node scripts/recetas-atributos-blandos.mjs --informe
 *   node scripts/recetas-atributos-blandos.mjs --aplicar
 *
 * Dos opiniones independientes (enfoques distintos) y un juez solo en los
 * campos donde no coinciden. Nada se escribe en el catálogo hasta --aplicar.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "output");
const DIR = path.join(ROOT, "src/data/recipes");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? env.match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)/m)?.[1]?.trim();
const MODELO = process.env.ENRICH_MODEL ?? "claude-sonnet-5";
const LOTE = 15;
const CONCURRENCIA = Number(process.env.CONCURRENCIA ?? 3);

export const VOCAB = {
  connotacion: ["reconfortante", "fresco", "casero", "festivo"],
  textura: ["cuchara", "tenedor", "mano"],
  picante: ["no", "suave", "picante"],
  sabor: ["suave", "intenso", "especiado", "dulce", "acido", "ahumado"],
  occasion: ["diario", "especial"],
};
const LISTAS = ["connotacion", "sabor"];
const CAMPOS = ["connotacion", "textura", "picante", "sabor", "occasion", "kidFavourite"];

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const tiene = (k) => process.argv.includes(`--${k}`);
const CON_CURADOS = process.argv.includes("--con-curados");
fs.mkdirSync(OUT, { recursive: true });
const ruta = (n) => path.join(OUT, `recetas-atributos-${n}.json`);
const leer = (n) => (fs.existsSync(ruta(n)) ? JSON.parse(fs.readFileSync(ruta(n), "utf8")) : {});
const guardar = (n, d) => fs.writeFileSync(ruta(n), `${JSON.stringify(d, null, 2)}\n`);

const ficheros = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
const porFichero = Object.fromEntries(ficheros.map((f) => [f, JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))]));
const estrella = Object.values(porFichero).flat().filter((r) => r.estrella === true);

const ENFOQUE = {
  a: "Eres editora de un recetario familiar español. Clasifica cada receta como la vería una madre o un padre que busca qué cocinar.",
  b: "Eres un cocinero español con años en comedores familiares. Para cada receta, piensa en cómo se come y cómo sienta en la mesa de una familia normal, y clasifícala.",
};
const REGLAS = `Campos:
- connotacion: lista (puede ir vacía) de ${VOCAB.connotacion.join(", ")}. «reconfortante» = de las que sientan bien con frío o cansancio (guisos, cremas calientes, cuchara, gratinados); «fresco» = de verano o ligero al paladar (ensaladas, fríos, cítricos); «casero» = cocina de siempre de casa española; «festivo» = de celebración o domingo.
- textura: ${VOCAB.textura.join(" | ")} — cómo se come: cuchara (sopas, cremas, guisos caldosos, legumbres), tenedor (lo demás en plato), mano (bocadillos, tacos, pinchos, fingers).
- picante: ${VOCAB.picante.join(" | ")} — como sale la receta tal cual está escrita.
- sabor: lista (1 o 2) de ${VOCAB.sabor.join(", ")} — lo dominante.
- occasion: ${VOCAB.occasion.join(" | ")} — especial si es para un día señalado o de más trabajo/lucimiento.
- kidFavourite: true si a la mayoría de niños españoles de 3 a 12 años suele gustarles; false si no.
Responde SOLO con JSON: {"resultados":[{"id":"<id tal cual>","connotacion":[...],"textura":"...","picante":"...","sabor":[...],"occasion":"...","kidFavourite":true|false}]} en el mismo orden.`;

async function llamar(system, payload, maxTokens = 8000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, system, messages: [{ role: "user", content: JSON.stringify(payload) }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const texto = (data?.content ?? []).find((b) => b?.type === "text")?.text ?? "";
  return JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
}

async function conReintentos(fn, etiqueta) {
  for (let i = 1; i <= 4; i++) {
    try { return await fn(); } catch (err) {
      if (i === 4) throw err;
      const espera = 1500 * 2 ** i;
      console.log(`  ↻ ${etiqueta}: ${String(err.message).slice(0, 80)} — reintento en ${espera} ms`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

/** Solo valores del vocabulario; lo que no vale, fuera (y el campo queda sin decidir). */
export function validar(x) {
  const out = {};
  for (const k of LISTAS) {
    if (Array.isArray(x?.[k])) out[k] = [...new Set(x[k].filter((v) => VOCAB[k].includes(v)))].sort();
  }
  for (const k of ["textura", "picante", "occasion"]) if (VOCAB[k].includes(x?.[k])) out[k] = x[k];
  if (typeof x?.kidFavourite === "boolean") out.kidFavourite = x.kidFavourite;
  return out;
}

const resumen = (r) => ({
  id: r.id, nombre: r.name, descripcion: r.description, categoria: r.category, papel: r.mealRole,
  tiempo: r.time, kcal: r.kcal, cocina: r.cocina ?? "española", temperatura: r.temperatura, formato: r.formato,
  ingredientes: (r.ingredients ?? []).map((i) => i.name),
});

async function enParalelo(tareas, n) {
  const cola = [...tareas];
  await Promise.all(Array.from({ length: n }, async () => { while (cola.length) await cola.shift()(); }));
}

async function pasada(clave) {
  const hechos = leer(clave);
  const pendientes = estrella.filter((r) => !hechos[r.id]);
  console.log(`Pasada ${clave}: ${pendientes.length} de ${estrella.length} por hacer`);
  const lotes = [];
  for (let k = 0; k < pendientes.length; k += LOTE) lotes.push(pendientes.slice(k, k + LOTE));
  let hechosN = 0;
  await enParalelo(lotes.map((lote, i) => async () => {
    const r = await conReintentos(() => llamar(`${ENFOQUE[clave]}\n\n${REGLAS}`, { recetas: lote.map(resumen) }), `lote ${i}`);
    const porId = new Map((r.resultados ?? []).map((x) => [x.id, x]));
    for (const rec of lote) {
      const x = porId.get(rec.id);
      if (x) hechos[rec.id] = validar(x);
      else console.log(`  ⚠ sin respuesta para ${rec.id}`);
    }
    guardar(clave, hechos);
    hechosN += lote.length;
    console.log(`  ${hechosN}/${pendientes.length}`);
  }), CONCURRENCIA);
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function juez() {
  const a = leer("a");
  const b = leer("b");
  const final = leer("final");
  const dudas = [];
  for (const r of estrella) {
    if (final[r.id] || !a[r.id] || !b[r.id]) continue;
    const acordado = {};
    const enDuda = {};
    for (const k of CAMPOS) {
      if (a[r.id][k] === undefined && b[r.id][k] === undefined) continue;
      if (igual(a[r.id][k], b[r.id][k])) acordado[k] = a[r.id][k];
      else enDuda[k] = { a: a[r.id][k], b: b[r.id][k] };
    }
    if (!Object.keys(enDuda).length) final[r.id] = { ...acordado, via: "acuerdo" };
    else dudas.push({ receta: resumen(r), acordado, enDuda });
  }
  console.log(`Juez: ${Object.keys(final).length} de acuerdo en todo, ${dudas.length} con algún campo por arbitrar`);
  const system = `Eres el editor jefe de un recetario familiar español. Dos editores han clasificado por separado cada receta y discrepan en algunos campos (enDuda). Decide SOLO esos campos, con los mismos criterios:\n${REGLAS.replace(/Responde SOLO[\s\S]*$/, "")}\nResponde SOLO con JSON: {"resultados":[{"id":"<id>", "<campo en duda>": <valor>, ...}]}.`;
  const lotes = [];
  for (let k = 0; k < dudas.length; k += LOTE) lotes.push(dudas.slice(k, k + LOTE));
  await enParalelo(lotes.map((lote, i) => async () => {
    const r = await conReintentos(() => llamar(system, { casos: lote.map((d) => ({ id: d.receta.id, receta: d.receta, enDuda: d.enDuda })) }), `juez ${i}`);
    const porId = new Map((r.resultados ?? []).map((x) => [x.id, x]));
    for (const d of lote) {
      const x = porId.get(d.receta.id);
      if (!x) { console.log(`  ⚠ el juez no dijo nada de ${d.receta.id}`); continue; }
      const decidido = validar({ ...d.acordado, ...Object.fromEntries(Object.keys(d.enDuda).map((k) => [k, x[k]])) });
      final[d.receta.id] = { ...decidido, via: "juez", arbitrado: Object.keys(d.enDuda) };
    }
    guardar("final", final);
  }), CONCURRENCIA);
  guardar("final", final);
}

function informe() {
  const final = leer("final");
  const faltan = estrella.filter((r) => !final[r.id]);
  console.log(`Decididas: ${estrella.length - faltan.length}/${estrella.length}${faltan.length ? ` — faltan ${faltan.map((r) => r.id).slice(0, 8).join(", ")}…` : ""}`);
  const juez = Object.values(final).filter((x) => x.via === "juez");
  console.log(`Por acuerdo: ${Object.values(final).length - juez.length} · por juez: ${juez.length}`);
  for (const k of CAMPOS) {
    const c = {};
    for (const x of Object.values(final)) {
      const v = x[k];
      for (const w of Array.isArray(v) ? (v.length ? v : ["(vacío)"]) : [v ?? "(sin decidir)"]) c[w] = (c[w] ?? 0) + 1;
    }
    const arbitrados = juez.filter((x) => x.arbitrado?.includes(k)).length;
    console.log(`  ${k.padEnd(13)} ${JSON.stringify(c)}  (arbitrados: ${arbitrados})`);
  }
}

function aplicar() {
  const final = leer("final");
  const faltan = estrella.filter((r) => !final[r.id]);
  if (faltan.length) throw new Error(`Faltan ${faltan.length} recetas por decidir: no se aplica a medias.`);
  let cambios = 0;
  for (const [f, recetas] of Object.entries(porFichero)) {
    let tocado = false;
    for (const r of recetas) {
      const x = final[r.id];
      if (!x) continue;
      for (const k of ["connotacion", "textura", "picante", "sabor"]) {
        if (x[k] !== undefined && !igual(r[k], x[k])) { r[k] = x[k]; tocado = true; cambios++; }
      }
      // Lo curado a mano manda: occasion y kidFavourite solo donde faltan. Y
      // solo el valor que dice algo: el esquema define AUSENTE = diario y
      // AUSENTE = no es de los que piden los niños (recipeSchema.js), así que
      // escribir «diario» o false sería ruido.
      //
      // Y aun así solo con --con-curados. En la primera tanda (30 sep 2026) el
      // modelo marcó «especial» el 35 % del Recetario (a mano, el 7 %) y
      // kidFavourite el 42 % (a mano, el 8 %, «los míticos que un niño PIDE»).
      // Ese inflado sacaba del día a día unos 200 platos: se queda como lista de
      // candidatos para revisar a mano, no se aplica sin más.
      if (CON_CURADOS && r.occasion === undefined && x.occasion === "especial") { r.occasion = "especial"; tocado = true; cambios++; }
      if (CON_CURADOS && r.kidFavourite === undefined && x.kidFavourite === true) { r.kidFavourite = true; tocado = true; cambios++; }
    }
    if (tocado) fs.writeFileSync(path.join(DIR, f), `${JSON.stringify(recetas, null, 2)}\n`);
  }
  console.log(`${cambios} valores escritos en el catálogo.`);
}

if (!API_KEY && (arg("pasada") || tiene("juez"))) throw new Error("Falta ANTHROPIC_API_KEY");
if (arg("pasada")) await pasada(arg("pasada"));
else if (tiene("juez")) await juez();
else if (tiene("informe")) informe();
else if (tiene("aplicar")) aplicar();
else if (!process.env.VITEST) console.log("Uso: --pasada=a | --pasada=b | --juez | --informe | --aplicar");
