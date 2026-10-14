// arranque.test.js — lo que el arranque deja en el fichero de entorno de la sesión (#719, fondo #715).
//
// Las líneas que escribe `aplicarIdentidad` las lee el shell Bash de la sesión UNA vez, al arrancar: por eso
// lo que importa es el ORDEN (primero lo que no depende del canje: PATH, ayudante de git, autor y el
// token de relleno; después, solo si llega, el token real) y de dónde sale la ruta del shim (de la ubicación del
// propio arranque.mjs, nunca del cwd). Se prueba ejecutando de verdad el fichero que escribe, con `bash -c`.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { escribirCache } from "../../scripts/lib/cacheTokenSesion.mjs";
import { APP_ID, AUTOR_POR_DEFECTO, ErrorTokenSesion, TOKEN_CENTINELA, aplicarIdentidad, rutaDeShimDesde } from "../../scripts/lib/tokenSesion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARRANQUE = join(AQUI, "arranque.mjs");
const SHIM_ESPERADO = join(AQUI, "..", "..", "scripts", "bin");
const TOKEN = `ghs_${"R3al0".repeat(6)}`;
const dirs = [];
const temporal = (p = "arranque-") => {
  const d = mkdtempSync(join(tmpdir(), p));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const BASH = (() => {
  if (process.platform !== "win32") return "bash";
  const c = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs")].filter(Boolean).map((p) => join(p, "Git", "bin", "bash.exe"));
  return c.find((x) => existsSync(x)) ?? null;
})();
const sinVariables = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GH_|GITHUB_|GIT_|OP_SERVICE|CLAUDE|MENUPLAN)/.test(k)));
const norma = (r) => r.replace(/\\/g, "/").replace(/^\/([a-z])\//, "$1:/").toLowerCase();

/** Lo que `aplicarIdentidad` escribe, en un fichero de verdad, con el canje que se le dé. */
async function arrancar({ generar, rutaShim = SHIM_ESPERADO, tope, env = {} }) {
  const fichero = join(temporal(), "entorno.sh");
  writeFileSync(fichero, "");
  const registrado = [];
  await aplicarIdentidad({ env: { CLAUDE_ENV_FILE: fichero, ...env }, escribir: appendFileSync, generar, identificar: async () => ({ status: 1, stderr: "Resource not accessible by integration" }), registrar: (l) => registrado.push(l), rutaShim, tope });
  return { fichero, registrado, texto: readFileSync(fichero, "utf8") };
}
/** Carga el fichero como lo hace Bash y enseña qué ve la sesión, desde OTRO directorio. */
function cargar(fichero, orden = 'printf "%s\\n" "$GH_TOKEN"; command -v gh; printf "%s\\n" "$GIT_CONFIG_VALUE_1"; printf "%s\\n" "$GIT_AUTHOR_NAME"') {
  const r = spawnSync(BASH, ["-c", `. "${fichero.replace(/\\/g, "/")}"; ${orden}`], { cwd: temporal("otro-"), encoding: "utf8", env: sinVariables() });
  expect(r.status, r.stderr).toBe(0);
  const [token, gh, ayudante, autor] = r.stdout.split("\n");
  return { token, gh, ayudante, autor };
}

describe("el arranque: orden de lo que escribe", () => {
  it("con el canje fallido ya están el PATH, el ayudante, el autor y el GH_TOKEN inválido y no vacío", async () => {
    const { texto, registrado, fichero } = await arrancar({ generar: async () => { throw new ErrorTokenSesion("sin-clave", "x"); } });
    expect(texto).not.toMatch(/ghs_/);
    expect(registrado.join("\n")).toContain("motivo: sin-clave");
    if (!BASH) return;
    const r = cargar(fichero);
    expect(r.token).toBe(TOKEN_CENTINELA);
    expect(r.token).not.toBe("");
    expect(norma(r.gh)).toBe(norma(join(SHIM_ESPERADO, "gh")));
    expect(r.ayudante).toContain("gh auth git-credential");
    expect(r.autor).toBe(AUTOR_POR_DEFECTO.nombre);
  });

  it("con el canje lento (pasa el tope) también: lo previo está y el token real, que llega tarde, NO se escribe", async () => {
    const { texto } = await arrancar({ tope: 30, generar: () => new Promise((ok) => setTimeout(() => ok({ token: TOKEN, autor: AUTOR_POR_DEFECTO, advertencias: [] }), 150)) });
    await new Promise((ok) => setTimeout(ok, 300));
    expect(texto).toContain("export GH_TOKEN='sin-token-de-sesion'");
    expect(texto).toContain("export PATH=");
    expect(texto).toContain("gh auth git-credential");
    expect(texto).not.toContain(TOKEN);
  });

  it("con el canje bueno, el GH_TOKEN real va DESPUÉS del token de relleno y gana al ejecutarlo con bash -c", async () => {
    const { texto, fichero } = await arrancar({ generar: async () => ({ token: TOKEN, autor: AUTOR_POR_DEFECTO, advertencias: [] }) });
    expect(texto.indexOf("sin-token-de-sesion")).toBeGreaterThan(-1);
    expect(texto.indexOf(TOKEN)).toBeGreaterThan(texto.indexOf("sin-token-de-sesion"));
    expect(texto.indexOf(TOKEN)).toBeGreaterThan(texto.indexOf("gh auth git-credential"));
    if (!BASH) return;
    expect(cargar(fichero).token).toBe(TOKEN);
  });

  it("una ruta de shim que no pasa la regex no escribe la línea del PATH, deja el motivo y escribe el resto", async () => {
    const { texto, registrado } = await arrancar({ rutaShim: "/c/dev/con espacios/scripts/bin", generar: async () => ({ token: TOKEN, autor: AUTOR_POR_DEFECTO, advertencias: [] }) });
    expect(texto).not.toContain("export PATH=");
    expect(registrado).toContain("entorno-sesion path: omitido motivo: ruta-de-shim-rara");
    expect(texto).toContain("gh auth git-credential");
    expect(texto).toContain("export GIT_AUTHOR_NAME=");
    expect(texto).toContain(`export GH_TOKEN='${TOKEN}'`); // no se lanza una excepción que se lleve por delante el token
  });

  it("sin CLAUDE_ENV_FILE no escribe nada (y sigue sin romper)", async () => {
    const escrito = [];
    const aviso = await aplicarIdentidad({ env: {}, escribir: (...a) => escrito.push(a), generar: async () => ({ token: TOKEN, autor: AUTOR_POR_DEFECTO, advertencias: [] }), identificar: async () => ({ status: 1 }), registrar: () => {}, rutaShim: SHIM_ESPERADO });
    expect(escrito).toEqual([]);
    expect(aviso).toContain("motivo: sin-fichero-de-entorno");
  });
});

describe("arranque.mjs: de dónde sale la ruta del shim", () => {
  it("se calcula con la ubicación de su propio fichero (import.meta.url), no con el cwd ni la carpeta de la tarea", () => {
    const src = readFileSync(ARRANQUE, "utf8");
    expect(src).toMatch(/rutaShim:\s*rutaDeShimDesde\(import\.meta\.url\)/);
    expect(src).not.toMatch(/rutaDeShimDesde\((?!import\.meta\.url)/);
    expect(src).not.toMatch(/rutaShim:\s*[^\n]*(raiz|cwd)/);
    expect(rutaDeShimDesde(new URL("./arranque.mjs", import.meta.url))).toBe(SHIM_ESPERADO);
  });

  it.skipIf(!BASH)("ejecutado de verdad desde otra carpeta (cwd y raíz ajenos), escribe el PATH de ESTE repo y no el de la carpeta ajena", () => {
    const ajena = temporal("raiz-ajena-"); // una «rama ajena» con su propio scripts/bin que NO debe usarse
    execFileSync("git", ["init", "-q", ajena]);
    const perfil = temporal("perfil-");
    const local = join(perfil, "AppData", "Local");
    escribirCache({ ruta: join(local, "MenuPlan", "token-sesion.json"), datos: { token: TOKEN, expiraEn: new Date(Date.now() + 40 * 60_000).toISOString().replace(/\.\d+Z$/, "Z"), appId: APP_ID, installationId: 77 } });
    const fichero = join(temporal(), "entorno.sh");
    writeFileSync(fichero, "");
    const r = spawnSync(process.execPath, [ARRANQUE], {
      cwd: ajena,
      input: JSON.stringify({ cwd: ajena, session_id: "prueba-719-arranque" }),
      encoding: "utf8",
      timeout: 60_000,
      env: { ...sinVariables(), CLAUDE_ENV_FILE: fichero, USERPROFILE: perfil, HOME: perfil, LOCALAPPDATA: local, MENUPLAN_FABRICA_DIR: join(perfil, "fabrica") },
    });
    expect(r.status, r.stderr).toBe(0);
    const texto = readFileSync(fichero, "utf8");
    const linea = texto.split("\n").find((l) => l.startsWith("export PATH="));
    expect(linea, texto).toBeTruthy();
    const ruta = /^export PATH='([^']+)'/.exec(linea)[1];
    expect(norma(ruta)).toBe(norma(SHIM_ESPERADO));
    expect(norma(ruta)).not.toContain(norma(ajena));
    // y lo que la sesión ve al cargar el fichero: el shim de este repo y el token de la caché, después del token de relleno
    const visto = cargar(fichero);
    expect(norma(visto.gh)).toBe(norma(join(SHIM_ESPERADO, "gh")));
    expect(visto.token).toBe(TOKEN);
    expect(texto.indexOf(TOKEN)).toBeGreaterThan(texto.indexOf("sin-token-de-sesion"));
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.stderr).not.toContain(TOKEN);
  });
});
