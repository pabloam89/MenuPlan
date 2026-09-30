/**
 * Re-evaluar los modelos con nuestras pruebas, no con los rankings: cada vez
 * que salga un modelo nuevo (o una vez al mes), esto dice si merece la pena
 * cambiar, con lo que de verdad hace Lola.
 *
 *   node scripts/modelos-evals.mjs
 *   node scripts/modelos-evals.mjs --lola=claude-sonnet-5,claude-opus-5-5 --router=claude-haiku-4-5-20251001
 *
 * Lola (scripts/bot-evals.mjs, ~0,75 $ por modelo grande) y el enrutador
 * (scripts/router-evals.mjs, céntimos), una pasada por modelo, y una tabla con
 * aciertos, coste y tiempos. Nada cambia solo: el modelo se cambia a mano
 * (BOT_MODELO, BOT_MODELO_RESERVA, BOT_ROUTER_MODELO en Vercel).
 *
 * Qué mirar:
 *   · Lola: aciertos primero; a igualdad, la mediana de tiempo (es lo que se nota).
 *   · Plan B (MODELO_RESERVA): que no baje mucho de Lola; es quien contesta
 *     cuando el principal está caído.
 *   · Enrutador: «rápida cuando tocaba Lola» tiene que ser 0; lo demás, secundario.
 */

import { spawn } from "node:child_process";

const lista = (k, porDefecto) => (process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? porDefecto).split(",").filter(Boolean);
const LOLA = lista("lola", "claude-sonnet-5,claude-haiku-4-5-20251001");
const ROUTER = lista("router", "claude-haiku-4-5-20251001");

function correr(script, env) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [script], { env: { ...process.env, ...env }, cwd: new URL("..", import.meta.url) });
    let salida = "";
    p.stdout.on("data", (d) => { salida += d; });
    p.stderr.on("data", (d) => { salida += d; });
    p.on("close", () => ok(salida));
  });
}

const filas = [];
for (const modelo of LOLA) {
  process.stdout.write(`Lola con ${modelo}… `);
  const s = await correr("scripts/bot-evals.mjs", { BOT_MODELO: modelo });
  const m = s.match(/(\d+)\/(\d+) bien · ~\$([\d.]+) · mediana ([\d.]+) s, máx ([\d.]+) s/);
  console.log(m ? "hecho" : "sin resumen (¿error?)");
  filas.push({ que: "Lola", modelo, aciertos: m ? `${m[1]}/${m[2]}` : "—", coste: m ? `$${m[3]}` : "—", tiempo: m ? `${m[4]} s (máx ${m[5]})` : "—" });
}
for (const modelo of ROUTER) {
  process.stdout.write(`Enrutador con ${modelo}… `);
  const s = await correr("scripts/router-evals.mjs", { BOT_ROUTER_MODELO: modelo });
  const m = s.match(/(\d+)\/(\d+) bien · rápida-cuando-tocaba-Lola: (\d+) · Lola-cuando-tocaba-rápida: (\d+) · mediana (\d+) ms, p90 (\d+) ms/);
  console.log(m ? "hecho" : "sin resumen (¿error?)");
  filas.push({ que: "Enrutador", modelo, aciertos: m ? `${m[1]}/${m[2]} (rápida-mal ${m[3]})` : "—", coste: "céntimos", tiempo: m ? `${m[5]} ms (p90 ${m[6]})` : "—" });
}
console.log();
console.table(filas);
