/**
 * Nivel 2 de las skills (#336): ¿ayuda de verdad? Cuesta tokens.
 *
 *   npm run skills-prueba -- github supabase           → las dos, tope 1 $
 *   npm run skills-prueba -- github --tope=0.5         → otro tope (el tope mensual sumado llega con #277: hoy cada pasada se limita sola)
 *   npm run skills-prueba -- github --ensayo           → qué correría y la cota de gasto, sin llamar a nadie
 *   npm run skills-prueba -- github --sin-guardar      → no escribe ops/skills-prueba/
 *
 * Con los casos de `.claude/skills/<skill>/casos.json`:
 *   1. Disparo: un modelo barato ve solo nombre y descripción de todas las
 *      skills y elige una (o «ninguna») para cada petición. Acierta si es la
 *      del caso. Mide si la `description` enruta.
 *   2. Ejecución: para cada caso propio, el modelo de las sesiones lee el
 *      SKILL.md y contesta sin ejecutar nada; un corrector barato mira cada
 *      línea de `debe_salir`. Solo SKILL.md: lo que esté en una capa tiene que
 *      estar citado ahí para que se encuentre.
 *   3. Guarda `ops/skills-prueba/<skill>.json` y lo compara con la pasada
 *      anterior, caso a caso.
 *
 * Lo apoya el método de la skill `skill-creator` (casos con lo que debe salir,
 * corrector aparte, y un test de disparo con casos que deben y que no deben
 * cargarla, mejor si se parecen), sin copiar su código: aquí todo es en
 * castellano, con nuestro tope de gasto y nuestro formato.
 *
 * Una línea por skill, para contarla:
 *   skills-prueba skill: <s> disparo: a/b comprobaciones: c/d sin_correr: n coste_usd: x cambios: mejora=… empeora=… resultado: ok|falla|incompleto
 * Salida (SALIDA de evals.mjs): 0 bien, 1 algún caso falla o empeora, 2 entrada mala, 3 se paró por el tope.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cargarEnv } from "./lib/env.mjs";
import { SALIDA, cabeOtro, costeUsd, estimadoSiguiente, hash, opcionNumero, topeDePasada } from "./lib/evals.mjs";
import {
  DIR_SKILLS, ESTIMADO_LLAMADA, MODELO_BARATO, MODELO_EJECUTA, NINGUNA, RAIZ, TOPE_SKILLS_USD,
  catalogoParaDisparo, comparar, faltasDeCasos, jsonDeTexto, nombresDeSkills, promptCorrige,
  promptDisparo, promptEjecuta, resumen,
} from "./lib/skills.mjs";

const argv = process.argv.slice(2);
const pedidas = argv.filter((a) => !a.startsWith("--"));
const ENSAYO = argv.includes("--ensayo");
const GUARDAR = !argv.includes("--sin-guardar");
const SALIDA_DIR = join(RAIZ, "ops/skills-prueba");

function salir(codigo, msg) {
  if (msg) console.error(msg);
  process.exit(codigo);
}

let tope;
try {
  tope = topeDePasada(opcionNumero(argv, "tope") ?? TOPE_SKILLS_USD);
} catch (e) {
  salir(SALIDA.entrada, e.message);
}

const todas = nombresDeSkills();
if (!pedidas.length) salir(SALIDA.entrada, `Di qué skills: npm run skills-prueba -- <skill> [...]. Hay: ${todas.join(", ")}`);
const desconocidas = pedidas.filter((s) => !todas.includes(s));
if (desconocidas.length) salir(SALIDA.entrada, `No existen: ${desconocidas.join(", ")}`);

const casosDe = {};
for (const s of pedidas) {
  const ruta = join(RAIZ, DIR_SKILLS, s, "casos.json");
  let casos = null;
  try { casos = existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null; } catch (e) { casos = { error: e.message }; }
  const faltas = faltasDeCasos(casos, s, todas);
  if (faltas.length) salir(SALIDA.entrada, `${s}: casos.json no vale (nivel 1):\n${faltas.map((f) => `  - ${f.detalle}`).join("\n")}`);
  casosDe[s] = casos.casos;
}

const llamadasPrevistas = pedidas.reduce((n, s) => n + casosDe[s].length + 2 * casosDe[s].filter((c) => c.skill === s).length, 0);
console.log(`skills-prueba: ${pedidas.join(", ")} · ${llamadasPrevistas} llamadas como mucho · tope ${tope.toFixed(2)} $`);
if (ENSAYO) {
  console.log("Ensayo: no se llama a ninguna API.");
  process.exit(SALIDA.bien);
}

cargarEnv(["ANTHROPIC_API_KEY"]);
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) salir(SALIDA.entrada, "Falta ANTHROPIC_API_KEY (en .env.local, como dirección op://; skill 1password).");

let gastado = 0;
let llamadas = 0;

/** Una llamada a la API, con su coste sumado; null si no cabe en el tope. */
async function llamar({ modelo, system, usuario, maxTokens }) {
  if (!cabeOtro(gastado, tope, estimadoSiguiente(gastado, llamadas, ESTIMADO_LLAMADA))) return null;
  const cuerpo = {
    model: modelo,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: usuario }],
  };
  for (let intento = 1; ; intento++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      llamadas++;
      gastado += costeUsd(data.usage, modelo, { ttl: "5m" });
      return (data.content ?? []).find((b) => b?.type === "text")?.text ?? "";
    }
    const reintentable = res.status === 429 || res.status >= 500;
    if (!reintentable || intento >= 3) throw new Error(`API ${res.status}: ${data?.error?.message ?? "sin detalle"}`);
    await new Promise((r) => setTimeout(r, 2000 * intento));
  }
}

const catalogo = catalogoParaDisparo();
const sistemaDisparo = promptDisparo(catalogo);
let codigo = SALIDA.bien;

for (const skill of pedidas) {
  const textoSkill = readFileSync(join(RAIZ, DIR_SKILLS, skill, "SKILL.md"), "utf8");
  const textoCasos = readFileSync(join(RAIZ, DIR_SKILLS, skill, "casos.json"), "utf8");
  const res = { skill, disparo: [], ejecucion: [] };
  const gastadoAntes = gastado;

  for (const c of casosDe[skill]) {
    const r = await llamar({ modelo: MODELO_BARATO, system: sistemaDisparo, usuario: c.peticion, maxTokens: 60 });
    if (r == null) { res.disparo.push({ id: c.id, esperado: c.skill, elegido: null, estado: "sin_correr" }); continue; }
    const elegido = String(jsonDeTexto(r)?.skill ?? "").trim() || NINGUNA;
    res.disparo.push({ id: c.id, esperado: c.skill, elegido, estado: elegido === c.skill ? "ok" : "falla" });
  }

  for (const c of casosDe[skill].filter((x) => x.skill === skill)) {
    const respuesta = await llamar({ modelo: MODELO_EJECUTA, system: promptEjecuta(textoSkill), usuario: c.peticion, maxTokens: 1200 });
    if (respuesta == null) { res.ejecucion.push({ id: c.id, estado: "sin_correr", comprobaciones: [] }); continue; }
    const usuario = `Respuesta:\n<respuesta>\n${respuesta}\n</respuesta>\n\nComprobaciones:\n${c.debe_salir.map((d) => `- ${d}`).join("\n")}`;
    const nota = await llamar({ modelo: MODELO_BARATO, system: promptCorrige(), usuario, maxTokens: 900 });
    if (nota == null) { res.ejecucion.push({ id: c.id, estado: "sin_correr", comprobaciones: [], respuesta: respuesta.slice(0, 2000) }); continue; }
    const leidas = jsonDeTexto(nota)?.comprobaciones ?? [];
    // Cada comprobación del caso, en su orden; la que el corrector no devuelva, no cumple.
    const comprobaciones = c.debe_salir.map((texto, i) => {
      const l = leidas.find((x) => x?.texto === texto) ?? leidas[i];
      return { texto, cumple: l?.cumple === true, evidencia: String(l?.evidencia ?? "").slice(0, 200) };
    });
    res.ejecucion.push({ id: c.id, estado: comprobaciones.every((x) => x.cumple) ? "ok" : "falla", comprobaciones, respuesta: respuesta.slice(0, 2000) });
  }

  const sum = resumen(res);
  const ruta = join(SALIDA_DIR, `${skill}.json`);
  const anterior = existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
  const cambios = comparar(anterior, res);
  const cuenta = (t) => cambios.filter((x) => x.cambio === t).length;
  const incompleto = sum.sin_correr > 0;
  const falla = [...res.disparo, ...res.ejecucion].some((c) => c.estado === "falla") || cuenta("empeora") > 0;
  const resultado = incompleto ? "incompleto" : falla ? "falla" : "ok";
  if (incompleto) codigo = SALIDA.tope;
  else if (falla && codigo === SALIDA.bien) codigo = SALIDA.fallos;

  for (const c of cambios.filter((x) => x.cambio === "empeora" || x.cambio === "mejora")) console.log(`  ${c.cambio}: ${c.parte} ${c.id} (${c.antes} → ${c.ahora})`);
  for (const c of res.disparo.filter((x) => x.estado === "falla")) console.log(`  disparo falla: ${c.id} esperaba ${c.esperado}, eligió ${c.elegido}`);
  for (const c of res.ejecucion.filter((x) => x.estado === "falla")) for (const k of c.comprobaciones.filter((x) => !x.cumple)) console.log(`  no cumple: ${c.id} · ${k.texto}`);

  const costeSkill = gastado - gastadoAntes;
  console.log(`skills-prueba skill: ${skill} disparo: ${sum.disparo_ok}/${sum.disparo_total} comprobaciones: ${sum.comprobaciones_ok}/${sum.comprobaciones_total} sin_correr: ${sum.sin_correr} coste_usd: ${costeSkill.toFixed(4)} cambios: mejora=${cuenta("mejora")} empeora=${cuenta("empeora")} nuevo=${cuenta("nuevo")} resultado: ${resultado}`);

  if (GUARDAR) {
    mkdirSync(SALIDA_DIR, { recursive: true });
    const guardado = {
      skill,
      fecha_utc: new Date().toISOString(),
      version: { skill_md: hash(textoSkill), casos_json: hash(textoCasos) },
      modelos: { disparo: MODELO_BARATO, ejecuta: MODELO_EJECUTA, corrige: MODELO_BARATO },
      tope_usd: Number(tope.toFixed(4)),
      coste_usd: Number(costeSkill.toFixed(4)),
      resultado,
      resumen: sum,
      cambios_respecto_anterior: cambios,
      disparo: res.disparo,
      ejecucion: res.ejecucion,
    };
    writeFileSync(ruta, `${JSON.stringify(guardado, null, 2)}\n`);
  }
}

console.log(`skills-prueba total coste_usd: ${gastado.toFixed(4)} llamadas: ${llamadas} tope_usd: ${tope.toFixed(2)}`);
process.exit(codigo);
