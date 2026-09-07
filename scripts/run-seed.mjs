/**
 * run-seed.mjs — pasa ficheros de seed a Supabase por conexión directa.
 *
 * Existe porque pegar los seeds a mano en el editor SQL ha fallado tres veces
 * seguidas, y siempre por lo mismo: el orden. `recipe_ingredients` apunta a
 * `ingredients`, así que si la tabla de destino va por detrás, la clave ajena
 * revienta a mitad y te quedas con el catálogo a medias y `catalog_meta` ya
 * subido — que es el peor sitio donde quedarse, porque la app entonces confía
 * en un remoto incompleto.
 *
 * Cada fichero va en su propia TRANSACCIÓN: o entra entero o no entra nada. Un
 * seed a medias es lo que hay que evitar por encima de todo.
 *
 * Necesita SUPABASE_DB_URL en .env.local (la del *session pooler*: la conexión
 * directa de Supabase es solo IPv6 y no resuelve desde una red IPv4).
 *
 * Uso:
 *   node scripts/run-seed.mjs seed_ingredients.sql seed_recipe_ingredients.sql
 *   node scripts/run-seed.mjs --check          (solo cuenta, no escribe)
 */

import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPA = join(__dirname, "..", "supabase");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("❌ Falta SUPABASE_DB_URL en .env.local");
  process.exit(1);
}

const cliente = () => new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function contar(c) {
  const una = async (s) => (await c.query(s)).rows[0].n;
  return {
    recetas: await una("select count(*)::int n from recipes"),
    ingredientes: await una("select count(*)::int n from ingredients"),
    lineas: await una("select count(*)::int n from recipe_ingredients"),
    fotos: await una("select count(*)::int n from dish_images"),
    version: (await c.query("select version from catalog_meta where id='recipes'")).rows[0]?.version,
  };
}

const ficheros = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const soloCheck = process.argv.includes("--check");

const c = cliente();
await c.connect();

const antes = await contar(c);
console.log("Antes:", JSON.stringify(antes));

if (soloCheck || ficheros.length === 0) {
  console.log("\n(--check: no se ha escrito nada)");
  await c.end();
  process.exit(0);
}

/**
 * Antes de cargar recipe_ingredients: ¿están en la BD todos los ingredientes
 * que va a nombrar?
 *
 * Esta comprobación NO puede hacerse al generar los ficheros. El resolutor solo
 * devuelve ids del propio catálogo, así que los dos .sql locales siempre cuadran
 * entre sí — el desajuste vive en la BASE DE DATOS, cuando se carga uno de los
 * dos y el otro no. Pasó exactamente así: faltaban clara-de-huevo, endivia,
 * salmonete y yema-de-huevo, y la carga murió con un 23503 a mitad.
 *
 * Comprobarlo antes cuesta una consulta y evita una carga rota.
 */
async function faltanIngredientes(c, sql) {
  const ids = new Set();
  for (const m of sql.matchAll(/^\s*\('[^']+', \d+, '([^']+)'/gm)) ids.add(m[1]);
  if (ids.size === 0) return [];
  const { rows } = await c.query("select id from ingredients where id = any($1)", [[...ids]]);
  const hay = new Set(rows.map((r) => r.id));
  return [...ids].filter((id) => !hay.has(id));
}

for (const f of ficheros) {
  const sql = readFileSync(join(SUPA, f), "utf8");
  process.stdout.write(`\n${f} (${(sql.length / 1024).toFixed(0)} KB)… `);

  if (f.includes("recipe_ingredients")) {
    const faltan = await faltanIngredientes(c, sql);
    if (faltan.length > 0) {
      console.log("❌");
      console.log(`   Nombra ${faltan.length} ingrediente/s que NO están en la BD:`);
      for (const x of faltan.slice(0, 10)) console.log(`     ${x}`);
      if (faltan.length > 10) console.log(`     … y ${faltan.length - 10} más`);
      console.log("   Pasa seed_ingredients.sql primero. No se ha tocado nada.");
      break;
    }
  }

  try {
    await c.query("begin");
    await c.query(sql);
    await c.query("commit");
    console.log("✅");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.log(`❌ ${e.message?.slice(0, 200)}`);
    console.log("   (rollback hecho — ese fichero no ha dejado nada a medias)");
    break;
  }
}

const despues = await contar(c);
console.log("\nDespués:", JSON.stringify(despues));
for (const k of Object.keys(antes)) {
  if (antes[k] !== despues[k]) console.log(`  ${k}: ${antes[k]} → ${despues[k]}`);
}
await c.end();
