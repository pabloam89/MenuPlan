/**
 * Paso 1 de «personas a tabla» (migración 0079): copia los comensales y los
 * grupos de household_state.state a las tablas persona, persona_alergia,
 * persona_intolerancia, persona_estado, grupo y grupo_persona.
 *
 * No cambia el JSON ni lo que leen el bot y la app. Es idempotente: cada casa
 * se borra y se vuelve a copiar dentro de una sola transacción (RPC), así que
 * relanzarlo tras uno interrumpido es seguro.
 *
 *   node --env-file=.env.local scripts/backfill-personas.mjs [--dry-run] [--casa <uuid>]
 *
 * Env: SUPABASE_URL (o VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY (o
 * SUPABASE_SECRET_KEY). Las tablas nuevas solo las toca el servidor.
 */
import { createClient } from "@supabase/supabase-js";
import { filasDeCasa } from "../src/lib/personasTabla.js";

const DRY_RUN = process.argv.includes("--dry-run");
const casaIdx = process.argv.indexOf("--casa");
const SOLO_CASA = casaIdx >= 0 ? process.argv[casaIdx + 1] : null;

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Falta SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (pasa --env-file=.env.local)");
  process.exit(1);
}
const sb = createClient(url, key);

// Lee todas las casas con estado; con --casa, solo esa.
let consulta = sb.from("household_state").select("household_id, state");
if (SOLO_CASA) consulta = consulta.eq("household_id", SOLO_CASA);
const { data: casas, error } = await consulta;
if (error) {
  console.error("Lectura fallida:", error.message);
  process.exit(1);
}

let total = { casas: 0, personas: 0, grupos: 0, avisos: 0 };
for (const fila of casas ?? []) {
  const f = filasDeCasa(fila.household_id, fila.state);
  total.casas++;
  total.personas += f.personas.length;
  total.grupos += f.grupos.length;
  total.avisos += f.avisos.length;
  for (const a of f.avisos) console.warn(`[${fila.household_id}] ${a}`);

  if (DRY_RUN) {
    console.log(`[dry-run] ${fila.household_id}: ${f.personas.length} personas, ${f.grupos.length} grupos`);
    continue;
  }
  // Una transacción por casa: la RPC borra lo que hubiera y vuelve a insertar.
  const { error: e } = await sb.rpc("persona_sincronizar_casa", {
    p_household: fila.household_id,
    p_filas: f,
  });
  if (e) {
    console.error(`[${fila.household_id}] fallo al copiar: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log(`${DRY_RUN ? "[dry-run] " : ""}casas ${total.casas} · personas ${total.personas} · grupos ${total.grupos} · avisos ${total.avisos}`);
