#!/usr/bin/env node
/**
 * El inventario de la ficha de la casa y de la persona (#939, fase 4): cada
 * dato guardado contra su registro (src/lib/registroFicha.js) y quién lo lee.
 *
 *   npm run ficha:inventario               resumen y fallos (solo código)
 *   npm run ficha:inventario -- --base     además, las claves que hay en la base
 *                                          (lectura de producción, sin escribir)
 *   npm run ficha:inventario -- --json     todo, en JSON
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inventario, ERRORES, DEUDA } from "./lib/inventarioFicha.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

async function clavesDeLaBase() {
  const { default: pg } = await import("pg");
  const { leerEnv } = await import("./lib/env.mjs");
  const { conexionDeConsulta } = await import("./lib/rolLectura.mjs");
  const c = new pg.Client({ connectionString: conexionDeConsulta(leerEnv).url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin read only");
    const casa = await c.query("select distinct k from household_state, jsonb_object_keys(state->'data') k");
    const persona = await c.query(`select distinct k from household_state,
      jsonb_array_elements(case when jsonb_typeof(state->'data'->'members') = 'array' then state->'data'->'members' else '[]' end) m,
      jsonb_object_keys(m) k`);
    await c.query("rollback");
    return { casa: new Set(casa.rows.map((r) => r.k)), persona: new Set(persona.rows.map((r) => r.k)) };
  } finally {
    await c.end();
  }
}

const guardadas = process.argv.includes("--base") ? await clavesDeLaBase() : null;
const inv = await inventario(raiz, { guardadas });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(inv, null, 1));
} else {
  const casa = inv.filas.filter((f) => f.id.startsWith("casa.")).length;
  console.log(`Datos registrados: ${inv.filas.length} (casa ${casa}, persona ${inv.filas.length - casa})${guardadas ? `; en la base: casa ${guardadas.casa.size}, persona ${guardadas.persona.size}` : ""}.`);
  console.log("\nErrores del registro (deben ser 0):", JSON.stringify(Object.fromEntries(ERRORES.map((f) => [f, inv.cifras[f]]))));
  for (const f of ERRORES) for (const x of inv.fallos[f]) console.log(`  [${f}] ${x}`);
  console.log("\nDeuda del modelo (solo baja):", JSON.stringify(Object.fromEntries(DEUDA.map((f) => [f, inv.cifras[f]]))));
  for (const f of DEUDA) console.log(`  ${f}: ${inv.fallos[f].join(", ")}`);
}
