#!/usr/bin/env node
/**
 * Pone la contraseña del usuario de solo lectura `consulta_lectura` (migración
 * 0092, issue #233) sin que la contraseña pase por la pantalla, la
 * conversación, los argumentos de un proceso ni el log de Postgres. Lo lanza
 * Pablo, con `!`, después de aplicar la 0092:
 *
 *   node scripts/clave-consulta-lectura.mjs        # dice lo que haría
 *   node scripts/clave-consulta-lectura.mjs --si   # lo hace
 *
 * Qué hace con --si:
 *   1. Comprueba con la conexión de administrador que el rol existe y que la
 *      ficha «Supabase lectura» aún no está en 1Password.
 *   2. Genera una contraseña aleatoria en memoria.
 *   3. Crea la ficha en la bóveda de las sesiones (BOVEDA_LECTURA, #299) con la
 *      plantilla JSON por stdin (`op item create --vault <bóveda> -`), por la app de escritorio y no por
 *      la service account (que solo lee): sale una ventana para aprobar.
 *   4. `alter role consulta_lectura password '<verificador SCRAM>'`: a la base
 *      solo llega el verificador, no la contraseña.
 *   5. Entra con la dirección nueva y comprueba quién es y que va en read only.
 *
 * Para rotarla: Pablo archiva la ficha «Supabase lectura» en 1Password y lo
 * vuelve a lanzar. Si se corta entre el paso 3 y el 4, igual: archivar y
 * relanzar.
 */
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { BOVEDA_LECTURA, BOVEDAS_LECTURA, FICHA_LECTURA, OP_LECTURA, ROL_LECTURA, VAR_ADMIN, VAR_LECTURA, claveNueva, estadoFicha, fichaLectura, urlLectura, verificadorScram } from "./lib/rolLectura.mjs";

const SI = process.argv.includes("--si");
const ssl = { rejectUnauthorized: false };
/** Solo la primera línea de stderr de `op`: el mensaje de error nunca lleva la entrada. */
const errorDeOp = (e) => String(e.stderr || "sin detalle").trim().split("\n")[0];

if (!SI) {
  console.log(`Ensayo: con --si pondría una contraseña nueva a ${ROL_LECTURA}, la guardaría en ${OP_LECTURA} y comprobaría que entra.`);
  console.log("Antes tiene que estar aplicada la 0092_rol_consulta_lectura.");
  process.exit(0);
}

// ¿Ya hay ficha, en la bóveda de sesiones o en HoMenu (#299)? Por la app de
// escritorio y no por la service account, que no ve HoMenu. Solo se sigue con
// un «no existe» claro en las dos: cualquier otro fallo (también que la bóveda
// de sesiones aún no exista) podría acabar en una ficha duplicada y una
// dirección op:// ambigua.
const sinCuenta = { ...process.env };
delete sinCuenta.OP_SERVICE_ACCOUNT_TOKEN;
for (const boveda of BOVEDAS_LECTURA) {
  const busca = spawnSync("op", ["item", "get", FICHA_LECTURA, "--vault", boveda, "--format", "json"], { env: sinCuenta, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  const ficha = estadoFicha(busca);
  if (ficha === "existe") {
    console.error(`Ya existe la ficha «${FICHA_LECTURA}» en ${boveda}. Para rotar la contraseña, archívala en 1Password y vuelve a lanzarlo.`);
    process.exit(1);
  }
  if (ficha === "error") {
    console.error(`No sé si la ficha «${FICHA_LECTURA}» existe en ${boveda} (${busca.error ? busca.error.code : errorDeOp(busca)}). No creo nada; la base no se ha tocado.`);
    process.exit(1);
  }
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

  // 1Password primero: si Pablo no aprueba la ventana, la base no cambia. Sin
  // la service account (solo lee) y con la ficha por stdin, no en argumentos.
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  try {
    execFileSync("op", ["item", "create", "--vault", BOVEDA_LECTURA, "-"], { env, input: fichaLectura(clave, url), stdio: ["pipe", "ignore", "pipe"] });
  } catch (e) {
    console.error(`No pude guardar en 1Password: ${errorDeOp(e)}. La base no se ha tocado.`);
    process.exit(1);
  }
  console.log(`Guardada en ${OP_LECTURA}.`);

  await db.query(`alter role ${ROL_LECTURA} password ${db.escapeLiteral(verificadorScram(clave))}`);
  console.log(`Contraseña de ${ROL_LECTURA} puesta en la base (solo el verificador SCRAM).`);

  // El pooler puede tardar unos segundos en ver la contraseña nueva.
  let ultimo;
  for (let i = 0; i < 6; i++) {
    const c = new pg.Client({ connectionString: url, ssl });
    try {
      await c.connect();
      const { rows: [r] } = await c.query("select current_user as yo, current_setting('default_transaction_read_only') as ro, current_setting('statement_timeout') as tope");
      if (r.yo !== ROL_LECTURA) throw new Error(`entra como ${r.yo}`);
      console.log(`OK: entra como ${r.yo}, read only ${r.ro}, tope ${r.tope}. Añade (o descomenta) en tu .env.local: ${VAR_LECTURA}=${OP_LECTURA}`);
      ultimo = null;
      break;
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 3000));
    } finally {
      await c.end().catch((e) => console.warn(`cerrar la conexión de prueba: ${e.code ?? "error"}`));
    }
  }
  if (ultimo) {
    // El código de pg, o nuestro propio motivo; nunca la dirección.
    console.error(`La contraseña está puesta, pero no consigo entrar con ella (${ultimo.code ?? (ultimo.message.startsWith("entra como") ? ultimo.message : "sin código")}). Vuelve a probar en un minuto con npm run consulta.`);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
