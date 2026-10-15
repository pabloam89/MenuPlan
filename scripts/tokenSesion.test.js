// tokenSesion.test.js — la identidad de máquina de las sesiones (#329): JWT firmado de verdad,
// canje del token con un fetch de mentira, fallo cerrado sin filtrar nada y el aviso del arranque.
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NO_LANZADO, lanzar, main, resolverComando } from "./token-sesion.mjs";
import { ADVERTENCIAS, APP_ID, BOT_ID, CACHES, AUTOR_POR_DEFECTO, AYUDANTES, ErrorTokenSesion, FICHAS_CLAVE, IDENTIDADES, MODOS_ENTORNO, MOTIVOS, TOKEN_CENTINELA, aplicarIdentidad, avisoDeIdentidad, identidadDe, leerClaveDeBoveda, lineaIdentidad, entornoDeComando, lineaDePath, lineaDeToken, lineasDeEntorno, motivoDeCanje, rutaDeShimDesde, rutaParaGitBash, tokenConCache, tokenDeSesion, destinoDeRemoto, normalizarDestino } from "./lib/tokenSesion.mjs";
import { MARGEN_MS, escribirCache, leerCache, permisosDelUsuario, principalesDeIcacls, protegerFichero, rutaDeCache } from "./lib/cacheTokenSesion.mjs";
import { PERMISOS, PERMISOS_SIN_WORKFLOWS } from "./token-sesiones.mjs";
import { medianaMsAsync, topeMs } from "./lib/medirTiempo.mjs";

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
    expect(pedido.permissions.workflows).toBe("write");
    expect(llamadas.some((l) => l.url.includes("/app/installations/77/access_tokens"))).toBe(true);
    expect(t.advertencias).toEqual([]);
    expect(t.workflows).toBe("concedido");
  });

  // #422: mientras Pablo no active «Workflows» en la App, el canje no se rompe
  it("si la instalación dice que la App no tiene Workflows, pide sin él a la primera y lo dice", async () => {
    const { workflows: _w, ...sinW } = PERMISOS;
    const { f, llamadas } = githubFalso({
      detalle: res(200, { permissions: sinW, repository_selection: "selected" }),
      acceso: res(201, { token: TOKEN, expires_at: "2026-10-10T12:00:00Z", permissions: sinW, repositories: [{ name: "MenuPlan" }] }),
    });
    const t = await tokenDeSesion({ fetch: f, leerClave: async () => privateKey });
    const pedidos = llamadas.filter((l) => l.init.method === "POST").map((l) => JSON.parse(l.init.body).permissions);
    expect(pedidos).toEqual([PERMISOS_SIN_WORKFLOWS]);
    expect(t.workflows).toBe("sin-conceder");
    expect(t.advertencias).toEqual([]);
  });

  it("si no se pudo mirar la instalación, pide con Workflows y, ante el 422, otra vez sin él", async () => {
    const { workflows: _w, ...sinW } = PERMISOS;
    const pedidos = [];
    const { f } = githubFalso({ detalle: res(500, {}) });
    const g = async (url, init = {}) => {
      if (url.includes("/access_tokens")) {
        const p = JSON.parse(init.body).permissions;
        pedidos.push(p);
        return "workflows" in p
          ? res(422, { message: "The permissions requested are not granted to this installation." })
          : res(201, { token: TOKEN, expires_at: "2026-10-10T12:00:00Z", permissions: sinW, repositories: [{ name: "MenuPlan" }] });
      }
      return f(url, init);
    };
    const t = await tokenDeSesion({ fetch: g, leerClave: async () => privateKey });
    expect(pedidos).toEqual([PERMISOS, PERMISOS_SIN_WORKFLOWS]);
    expect(t.workflows).toBe("sin-conceder");
    expect(t.advertencias).toEqual(["app-sin-comprobar"]);
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
    ["el token trae un permiso que no se pidió", { fetch: githubFalso({ acceso: res(201, { token: TOKEN, permissions: { ...PERMISOS, packages: "read" }, repositories: [{ name: "MenuPlan" }] }) }).f }, "token-raro"],
    ["el token trae un permiso negado", { fetch: githubFalso({ acceso: res(201, { token: TOKEN, permissions: { ...PERMISOS, environments: "read" }, repositories: [{ name: "MenuPlan" }] }) }).f }, "token-raro"],
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

  it("el mensaje dice qué bóveda y ficha buscó cada vez y qué contestó la cuenta (no solo el último fallo)", async () => {
    const leer = async (f) => { throw new Error(f.vault === "HoMenu" ? "\"HoMenu\" isn't a vault in this account." : "\"GitHub App homenu-sesiones\" isn't an item in the \"HoMenu-sesiones\" vault."); };
    const e = await leerClaveDeBoveda({ leer }).catch((x) => x);
    expect(e.motivo).toBe("sin-clave");
    expect(e.message).toContain("HoMenu-sesiones/GitHub App homenu-sesiones");
    expect(e.message).toContain("isn't an item");
    expect(e.message).toContain("HoMenu/GitHub App Sesiones");
    expect(e.message).toContain("isn't a vault");
  });
});

describe("lineasDeEntorno", () => {
  const autor = { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" };
  it("pone el token, el ayudante de git que pide la credencial a gh en el momento y el autor y committer", () => {
    const t = lineasDeEntorno({ token: TOKEN, autor });
    expect(t).toContain(`export GH_TOKEN='${TOKEN}'`);
    // El ayudante delega en `gh auth git-credential` (el gh del PATH renueva el token al usarse) y, sin GH_TOKEN, recibe el token de relleno
    expect(t).toContain("'!f() { GH_TOKEN=\"${GH_TOKEN:-sin-token-de-sesion}\" gh auth git-credential \"$@\"; }; f'");
    expect(t).not.toContain("echo password=");
    expect(t.split(TOKEN).length - 1).toBe(1); // el token aparece una sola vez
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
  it("el parámetro `ayudante` elige el de git; `entorno` es el de antes (lee $GH_TOKEN) y un valor fuera del vocabulario no pasa", () => {
    expect(AYUDANTES).toEqual(["gh-credential", "entorno"]);
    expect(lineasDeEntorno({ token: TOKEN, autor, ayudante: "entorno" })).toContain("'!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'");
    expect(() => lineasDeEntorno({ token: TOKEN, autor, ayudante: "otro" })).toThrow(/vocabulario/);
  });
  it("el token de relleno pasa SOLO por el modo sin canje; un token sin forma sigue dando token-raro en el normal", () => {
    expect(MODOS_ENTORNO).toEqual(["normal", "sin-canje"]);
    const t = lineasDeEntorno({ token: TOKEN_CENTINELA, autor, modo: "sin-canje" });
    expect(t).toContain("export GH_TOKEN='sin-token-de-sesion'");
    expect(() => lineasDeEntorno({ token: TOKEN_CENTINELA, autor })).toThrow(expect.objectContaining({ motivo: "token-raro" }));
    expect(() => lineasDeEntorno({ token: TOKEN, autor, modo: "sin-canje" })).toThrow(expect.objectContaining({ motivo: "token-raro" }));
    expect(() => lineasDeEntorno({ token: "", autor, modo: "sin-canje" })).toThrow();
    expect(() => lineasDeEntorno({ token: "malo", autor })).toThrow(expect.objectContaining({ motivo: "token-raro" }));
    expect(() => lineasDeEntorno({ token: TOKEN, autor, modo: "otro" })).toThrow(/vocabulario/);
  });
  it("lineaDeToken solo escribe un token con forma", () => {
    expect(lineaDeToken(TOKEN)).toBe(`export GH_TOKEN='${TOKEN}'
`);
    expect(() => lineaDeToken(TOKEN_CENTINELA)).toThrow(expect.objectContaining({ motivo: "token-raro" }));
  });
  it("los motivos nuevos están en el vocabulario único MOTIVOS", () => {
    expect(MOTIVOS).toEqual(expect.arrayContaining(["fallo-reciente", "ruta-de-shim-rara"]));
    expect(new Set(MOTIVOS).size).toBe(MOTIVOS.length);
  });
});

describe("la línea de PATH del shim (#719)", () => {
  it("convierte la ruta de Windows a la de Git Bash", () => {
    expect(rutaParaGitBash(String.raw`C:\dev\MenuPlan-x\scripts\bin`)).toBe("/c/dev/MenuPlan-x/scripts/bin");
    expect(rutaParaGitBash("/home/u/r/scripts/bin")).toBe("/home/u/r/scripts/bin");
  });
  it("la línea no lleva `:` final (añadiría el directorio actual) y conserva el PATH que hubiera", () => {
    const { linea } = lineaDePath(String.raw`C:\dev\MenuPlan-x\scripts\bin`);
    expect(linea).toBe("export PATH='/c/dev/MenuPlan-x/scripts/bin'${PATH:+:$PATH}\n");
  });
  it("también vale una ruta de Linux o de la nube (el CI no escribía la línea con `^/[a-z]/`)", () => {
    expect(lineaDePath("/home/runner/work/menuplan/menuplan/scripts/bin").linea).toBe("export PATH='/home/runner/work/menuplan/menuplan/scripts/bin'${PATH:+:$PATH}\n");
  });
  it.each([
    ["con espacios", String.raw`C:\dev\Mi carpeta\scripts\bin`],
    ["con una comilla", String.raw`C:\dev\a'b\scripts\bin`],
    ["con ..", "/c/dev/../x/scripts/bin"],
    ["con .", "/c/dev/./x/scripts/bin"],
    ["con $", "/c/dev/$HOME/scripts/bin"],
    ["con punto y coma", "/c/dev/a;b/scripts/bin"],
    ["relativa", "scripts/bin"],
    ["otra carpeta final", "/c/dev/x/scripts/otra"],
    ["vacía", ""],
    ["sin ruta", undefined],
  ])("una ruta rara (%s) no escribe la línea y deja el motivo del vocabulario", (_c, ruta) => {
    const r = lineaDePath(ruta);
    expect(r.linea).toBeUndefined();
    expect(r.motivo).toBe("ruta-de-shim-rara");
    expect(MOTIVOS).toContain(r.motivo);
  });
  it("la ruta sale de la ubicación del fichero que la pide, no del cwd", () => {
    const antes = process.cwd();
    const url = pathToFileURL(join(tmpdir(), "repo-x", ".claude", "hooks", "arranque.mjs")).href;
    const esperada = join(tmpdir(), "repo-x", "scripts", "bin");
    try {
      process.chdir(tmpdir());
      expect(rutaDeShimDesde(url)).toBe(esperada);
      process.chdir(dirname(fileURLToPath(import.meta.url)));
      expect(rutaDeShimDesde(url)).toBe(esperada);
    } finally {
      process.chdir(antes);
    }
  });
});

describe("entornoDeComando (que token-sesion -- git push no dependa del arranque)", () => {
  const autor = { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" };
  it("desde un entorno vacío trae token, ayudante de git de github.com y autor", () => {
    const e = entornoDeComando({ token: TOKEN, autor, base: {} });
    expect(e.GH_TOKEN).toBe(TOKEN);
    expect(e.GIT_CONFIG_COUNT).toBe("2");
    expect(e.GIT_CONFIG_KEY_0).toBe("credential.https://github.com.helper");
    expect(e.GIT_CONFIG_VALUE_0).toBe(""); // vacía el ayudante de la máquina
    // El envoltorio conserva su ayudante: su hijo lleva un token recién canjeado y no depende del PATH
    expect(e.GIT_CONFIG_VALUE_1).toContain("password=$GH_TOKEN");
    expect(e.GIT_CONFIG_VALUE_1).not.toContain("git-credential");
    expect(e.GIT_AUTHOR_NAME).toBe("homenu-sesiones[bot]");
  });
  it("respeta lo que ya hubiera: conserva el resto del entorno y añade detrás de su GIT_CONFIG_COUNT", () => {
    const e = entornoDeComando({ token: TOKEN, autor, base: { PATH: "/x", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "a.b", GIT_CONFIG_VALUE_0: "c" } });
    expect(e.PATH).toBe("/x");
    expect(e.GIT_CONFIG_COUNT).toBe("3");
    expect(e.GIT_CONFIG_KEY_0).toBe("a.b");
    expect(e.GIT_CONFIG_KEY_1).toBe("credential.https://github.com.helper");
  });
  it("sigue rechazando un token raro", () => {
    expect(() => entornoDeComando({ token: "malo", autor, base: {} })).toThrow();
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
  it("con la App dice solo lo que sabe: Bash sí, PowerShell no, y que Pablo ya cerró su sesión de gh", () => {
    const a = avisoDeIdentidad({ identidad: "app", token: "app" });
    expect(a).not.toMatch(/^AVISO/);
    expect(a).toContain("identidad: app token: app");
    expect(a).toMatch(/Bash/);
    expect(a).toMatch(/PowerShell/);
    expect(a).toMatch(/cerró su sesión de `gh`/);
    expect(a).not.toMatch(/siguen en el llavero/);
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
    expect(await main(["--", "gh", "pr", "list"], { generar: async () => ({ token: TOKEN, autor: { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" } }), correr, salida: salida() })).toBe(0);
    expect(correr.mock.calls[0][0]).toBe("gh");
    expect(correr.mock.calls[0][2].env.GH_TOKEN).toBe(TOKEN);
    expect(correr.mock.calls[0][2].env.GIT_CONFIG_VALUE_1).toContain("password=$GH_TOKEN"); // git también, sin el entorno del arranque
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

  it("escribe PRIMERO el token de relleno y lo demás, canjea, añade el token real DESPUÉS y dice que la App responde", async () => {
    const { escrito, registrado, opciones } = uso();
    const aviso = await aplicarIdentidad(opciones);
    expect(escrito).toHaveLength(2);
    expect(escrito[0][0]).toBe("/tmp/f");
    expect(escrito[0][1].startsWith("\nexport GH_TOKEN='sin-token-de-sesion'")).toBe(true);
    expect(escrito[0][1]).not.toContain(TOKEN);
    expect(escrito[1][1]).toBe(`export GH_TOKEN='${TOKEN}'\n`);
    expect(aviso).toContain("identidad: app token: app");
    expect(registrado).toEqual([aviso.slice(aviso.indexOf("identidad-sesion"))]);
    expect(aviso).not.toContain(TOKEN);
  });
  it("si el canje dice si trae Workflows, deja su línea `token-sesion workflows:` antes de la de identidad (#422)", async () => {
    for (const w of ["sin-conceder", "concedido"]) {
      const { registrado, opciones } = uso({ generar: async () => ({ token: TOKEN, autor, advertencias: [], workflows: w }) });
      const aviso = await aplicarIdentidad(opciones);
      expect(registrado).toEqual([`token-sesion workflows: ${w}`, aviso.slice(aviso.indexOf("identidad-sesion"))]);
    }
    // De la caché no se sabe: no se deja línea
    const r2 = uso({ generar: async () => ({ token: TOKEN, autor, advertencias: [], workflows: "sin-saber", cache: "si" }) });
    const aviso = await aplicarIdentidad(r2.opciones);
    expect(r2.registrado).toEqual([aviso.slice(aviso.indexOf("identidad-sesion"))]);
  });
  it("pasa GH_TOKEN a gh solo en la copia del entorno, y respeta GIT_CONFIG_COUNT previo", async () => {
    const vistos = [];
    const { escrito, opciones } = uso({ env: { CLAUDE_ENV_FILE: "/tmp/f", GIT_CONFIG_COUNT: "2" }, identificar: async (e) => { vistos.push(e.GH_TOKEN); return { status: 0, stdout: "homenu-sesiones[bot]" }; } });
    await aplicarIdentidad(opciones);
    expect(vistos).toEqual([TOKEN]);
    expect(escrito[0][1]).toContain("export GIT_CONFIG_COUNT=4");
    expect(escrito[1][1]).not.toContain("GIT_CONFIG"); // el token real solo cambia el token
  });
  it("sesión de la nube con su propio GH_TOKEN y canje sin-clave: no escribe el token de relleno (taparía el suyo) y conserva el resto", async () => {
    const vistos = [];
    const { escrito, opciones } = uso({ nube: true, env: { CLAUDE_ENV_FILE: "/tmp/f", GH_TOKEN: "ghs_propio_de_la_nube_1234567890" }, generar: async () => { throw new ErrorTokenSesion("sin-clave", "x"); }, identificar: async (e) => { vistos.push(e.GH_TOKEN); return { status: 0, stdout: "alguien" }; } });
    await aplicarIdentidad(opciones);
    expect(escrito).toHaveLength(1);
    expect(escrito[0][1]).not.toContain("export GH_TOKEN=");
    expect(escrito[0][1]).toContain("gh auth git-credential");
    expect(vistos).toEqual(["ghs_propio_de_la_nube_1234567890"]);
  });
  it("sesión de la nube SIN GH_TOKEN propio, o una que no es de la nube: el token de relleno se escribe como siempre", async () => {
    for (const extra of [{ nube: true }, { nube: false, env: { CLAUDE_ENV_FILE: "/tmp/f", GH_TOKEN: "ghs_propio_1234567890123456" } }]) {
      const { escrito, opciones } = uso({ ...extra, generar: async () => { throw new ErrorTokenSesion("sin-clave", "x"); } });
      await aplicarIdentidad(opciones);
      expect(escrito[0][1]).toContain("export GH_TOKEN='sin-token-de-sesion'");
    }
  });
  it("si el canje falla: ya dejó el token de relleno y el resto (nunca un token real), avisa con el motivo y sigue", async () => {
    const { escrito, opciones } = uso({ generar: async () => { throw new ErrorTokenSesion("sin-clave", "x"); }, identificar: async () => ({ status: 0, stdout: "pabloam89" }) });
    const aviso = await aplicarIdentidad(opciones);
    expect(escrito).toHaveLength(1);
    expect(escrito[0][1]).toContain("export GH_TOKEN='sin-token-de-sesion'");
    expect(escrito[0][1]).toContain("gh auth git-credential");
    expect(escrito[0][1]).toContain(`export GIT_AUTHOR_EMAIL='${AUTOR_POR_DEFECTO.correo}'`);
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
    let aviso;
    const ms = await medianaMsAsync(async () => { aviso = await aplicarIdentidad(opciones); }, { n: 3, etiqueta: "identidad-colgada" });
    // Los 50 ms del tope son espera a propósito; lo que varía, suelto (medido el 2026-10-10:
    // 61-63 ms en total), 15 ms.
    expect(ms).toBeLessThan(topeMs(15, { fijoMs: 50 }));
    expect(aviso).toContain("identidad: desconocida token: no motivo: red");
  });
  it("un canje que termina DESPUÉS del tope no escribe el token real ni añade una segunda línea contable (lo previo sí está)", async () => {
    const { escrito, registrado, opciones } = uso({ tope: 20, generar: () => new Promise((ok) => setTimeout(() => ok({ token: TOKEN, autor, advertencias: [] }), 100)) });
    const aviso = await aplicarIdentidad(opciones);
    await new Promise((ok) => setTimeout(ok, 250));
    expect(aviso).toContain("identidad: desconocida token: no motivo: red");
    expect(escrito).toHaveLength(1); // solo lo previo al canje, con el token de relleno
    expect(escrito.join("")).not.toContain(TOKEN);
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
    expect(src).toMatch(/aplicarIdentidad\(/); // con o sin opciones (#652: registrar)
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
    let e;
    const ms = await medianaMsAsync(async () => {
      e = await usar(ruta, { generar: generador(), reloj: Date.now, hasta: Date.now() + 80, cache: opcionesCache(ruta, { esperaBloqueoMs: 5000 }) }).catch((x) => x);
    }, { n: 3, etiqueta: "bloqueo-hasta" });
    expect(e.motivo).toBe("bloqueo-ocupado");
    // Los 80 ms de `hasta` son espera a propósito; lo que varía, suelto (medido el 2026-10-10:
    // 92-93 ms en total), 15 ms. Sin el límite esperaría los 5000 ms de esperaBloqueoMs.
    expect(ms).toBeLessThan(topeMs(15, { fijoMs: 80 }));
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
      expect(salida.log.mock.calls[0][0]).toMatch(/ok expira: x autor: .* cache: si workflows: sin-saber$/);
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
      expect(s2.log.mock.calls[0][0]).toMatch(/cache: no workflows: sin-saber$/);
      const s3 = { log: vi.fn(), error: vi.fn() };
      await main(["--comprobar"], { generar: async () => ({ ...caso, advertencias: [], workflows: "concedido" }), salida: s3 });
      expect(s3.log.mock.calls[0][0]).toMatch(/cache: no workflows: concedido$/);
      expect(s2.error.mock.calls[0][0]).toMatch(/aviso.*caduca a las x \(UTC\)/);
    });
  });
});

// #720: el envoltorio lanza siempre el comando y, si no puede, lo dice. Antes, con npm en Windows
// spawnSync daba EINVAL, el código convertía status null en 1 y descartaba el error (#718).
describe("token-sesion lanza el comando sin shell y nunca sale mudo (#720)", () => {
  const generar = async () => ({ token: TOKEN, autor: { nombre: "homenu-sesiones[bot]", correo: "1+homenu-sesiones[bot]@users.noreply.github.com" } });
  const mudo = () => ({ log: vi.fn(), error: vi.fn() });
  const carpetaScripts = dirname(fileURLToPath(import.meta.url));
  const raiz = join(carpetaScripts, "..");

  it("npm run hora dentro del envoltorio imprime la hora y sale con 0", async () => {
    let captura = "";
    const correr = (c, a, o) => {
      const r = spawnSync(c, a, { ...o, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", cwd: raiz });
      captura = r.stdout ?? "";
      return r;
    };
    const salida = mudo();
    expect(await main(["--", "npm", "run", "hora"], { generar, correr, salida })).toBe(0);
    expect(captura).toMatch(/\d{1,2}:\d{2}/);
    expect(salida.error).not.toHaveBeenCalled();
  });

  it("un argumento con %GH_TOKEN%, &, comillas y espacios llega literal al hijo", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsesion-"));
    try {
      writeFileSync(join(dir, "npm-cli.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));"); // un «npm» de mentira que imprime sus argumentos
      const raros = ["%GH_TOKEN%", "a & b", 'di "hola" mundo', "x y  z", "%PATH%&calc", "^&|<>"];
      let salidaHijo = "";
      const correr = (c, a, o) => {
        const r = spawnSync(c, a, { ...o, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
        salidaHijo = r.stdout;
        return r;
      };
      const code = lanzar("npm", raros, { env: { ...process.env, GH_TOKEN: TOKEN } }, { correr, salida: mudo(), resolver: { env: { npm_execpath: join(dir, "npm-cli.js") } } });
      expect(code).toBe(0);
      expect(JSON.parse(salidaHijo)).toEqual(raros);
      expect(salidaHijo).not.toContain(TOKEN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("npm.cmd y npx se lanzan con node y su .js, sin shell", () => {
    const existe = (r) => r.endsWith("npm-cli.js") || r.endsWith("npx-cli.js");
    const r1 = resolverComando("npm.cmd", ["run", "hora"], { env: {}, execPath: "/n/node", existe });
    expect(r1.cmd).toBe("/n/node");
    expect(r1.args[0]).toMatch(/npm-cli\.js$/);
    expect(r1.args.slice(1)).toEqual(["run", "hora"]);
    expect(resolverComando("NPX", ["x"], { env: {}, execPath: "/n/node", existe }).args[0]).toMatch(/npx-cli\.js$/);
    expect(resolverComando("npm", [], { env: {}, existe: () => false, plataforma: "win32" }).rechazo).toBe("sin-npm-cli");
    expect(resolverComando("gh", ["pr", "list"])).toEqual({ cmd: "gh", args: ["pr", "list"] });
  });

  it("un comando inexistente sale con 127 y una línea con el motivo", async () => {
    const salida = mudo();
    expect(await main(["--", "comando-que-no-existe-720"], { generar, salida })).toBe(NO_LANZADO);
    expect(NO_LANZADO).toBe(127);
    expect(salida.error.mock.calls.map((c) => c[0])).toContain("token-sesion resultado: fallo motivo: comando-no-lanzado (ENOENT)");
  });

  it("un .cmd o .bat ajeno se rechaza con 127, sin ejecutarlo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tsesion-"));
    try {
      const marca = join(dir, "ejecutado.txt");
      const bat = join(dir, "ajeno.bat");
      writeFileSync(bat, `@echo off\r\necho x> "${marca}"\r\n`);
      for (const c of [bat, join(dir, "otro.CMD")]) {
        const correr = vi.fn();
        const salida = mudo();
        expect(await main(["--", c, "%GH_TOKEN%"], { generar, correr, salida })).toBe(127);
        expect(correr).not.toHaveBeenCalled();
        expect(salida.error.mock.calls[0][0]).toBe("token-sesion resultado: fallo motivo: comando-no-lanzado (cmd-o-bat-sin-shell)");
      }
      expect(existsSync(marca)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un error de spawn (EINVAL de Node 24 con un .cmd) sale con 127 y su código, no con 1", () => {
    const salida = mudo();
    const code = lanzar("gh", [], {}, { correr: () => ({ status: null, error: Object.assign(new Error("x"), { code: "EINVAL" }) }), salida });
    expect(code).toBe(127);
    expect(salida.error).toHaveBeenCalledWith("token-sesion resultado: fallo motivo: comando-no-lanzado (EINVAL)");
  });

  it("un hijo muerto por señal (status null, sin error) NO es 127: motivo propio y 128 + señal", () => {
    const salida = mudo();
    const code = lanzar("gh", [], {}, { correr: () => ({ status: null, signal: "SIGTERM" }), salida });
    expect(code).toBe(128 + 15);
    expect(salida.error).toHaveBeenCalledWith("token-sesion resultado: fallo motivo: comando-muerto-por-senal (SIGTERM)");
  });

  it("el código del propio comando pasa tal cual (el 1 de un gh que falla no se confunde con 127)", () => {
    const salida = mudo();
    expect(lanzar("gh", [], {}, { correr: () => ({ status: 1 }), salida })).toBe(1);
    expect(salida.error).not.toHaveBeenCalled();
  });

  // Barrido de la clase «envoltorio que devuelve un código sin decir por qué».
  // Criterio cerrado: un scripts/*.mjs (no test) con una línea que sale con el .status de un hijo
  // (`exit(…status ?? 1)` o `return …status ?? 1`). Comando del barrido (el comando recorre tambien scripts/lib: antes
  // de #720 daba 4 ficheros; el test mira solo el primer nivel de scripts/, donde solo token-sesion.mjs era un
  // envoltorio de comandos ajenos sin motivo; hoy el comando da 3, con lib/env.mjs fuera del test). Es el criterio de esta clase concreta, no una cobertura de todos los envoltorios posibles:
  //   grep -rnE "(exit\(|return ).*\.status \?\? 1" scripts --include=*.mjs --exclude=*.test.*
  // Cada fichero que lo cumple debe llevar el motivo («comando-no-lanzado») o estar exento con su porqué.
  it("barrido: todo envoltorio que sale con el status de un hijo dice por qué no pudo lanzarlo", () => {
    const EXENTOS = {
      "build-coste.mjs": "lanza node con un script fijo del repo, no un comando ajeno",
      "op.mjs": "ya lee r.error y nombra el motivo (ENOENT)",
    };
    const patron = /(exit\(|return ).*\.status \?\? 1/;
    const leer = (f) => readFileSync(join(carpetaScripts, f), "utf8");
    const sitios = readdirSync(carpetaScripts).filter((f) => f.endsWith(".mjs") && !/\.test\./.test(f) && patron.test(leer(f)));
    expect(sitios.filter((f) => !EXENTOS[f] && !/comando-no-lanzado/.test(leer(f)))).toEqual([]);
    for (const f of Object.keys(EXENTOS)) expect(sitios).toContain(f); // si un exento deja de cumplir el criterio, se quita de la lista
  });
});

describe("token por dueño del repo de destino", () => {
  const ORG = "factory-am89";
  const MIN = 60_000;
  const T0 = Date.now();
  const accesoDe = (repo) => res(201, { token: TOKEN, expires_at: "2026-10-10T12:00:00Z", permissions: { ...PERMISOS }, repositories: [{ name: repo }] });
  const leer = async () => privateKey;
  it("sin destino pide el repo de la casa; con otro dueño pide /orgs/<org>/installation y limita el token a su repo", async () => {
    const casa = githubFalso();
    await tokenDeSesion({ fetch: casa.f, leerClave: leer });
    expect(casa.llamadas[0].url).toMatch(/\/repos\/pabloam89\/MenuPlan\/installation$/);

    const org = githubFalso({ acceso: accesoDe("Fabrica") });
    await tokenDeSesion({ fetch: org.f, leerClave: leer, destino: { dueno: ORG, repo: "Fabrica" } });
    expect(org.llamadas[0].url).toMatch(new RegExp(`/orgs/${ORG}/installation$`));
    expect(org.llamadas.some((l) => l.url.includes("/repos/"))).toBe(false);
    expect(JSON.parse(org.llamadas.find((l) => l.init.method === "POST").init.body).repositories).toEqual(["Fabrica"]);
  });
  it("si no es organización (404) prueba /users/<login>/installation", async () => {
    const urls = [];
    const falso = githubFalso({ acceso: accesoDe("MenuPlan") }).f;
    const f = vi.fn(async (url, init = {}) => {
      urls.push(url);
      if (url.includes("/orgs/")) return res(404, {});
      if (url.endsWith("/users/alguien/installation")) return res(200, { id: 77 });
      return falso(url, init);
    });
    await tokenDeSesion({ fetch: f, leerClave: leer, destino: { dueno: "alguien" } });
    expect(urls.filter((u) => u.endsWith("/installation"))).toEqual([expect.stringContaining("/orgs/alguien/"), expect.stringContaining("/users/alguien/")]);
  });
  it("otro dueño ignora el id de instalación fijo de la casa", async () => {
    const { f, llamadas } = githubFalso({ acceso: accesoDe("MenuPlan") });
    await tokenDeSesion({ fetch: f, leerClave: leer, destino: { dueno: ORG }, ids: () => ({ appId: APP_ID, installationId: 55 }) });
    expect(llamadas[0].url).toContain(`/orgs/${ORG}/installation`);
  });
  it("normalizarDestino: el de la casa es null; una forma rara se rechaza", () => {
    expect(normalizarDestino(null)).toBeNull();
    expect(normalizarDestino({ dueno: "PabloAM89", repo: "MenuPlan" })).toBeNull();
    expect(normalizarDestino({ dueno: ORG })).toEqual({ dueno: ORG, repo: "MenuPlan" });
    for (const raro of [{ dueno: "a/b" }, { dueno: "..", repo: "x" }, { dueno: ORG, repo: ".." }, { dueno: ORG, repo: "a b" }, { dueno: "-x" }]) {
      expect(() => normalizarDestino(raro)).toThrow(ErrorTokenSesion);
    }
  });
  it("destinoDeRemoto lee https y ssh", () => {
    expect(destinoDeRemoto("https://github.com/factory-am89/Fabrica.git")).toEqual({ dueno: ORG, repo: "Fabrica" });
    expect(destinoDeRemoto("git@github.com:pabloam89/MenuPlan.git\n")).toEqual({ dueno: "pabloam89", repo: "MenuPlan" });
    expect(destinoDeRemoto("https://example.com/a/b")).toBeNull();
  });
  it("la caché de otro dueño es otro fichero y no sirve el token de la casa", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tokdueno-"));
    try {
      const ruta = join(dir, "token-sesion.json");
      const generar = vi.fn(async ({ destino }) => ({ token: TOKEN, expiraEn: new Date(T0 + 60 * MIN).toISOString(), installationId: destino ? 88 : 77, autor: { nombre: "b", correo: "1+b@users.noreply.github.com" }, advertencias: [] }));
      const o = { ids: () => ({ appId: APP_ID, installationId: null }), generar, reloj: () => T0, cache: { ruta, proteger: () => true, permisosBien: () => true, esperaBloqueoMs: 40, sondeoMs: 5 } };
      await tokenConCache(o);
      const dentro = await tokenConCache({ ...o, destino: { dueno: ORG, repo: "Fabrica" } });
      expect(dentro.cache).toBe("no");
      expect(generar.mock.calls[1][0].destino).toEqual({ dueno: ORG, repo: "Fabrica" });
      expect(readdirSync(dir).filter((x) => x.endsWith(".json")).sort()).toEqual(["token-sesion-factory-am89--fabrica.json", "token-sesion.json"]);
      expect((await tokenConCache({ ...o, destino: { dueno: ORG, repo: "Fabrica" } })).cache).toBe("si");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("destinos que solo se distinguen por el guion tienen ficheros distintos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tokdueno-"));
    try {
      const generar = vi.fn(async ({ destino }) => ({ token: TOKEN, expiraEn: new Date(T0 + 60 * MIN).toISOString(), installationId: destino.dueno.length, autor: { nombre: "b", correo: "1+b@users.noreply.github.com" }, advertencias: [] }));
      // Una ruta base sin .json también tiene que dar un fichero propio por destino
      for (const nombre of ["token-sesion.json", "sin-extension"]) {
        const ruta = join(dir, nombre);
        const o = { ids: () => ({ appId: APP_ID, installationId: null }), generar, reloj: () => T0, cache: { ruta, proteger: () => true, permisosBien: () => true, esperaBloqueoMs: 40, sondeoMs: 5 } };
        await tokenConCache({ ...o, destino: { dueno: "a", repo: "b-c" } });
        const otro = await tokenConCache({ ...o, destino: { dueno: "a-b", repo: "c" } });
        expect(otro.cache).toBe("no");
      }
      const ficheros = readdirSync(dir).sort();
      expect(ficheros).toHaveLength(4);
      expect(new Set(ficheros).size).toBe(4);
      expect(ficheros).toContain("token-sesion-a--b-c.json");
      expect(ficheros).toContain("token-sesion-a-b--c.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("main: --dueño y --del-remoto pasan el destino y no imprimen el token", async () => {
    const s = { log: vi.fn(), error: vi.fn() };
    const generar = vi.fn(async () => ({ token: TOKEN, expiraEn: "x", autor: { nombre: "b" } }));
    expect(await main(["--dueño", ORG, "--repo", "Fabrica", "--comprobar"], { generar, salida: s })).toBe(0);
    expect(generar.mock.calls[0][0].destino).toEqual({ dueno: ORG, repo: "Fabrica" });
    expect(await main(["--del-remoto", "--comprobar"], { generar, salida: s, remoto: () => "https://github.com/factory-am89/Fabrica.git" })).toBe(0);
    expect(generar.mock.calls[1][0].destino).toEqual({ dueno: ORG, repo: "Fabrica" });
    expect(await main(["--comprobar"], { generar, salida: s })).toBe(0);
    expect(generar.mock.calls[2][0].destino).toBeUndefined();
    expect(await main(["--dueño", "--comprobar"], { generar, salida: s })).toBe(2);
    expect(await main(["--del-remoto", "--comprobar"], { generar, salida: s, remoto: () => "" })).toBe(1);
    expect(JSON.stringify([s.log.mock.calls, s.error.mock.calls])).not.toContain(TOKEN);
  });
});
