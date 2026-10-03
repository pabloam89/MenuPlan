/**
 * El panel de Lola en local: una página con el semáforo de objetivos, el
 * primer texto de cada turno, las herramientas más lentas y los últimos
 * turnos. Para ir viendo las pruebas sin esperar al informe del lunes.
 *
 *   npm run bot:panel                 → últimos 7 días, y lo abre en el navegador
 *   npm run bot:panel -- --dias=1     → otra ventana
 *   npm run bot:panel -- --textos     → con lo que se escribió (solo en local: .ops/ no se sube)
 *   npm run bot:panel -- --no-abrir   → solo lo escribe
 *   npm run bot:panel -- --json=x.json  → de un fichero de eventos [{created_at, event, m}], sin base
 *
 * Lee SUPABASE_DB_URL de .env.local (Supabase → Connect → URI). Escribe
 * .ops/panel.html. Las cuentas son las del informe semanal (scripts/lib/bot-semana.mjs).
 */

import fs from "node:fs";
import { exec } from "node:child_process";
import { medir, semaforo, corregidos, pct } from "./lib/bot-semana.mjs";

const arg = (k) => process.argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
const valor = (k) => arg(k)?.split("=")[1];
const DIAS = Number(valor("dias") ?? 7);
const TEXTOS = Boolean(arg("textos"));

async function leerEventos() {
  if (valor("json")) return JSON.parse(fs.readFileSync(valor("json"), "utf8"));
  const env = fs.existsSync(new URL("../.env.local", import.meta.url)) ? fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8") : "";
  const url = process.env.SUPABASE_DB_URL || env.match(/^SUPABASE_DB_URL="?([^"\r\n]+)/m)?.[1]?.trim();
  if (!url) throw new Error("Falta SUPABASE_DB_URL en .env.local (Supabase → proyecto → Connect → URI)");
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows } = await db.query(
    "select created_at, event, metadata m from user_events where event like 'bot\\_%' and created_at > now() - make_interval(days => $1) order by created_at",
    [DIAS],
  );
  await db.end();
  return rows;
}

const eventos = (await leerEventos()).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), m: r.m ?? {} }));
const objetivos = JSON.parse(fs.readFileSync(new URL("./bot-objetivos.json", import.meta.url), "utf8"));
const medidas = medir(eventos, objetivos);
const corr = corregidos(eventos);

// Lo que pasó justo después de cada turno de Lola, para las marcas de la tabla.
const avisosDe = (e) => {
  const cerca = (ev) => eventos.filter((x) => x.event === ev && Math.abs(Date.parse(x.created_at) - Date.parse(e.created_at)) < 5000);
  const a = [];
  if (corr.has(e)) a.push("corregido");
  if (e.m.lola?.planB) a.push("plan B");
  if (cerca("bot_claimed_unsaved").length) a.push("dijo que guardó");
  if (cerca("bot_not_understood").length) a.push("no entiende");
  if (cerca("bot_supervisor").length) a.push("supervisor");
  if (e.m.error) a.push("error enrutador");
  return a;
};

const turnos = eventos.filter((e) => e.event === "bot_route" && !e.m.sombra).map((e) => ({
  t: e.created_at,
  camino: e.m.rapida ? "rapida" : "lola",
  modo: e.m.modo ?? null,
  confianza: Number.isFinite(Number(e.m.confianza)) ? Number(e.m.confianza) : null,
  primer: e.m.primer_ms ?? null,
  total: e.m.ms ?? null,
  router: e.m.router_ms ?? null,
  vueltas: e.m.lola?.vueltas ?? null,
  // Tiempo del modelo (sus llamadas menos las herramientas) y tokens de salida.
  modelo: Array.isArray(e.m.lola?.llamadas)
    ? {
      ms: Math.max(0, e.m.lola.llamadas.reduce((a, [ms]) => a + ms, 0) - (e.m.lola.herramientas ?? []).reduce((a, [, ms]) => a + ms, 0)),
      tokens: e.m.lola.llamadas.reduce((a, [, out]) => a + out, 0),
    }
    : null,
  herramientas: (e.m.lola?.herramientas ?? []).map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)} s`),
  avisos: avisosDe(e),
  ...(TEXTOS ? { texto: e.m.texto ?? null } : {}),
}));

const porHerramienta = new Map();
for (const e of eventos) for (const [n, ms] of e.m.lola?.herramientas ?? []) porHerramienta.set(n, [...(porHerramienta.get(n) ?? []), ms]);
const herramientas = [...porHerramienta].map(([n, xs]) => ({ n, veces: xs.length, p50: pct(xs, 50), p95: pct(xs, 95) }))
  .sort((a, b) => b.p95 - a.p95).slice(0, 10);

const datos = {
  generado: new Date().toISOString(),
  dias: DIAS,
  textos: TEXTOS,
  medidas,
  semaforo: semaforo(medidas, objetivos),
  objetivos,
  turnos,
  herramientas,
};

const html = fs.readFileSync(new URL("./lib/bot-panel.html", import.meta.url), "utf8")
  // JSON dentro de <script>: sin «</» que lo cierre antes de tiempo.
  .replace("/*__DATOS__*/null", JSON.stringify(datos).replace(/</g, "\\u003c"));
const salida = new URL("../.ops/panel.html", import.meta.url);
fs.mkdirSync(new URL("../.ops/", import.meta.url), { recursive: true });
fs.writeFileSync(salida, html);
const ruta = decodeURIComponent(salida.pathname).replace(/^\/([A-Za-z]:)/, "$1");
console.log(`${turnos.length} turnos en ${DIAS} días → ${ruta}`);
if (!arg("no-abrir")) {
  const abrir = process.platform === "win32" ? `start "" "${ruta}"` : process.platform === "darwin" ? `open "${ruta}"` : `xdg-open "${ruta}"`;
  exec(abrir);
}
