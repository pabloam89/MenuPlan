#!/usr/bin/env node
/**
 * Una consulta de solo lectura a producción: `npm run consulta -- "select …"`.
 *
 * Autorizada de forma permanente (CLAUDE.md, «Qué se le pregunta a Pablo»):
 * lee y no escribe. Tres barreras: el texto (scripts/lib/consulta.mjs), una
 * transacción `read only` que Postgres hace cumplir aunque algo se colara, y un
 * rollback al final. Tope de 15 s y de 200 filas. Sin datos de familias en un
 * issue ni en un PR: lo que salga se resume en cifras.
 */
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { motivoParaNoLeer } from "./lib/consulta.mjs";

const sql = process.argv.slice(2).join(" ").trim();
const no = motivoParaNoLeer(sql);
if (no) {
  console.error(`No la lanzo: ${no}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: leerEnv("SUPABASE_DB_URL", { obligatoria: true }), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("set session characteristics as transaction read only");
  await client.query("begin read only");
  await client.query("set local statement_timeout = '15s'");
  const r = await client.query(sql);
  const filas = r.rows ?? [];
  if (filas.length) console.table(filas.slice(0, 200));
  console.log(`${filas.length} fila(s)${filas.length > 200 ? " (enseño las 200 primeras)" : ""}.`);
} catch (e) {
  console.error(`La base dice: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
  await client.end();
}
