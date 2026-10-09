/**
 * Pone la contraseña de un usuario de solo lectura (un perfil de PERFILES en
 * `rolLectura.mjs`) sin que la contraseña pase por la pantalla, la
 * conversación, los argumentos de un proceso ni el log de Postgres. Lo usan
 * `scripts/clave-consulta-lectura.mjs` (0092) y `scripts/clave-copia-lectura.mjs`
 * (0094); los lanza Pablo, con `!`, después de aplicar su migración.
 *
 * Qué hace con --si:
 *   1. Comprueba que la ficha del perfil aún no está en 1Password y, con la
 *      conexión de administrador, que el rol existe con login.
 *   2. Genera una contraseña aleatoria en memoria.
 *   3. Crea la ficha en la bóveda del perfil con la plantilla JSON por stdin
 *      (`op item create --vault <bóveda> -`), por la app de escritorio y no por
 *      la service account (que solo lee): sale una ventana para aprobar.
 *   4. `alter role <rol> password '<verificador SCRAM>'`: a la base solo llega
 *      el verificador, no la contraseña.
 *   5. Entra con la dirección nueva y comprueba quién es, que va en read only
 *      y, si el perfil lo pide, que puede hacer su consulta de prueba.
 *
 * Para rotarla: Pablo archiva la ficha en 1Password y lo vuelve a lanzar. Si se
 * corta entre el paso 3 y el 4, igual: archivar y relanzar.
 */
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { entornoOp, leerEnv } from "./env.mjs";
import { VAR_ADMIN, claveNueva, direccionOp, estadoFicha, fichaDeRol, urlDeRol, verificadorScram } from "./rolLectura.mjs";

const ssl = { rejectUnauthorized: false };
/** Solo la primera línea de stderr de `op`: el mensaje de error nunca lleva la entrada. */
const errorDeOp = (e) => String(e.stderr || "sin detalle").trim().split("\n")[0];

/** El entorno para `op` sin la service account: la app de escritorio, que pide aprobar. */
function entornoSinServicio() {
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  return env;
}

/**
 * @param {typeof import("./rolLectura.mjs").PERFILES[string]} p
 * @param {{ si: boolean }} opciones
 */
export async function ponerClave(p, { si }) {
  const op = direccionOp(p);
  if (!si) {
    console.log(`Ensayo: con --si pondría una contraseña nueva a ${p.rol}, la guardaría en ${op} y comprobaría que entra.`);
    console.log(`Antes tiene que estar aplicada la ${p.migracion}.`);
    return 0;
  }

  // ¿Ya hay ficha? Con la service account si puede leer esa bóveda; si no, con
  // la app (pide aprobar). Solo se sigue con un «no existe» claro: cualquier
  // otro fallo podría acabar en una ficha duplicada y una dirección op:// ambigua.
  const busca = spawnSync("op", ["item", "get", p.ficha, "--vault", p.boveda, "--format", "json"], {
    env: p.servicio ? entornoOp() : entornoSinServicio(), encoding: "utf8", stdio: ["ignore", "ignore", "pipe"],
  });
  const ficha = estadoFicha(busca);
  if (ficha === "existe") {
    console.error(`Ya existe la ficha «${p.ficha}». Para rotar la contraseña, archívala en 1Password y vuelve a lanzarlo.`);
    return 1;
  }
  if (ficha === "error") {
    console.error(`No sé si la ficha «${p.ficha}» existe (${busca.error ? busca.error.code : errorDeOp(busca)}). No creo nada; la base no se ha tocado.`);
    return 1;
  }

  const admin = leerEnv(VAR_ADMIN, { obligatoria: true });
  const db = new pg.Client({ connectionString: admin, ssl });
  await db.connect();
  try {
    const { rows } = await db.query("select rolcanlogin from pg_roles where rolname = $1", [p.rol]);
    if (!rows.length || !rows[0].rolcanlogin) {
      console.error(`No existe el rol ${p.rol} con login: aplica antes la ${p.migracion}.`);
      return 1;
    }

    const clave = claveNueva();
    const url = urlDeRol(admin, p.rol, clave);

    // 1Password primero: si Pablo no aprueba la ventana, la base no cambia. Sin
    // la service account (solo lee) y con la ficha por stdin, no en argumentos.
    try {
      execFileSync("op", ["item", "create", "--vault", p.boveda, "-"], { env: entornoSinServicio(), input: fichaDeRol(p, clave, url), stdio: ["pipe", "ignore", "pipe"] });
    } catch (e) {
      console.error(`No pude guardar en 1Password: ${errorDeOp(e)}. La base no se ha tocado.`);
      return 1;
    }
    console.log(`Guardada en ${op}.`);

    await db.query(`alter role ${p.rol} password ${db.escapeLiteral(verificadorScram(clave))}`);
    console.log(`Contraseña de ${p.rol} puesta en la base (solo el verificador SCRAM).`);

    // El pooler puede tardar unos segundos en ver la contraseña nueva. Una
    // conexión cada vez, cerrada antes de la siguiente (copia_lectura solo
    // admite una).
    let ultimo;
    for (let i = 0; i < 6; i++) {
      const c = new pg.Client({ connectionString: url, ssl });
      try {
        await c.connect();
        const { rows: [r] } = await c.query("select current_user as yo, current_setting('default_transaction_read_only') as ro, current_setting('statement_timeout') as tope");
        if (r.yo !== p.rol) throw new Error(`entra como ${r.yo}`);
        if (p.prueba) await c.query(p.prueba);
        console.log(`OK: entra como ${r.yo}, read only ${r.ro}, tope ${r.tope}${p.prueba ? ", y su consulta de prueba pasa" : ""}. ${p.despues}`);
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
      console.error(`La contraseña está puesta, pero no consigo entrar con ella (${ultimo.code ?? (ultimo.message.startsWith("entra como") ? ultimo.message : "sin código")}). Vuelve a probar en un minuto.`);
      return 1;
    }
    return 0;
  } finally {
    await db.end();
  }
}
