/**
 * El informe semanal de Lola: esta semana contra la anterior y contra los
 * objetivos (scripts/bot-objetivos.json). Solo números: nunca texto de nadie.
 *
 *   node scripts/bot-semanal.mjs                → los últimos 7 días contra los 7 anteriores
 *   node scripts/bot-semanal.mjs --hasta=2026-10-12   → la semana que acaba ese día (sin incluirlo)
 *   node scripts/bot-semanal.mjs --solo=grupo         → solo lo de los grupos (o --solo=privado)
 *
 * El informe trae siempre la tabla «Privado frente a grupo»; --solo sirve para
 * ver el semáforo entero de uno de los dos.
 *
 * De dónde lee:
 *   · OPS_DB_URL en el entorno (el workflow .github/workflows/bot-semanal.yml):
 *     la vista ops.bot_events (0066), sin textos.
 *   · si no, SUPABASE_DB_URL de .env.local: user_events directamente.
 *
 * Escribe .ops/informe-semanal.md (lo publica el workflow) y lo imprime.
 * Los huecos con su texto se miran aparte, en local: scripts/lola-feedback.mjs.
 */

import fs from "node:fs";
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { medir, informe, huecosDeLola, contarHuecos, medirPorLugar, lugarDe } from "./lib/bot-semana.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DIA = 86_400_000;
const hasta = arg("hasta") ? new Date(`${arg("hasta")}T00:00:00Z`) : new Date();
const desde = new Date(hasta - 7 * DIA);
const antes = new Date(hasta - 14 * DIA);
const iso = (d) => d.toISOString().slice(0, 10);

let url = process.env.OPS_DB_URL;
const vista = Boolean(url);
if (!url) {
  url = leerEnv("SUPABASE_DB_URL");
}
if (!url) throw new Error("Falta OPS_DB_URL (entorno) o SUPABASE_DB_URL (.env.local)");

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(
  vista
    ? "select created_at, event, metadata m from ops.bot_events where created_at >= $1 and created_at < $2 order by created_at"
    : "select created_at, event, metadata m from user_events where event like 'bot\\_%' and created_at >= $1 and created_at < $2 order by created_at",
  [antes, hasta],
);
await db.end();

const SOLO = ["grupo", "privado"].includes(arg("solo")) ? arg("solo") : null;
const eventos = rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), m: r.m ?? {} }))
  .filter((e) => !SOLO || lugarDe(e) === SOLO);
const de = (a, b) => eventos.filter((e) => e.created_at >= a.toISOString() && e.created_at < b.toISOString());
const objetivos = JSON.parse(fs.readFileSync(new URL("./bot-objetivos.json", import.meta.url), "utf8"));
const estaSemana = de(desde, hasta);
const previa = de(antes, desde);

const md = informe({
  actual: medir(estaSemana, objetivos),
  anterior: previa.length ? medir(previa, objetivos) : null,
  objetivos,
  // Solo el recuento: los huecos con texto se miran en local.
  huecos: contarHuecos(huecosDeLola(estaSemana, objetivos, { sinTexto: true })),
  lugares: SOLO ? null : medirPorLugar(estaSemana, objetivos),
  desde: iso(desde),
  hasta: iso(new Date(hasta - DIA)),
});

fs.mkdirSync(new URL("../.ops/", import.meta.url), { recursive: true });
const salida = SOLO ? `${md}\n\n_Solo los chats de tipo «${SOLO}»._` : md;
fs.writeFileSync(new URL("../.ops/informe-semanal.md", import.meta.url), `${salida}\n`);
console.log(salida);
