/**
 * Cómo va el bot de verdad, turno a turno (user_events, event = bot_route):
 * cuánto tarda en salir el primer texto, en qué se va el tiempo de Lola y
 * cuánto cuesta cada turno, incluidos los de Lola que se cancelan cuando gana
 * la vía rápida.
 *
 *   node scripts/bot-medidas.mjs          → últimos 7 días
 *   node scripts/bot-medidas.mjs 30       → últimos 30
 *
 * Lee SUPABASE_DB_URL de .env.local. Los turnos anteriores al 1 oct 2026 no
 * traen medidas (primer_ms, lola…): cuentan solo para el total.
 *
 * Precios en USD por millón de tokens: REVISARLOS contra la tarifa publicada
 * de Anthropic. Se aplican aquí, al leer, y no al apuntar: si cambian, basta
 * con tocar esta tabla.
 */

import fs from "node:fs";
import pg from "pg";

const PRECIOS = {
  haiku: { in: 1, out: 5, cr: 0.1, cw: 1.25 },
  sonnet: { in: 3, out: 15, cr: 0.3, cw: 3.75 },
  opus: { in: 5, out: 25, cr: 0.5, cw: 6.25 },
};
const precioDe = (modelo = "") => PRECIOS[Object.keys(PRECIOS).find((k) => String(modelo).includes(k)) ?? "sonnet"];
const usd = (u, p) => (u ? ((u.in ?? 0) * p.in + (u.out ?? 0) * p.out + (u.cr ?? 0) * p.cr + (u.cw ?? 0) * p.cw) / 1e6 : 0);

const dias = Number(process.argv[2] ?? 7);
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const dbUrl = env.match(/^SUPABASE_DB_URL="?([^"\r\n]+)/m)?.[1];
if (!dbUrl) throw new Error("Falta SUPABASE_DB_URL en .env.local");
const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  "select created_at, metadata m from user_events where event = 'bot_route' and created_at > now() - make_interval(days => $1) order by created_at",
  [dias],
);
await c.end();

const turnos = rows.map((r) => r.m).filter((m) => !m.sombra);
const pct = (xs, p) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
};
const s = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const linea = (etiqueta, xs) => `  ${etiqueta.padEnd(26)} p50 ${s(pct(xs, 50)).padStart(7)}   p95 ${s(pct(xs, 95)).padStart(7)}   (n=${xs.filter(Number.isFinite).length})`;

const rapidas = turnos.filter((m) => m.rapida);
const deLola = turnos.filter((m) => !m.rapida);
console.log(`Bot — últimos ${dias} días: ${turnos.length} turnos (${rapidas.length} por la vía rápida, ${deLola.length} de Lola)\n`);

console.log("Tiempos");
console.log(linea("Primer texto, vía rápida", rapidas.map((m) => m.primer_ms ?? m.ms)));
console.log(linea("Primer texto, Lola", deLola.map((m) => m.primer_ms)));
console.log(linea("Turno entero, Lola", deLola.map((m) => m.ms)));
console.log(linea("Enrutador", turnos.map((m) => m.router_ms)));
console.log(linea("Lola (modelo + herramientas)", deLola.map((m) => m.lola?.ms)));

const conLola = deLola.filter((m) => m.lola);
if (conLola.length) {
  const herr = new Map();
  for (const m of conLola) for (const [n, ms] of m.lola.herramientas ?? []) herr.set(n, [...(herr.get(n) ?? []), ms]);
  console.log("\nLola");
  console.log(`  vueltas del modelo: media ${(conLola.reduce((a, m) => a + (m.lola.vueltas ?? 0), 0) / conLola.length).toFixed(1)}`);
  console.log(`  plan B (contestó la reserva): ${conLola.filter((m) => m.lola.planB).length} · «dijo que guardó sin guardar»: ${conLola.filter((m) => m.lola.corregido).length}`);
  const leido = conLola.reduce((a, m) => a + (m.lola.uso?.cr ?? 0), 0);
  const todo = conLola.reduce((a, m) => a + (m.lola.uso?.in ?? 0) + (m.lola.uso?.cr ?? 0) + (m.lola.uso?.cw ?? 0), 0);
  console.log(`  entrada leída de caché: ${todo ? Math.round((100 * leido) / todo) : 0} %`);
  console.log("  herramientas (las más lentas en total):");
  for (const [n, xs] of [...herr].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)).slice(0, 8)) {
    console.log(`    ${n.padEnd(22)} ${String(xs.length).padStart(4)} veces   p50 ${s(pct(xs, 50))}   p95 ${s(pct(xs, 95))}`);
  }
}

// Coste. Lo cancelado no trae uso (se corta antes de acabar): se estima con la
// mediana de lo que entra en la primera llamada de Lola en los turnos que sí acabaron.
const primeras = conLola.map((m) => m.lola.primera).filter(Boolean);
const mediana = (k) => pct(primeras.map((p) => p[k] ?? 0), 50) ?? 0;
const estimadaCancelada = { in: mediana("in"), cr: mediana("cr"), cw: mediana("cw"), out: 0 };
let router = 0;
let lola = 0;
let canceladas = 0;
let nCanceladas = 0;
for (const m of turnos) {
  router += usd(m.router_uso, PRECIOS.haiku);
  if (m.lola?.uso && !m.lola_cancelada) lola += usd(m.lola.uso, precioDe(m.lola.modelo));
  if (m.lola_cancelada) { nCanceladas++; canceladas += m.lola?.uso ? usd(m.lola.uso, precioDe(m.lola.modelo)) : usd(estimadaCancelada, PRECIOS.sonnet); }
}
const total = router + lola + canceladas;
const conMedida = turnos.filter((m) => "lola_cancelada" in m).length;
console.log(`\nCoste (de los ${conMedida} turnos con medida; precios por revisar en el script)`);
console.log(`  enrutador (Haiku)       $${router.toFixed(4)}`);
console.log(`  Lola                    $${lola.toFixed(4)}`);
console.log(`  Lola cancelada (estim.) $${canceladas.toFixed(4)}   (${nCanceladas} turnos)`);
console.log(`  total                   $${total.toFixed(4)}   → $${(total / Math.max(1, conMedida)).toFixed(4)} por turno, $${(total / dias).toFixed(3)} al día`);
