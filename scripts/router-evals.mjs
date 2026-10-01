/**
 * Pruebas del enrutador (api/_bot/router.js): ¿acierta el modo, decide bien
 * vía rápida o Lola, y saca los datos? Con el clasificador de verdad (Haiku).
 *
 *   node scripts/router-evals.mjs            → todos, una vez
 *   node scripts/router-evals.mjs --veces=3  → cada caso tres veces (estabilidad)
 *
 * Lo que más importa no es el acierto global sino los DOS errores:
 *   · rápida cuando tocaba Lola (peligroso: se salta la conversación)
 *   · Lola cuando tocaba rápida (solo lento)
 */

import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
process.env.ANTHROPIC_API_KEY ||= env.match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)/m)?.[1]?.trim();
const { clasificar, vaPorLaRapida } = await import("../api/_bot/router.js");
const { casos } = JSON.parse(fs.readFileSync(new URL("./router-evals.json", import.meta.url), "utf8"));
const veces = Number(process.argv.find((a) => a.startsWith("--veces="))?.split("=")[1] ?? 1);

const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const leer = (o, ruta) => ruta.split(".").reduce((x, k) => x?.[k], o);
const contexto = (c) => ({
  ahora: "miércoles, 30 de septiembre de 2026, 18:45",
  personas: ["Pablo (37)", "Isa (36)", "Leo (6)", "Cova (1)"],
  grupos: ["Familia", "Bebé"],
  hayMenu: true,
  ultimaDeLola: c.ultima ?? null,
  anteriorDelUsuario: c.anterior ?? null,
});

let bien = 0, total = 0, rapidaMal = 0, lentaMal = 0;
const tiempos = [];
for (const c of casos) {
  for (let v = 0; v < veces; v++) {
    const d = await clasificar({ texto: c.texto, contexto: contexto(c) });
    tiempos.push(d.ms);
    const rapida = vaPorLaRapida(d);
    const fallos = [];
    if (d.modo !== c.modo) fallos.push(`modo ${d.modo} (esperado ${c.modo})`);
    if (rapida !== c.rapida) {
      fallos.push(rapida ? "RÁPIDA cuando tocaba Lola" : "a Lola cuando tocaba rápida");
      if (rapida) rapidaMal++; else lentaMal++;
    }
    for (const [ruta, esperado] of Object.entries(c.datos ?? {})) {
      const valor = leer(d.datos, ruta);
      if (!normal(esperado).split("|").some((alt) => normal(JSON.stringify(valor ?? "")).includes(alt))) fallos.push(`${ruta}=${JSON.stringify(valor)} (esperado «${esperado}»)`);
    }
    if (d.error) fallos.push(`error: ${d.error}`);
    total++;
    if (!fallos.length) bien++;
    console.log(`${fallos.length ? "✗" : "✓"} «${c.texto.slice(0, 60)}» → ${d.modo} ${d.confianza.toFixed(2)} ${rapida ? "⚡" : "🧠"} ${d.ms} ms${fallos.length ? `\n    ${fallos.join(" · ")}` : ""}`);
  }
}
tiempos.sort((a, b) => a - b);
console.log(`\n${bien}/${total} bien · rápida-cuando-tocaba-Lola: ${rapidaMal} · Lola-cuando-tocaba-rápida: ${lentaMal} · mediana ${tiempos[Math.floor(tiempos.length / 2)]} ms, p90 ${tiempos[Math.floor(tiempos.length * 0.9)]} ms`);
process.exitCode = rapidaMal ? 1 : 0;
