// Heredar la casa al borrar la cuenta del titular (0075), comprobado contra la
// base en una transacción que SIEMPRE se deshace: crea usuarios y casas de
// prueba, borra al titular y mira que todo pase al cotitular. Uso: node
// scripts/ensayo-herencia.mjs. CON_0075=1 aplica la 0075 dentro, para
// ensayarla en una base que no la tiene.

import fs from "node:fs"; import pg from "pg";
const env = fs.readFileSync(".env.local", "utf8");
const c = new pg.Client({ connectionString: env.match(/^SUPABASE_DB_URL="?([^"\r\n]+)/m)[1], ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows; const uno = async (s, p) => (await q(s, p))[0];
let malos = 0; const ok = (b, m) => { if (!b) malos++; console.log(b ? "OK  " : "MAL ", m); };
let n = 0; const falla = async (s, p) => { const sp = `s${n++}`; await q(`savepoint ${sp}`); try { await q(s, p); await q(`release savepoint ${sp}`); return null; } catch (e) { await q(`rollback to savepoint ${sp}`); return e.message; } };
await q("begin");
try {
  if (process.env.CON_0075) await q(fs.readFileSync("supabase/migrations/0075_herencia.sql", "utf8"));
  const nuevo = async (e) => (await uno("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [e])).id;
  const [O, E, V, O2, V2] = [await nuevo("e75-o@x.invalid"), await nuevo("e75-e@x.invalid"), await nuevo("e75-v@x.invalid"), await nuevo("e75-o2@x.invalid"), await nuevo("e75-v2@x.invalid")];
  await q("delete from households where owner_user_id = any($1)", [[O, E, V, O2, V2]]);
  const casa = async (u, nombre) => { const h = (await uno("insert into households (owner_user_id, name, setup_status, invite_token) values ($1,$2,'active',gen_invite_token()) returning id", [u, nombre])).id; await q("insert into household_members (household_id,user_id,role) values ($1,$2,'owner')", [h, u]); await q("insert into household_state (household_id, state) values ($1,'{}')", [h]); return h; };
  const H = await casa(O, "Casa O"), HE = await casa(E, "Casa de E"), H2 = await casa(O2, "Casa O2");
  await q("insert into household_members (household_id,user_id,role) values ($1,$2,'editor'),($1,$3,'viewer'),($4,$5,'viewer')", [H, E, V, H2, V2]);
  // Casa O: un menú «m1» con su semana y receta, y despensa. E tiene en SU casa otro «m1» (choque de PK).
  await q("insert into user_menus (user_id, household_id, id, is_active) values ($1,$2,'m1',true),($3,$4,'m1',true)", [O, H, E, HE]);
  await q("insert into user_menu_weeks (user_id, household_id, menu_id, week_start, week_end, week_offset, shopping) values ($1,$2,'m1','2026-10-05','2026-10-11',0,'{\"items\":[{\"name\":\"leche\"}]}'),($3,$4,'m1','2026-10-05','2026-10-11',0,'{\"items\":[{\"name\":\"suya\"}]}')", [O, H, E, HE]);
  await q("insert into user_menu_recipes (user_id, household_id, menu_id, recipe_id, recipe_snapshot) values ($1,$2,'m1','r1','{}')", [O, H]);
  await q("insert into user_pantry (user_id, household_id, ingredient_name, ingredient_normalized) values ($1,$2,'sal','sal')", [O, H]);
  await q("insert into bot_chats (channel, chat_id, household_id, kind, linked_by) values ('telegram','e75-priv-o',$1,'private',$2),('telegram','e75-priv-e',$1,'private',$3)", [H, O, E]);

  // Permisos
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: O, role: "authenticated" })]); await q("set local role authenticated");
  ok(await falla("select prepare_account_deletion($1)", [O]), "un usuario no llama a prepare_account_deletion");
  ok(await falla("select transfer_household_ownership($1,$2)", [H, V]), "no se le pasa la casa a un lector");
  await q("reset role");

  // Borrar la cuenta de O
  const r = (await uno("select prepare_account_deletion($1) r", [O])).r;
  ok(r.pasadas === 1 && r.borradas === 0, "la casa de O pasa a su cotitular " + JSON.stringify(r));
  const h = await uno("select owner_user_id, propia from households where id=$1", [H]);
  ok(h.owner_user_id === E && h.propia === false, "E es el titular, y la casa cuenta como heredada");
  const papeles = Object.fromEntries((await q("select user_id, role from household_members where household_id=$1", [H])).map((m) => [m.user_id, m.role]));
  ok(papeles[E] === "owner" && papeles[V] === "viewer" && !papeles[O], "E titular, la lectora sigue, O fuera " + JSON.stringify(Object.values(papeles)));
  ok((await q("select 1 from user_menus where household_id=$1 and user_id=$2 and id='m1'", [H, E])).length === 1, "el menú de la casa, a nombre de E, con su id");
  const sem = await q("select user_id, shopping from user_menu_weeks where household_id=$1", [H]);
  ok(sem.length === 1 && sem[0].user_id === E && sem[0].shopping.items[0].name === "leche", "su semana le sigue");
  ok((await q("select 1 from user_menu_recipes where household_id=$1 and user_id=$2", [H, E])).length === 1, "y sus recetas");
  ok((await q("select 1 from user_pantry where household_id=$1 and user_id=$2", [H, E])).length === 1, "y la despensa");
  const suyo = await q("select id from user_menus where household_id=$1", [HE]);
  ok(suyo.length === 1 && suyo[0].id.startsWith("m1-"), "el «m1» de E en su casa, renombrado: " + suyo[0]?.id);
  ok((await q("select shopping from user_menu_weeks where household_id=$1 and menu_id=$2", [HE, suyo[0]?.id])).length === 1, "con su semana");
  ok((await q("select 1 from households where id=$1", [HE])).length === 1, "la casa propia de E no se borra");
  ok((await q("select chat_id from bot_chats where household_id=$1", [H])).map((x) => x.chat_id).join() === "e75-priv-e", "el privado de O con esa casa se va; el de E se queda");

  // Y ahora se borra el usuario de verdad: la casa sobrevive
  await q("delete from auth.users where id=$1", [O]);
  ok((await q("select 1 from user_menus where household_id=$1", [H])).length === 1, "tras borrar a O, la casa y su menú siguen ahí");

  // Una casa solo con lectores: se va, y se cuenta
  const r2 = (await uno("select prepare_account_deletion($1) r", [O2])).r;
  ok(r2.pasadas === 0 && r2.borradas === 1 && r2.lectores === 1, "sin cotitular no se pasa: 1 lectora pierde el acceso " + JSON.stringify(r2));
  await q("delete from auth.users where id=$1", [O2]);
  ok((await q("select 1 from households where id=$1", [H2])).length === 0, "y la casa se va con la cuenta");

  // Las casas propias siguen siendo una por persona
  ok(await falla("insert into households (owner_user_id, name) values ($1, 'otra propia')", [E]), "una segunda casa propia, no");
  // Lo que ve E en la app
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: E, role: "authenticated" })]); await q("set local role authenticated");
  const casas = (await uno("select ensure_user_household() r")).r.households.map((x) => x.role);
  ok(casas.filter((x) => x === "owner").length === 2, "E ve sus dos casas como titular: " + casas);
} finally { await q("rollback"); await c.end(); }
console.log(malos ? `${malos} MAL` : "Todo bien"); process.exit(malos ? 1 : 0);
