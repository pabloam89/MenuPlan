/**
 * Examen del buscador híbrido (api/_bot/buscador.js) con la MISMA función que
 * usa el bot (recetas.js conSignificado, con la búsqueda por palabras), frente
 * a Haiku solo (significado.js), que es lo que había.
 *
 *   node scripts/buscador-examen.mjs [--aparte] [--sin-gateway] [--sin-haiku]
 *
 *   --aparte       el examen ciego (scripts/vectores-aparte.mjs): pasarlo UNA
 *                  vez, con las reglas congeladas. Si después se toca algo
 *                  mirándolo, deja de medir.
 *   --sin-gateway  como si el gateway estuviera caído: rasgos, palabras y Haiku.
 *   --sin-haiku    no pasa la referencia de Haiku solo (ahorra ~15 céntimos).
 *
 * Con el gateway en plan gratuito (5 por minuto) se espera 12,5 s tras cada
 * frase que haya llamado al vector. Coste: lo que caiga en Haiku (~0,3 cént.
 * cada una con la caché caliente) y la referencia.
 */

import { cargarEnv, leerFichero } from "./lib/env.mjs";

cargarEnv(Object.keys(leerFichero()));
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";

const args = process.argv.slice(2);
const preguntas = args.includes("--aparte") ? await import("./vectores-aparte.mjs") : await import("./vectores-preguntas.mjs");
const EXAMEN = preguntas.APARTE ?? preguntas.EXAMEN;
const NEGACIONES = preguntas.APARTE_NEGACIONES ?? preguntas.NEGACIONES;

const { recipeCatalog } = await import("../api/_bot/core.mjs");
const { conSignificado, filtrarRecetas, carpetaDe } = await import("../api/_bot/recetas.js");
const { parecidos } = await import("../api/_bot/vectores.js");
const { porSignificado } = await import("../api/_bot/significado.js");
const { rasgosDeFrase } = await import("../src/lib/rasgosBusqueda.js");

const estrella = recipeCatalog.filter((r) => r.estrella);
const cumplen = (ok) => estrella.filter(ok).length;
const nota = (recetas, ok) => recetas.slice(0, 8).filter((r) => ok(r)).length / Math.min(8, cumplen(ok));
const pct = (xs) => `${(xs.reduce((a, b) => a + b, 0) / xs.length * 100).toFixed(0)} %`;
const p = (xs, q) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pasar(lista) {
  const fila = { notas: [], ms: [], haiku: 0, vector: 0, sinRed: 0, notasConRasgos: [], notasSinRasgos: [] };
  for (const [consulta, ok] of lista) {
    let llamoVector = false;
    let llamoHaiku = false;
    const deps = {
      parecidos: args.includes("--sin-gateway") ? async () => null : async (f) => { llamoVector = true; return parecidos(f); },
      haiku: async (...a) => { llamoHaiku = true; return porSignificado(...a); },
    };
    const porPalabras = filtrarRecetas(estrella, { consulta });
    const t0 = Date.now();
    const { halladas } = await conSignificado(porPalabras, { consulta, catalogo: estrella }, deps);
    fila.ms.push(Date.now() - t0);
    const n = nota(halladas, ok);
    fila.notas.push(n);
    (rasgosDeFrase(consulta).hayRasgos ? fila.notasConRasgos : fila.notasSinRasgos).push(n);
    if (llamoHaiku) fila.haiku++;
    if (llamoVector) fila.vector++;
    if (!llamoHaiku && !llamoVector) fila.sinRed++;
    if (llamoVector && !args.includes("--sin-gateway")) await espera(12_500);
  }
  return fila;
}

async function soloHaiku(lista) {
  const notas = [], ms = [];
  for (const [consulta, ok] of lista) {
    const t0 = Date.now();
    const ids = await porSignificado(consulta, { catalogo: recipeCatalog, carpetaDe, n: 8 });
    ms.push(Date.now() - t0);
    const porId = new Map(estrella.map((r) => [r.id, r]));
    notas.push(nota(ids.map((id) => porId.get(id)).filter(Boolean), ok));
  }
  return { notas, ms };
}

console.log(`${args.includes("--aparte") ? "EXAMEN CIEGO" : "examen de diseño"}: ${EXAMEN.length} frases + ${NEGACIONES.length} negaciones${args.includes("--sin-gateway") ? " · gateway caído" : ""}`);
const h = await pasar(EXAMEN);
const hn = await pasar(NEGACIONES);
const todas = [...h.ms, ...hn.ms];
const total = EXAMEN.length + NEGACIONES.length;
console.log(`híbrido   acierto ${pct(h.notas)} (con rasgos ${h.notasConRasgos.length ? pct(h.notasConRasgos) : "–"} en ${h.notasConRasgos.length}, sin rasgos ${h.notasSinRasgos.length ? pct(h.notasSinRasgos) : "–"} en ${h.notasSinRasgos.length})  ·  negaciones ${pct(hn.notas)}  ·  mediana ${p(todas, 0.5)} ms  ·  p95 ${p(todas, 0.95)} ms`);
console.log(`          a Haiku ${h.haiku + hn.haiku}/${total}  ·  vector ${h.vector + hn.vector}/${total}  ·  sin red ${h.sinRed + hn.sinRed}/${total}`);
if (!args.includes("--sin-haiku")) {
  const s = await soloHaiku(EXAMEN);
  const sn = await soloHaiku(NEGACIONES);
  const ms = [...s.ms, ...sn.ms];
  console.log(`haiku     acierto ${pct(s.notas)}  ·  negaciones ${pct(sn.notas)}  ·  mediana ${p(ms, 0.5)} ms  ·  p95 ${p(ms, 0.95)} ms`);
}
