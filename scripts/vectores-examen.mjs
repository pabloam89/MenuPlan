/**
 * Examen de modelos de embeddings con NUESTRAS frases: ¿cuál entiende mejor
 * cómo pide la comida una familia española?
 *
 *   node scripts/vectores-examen.mjs [modelo ...]
 *
 * Cada petición lleva una regla sacada de los rasgos del catálogo (no una
 * lista a ojo): una receta «encaja» si la cumple. La nota es cuántas de las 8
 * primeras encajan (precisión@8), de media. Las de negación van aparte: ahí
 * se espera que el vector falle y se mide cuánto, para saber qué filtro poner.
 *
 * Coste: vectorizar el catálogo son ~60k tokens por modelo (menos de un
 * céntimo); se guarda en node_modules/.cache/vectores y no se vuelve a pagar.
 * Necesita AI_GATEWAY_API_KEY en .env.local.
 */

import fs from "node:fs";
import path from "node:path";
import { textoDeReceta, normalizar, masCercanos } from "../src/lib/vectores.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.VITE_SUPABASE_ANON_KEY ||= "x";
const { recipeCatalog } = await import("../api/_bot/core.mjs");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "")]),
);
const CLAVE = process.env.AI_GATEWAY_API_KEY || env.AI_GATEWAY_API_KEY;

// Algunos modelos rinden más si se les dice qué es pregunta y qué documento.
const PREFIJOS = {
  voyage: { q: "Represent the query for retrieving supporting documents: ", d: "Represent the document for retrieval: " },
  qwen: { q: "Instruct: Dada una petición de comida de una familia, encuentra recetas que encajen\nQuery: ", d: "" },
};
const prefijos = (modelo) => PREFIJOS[modelo.startsWith("voyage/") ? "voyage" : modelo.startsWith("alibaba/qwen") ? "qwen" : ""] ?? { q: "", d: "" };

async function vectorizar(modelo, textos) {
  const out = [];
  for (let i = 0; i < textos.length; i += 96) {
    let j;
    // Algunos modelos tienen un límite por minuto muy bajo: se espera lo que
    // pide el gateway y se reintenta.
    for (let intento = 0; intento < 6; intento++) {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, input: textos.slice(i, i + 96) }),
      });
      j = await r.json();
      if (r.status !== 429) break;
      const s = Number(String(j?.error?.message).match(/after (\d+)s/)?.[1] ?? 15);
      console.error(`${modelo}: límite por minuto, espero ${s + 1} s`);
      await new Promise((ok) => setTimeout(ok, (s + 1) * 1000));
    }
    if (!j.data) throw new Error(`${modelo}: ${JSON.stringify(j).slice(0, 200)}`);
    out.push(...j.data.sort((a, b) => a.index - b.index).map((d) => normalizar(d.embedding)));
  }
  return out;
}

const sin = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const lleva = (r, re) => (r.ingredients ?? []).some((i) => re.test(sin(i?.name)));
const rol = (r, x) => (r.mealRole ?? []).includes(x);

const EXAMEN = [
  ["algo de cuchara para el frío", (r) => r.textura === "cuchara" && r.temperatura === "caliente"],
  ["un guiso de los de toda la vida", (r) => r.tecnica === "olla" && r.connotacion?.includes("casero")],
  ["una cena que parezca de restaurante", (r) => r.connotacion?.includes("festivo") || r.occasion === "especial"],
  ["algo para impresionar a los suegros", (r) => r.connotacion?.includes("festivo") || r.occasion === "especial"],
  ["algo fresquito para el verano", (r) => r.temperatura === "frio" || r.connotacion?.includes("fresco")],
  ["algo de picar para ver el fútbol", (r) => r.textura === "mano"],
  ["algo que pique un poco", (r) => r.picante && r.picante !== "no"],
  ["que sea barato, que estamos a fin de mes", (r) => r.costeNivel === "economico"],
  ["algo ligerito que me pasé el finde", (r) => r.caloriasNivel === "ligero"],
  ["algo contundente que vengo de entrenar", (r) => r.caloriasNivel === "contundente"],
  ["pescado al horno", (r) => r.category === "pescados" && r.tecnica === "horno"],
  ["algo con pollo", (r) => lleva(r, /\bpollo\b/)],
  ["una pasta rapidita", (r) => r.mainBase === "pasta" && r.time <= 25],
  ["papilla para el bebé", (r) => r.category === "bebes"],
  ["qué desayunamos", (r) => r.category === "desayunos" || rol(r, "desayuno")],
  ["un postre de chocolate", (r) => r.category === "postres" && lleva(r, /\bchocolate|\bcacao/)],
  ["para llevar en el táper al trabajo", (r) => r.tupperFriendly],
  ["algo que se coman los niños sin protestar", (r) => r.kidFriendly],
  ["para hacer de más y congelar", (r) => r.freezable],
  ["algo con hierro que la niña anda baja", (r) => r.healthFlags?.includes("rico_hierro")],
  ["algo ahumado", (r) => r.sabor?.includes("ahumado")],
  ["unas legumbres", (r) => r.category === "legumbres" || r.mainBase === "legumbre"],
  ["un arrocito", (r) => r.mainBase === "arroz"],
  ["huevos para cenar en un momento", (r) => r.category === "huevos" && r.time <= 20],
  ["una ensalada que llene", (r) => r.category === "ensaladas_verduras" && rol(r, "plato_unico")],
  ["una crema de verduras", (r) => r.category === "sopas_cremas"],
  ["algo dulce para merendar", (r) => r.sabor?.includes("dulce") && (r.category === "postres" || r.category === "desayunos" || r.category === "meriendas")],
  ["algo a la plancha sin complicarse", (r) => r.tecnica === "plancha" && r.difficulty === "facil"],
  ["algo exótico con especias", (r) => r.sabor?.includes("especiado")],
  ["cena ligera y rápida", (r) => r.caloriasNivel === "ligero" && r.time <= 25],
  ["carne roja", (r) => lleva(r, /\b(ternera|vacuno|buey|cordero|solomillo|entrecot)\b/)],
  ["pescado azul", (r) => lleva(r, /\b(sardinas?|salmon|caballa|atun|boquerones?|bonito|jurel)\b/)],
  ["verduras al horno", (r) => r.category === "ensaladas_verduras" && r.tecnica === "horno"],
  ["algo con garbanzos", (r) => lleva(r, /\bgarbanzos?\b/)],
  ["comida de domingo en familia", (r) => r.connotacion?.includes("festivo") || (r.connotacion?.includes("casero") && rol(r, "plato_unico"))],
  ["una tortilla", (r) => /\btortilla\b/.test(sin(r.name))],
  ["lo que comía de pequeño en casa de mi abuela", (r) => r.connotacion?.includes("casero")],
  ["algo reconfortante que estoy pachucho", (r) => r.connotacion?.includes("reconfortante")],
];
// Negaciones: el vector no entiende el «no»; se mide cuánto falla.
const NEGACIONES = [
  ["que no sea pescado", (r) => r.category !== "pescados" && !lleva(r, /\b(merluza|bacalao|salmon|atun|gambas?|langostinos?|sardinas?|calamar(es)?)\b/)],
  ["sin encender el horno", (r) => r.tecnica !== "horno"],
  ["algo sin carne", (r) => r.category !== "carnes" && !lleva(r, /\b(pollo|ternera|cerdo|jamon|chorizo|pavo|cordero|carne)\b/)],
];

const estrella = recipeCatalog.filter((r) => r.estrella).sort((a, b) => a.id.localeCompare(b.id));
const porId = Object.fromEntries(estrella.map((r) => [r.id, r]));
const cacheDir = path.join("node_modules", ".cache", "vectores");
fs.mkdirSync(cacheDir, { recursive: true });

const MODELOS = process.argv.slice(2).length ? process.argv.slice(2) : [
  "voyage/voyage-4-lite", "voyage/voyage-4", "cohere/embed-v4.0", "google/gemini-embedding-001", "alibaba/qwen3-embedding-8b",
];

// El azar: lo que acertaría sacando 8 recetas cualquiera. Una regla con menos
// de 8 recetas que la cumplan no puede sacar un 8/8: se avisa.
const cumplen = (ok) => estrella.filter(ok).length;
for (const [f, ok] of [...EXAMEN, ...NEGACIONES]) if (cumplen(ok) < 8) console.error(`ojo: «${f}» solo la cumplen ${cumplen(ok)} (se puntúa sobre ${cumplen(ok)})`);
if (process.env.VER_TEXTO) for (const id of process.env.VER_TEXTO.split(",")) console.log(textoDeReceta(porId[id]));
const azar = (lista) => (lista.reduce((a, [, ok]) => a + cumplen(ok) / estrella.length, 0) / lista.length * 100).toFixed(0);
console.log(`azar  ·  precisión@8 ${azar(EXAMEN)} %  ·  negaciones ${azar(NEGACIONES)} %`);
if (!CLAVE) { console.error("Falta AI_GATEWAY_API_KEY en .env.local"); process.exit(1); }

const nota = (vq, indice, ok) => masCercanos(vq, indice, 8).filter((x) => ok(porId[x.id])).length / Math.min(8, cumplen(ok));

for (const modelo of MODELOS) {
  const { q, d } = prefijos(modelo);
  const fichero = path.join(cacheDir, `${modelo.replace(/\W+/g, "_")}.json`);
  let indice;
  if (fs.existsSync(fichero)) indice = JSON.parse(fs.readFileSync(fichero, "utf8"));
  else {
    const t0 = Date.now();
    indice = { ids: estrella.map((r) => r.id), vectores: await vectorizar(modelo, estrella.map((r) => d + textoDeReceta(r))) };
    fs.writeFileSync(fichero, JSON.stringify(indice));
    console.error(`${modelo}: catálogo vectorizado en ${Date.now() - t0} ms`);
  }
  // Las frases también se guardan: repetir el examen (o recortar) no cuesta nada.
  const ficheroQ = fichero.replace(/\.json$/, ".frases.json");
  const frases = [...EXAMEN, ...NEGACIONES].map(([f]) => q + f);
  const guardadas = fs.existsSync(ficheroQ) ? JSON.parse(fs.readFileSync(ficheroQ, "utf8")) : {};
  const faltan = frases.filter((f) => !guardadas[f]);
  const t0 = Date.now();
  if (faltan.length) {
    (await vectorizar(modelo, faltan)).forEach((v, i) => { guardadas[faltan[i]] = v; });
    fs.writeFileSync(ficheroQ, JSON.stringify(guardadas));
  }
  const ms = Date.now() - t0;
  // DIMS=768 recorta los vectores (los modelos con Matryoshka lo aguantan) para ver cuánto se pierde.
  const dims = Number(process.env.DIMS) || 0;
  const recorta = (v) => (dims ? normalizar(v.slice(0, dims)) : v);
  if (dims) indice = { ids: indice.ids, vectores: indice.vectores.map(recorta) };
  const vq = frases.map((f) => recorta(guardadas[f]));
  const notas = EXAMEN.map(([, ok], i) => nota(vq[i], indice, ok));
  const neg = NEGACIONES.map(([, ok], i) => nota(vq[EXAMEN.length + i], indice, ok));
  const media = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length * 100).toFixed(0);
  const flojas = EXAMEN.map(([f], i) => [f, notas[i]]).filter(([, n]) => n < 0.5).map(([f, n]) => `${f} (${n * 8}/8)`);
  console.log(`\n${modelo}  dims ${indice.vectores[0].length}  ·  precisión@8 ${media(notas)} %  ·  negaciones ${media(neg)} %${faltan.length ? `  ·  ${faltan.length} frases en ${ms} ms` : ""}`);
  if (flojas.length) console.log(`  flojas: ${flojas.join(" · ")}`);
}
