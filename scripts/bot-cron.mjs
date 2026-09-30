/**
 * Programa (o reprograma) el job de pg_cron que manda los recordatorios del
 * bot: cada 5 minutos, POST a /api/bot/recordatorios con el secreto.
 *
 *   node scripts/bot-cron.mjs                    → contra staging
 *   node scripts/bot-cron.mjs https://otra.url   → contra otro despliegue
 *   node scripts/bot-cron.mjs --quitar           → lo borra
 *
 * Lee SUPABASE_DB_URL y BOT_CRON_SECRET de .env.local (el mismo secreto tiene
 * que estar en Vercel). Aplica también la 0062 (extensiones), que es idempotente.
 */

import fs from "node:fs";
import pg from "pg";

const NOMBRE = "bot-recordatorios";
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const leer = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]+)`, "m"))?.[1]?.trim();
const dbUrl = leer("SUPABASE_DB_URL");
const secreto = leer("BOT_CRON_SECRET");
if (!dbUrl || !secreto) throw new Error("Faltan SUPABASE_DB_URL o BOT_CRON_SECRET en .env.local");
if (!/^[A-Za-z0-9]+$/.test(secreto)) throw new Error("BOT_CRON_SECRET solo con letras y números");

const quitar = process.argv.includes("--quitar");
const base = (process.argv.find((a) => a.startsWith("https://")) ?? "https://homenu-staging.vercel.app").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error(`URL rara: ${base}`);

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(fs.readFileSync(new URL("../supabase/migrations/0062_bot_cron.sql", import.meta.url), "utf8"));
  await c.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [NOMBRE]);
  if (!quitar) {
    const llamada = `select net.http_post(
      url := '${base}/api/bot/recordatorios',
      headers := jsonb_build_object('Authorization', 'Bearer ${secreto}', 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    )`;
    await c.query("select cron.schedule($1, '*/5 * * * *', $2)", [NOMBRE, llamada]);
  }
  const { rows } = await c.query("select jobname, schedule, active from cron.job where jobname = $1", [NOMBRE]);
  console.log(quitar ? "Job borrado." : `Job programado contra ${base}:`, rows);
} finally {
  await c.end();
}
