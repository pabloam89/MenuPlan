/**
 * El test del juez (#693): mide a un juez con casos buenos y malos fijos. Cuesta tokens solo con `--si`.
 *
 *   npm run test-del-juez                       → ENSAYO de todos los jueces con fichero: valida la forma, no llama a nadie
 *   npm run test-del-juez -- revisor            → ensayo de uno
 *   npm run test-del-juez -- revisor --si       → DE PAGO: lo lanza una persona (modelo del juez + corrector barato)
 *   npm run test-del-juez -- revisor --si --tope=0.5
 *
 * Los casos: ops/test-del-juez/<juez>.json (forma y reglas en scripts/lib/testDelJuez.mjs). Cada norma de
 * juez apunta a su fichero con `test_del_juez` en ops/normas.json.
 *
 * Una línea por juez, para contarla (registrada en ops/metricas.json):
 *   test-del-juez juez: <j> aciertos: a/b buenos: c/d malos: e/f sin_correr: n acierto: 0.83 coste_usd: x
 * Salida (SALIDA de evals.mjs): 0 bien, 1 forma mala, 2 entrada mala, 3 se paró por el tope.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargarEnv } from "./lib/env.mjs";
import { SALIDA, costeUsd, estimadoSiguiente, opcionNumero, topeDePasada, apuntarOAvisar, puedeGastar } from "./lib/evals.mjs";
import { RAIZ, MODELO_BARATO, MODELO_EJECUTA, ESTIMADO_LLAMADA, TOPE_SKILLS_USD, jsonDeTexto, leerRespuesta } from "./lib/skills.mjs";
import { JUECES, cifra, faltasDeFichero, leerFichero, lineaDeCifra, medir, promptCaso } from "./lib/testDelJuez.mjs";

const argv = process.argv.slice(2);
const PAGO = argv.includes("--si");
const pedidos = argv.filter((a) => !a.startsWith("--"));
const salir = (codigo, msg) => { if (msg) console.error(msg); process.exit(codigo); };

const desconocidos = pedidos.filter((j) => !JUECES.includes(j));
if (desconocidos.length) salir(SALIDA.entrada, `No son jueces: ${desconocidos.join(", ")}. Hay: ${JUECES.join(", ")}`);

const normas = JSON.parse(readFileSync(join(RAIZ, "ops/normas.json"), "utf8")).normas;
const normasDeJuez = normas.filter((n) => n.control_procesador === "juez");
const lista = pedidos.length ? pedidos : JUECES.filter((j) => existsSync(join(RAIZ, "ops/test-del-juez", `${j}.json`)));
if (!lista.length) salir(SALIDA.entrada, "Ningún juez tiene fichero en ops/test-del-juez/.");

const ficheros = {};
let codigo = SALIDA.bien;
for (const j of lista) {
  let f = null;
  try { f = leerFichero(j, RAIZ); } catch (e) { f = { error: e.message }; }
  if (!f) salir(SALIDA.entrada, `${j}: no hay ops/test-del-juez/${j}.json`);
  const faltas = faltasDeFichero(f, j, normasDeJuez.map((n) => n.id));
  const casos = f.casos ?? [];
  console.log(`test-del-juez forma juez: ${j} casos: ${casos.length} buenos: ${casos.filter((c) => c.tipo === "bueno").length} malos: ${casos.filter((c) => c.tipo === "malo").length} normas: ${new Set(casos.map((c) => c.norma)).size} faltas: ${faltas.length}`);
  for (const m of faltas) console.log(`  - ${m}`);
  if (faltas.length) codigo = SALIDA.fallos;
  ficheros[j] = f;
}
if (codigo !== SALIDA.bien) salir(codigo, "La forma de los casos no vale.");
if (!PAGO) {
  console.log("Ensayo: no se llama a ninguna API. Para medir de verdad (de pago, lo lanza una persona): añade --si.");
  process.exit(SALIDA.bien);
}

let tope;
try { tope = topeDePasada(opcionNumero(argv, "tope") ?? TOPE_SKILLS_USD); } catch (e) { salir(SALIDA.entrada, e.message); }
cargarEnv(["ANTHROPIC_API_KEY"]);
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) salir(SALIDA.entrada, "Falta ANTHROPIC_API_KEY (en .env.local, como dirección op://; skill 1password).");

let gastado = 0;
let llamadas = 0;
let motivoTope = null;

async function llamar({ modelo, system, usuario, maxTokens }) {
  const cupo = puedeGastar(gastado, tope, estimadoSiguiente(gastado, llamadas, ESTIMADO_LLAMADA));
  if (!cupo.ok) { motivoTope = cupo.motivo; throw new Error(`tope: ${cupo.motivo}`); }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: usuario }], thinking: { type: "disabled" } }),
  });
  const data = await res.json().catch((e) => { console.warn(`[test-del-juez] respuesta ${res.status} sin JSON: ${e.message}`); return {}; });
  if (!res.ok) throw new Error(`API ${res.status}: ${data?.error?.message ?? "sin detalle"}`);
  llamadas++;
  const coste = costeUsd(data.usage, modelo, { ttl: "5m" });
  gastado += coste;
  apuntarOAvisar({ script: "test-del-juez", coste_usd: coste });
  return leerRespuesta(data).texto;
}

for (const j of lista) {
  // El juez se mide con su propio texto de agente como sistema; el corrector es otro modelo (juez distinto).
  const agente = readFileSync(join(RAIZ, ".claude/agents", `${j}.md`), "utf8").replace(/^---[\s\S]*?---\s*/, "");
  const antes = gastado;
  const filas = await medir(ficheros[j].casos, {
    juzgar: async (c) => {
      const norma = normas.find((n) => n.id === c.norma);
      const texto = await llamar({ modelo: MODELO_EJECUTA, system: agente, usuario: promptCaso(c, norma), maxTokens: 1500 });
      return jsonDeTexto(texto) ?? { veredicto: null, hallazgos: [] };
    },
    corregir: async (c, hallazgos) => {
      const texto = await llamar({
        modelo: MODELO_BARATO,
        system: 'Eres un corrector. Dices si algún hallazgo señala lo esperado. Responde solo con JSON: {"cumple":true|false}.',
        usuario: `Esperado: ${c.debe_senalar}\nHallazgos:\n${hallazgos.map((h) => `- ${h}`).join("\n")}`,
        maxTokens: 100,
      });
      return jsonDeTexto(texto)?.cumple === true;
    },
  });
  const c = cifra(filas);
  for (const f of filas.filter((x) => x.estado === "falla")) console.log(`  no acierta ${f.id} (${f.tipo}, norma ${f.norma}, veredicto ${f.veredicto ?? "ninguno"})`);
  console.log(lineaDeCifra(j, c, ` coste_usd: ${(gastado - antes).toFixed(4)}`));
  if (c.sin_correr) codigo = SALIDA.tope;
}
if (motivoTope) console.log(`Paró en el tope (${motivoTope}); gastado ${gastado.toFixed(3)} $ de ${tope.toFixed(2)} $.`);
console.log(`Total ${gastado.toFixed(4)} $ en ${llamadas} llamadas (tope ${tope.toFixed(2)} $).`);
process.exit(codigo);
