/**
 * «Puede contener»: los alérgenos que un ingrediente ELABORADO suele llevar
 * según la marca (un caldo de brick con apio, un chorizo con leche o soja, un
 * curry con mostaza), y que su ficha no declara porque no los lleva siempre.
 *
 * Decisión de Pablo (30 sep 2026): se marcan aparte, como «puede contener», en
 * la ficha del ingrediente; la receta lo hereda, se avisa, y se excluye para
 * quien tenga esa alergia. No se tratan como seguros ni como declarados.
 *
 * Tres pasos, cada uno escribe en output/ y el último en el catálogo:
 *
 *   node scripts/alergenos-puede-contener.mjs --pasada=a    # primera opinión
 *   node scripts/alergenos-puede-contener.mjs --pasada=b    # segunda, con otro enfoque
 *   node scripts/alergenos-puede-contener.mjs --juez        # arbitra donde A y B no coinciden
 *   node scripts/alergenos-puede-contener.mjs --informe     # lo que cambiaría, sin tocar nada
 *   node scripts/alergenos-puede-contener.mjs --aplicar     # escribe mayContain en ingredients.json
 *
 * Dos pasadas independientes y un juez porque es un dato de seguridad: una
 * sola opinión de un modelo no basta. Solo vocabulario cerrado (los 14
 * alérgenos UE); la respuesta se valida contra él y contra los ids enviados.
 * Nunca quita nada: `allergens` (lo que lleva seguro) no se toca, y lo que ya
 * está declarado ahí no se repite en mayContain.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "output");
const INGREDIENTES = path.join(ROOT, "src/data/ingredients.json");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? env.match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)/m)?.[1]?.trim();
const MODELO = process.env.ENRICH_MODEL ?? "claude-sonnet-5";
const LOTE = 25;

const EU = ["gluten", "crustaceos", "huevos", "pescado", "cacahuetes", "soja", "leche",
  "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces", "moluscos"];

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const tiene = (k) => process.argv.includes(`--${k}`);
fs.mkdirSync(OUT, { recursive: true });
const ruta = (n) => path.join(OUT, `alergenos-puede-contener-${n}.json`);
const leer = (n) => (fs.existsSync(ruta(n)) ? JSON.parse(fs.readFileSync(ruta(n), "utf8")) : {});
const guardar = (n, d) => fs.writeFileSync(ruta(n), `${JSON.stringify(d, null, 2)}\n`);

const ingredientes = JSON.parse(fs.readFileSync(INGREDIENTES, "utf8"));

const ENFOQUE = {
  a: `Eres un técnico de seguridad alimentaria en España. Para cada ingrediente de una receta casera, decide si en el supermercado español se compra normalmente como PRODUCTO ELABORADO o envasado cuya composición varía según la marca (caldos de brick, embutidos, salsas, mezclas de especias, pan, conservas con aditivos, bebidas alcohólicas…), y en ese caso qué alérgenos de la lista UE aparecen con frecuencia en sus etiquetas (como ingrediente o como «puede contener trazas»), ADEMÁS de los que el ingrediente ya declara. Un producto fresco o de un solo componente (una verdura, carne o pescado fresco, una legumbre seca, aceite de oliva, sal) no es elaborado: puedeContener vacío.`,
  b: `Actúas como el responsable de etiquetado de una cadena de supermercados española. Te paso ingredientes tal como aparecen en recetas. Para cada uno: ¿la versión que compra una familia normal lleva una lista de ingredientes (no es un alimento de un solo componente)? Si la lleva, ¿qué alérgenos de la lista oficial de la UE suelen aparecer en esas etiquetas en el mercado español, contando también las advertencias de trazas? No repitas los que ya declara el ingrediente. Sé conservador con la seguridad pero no inventes: si un alérgeno aparece solo en marcas raras, no lo pongas.`,
};

const FORMATO = `Responde SOLO con JSON: {"resultados":[{"id":"<id tal cual>","elaborado":true|false,"puedeContener":["<id UE>",...],"motivo":"<una frase>"}]} con un elemento por ingrediente, en el mismo orden. Ids UE válidos: ${EU.join(", ")}.`;

async function llamar(system, payload, maxTokens = 8000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, system, messages: [{ role: "user", content: JSON.stringify(payload) }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  // El primer bloque de texto, no content[0]: puede venir razonamiento delante.
  const texto = (data?.content ?? []).find((b) => b?.type === "text")?.text ?? "";
  const s = texto.indexOf("{");
  const e = texto.lastIndexOf("}");
  return JSON.parse(texto.slice(s, e + 1));
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

/** Solo ids UE, sin repetir los ya declarados. */
function limpiar(ing, lista) {
  const ya = new Set([...(ing.allergens ?? []), ...(ing.cookingAllergens ?? [])]);
  return [...new Set((lista ?? []).filter((a) => EU.includes(a) && !ya.has(a)))].sort();
}

async function pasada(clave) {
  const hechos = leer(clave);
  const pendientes = ingredientes.filter((i) => !hechos[i.id]);
  console.log(`Pasada ${clave}: ${pendientes.length} de ${ingredientes.length} por hacer`);
  for (let k = 0; k < pendientes.length; k += LOTE) {
    const lote = pendientes.slice(k, k + LOTE);
    const payload = { ingredientes: lote.map((i) => ({ id: i.id, nombre: i.name, alias: i.aliases, categoria: i.category, yaDeclara: [...i.allergens, ...i.cookingAllergens] })) };
    const r = await conReintentos(() => llamar(`${ENFOQUE[clave]}\n\n${FORMATO}`, payload), `lote ${k}`);
    const porId = new Map((r.resultados ?? []).map((x) => [x.id, x]));
    for (const ing of lote) {
      const x = porId.get(ing.id);
      if (!x) { console.log(`  ⚠ sin respuesta para ${ing.id}`); continue; }
      hechos[ing.id] = { elaborado: Boolean(x.elaborado), puedeContener: limpiar(ing, x.puedeContener), motivo: String(x.motivo ?? "").slice(0, 200) };
    }
    guardar(clave, hechos);
    console.log(`  ${Math.min(k + LOTE, pendientes.length)}/${pendientes.length}`);
  }
}

async function juez() {
  const a = leer("a");
  const b = leer("b");
  const final = leer("final");
  const iguales = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const dudas = [];
  for (const ing of ingredientes) {
    if (final[ing.id]) continue;
    const ra = a[ing.id];
    const rb = b[ing.id];
    if (!ra || !rb) continue;
    if (iguales(ra.puedeContener, rb.puedeContener)) final[ing.id] = { puedeContener: ra.puedeContener, via: "acuerdo" };
    else dudas.push({ id: ing.id, nombre: ing.name, yaDeclara: [...ing.allergens, ...ing.cookingAllergens], opinionA: ra, opinionB: rb });
  }
  console.log(`Juez: ${Object.keys(final).length} de acuerdo, ${dudas.length} por arbitrar`);
  const system = `Eres el juez de seguridad alimentaria de un catálogo de recetas español. Dos técnicos han opinado por separado qué alérgenos UE «puede contener» un ingrediente elaborado según la marca (además de los que ya declara). Decide tú, con criterio del mercado español: incluye un alérgeno si aparece con frecuencia real en ese producto (ingrediente o trazas); descártalo si es raro. ${FORMATO.replace('"elaborado":true|false,', "")}`;
  for (let k = 0; k < dudas.length; k += LOTE) {
    const lote = dudas.slice(k, k + LOTE);
    const r = await conReintentos(() => llamar(system, { casos: lote }), `juez ${k}`);
    const porId = new Map((r.resultados ?? []).map((x) => [x.id, x]));
    for (const d of lote) {
      const ing = ingredientes.find((i) => i.id === d.id);
      const x = porId.get(d.id);
      if (!x) { console.log(`  ⚠ el juez no dijo nada de ${d.id}`); continue; }
      final[d.id] = { puedeContener: limpiar(ing, x.puedeContener), via: "juez", motivo: String(x.motivo ?? "").slice(0, 200), a: d.opinionA.puedeContener, b: d.opinionB.puedeContener };
    }
    guardar("final", final);
  }
  guardar("final", final);
}

/**
 * Revisión escéptica de lo que el juez dejó con «puede contener». Las dos
 * pasadas y el juez fallaron en el mismo sentido (30 sep 2026): tomaron por
 * elaborados productos frescos («Pechuga de pollo: mostaza, soja», «Pimiento
 * rojo: sulfitos») y dieron por comunes trazas raras («Pimienta negra:
 * gluten»), lo que dejaría a un celíaco sin medio catálogo. Esta pasada busca
 * falsos positivos, con las recetas donde se usa cada ingrediente para saber
 * si es el fresco o el envasado. Lo que no confirma, se quita.
 */
async function revisar() {
  const final = leer("final");
  const revision = leer("revision");
  const recetas = fs.readdirSync(path.join(ROOT, "src/data/recipes")).filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/recipes", f), "utf8")));
  const usos = (ing) => recetas
    .filter((r) => (r.ingredients ?? []).some((l) => l.ingredientId === ing.id))
    .slice(0, 6)
    .map((r) => `${r.name} (${(r.ingredients.find((l) => l.ingredientId === ing.id) ?? {}).name})`);
  const casos = ingredientes.filter((i) => final[i.id]?.puedeContener?.length && !revision[i.id]);
  console.log(`Revisión: ${casos.length} ingredientes con «puede contener» por revisar`);
  const system = `Eres un revisor escéptico de seguridad alimentaria en España. Otros han marcado alérgenos que un ingrediente «puede contener». Tu trabajo es encontrar los FALSOS POSITIVOS, que dejan a personas alérgicas sin comida sin motivo.
Para cada alérgeno propuesto, mantenlo SOLO si se cumplen las dos cosas:
1. El ingrediente, tal como lo usan esas recetas, es un producto ENVASADO CON LISTA DE INGREDIENTES (caldo de brick, embutido, pan, salsa, pasta seca, conserva, mezcla de especias…). Un producto fresco de un solo componente (carne o pescado fresco, verdura, fruta, huevo, especia pura de un solo ingrediente, fruto seco natural, yogur natural) NO lo es: quítale todo.
2. En la MAYORÍA de las marcas del supermercado español ese alérgeno aparece en la etiqueta, como ingrediente o como «puede contener trazas». Si solo pasa en algunas marcas, quítalo.
Responde SOLO con JSON: {"resultados":[{"id":"<id>","mantener":["<id UE>",...],"motivo":"<una frase>"}]} en el mismo orden.`;
  for (let k = 0; k < casos.length; k += LOTE) {
    const lote = casos.slice(k, k + LOTE);
    const payload = { casos: lote.map((i) => ({ id: i.id, nombre: i.name, propuestos: final[i.id].puedeContener, recetasQueLoUsan: usos(i) })) };
    const r = await conReintentos(() => llamar(system, payload), `revisión ${k}`);
    const porId = new Map((r.resultados ?? []).map((x) => [x.id, x]));
    for (const i of lote) {
      const x = porId.get(i.id);
      if (!x) { console.log(`  ⚠ la revisión no dijo nada de ${i.id}`); continue; }
      // Solo puede quitar: lo que mantiene tiene que estar entre lo propuesto.
      const mantener = limpiar(i, x.mantener).filter((a) => final[i.id].puedeContener.includes(a));
      revision[i.id] = { mantener, quitados: final[i.id].puedeContener.filter((a) => !mantener.includes(a)), motivo: String(x.motivo ?? "").slice(0, 200) };
    }
    guardar("revision", revision);
  }
  for (const i of ingredientes) {
    if (revision[i.id]) final[i.id] = { ...final[i.id], puedeContener: revision[i.id].mantener, revisado: true, quitados: revision[i.id].quitados };
  }
  guardar("final", final);
}

function informe() {
  const final = leer("final");
  const con = ingredientes.filter((i) => final[i.id]?.puedeContener?.length);
  const faltan = ingredientes.filter((i) => !final[i.id]).map((i) => i.id);
  console.log(`Con «puede contener»: ${con.length} de ${ingredientes.length}. Sin decidir: ${faltan.length}${faltan.length ? ` (${faltan.slice(0, 10).join(", ")}…)` : ""}`);
  const cuenta = {};
  for (const i of con) for (const x of final[i.id].puedeContener) cuenta[x] = (cuenta[x] ?? 0) + 1;
  console.log("Por alérgeno:", JSON.stringify(cuenta));
  for (const i of con) console.log(`  ${i.name}: ${final[i.id].puedeContener.join(", ")} [${final[i.id].via}]`);
}

function aplicar() {
  const final = leer("final");
  const faltan = ingredientes.filter((i) => !final[i.id]);
  if (faltan.length) throw new Error(`Faltan ${faltan.length} ingredientes por decidir: no se aplica a medias.`);
  let n = 0;
  for (const ing of ingredientes) {
    const lista = final[ing.id].puedeContener;
    if (lista.length) { ing.mayContain = lista; n++; } else delete ing.mayContain;
  }
  fs.writeFileSync(INGREDIENTES, `${JSON.stringify(ingredientes, null, 2)}\n`);
  console.log(`mayContain escrito en ${n} ingredientes.`);
}

if (!API_KEY && (arg("pasada") || tiene("juez") || tiene("revisar"))) throw new Error("Falta ANTHROPIC_API_KEY");
if (arg("pasada")) await pasada(arg("pasada"));
else if (tiene("juez")) await juez();
else if (tiene("revisar")) await revisar();
else if (tiene("informe")) informe();
else if (tiene("aplicar")) aplicar();
else console.log("Uso: --pasada=a | --pasada=b | --juez | --informe | --aplicar");
