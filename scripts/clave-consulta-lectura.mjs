#!/usr/bin/env node
/**
 * Pone (o rota) la contraseña del usuario de solo lectura `consulta_lectura`
 * (migración 0092, issue #233) sin que la contraseña pase por la pantalla, la
 * conversación ni el log de Postgres. Lo lanza Pablo, con `!`, después de
 * aplicar la 0092:
 *
 *   node scripts/clave-consulta-lectura.mjs        # dice lo que haría
 *   node scripts/clave-consulta-lectura.mjs --si   # lo hace
 *
 * Qué hace con --si:
 *   1. Comprueba con la conexión de administrador que el rol existe.
 *   2. Genera una contraseña aleatoria en memoria.
 *   3. Guarda la dirección completa en 1Password, campo SUPABASE_DB_URL_LECTURA
 *      de la ficha Supabase (bóveda HoMenu). Va por la app de escritorio, no por
 *      la service account (que solo lee): sale una ventana para aprobar.
 *   4. `alter role consulta_lectura password '<verificador SCRAM>'`: a la base
 *      solo llega el verificador, no la contraseña.
 *   5. Entra con la dirección nueva y comprueba quién es y que va en read only.
 * Si algo falla a medias, se vuelve a lanzar: la contraseña nueva pisa la vieja
 * en los dos sitios.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { OP_LECTURA, ROL_LECTURA, VAR_ADMIN, VAR_LECTURA, claveNueva, urlLectura, verificadorScram } from "./lib/rolLectura.mjs";

const SI = process.argv.includes("--si");
const ssl = { rejectUnauthorized: false };

if (!SI) {
  console.log(`Ensayo: con --si pondría una contraseña nueva a ${ROL_LECTURA}, la guardaría en ${OP_LECTURA} y comprobaría que entra.`);
  console.log("Antes tiene que estar aplicada la 0092_rol_consulta_lectura.");
  process.exit(0);
}

const admin = leerEnv(VAR_ADMIN, { obligatoria: true });
const db = new pg.Client({ connectionString: admin, ssl });
await db.connect();
try {
  const { rows } = await db.query("select rolcanlogin from pg_roles where rolname = $1", [ROL_LECTURA]);
  if (!rows.length || !rows[0].rolcanlogin) {
    console.error(`No existe el rol ${ROL_LECTURA} con login: aplica antes la 0092_rol_consulta_lectura.`);
    process.exit(1);
  }

  const clave = claveNueva();
  const url = urlLectura(admin, clave);

  // 1Password primero: si Pablo no aprueba la ventana, la base no cambia.
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  try {
    execFileSync("op", ["item", "edit", "Supabase", "--vault", "HoMenu", `${VAR_LECTURA}[concealed]=${url}`], { env, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    console.error(`No pude guardar en 1Password: ${String(e.stderr || e.message).trim().split("\n")[0]}. La base no se ha tocado.`);
    process.exit(1);
  }
  console.log(`Guardada en ${OP_LECTURA}.`);

  await db.query(`alter role ${ROL_LECTURA} password ${db.escapeLiteral(verificadorScram(clave))}`);
  console.log(`Contraseña de ${ROL_LECTURA} cambiada en la base (solo el verificador SCRAM).`);

  // El pooler puede tardar unos segundos en ver la contraseña nueva.
  let ultimo;
  for (let i = 0; i < 6; i++) {
    const c = new pg.Client({ connectionString: url, ssl });
    try {
      await c.connect();
      const { rows: [r] } = await c.query("select current_user as yo, current_setting('default_transaction_read_only') as ro, current_setting('statement_timeout') as tope");
      console.log(`OK: entra como ${r.yo}, read only ${r.ro}, tope ${r.tope}. Añade a tu .env.local: ${VAR_LECTURA}=${OP_LECTURA}`);
      ultimo = null;
      break;
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 3000));
    } finally {
      await c.end().catch(() => {});
    }
  }
  if (ultimo) {
    console.error(`La contraseña está puesta, pero no consigo entrar con ella: ${ultimo.message}. Vuelve a lanzarlo en un minuto.`);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
