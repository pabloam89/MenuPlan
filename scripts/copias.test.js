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
  AVISOS, MOTIVOS_COPIA, NOMBRE_COPIA, RESULTADOS, SECUENCIAS,
  clavesAjenasAAuth, fechaDeCopia, leerLinea, lineaEstructurada, veredicto,
} from "./lib/copias.mjs";

const SCRIPT = join(import.meta.dirname, "..", "ops", "copias", "copia-base.sh");
const hayBash = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;
const CLAVE = `age1${"q".repeat(58)}`;
const ESTADO_LECTURA = "usuario\tconsulta_lectura\nescribe\t0\ntablas\t58\nsecuencia\tpublic.bot_cola_id_seq\n";

const FALSO_DOCKER = `#!/usr/bin/env bash
# docker run --rm -i -e COPIA_DB_URL -e PGSSLMODE <imagen> <orden…>
shift 8
todo="$*"
case "$todo" in
  *pg_dump*)
    [ -n "\${FALSO_DUMP_FALLA:-}" ] && { echo "pg_dump: error: conexión" >&2; exit 1; }
    head -c "\${FALSO_DUMP_BYTES:-300000}" /dev/zero | tr '\\0' 'x' ;;
  *copy*) printf 'id,email\\n1,a\\n' ;;
  *psql*)
    cat > /dev/null
    [ -n "\${FALSO_PSQL_FALLA:-}" ] && { echo "psql: error: conexión" >&2; exit 2; }
    printf '%b' "$FALSO_ESTADO" ;;
  *) echo "docker falso: no sé hacer $todo" >&2; exit 2 ;;
esac
`;
const FALSO_AGE = `#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2 ;; *) shift ;; esac; done
{ echo "age-encryption.org/v1"; cat; } > "$out"
`;
const FALSO_CURL = `#!/usr/bin/env bash
echo "$@" >> "$FALSO_CURL_LOG"
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
  for (const [n, txt] of [["docker", FALSO_DOCKER], ["age", FALSO_AGE], ["curl", FALSO_CURL]]) {
    writeFileSync(join(bin, n), txt.replace(/\r\n/g, "\n"));
    chmodSync(join(bin, n), 0o755);
  }
  writeFileSync(join(raiz, "destinatarios.txt"), destinatarios);
  const dir = join(raiz, "copias");
  return { raiz, bin, dir, curlLog: join(raiz, "curl.log") };
}

// Rutas en formato de bash también en Windows (C:\x → /c/x), para Git Bash.
const rutaBash = (p) => (process.platform === "win32" ? p.replace(/^([A-Za-z]):/, (_, l) => `/${l.toLowerCase()}`).replace(/\\/g, "/") : p);

function correr(s, env = {}) {
  const r = spawnSync("bash", [rutaBash(SCRIPT)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${s.bin}${delimiter}${process.env.PATH}`,
      COPIA_DB_URL: "postgresql://consulta_lectura.x:secreta@pooler.ejemplo:5432/postgres",
      COPIA_AVISO_URL: "https://hc-ping.ejemplo/uuid",
      COPIA_DESTINATARIOS: rutaBash(join(s.raiz, "destinatarios.txt")),
      COPIA_DIR: rutaBash(s.dir),
      COPIA_DOCKER: rutaBash(join(s.bin, "docker")),
      COPIA_AGE: rutaBash(join(s.bin, "age")),
      COPIA_CURL: rutaBash(join(s.bin, "curl")),
      FALSO_ESTADO: ESTADO_LECTURA,
      FALSO_CURL_LOG: rutaBash(s.curlLog),
      ...env,
    },
  });
  const registro = existsSync(join(s.dir, "copias.log")) ? readFileSync(join(s.dir, "copias.log"), "utf8").trim().split("\n") : [];
  const ultima = registro.length ? leerLinea(registro.at(-1)) : null;
  return { ...r, registro, ultima, curl: existsSync(s.curlLog) ? readFileSync(s.curlLog, "utf8") : "" };
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
    expect(r.ultima.campos).toMatchObject({ resultado: "ok", motivo: "-", tablas: "58", secuencias: "sin-valor", auth: "no", semanal: "si", diarias: "1", semanales: "1", aviso: "ok" });
    const [copia] = copiasEn(join(s.dir, "diaria"));
    expect(readFileSync(join(s.dir, "diaria", copia, "base.dump.age"), "utf8").startsWith("age-encryption.org/v1")).toBe(true);
    expect(r.curl).not.toMatch(/\/fail/);
    // La URL de la base no sale ni en la línea ni en lo que se manda a Healthchecks.
    expect(r.registro.join("\n") + r.curl + r.stdout).not.toMatch(/secreta/);
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

  it("con secuencias legibles, secuencias: con-valor", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: "usuario\tcopia_lectura\nescribe\t0\ntablas\t58\n" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos.secuencias).toBe("con-valor");
  });

  it("con el esquema copia, saca su CSV cifrado y auth: si", () => {
    const s = montar();
    const r = correr(s, { FALSO_ESTADO: `${ESTADO_LECTURA}copia\tauth_usuarios\n` });
    expect(r.status, r.stderr).toBe(0);
    expect(r.ultima.campos.auth).toBe("si");
    const [copia] = copiasEn(join(s.dir, "diaria"));
    expect(existsSync(join(s.dir, "diaria", copia, "copia.auth_usuarios.csv.age"))).toBe(true);
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
