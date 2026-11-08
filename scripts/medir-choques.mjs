#!/usr/bin/env node
/**
 * Cuántos menús vivos (semanas que no han pasado, del menú activo) tienen un
 * plato que choca con alguien de su grupo, con la misma puerta que el motor
 * (choquesDelPlan, #958). Separa los que chocan con algo DICHO de alguien
 * (alergia, dieta, estado) de los que solo chocan con la precaución de una
 * casa sin revisar (el motor esquiva los 14 alérgenos). Solo lee, con el
 * usuario de solo lectura, y solo cuenta: sin datos de familias.
 *
 *   npx vite-node scripts/medir-choques.mjs
 */
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { conexionDeConsulta } from "./lib/rolLectura.mjs";
import { choquesDelPlan } from "../src/lib/aiPlanner.js";
import { choquesDeReceta } from "../src/lib/restriccionesReceta.js";
import { recipeCatalogById } from "../src/data/recipeCatalog.js";
import { membersOfGroup } from "../src/lib/groups.js";

const { url } = conexionDeConsulta((k) => leerEnv(k), { admin: false });
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();
try {
  await cliente.query("begin transaction read only");
  const { rows } = await cliente.query(`
    select w.household_id, w.week_start, w.plan, s.state->'data' as data
    from user_menu_weeks w
    join user_menus m on m.id = w.menu_id and m.is_active
    join household_state s on s.household_id = w.household_id
    where w.week_end >= (now() at time zone 'Europe/Madrid')::date`);
  let semanas = 0, conChoque = 0, platos = 0, declarados = 0;
  const casas = new Set();
  for (const r of rows) {
    semanas++;
    const data = r.data ?? {};
    const c = choquesDelPlan(data, r.plan ?? {});
    if (!c.length) continue;
    conChoque++;
    platos += c.length;
    casas.add(r.household_id);
    for (const x of c) {
      const g = (data.groups ?? []).find((gg) => gg.id === x.groupId);
      const gente = { ...data, members: membersOfGroup(g, data.members ?? []) };
      if (choquesDeReceta(recipeCatalogById[x.recipeId.split("__").pop()], gente).some((k) => !k.adapta)) declarados++;
    }
  }
  console.log(JSON.stringify({ semanas, conChoque, platos, declarados, casas: casas.size }));
} finally {
  await cliente.query("rollback").catch(() => {});
  await cliente.end();
}
