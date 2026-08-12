import { readFileSync } from "fs";
import { Redis } from "@upstash/redis";

const env = {};
for (const line of readFileSync(".env.prod", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const redis = new Redis({
  url: env.UPSTASH_REDIS_KV_REST_API_URL,
  token: env.UPSTASH_REDIS_KV_REST_API_TOKEN,
});

const [states, reasons] = await Promise.all([
  redis.hgetall("dish:approvals"),
  redis.hgetall("dish:reasons"),
]);

const s = states ?? {};
const r = reasons ?? {};
const entries = Object.entries(s);
const rejected = entries.filter(([, v]) => v === "rejected");
const approved = entries.filter(([, v]) => v === "approved");

console.log(`Total revisadas: ${entries.length}`);
console.log(`Aprobadas: ${approved.length}`);
console.log(`Rechazadas: ${rejected.length}\n`);

// Load catalog for names
let byId = {};
try {
  const cat = JSON.parse(readFileSync("public/catalog.json", "utf8"));
  byId = Object.fromEntries(cat.map((c) => [c.combo_id, c]));
} catch {}

console.log("############ RECHAZADAS (mismatches reales) ############\n");
for (const [id] of rejected.sort((a, b) => a[0].localeCompare(b[0]))) {
  const name = byId[id]?.name ?? "(sin nombre en catálogo)";
  const reason = r[id] ? ` — motivo: ${r[id]}` : " — (sin motivo)";
  console.log(`${id}  ·  ${name}${reason}`);
}
