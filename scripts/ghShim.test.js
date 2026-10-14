// ghShim.test.js — el `gh` de las sesiones que pide el token al usarse (#719, fondo #715).
//
// Lo que se prueba, por capas:
//   1. La carpeta `scripts/bin` (contiene solo `gh`, ejecutable en git): ahí van delante en el PATH, y
//      todo lo que haya dentro tapa a otra orden.
//   2. La lógica (`main` de gh-shim.mjs) con un `gh` falso que vuelca sus argumentos y su GH_TOKEN a un
//      fichero, y un canje y una caché de mentira.
//   3. El camino entero con procesos de verdad (bash, el script `scripts/bin/gh`, la caché de un perfil de
//      usuario de prueba) y la sonda H2: `git` ejecuta el ayudante `!` con el PATH de la sesión y
//      `gh auth git-credential` usa el GH_TOKEN del entorno de quien lo lanza. Va aquí, con `spawnSync`,
//      porque la guardia niega esas órdenes por Bash y no se rodea.
// Ningún token es real: son `ghs_…` inventados. Nada lee una variable de entorno que cambie el canje.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CARPETA_SHIM, NEGADO, SIN_GH, buscarGhReal, main, negacion, tokenParaUsar } from "./gh-shim.mjs";
import { escribirCache, falloReciente } from "./lib/cacheTokenSesion.mjs";
import { APP_ID, AUTOR_POR_DEFECTO, ErrorTokenSesion, MOTIVOS, TOKEN_CENTINELA, lineaDePath, lineasDeEntorno } from "./lib/tokenSesion.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN = 60_000;
const TOKEN_CACHE = `ghs_${"C4che".repeat(6)}`;
const TOKEN_NUEVO = `ghs_${"N0evo".repeat(6)}`;
const TOKEN_VIEJO = `ghs_${"V1ejo".repeat(6)}`;
const dirs = [];
const temporal = (prefijo = "gh-shim-") => {
  const d = mkdtempSync(join(tmpdir(), prefijo));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("la carpeta scripts/bin", () => {
  it("contiene exactamente `gh`: va delante en el PATH y todo lo que haya tapa a otra orden", () => {
    expect(readdirSync(join(RAIZ, "scripts", "bin"))).toEqual(["gh"]);
  });
  it("`gh` es ejecutable EN GIT (100755): sin eso, en Linux o en la nube no se ejecuta", () => {
    const salida = execFileSync("git", ["ls-files", "-s", "scripts/bin/gh"], { cwd: RAIZ, encoding: "utf8" });
    expect(salida.startsWith("100755 ")).toBe(true);
  });
  it("es un script de sh de dos líneas que llama a Node con los argumentos tal cual", () => {
    const lineas = readFileSync(join(RAIZ, "scripts", "bin", "gh"), "utf8").split("\n").filter(Boolean);
    expect(lineas).toEqual(["#!/bin/sh", 'exec node "$(dirname "$0")/../gh-shim.mjs" "$@"']);
  });
  it("CARPETA_SHIM es esa carpeta", () => {
    expect(CARPETA_SHIM).toBe(join(RAIZ, "scripts", "bin"));
  });
  it("el shim no usa shell, no lee variables que cambien el canje y no entrega ningún gh.cmd", () => {
    const src = readFileSync(join(RAIZ, "scripts", "gh-shim.mjs"), "utf8");
    expect(src).not.toMatch(/shell\s*:/);
    expect(src).not.toMatch(/process\.env\.(MENUPLAN|GH_SHIM|TOKEN_)/);
    expect(src).not.toMatch(/console\.log|stdout\.write/); // nunca imprime: el token va al entorno del hijo
    expect(readdirSync(join(RAIZ, "scripts", "bin")).some((f) => /\.(cmd|bat)$/i.test(f))).toBe(false);
  });
});

describe("el shim se niega a sacar credenciales", () => {
  it.each([
    [["auth", "token"]],
    [["auth", "token", "--hostname", "github.com"]],
    [["auth", "status", "-t"]],
    [["auth", "status", "--show-token"]],
    [["auth", "status", "--hostname", "github.com", "-t"]],
    [["auth", "status", "-ht", "github.com"]],
    [["auth", "login"]],
    [["auth", "login", "--with-token"]],
    [["auth", "switch"]],
    [["auth", "refresh"]],
    [["auth", "setup-git"]],
  ])("%j sale con error y no lanza gh", async (args) => {
    const correr = vi.fn();
    const errores = [];
    const generar = vi.fn();
    const codigo = await main(args, { correr, generar, buscarGh: () => "/falso/gh", salida: { error: (l) => errores.push(l) } });
    expect(codigo).toBe(NEGADO);
    expect(correr).not.toHaveBeenCalled();
    expect(generar).not.toHaveBeenCalled(); // ni siquiera pide el token
    expect(errores.join("\n")).toMatch(/negado/);
  });

  it.each([
    [["auth", "git-credential", "get"]],
    [["auth", "status"]],
    [["api", "rate_limit", "--jq", ".rate.limit"]],
    [["pr", "list"]],
    [["auth", "logout"]], // no saca credenciales
  ])("%j sí pasa", (args) => {
    expect(negacion(args)).toBeNull();
  });

  it("el barrido de scripts/ que usa `gh auth token` lo hace con execFile contra el gh real, no contra el shim", () => {
    const src = readFileSync(join(RAIZ, "scripts", "rulesets.mjs"), "utf8");
    expect(src).toMatch(/execFile(Sync)?\(\s*["']gh["']\s*,\s*\[\s*["']auth["']\s*,\s*["']token["']/);
  });
});

// ── La lógica, con un gh falso: el «real» es Node con un guion que vuelca lo que recibe a un fichero ──
describe("main: lanza el gh real con un token nuevo en su entorno", () => {
  const VUELCO = "(()=>{const fs=require('fs');fs.writeFileSync(process.env.VUELCO,JSON.stringify({a:process.argv.slice(1),t:process.env.GH_TOKEN,v:Object.keys(process.env).filter(k=>/^(GH|GITHUB)_/.test(k))}))})()";
  /** El «gh real» es Node (cualquier sistema); sus argumentos van tras `--`. Devuelve lo que recibió. */
  async function usar(argsDeGh, { generar, cache, env = {}, fallo, reloj, tope } = {}) {
    const vuelco = join(temporal(), "vuelco.json");
    const errores = [];
    const salidaHijo = { out: "", err: "" };
    const correr = (cmd, args, opciones) => {
      const r = spawnSync(cmd, args, { ...opciones, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
      salidaHijo.out = r.stdout ?? "";
      salidaHijo.err = r.stderr ?? "";
      return r;
    };
    const argv = ["-e", VUELCO, "--", ...argsDeGh];
    const codigo = await main(argv, { generar, cache, fallo, reloj, tope, correr, buscarGh: () => process.execPath, env: { ...process.env, VUELCO: vuelco, GH_TOKEN: "ghs_invalido_o_caducado_del_arranque", ...env }, salida: { error: (l) => errores.push(l) } });
    const visto = existsSync(vuelco) ? JSON.parse(readFileSync(vuelco, "utf8")) : null;
    return { codigo, errores, salidaHijo, visto, vuelco };
  }
  const ruta = () => join(temporal("cache-shim-"), "MenuPlan", "token-sesion.json");
  const opcionesCache = (r, extra = {}) => ({ ruta: r, proteger: () => true, permisosBien: () => true, esperaBloqueoMs: 40, sondeoMs: 5, ...extra });
  const guardar = (r, token, vidaMin) => {
    mkdirSync(dirname(r), { recursive: true });
    writeFileSync(r, JSON.stringify({ v: 1, token, expiraEn: new Date(Date.now() + vidaMin * MIN).toISOString(), appId: APP_ID, installationId: 77 }));
  };
  const generador = (token = TOKEN_NUEVO) => vi.fn(async () => ({ token, expiraEn: new Date(Date.now() + 60 * MIN).toISOString(), installationId: 77, autor: AUTOR_POR_DEFECTO, advertencias: [] }));

  it("con la caché caducada, el hijo recibe un token nuevo con forma ghs_ y no el GH_TOKEN del arranque", async () => {
    const r = ruta();
    guardar(r, TOKEN_VIEJO, -5);
    const generar = generador();
    const { visto, codigo, errores } = await usar(["api", "rate_limit"], { generar, cache: opcionesCache(r) });
    expect(codigo).toBe(0);
    expect(visto.t).toBe(TOKEN_NUEVO);
    expect(generar).toHaveBeenCalledTimes(1);
    expect(errores).toEqual([]); // un éxito no escribe nada
  });

  it("con el GH_TOKEN del proceso inválido y la caché viva, recibe el de la caché sin canjear", async () => {
    const r = ruta();
    guardar(r, TOKEN_CACHE, 40);
    const generar = generador();
    const { visto, errores } = await usar(["api", "rate_limit"], { generar, cache: opcionesCache(r) });
    expect(visto.t).toBe(TOKEN_CACHE);
    expect(generar).not.toHaveBeenCalled();
    expect(errores).toEqual([]);
  });

  it("los argumentos llegan literales: %GH_TOKEN%, $GH_TOKEN, comillas, espacios y un filtro de jq", async () => {
    const r = ruta();
    guardar(r, TOKEN_CACHE, 40);
    const raros = ["%GH_TOKEN%", "$GH_TOKEN", 'a"b', "c'd", "con espacios y  dobles", "--jq", ".[]|{a:.b}", "`uname`", "$(id)", "a;b", "&&", "*", ""];
    const { visto } = await usar(raros, { generar: generador(), cache: opcionesCache(r) });
    expect(visto.a).toEqual(raros);
    expect(JSON.stringify(visto.a)).not.toContain(TOKEN_CACHE);
  });

  it("propaga el código de salida del gh real", async () => {
    const r = ruta();
    guardar(r, TOKEN_CACHE, 40);
    const vuelco = join(temporal(), "v.json");
    const codigo = await main(["-e", "process.exit(7)"], { correr: (c, a, o) => spawnSync(c, a, { ...o, stdio: "ignore" }), buscarGh: () => process.execPath, cache: opcionesCache(r), generar: generador(), env: { ...process.env, VUELCO: vuelco }, salida: { error: () => {} } });
    expect(codigo).toBe(7);
  });

  it("canje fallido: el hijo recibe sin-token-de-sesion (nunca vacío), sale la línea de fallo sin token y se guarda el fallo", async () => {
    const r = ruta();
    const generar = vi.fn(async () => {
      throw new ErrorTokenSesion("sin-clave", `1Password dijo ${TOKEN_VIEJO} y -----BEGIN RSA PRIVATE KEY----- (texto de error que no debe guardarse)`);
    });
    const { visto, errores, salidaHijo } = await usar(["api", "rate_limit"], { generar, cache: opcionesCache(r) });
    expect(visto.t).toBe(TOKEN_CENTINELA);
    expect(visto.t).not.toBe("");
    expect(errores).toEqual(["gh-shim resultado: fallo motivo: sin-clave"]);
    for (const texto of [...errores, salidaHijo.out, salidaHijo.err]) expect(texto).not.toMatch(/ghs_|BEGIN/);
    // lo guardado: solo el instante y el motivo, nunca el texto del error
    const crudo = readFileSync(`${r}.fallo.json`, "utf8");
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(["instante", "motivo", "v"]);
    expect(crudo).not.toMatch(/1Password|BEGIN|ghs_/);
  });

  it("un error que no es de la casa sale como error-interno, y el motivo siempre es de MOTIVOS", async () => {
    const r = ruta();
    const { errores, visto } = await usar(["x"], { generar: async () => { throw new TypeError("boom"); }, cache: opcionesCache(r) });
    expect(errores).toEqual(["gh-shim resultado: fallo motivo: error-interno"]);
    expect(visto.t).toBe(TOKEN_CENTINELA);
    expect(MOTIVOS).toContain("error-interno");
  });

  it("un token del canje sin forma ghs_ sale como token-raro y el hijo recibe el centinela", async () => {
    const r = ruta();
    const { errores, visto } = await usar(["x"], { generar: generador("no-es-un-token"), cache: opcionesCache(r) });
    expect(errores).toEqual(["gh-shim resultado: fallo motivo: token-raro"]);
    expect(visto.t).toBe(TOKEN_CENTINELA);
  });

  it("respeta el tope: un canje colgado no pasa de él, sale motivo red y el hijo recibe el centinela", async () => {
    const r = ruta();
    const inicio = Date.now();
    const { errores, visto } = await usar(["x"], { generar: () => new Promise(() => {}), cache: opcionesCache(r), tope: 80 });
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect(errores).toEqual(["gh-shim resultado: fallo motivo: red"]);
    expect(visto.t).toBe(TOKEN_CENTINELA);
  });

  it("el token no se imprime: ni en la salida del shim ni en su stderr", async () => {
    const r = ruta();
    guardar(r, TOKEN_CACHE, 40);
    const { errores, salidaHijo } = await usar(["api", "rate_limit"], { generar: generador(), cache: opcionesCache(r) });
    expect([...errores, salidaHijo.out, salidaHijo.err].join("\n")).not.toContain(TOKEN_CACHE);
  });

  it("sin gh real en el PATH sale con 127 y lo dice por stderr, sin pedir token", async () => {
    const errores = [];
    const generar = vi.fn();
    const codigo = await main(["pr", "list"], { buscarGh: () => null, generar, salida: { error: (l) => errores.push(l) } });
    expect(codigo).toBe(SIN_GH);
    expect(SIN_GH).toBe(127);
    expect(errores.join("\n")).toMatch(/sin-gh-real/);
    expect(generar).not.toHaveBeenCalled();
  });

  it("si el gh real no se puede lanzar, sale con 127 y lo dice", async () => {
    const errores = [];
    const codigo = await main(["pr", "list"], { buscarGh: () => "/x/gh", correr: () => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }) }), generar: generador(), cache: opcionesCache(ruta()), salida: { error: (l) => errores.push(l) } });
    expect(codigo).toBe(127);
    expect(errores.join("\n")).toMatch(/no-lanzado \(ENOENT\)/);
  });
});

describe("el fallo reciente (#508): 30 s sin reintentar", () => {
  const ruta = () => join(temporal("fallo-"), "MenuPlan", "token-sesion.json");
  const libre = { proteger: () => true, permisosBien: () => true };
  const cacheDe = (r) => ({ ruta: r, ...libre, esperaBloqueoMs: 40, sondeoMs: 5 });
  const falla = () => vi.fn(async () => { throw new ErrorTokenSesion("red", "sin red"); });

  it("tras un fallo, durante 30 s no se llama al generador: sale fallo-reciente", async () => {
    const r = ruta();
    let ahora = 1_000_000;
    const reloj = () => ahora;
    const generar = falla();
    expect(await tokenParaUsar({ generar, cache: cacheDe(r), reloj })).toEqual({ motivo: "red" });
    expect(generar).toHaveBeenCalledTimes(1);
    ahora += 29_000;
    expect(await tokenParaUsar({ generar, cache: cacheDe(r), reloj })).toEqual({ motivo: "fallo-reciente" });
    expect(await tokenParaUsar({ generar, cache: cacheDe(r), reloj })).toEqual({ motivo: "fallo-reciente" });
    expect(generar).toHaveBeenCalledTimes(1);
    // y el fallo-reciente no se guarda a sí mismo: no se alarga solo
    ahora += 2_000; // 31 s desde el fallo de verdad
    expect(await tokenParaUsar({ generar, cache: cacheDe(r), reloj })).toEqual({ motivo: "red" });
    expect(generar).toHaveBeenCalledTimes(2);
  });

  it("un token vivo en la caché no lo estorba el fallo reciente", async () => {
    const r = ruta();
    mkdirSync(dirname(r), { recursive: true });
    writeFileSync(r, JSON.stringify({ v: 1, token: TOKEN_CACHE, expiraEn: new Date(Date.now() + 40 * MIN).toISOString(), appId: APP_ID, installationId: 77 }));
    falloReciente({ ruta: r, guardar: "red", ...libre });
    const generar = falla();
    expect(await tokenParaUsar({ generar, cache: cacheDe(r) })).toEqual({ token: TOKEN_CACHE });
    expect(generar).not.toHaveBeenCalled();
  });

  describe("falloReciente", () => {
    const T = 5_000_000;
    const escribirA = (r, instante, motivo = "red", extra = {}) => {
      mkdirSync(dirname(r), { recursive: true });
      writeFileSync(`${r}.fallo.json`, JSON.stringify({ v: 1, instante, motivo, ...extra }));
    };
    it.each([
      ["justo ahora", 0, "red"],
      ["hace 30 s", 30_000, "red"],
      ["hace 30,001 s", 30_001, null],
      ["hace 5 min", 5 * MIN, null],
      ["en el futuro (1 ms)", -1, null],
      ["en el futuro (1 h)", -60 * MIN, null],
    ])("instante %s", (_c, antes, esperado) => {
      const r = ruta();
      escribirA(r, T - antes);
      expect(falloReciente({ ruta: r, reloj: () => T, ...libre })).toBe(esperado);
    });
    it("sin fichero, roto, con claves de más o con un motivo raro: se ignora", () => {
      const r = ruta();
      expect(falloReciente({ ruta: r, reloj: () => T, ...libre })).toBeNull();
      mkdirSync(dirname(r), { recursive: true });
      for (const basura of ["{roto", "", "[]", "null", JSON.stringify({ v: 1, instante: T, motivo: "red", texto: "error largo" }), JSON.stringify({ v: 2, instante: T, motivo: "red" }), JSON.stringify({ v: 1, instante: "ahora", motivo: "red" }), JSON.stringify({ v: 1, instante: T, motivo: "Red; rm -rf" })]) {
        writeFileSync(`${r}.fallo.json`, basura);
        expect(falloReciente({ ruta: r, reloj: () => T, ...libre }), basura).toBeNull();
      }
    });
    it("con permisos que no cuadran se ignora y no se bloquea", () => {
      const r = ruta();
      escribirA(r, T);
      expect(falloReciente({ ruta: r, reloj: () => T, proteger: () => true, permisosBien: () => false })).toBeNull();
      const lanza = () => { throw new Error("icacls roto"); };
      expect(falloReciente({ ruta: r, reloj: () => T, proteger: () => true, permisosBien: lanza })).toBeNull();
    });
    it("guardar es atómico, no deja temporales, no admite un motivo raro y solo lleva instante y motivo", () => {
      const r = ruta();
      expect(falloReciente({ ruta: r, guardar: "bloqueo-ocupado", reloj: () => T, ...libre })).toBe(true);
      expect(JSON.parse(readFileSync(`${r}.fallo.json`, "utf8"))).toEqual({ v: 1, instante: T, motivo: "bloqueo-ocupado" });
      expect(readdirSync(dirname(r))).toEqual(["token-sesion.json.fallo.json"]);
      expect(falloReciente({ ruta: r, guardar: "texto libre con espacios", reloj: () => T, ...libre })).toBe(false);
      expect(falloReciente({ ruta: r, guardar: "red", reloj: () => T, proteger: () => false, permisosBien: () => true })).toBe(false); // sin cerrar los permisos no se guarda
      expect(readdirSync(dirname(r))).toEqual(["token-sesion.json.fallo.json"]);
    });
    it("con las ACL reales (icacls o 0600) el fichero guardado vuelve a leerse", () => {
      const r = ruta();
      expect(falloReciente({ ruta: r, guardar: "red" })).toBe(true);
      expect(falloReciente({ ruta: r })).toBe("red");
    });
  });
});

describe("buscarGhReal: el gh real, saltándose la carpeta del shim", () => {
  const falso = (windows) => {
    const base = temporal("path-");
    const carpetas = { shim: join(base, "shim"), a: join(base, "a"), b: join(base, "b") };
    for (const c of Object.values(carpetas)) mkdirSync(c, { recursive: true });
    const nombre = windows ? "gh.exe" : "gh";
    writeFileSync(join(carpetas.shim, nombre), "");
    writeFileSync(join(carpetas.b, nombre), "");
    return { carpetas, nombre };
  };
  it("toma el primero que exista fuera de la carpeta del shim", () => {
    const { carpetas, nombre } = falso(false);
    const path = [carpetas.shim, carpetas.a, carpetas.b].join(delimiter);
    expect(buscarGhReal({ path, carpetaShim: carpetas.shim, windows: false })).toBe(join(carpetas.b, nombre));
  });
  it("una carpeta del shim duplicada (y con otra forma de escribirla) no hace bucle", () => {
    const { carpetas, nombre } = falso(false);
    const path = [carpetas.shim, `${carpetas.shim}/`, carpetas.a, carpetas.shim, carpetas.b].join(delimiter);
    expect(buscarGhReal({ path, carpetaShim: carpetas.shim, windows: false })).toBe(join(carpetas.b, nombre));
  });
  it("en Windows compara sin mayúsculas, con barras de las dos clases y en la forma /c/… de Git Bash", () => {
    const { carpetas } = falso(true);
    const s = carpetas.shim;
    for (const forma of [s.toUpperCase(), s.replace(/\\/g, "/"), s.replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`).replace(/\\/g, "/")]) {
      expect(buscarGhReal({ path: [forma, carpetas.a].join(";"), carpetaShim: s, windows: true }), forma).toBeNull();
    }
  });
  it("sin ningún otro gh devuelve null (el shim saldría con 127)", () => {
    const { carpetas } = falso(false);
    expect(buscarGhReal({ path: [carpetas.shim, carpetas.a, join(carpetas.a, "no-existe")].join(delimiter), carpetaShim: carpetas.shim, windows: false })).toBeNull();
  });
  it("una carpeta del PATH vacía o inexistente no estorba ni cuenta como el directorio actual", () => {
    const { carpetas, nombre } = falso(false);
    expect(buscarGhReal({ path: ["", "  ", join(carpetas.a, "x"), carpetas.b].join(delimiter), carpetaShim: carpetas.shim, windows: false })).toBe(join(carpetas.b, nombre));
  });
});

// ── Procesos de verdad ──────────────────────────────────────────────────────────────────────────
const BASH = (() => {
  if (process.platform !== "win32") return "bash";
  const candidatos = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs")].filter(Boolean).map((p) => join(p, "Git", "bin", "bash.exe"));
  return candidatos.find((c) => existsSync(c)) ?? null;
})();
const ghInstalado = (() => {
  const r = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
})();

/** Un perfil de usuario de prueba con una caché viva (ACL reales): la caché que lee el shim en el proceso real. */
function perfilDePrueba({ token = TOKEN_CACHE, vidaMin = 40 } = {}) {
  const casa = temporal("perfil-");
  const local = join(casa, "AppData", "Local");
  const rutaCache = join(local, "MenuPlan", "token-sesion.json");
  if (token) escribirCache({ ruta: rutaCache, datos: { token, expiraEn: new Date(Date.now() + vidaMin * MIN).toISOString().replace(/\.\d+Z$/, "Z"), appId: APP_ID, installationId: 77 } });
  return { casa, rutaCache, env: { USERPROFILE: casa, HOME: casa, LOCALAPPDATA: local } };
}
const sinVariablesDeGh = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GH_|GITHUB_|GIT_|OP_SERVICE|CLAUDE)/.test(k)));

describe.skipIf(!BASH)("el camino entero con bash (la línea de PATH del arranque y el script scripts/bin/gh)", () => {
  const lineaPath = lineaDePath(CARPETA_SHIM).linea;

  it("la línea de PATH, ejecutada con bash -c desde OTRO directorio, resuelve `gh` al shim", () => {
    const r = spawnSync(BASH, ["-c", `${lineaPath}command -v gh`], { cwd: temporal("otro-"), encoding: "utf8", env: sinVariablesDeGh() });
    expect(r.status).toBe(0);
    const resuelta = r.stdout.trim().replace(/^\/([a-z])\//, "$1:/").toLowerCase();
    expect(resuelta).toBe(join(CARPETA_SHIM, "gh").replace(/\\/g, "/").toLowerCase());
  });

  it.skipIf(!ghInstalado)("con el GH_TOKEN del entorno inválido y la caché viva, `gh auth git-credential get` da el token de la caché (se pide al usarse)", () => {
    const p = perfilDePrueba();
    const entrada = "protocol=https\nhost=github.com\n\n";
    const r = spawnSync(BASH, ["-c", `${lineaPath}gh auth git-credential get`], { cwd: temporal("otro-"), input: entrada, encoding: "utf8", env: { ...sinVariablesDeGh(), ...p.env, GH_TOKEN: "ghs_caducado_del_arranque" }, timeout: 30_000 });
    expect(r.stdout).toContain(`password=${TOKEN_CACHE}`);
    expect(r.stdout).not.toContain("caducado_del_arranque");
    expect(r.stderr).not.toMatch(/gh-shim/);
  });

  it.skipIf(!ghInstalado)("sin caché, con un fallo reciente apuntado: sale el centinela y la línea de fallo-reciente, sin llamar a 1Password", () => {
    const p = perfilDePrueba({ token: null });
    expect(falloReciente({ ruta: p.rutaCache, guardar: "red" })).toBe(true);
    const r = spawnSync(BASH, ["-c", `${lineaPath}gh auth git-credential get`], { cwd: temporal("otro-"), input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", env: { ...sinVariablesDeGh(), ...p.env, GH_TOKEN: "ghs_caducado_del_arranque" }, timeout: 30_000 });
    expect(r.stdout).toContain(`password=${TOKEN_CENTINELA}`);
    expect(r.stderr).toContain("gh-shim resultado: fallo motivo: fallo-reciente");
    expect(r.stdout + r.stderr).not.toContain("caducado_del_arranque");
  });

  it("el shim real se niega a `auth token` y no imprime nada que parezca un token", () => {
    const p = perfilDePrueba();
    const r = spawnSync(BASH, ["-c", `${lineaPath}gh auth token`], { cwd: temporal("otro-"), encoding: "utf8", env: { ...sinVariablesDeGh(), ...p.env }, timeout: 30_000 });
    expect(r.status).toBe(NEGADO);
    expect(r.stdout + r.stderr).not.toContain(TOKEN_CACHE);
    expect(r.stderr).toMatch(/gh-shim resultado: negado/);
  });

  it("dos carpetas del shim en el PATH real terminan (sin bucle)", () => {
    const p = perfilDePrueba();
    const r = spawnSync(BASH, ["-c", `${lineaPath}${lineaPath}gh auth status -t`], { cwd: temporal("otro-"), encoding: "utf8", env: { ...sinVariablesDeGh(), ...p.env }, timeout: 30_000 });
    expect(r.status).toBe(NEGADO); // llega a negar, no se cuelga ni se llama a sí mismo
  });
});

describe.skipIf(!BASH)("H2: git ejecuta el ayudante `!` con el PATH de la sesión y gh usa el GH_TOKEN del entorno de quien lo lanza", () => {
  /** El entorno que el arranque deja (las líneas `export` de lineasDeEntorno), como pares para un proceso. */
  function entornoDeLineas(token, { sinToken = false } = {}) {
    const pares = {};
    for (const l of lineasDeEntorno({ token, autor: AUTOR_POR_DEFECTO }).split("\n")) {
      const m = /^export ([A-Z_0-9]+)=(.*)$/.exec(l);
      if (m) pares[m[1]] = m[2].replace(/^'(.*)'$/, "$1");
    }
    if (sinToken) delete pares.GH_TOKEN;
    return pares;
  }
  const rutaGit = (r) => r.replace(/\\/g, "/");
  /** `git credential fill` para github.com en un repositorio de prueba, con el ayudante de la sesión. */
  function pedirCredencial({ env }) {
    const repo = temporal("repo-h2-");
    execFileSync("git", ["init", "-q", repo]);
    return spawnSync("git", ["-C", repo, "credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", timeout: 60_000, env: { ...sinVariablesDeGh(), GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", ...env } });
  }

  it("con un gh falso delante en el PATH: git lo llama (`auth git-credential get`) con el GH_TOKEN de su entorno, y si falta recibe el centinela", () => {
    const falsa = temporal("gh-falso-");
    const cuenta = join(falsa, "llamadas.txt");
    const tokens = join(falsa, "tokens.txt");
    writeFileSync(join(falsa, "gh"), `#!/bin/sh\necho "$@" >> "${rutaGit(cuenta)}"\necho "$GH_TOKEN" >> "${rutaGit(tokens)}"\nprintf 'username=x-access-token\\npassword=${TOKEN_NUEVO}\\n'\n`, { mode: 0o755 });
    const PATH = `${falsa}${delimiter}${process.env.PATH ?? process.env.Path}`;
    // 1. Con el GH_TOKEN del arranque (caducado): el ayudante se lo pasa a gh tal cual
    let r = pedirCredencial({ env: { ...entornoDeLineas(TOKEN_VIEJO), PATH, HOME: falsa, USERPROFILE: falsa } });
    expect(r.stdout, r.stderr).toContain(`password=${TOKEN_NUEVO}`);
    expect(readFileSync(cuenta, "utf8").trim().split("\n")).toEqual(["auth git-credential get"]);
    expect(readFileSync(tokens, "utf8").trim()).toBe(TOKEN_VIEJO);
    // 2. Sin GH_TOKEN en el entorno: el ayudante pone el centinela, no deja a gh caer al llavero de Pablo
    rmSync(cuenta);
    rmSync(tokens);
    r = pedirCredencial({ env: { ...entornoDeLineas(TOKEN_VIEJO, { sinToken: true }), PATH, HOME: falsa, USERPROFILE: falsa } });
    expect(r.stdout, r.stderr).toContain(`password=${TOKEN_NUEVO}`);
    expect(readFileSync(tokens, "utf8").trim()).toBe(TOKEN_CENTINELA);
  });

  it.skipIf(!ghInstalado)("con el gh real y el shim delante: `git credential fill` da el token de la CACHÉ, no el caducado del entorno", () => {
    const p = perfilDePrueba();
    const PATH = `${CARPETA_SHIM}${delimiter}${process.env.PATH ?? process.env.Path}`;
    const r = pedirCredencial({ env: { ...entornoDeLineas(TOKEN_VIEJO), PATH, ...p.env } });
    expect(r.stdout, r.stderr).toContain(`password=${TOKEN_CACHE}`);
    expect(r.stdout).not.toContain(TOKEN_VIEJO);
  });

  it.skipIf(!ghInstalado)("el gh real usa el GH_TOKEN del entorno de quien lo lanza para github.com (sin red)", () => {
    const r = spawnSync("gh", ["auth", "git-credential", "get"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", timeout: 30_000, env: { ...sinVariablesDeGh(), GH_TOKEN: TOKEN_NUEVO, HOME: temporal("sin-config-"), USERPROFILE: temporal("sin-config-"), GH_CONFIG_DIR: temporal("sin-config-") } });
    expect(r.stdout, r.stderr).toContain(`password=${TOKEN_NUEVO}`);
  });
});
