/**
 * migrar-ids-uuid.mjs — pasa los ids de persona y de grupo a UUID, en todas
 * partes (Pablo, 7 oct 2026: «UUID 100 %, migramos y a volar»).
 *
 * ── Lo que hay que saber antes de usarlo ───────────────────────────────────
 * Solo hay UNA base: la de producción (como apply-migration.mjs). Sin `--si`
 * es un ensayo: cada casa va en su transacción y se deshace al final; imprime
 * qué cambiaría y dónde. Con `--si`, antes de tocar nada copia las tablas a un
 * esquema `respaldo_uuid_<fecha>`, y cada casa se guarda en su transacción.
 *
 *   set -a; . ./.env.local; set +a
 *   node scripts/migrar-ids-uuid.mjs              # ensayo
 *   node scripts/migrar-ids-uuid.mjs --si         # de verdad
 *   node scripts/migrar-ids-uuid.mjs --casa <id>  # solo esa casa
 *
 * ── Qué hace, por casa ─────────────────────────────────────────────────────
 * 1. Mapa viejo → UUID con los ids de hoy (data.members[].id, data.groups[].id).
 *    Los que ya son UUID se quedan. Los que no se pueden reemplazar con
 *    seguridad (cortos o solo cifras) paran la casa: se arreglan a mano.
 * 2. Reescribe esos ids como TOKEN —el id entero, entre inicio/fin o
 *    separadores | : _ @ - — en todas las cadenas Y en todas las claves de:
 *    household_state.state (JSON entero: data, menuPlan, shopping, aiRecipes,
 *    rosters…), user_menu_weeks (plan, schedule, shopping), user_menu_recipes
 *    (recipe_id), bot_tareas (clave, para_member, asignado_member),
 *    bot_messages.content, y lo de su titular: cookings, shared_menus, user_state.
 *    El inventario (7 oct) encontró ids como valor, como clave, como primera
 *    parte de «M|Día|Comida», como prefijo «G__receta», en «alergias:M» y
 *    dentro de ids de la compra «día-comida-G-…»: un token los cubre todos sin
 *    tener que conocer cada ruta (rosters y copias incluidas).
 * 3. Sube bot_rev: las apps abiertas recargan de la nube en vez de guardar su
 *    copia con los ids viejos (los guardados van condicionados a la versión).
 * 4. Marca como usadas las fotos de deshacer abiertas (restaurarían ids viejos).
 * 5. Rehace persona/grupo (0079) desde el JSON nuevo con persona_reemplazar_casa.
 * 6. Comprueba: todo memberId, toda clave de horario y todo grupo del plan
 *    resuelven a ids nuevos; ninguna aparición de un id viejo queda; persona y
 *    grupo coinciden con el JSON. Si algo falla, esa casa no se guarda.
 *
 * Lo que NO toca: ids huérfanos (de personas o grupos que ya no existen: no hay
 * a qué mapearlos y no estorban), ids de invitado (inv_…, _de_fuera), user_events.
 */
import crypto from "node:crypto";
import pg from "pg";
import { filasDeCasa } from "../src/lib/personasTabla.js";

const CONFIRMA = process.argv.includes("--si");
const iCasa = process.argv.indexOf("--casa");
const SOLO = iCasa >= 0 ? process.argv[iCasa + 1] : null;
// --repaso <esquema>: vuelve a pasar con el mapa guardado en ese respaldo, para los ids
// viejos que una app antigua haya reintroducido después. Con --si guarda.
const iRep = process.argv.indexOf("--repaso");
const REPASO = iRep >= 0 ? process.argv[iRep + 1] : null;
if (REPASO && !/^respaldo_uuid_\d{8}$/.test(REPASO)) {
  console.error("--repaso espera el nombre del esquema de respaldo (respaldo_uuid_AAAAMMDD)");
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL. Carga el entorno:  set -a; . ./.env.local; set +a");
  process.exit(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEP = "[|:_@\\-]";
// Claves cuyo valor es texto libre (la conversación con Lola): no se tocan. Un id corto
// entre guiones podría casar con una palabra (menuplan-05, 7 oct).
const TEXTO_LIBRE = new Set(["texto", "text", "pregunta", "respuesta", "oido", "frase"]);
// jsonb siempre como texto: pg convierte un array JS en array de Postgres, no en JSON.
const J = (v) => (v == null ? null : JSON.stringify(v));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Un id viejo que se puede buscar como token sin riesgo de tocar otra cosa. */
const seguro = (id) => typeof id === "string" && id.length >= 5 && !/^\d+$/.test(id);

/** Reescritor de tokens para un mapa {viejo: nuevo}; cuenta por ruta. */
function reescritor(mapa) {
  const viejos = Object.keys(mapa).sort((a, b) => b.length - a.length);
  if (!viejos.length) return { str: (s) => s, json: (v) => v, cuenta: {}, quedan: () => 0 };
  const re = new RegExp(`(^|${SEP})(${viejos.map(esc).join("|")})(?=$|${SEP})`, "g");
  const cuenta = {};
  const str = (s, ruta) => {
    if (typeof s !== "string") return s;
    return s.replace(re, (_m, pre, id) => {
      const k = ruta.replace(/\[\d+\]/g, "[]").replace(/\.[0-9a-f-]{36}(?=\.|$)/gi, ".<uuid>");
      cuenta[k] = (cuenta[k] ?? 0) + 1;
      return pre + mapa[id];
    });
  };
  // `saltar`: claves de texto libre cuyo valor se deja como está.
  const json = (v, ruta = "$", saltar = null) => {
    if (Array.isArray(v)) return v.map((x, i) => json(x, `${ruta}[${i}]`, saltar));
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (saltar?.has(k) && typeof x === "string") { out[k] = x; continue; }
        const k2 = str(k, `${ruta}.{clave}`);
        out[k2] = json(x, `${ruta}.${k2}`, saltar);
      }
      return out;
    }
    return str(v, ruta);
  };
  // ¿Queda algún id viejo como token, en cualquier cadena o clave?
  const una = new RegExp(`(^|${SEP})(${viejos.map(esc).join("|")})(?=$|${SEP})`);
  const quedan = (v) => {
    if (Array.isArray(v)) return v.reduce((n, x) => n + quedan(x), 0);
    if (v && typeof v === "object") return Object.entries(v).reduce((n, [k, x]) => n + (una.test(k) ? 1 : 0) + quedan(x), 0);
    return typeof v === "string" && una.test(v) ? 1 : 0;
  };
  return { str, json, cuenta, quedan };
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log(`Base de datos: ${new URL(process.env.SUPABASE_DB_URL).hostname}  ·  ${CONFIRMA ? "DE VERDAD" : "ENSAYO (nada se guarda)"}`);

let ESQUEMA = null;
if (CONFIRMA && !REPASO) {
  const esquema = `respaldo_uuid_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const tablas = ["household_state", "user_menu_weeks", "user_menu_recipes", "bot_tareas", "bot_messages", "bot_deshacer",
    "cookings", "shared_menus", "user_state", "persona", "persona_alergia", "persona_intolerancia", "persona_estado",
    "persona_perfil_salud", "grupo", "grupo_persona"];
  await db.query(`create schema if not exists ${esquema}`);
  for (const t of tablas) await db.query(`create table if not exists ${esquema}.${t} as table public.${t}`);
  // El mapa viejo → nuevo, por casa: para un --repaso después, y para deshacer.
  await db.query(`create table if not exists ${esquema}.ids_mapa (household_id uuid not null, viejo text not null, nuevo uuid not null, primary key (household_id, viejo))`);
  await db.query(`revoke all on schema ${esquema} from public`);
  ESQUEMA = esquema;
  console.log(`Copia de seguridad en el esquema ${esquema} (${tablas.length} tablas) y mapa en ${esquema}.ids_mapa.`);
}
const mapasGuardados = new Map();
if (REPASO) {
  for (const x of (await db.query(`select household_id, viejo, nuevo from ${REPASO}.ids_mapa`)).rows) {
    if (!mapasGuardados.has(x.household_id)) mapasGuardados.set(x.household_id, {});
    mapasGuardados.get(x.household_id)[x.viejo] = x.nuevo;
  }
  console.log(`Repaso con el mapa de ${REPASO}: ${mapasGuardados.size} casas.`);
}

const casas = (await db.query(
  `select hs.household_id, h.owner_user_id, coalesce(h.propia, true) as propia
     from household_state hs join households h on h.id = hs.household_id
    ${SOLO ? "where hs.household_id = $1" : ""} order by hs.household_id`, SOLO ? [SOLO] : [])).rows;

// La casa propia de cada titular: para lo que cuelga del usuario y no de la casa.
const propiaDe = new Map();
for (const c of casas) if (c.propia && !propiaDe.has(c.owner_user_id)) propiaDe.set(c.owner_user_id, c.household_id);

const total = { casas: 0, guardadas: 0, paradas: 0, ids: 0, cambios: {} };
for (const casa of casas) {
  total.casas++;
  const H = casa.household_id;
  await db.query("begin");
  try {
    const { state, bot_rev } = (await db.query(`select state, bot_rev from household_state where household_id = $1 for update`, [H])).rows[0];
    const data = state?.data ?? {};
    // En un repaso, el mapa guardado; si no, uno nuevo con los ids de hoy.
    const mapa = REPASO ? { ...(mapasGuardados.get(H) ?? {}) } : {};
    const raros = [];
    if (!REPASO) for (const id of [...(data.members ?? []).map((m) => m?.id), ...(data.groups ?? []).map((g) => g?.id)]) {
      if (id == null || UUID.test(String(id))) continue;
      if (!seguro(String(id))) { raros.push(String(id)); continue; }
      mapa[String(id)] ??= crypto.randomUUID();
    }
    if (raros.length) throw new Error(`ids que no se pueden reemplazar con seguridad: ${raros.length} (cortos o solo cifras). Arreglar a mano.`);
    if (!Object.keys(mapa).length) { await db.query("rollback"); continue; }
    total.ids += Object.keys(mapa).length;
    const r = reescritor(mapa);
    const esPropia = propiaDe.get(casa.owner_user_id) === H;
    if (ESQUEMA) for (const [viejo, nuevo] of Object.entries(mapa))
      await db.query(`insert into ${ESQUEMA}.ids_mapa values ($1,$2,$3) on conflict do nothing`, [H, viejo, nuevo]);

    // 1. La casa
    const nuevoState = r.json(state, "state");
    await db.query(`update household_state set state = $2, bot_rev = coalesce(bot_rev, 0) + 1 where household_id = $1`, [H, J(nuevoState)]);

    // 2. Semanas y recetas del menú: las de la casa, y las viejas sin casa de su titular (si es su casa propia)
    const filtroCasa = `household_id = $1${esPropia ? " or (household_id is null and user_id = $2)" : ""}`;
    const args = esPropia ? [H, casa.owner_user_id] : [H];
    for (const w of (await db.query(`select user_id, menu_id, week_start, plan, schedule, shopping from user_menu_weeks where ${filtroCasa}`, args)).rows) {
      await db.query(`update user_menu_weeks set plan = $4, schedule = $5, shopping = $6 where user_id = $1 and menu_id = $2 and week_start = $3`,
        [w.user_id, w.menu_id, w.week_start, J(r.json(w.plan, "umw.plan")), J(r.json(w.schedule, "umw.schedule")), J(r.json(w.shopping, "umw.shopping"))]);
    }
    for (const x of (await db.query(`select user_id, menu_id, recipe_id from user_menu_recipes where ${filtroCasa}`, args)).rows) {
      const nuevo = r.str(x.recipe_id, "umr.recipe_id");
      if (nuevo !== x.recipe_id)
        await db.query(`update user_menu_recipes set recipe_id = $4 where user_id = $1 and menu_id = $2 and recipe_id = $3`, [x.user_id, x.menu_id, x.recipe_id, nuevo]);
    }

    // 3. Bot
    for (const t of (await db.query(`select id, clave, para_member, asignado_member from bot_tareas where household_id = $1`, [H])).rows) {
      await db.query(`update bot_tareas set clave = $2, para_member = $3, asignado_member = $4 where id = $1`,
        [t.id, r.str(t.clave, "bot_tareas.clave"), r.str(t.para_member, "bot_tareas.para_member"), r.str(t.asignado_member, "bot_tareas.asignado_member")]);
    }
    for (const m of (await db.query(`select id, content from bot_messages where household_id = $1`, [H])).rows) {
      const c2 = r.json(m.content, "bot_messages.content", TEXTO_LIBRE);
      if (JSON.stringify(c2) !== JSON.stringify(m.content)) await db.query(`update bot_messages set content = $2 where id = $1`, [m.id, J(c2)]);
    }
    await db.query(`update bot_deshacer set usado_at = now() where household_id = $1 and usado_at is null`, [H]);

    // 4. Lo del titular (cuelga del usuario): solo desde su casa propia
    if (esPropia) {
      const U = casa.owner_user_id;
      for (const k of (await db.query(`select id, recipe_id, eaters from cookings where owner_id = $1`, [U])).rows)
        await db.query(`update cookings set recipe_id = $2, eaters = $3 where id = $1`, [k.id, r.str(k.recipe_id, "cookings.recipe_id"), J(r.json(k.eaters, "cookings.eaters"))]);
      for (const s of (await db.query(`select id, payload from shared_menus where owner_id = $1`, [U])).rows)
        await db.query(`update shared_menus set payload = $2 where id = $1`, [s.id, J(r.json(s.payload, "shared_menus.payload"))]);
      for (const u of (await db.query(`select user_id, state from user_state where user_id = $1`, [U])).rows)
        await db.query(`update user_state set state = $2 where user_id = $1`, [u.user_id, J(r.json(u.state, "user_state.state"))]);
    }

    // 5. Personas y grupos (0079), desde el JSON nuevo
    await db.query(`select persona_reemplazar_casa($1, $2::jsonb)`, [H, JSON.stringify(filasDeCasa(H, nuevoState))]);

    // 6. Comprobaciones: si algo no cuadra, la casa no se guarda
    const d = nuevoState.data ?? {};
    const miembros = new Set((d.members ?? []).map((m) => String(m.id)));
    const grupos = new Set((d.groups ?? []).map((g) => String(g.id)));
    const fallos = [];
    for (const g of d.groups ?? []) for (const id of g.memberIds ?? []) if (!miembros.has(String(id))) fallos.push(`memberId sin persona en ${g.id}`);
    for (const k of Object.keys(d.schedule ?? {})) { const p = k.split("|")[0]; if (mapa[p] || (UUID.test(p) && !miembros.has(p))) fallos.push(`horario ${k}`); }
    for (const id of [...miembros, ...grupos]) if (Object.values(mapa).length && !UUID.test(id)) fallos.push(`id sin migrar ${id}`);
    const quedan = r.quedan(nuevoState);
    if (quedan) fallos.push(`quedan ${quedan} apariciones de ids viejos en la casa`);
    const enTabla = (await db.query(`select (select count(*) from persona where household_id = $1)::int p, (select count(*) from grupo where household_id = $1)::int g`, [H])).rows[0];
    if (enTabla.p !== miembros.size) fallos.push(`persona: ${enTabla.p} filas frente a ${miembros.size} en el JSON`);
    if (fallos.length) throw new Error(`comprobación: ${fallos.slice(0, 5).join(" · ")}${fallos.length > 5 ? ` (+${fallos.length - 5})` : ""}`);

    for (const [k, n] of Object.entries(r.cuenta)) total.cambios[k] = (total.cambios[k] ?? 0) + n;
    if (CONFIRMA) { await db.query("commit"); total.guardadas++; } else await db.query("rollback");
    console.log(`✓ ${H}  ${Object.keys(mapa).length} ids  ·  bot_rev ${Number(bot_rev ?? 0)} → ${Number(bot_rev ?? 0) + 1}${esPropia ? "" : "  (no es su casa propia)"}`);
  } catch (e) {
    await db.query("rollback");
    total.paradas++;
    console.log(`✗ ${H}  ${e.message}`);
  }
}

console.log(`\n${CONFIRMA ? "GUARDADO" : "ENSAYO"} · casas ${total.casas} · ${CONFIRMA ? `guardadas ${total.guardadas} · ` : ""}paradas ${total.paradas} · ids ${total.ids}`);
console.log("Reemplazos por ruta (las 40 más frecuentes):");
for (const [k, n] of Object.entries(total.cambios).sort((a, b) => b[1] - a[1]).slice(0, process.env.TODAS ? Infinity : 40)) console.log(`  ${String(n).padStart(6)}  ${k}`);
await db.end();
