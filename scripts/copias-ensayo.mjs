#!/usr/bin/env node
/**
 * Ensayo de restauración de una copia de la base (encargo #247). Lo lanza
 * Pablo con `!`: pide aprobar tres veces en 1Password (la SSH al servidor, la
 * clave privada y la dirección de `copia_lectura`, todas en «Panel HoMenu»).
 *
 *   node scripts/copias-ensayo.mjs                  la última copia diaria del servidor
 *   node scripts/copias-ensayo.mjs --copia <dir>    una copia ya descargada (carpeta con base.dump.age)
 *   …  --clave-fichero <f>   la clave age de un fichero en vez de 1Password (solo ensayos con una clave desechable)
 *   …  --sin-produccion      no compara con producción (solo restaura)
 *   …  --no-registrar        no añade la línea a ops/copias/ensayos.log
 *   …  --pg-bin <dir>        los binarios de Postgres 17 (o PG_BIN; si no, C:\dev\herramientas\pgsql\bin o el PATH)
 *   …  --age <ruta>          el binario de age (o AGE_BIN; si no, el PATH)
 *
 * Qué hace: comprueba que cada fichero se descifra entero (a ninguna parte),
 * levanta un Postgres 17 desechable (initdb en una carpeta temporal, solo en
 * 127.0.0.1), crea lo mínimo de Supabase que el volcado nombra (roles,
 * auth.uid(), auth.users y auth.identities con las columnas del esquema `copia`)
 * y restaura con `--exit-on-error`: `age -d` por tubería a `pg_restore`, una vez
 * por sección, así que el volcado en claro no se escribe nunca. Carga los CSV de
 * `copia` (usuarios e identidades) en ese auth, cuenta cuántos dueños faltarían
 * (`huerfanos:`) y rellena con ids sueltos los que falten, para que las claves
 * ajenas se comprueben. Pone las secuencias al día y cuenta las filas de cada
 * tabla. Luego cuenta lo mismo en producción con el usuario de las copias
 * (`copia_lectura`, en una transacción read only), también las vistas de
 * `copia`, y compara (`veredicto` de scripts/lib/copias.mjs): una copia sin
 * auth sale `tablas-distintas`.
 *
 * OJO: mientras dura, el datadir del Postgres desechable SÍ tiene la base en
 * claro (es una base de verdad). Al final, o con Ctrl+C, Ctrl+Break o al cerrar
 * la ventana, se para el Postgres y se BORRA la carpeta temporal; si algo lo
 * impide, lo dice («OJO: no pude borrar…») y el siguiente ensayo la borra al
 * empezar (`limpiarRestos`).
 *
 * Deja una línea `ensayo-copia …` en ops/copias/ensayos.log (repo público: sin
 * datos de familias ni el tamaño de la base, solo `recuento: ok|fallo` y el
 * cociente; `lineaRegistroEnsayo`, #273). Cadencia: skill hetzner.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

import { RAIZ } from "./lib/env.mjs";
import {
  CLAVE_PRIVADA, DIR_SERVIDOR, NOMBRE_COPIA, OP_CLAVE_COPIAS, RELACIONES_COPIA, SERVIDOR, SQL_SECUENCIAS, TABLAS_SIN_COPIA,
  clavesAjenasAAuth, columnasCopiaQueNoCuadran, fechaDeCopia, lineaEstructurada, lineaRegistroEnsayo, sqlAuthDeMentira, sqlHuerfanos, veredicto,
} from "./lib/copias.mjs";
import { OP_COPIA, PERFILES, ROL_COPIA, VAR_COPIA } from "./lib/rolLectura.mjs";

const SSH = "C:\\Windows\\System32\\OpenSSH\\ssh.exe";
const REGISTRO = join(RAIZ, "ops", "copias", "ensayos.log");
const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const tiene = (n) => args.includes(n);

class FalloEnsayo extends Error {
  constructor(motivo, mensaje) { super(mensaje); this.motivo = motivo; }
}
const fallo = (motivo, mensaje) => { throw new FalloEnsayo(motivo, mensaje); };

const exe = (n) => (process.platform === "win32" ? `${n}.exe` : n);

/** La carpeta de los binarios de Postgres 17, comprobando la versión. */
function binariosPg() {
  const candidatos = [opcion("--pg-bin"), process.env.PG_BIN, "C:\\dev\\herramientas\\pgsql\\bin", ""].filter((c) => c !== undefined);
  for (const dir of candidatos) {
    const ruta = (n) => (dir ? join(dir, exe(n)) : n);
    const r = spawnSync(ruta("pg_restore"), ["--version"], { encoding: "utf8" });
    if (r.status === 0 && / 17\.\d+/.test(r.stdout)) return ruta;
  }
  fallo("herramientas", "No encuentro pg_restore 17 (ni en --pg-bin, PG_BIN, C:\\dev\\herramientas\\pgsql\\bin ni el PATH). Instrucciones en la skill hetzner.");
}

function binarioAge() {
  const ruta = opcion("--age") || process.env.AGE_BIN || "age";
  const r = spawnSync(ruta, ["--version"], { encoding: "utf8" });
  if (r.status !== 0) fallo("herramientas", `No encuentro age (${ruta}). winget install FiloSottile.age y reinicia el terminal.`);
  return ruta;
}

/** Lanza un comando, devuelve su salida y si falla lanza FalloEnsayo con el motivo. */
function correr(motivo, cmd, argv, opciones = {}) {
  // Con tope de tiempo: un paso colgado no puede dejar la base en claro en el disco para siempre.
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 15 * 60_000, ...opciones });
  if (r.error || r.status !== 0) {
    const detalle = (r.stderr || r.error?.message || "").trim().split(/\r?\n/).slice(-6).join("\n");
    fallo(motivo, `${cmd.split(/[\\/]/).pop()} ${argv[0] ?? ""} salió con ${r.status ?? r.error?.code}:\n${detalle}`);
  }
  return r.stdout;
}

/**
 * `age -d <fichero> | <cmd argv>`: descifra por tubería, sin escribir el claro en
 * el disco, y devuelve la salida de `cmd`. Manda lo que diga `cmd`: si acaba
 * bien, que `age` se queje de la tubería cerrada no cuenta (pg_restore deja de
 * leer cuando ya tiene su sección); la integridad de cada fichero ya la
 * comprobó `comprobarDescifrado`. Con tope de tiempo, como `correr`.
 */
async function descifrarA(motivo, age, clave, fichero, cmd, argv) {
  const a = spawn(age, ["-d", "-i", "-", fichero], { stdio: ["pipe", "pipe", "pipe"] });
  const b = spawn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"] });
  a.stdin.end(`${clave}\n`);
  a.stdout.pipe(b.stdin);
  b.stdin.on("error", () => {}); // pg_restore puede cerrar antes de que age acabe
  a.stdout.on("error", () => {});
  let salida = "";
  let errores = "";
  b.stdout.setEncoding("utf8").on("data", (d) => { salida += d; });
  b.stderr.setEncoding("utf8").on("data", (d) => { errores += d; });
  a.stderr.resume();
  const tope = setTimeout(() => { a.kill(); b.kill(); }, 15 * 60_000);
  const fin = (p) => new Promise((res) => { p.on("error", (e) => res(e.code ?? -1)); p.on("close", (c) => res(c)); });
  const [, cb] = await Promise.all([fin(a), fin(b)]);
  clearTimeout(tope);
  if (cb !== 0) {
    const detalle = errores.trim().split(/\r?\n/).slice(-6).join("\n");
    fallo(motivo, `${cmd.split(/[\\/]/).pop()} salió con ${cb}:\n${detalle}`);
  }
  return salida;
}

/** Cada .age se descifra entero sin guardar nada: clave buena y fichero sano (age comprueba cada trozo). */
function comprobarDescifrado(age, clave, fichero) {
  const r = spawnSync(age, ["-d", "-i", "-", fichero], { input: `${clave}\n`, stdio: ["pipe", "ignore", "pipe"], encoding: "utf8", timeout: 15 * 60_000 });
  if (r.error || r.status !== 0) fallo("descifrado", `age -d ${fichero.split(/[\\/]/).pop()} salió con ${r.status ?? r.error?.code}: ${(r.stderr || "").trim()}`);
}

/**
 * Lo que hay que limpiar si cortan el ensayo. Con Ctrl+C (SIGINT), Ctrl+Break
 * (SIGBREAK), al cerrar la ventana (SIGHUP; Windows da unos 10 s) o SIGTERM:
 * para el Postgres en seco y borra la carpeta, todo síncrono, y sale. Sin esto,
 * el datadir con la base en claro y un postmaster con `trust` se quedaban en
 * %TEMP% (lo vio seguridad el 9 oct 2026).
 */
const vivo = { tmp: null, datos: null, pgctl: null };
function limpiarYSalir(senal) {
  console.error(`\nCortado (${senal}): paro el Postgres del ensayo y borro la carpeta temporal.`);
  if (vivo.pgctl && vivo.datos && existsSync(join(vivo.datos, "postmaster.pid"))) {
    spawnSync(vivo.pgctl, ["-D", vivo.datos, "-m", "immediate", "-w", "stop"], { stdio: "ignore", timeout: 30_000 });
  }
  if (vivo.tmp) {
    try {
      rmSync(vivo.tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch (e) {
      console.error(`OJO: no pude borrar ${vivo.tmp} (${e.message}); tiene la base en claro. Bórrala a mano.`);
    }
  }
  process.exit(130);
}
for (const s of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(s, () => limpiarYSalir(s));

/** Trae la última copia diaria del servidor a `destino` (tar por SSH) y devuelve su carpeta. */
async function descargar(destino) {
  mkdirSync(destino, { recursive: true });
  const remoto = `cd ${DIR_SERVIDOR}/diaria && d=$(ls -1 | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' | sort | tail -n 1) && [ -n "$d" ] && tar -cf - "$d"`;
  const ssh = spawn(existsSync(SSH) ? SSH : "ssh", [SERVIDOR, remoto], { stdio: ["ignore", "pipe", "inherit"] });
  // El tar de Windows (bsdtar): el GNU tar de Git Bash toma «C:» por un servidor remoto.
  const TAR_WIN = "C:\\Windows\\System32\\tar.exe";
  const tar = spawn(existsSync(TAR_WIN) ? TAR_WIN : "tar", ["-xf", "-", "-C", destino], { stdio: ["pipe", "inherit", "inherit"] });
  ssh.stdout.pipe(tar.stdin);
  const fin = (p) => new Promise((res) => { p.on("error", () => res(-1)); p.on("close", res); });
  const [cs, ct] = await Promise.all([fin(ssh), fin(tar)]);
  if (cs !== 0 || ct !== 0) fallo("descarga", `ssh salió con ${cs} y tar con ${ct}`);
  const dirs = readdirSync(destino).filter((d) => NOMBRE_COPIA.test(d));
  if (dirs.length !== 1) fallo("descarga", `esperaba una copia y llegaron ${dirs.length}`);
  return join(destino, dirs[0]);
}

/** La clave privada, en memoria: de 1Password (pide aprobar) o de un fichero de ensayo. */
function clavePrivada() {
  const f = opcion("--clave-fichero");
  let texto;
  if (f) texto = readFileSync(f, "utf8");
  else {
    // Sin la service account: no puede leer esa bóveda, y así pide aprobar.
    const env = { ...process.env };
    delete env.OP_SERVICE_ACCOUNT_TOKEN;
    try {
      texto = execFileSync("op", ["read", OP_CLAVE_COPIAS], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      fallo("clave", `op read falló: ${(e.stderr || e.message).trim().split("\n")[0]}`);
    }
  }
  const clave = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => CLAVE_PRIVADA.test(l));
  if (!clave) fallo("clave", "lo leído no contiene una clave privada de age");
  return clave;
}

const puertoLibre = () => new Promise((res, rej) => {
  const s = createServer();
  s.on("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

/** El mínimo de Supabase que nombra el volcado de public y ops. */
const SQL_STUB = `
-- El volcado trae su propio CREATE SCHEMA public (en Supabase no es el de initdb).
drop schema public;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;
${sqlAuthDeMentira()}
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
`;

const SQL_TABLAS = `select format('%I.%I', n.nspname, c.relname) as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'ops') and c.relkind in ('r', 'p') order by 1`;

async function contar(client) {
  const { rows } = await client.query(SQL_TABLAS);
  const filas = {};
  // Las de TABLAS_SIN_COPIA no van en la copia (ni copia_lectura puede leerlas).
  for (const { t } of rows.filter(({ t }) => !TABLAS_SIN_COPIA.includes(t))) filas[t] = Number((await client.query(`select count(*)::bigint as n from ${t}`)).rows[0].n);
  return filas;
}

/**
 * La dirección del usuario de las copias (`copia_lectura`): de la variable
 * de entorno si alguien la pone (`op run`), o de su ficha en «Panel HoMenu» con
 * la app de 1Password (pide aprobar; la service account no llega a esa bóveda).
 */
function urlProduccion() {
  if (process.env[VAR_COPIA]) return process.env[VAR_COPIA];
  const env = { ...process.env };
  delete env.OP_SERVICE_ACCOUNT_TOKEN;
  try {
    return execFileSync("op", ["read", OP_COPIA], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    fallo("produccion", `No pude leer ${OP_COPIA} (${(e.stderr || e.message).trim().split("\n")[0]}). ¿Está aplicada la ${PERFILES[ROL_COPIA].migracion} y puesta su contraseña (scripts/clave-copia-lectura.mjs)? Sin ella, --sin-produccion.`);
  }
}

/** Filas de las tablas de public y ops y de las vistas de `copia`, en producción. */
async function contarProduccion() {
  const url = urlProduccion();
  if (!url) fallo("produccion", `${OP_COPIA} está vacía.`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows: [q] } = await client.query("select current_user as yo");
    if (q.yo !== ROL_COPIA) fallo("produccion", `La dirección de las copias entra como ${q.yo}, no como ${ROL_COPIA}`);
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");
    // Las vistas de copia tienen que ser lo que el ensayo cree (nombres y tipos).
    const { rows: cols } = await client.query(
      "select table_name, column_name, data_type, ordinal_position from information_schema.columns where table_schema = 'copia'",
    );
    const noCuadran = columnasCopiaQueNoCuadran(cols);
    if (noCuadran.length) fallo("columnas-copia", noCuadran.join("\n"));
    const filas = await contar(client);
    for (const rel of Object.keys(RELACIONES_COPIA)) {
      filas[`copia.${rel}`] = Number((await client.query(`select count(*)::bigint as n from copia.${rel}`)).rows[0].n);
    }
    return filas;
  } catch (e) {
    if (e instanceof FalloEnsayo) throw e;
    fallo("produccion", e.message);
  } finally {
    await client.query("rollback").catch((e) => console.warn(`rollback en producción: ${e.message}`));
    await client.end().catch((e) => console.warn(`cerrar la conexión a producción: ${e.message}`));
  }
}

/**
 * Restos de un ensayo cortado a mitad (Ctrl+C, un tope de tiempo): tienen la
 * base en claro. Se para su Postgres si sigue vivo y se borran. Solo las
 * carpetas con nuestro prefijo dentro del temporal del sistema.
 */
function limpiarRestos(pgctl) {
  for (const d of readdirSync(tmpdir()).filter((x) => x.startsWith("menuplan-ensayo-"))) {
    const dir = join(tmpdir(), d);
    if (pgctl && existsSync(join(dir, "pg", "postmaster.pid"))) {
      spawnSync(pgctl, ["-D", join(dir, "pg"), "-m", "fast", "-w", "stop"], { stdio: "ignore", timeout: 60_000 });
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      console.warn(`Borrado el resto de un ensayo anterior: ${dir}`);
    } catch (e) {
      console.error(`OJO: no pude borrar ${dir} (${e.message}); puede tener la base en claro. Bórrala a mano.`);
    }
  }
}

async function main() {
  const t0 = Date.now();
  try {
    limpiarRestos(binariosPg()("pg_ctl"));
  } catch (e) {
    if (!(e instanceof FalloEnsayo)) throw e;
    limpiarRestos(null); // sin pg_ctl: borra lo que no tenga un Postgres vivo
  }
  const campos = { fecha: new Date().toISOString().replace(/\.\d+Z$/, "Z"), resultado: "fallo", motivo: "-", copia: "-", edad_h: "-", tablas: "-", filas_copia: "-", filas_prod: "-", diferencias: "-", auth: "no", huerfanos: "-", segundos: "-" };
  const tmp = mkdtempSync(join(tmpdir(), "menuplan-ensayo-"));
  const datos = join(tmp, "pg");
  let pgctl = null;
  let detalle = null;
  vivo.tmp = tmp;
  vivo.datos = datos;
  try {
    const pgBin = binariosPg();
    const age = binarioAge();
    pgctl = pgBin("pg_ctl");
    vivo.pgctl = pgctl;

    const dirCopia = opcion("--copia") ?? (await descargar(join(tmp, "descarga")));
    const nombre = dirCopia.split(/[\\/]/).filter(Boolean).pop();
    campos.copia = nombre;
    const fecha = fechaDeCopia(nombre);
    if (fecha) campos.edad_h = Math.round((Date.now() - fecha.getTime()) / 36e5);
    if (!existsSync(join(dirCopia, "base.dump.age"))) fallo("descarga", `no hay base.dump.age en ${dirCopia}`);

    const clave = clavePrivada();
    // Nada en claro en el disco: cada fichero se descifra entero a ninguna
    // parte (clave y fichero sanos) y el volcado, después, por tubería.
    const cifrados = readdirSync(dirCopia).filter((x) => x.endsWith(".age"));
    for (const f of cifrados) comprobarDescifrado(age, clave, join(dirCopia, f));
    const dump = join(dirCopia, "base.dump.age");
    console.log(`Copia ${nombre} comprobada (${(statSync(dump).size / 1e6).toFixed(1)} MB cifrada); se restaura por tubería, sin escribirla en claro.`);

    // Postgres desechable: solo escucha en 127.0.0.1, en un puerto libre.
    const puerto = await puertoLibre();
    correr("postgres", pgBin("initdb"), ["-D", datos, "-U", "ensayo", "-A", "trust", "-E", "UTF8", "--locale=C", "--no-instructions"]);
    // stdio "ignore" entero: en Windows el postmaster hereda las tuberías y
    // spawnSync no vuelve nunca (visto en el primer ensayo, 9 oct 2026). Los
    // errores de arranque quedan en pg.log.
    const arranque = spawnSync(pgctl, ["-D", datos, "-l", join(tmp, "pg.log"), "-w", "-t", "60", "-o", `-p ${puerto} -c listen_addresses=127.0.0.1 -c fsync=off`, "start"], { stdio: "ignore", timeout: 90_000 });
    if (arranque.status !== 0) {
      const log = existsSync(join(tmp, "pg.log")) ? readFileSync(join(tmp, "pg.log"), "utf8").trim().split(/\r?\n/).slice(-5).join("\n") : "";
      fallo("postgres", `pg_ctl start salió con ${arranque.status ?? arranque.error?.code}:\n${log}`);
    }
    const conexion = ["-h", "127.0.0.1", "-p", String(puerto), "-U", "ensayo", "-d", "postgres"];
    const psql = (motivo, sql) => correr(motivo, pgBin("psql"), [...conexion, "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql });
    // Un solo número (una fila, una columna), sin cabeceras.
    const numero = (sql) => Number(correr("restauracion", pgBin("psql"), [...conexion, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { input: sql }).trim());

    psql("restauracion", SQL_STUB);
    // pg_restore lee de stdin (sin fichero): una pasada de age por sección. La
    // copia se hizo a una tubería, sin índice de posiciones, así que pg_restore
    // la lee en orden; con una sola tarea (sin -j) es lo que hace igual.
    const desdeCopia = (argv) => descifrarA("restauracion", age, clave, dump, pgBin("pg_restore"), ["--format=custom", ...argv]);
    const restaurar = (seccion) => desdeCopia([...conexion, "--no-owner", "--no-acl", "--exit-on-error", `--section=${seccion}`]);
    await restaurar("pre-data");
    await restaurar("data");
    // Antes de las claves ajenas: los ids que piden las que apuntan a auth.users.
    const post = await desdeCopia(["--section=post-data", "--no-owner", "--no-acl", "-f", "-"]);
    const fks = clavesAjenasAAuth(post);
    // Los usuarios e identidades de la copia (esquema copia), por tubería
    // al auth de mentira. Se cuentan antes de rellenar huecos: es lo que la
    // copia trae de verdad, y lo que se compara con producción.
    const filasAuth = {};
    for (const [rel, { origen, columnas }] of Object.entries(RELACIONES_COPIA)) {
      const csv = join(dirCopia, `copia.${rel}.csv.age`);
      if (!existsSync(csv)) continue;
      const copy = `\\copy ${origen} (${columnas.map(([c]) => c).join(", ")}) from pstdin with (format csv, header)`;
      await descifrarA("restauracion", age, clave, csv, pgBin("psql"), [...conexion, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", copy]);
      filasAuth[`copia.${rel}`] = numero(`select count(*) from ${origen};`);
    }
    if (Object.keys(filasAuth).length) {
      campos.auth = "si";
      // Con auth cargado: cuántos dueños de algo faltan en la copia de auth.users.
      campos.huerfanos = numero(`${sqlHuerfanos(fks)};`);
      if (campos.huerfanos > 0) console.warn(`OJO: ${campos.huerfanos} id(s) de usuario de public/ops no están en la copia de auth.users (creados entre el volcado y el CSV, o la copia de auth está mal).`);
    }
    // Lo que falte (sin copia de auth, todos), con ids sueltos: así las demás
    // claves ajenas se comprueban de verdad al restaurar.
    psql("restauracion", fks.map((f) => `insert into auth.users (id) select distinct ${f.columna} from ${f.tabla} where ${f.columna} is not null on conflict do nothing;`).join("\n"));
    await restaurar("post-data");
    psql("restauracion", SQL_SECUENCIAS);
    console.log(`Restaurada: ${fks.length} claves ajenas a auth.users atendidas, secuencias al día.`);

    const local = new pg.Client({ host: "127.0.0.1", port: puerto, user: "ensayo", database: "postgres" });
    await local.connect();
    let copia;
    try {
      copia = { ...(await contar(local)), ...filasAuth };
    } finally {
      await local.end();
    }
    campos.tablas = Object.keys(copia).length;
    campos.filas_copia = Object.values(copia).reduce((s, n) => s + n, 0);

    if (tiene("--sin-produccion")) {
      campos.resultado = "ok";
      campos.motivo = "-";
      console.log("Sin comparar con producción (--sin-produccion).");
    } else {
      const prod = await contarProduccion();
      detalle = veredicto(copia, prod);
      campos.resultado = detalle.resultado;
      campos.motivo = detalle.motivo;
      campos.filas_prod = detalle.filasProd;
      campos.diferencias = detalle.diferencias.length;
    }
  } catch (e) {
    campos.resultado = "fallo";
    campos.motivo = e instanceof FalloEnsayo ? e.motivo : "restauracion";
    console.error(`\nFALLO (${campos.motivo}): ${e.message}`);
  } finally {
    if (pgctl && existsSync(join(datos, "postmaster.pid"))) {
      const r = spawnSync(pgctl, ["-D", datos, "-m", "fast", "-w", "stop"], { encoding: "utf8" });
      if (r.status !== 0) console.error(`No pude parar el Postgres del ensayo: ${(r.stderr || "").trim()}. Páralo y borra ${tmp} a mano.`);
    }
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (e) {
      console.error(`OJO: no pude borrar ${tmp} (${e.message}); tiene la base en claro. Bórrala a mano.`);
      process.exitCode = 1;
    }
    vivo.tmp = vivo.datos = vivo.pgctl = null;
  }

  campos.segundos = Math.round((Date.now() - t0) / 1000);
  if (detalle?.diferencias?.length) {
    console.log("\nTablas con recuento distinto (copia → producción):");
    for (const d of detalle.diferencias) console.log(`  ${d.tabla}: ${d.copia} → ${d.prod}`);
  }
  if (detalle?.faltan?.length) console.log(`Faltan en la copia: ${detalle.faltan.join(", ")}`);
  if (detalle?.sobran?.length) console.log(`Sobran en la copia: ${detalle.sobran.join(", ")}`);
  if (detalle?.vacias?.length) console.log(`Vacías en la copia y no en producción: ${detalle.vacias.join(", ")}`);

  const linea = lineaEstructurada("ensayo-copia", campos);
  console.log(`\n${linea}`);
  if (!tiene("--no-registrar")) {
    appendFileSync(REGISTRO, `${lineaRegistroEnsayo(campos)}\n`);
  }
  if (campos.resultado !== "ok") process.exitCode = 1;
}

await main();
