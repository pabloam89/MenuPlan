/**
 * Cuánto cuesta el bot de verdad: uso y coste por casa y mes (bot_usage).
 *
 *   node scripts/bot-coste.mjs            → este mes
 *   node scripts/bot-coste.mjs 2026-10    → ese mes
 *
 * Lee SUPABASE_DB_URL de .env.local. Los precios son por millón de tokens y
 * hay que revisarlos contra la tarifa publicada de Anthropic del modelo que
 * use api/_bot/agente.js (MODELO); la voz (Groq) no entra, es céntimos.
 */

import pg from "pg";
import { leerEnv } from "./lib/env.mjs";

const PRECIO = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }; // USD / 1M tokens

const dbUrl = leerEnv("SUPABASE_DB_URL", { obligatoria: true });

const mes = (process.argv[2] ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()).slice(0, 7)) + "-01";

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `select u.household_id, h.name, u.messages, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens
     from bot_usage u left join households h on h.id = u.household_id
    where u.month = $1 order by u.messages desc`,
  [mes],
);
await c.end();

const coste = (r) => (
  Number(r.input_tokens) * PRECIO.input + Number(r.output_tokens) * PRECIO.output
  + Number(r.cache_read_tokens) * PRECIO.cacheRead + Number(r.cache_write_tokens) * PRECIO.cacheWrite
) / 1e6;

console.log(`Bot — ${mes.slice(0, 7)} (${rows.length} casas)\n`);
let total = 0;
let mensajes = 0;
for (const r of rows) {
  const usd = coste(r);
  total += usd;
  mensajes += r.messages;
  console.log(`${(r.name ?? r.household_id).slice(0, 28).padEnd(28)} ${String(r.messages).padStart(5)} msgs  $${usd.toFixed(3).padStart(8)}  ($${(usd / Math.max(1, r.messages)).toFixed(4)}/msg)`);
}
console.log(`\nTotal: ${mensajes} mensajes, $${total.toFixed(2)}${mensajes ? ` — $${(total / mensajes).toFixed(4)} por mensaje` : ""}`);
