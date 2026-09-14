/**
 * apply-migration.mjs — aplica UNA migración de supabase/migrations contra la
 * base de datos que apunte `SUPABASE_DB_URL`.
 *
 * ── Lo que hay que saber antes de usarlo ───────────────────────────────────
 * Solo hay UN proyecto de Supabase: la base que toca esto es la de PRODUCCIÓN,
 * con hogares, usuarios y menús reales. No existe una de staging aparte. El
 * script lo dice en voz alta antes de escribir nada, y por eso pide `--si`
 * para confirmar: un despiste con el nombre del fichero no debería alterar la
 * base de nadie.
 *
 * Todo va dentro de una transacción, así que una migración a medias no existe:
 * o entra entera o no entra. Y al terminar imprime el recuento de las tablas
 * de usuario para que se vea que no las ha tocado.
 *
 *   node scripts/apply-migration.mjs 0052_recipe_bases_aparte        # ensayo
 *   node scripts/apply-migration.mjs 0052_recipe_bases_aparte --si   # de verdad
 *
 * El ensayo abre la transacción, ejecuta la migración y hace ROLLBACK: sirve
 * para ver si el SQL es válido contra el esquema real sin dejar rastro.
 */
import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "supabase", "migrations");
const CONFIRMA = process.argv.includes("--si");
const nombre = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!nombre) {
  console.error("Falta el nombre de la migración. Disponibles (últimas 5):");
  for (const f of readdirSync(DIR).sort().slice(-5)) console.error(`   ${f.replace(/\.sql$/, "")}`);
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL. Carga el entorno:  set -a; . ./.env.local; set +a");
  process.exit(1);
}

const file = nombre.endsWith(".sql") ? nombre : `${nombre}.sql`;
const sql = readFileSync(join(DIR, file), "utf8");

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const uno = async (q) => (await client.query(q)).rows[0];
const antes = await uno("select count(*)::int n from information_schema.columns where table_name = 'recipes'");
const hogares = await uno("select count(*)::int n from public.households");
const menus = await uno("select count(*)::int n from public.user_menus");

console.log(`Base de datos: ${new URL(process.env.SUPABASE_DB_URL).hostname}`);
console.log(`  ES PRODUCCIÓN — ${hogares.n} hogares y ${menus.n} menús reales.`);
console.log(`Migración: ${file}`);
console.log(`Columnas de \`recipes\` ahora: ${antes.n}\n`);

try {
  await client.query("begin");
  await client.query(sql);
  if (CONFIRMA) {
    await client.query("commit");
    console.log("✅ aplicada y confirmada");
  } else {
    await client.query("rollback");
    console.log("🔎 ENSAYO: el SQL es válido contra el esquema real. No se ha cambiado nada.");
    console.log("   Para aplicarla de verdad, repite el comando con --si");
  }
} catch (err) {
  await client.query("rollback");
  console.error(`❌ revertida, no se ha cambiado nada: ${err.message}`);
  await client.end();
  process.exit(1);
}

const despues = await uno("select count(*)::int n from information_schema.columns where table_name = 'recipes'");
const hogaresDespues = await uno("select count(*)::int n from public.households");
console.log(`\nColumnas de \`recipes\`: ${antes.n} → ${despues.n}`);
console.log(`Hogares: ${hogares.n} → ${hogaresDespues.n} (esto no los toca)`);

await client.end();
