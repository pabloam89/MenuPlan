#!/usr/bin/env node
/**
 * Ensayo de restauración de una copia de la base (encargo #247). Lo lanza
 * Pablo con `!`: pide aprobar dos veces en 1Password (la SSH al servidor y la
 * clave privada).
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
 * auth.uid(), un auth.users con los ids que hacen falta) y restaura con
 * `--exit-on-error`: `age -d` por tubería a `pg_restore`, una vez por sección,
 * así que el volcado en claro no se escribe nunca. Pone las secuencias al día y
 * cuenta las filas de cada tabla. Luego cuenta las mismas tablas en producción
 * con el usuario de solo lectura (`consulta_lectura`, en una transacción read
 * only) y compara (`veredicto` de scripts/lib/copias.mjs).
 *
 * OJO: mientras dura, el datadir del Postgres desechable SÍ tiene la base en
 * claro (es una base de verdad). Al final, o con Ctrl+C, Ctrl+Break o al cerrar
 * la ventana, se para el Postgres y se BORRA la carpeta temporal; si algo lo
 * impide, lo dice («OJO: no pude borrar…») y el siguiente ensayo la borra al
 * empezar (`limpiarRestos`).
 *
 * Deja una línea `ensayo-copia …` en ops/copias/ensayos.log (sin datos de
 * familias: nombres de tablas y recuentos). Cadencia: skill hetzner.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

import { RAIZ, leerEnv } from "./lib/env.mjs";
import {
  CLAVE_PRIVADA, DIR_SERVIDOR, NOMBRE_COPIA, OP_CLAVE_COPIAS, SERVIDOR, SQL_SECUENCIAS,
  camposRegistroEnsayo, clavesAjenasAAuth, fechaDeCopia, lineaEstructurada, veredicto,
} from "./lib/copias.mjs";
import { VAR_LECTURA } from "./lib/rolLectura.mjs";

/**
 * ops/copias/ensayos.log está en un repo público. false: la línea va entera
 * (con el total de filas). true: solo `recuento: ok|fallo` y el cociente
 * (`camposRegistroEnsayo`). Lo decide Pablo (#273); no se cambia sin su sí.
 */
const REGISTRO_SOLO_COCIENTE = false;

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
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz);
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
  for (const { t } of rows) filas[t] = Number((await client.query(`select count(*)::bigint as n from ${t}`)).rows[0].n);
  return filas;
}

async function contarProduccion() {
  let url;
  try {
    url = await leerEnv(VAR_LECTURA);
  } catch (e) {
    fallo("produccion", e.message);
  }
  if (!url) fallo("produccion", `Falta ${VAR_LECTURA}: el ensayo solo compara con el usuario de solo lectura.`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows: [q] } = await client.query("select current_user as yo");
    if (q.yo !== "consulta_lectura") fallo("produccion", `${VAR_LECTURA} entra como ${q.yo}, no como consulta_lectura`);
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");
    return await contar(client);
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
  const campos = { fecha: new Date().toISOString().replace(/\.\d+Z$/, "Z"), resultado: "fallo", motivo: "-", copia: "-", edad_h: "-", tablas: "-", filas_copia: "-", filas_prod: "-", diferencias: "-", auth: "no", segundos: "-" };
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
    if (cifrados.some((x) => x.endsWith(".csv.age"))) campos.auth = "si";
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
    psql("restauracion", fks.map((f) => `insert into auth.users (id) select distinct ${f.columna} from ${f.tabla} where ${f.columna} is not null on conflict do nothing;`).join("\n"));
    await restaurar("post-data");
    psql("restauracion", SQL_SECUENCIAS);
    console.log(`Restaurada: ${fks.length} claves ajenas a auth.users atendidas, secuencias al día.`);

    const local = new pg.Client({ host: "127.0.0.1", port: puerto, user: "ensayo", database: "postgres" });
    await local.connect();
    let copia;
    try {
      copia = await contar(local);
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
    const publica = lineaEstructurada("ensayo-copia", camposRegistroEnsayo(campos, { soloCociente: REGISTRO_SOLO_COCIENTE }));
    appendFileSync(REGISTRO, `${publica}\n`);
  }
  if (campos.resultado !== "ok") process.exitCode = 1;
}

await main();
