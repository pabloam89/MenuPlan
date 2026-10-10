// tokenSesion.test.js — la identidad de máquina de las sesiones (#329): JWT firmado de verdad,
// canje del token con un fetch de mentira, fallo cerrado sin filtrar nada y el aviso del arranque.
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { main } from "./token-sesion.mjs";
import { ADVERTENCIAS, APP_ID, BOT_ID, CACHES, ErrorTokenSesion, FICHAS_CLAVE, IDENTIDADES, MOTIVOS, aplicarIdentidad, avisoDeIdentidad, identidadDe, leerClaveDeBoveda, lineaIdentidad, lineasDeEntorno, motivoDeCanje, tokenConCache, tokenDeSesion } from "./lib/tokenSesion.mjs";
import { MARGEN_MS, escribirCache, leerCache, permisosDelUsuario, principalesDeIcacls, protegerFichero, rutaDeCache } from "./lib/cacheTokenSesion.mjs";
import { PERMISOS } from "./token-sesiones.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const CLAVE_ROTA = ["-----BEGIN RSA PRIVATE KEY-----", "SECRETO-DE-PRUEBA", "-----END RSA PRIVATE KEY-----"].join("\n");
const TOKEN =`ghs_${"a1B2c3D4".repeat(5)}`;
const res = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

/** Un GitHub de mentira: guarda cada llamada para mirar qué se mandó. */
function githubFalso({ instalacion = res(200, { id: 77 }), acceso = res(201, { token: TOKEN, expires_at: "2026-10-10T12:00:00Z", permissions: { ...PERMISOS }, repositories: [{ name: "MenuPlan" }] }), usuario = res(200, { id: 999 }), detalle = res(200, { permissions: { ...PERMISOS }, repository_selection: "selected" }) } = {}) {
  const llamadas = [];
  const f = vi.fn(async (url, init = {}) => {
    llamadas.push({ url, init });
    if (url.endsWith("/installation")) return instalacion;
    if (url.endsWith("/app/installations/77")) return detalle;
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
    const pedido = JSON.parse(llamadas.find((l) => l.init.method === "POST").init.body);
    expect(pedido).toEqual({ repositories: ["MenuPlan"], permissions: PERMISOS });
    expect(pedido.permissions.workflows).toBeUndefined();
    expect(llamadas.some((l) => l.url.includes("/app/installations/77/access_tokens"))).toBe(true);
    expect(t.advertencias).toEqual([]);
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
  // Sin llamar a 1Password de verdad: cada ejecución del test gastaba una lectura del límite por hora
  it("si no se puede leer la ficha (sin cuenta de servicio, sin op o sin ficha) falla con sin-clave", async () => {
    const leer = async () => { throw Object.assign(new Error("\"no-existe-ni-existira\" isn't a vault in this account"), { code: 1 }); };
    const e = await leerClaveDeBoveda({ fichas: [{ vault: "no-existe-ni-existira", titulo: "x" }], leer }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ErrorTokenSesion);
    expect(e.motivo).toBe("sin-clave");
  });
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
  it("con la App dice solo lo que sabe: Bash sí, PowerShell no, y las credenciales de Pablo siguen", () => {
    const a = avisoDeIdentidad({ identidad: "app", token: "app" });
    expect(a).not.toMatch(/^AVISO/);
    expect(a).toContain("identidad: app token: app");
    expect(a).toMatch(/Bash/);
    expect(a).toMatch(/PowerShell/);
    expect(a).toMatch(/gh auth logout/);
    expect(a).toContain("-- git push");
    expect(a).not.toMatch(/sin administraci/);
  });
  it("la línea contable es la misma por stdout y por stderr, y solo admite identidades del vocabulario", () => {
    expect(avisoDeIdentidad({ identidad: "otra", token: "no", motivo: "red" })).toContain(lineaIdentidad({ identidad: "otra", token: "no", motivo: "red" }));
    expect(() => lineaIdentidad({ identidad: "admin", token: "no" })).toThrow();
    expect(IDENTIDADES).toEqual(["pablo", "app", "otra", "desconocida"]);
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

describe("advertencias de la instalación", () => {
  const conDetalle = (detalle) => tokenDeSesion({ fetch: githubFalso({ detalle }).f, leerClave: async () => privateKey });
  it("avisa si la App tiene más permisos de los pedidos o acceso a todos los repos, y si no pudo mirar", async () => {
    expect((await conDetalle(res(200, { permissions: { ...PERMISOS, administration: "write" }, repository_selection: "selected" }))).advertencias).toEqual(["permisos-de-mas"]);
    expect((await conDetalle(res(200, { permissions: { ...PERMISOS, contents: "admin" }, repository_selection: "selected" }))).advertencias).toEqual(["permisos-de-mas"]);
    expect((await conDetalle(res(200, { permissions: { ...PERMISOS }, repository_selection: "all" }))).advertencias).toEqual(["todos-los-repos"]);
    expect((await conDetalle(res(500, {}))).advertencias).toEqual(["app-sin-comprobar"]);
  });
  it("avisa si la clave salió de la ficha temporal de HoMenu", async () => {
    const t = await tokenDeSesion({ fetch: githubFalso().f, leerClave: async () => ({ pem: privateKey, temporal: true }) });
    expect(t.advertencias).toEqual(["clave-en-HoMenu"]);
    expect(FICHAS_CLAVE.filter((f) => f.temporal).map((f) => f.vault)).toEqual(["HoMenu"]);
  });
});

describe("lineasDeEntorno con GIT_CONFIG_COUNT previo", () => {
  it("añade detrás de lo que ya hubiera, sin pisarlo", () => {
    const t = lineasDeEntorno({ token: TOKEN, autor: { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" }, configPrevia: 3 });
    expect(t).toContain("export GIT_CONFIG_COUNT=5");
    expect(t).toContain("export GIT_CONFIG_KEY_3=");
    expect(t).toContain("export GIT_CONFIG_VALUE_4=");
    expect(t).not.toContain("GIT_CONFIG_KEY_0=");
  });
});

describe("aplicarIdentidad (lo que hace el arranque)", () => {
  const autor = { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" };
  const ok = async () => ({ token: TOKEN, autor, advertencias: [] });
  const uso = (extra = {}) => {
    const escrito = [];
    const registrado = [];
    const base = { env: { CLAUDE_ENV_FILE: "/tmp/f" }, escribir: (f, t) => escrito.push([f, t]), generar: ok, identificar: async () => ({ status: 1, stderr: "Resource not accessible by integration" }), registrar: (l) => registrado.push(l) };
    return { escrito, registrado, opciones: { ...base, ...extra } };
  };

  it("canjea, escribe con un salto de línea delante y dice que la App responde", async () => {
    const { escrito, registrado, opciones } = uso();
    const aviso = await aplicarIdentidad(opciones);
    expect(escrito).toHaveLength(1);
    expect(escrito[0][0]).toBe("/tmp/f");
    expect(escrito[0][1].startsWith("\nexport GH_TOKEN=")).toBe(true);
    expect(aviso).toContain("identidad: app token: app");
    expect(registrado).toEqual([aviso.slice(aviso.indexOf("identidad-sesion"))]);
    expect(aviso).not.toContain(TOKEN);
  });
  it("pasa GH_TOKEN a gh solo en la copia del entorno, y respeta GIT_CONFIG_COUNT previo", async () => {
    const vistos = [];
    const { escrito, opciones } = uso({ env: { CLAUDE_ENV_FILE: "/tmp/f", GIT_CONFIG_COUNT: "2" }, identificar: async (e) => { vistos.push(e.GH_TOKEN); return { status: 0, stdout: "homenu-sesiones[bot]" }; } });
    await aplicarIdentidad(opciones);
    expect(vistos).toEqual([TOKEN]);
    expect(escrito[0][1]).toContain("export GIT_CONFIG_COUNT=4");
  });
  it("si el canje falla: no escribe nada, avisa como Pablo con el motivo y sigue", async () => {
    const { escrito, opciones } = uso({ generar: async () => { throw new ErrorTokenSesion("sin-clave", "x"); }, identificar: async () => ({ status: 0, stdout: "pabloam89" }) });
    const aviso = await aplicarIdentidad(opciones);
    expect(escrito).toEqual([]);
    expect(aviso).toMatch(/^AVISO: .*pabloam89/);
    expect(aviso).toContain("identidad: pablo token: no motivo: sin-clave");
  });
  it("sin CLAUDE_ENV_FILE no aplica el token aunque lo haya generado", async () => {
    const { escrito, opciones } = uso({ env: {}, identificar: async () => ({ status: 0, stdout: "pabloam89" }) });
    const aviso = await aplicarIdentidad(opciones);
    expect(escrito).toEqual([]);
    expect(aviso).toContain("motivo: sin-fichero-de-entorno");
  });
  it("un error que no es de la casa se cuenta como error-interno, sin romper", async () => {
    const { opciones } = uso({ generar: async () => { throw new TypeError("boom"); }, identificar: async () => ({ status: 1 }) });
    expect(await aplicarIdentidad(opciones)).toContain("motivo: error-interno");
  });
  it("una identidad colgada no pasa del tope: vuelve desconocida, motivo red", async () => {
    const { opciones } = uso({ tope: 50, identificar: () => new Promise(() => {}) });
    const t0 = Date.now();
    const aviso = await aplicarIdentidad(opciones);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(aviso).toContain("identidad: desconocida token: no motivo: red");
  });
  it("un canje que termina DESPUÉS del tope no escribe el token ni añade una segunda línea contable", async () => {
    const { escrito, registrado, opciones } = uso({ tope: 20, generar: () => new Promise((ok) => setTimeout(() => ok({ token: TOKEN, autor, advertencias: [] }), 100)) });
    const aviso = await aplicarIdentidad(opciones);
    await new Promise((ok) => setTimeout(ok, 250));
    expect(aviso).toContain("identidad: desconocida token: no motivo: red");
    expect(escrito).toEqual([]);
    expect(registrado).toHaveLength(1);
  });
  it("lo mismo si es la comprobación de gh la que termina tarde", async () => {
    const { registrado, opciones } = uso({ tope: 20, identificar: () => new Promise((ok) => setTimeout(() => ok({ status: 0, stdout: "pabloam89" }), 100)) });
    await aplicarIdentidad(opciones);
    await new Promise((ok) => setTimeout(ok, 250));
    expect(registrado).toHaveLength(1);
  });
  it("una advertencia fuera del vocabulario no pasa", () => {
    expect(() => avisoDeIdentidad({ identidad: "app", token: "app", advertencias: ["inventada"] })).toThrow();
    expect(avisoDeIdentidad({ identidad: "app", token: "app", advertencias: ADVERTENCIAS })).toContain("ADVERTENCIA");
  });
  it("un canje colgado tampoco", async () => {
    const { opciones } = uso({ tope: 50, generar: () => new Promise(() => {}) });
    expect(await aplicarIdentidad(opciones)).toContain("motivo: red");
  });
});

describe("arranque.mjs", () => {
  it("sigue siendo JavaScript válido y usa aplicarIdentidad esperándola antes de imprimir", () => {
    const ruta = fileURLToPath(new URL("../.claude/hooks/arranque.mjs", import.meta.url));
    execFileSync(process.execPath, ["--check", ruta]);
    const src = readFileSync(ruta, "utf8");
    expect(src).toContain("aplicarIdentidad()");
    expect(src).toContain("avisos.push(await identidad)");
  });
});

// ── La caché del token entre sesiones (E3): fs real en un directorio temporal, reloj inyectado ──
describe("caché del token entre sesiones", () => {
  const MIN = 60_000;
  const T0 = Date.now();
  const autor = { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" };
  const ids = (installationId = 77) => () => ({ appId: APP_ID, installationId });
  const dirs = [];
  const nueva = () => {
    const dir = mkdtempSync(join(tmpdir(), "cache-token-"));
    dirs.push(dir);
    return join(dir, "MenuPlan", "token-sesion.json");
  };
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const guardar = (ruta, extra = {}) => {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, JSON.stringify({ v: 1, token: TOKEN, expiraEn: new Date(T0 + 30 * MIN).toISOString(), appId: APP_ID, installationId: 77, ...extra }));
  };
  const leerAhora = (ruta) => leerCache({ ruta, ids: { appId: APP_ID, installationId: 77 }, reloj: () => T0, permisosBien: () => true });
  const opcionesCache = (ruta, extra = {}) => ({ ruta, proteger: () => true, permisosBien: () => true, esperaBloqueoMs: 40, sondeoMs: 5, ...extra });
  /** Un canje de mentira que cuenta cuántas veces se pidió. */
  const generador = (extra = {}) => vi.fn(async () => ({ token: TOKEN, expiraEn: new Date(T0 + 60 * MIN).toISOString(), installationId: 77, autor, advertencias: [], ...extra }));
  const usar = (ruta, o = {}) => tokenConCache({ ids: ids(), reloj: () => T0, cache: opcionesCache(ruta), ...o });

  it("canjea una vez, lo guarda sin la clave y lo reutiliza después sin canjear", async () => {
    const ruta = nueva();
    const generar = generador();
    const a = await usar(ruta, { generar });
    expect(a.cache).toBe("no");
    const b = await usar(ruta, { generar });
    expect(b.cache).toBe("si");
    expect(b.token).toBe(TOKEN);
    expect(b.autor.nombre).toBe("homenu-sesiones[bot]");
    expect(generar).toHaveBeenCalledTimes(1);
    const crudo = readFileSync(ruta, "utf8");
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(["appId", "expiraEn", "installationId", "token", "v"]);
    expect(crudo).not.toContain("PRIVATE KEY");
    expect(readdirSync(dirname(ruta)).sort()).toEqual(["token-sesion.json"]); // sin temporales ni bloqueo
  });

  it("reutiliza con 16 minutos por delante y renueva con 14", async () => {
    const ruta = nueva();
    const generar = generador();
    guardar(ruta, { expiraEn: new Date(T0 + 16 * MIN).toISOString() });
    expect((await usar(ruta, { generar })).cache).toBe("si");
    expect(generar).not.toHaveBeenCalled();
    guardar(ruta, { expiraEn: new Date(T0 + 14 * MIN).toISOString() });
    expect((await usar(ruta, { generar })).cache).toBe("no");
    expect(generar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(ruta, "utf8")).expiraEn).toBe(new Date(T0 + 60 * MIN).toISOString());
    expect(MARGEN_MS).toBe(15 * MIN);
  });

  it.each([
    ["caducada", { expiraEn: new Date(T0 - MIN).toISOString() }, "caducado"],
    ["con caducidad a más de una hora y poco", { expiraEn: new Date(T0 + 65 * MIN).toISOString() }, "forma"],
    ["con la fecha en texto libre", { expiraEn: new Date(T0 + 30 * MIN).toUTCString() }, "forma"],
    ["con la fecha ISO con desfase en vez de Z", { expiraEn: new Date(T0 + 30 * MIN).toISOString().replace("Z", "+00:00") }, "forma"],
    ["con un salto de línea en la fecha", { expiraEn: `${new Date(T0 + 30 * MIN).toISOString()}\nOtra línea` }, "forma"],
    ["con el token de forma rara", { token: "x; rm -rf /" }, "forma"],
    ["con la fecha ilegible", { expiraEn: "mañana" }, "forma"],
    ["con una clave de más (nada más que lo pactado)", { pem: "-----BEGIN RSA PRIVATE KEY-----" }, "forma"],
    ["de otra versión", { v: 2 }, "forma"],
    ["de otra App", { appId: 1234 }, "otra-app"],
    ["de otra instalación", { installationId: 88 }, "otra-app"],
  ])("ignora una caché %s y canjea", async (_c, cambio, motivo) => {
    const ruta = nueva();
    const generar = generador();
    guardar(ruta, cambio);
    expect(leerAhora(ruta).motivo).toBe(motivo);
    expect((await usar(ruta, { generar })).cache).toBe("no");
    expect(generar).toHaveBeenCalledTimes(1);
  });

  it("ignora un fichero corrupto o vacío y canjea", async () => {
    for (const basura of ["{no es json", "", "[]", "null"]) {
      const ruta = nueva();
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, basura);
      const generar = generador();
      expect((await usar(ruta, { generar })).cache).toBe("no");
      expect(generar).toHaveBeenCalledTimes(1);
      expect(leerAhora(ruta).motivo).toBe("ok");
    }
  });

  it("con la instalación sin fijar acepta la guardada; con otra App no", async () => {
    const ruta = nueva();
    guardar(ruta);
    const generar = generador();
    expect((await usar(ruta, { generar, ids: () => ({ appId: APP_ID, installationId: null }) })).cache).toBe("si");
    expect((await usar(ruta, { generar, ids: () => ({ appId: 999, installationId: null }) })).cache).toBe("no");
  });

  it("ignora la caché si los permisos no son solo del usuario, y no la guarda si no puede cerrarlos", async () => {
    const ruta = nueva();
    guardar(ruta);
    const generar = generador();
    const r = await usar(ruta, { generar, cache: opcionesCache(ruta, { permisosBien: () => false }) });
    expect(r.cache).toBe("no");
    expect(generar).toHaveBeenCalledTimes(1);
    const ruta2 = nueva();
    await usar(ruta2, { generar, cache: opcionesCache(ruta2, { proteger: () => false }) });
    expect(existsSync(ruta2)).toBe(false);
    expect(readdirSync(dirname(ruta2)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("permisos reales: el fichero escrito es solo del usuario y uno aflojado se rechaza", () => {
    const ruta = nueva();
    expect(escribirCache({ ruta, datos: { token: TOKEN, expiraEn: new Date(T0 + 30 * MIN).toISOString(), appId: APP_ID, installationId: 77 } })).toBe(true);
    expect(permisosDelUsuario(ruta)).toBe(true);
    expect(leerCache({ ruta, ids: { appId: APP_ID, installationId: 77 }, reloj: () => T0 }).motivo).toBe("ok");
    if (process.platform === "win32") {
      execFileSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "icacls.exe"), [ruta, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" }); // «Todos»
    } else {
      chmodSync(ruta, 0o644);
    }
    expect(permisosDelUsuario(ruta)).toBe(false);
    expect(leerCache({ ruta, ids: { appId: APP_ID, installationId: 77 }, reloj: () => T0 }).motivo).toBe("permisos");
    expect(protegerFichero(ruta)).toBe(true);
    expect(permisosDelUsuario(ruta)).toBe(true);
  });

  it("escribe de forma atómica: si el rename falla, la caché buena de antes queda intacta", () => {
    const ruta = nueva();
    guardar(ruta);
    const antes = readFileSync(ruta, "utf8");
    const fs = { mkdirSync, writeFileSync, unlinkSync: rmSync, renameSync: () => { throw new Error("EPERM"); } };
    expect(escribirCache({ ruta, fs, proteger: () => true, datos: { token: `ghs_${"Z9y8".repeat(6)}`, expiraEn: new Date(T0).toISOString(), appId: APP_ID, installationId: 77 } })).toBe(false);
    expect(readFileSync(ruta, "utf8")).toBe(antes);
    expect(readdirSync(dirname(ruta)).sort()).toEqual(["token-sesion.json"]);
  });

  it("carrera: dos arranques a la vez canjean UNA vez y el fichero queda entero", async () => {
    const ruta = nueva();
    const generar = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 80));
      return { token: TOKEN, expiraEn: new Date(Date.now() + 60 * MIN).toISOString(), installationId: 77, autor, advertencias: [] };
    });
    const opciones = { ids: ids(), generar, reloj: Date.now, cache: opcionesCache(ruta, { esperaBloqueoMs: 3000 }) };
    const [a, b] = await Promise.all([tokenConCache(opciones), tokenConCache(opciones)]);
    expect(generar).toHaveBeenCalledTimes(1);
    expect([a.cache, b.cache].sort()).toEqual(["no", "si"]);
    expect(a.token).toBe(b.token);
    expect(JSON.parse(readFileSync(ruta, "utf8")).token).toBe(TOKEN);
    expect(readdirSync(dirname(ruta)).sort()).toEqual(["token-sesion.json"]);
  });

  it("si otro tiene el bloqueo y la espera vence, NO canjea en paralelo: motivo bloqueo-ocupado y el bloqueo ajeno intacto", async () => {
    const ruta = nueva();
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(`${ruta}.lock`, "otro");
    const generar = generador({ expiraEn: new Date(Date.now() + 60 * MIN).toISOString() });
    const e = await usar(ruta, { generar, reloj: Date.now }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorTokenSesion);
    expect(e.motivo).toBe("bloqueo-ocupado");
    expect(MOTIVOS).toContain("bloqueo-ocupado");
    expect(generar).not.toHaveBeenCalled();
    expect(existsSync(`${ruta}.lock`)).toBe(true);
  });

  it("dos arranques con un canje más lento que la espera: un solo canje y el segundo no canjea", async () => {
    const ruta = nueva();
    const generar = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 400));
      return { token: TOKEN, expiraEn: new Date(Date.now() + 60 * MIN).toISOString(), installationId: 77, autor, advertencias: [] };
    });
    const opciones = { ids: ids(), generar, reloj: Date.now, cache: opcionesCache(ruta, { esperaBloqueoMs: 60 }) };
    const [a, b] = await Promise.allSettled([tokenConCache(opciones), (async () => { await new Promise((ok) => setTimeout(ok, 20)); return tokenConCache(opciones); })()]);
    expect(generar).toHaveBeenCalledTimes(1);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect(b.reason.motivo).toBe("bloqueo-ocupado");
  });

  it("la espera del bloqueo no pasa del límite absoluto `hasta` que da el arranque", async () => {
    const ruta = nueva();
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(`${ruta}.lock`, "otro");
    const t0 = Date.now();
    const e = await usar(ruta, { generar: generador(), reloj: Date.now, hasta: t0 + 80, cache: opcionesCache(ruta, { esperaBloqueoMs: 5000 }) }).catch((x) => x);
    expect(e.motivo).toBe("bloqueo-ocupado");
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it("si el bloqueo no se puede ni crear (permisos), canjea sin él", async () => {
    const ruta = nueva();
    const fs = { mkdirSync, statSync, readFileSync, renameSync, unlinkSync, writeFileSync: (f, ...r) => { if (String(f).endsWith(".lock")) throw Object.assign(new Error("x"), { code: "EACCES" }); return writeFileSync(f, ...r); } };
    const generar = generador();
    const r = await usar(ruta, { generar, cache: opcionesCache(ruta, { fs }) });
    expect(r.cache).toBe("no");
    expect(generar).toHaveBeenCalledTimes(1);
  });

  it("aplicarIdentidad da a la caché un límite absoluto dentro de su presupuesto", async () => {
    const vistos = [];
    const antes = Date.now();
    await aplicarIdentidad({ env: {}, tope: 13_000, registrar: () => {}, identificar: async () => ({ status: 0, stdout: "pabloam89" }), generar: async (o) => { vistos.push(o.hasta); return { token: TOKEN, autor, advertencias: [] }; } });
    expect(vistos[0]).toBeGreaterThan(antes);
    expect(vistos[0]).toBeLessThanOrEqual(Date.now() + 13_000 - 2000);
  });

  it("si la identidad queda sin comprobar por el tope, el aviso dice que puede ir como Pablo", async () => {
    const aviso = await aplicarIdentidad({ env: { CLAUDE_ENV_FILE: "/tmp/f" }, tope: 30, registrar: () => {}, generar: () => new Promise(() => {}) });
    expect(aviso).toMatch(/^AVISO: .*puede estar yendo como Pablo/);
    expect(aviso).toContain("identidad: desconocida token: no motivo: red");
  });

  it("un bloqueo huérfano de hace más de 20 s se quita; uno de 10 s no", async () => {
    const ruta = nueva();
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(`${ruta}.lock`, "reciente");
    const reciente = new Date(Date.now() - 10_000);
    utimesSync(`${ruta}.lock`, reciente, reciente);
    expect((await usar(ruta, { generar: generador(), reloj: Date.now }).catch((x) => x)).motivo).toBe("bloqueo-ocupado");
    expect(existsSync(`${ruta}.lock`)).toBe(true);
    const vieja = new Date(Date.now() - 25_000);
    utimesSync(`${ruta}.lock`, vieja, vieja);
    const generar = generador({ expiraEn: new Date(Date.now() + 60 * MIN).toISOString() });
    await usar(ruta, { generar, reloj: Date.now });
    expect(generar).toHaveBeenCalledTimes(1);
    expect(existsSync(`${ruta}.lock`)).toBe(false);
  });

  describe("límite de lecturas de 1Password", () => {
    const limite = () => vi.fn(async () => { throw new ErrorTokenSesion("limite-de-1password", "Too many requests"); });
    it("con un token guardado que aún no caducó (menos de 15 min) lo usa y avisa", async () => {
      const ruta = nueva();
      guardar(ruta, { expiraEn: new Date(T0 + 4 * MIN).toISOString() });
      const r = await usar(ruta, { generar: limite() });
      expect(r.cache).toBe("si");
      expect(r.token).toBe(TOKEN);
      expect(r.advertencias).toEqual(["cache-casi-caducada"]);
      expect(ADVERTENCIAS).toContain("cache-casi-caducada");
    });
    it("sin caché, con la caché caducada o con --sin-cache, sale limite-de-1password", async () => {
      const sin = nueva();
      const e1 = await usar(sin, { generar: limite() }).catch((x) => x);
      expect(e1).toBeInstanceOf(ErrorTokenSesion);
      expect(e1.motivo).toBe("limite-de-1password");
      const caducada = nueva();
      guardar(caducada, { expiraEn: new Date(T0 - MIN).toISOString() });
      expect((await usar(caducada, { generar: limite() }).catch((x) => x)).motivo).toBe("limite-de-1password");
      const forzada = nueva();
      guardar(forzada, { expiraEn: new Date(T0 + 4 * MIN).toISOString() });
      expect((await usar(forzada, { generar: limite(), sinCache: true }).catch((x) => x)).motivo).toBe("limite-de-1password");
    });
    it("otro fallo del canje no se tapa con la caché casi caducada", async () => {
      const ruta = nueva();
      guardar(ruta, { expiraEn: new Date(T0 + 4 * MIN).toISOString() });
      const e = await usar(ruta, { generar: async () => { throw new ErrorTokenSesion("red", "x"); } }).catch((x) => x);
      expect(e.motivo).toBe("red");
    });
    it("leerClaveDeBoveda distingue el límite de «sin clave» y no gasta otra lectura en la otra bóveda", async () => {
      const leer = vi.fn(async () => { throw Object.assign(new Error("[ERROR] 2026/10/10 19:10:00 Too many requests. Try again later."), { code: 1 }); });
      const e = await leerClaveDeBoveda({ leer }).catch((x) => x);
      expect(e.motivo).toBe("limite-de-1password");
      expect(leer).toHaveBeenCalledTimes(1);
      const otra = vi.fn(async () => { throw new Error("no existe la ficha"); });
      expect((await leerClaveDeBoveda({ leer: otra }).catch((x) => x)).motivo).toBe("sin-clave");
      expect(otra).toHaveBeenCalledTimes(FICHAS_CLAVE.length);
      expect(MOTIVOS).toContain("limite-de-1password");
    });
  });

  it("la ruta es una por usuario: LOCALAPPDATA/MenuPlan si está en su perfil y ~/.claude si no", () => {
    const casa = () => "/home/p";
    expect(rutaDeCache({ LOCALAPPDATA: "/home/p/AppData/Local" }, casa)).toBe(join("/home/p/AppData/Local", "MenuPlan", "token-sesion.json"));
    expect(rutaDeCache({}, casa)).toBe(join("/home/p", ".claude", "token-sesion.json"));
    // el entorno puede mentir: fuera del perfil, en OneDrive o con «..» se usa ~/.claude
    for (const mala of ["/tmp/otro", "/home/p/OneDrive/AppData", "/home/pepe/AppData", "/home/p/../x"]) {
      expect(rutaDeCache({ LOCALAPPDATA: mala }, casa)).toBe(join("/home/p", ".claude", "token-sesion.json"));
    }
    expect(rutaDeCache({}, () => "/home/p/OneDrive/p")).toBe(null);
  });

  it("sin un sitio válido para la caché (ruta null) canjea sin leer ni escribir nada", async () => {
    const generar = generador();
    const tocados = [];
    const fs = new Proxy({}, { get: (_, k) => { tocados.push(k); return undefined; } });
    const r = await tokenConCache({ ids: ids(), reloj: () => T0, generar, cache: { ruta: null, fs } });
    expect(tocados).toEqual([]);
    expect(r.cache).toBe("no");
    expect(generar).toHaveBeenCalledTimes(1);
  });

  it("los permisos se miran ANTES de leer el contenido", () => {
    const ruta = nueva();
    guardar(ruta);
    const lecturas = [];
    const fs = { statSync, readFileSync: (...a) => { lecturas.push(a[0]); return readFileSync(...a); } };
    expect(leerCache({ ruta, ids: { appId: APP_ID, installationId: 77 }, reloj: () => T0, fs, permisosBien: () => false }).motivo).toBe("permisos");
    expect(lecturas).toEqual([]);
    expect(leerCache({ ruta, ids: { appId: APP_ID, installationId: 77 }, reloj: () => T0, fs, permisosBien: () => true }).motivo).toBe("ok");
    expect(lecturas).toEqual([ruta]);
  });

  it("icacls: nombres con espacios, y el mismo usuario de otro dominio no vale", () => {
    const ruta = "C:\\Users\\Ana García\\AppData\\Local\\MenuPlan\\token-sesion.json";
    const salida = `${ruta} PC\\Ana García:(F)\n\nSuccessfully processed 1 files; Failed processing 0 files\n`;
    expect(principalesDeIcacls(salida, ruta)).toEqual(["PC\\Ana García"]);
    expect(principalesDeIcacls(`${ruta} PC\\Ana García:(F)\n               OTRO\\Ana García:(R)\n`, ruta)).toEqual(["PC\\Ana García", "OTRO\\Ana García"]);
    if (process.platform !== "win32") return;
    // en Windows, permisosDelUsuario compara con el nombre completo que le pasan
    const real = nueva();
    escribirCache({ ruta: real, datos: { token: TOKEN, expiraEn: new Date(T0 + 30 * MIN).toISOString(), appId: APP_ID, installationId: 77 } });
    const yo = principalesDeIcacls(execFileSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "icacls.exe"), [real], { encoding: "utf8" }), real)[0];
    expect(permisosDelUsuario(real, yo)).toBe(true);
    expect(permisosDelUsuario(real, `OTRO\\${yo.split("\\").pop()}`)).toBe(false);
  });

  it("no escribe una caché con la fecha fuera del ISO estricto", () => {
    const ruta = nueva();
    for (const expiraEn of ["mañana", "Sat, 10 Oct 2026 23:00:00 GMT", "2026-10-10T12:00:00Z\nX", ""]) {
      expect(escribirCache({ ruta, proteger: () => true, datos: { token: TOKEN, expiraEn, appId: APP_ID, installationId: 77 } })).toBe(false);
    }
    expect(existsSync(ruta)).toBe(false);
  });

  describe("lo que ve el arranque y token-sesion.mjs", () => {
    it("la línea contable lleva cache: si|no con vocabulario cerrado", () => {
      expect(CACHES).toEqual(["si", "no"]);
      expect(lineaIdentidad({ identidad: "app", token: "app", cache: "si" })).toBe("identidad-sesion identidad: app token: app motivo: - cache: si");
      expect(lineaIdentidad({ identidad: "pablo", token: "no", motivo: "limite-de-1password" })).toContain("motivo: limite-de-1password cache: no");
      expect(() => lineaIdentidad({ identidad: "app", token: "app", cache: "quizá" })).toThrow();
    });
    it("aplicarIdentidad cuenta si el token salió de la caché", async () => {
      const base = { env: { CLAUDE_ENV_FILE: "/tmp/f" }, escribir: () => {}, identificar: async () => ({ status: 1, stderr: "by integration" }), registrar: () => {} };
      expect(await aplicarIdentidad({ ...base, generar: async () => ({ token: TOKEN, autor, advertencias: [], cache: "si" }) })).toContain("token: app motivo: - cache: si");
      expect(await aplicarIdentidad({ ...base, generar: async () => ({ token: TOKEN, autor, advertencias: [] }) })).toContain("cache: no");
      expect(await aplicarIdentidad({ ...base, generar: async () => { throw new ErrorTokenSesion("limite-de-1password"); }, identificar: async () => ({ status: 0, stdout: "pabloam89" }) })).toContain("motivo: limite-de-1password cache: no");
    });
    it("--comprobar dice si salió de la caché sin imprimir el token, y --sin-cache solo cuenta antes de --", async () => {
      const salida = { log: vi.fn(), error: vi.fn() };
      const generar = vi.fn(async () => ({ token: TOKEN, expiraEn: "x", autor, cache: "si", advertencias: [] }));
      expect(await main(["--comprobar"], { generar, salida })).toBe(0);
      expect(salida.log.mock.calls[0][0]).toMatch(/ok expira: x autor: .* cache: si$/);
      expect(JSON.stringify([salida.log.mock.calls, salida.error.mock.calls])).not.toContain(TOKEN);
      expect(generar).toHaveBeenLastCalledWith({ sinCache: false });
      await main(["--sin-cache", "--comprobar"], { generar, salida });
      expect(generar).toHaveBeenLastCalledWith({ sinCache: true });
      await main(["--", "gh", "--sin-cache"], { generar, salida, correr: () => ({ status: 0 }) });
      expect(generar).toHaveBeenLastCalledWith({ sinCache: false });
      const correr = vi.fn(() => ({ status: 7 }));
      expect(await main(["--", "gh", "pr", "create", "--comprobar"], { generar, salida, correr })).toBe(7);
      expect(correr).toHaveBeenCalledTimes(1);
      expect(correr.mock.calls[0][1]).toEqual(["pr", "create", "--comprobar"]);
      const caso = { token: TOKEN, expiraEn: "x", autor, cache: "no", advertencias: ["cache-casi-caducada"] };
      const s2 = { log: vi.fn(), error: vi.fn() };
      await main(["--comprobar"], { generar: async () => caso, salida: s2 });
      expect(s2.log.mock.calls[0][0]).toMatch(/cache: no$/);
      expect(s2.error.mock.calls[0][0]).toMatch(/aviso.*caduca a las x \(UTC\)/);
    });
  });
});
