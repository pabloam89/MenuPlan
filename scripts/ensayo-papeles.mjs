// Los tres papeles de una casa (0071), comprobados contra la base en una
// transacción que SIEMPRE se deshace: crea usuarios y una casa de prueba,
// prueba qué puede cada papel y no deja nada. Uso: node scripts/ensayo-papeles.mjs
// (lee SUPABASE_DB_URL de .env.local). CON_0071=1 aplica la 0071 dentro de la
// transacción, para ensayarla en una base que no la tiene.

import fs from "node:fs"; import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
const c = new pg.Client({ connectionString: leerEnv("SUPABASE_DB_URL", { obligatoria: true }), ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
let malos = 0;
const ok = (cond, msg) => { if (!cond) malos++; console.log(cond ? "OK  " : "MAL ", msg); };
let n = 0;
const falla = async (s, p) => {
  const sp = `s${n++}`;
  await q(`savepoint ${sp}`);
  try { await q(s, p); await q(`release savepoint ${sp}`); return null; }
  catch (e) { await q(`rollback to savepoint ${sp}`); return e.message; }
};
const uno = async (s, p) => (await q(s, p))[0];

await q("begin");
try {
  if (process.env.CON_0071) await q(fs.readFileSync("supabase/migrations/0071_tres_papeles.sql", "utf8"));
  const nuevo = async (e) => (await uno("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [e])).id;
  const [O, E, V, S, X] = [await nuevo("e71-o@x.invalid"), await nuevo("e71-e@x.invalid"), await nuevo("e71-v@x.invalid"), await nuevo("e71-s@x.invalid"), await nuevo("e71-x@x.invalid")];
  await q("delete from households where owner_user_id = any($1)", [[O, E, V, S, X]]);
  const H = (await uno("insert into households (owner_user_id, name, setup_status, invite_token) values ($1, 'ensayo 0071', 'active', gen_invite_token()) returning id", [O])).id;
  await q("insert into household_members (household_id, user_id, role) values ($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer')", [H, O, E, V]);
  await q("insert into household_state (household_id, state) values ($1, '{}')", [H]);
  await q("insert into user_profiles (user_id, active_household_id) values ($1,$4),($2,$4),($3,$4) on conflict (user_id) do update set active_household_id = excluded.active_household_id", [E, V, S, H]);
  // Casas propias de los demás (como al unirse).
  for (const u of [E, V, S, X]) {
    const h = (await uno("insert into households (owner_user_id, name, setup_status, invite_token) values ($1, 'Mi casa', 'dormant', gen_invite_token()) returning id", [u])).id;
    await q("insert into household_members (household_id, user_id, role) values ($1,$2,'owner')", [h, u]);
  }

  const como = async (uid) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const rev = async () => { await q("reset role"); return Number((await uno("select bot_rev from household_state where household_id=$1", [H])).bot_rev); };

  // ── Casa: estado ──
  let r0 = await rev();
  await como(E);
  let r = (await uno("select save_household_state($1, '{\"de\":\"cotitular\"}'::jsonb, $2) r", [H, r0])).r;
  ok(r.ok, "el cotitular guarda la casa " + JSON.stringify(r));
  r0 = await rev();
  await como(V);
  const rl = await falla("select save_household_state($1, '{\"de\":\"lector\"}'::jsonb, $2)", [H, r0])
    ?? (await uno("select save_household_state($1, '{\"de\":\"lector2\"}'::jsonb, $2) r", [H, r0])).r;
  await q("reset role");
  const st = (await uno("select state from household_state where household_id=$1", [H])).state;
  ok(st.de === "cotitular", "el lector no guarda la casa (" + JSON.stringify(rl) + ", queda: " + st.de + ")");
  await como(S);
  ok(await falla("select save_household_state($1, '{\"de\":\"extraño\"}'::jsonb, $2)", [H, r0]), "un extraño no guarda la casa");
  await como(E);
  await q("delete from household_state where household_id = $1", [H]);
  await q("reset role");
  ok((await q("select 1 from household_state where household_id=$1", [H])).length === 1, "el cotitular no vacía la casa (delete no borra nada)");

  // ── Filas de casa a nombre del titular ──
  await como(E);
  ok(!(await falla("insert into user_menus (user_id, household_id, id) values ($1, $2, 'm-e71')", [E, H])), "el cotitular crea un menú de la casa");
  await q("reset role");
  ok((await uno("select user_id from user_menus where household_id=$1 and id='m-e71'", [H])).user_id === O, "y queda a nombre del titular");
  const fila = (w) => JSON.stringify({ user_id: E, household_id: H, menu_id: "m-e71", week_start: "2026-10-05", week_end: "2026-10-11", week_offset: 0, plan: {}, shopping: { items: [w] } });
  r0 = await rev();
  await como(E);
  r = (await uno("select save_menu_week($1::jsonb, $2) r", [fila("a"), r0])).r;
  ok(r.ok, "el cotitular guarda una semana mandando SU user_id " + JSON.stringify(r));
  r0 = await rev();
  await como(E);
  r = (await uno("select save_menu_week($1::jsonb, $2) r", [fila("b"), r0])).r;
  await q("reset role");
  const semanas = await q("select user_id, shopping from user_menu_weeks where household_id=$1", [H]);
  ok(semanas.length === 1 && semanas[0].user_id === O && semanas[0].shopping.items[0] === "b", "una sola semana, del titular, con lo último (" + semanas.length + ")");
  await como(V);
  ok(await falla("insert into user_menus (user_id, household_id, id) values ($1, $2, 'm-v')", [V, H]), "el lector no crea menús");
  await como(S);
  ok(await falla("insert into user_pantry (user_id, household_id, ingredient_name, ingredient_normalized) values ($1, $2, 'sal', 'sal')", [S, H]), "un extraño no mete despensa");
  await como(O);
  ok(!(await falla("insert into user_menus (user_id, household_id, id) values ($1, $2, 'm-o71')", [O, H])), "el titular sigue igual");

  // ── Activar menú ──
  await como(E);
  ok(!(await falla("select activate_household_menu($1, 'm-e71')", [H])), "el cotitular activa un menú (firma con casa)");
  await como(V);
  ok(await falla("select activate_household_menu($1, 'm-e71')", [H]), "el lector no activa menús");

  // ── Miembros por REST: cerrado ──
  await como(O);
  ok(await falla("insert into household_members (household_id, user_id, role) values ($1, $2, 'editor')", [H, X]), "ni el titular mete miembros a mano");
  await como(V);
  await q("delete from household_members where household_id=$1 and user_id=$2", [H, V]);
  await q("reset role");
  ok((await q("select 1 from household_members where household_id=$1 and user_id=$2", [H, V])).length === 1, "el lector no se borra a mano (sale con leave_household)");

  // ── Invitaciones ──
  await como(E);
  ok(await falla("select create_household_invite($1, 'editor')", [H]), "el cotitular no invita cotitulares");
  const invV = (await uno("select create_household_invite($1, 'viewer', 'en') r", [H])).r;
  ok(invV?.token, "el cotitular invita lectores");
  await como(V);
  ok(await falla("select create_household_invite($1, 'viewer')", [H]), "el lector no invita");
  await como(O);
  const invE = (await uno("select create_household_invite($1, 'editor') r", [H])).r;
  await como(X);
  const prev = (await uno("select preview_household_invite($1) r", [invE.token])).r;
  ok(prev?.role === "editor" && prev?.householdName === "ensayo 0071", "la vista previa dice el papel " + JSON.stringify(prev));
  r = (await uno("select join_household_by_token($1) r", [invE.token])).r;
  ok(r.role === "editor", "con una invitación de cotitular se entra como cotitular " + JSON.stringify(r));
  await como(S);
  ok(await falla("select join_household_by_token($1)", [invE.token]), "una invitación de un uso no sirve dos veces");
  r = (await uno("select join_household_by_token($1) r", [invV.token])).r;
  ok(r.role === "viewer" && r.lang === "en", "la de lector, con su idioma " + JSON.stringify(r));
  // Sube, nunca baja.
  await como(O);
  const invE2 = (await uno("select create_household_invite($1, 'editor') r", [H])).r;
  await como(V);
  r = (await uno("select join_household_by_token($1) r", [invE2.token])).r;
  ok(r.role === "editor", "un lector con invitación de cotitular sube " + JSON.stringify(r));
  await q("reset role");
  const tokViejo = (await uno("select invite_token from households where id=$1", [H])).invite_token;
  await como(E);
  r = (await uno("select join_household_by_token($1) r", [tokViejo])).r;
  ok(r.role === "editor", "con el enlace de siempre, un cotitular no baja a lector " + JSON.stringify(r));

  // ── Quitar, rebajar, salir ──
  await como(E);
  ok(!(await falla("select remove_household_member($1, $2)", [H, S])), "el cotitular quita a un lector");
  ok(await falla("select remove_household_member($1, $2)", [H, X]), "el cotitular no quita a otro cotitular");
  ok(await falla("select remove_household_member($1, $2)", [H, O]), "al titular no lo quita nadie");
  await q("reset role");
  ok((await uno("select invite_token from households where id=$1", [H])).invite_token !== tokViejo, "al quitar a alguien cambia el enlace");
  await como(O);
  const invPend = (await uno("select create_household_invite($1, 'editor') r", [H])).r;
  await como(E);
  ok(await falla("select set_household_member_role($1, $2, 'viewer')", [H, X]), "el cotitular no cambia papeles");
  await como(O);
  ok(!(await falla("select set_household_member_role($1, $2, 'viewer')", [H, X])), "el titular rebaja a un cotitular");
  await q("reset role");
  ok((await uno("select revoked_at from household_invites where token=$1", [invPend.token])).revoked_at, "y lo pendiente queda revocado");
  await como(X);
  ok(!(await falla("select leave_household($1)", [H])), "un lector sale");
  await como(E);
  ok(!(await falla("select update_household($1, 'Casa renombrada')", [H])), "el cotitular renombra");
  // V ya subió a cotitular más arriba; S salió de la casa.
  await como(S);
  ok(await falla("select update_household($1, 'Casa de fuera')", [H]), "quien no es de la casa no renombra");
  await como(E);
  const lista = (await uno("select list_household_members($1) r", [H])).r.map((m) => m.role);
  ok(lista[0] === "owner" && lista.indexOf("editor") < lista.indexOf("viewer") || !lista.includes("viewer"), "miembros en orden titular, cotitular, lector " + lista);
  const casas = (await uno("select ensure_user_household() r")).r.households;
  const enH = casas.find((h) => h.id === H);
  ok(enH?.role === "editor" && enH.inviteToken, "el cotitular ve su papel y el enlace de lector " + JSON.stringify(enH && { role: enH.role, t: !!enH.inviteToken }));
  // Ayudantes cerrados a anon.
  await q("reset role");
  await q("set local role anon");
  ok(await falla("select count_foreign_memberships()"), "anon no ejecuta los ayudantes");
} finally {
  await q("rollback");
  await c.end();
}
console.log(malos ? `\n${malos} MAL` : "\nTodo bien");
process.exit(malos ? 1 : 0);
