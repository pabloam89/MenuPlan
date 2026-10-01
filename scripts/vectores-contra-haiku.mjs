/**
 * Vectores (api/_bot/vectores.js) frente a Haiku (api/_bot/significado.js),
 * con las mismas preguntas y tal como corren en el bot: una frase cada vez.
 *
 *   node scripts/vectores-contra-haiku.mjs [--sin-haiku]
 *
 * Coste: los vectores, nada que se note; Haiku, unos 3,5 céntimos la primera
 * (caché fría) y ~0,3 céntimos cada una de las demás: ~15 céntimos en total.
 * Necesita AI_GATEWAY_API_KEY y ANTHROPIC_API_KEY en .env.local.
 */

import fs from "node:fs";
import { EXAMEN, NEGACIONES } from "./vectores-preguntas.mjs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
const { recipeCatalog } = await import("../api/_bot/core.mjs");
const { porVectores } = await import("../api/_bot/vectores.js");
const conHaiku = !process.argv.includes("--sin-haiku");
const { porSignificado } = conHaiku ? await import("../api/_bot/significado.js") : {};

const porId = Object.fromEntries(recipeCatalog.map((r) => [r.id, r]));
const estrella = recipeCatalog.filter((r) => r.estrella);
const cumplen = (ok) => estrella.filter(ok).length;
const nota = (ids, ok) => ids.filter((id) => porId[id] && ok(porId[id])).length / Math.min(8, cumplen(ok));
const mediana = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

async function pasar(nombre, buscar, lista) {
  const notas = [], ms = [];
  for (const [frase, ok] of lista) {
    const t0 = Date.now();
    const ids = await buscar(frase);
    ms.push(Date.now() - t0);
    notas.push(nota(ids, ok));
    // Con el gateway en plan gratuito, Voyage deja 5 por minuto: PAUSA_MS=12500.
    if (nombre === "vectores" && process.env.PAUSA_MS) await new Promise((r) => setTimeout(r, Number(process.env.PAUSA_MS)));
  }
  const media = (notas.reduce((a, b) => a + b, 0) / notas.length * 100).toFixed(0);
  return { nombre, media, mediana: mediana(ms), peor: Math.max(...ms) };
}

const buscadores = [["vectores", (f) => porVectores(f, { n: 8 })]];
if (conHaiku) buscadores.push(["haiku", (f) => porSignificado(f, { catalogo: recipeCatalog, carpetaDe: (r) => r.category, n: 8 })]);

for (const [nombre, buscar] of buscadores) {
  const a = await pasar(nombre, buscar, EXAMEN);
  const b = await pasar(nombre, buscar, NEGACIONES);
  console.log(`${nombre.padEnd(9)} acierto ${a.media} %  ·  negaciones ${b.media} %  ·  mediana ${a.mediana} ms  ·  peor ${Math.max(a.peor, b.peor)} ms`);
}
