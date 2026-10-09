// Copias de la base (encargo #247): el script del servidor con binarios falsos
// (docker, age y curl), y las piezas puras del ensayo de restauración.
//
// Lo que vigila:
//   - una copia buena deja su línea `resultado: ok` y poda a 7+4;
//   - cada fallo deja `resultado: fallo` con el motivo de SU paso, sale con
//     código distinto de 0 y avisa a Healthchecks por /fail (#177);
//   - con la URL de administrador no vuelca nada (motivo config);
//   - si pg_dump falla, no queda un fichero cifrado que parezca una copia
//     (age cifra también una entrada vacía: lo vimos en el primer ensayo);
//   - los pasos del script y MOTIVOS_COPIA son la misma lista.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AVISOS, MOTIVOS_COPIA, NOMBRE_COPIA, RELACIONES_COPIA, RESULTADOS, SECUENCIAS, TABLAS_SIN_COPIA,
  camposRegistroEnsayo, clavesAjenasAAuth, columnasCopiaQueNoCuadran, comprobarDestinatarios, fechaDeCopia, leerLinea, lineaEstructurada, lineaRegistroEnsayo,
  sqlAuthDeMentira, sqlHuerfanos, veredicto,
} from "./lib/copias.mjs";
import { ROL_COPIA } from "./lib/rolLectura.mjs";

const SCRIPT = join(import.meta.dirname, "..", "ops", "copias", "copia-base.sh");
const hayBash = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;
const CLAVE = `age1${"q".repeat(58)}`;
// Lo que devuelve la consulta de catálogo del script con copia_lectura:
// lee todas las secuencias y las dos vistas del esquema copia.
const ESTADO_COPIA = "usuario\tcopia_lectura\nescribe\t0\ntablas\t58\ncopia\tauth_usuarios\ncopia\tauth_identidades\n";

// docker falso: registra su argv, entiende `run` (con --rm, -i, --label, -e y
// -v), `ps` y `rm`, y ejecuta la orden del contenedor con SOLO el entorno que
// se le pasa con -e (más PATH y los FALSO_*). La ruta de un -v se traduce a la
// del host. Así un pg_dump o psql falsos ven lo mismo que verían de verdad.
const FALSO_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FALSO_ARGV_LOG"
case "$1" in
  ps) [ -n "\${FALSO_PS_IDS:-}" ] && echo "$FALSO_PS_IDS"; exit 0 ;;
  rm) exit 0 ;;
  run) shift ;;
  *) echo "docker falso: no sé hacer $1" >&2; exit 2 ;;
esac
vars=("PATH=$PATH")
for n in $(compgen -v FALSO_); do vars+=("$n=\${!n}"); done
mapas=()
while [ $# -gt 0 ]; do
  case "$1" in
    --rm|-i|--init) shift ;;
    --label) shift 2 ;;
    -e) case "$2" in *=*) vars+=("$2") ;; *) [ -n "\${!2+x}" ] && vars+=("$2=\${!2}") ;; esac; shift 2 ;;
    -v) mapas+=("$2"); shift 2 ;;
    -*) echo "docker falso: opción $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
shift # la imagen
for i in "\${!vars[@]}"; do
  for m in "\${mapas[@]}"; do
    IFS=: read -r h c _ <<< "$m"
    vars[i]=\${vars[i]//"$c"/"$h"}
  done
done
exec env -i "\${vars[@]}" "$@"
`;
// Lo que comparten pg_dump y psql falsos: registran su argv y solo «entran»
// si el passfile de PGPASSFILE trae la línea esperada (la contraseña no va en la URL).
const FALSO_PG_AUTH = `echo "$(basename "$0") $*" >> "$FALSO_ARGV_LOG"
linea="\${FALSO_PASS_LINEA:-*:*:*:*:secreta}"
if [ -z "\${PGPASSFILE:-}" ] || ! grep -qxF -- "$linea" "$PGPASSFILE"; then
  echo "$(basename "$0"): error: password authentication failed" >&2; exit 2
fi
`;
const FALSO_PG_DUMP = `#!/usr/bin/env bash
${FALSO_PG_AUTH}[ -n "\${FALSO_DUMP_FALLA:-}" ] && { echo "pg_dump: error: conexión" >&2; exit 1; }
[ -n "\${FALSO_DUMP_DUERME:-}" ] && { : > "$FALSO_DUMP_MARCA"; sleep "$FALSO_DUMP_DUERME"; }
head -c "\${FALSO_DUMP_BYTES:-300000}" /dev/zero | tr '\0' 'x'
`;
const FALSO_PSQL = `#!/usr/bin/env bash
${FALSO_PG_AUTH}case "$*" in
  *copy*) cat > /dev/null; printf 'id,email\n1,a\n' ;;
  *)
    cat > /dev/null
    [ -n "\${FALSO_PSQL_FALLA:-}" ] && { echo "psql: error: conexión" >&2; exit 2; }
    printf '%b' "$FALSO_ESTADO" ;;
esac
`;
const FALSO_AGE = `#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2 ;; *) shift ;; esac; done
{ echo "age-encryption.org/v1"; cat; } > "$out"
`;
// curl falso: el argv y lo que le llega por stdin (la configuración, con la URL), por separado.
const FALSO_CURL = `#!/usr/bin/env bash
echo "ARGV $*" >> "$FALSO_CURL_LOG"
echo "STDIN $(cat)" >> "$FALSO_CURL_LOG"
[ -z "\${FALSO_CURL_FALLA:-}" ]
`;

const carpetas = [];
afterEach(() => {
  while (carpetas.length) rmSync(carpetas.pop(), { recursive: true, force: true });
});

/** Un servidor de mentira: binarios falsos, destinatarios y carpeta de copias. */
function montar({ destinatarios = `# comentario\n${CLAVE}\n` } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "copias-test-"));
  carpetas.push(raiz);
  const bin = join(raiz, "bin");
  mkdirSync(bin);
  for (const [n, txt] of [["docker", FALSO_DOCKER], ["age", FALSO_AGE], ["curl", FALSO_CURL], ["pg_dump", FALSO_PG_DUMP], ["psql", FALSO_PSQL]]) {
    writeFileSync(join(bin, n), txt.replace(/\r\n/g, "\n"));
    chmodSync(join(bin, n), 0o755);
  }
  writeFileSync(join(raiz, "destinatarios.txt"), destinatarios);
  const dir = join(raiz, "copias");
  return { raiz, bin, dir, curlLog: join(raiz, "curl.log"), argvLog: join(raiz, "argv.log") };
}

// Rutas en formato de bash también en Windows (C:\x → /c/x), para Git Bash.
const rutaBash = (p) => (process.platform === "win32" ? p.replace(/^([A-Za-z]):/, (_, l) => `/${l.toLowerCase()}`).replace(/\\/g, "/") : p);

function entorno(s) {
  return {
      PATH: `${s.bin}${delimiter}${process.env.PATH}`,
      COPIA_DB_URL: "postgresql://copia_lectura.x:secreta@pooler.ejemplo:5432/postgres",
      COPIA_AVISO_URL: "https://hc-ping.ejemplo/uuid",
      COPIA_DESTINATARIOS: rutaBash(join(s.raiz, "destinatarios.txt")),
      COPIA_DIR: rutaBash(s.dir),
      COPIA_DOCKER: rutaBash(join(s.bin, "docker")),
      COPIA_AGE: rutaBash(join(s.bin, "age")),
      COPIA_CURL: rutaBash(join(s.bin, "curl")),
      FALSO_ESTADO: ESTADO_COPIA,
      FALSO_CURL_LOG: rutaBash(s.curlLog),
      FALSO_ARGV_LOG: rutaBash(s.argvLog),
  };
}

function correr(s, env = {}, args = []) {
  const r = spawnSync("bash", [rutaBash(SCRIPT), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...entorno(s), ...env },
  });
  const registro = existsSync(join(s.dir, "copias.log")) ? readFileSync(join(s.dir, "copias.log"), "utf8").trim().split("\n") : [];
  const ultima = registro.length ? leerLinea(registro.at(-1)) : null;
  const leer = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  return { ...r, registro, ultima, curl: leer(s.curlLog), argv: leer(s.argvLog) };
}

const copiasEn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((d) => NOMBRE_COPIA.test(d)).sort() : []);
const hace = (dias) => new Date(Date.now() - dias * 86400e3).toISOString().replace(/[-:]/g, "").replace(/^(\d{4})(\d{2})(\d{2})T(\d{6}).*$/, "$1-$2-$3T$4Z");

describe("copia-base.sh: sintaxis y vocabulario", () => {
  it.skipIf(!hayBash)("bash -n pasa", () => {
    const r = spawnSync("bash", ["-n", rutaBash(SCRIPT)], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("los pasos del script son MOTIVOS_COPIA, ni más ni menos", () => {
    const texto = readFileSync(SCRIPT, "utf8");
    const pasos = [...new Set([...texto.matchAll(/^\s*paso ([a-z-]+)\s*$/gm)].map((m) => m[1]))].sort();
    expect(pasos).toEqual([...MOTIVOS_COPIA].sort());
  });

  it("las tablas que el script deja fuera son TABLAS_SIN_COPIA", () => {
    const texto = readFileSync(SCRIPT, "utf8");
    expect(/^TABLAS_SIN_COPIA="([^"]*)"$/m.exec(texto)?.[1].split(" ").sort()).toEqual([...TABLAS_SIN_COPIA].sort());
  });

  it("el usuario y las vistas que exige el script son ROL_COPIA y RELACIONES_COPIA", () => {
    const texto = readFileSync(SCRIPT, "utf8");
    expect(/^ROL_COPIA=(\S+)$/m.exec(texto)?.[1]).toBe(ROL_COPIA);
    expect(/^RELACIONES_COPIA="([^"]*)"$/m.exec(texto)?.[1].split(" ").sort()).toEqual(Object.keys(RELACIONES_COPIA).sort());
  });

  it("la línea que escribe el script lleva los campos que lee leerLinea", () => {
    const texto = readFileSync(SCRIPT, "utf8");
    const formato = /printf 'copia-base ([^']+)\\n'/.exec(texto)[1];
    const campos = [...formato.matchAll(/(\w+): %s/g)].map((m) => m[1]);
    expect(campos).toEqual(["fecha", "resultado", "motivo", "bytes", "segundos", "tablas", "secuencias", "auth", "semanal", "diarias", "semanales", "aviso"]);
  });
});

describe.skipIf(!hayBash)("copia-base.sh con binarios falsos", () => {
  it("una copia buena: línea ok, cifrada, semanal la primera vez y aviso a Healthchecks", () => {
    const s = montar();
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos).toMatchObject({ resultado: "ok", motivo: "-", tablas: "58", secuencias: "con-valor", auth: "si", semanal: "si", diarias: "1", semanales: "1", aviso: "ok" });
    const [copia] = copiasEn(join(s.dir, "diaria"));
    expect(readFileSync(join(s.dir, "diaria", copia, "base.dump.age"), "utf8").startsWith("age-encryption.org/v1")).toBe(true);
    expect(r.curl).not.toMatch(/\/fail/);
    // La URL de la base no sale ni en la línea ni en lo que se manda a Healthchecks.
    expect(r.registro.join("\n") + r.curl + r.stdout).not.toMatch(/secreta/);
  });

  it("la contraseña no sale en ningún argv (docker, pg_dump, psql) y la URL de ping tampoco", () => {
    const s = montar();
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    expect(r.argv).toMatch(/^pg_dump .*postgresql:\/\/copia_lectura\.x@pooler\.ejemplo:5432\/postgres/m);
    expect(r.argv).toMatch(/^psql /m);
    expect(r.argv).not.toMatch(/secreta/);
    const argvCurl = r.curl.split("\n").filter((l) => l.startsWith("ARGV"));
    expect(argvCurl.length).toBeGreaterThan(0);
    expect(argvCurl.join("\n")).not.toMatch(/hc-ping/);
    expect(r.curl).toMatch(/^STDIN url = "https:\/\/hc-ping\.ejemplo\/uuid"$/m);
  });

  it("con RUNTIME_DIRECTORY (systemd), el passfile vive ahí y no queda nada al acabar", () => {
    const s = montar();
    const run = join(s.raiz, "run");
    mkdirSync(run);
    const r = correr(s, { RUNTIME_DIRECTORY: rutaBash(run) });
    expect(r.status, r.stderr).toBe(0);
    const docker = r.argv.split("\n").filter((l) => l.startsWith("docker run"));
    expect(docker.length).toBeGreaterThan(0);
    for (const l of docker) expect(l).toContain(`-v ${rutaBash(run)}/`);
    // --init: pg_dump no es el PID 1 del contenedor y muere con TERM.
    for (const l of docker) expect(l).toMatch(/ --init /);
    expect(readdirSync(run)).toEqual([]);
  });

  it("una contraseña con %xx, dos puntos y barra llega decodificada y escapada al passfile", () => {
    const s = montar();
    const r = correr(s, {
      COPIA_DB_URL: "postgresql://copia_lectura.x:se%3Acr%40e%5Cta@pooler.ejemplo:5432/postgres",
      FALSO_PASS_LINEA: String.raw`*:*:*:*:se\:cr@e\\ta`,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.argv).not.toMatch(/se%3A|cr%40/);
  });

  it("una URL sin contraseña: motivo config, sin volcar", () => {
    const s = montar();
    const r = correr(s, { COPIA_DB_URL: "postgresql://copia_lectura.x@pooler.ejemplo:5432/postgres" });
    expect(r.status).toBe(1);
    expect(r.ultima.campos.motivo).toBe("config");
    expect(r.argv).not.toMatch(/pg_dump/);
  });

  it("con dos relaciones en el esquema copia salen las dos (docker -i no se come el bucle)", () => {
    const s = montar();
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    const [copia] = copiasEn(join(s.dir, "diaria"));
    const csvs = readdirSync(join(s.dir, "diaria", copia)).filter((f) => f.endsWith(".csv.age")).sort();
    expect(csvs).toEqual(["copia.auth_identidades.csv.age", "copia.auth_usuarios.csv.age"]);
  });

  it("con --aceptar-tamano, una copia de menos de la mitad pasa y se vuelve la referencia", () => {
    const s = montar();
    mkdirSync(s.dir, { recursive: true });
    writeFileSync(join(s.dir, "copias.log"), "copia-base fecha: 2026-10-08T024000Z resultado: ok motivo: - bytes: 9000000 segundos: 14 tablas: 58\n");
    const r = correr(s, {}, ["--aceptar-tamano"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos.resultado).toBe("ok");
    expect(r.stderr).toMatch(/--aceptar-tamano/);
    expect(correr(s).status).toBe(0); // la siguiente ya compara con esta
  });

  it("un argumento desconocido: motivo config", () => {
    const s = montar();
    const r = correr(s, {}, ["--aceptar-todo"]);
    expect(r.status).toBe(1);
    expect(r.ultima.campos.motivo).toBe("config");
  });

  it("cortada con TERM a mitad del volcado: línea de fallo con el paso, /fail y quita sus contenedores", () => {
    const s = montar();
    // Como systemd: TERM a todo el grupo de procesos, no solo al script.
    // Espera a que el pg_dump falso esté dentro (deja una marca) y entonces corta.
    const marca = join(s.raiz, "dump-empezado");
    const envolver = 'set -m; bash "$1" & p=$!; for i in $(seq 150); do [ -e "$2" ] && break; sleep 0.2; done; kill -TERM -- -$p 2>/dev/null || kill -TERM $p; wait $p';
    const r = spawnSync("bash", ["-c", envolver, "envolver", rutaBash(SCRIPT), rutaBash(marca)], {
      encoding: "utf8",
      env: { ...process.env, ...entorno(s), FALSO_DUMP_DUERME: "5", FALSO_DUMP_MARCA: rutaBash(marca), FALSO_PS_IDS: "falso123" },
    });
    const registro = readFileSync(join(s.dir, "copias.log"), "utf8").trim().split("\n");
    expect(r.status, r.stderr).not.toBe(0);
    expect(leerLinea(registro.at(-1)).campos).toMatchObject({ resultado: "fallo", motivo: "dump" });
    expect(readFileSync(s.argvLog, "utf8")).toMatch(/^docker rm -f falso123$/m);
    expect(readFileSync(s.curlLog, "utf8")).toMatch(/\/fail/);
    expect(copiasEn(join(s.dir, "diaria"))).toEqual([]);
  });

  it("poda a COPIA_DIARIAS y COPIA_SEMANALES sin tocar lo que no es una copia", () => {
    const s = montar();
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8]) mkdirSync(join(s.dir, "diaria", hace(d)), { recursive: true });
    for (const d of [8, 15, 22, 29, 36]) mkdirSync(join(s.dir, "semanal", hace(d)), { recursive: true });
    mkdirSync(join(s.dir, "diaria", "notas"));
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    expect(copiasEn(join(s.dir, "diaria"))).toHaveLength(7);
    expect(copiasEn(join(s.dir, "semanal"))).toHaveLength(4);
    expect(copiasEn(join(s.dir, "diaria"))).not.toContain(hace(7)); // se van las más viejas
    expect(existsSync(join(s.dir, "diaria", "notas"))).toBe(true);
    expect(r.ultima.campos).toMatchObject({ semanal: "si", diarias: "7", semanales: "4" });
  });

  it("no hace semanal si la última tiene menos de 7 días", () => {
    const s = montar();
    mkdirSync(join(s.dir, "semanal", hace(2)), { recursive: true });
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos).toMatchObject({ semanal: "no", semanales: "1" });
  });

  it("si pg_dump falla: motivo dump, sin copia que parezca buena, aviso /fail y código 1", () => {
    const s = montar();
    const r = correr(s, { FALSO_DUMP_FALLA: "1" });
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "dump", aviso: "ok" });
    expect(copiasEn(join(s.dir, "diaria"))).toEqual([]);
    expect(readdirSync(s.dir).filter((d) => d.startsWith(".parcial"))).toEqual([]);
    expect(r.curl).toMatch(/\/fail/);
  });

  it("si no conecta: motivo conexion", () => {
    const s = montar();
    const r = correr(s, { FALSO_PSQL_FALLA: "1" });
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "conexion" });
  });

  it("con la URL de administrador no vuelca nada: motivo config", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: "usuario\tpostgres\nescribe\t58\ntablas\t58\n" });
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "config" });
    expect(copiasEn(join(s.dir, "diaria"))).toEqual([]);
  });

  it("con un usuario que puede escribir, aunque no se llame postgres: motivo config", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: "usuario\totro\nescribe\t3\ntablas\t58\n" });
    expect(r.status).toBe(1);
    expect(r.ultima.campos.motivo).toBe("config");
  });

  it("sin clave pública: motivo config", () => {
    const s = montar({ destinatarios: "# todavía ninguna\n" });
    const r = correr(s);
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "config" });
  });

  it("pg_dump deja fuera entera cada tabla de TABLAS_SIN_COPIA (sin ella no puede bloquearla)", () => {
    const s = montar();
    const r = correr(s);
    expect(r.status, r.stderr).toBe(0);
    const dump = r.argv.split("\n").find((l) => l.startsWith("pg_dump "));
    for (const t of TABLAS_SIN_COPIA) expect(dump).toContain(`--exclude-table=${t}`);
  });

  it("con una secuencia que no puede leer, la copia sigue y lo dice: secuencias: sin-valor", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: `${ESTADO_COPIA}secuencia\tpublic.bot_cola_id_seq\n` });
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos.secuencias).toBe("sin-valor");
    expect(r.argv).toMatch(/--exclude-table-data=public\.bot_cola_id_seq/);
  });

  it("con consulta_lectura (aprobado para el PC, no para el servidor): motivo config, sin volcar (#273)", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: ESTADO_COPIA.replace("copia_lectura", "consulta_lectura") });
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "config" });
    expect(r.argv).not.toMatch(/pg_dump/);
  });

  it.each(["auth_usuarios", "auth_identidades"])("si copia_lectura no ve copia.%s: motivo auth, sin copia que parezca buena", (rel) => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: ESTADO_COPIA.replace(`copia\t${rel}\n`, "") });
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "auth" });
    expect(r.stderr).toMatch(new RegExp(`copia\\.${rel}`));
    expect(copiasEn(join(s.dir, "diaria"))).toEqual([]);
  });

  it("una copia de menos de la mitad que la última buena: motivo incompleta", () => {
    const s = montar();
    mkdirSync(s.dir, { recursive: true });
    writeFileSync(join(s.dir, "copias.log"), "copia-base fecha: 2026-10-08T024000Z resultado: ok motivo: - bytes: 9000000 segundos: 14 tablas: 58\n");
    const r = correr(s);
    expect(r.status).toBe(1);
    expect(r.ultima.campos).toMatchObject({ resultado: "fallo", motivo: "incompleta" });
  });

  it("sin canal de aviso copia igual pero lo dice (aviso: sin-canal)", () => {
    const s = montar();
    const r = correr(s, { COPIA_AVISO_URL: "" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos.aviso).toBe("sin-canal");
    expect(r.stderr).toMatch(/sin COPIA_AVISO_URL/);
  });

  it("copia buena pero el aviso falla: código 3 y aviso: fallo", () => {
    const s = montar();
    const r = correr(s, { FALSO_CURL_FALLA: "1" });
    expect(r.status).toBe(3);
    expect(r.ultima.campos).toMatchObject({ resultado: "ok", aviso: "fallo" });
  });
});

describe("vocabulario y línea estructurada", () => {
  it("los valores de una línea del script están en su vocabulario", () => {
    const l = leerLinea("copia-base fecha: 2026-10-10T024312Z resultado: fallo motivo: dump bytes: 0 secuencias: sin-valor aviso: sin-canal");
    expect(RESULTADOS).toContain(l.campos.resultado);
    expect(MOTIVOS_COPIA).toContain(l.campos.motivo);
    expect(SECUENCIAS).toContain(l.campos.secuencias);
    expect(AVISOS).toContain(l.campos.aviso);
  });

  it("lineaEstructurada y leerLinea van y vuelven, sin espacios en los valores", () => {
    const linea = lineaEstructurada("ensayo-copia", { resultado: "fallo", motivo: "recuento", nota: "dos palabras", vacio: "" });
    expect(leerLinea(linea)).toEqual({ tipo: "ensayo-copia", campos: { resultado: "fallo", motivo: "recuento", nota: "dos_palabras", vacio: "-" } });
    expect(leerLinea("otra cosa: 1")).toBeNull();
  });

  it("fechaDeCopia lee el sello y rechaza lo que no lo es", () => {
    expect(fechaDeCopia("2026-10-10T024312Z").toISOString()).toBe("2026-10-10T02:43:12.000Z");
    expect(fechaDeCopia("notas")).toBeNull();
    expect(fechaDeCopia("2026-13-40T999999Z")).toBeNull();
  });
});

describe("clavesAjenasAAuth", () => {
  const sql = `
ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_owner_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_household_fkey FOREIGN KEY (household_id) REFERENCES public.households(id);
ALTER TABLE ONLY public.bot_messages
    ADD CONSTRAINT bot_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
`;
  it("encuentra las que apuntan a auth.users y no las demás", () => {
    expect(clavesAjenasAAuth(sql)).toEqual([
      { tabla: "public.households", columna: "owner_id", nombre: "households_owner_fkey" },
      { tabla: "public.bot_messages", columna: "user_id", nombre: "bot_messages_user_id_fkey" },
    ]);
  });
  it("una compuesta no se adivina: error", () => {
    expect(() => clavesAjenasAAuth("ALTER TABLE ONLY public.x\n    ADD CONSTRAINT x_fk FOREIGN KEY (a, b) REFERENCES auth.users(id, email);")).toThrow(/x_fk/);
  });
});

describe("veredicto del ensayo", () => {
  const prod = { "public.a": 100, "public.b": 50, "public.c": 0 };
  it("igual, o un poco por detrás (la copia es de hasta un día antes): ok", () => {
    expect(veredicto({ ...prod }, prod).resultado).toBe("ok");
    const r = veredicto({ "public.a": 97, "public.b": 50, "public.c": 0 }, prod);
    expect(r).toMatchObject({ resultado: "ok", diferencias: [{ tabla: "public.a", copia: 97, prod: 100 }] });
  });
  it("falta una tabla: tablas-distintas", () => {
    expect(veredicto({ "public.a": 100, "public.b": 50 }, prod).motivo).toBe("tablas-distintas");
  });
  it("sobra una tabla: tablas-distintas", () => {
    expect(veredicto({ ...prod, "public.d": 1 }, prod).motivo).toBe("tablas-distintas");
  });
  it("una tabla con datos llega vacía: recuento", () => {
    expect(veredicto({ "public.a": 100, "public.b": 0, "public.c": 0 }, prod).motivo).toBe("recuento");
  });
  it("faltan más del 10 % de las filas: recuento", () => {
    expect(veredicto({ "public.a": 80, "public.b": 50, "public.c": 0 }, prod).motivo).toBe("recuento");
  });
});

describe("comprobarDestinatarios", () => {
  const A = `age1${"a".repeat(58)}`;
  const B = `age1${"b".repeat(58)}`;
  it("coincide si el fichero es justo la pública de la ficha (comentarios aparte)", () => {
    expect(comprobarDestinatarios(`# cabecera\n\n${A}\n`, A).coincide).toBe(true);
  });
  it("no coincide si sobra otra clave, aunque la de la ficha esté", () => {
    expect(comprobarDestinatarios(`${A}\n${B}\n`, A)).toMatchObject({ coincide: false, sobran: [B] });
  });
  it("no coincide si falta la de la ficha", () => {
    expect(comprobarDestinatarios(`${B}\n`, A)).toMatchObject({ coincide: false, falta: true });
  });
  it("no coincide con un fichero sin claves ni con una pública vacía", () => {
    expect(comprobarDestinatarios("# nada\n", A).coincide).toBe(false);
    expect(comprobarDestinatarios("", "").coincide).toBe(false);
  });
});

describe("ensayos.log, en el repo público, sin el tamaño de la base (#273)", () => {
  const campos = { fecha: "2026-10-10T090000Z", resultado: "ok", motivo: "-", copia: "2026-10-10T024312Z", edad_h: 6, tablas: 58, filas_copia: 98765, filas_prod: 100321, diferencias: 3, auth: "si", huerfanos: 0, segundos: 40 };

  it("la línea que se añade no lleva tablas ni filas, sí recuento y cociente", () => {
    const { campos: c } = leerLinea(lineaRegistroEnsayo(campos));
    for (const k of ["tablas", "filas_copia", "filas_prod", "diferencias"]) expect(c, k).not.toHaveProperty(k);
    expect(lineaRegistroEnsayo(campos)).not.toMatch(/98765|100321/);
    expect(c).toMatchObject({ resultado: "ok", recuento: "ok", cociente: "0.98", auth: "si" });
  });

  it("ninguna línea ya escrita en ops/copias/ensayos.log lleva filas", () => {
    const log = readFileSync(join(import.meta.dirname, "..", "ops", "copias", "ensayos.log"), "utf8");
    const malas = log.split(/\r?\n/).filter((l) => /^ensayo-copia /.test(l) && /\b(filas_copia|filas_prod|tablas): \d/.test(l));
    expect(malas).toEqual([]);
  });

  it("el ensayo escribe con lineaRegistroEnsayo, no con la línea entera", () => {
    const texto = readFileSync(join(import.meta.dirname, "copias-ensayo.mjs"), "utf8");
    expect(texto).toMatch(/appendFileSync\(REGISTRO, `\$\{lineaRegistroEnsayo\(campos\)\}\\n`\)/);
    expect(texto).not.toMatch(/soloCociente:\s*false/);
  });
});

describe("columnasCopiaQueNoCuadran (el ensayo contra information_schema de copia)", () => {
  const TIPO = { uuid: "uuid", text: "text", timestamptz: "timestamp with time zone", boolean: "boolean" };
  const buenas = Object.entries(RELACIONES_COPIA).flatMap(([rel, { columnas }]) =>
    columnas.map(([c, t], i) => ({ table_name: rel, column_name: c, data_type: TIPO[t], ordinal_position: i + 1 })));

  it("cuadra con lo que dice RELACIONES_COPIA, aunque lleguen desordenadas", () => {
    expect(columnasCopiaQueNoCuadran([...buenas].reverse())).toEqual([]);
  });
  it("un tipo distinto no cuadra", () => {
    const mal = buenas.map((f) => (f.column_name === "is_anonymous" ? { ...f, data_type: "text" } : f));
    expect(columnasCopiaQueNoCuadran(mal)).toEqual([expect.stringMatching(/copia\.auth_usuarios/)]);
  });
  it("una columna de más no cuadra", () => {
    const mal = [...buenas, { table_name: "auth_identidades", column_name: "identity_data", data_type: "jsonb", ordinal_position: 99 }];
    expect(columnasCopiaQueNoCuadran(mal)).toEqual([expect.stringMatching(/copia\.auth_identidades/)]);
  });
  it("sin la vista no cuadra", () => {
    expect(columnasCopiaQueNoCuadran(buenas.filter((f) => f.table_name !== "auth_usuarios"))).toEqual([expect.stringMatching(/hay \(nada\)/)]);
  });
});

describe("auth de mentira del ensayo y huérfanos", () => {
  it("auth.users y auth.identities llevan las columnas de RELACIONES_COPIA, con id como clave", () => {
    const sql = sqlAuthDeMentira();
    for (const { origen, columnas } of Object.values(RELACIONES_COPIA)) {
      const def = new RegExp(String.raw`create table ${origen.replace(".", "\\.")} \(([^;]*)\);`).exec(sql)?.[1];
      expect(def, origen).toBeTruthy();
      for (const [c, t] of columnas) expect(def, `${origen}.${c}`).toMatch(new RegExp(String.raw`(^|, )${c} ${t}\b`));
      expect(def).toMatch(/(^|, )id uuid primary key/);
    }
    // Las funciones del volcado nombran los metadatos: siguen en el auth de mentira.
    expect(sql).toMatch(/raw_user_meta_data jsonb/);
  });

  it("sqlHuerfanos cuenta ids de todas las claves ajenas que no están en auth.users", () => {
    const sql = sqlHuerfanos([{ tabla: "public.households", columna: "owner_id" }, { tabla: "public.bot_messages", columna: "user_id" }]);
    expect(sql).toMatch(/select owner_id as id from public\.households where owner_id is not null/);
    expect(sql).toMatch(/select user_id as id from public\.bot_messages/);
    expect(sql).toMatch(/not exists \(select 1 from auth\.users u where u\.id = x\.id\)/);
    expect(sqlHuerfanos([])).toBe("select 0 as n");
  });
});

describe("camposRegistroEnsayo", () => {
  const campos = { fecha: "2026-10-10T090000Z", resultado: "ok", motivo: "-", tablas: 58, filas_copia: 980, filas_prod: 1000, diferencias: 3, auth: "no" };
  it("por defecto no cambia nada", () => {
    expect(camposRegistroEnsayo(campos)).toEqual(campos);
  });
  it("con soloCociente quita tablas y filas y deja recuento y cociente", () => {
    const r = camposRegistroEnsayo(campos, { soloCociente: true });
    expect(r).toEqual({ fecha: campos.fecha, resultado: "ok", motivo: "-", auth: "no", recuento: "ok", cociente: "0.98" });
    expect(lineaEstructurada("ensayo-copia", r)).not.toMatch(/980|1000/);
  });
  it("un ensayo fallido sin producción: recuento fallo y cociente -", () => {
    const r = camposRegistroEnsayo({ ...campos, resultado: "fallo", filas_prod: "-" }, { soloCociente: true });
    expect(r).toMatchObject({ recuento: "fallo", cociente: "-" });
  });
});
