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
 *
 * `--si` se niega salvo que la migración esté ya en origin/staging, idéntica,
 * y tenga un ensayo de ese mismo contenido de hace menos de una hora (ver
 * scripts/lib/permisoAplicar.mjs). Con eso, una sesión puede aplicarla sin
 * Pablo; lo decidió él el 8 oct 2026, porque no hay otra base donde aplicar.
 */
import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import pg from "pg";
import { cargarEnv } from "./lib/env.mjs";
import { horaMadrid } from "./lib/hora.mjs";
import { VIGENCIA_MS, apuntarEnsayo, deStaging, leerEnsayo, motivosParaNoAplicar, olvidarEnsayo } from "./lib/permisoAplicar.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "supabase", "migrations");
const CONFIRMA = process.argv.includes("--si");
// Solo para lo que es de Pablo (CONTRAE, RLS o permisos de lo existente). La
// guardia niega `--pablo` a cualquier sesión: lo lanza él con `!`.
const PABLO = process.argv.includes("--pablo");
const nombre = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!nombre) {
  console.error("Falta el nombre de la migración. Disponibles (últimas 5):");
  for (const f of readdirSync(DIR).sort().slice(-5)) console.error(`   ${f.replace(/\.sql$/, "")}`);
  process.exit(1);
}
cargarEnv(["SUPABASE_DB_URL"]);
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.local o en el entorno");
  process.exit(1);
}

const file = nombre.endsWith(".sql") ? nombre : `${nombre}.sql`;
const sql = readFileSync(join(DIR, file), "utf8");
const base = file.replace(/\.sql$/, "");
const RAIZ = join(__dirname, "..");

if (CONFIRMA) {
  const no = motivosParaNoAplicar({ nombre: base, local: sql, enStaging: deStaging(RAIZ, base), ensayo: leerEnsayo(RAIZ, base), pablo: PABLO });
  if (no.length) {
    console.error(`No aplico ${base} en producción:\n  - ${no.join("\n  - ")}`);
    process.exit(1);
  }
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
// Lo que la migración cuenta con `raise notice` (filas tocadas, comprobaciones)
// sale aquí; sin esto, el ensayo solo decía «válido».
client.on("notice", (n) => console.log(`   [${n.severity ?? "NOTICE"}] ${n.message}`));

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
    olvidarEnsayo(RAIZ, base);
    console.log("✅ aplicada y confirmada");
    console.log(`   Ahora: márcala aplicada en supabase/ESTADO.md con su testigo y compruébalo con \`node scripts/verificar-estado.mjs --solo ${base.slice(0, 4)}\`.`);
  } else {
    await client.query("rollback");
    apuntarEnsayo(RAIZ, base, sql);
    console.log("🔎 ENSAYO: el SQL es válido contra el esquema real. No se ha cambiado nada.");
    // La hora límite, calculada aquí y en hora de Madrid: a mano salía mal (#210).
    console.log(`   Para aplicarla de verdad (si ya está en staging), repite el comando con --si antes de las ${horaMadrid(new Date(Date.now() + VIGENCIA_MS))} (hora de Madrid).`);
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
