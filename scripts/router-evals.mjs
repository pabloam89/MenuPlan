/**
 * Pruebas del enrutador (api/_bot/router.js): ¿acierta el modo, decide bien
 * vía rápida o Lola, y saca los datos? Con el clasificador de verdad (Haiku).
 *
 *   node scripts/router-evals.mjs            → todos, una vez (~0,12-0,60 $ las 91)
 *   node scripts/router-evals.mjs --veces=3  → cada caso tres veces (estabilidad)
 *   node scripts/router-evals.mjs --tope=0.2 → para antes de pasar de 0,20 $ (salida 3)
 *
 * El tope por defecto y el del mes salen de scripts/lib/evals.mjs (topeDePasada).
 *
 * Lo que más importa no es el acierto global sino los DOS errores:
 *   · rápida cuando tocaba Lola (peligroso: se salta la conversación)
 *   · Lola cuando tocaba rápida (solo lento)
 */

import fs from "node:fs";
import { cargarEnv } from "./lib/env.mjs";
import { ESTIMADO_ROUTER, SALIDA, costeUsd, estimadoSiguiente, opcionEntero, opcionNumero, tokensDe, topeDePasada, apuntarOAvisar, puedeGastar } from "./lib/evals.mjs";

const ARGV = process.argv.slice(2);
let veces, TOPE, motivoTope = null;
try {
  veces = opcionEntero(ARGV, "veces") ?? 1;
  TOPE = topeDePasada(opcionNumero(ARGV, "tope"));
} catch (e) {
  // Un --tope mal escrito no puede correr sin tope: no se corre nada.
  console.error(e.message);
  process.exit(SALIDA.entrada);
}

cargarEnv(["ANTHROPIC_API_KEY"]);
const { clasificar, vaPorLaRapida, MODELO_ROUTER } = await import("../api/_bot/router.js");
const { casos } = JSON.parse(fs.readFileSync(new URL("./router-evals.json", import.meta.url), "utf8"));

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
let gastado = 0, llamadas = 0, parado = false;
const tokens = { entrada: 0, salida: 0, cache_leida: 0, cache_escrita: 0 };
const tiempos = [];
fuera: for (const c of casos) {
  for (let v = 0; v < veces; v++) {
    // El libro se vuelve a leer antes de cada llamada de pago: otra pasada puede haber gastado mientras tanto.
    const cupo = puedeGastar(gastado, TOPE, estimadoSiguiente(gastado, llamadas, ESTIMADO_ROUTER));
    if (!cupo.ok) { parado = true; motivoTope = cupo.motivo; break fuera; }
    const d = await clasificar({ texto: c.texto, contexto: contexto(c) });
    llamadas++;
    // El enrutador cachea sus reglas a 5 min (router.js), no a 1 h como Lola.
    const coste = costeUsd(d.uso, MODELO_ROUTER, { ttl: "5m" });
    gastado += coste;
    apuntarOAvisar({ script: "router-evals", coste_usd: coste });
    const t = tokensDe(d.uso);
    for (const k of Object.keys(t)) tokens[k] += t[k];
    tiempos.push(d.ms);
    // Los casos de chat de grupo llevan esGrupo (y variosAutores si se juntan mensajes de varias personas).
    const rapida = vaPorLaRapida(d, { esGrupo: Boolean(c.esGrupo), variosAutores: Boolean(c.variosAutores) });
    const fallos = [];
    // «modo» puede dar alternativas («lola|cambiar»): en algunos casos lo que importa es la ruta, no el modo.
    if (!c.modo.split("|").includes(d.modo)) fallos.push(`modo ${d.modo} (esperado ${c.modo})`);
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
    console.log(`${fallos.length ? "✗" : "✓"} ${c.esGrupo ? "[grupo] " : ""}«${c.texto.slice(0, 60).replace(/\n/g, " | ")}» → ${d.modo} ${d.confianza.toFixed(2)} ${rapida ? "⚡" : "🧠"} ${d.ms} ms · ${t.entrada + t.cache_leida + t.cache_escrita}+${t.salida} tok${fallos.length ? `\n    ${fallos.join(" · ")}` : ""}`);
  }
}
tiempos.sort((a, b) => a - b);
const porLlamada = (x) => (llamadas ? Math.round(x / llamadas) : 0);
// scripts/modelos-evals.mjs lee esta línea: no cambies su forma, añade detrás.
console.log(`\n${bien}/${total} bien · rápida-cuando-tocaba-Lola: ${rapidaMal} · Lola-cuando-tocaba-rápida: ${lentaMal} · mediana ${tiempos[Math.floor(tiempos.length / 2)] ?? 0} ms, p90 ${tiempos[Math.floor(tiempos.length * 0.9)] ?? 0} ms · ~$${gastado.toFixed(3)} · ${MODELO_ROUTER}`);
console.log(`Por llamada: ${porLlamada(tokens.entrada)} entrada · ${porLlamada(tokens.salida)} salida · ${porLlamada(tokens.cache_leida)} caché leída · ${porLlamada(tokens.cache_escrita)} caché escrita · $${(llamadas ? gastado / llamadas : 0).toFixed(4)} (${llamadas} llamadas)`);
if (parado) {
  console.log(`tope_evals script: router-evals motivo: ${motivoTope} gastado_usd: ${gastado.toFixed(3)} tope_usd: ${TOPE.toFixed(2)}`);
  console.log(`\nPARADO POR EL TOPE: gastado $${gastado.toFixed(3)} de $${TOPE.toFixed(2)}; corridos ${total} de ${casos.length * veces} (salida ${SALIDA.tope}).`);
  process.exitCode = SALIDA.tope;
} else {
  process.exitCode = rapidaMal ? SALIDA.fallos : SALIDA.bien;
}
