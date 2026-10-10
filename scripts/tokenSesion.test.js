// tokenSesion.test.js — la identidad de máquina de las sesiones (#329): JWT firmado de verdad,
// canje del token con un fetch de mentira, fallo cerrado sin filtrar nada y el aviso del arranque.
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { main } from "./token-sesion.mjs";
import { APP_ID, BOT_ID, ErrorTokenSesion, MOTIVOS, avisoDeIdentidad, identidadDe, leerClaveDeBoveda, lineasDeEntorno, motivoDeCanje, tokenDeSesion } from "./lib/tokenSesion.mjs";
import { PERMISOS } from "./token-sesiones.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const CLAVE_ROTA = ["-----BEGIN RSA PRIVATE KEY-----", "SECRETO-DE-PRUEBA", "-----END RSA PRIVATE KEY-----"].join("\n");
const TOKEN =`ghs_${"a1B2c3D4".repeat(5)}`;
const res = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

/** Un GitHub de mentira: guarda cada llamada para mirar qué se mandó. */
function githubFalso({ instalacion = res(200, { id: 77 }), acceso = res(201, { token: TOKEN, expires_at: "2026-10-10T12:00:00Z", permissions: { ...PERMISOS }, repositories: [{ name: "MenuPlan" }] }), usuario = res(200, { id: 999 }) } = {}) {
  const llamadas = [];
  const f = vi.fn(async (url, init = {}) => {
    llamadas.push({ url, init });
    if (url.endsWith("/installation")) return instalacion;
    if (url.includes("/access_tokens")) return acceso;
    if (url.includes("/users/")) return usuario;
    throw new Error(`url inesperada ${url}`);
  });
  return { f, llamadas };
}

describe("tokenDeSesion", () => {
  it("canjea el JWT por el token de instalación, solo para este repo, y da el autor de la App", async () => {
    const { f, llamadas } = githubFalso();
    const t = await tokenDeSesion({ fetch: f, leerClave: async () => privateKey });
    expect(t.token).toBe(TOKEN);
    expect(t.autor).toEqual({ nombre: "homenu-sesiones[bot]", correo: "999+homenu-sesiones[bot]@users.noreply.github.com" });
    const [h, p, firma] = llamadas[0].init.headers.Authorization.replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(p, "base64url")).iss).toBe(String(APP_ID));
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(createPublicKey(publicKey), Buffer.from(firma, "base64url"))).toBe(true);
    const pedido = JSON.parse(llamadas[1].init.body);
    expect(pedido).toEqual({ repositories: ["MenuPlan"], permissions: PERMISOS });
    expect(pedido.permissions.workflows).toBeUndefined();
    expect(llamadas[1].url).toContain("/app/installations/77/access_tokens");
  });

  it("si la API no da el id del bot, usa el conocido", async () => {
    const { f } = githubFalso({ usuario: res(404, {}) });
    const t = await tokenDeSesion({ fetch: f, leerClave: async () => privateKey });
    expect(t.autor.correo).toBe(`${BOT_ID}+homenu-sesiones[bot]@users.noreply.github.com`);
  });

  it.each([
    ["sin clave en la bóveda", { leerClave: async () => { throw new ErrorTokenSesion("sin-clave", "x"); } }, "sin-clave"],
    ["la ficha no es una clave", { leerClave: async () => "hola" }, "clave-ilegible"],
    ["la App no está instalada", { fetch: githubFalso({ instalacion: res(404, {}) }).f }, "sin-instalacion"],
    ["GitHub rechaza el JWT", { fetch: githubFalso({ instalacion: res(401, {}) }).f }, "github-rechaza"],
    ["GitHub rechaza el canje", { fetch: githubFalso({ acceso: res(403, {}) }).f }, "github-rechaza"],
    ["clave PEM que no es RSA válida", { leerClave: async () => CLAVE_ROTA }, "clave-ilegible"],
    ["token con forma rara", { fetch: githubFalso({ acceso: res(201, { token: "x; rm -rf /", permissions: { ...PERMISOS }, repositories: [{ name: "MenuPlan" }] }) }).f }, "token-raro"],
    ["el token trae un permiso que no se pidió", { fetch: githubFalso({ acceso: res(201, { token: TOKEN, permissions: { ...PERMISOS, workflows: "write" }, repositories: [{ name: "MenuPlan" }] }) }).f }, "token-raro"],
    ["sin red", { fetch: async () => { throw new Error("ECONNRESET api.github.com"); } }, "red"],
  ])("falla cerrado: %s", async (_c, extra, motivo) => {
    const base = { fetch: githubFalso().f, leerClave: async () => privateKey };
    const e = await tokenDeSesion({ ...base, ...extra }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorTokenSesion);
    expect(e.motivo).toBe(motivo);
    expect(MOTIVOS).toContain(e.motivo);
    expect(String(e.message)).not.toContain("BEGIN");
    expect(String(e.message)).not.toContain("SECRETO-DE-PRUEBA");
    expect(String(e.message)).not.toContain(TOKEN);
  });
});

describe("motivoDeCanje", () => {
  it("clasifica los mensajes reales de token-sesiones.mjs en el vocabulario", () => {
    expect(motivoDeCanje("la clave privada de stdin no es un PEM válido")).toBe("clave-ilegible");
    expect(motivoDeCanje("sin respuesta de GitHub: ECONNRESET")).toBe("red");
    expect(motivoDeCanje("GitHub respondió 404: no existe esa instalación")).toBe("sin-instalacion");
    expect(motivoDeCanje("GitHub respondió 401 («Bad credentials»)")).toBe("github-rechaza");
    expect(motivoDeCanje("el token trae permisos que no pedí: no lo imprimo")).toBe("token-raro");
  });
});

describe("leerClaveDeBoveda", () => {
  it("si no se puede leer la ficha (sin cuenta de servicio, sin op o sin ficha) falla con sin-clave", async () => {
    const e = await leerClaveDeBoveda({ fichas: [{ vault: "no-existe-ni-existira", titulo: "x" }] }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ErrorTokenSesion);
    expect(e.motivo).toBe("sin-clave");
  }, 30_000);
});

describe("lineasDeEntorno", () => {
  const autor = { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" };
  it("pone el token, el ayudante de git que lee $GH_TOKEN y el autor y committer", () => {
    const t = lineasDeEntorno({ token: TOKEN, autor });
    expect(t).toContain(`export GH_TOKEN='${TOKEN}'`);
    expect(t).toContain("password=$GH_TOKEN");
    expect(t.split(TOKEN).length - 1).toBe(1); // el token aparece una sola vez: git lo lee del entorno
    for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) expect(t).toContain(`export ${k}=`);
  });
  it("acepta la forma larga de los tokens nuevos (390 caracteres con . y -, vista en vivo el 10 oct 2026)", () => {
    const largo = `ghs_${"Ab1_".repeat(40)}.${"x-y".repeat(40)}`;
    expect(lineasDeEntorno({ token: largo, autor })).toContain(`export GH_TOKEN='${largo}'`);
  });
  it("rechaza un token o un autor con comillas o saltos de línea", () => {
    expect(() => lineasDeEntorno({ token: "ghs_x'; touch /tmp/y; '", autor })).toThrow();
    expect(() => lineasDeEntorno({ token: TOKEN, autor: { ...autor, nombre: "a'; echo b; '" } })).toThrow();
    expect(() => lineasDeEntorno({ token: TOKEN, autor: { ...autor, correo: "a@evil.com" } })).toThrow();
  });
});

describe("identidad y aviso del arranque", () => {
  it("lee el login de gh api user y el 403 «by integration» de un token de instalación", () => {
    expect(identidadDe({ status: 0, stdout: "pabloam89\n" })).toBe("pablo");
    expect(identidadDe({ status: 0, stdout: "homenu-sesiones[bot]" })).toBe("app");
    expect(identidadDe({ status: 1, stderr: "gh: Resource not accessible by integration (HTTP 403)" })).toBe("app");
    expect(identidadDe({ status: 1, stderr: "HTTP 401: Bad credentials" })).toBe("desconocida");
    expect(identidadDe({ status: 0, stdout: "algun-otro" })).toBe("otra");
  });
  it("avisa en mayúsculas si trabaja como Pablo y dice por qué, con su línea contable", () => {
    const a = avisoDeIdentidad({ identidad: "pablo", token: "no", motivo: "sin-clave" });
    expect(a).toMatch(/^AVISO: .*pabloam89/);
    expect(a).toContain("identidad-sesion identidad: pablo token: no motivo: sin-clave");
  });
  it("con la App no avisa", () => {
    const a = avisoDeIdentidad({ identidad: "app", token: "app" });
    expect(a).not.toMatch(/^AVISO/);
    expect(a).toContain("identidad: app token: app");
  });
});

describe("token-sesion.mjs", () => {
  const salida = () => ({ log: vi.fn(), error: vi.fn() });
  it("--comprobar no imprime el token", async () => {
    const s = salida();
    const code = await main(["--comprobar"], { generar: async () => ({ token: TOKEN, expiraEn: "x", autor: { nombre: "b" } }), salida: s });
    expect(code).toBe(0);
    expect(JSON.stringify([s.log.mock.calls, s.error.mock.calls])).not.toContain(TOKEN);
  });
  it("-- corre el comando con GH_TOKEN; si falla el token, no corre nada", async () => {
    const correr = vi.fn(() => ({ status: 0 }));
    expect(await main(["--", "gh", "pr", "list"], { generar: async () => ({ token: TOKEN, autor: {} }), correr, salida: salida() })).toBe(0);
    expect(correr.mock.calls[0][0]).toBe("gh");
    expect(correr.mock.calls[0][2].env.GH_TOKEN).toBe(TOKEN);
    const c2 = vi.fn();
    expect(await main(["--", "gh"], { generar: async () => { throw new ErrorTokenSesion("red"); }, correr: c2, salida: salida() })).toBe(1);
    expect(c2).not.toHaveBeenCalled();
  });
});

describe("arranque.mjs", () => {
  it("sigue siendo JavaScript válido (un fallo de sintaxis dejaría la sesión sin arranque)", () => {
    execFileSync(process.execPath, ["--check", new URL("../.claude/hooks/arranque.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")]);
  });
  it("escribe el token solo en CLAUDE_ENV_FILE y espera la identidad antes de imprimir", () => {
    const src = readFileSync(new URL("../.claude/hooks/arranque.mjs", import.meta.url), "utf8");
    expect(src).toContain("CLAUDE_ENV_FILE");
    expect(src).toContain("avisos.push(await identidad)");
    expect(src).not.toMatch(/console\.(log|error)\([^)]*t\.token/);
  });
});
