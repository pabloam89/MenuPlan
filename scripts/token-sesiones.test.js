import { generateKeyPairSync, verify } from "node:crypto";
import { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";

import { API, ErrorToken, MARGEN_IAT_S, VIDA_JWT_S, ejecutar, firmarJwt, pedirToken, sinSecretos } from "./token-sesiones.mjs";

// Una clave de prueba, generada aquí: ni es de la App ni sirve para nada fuera del test.
let pem;
let publica;
beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  pem = privateKey.export({ type: "pkcs1", format: "pem" });
  publica = publicKey;
});

const AHORA = 1_790_000_000;
const TOKEN = "ghs_FALSO0123456789abcdefghijklmnopqrstu";
const decodificar = (p) => JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
const ids = () => ({ appId: "123456", installationId: "987654" });
const entrada = (texto) => Readable.from([texto]);

/** Un fetch de mentira: apunta la llamada y contesta lo que se le diga. */
const CONCEDIDO = {
  token: TOKEN,
  expires_at: "2026-10-10T12:00:00Z",
  permissions: { contents: "write", pull_requests: "write", issues: "write", actions: "read", checks: "read", metadata: "read" },
  repositories: [{ name: "MenuPlan" }],
};
function fetchFalso(estado = 201, cuerpo = CONCEDIDO) {
  const llamadas = [];
  const fn = async (url, init) => {
    llamadas.push({ url, init });
    return { ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo };
  };
  return { fn, llamadas };
}

/** Corre el flujo entero y recoge lo que salió por cada canal. */
async function correr({ texto = pem, fetchFn, idsFn = ids } = {}) {
  let out = "";
  let err = "";
  const codigo = await ejecutar({ entrada: entrada(texto), ids: idsFn, fetchFn, ahora: AHORA, salida: (t) => { out += t; }, errores: (t) => { err += t; } });
  return { codigo, out, err };
}

describe("firmarJwt", () => {
  it("un JWT RS256 bien formado: iss, iat con margen, exp a 10 minutos como mucho y firma válida", () => {
    const jwt = firmarJwt({ appId: "123456", pem, ahora: AHORA });
    const [cab, cuerpo, firma] = jwt.split(".");
    expect(decodificar(cab)).toEqual({ alg: "RS256", typ: "JWT" });
    const c = decodificar(cuerpo);
    expect(c.iss).toBe("123456");
    expect(c.iat).toBe(AHORA - MARGEN_IAT_S);
    expect(c.iat).toBeLessThan(AHORA);
    expect(c.exp - AHORA).toBeLessThanOrEqual(600);
    expect(c.exp - AHORA).toBe(VIDA_JWT_S);
    expect(verify("RSA-SHA256", Buffer.from(`${cab}.${cuerpo}`), publica, Buffer.from(firma, "base64url"))).toBe(true);
  });

  it("una clave que no es un PEM, o que no es RSA, o un App ID que no es número: error claro y sin la clave", () => {
    expect(() => firmarJwt({ appId: "1", pem: "esto no es una clave SECRETO-X" })).toThrow(/no es un PEM válido/);
    try { firmarJwt({ appId: "1", pem: "esto no es una clave SECRETO-X" }); } catch (e) { expect(e.message).not.toContain("SECRETO-X"); }
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(() => firmarJwt({ appId: "1", pem: privateKey.export({ type: "pkcs8", format: "pem" }) })).toThrow(/no es RSA/);
    expect(() => firmarJwt({ appId: "abc", pem })).toThrow(/SESIONES_APP_ID/);
    expect(() => firmarJwt({ appId: undefined, pem })).toThrow(/SESIONES_APP_ID/);
  });
});

describe("pedirToken", () => {
  it("POST a la instalación, con las cabeceras de GitHub y el token limitado al repo", async () => {
    const { fn, llamadas } = fetchFalso();
    const r = await pedirToken({ jwt: "jwt.de.prueba", installationId: "987654", fetchFn: fn });
    expect(r).toEqual({ token: TOKEN, expira: "2026-10-10T12:00:00Z" });
    expect(llamadas).toHaveLength(1);
    const { url, init } = llamadas[0];
    expect(url).toBe(`${API}/app/installations/987654/access_tokens`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer jwt.de.prueba");
    expect(init.headers.Accept).toBe("application/vnd.github+json");
    expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(init.headers["User-Agent"]).toBeTruthy();
    // Permisos explícitos: los seis del encargo y ni uno más (sin workflows).
    expect(JSON.parse(init.body)).toEqual({ repositories: ["MenuPlan"], permissions: CONCEDIDO.permissions });
    expect(Object.keys(JSON.parse(init.body).permissions)).not.toContain("workflows");
  });

  it.each(["administration", "secrets", "environments", "deployments", "workflows"])(
    "si GitHub concede «%s», el token se descarta y no se imprime",
    async (permiso) => {
      const cuerpo = { ...CONCEDIDO, permissions: { ...CONCEDIDO.permissions, [permiso]: "read" } };
      const { codigo, out, err } = await correr({ fetchFn: fetchFalso(201, cuerpo).fn });
      expect(codigo).toBe(1);
      expect(out).toBe("");
      expect(err).toContain(permiso);
      expect(err).not.toContain(TOKEN);
    },
  );

  it.each([
    ["sin repositories", { ...CONCEDIDO, repositories: undefined }],
    ["otro repo", { ...CONCEDIDO, repositories: [{ name: "Otro" }] }],
    ["dos repos", { ...CONCEDIDO, repositories: [{ name: "MenuPlan" }, { name: "Otro" }] }],
  ])("repositories no es exactamente [MenuPlan] (%s): el token no sale", async (_n, cuerpo) => {
    const { codigo, out, err } = await correr({ fetchFn: fetchFalso(201, cuerpo).fn });
    expect(codigo).toBe(1);
    expect(out).toBe("");
    expect(err).toMatch(/limitado exactamente a MenuPlan/);
    expect(err).not.toContain(TOKEN);
  });

  it("con stdout en una terminal avisa por stderr (sin el token)", async () => {
    let err = "";
    const codigo = await ejecutar({ entrada: entrada(pem), ids, fetchFn: fetchFalso().fn, ahora: AHORA, salidaTTY: true, salida: () => {}, errores: (t) => { err += t; } });
    expect(codigo).toBe(0);
    expect(err).toMatch(/aviso: stdout es una terminal/);
    expect(err).not.toContain(TOKEN);
  });

  it("un Installation ID que no es número no llega a hacer la petición", async () => {
    const { fn, llamadas } = fetchFalso();
    await expect(pedirToken({ jwt: "x", installationId: "../../otra", fetchFn: fn })).rejects.toThrow(/SESIONES_INSTALLATION_ID/);
    expect(llamadas).toHaveLength(0);
  });
});

describe("ejecutar", () => {
  it("camino feliz: el token solo por stdout; por stderr, la caducidad y nunca el token", async () => {
    const { fn } = fetchFalso();
    const { codigo, out, err } = await correr({ fetchFn: fn });
    expect(codigo).toBe(0);
    expect(out).toBe(`${TOKEN}\n`);
    expect(err).toContain("resultado: ok");
    expect(err).toContain("2026-10-10T12:00:00Z");
    expect(err).not.toContain(TOKEN);
  });

  it.each([[401, /respondió 401.*firma/], [404, /respondió 404.*Installation ID/], [403, /respondió 403/]])(
    "la API responde %i: error claro, código 1, stdout vacío, y ni JWT ni clave ni token en el mensaje",
    async (estado, patron) => {
      let jwtVisto = "";
      // La API, a propósito, devuelve un mensaje que repite el JWT y un token: no deben salir.
      const fn = async (_url, init) => {
        jwtVisto = init.headers.Authorization.replace("Bearer ", "");
        return { ok: false, status: estado, json: async () => ({ message: `mal ${jwtVisto} y ${TOKEN}`, token: TOKEN }) };
      };
      const { codigo, out, err } = await correr({ fetchFn: fn });
      expect(codigo).toBe(1);
      expect(out).toBe("");
      expect(err).toMatch(patron);
      expect(err).not.toContain(jwtVisto);
      expect(err).not.toContain(TOKEN);
      expect(err).not.toMatch(/eyJ|ghs_|PRIVATE KEY/);
      expect(jwtVisto.split(".")).toHaveLength(3);
    },
  );

  it("2xx sin token, y fallo de red: error sin secretos", async () => {
    const sinToken = await correr({ fetchFn: fetchFalso(201, {}).fn });
    expect(sinToken.codigo).toBe(1);
    expect(sinToken.err).toMatch(/sin token/);
    const caido = await correr({ fetchFn: async (_u, init) => { throw new Error(`fallo con ${init.headers.Authorization}`); } });
    expect(caido.codigo).toBe(1);
    expect(caido.err).toMatch(/sin respuesta de GitHub/);
    expect(caido.err).not.toMatch(/eyJ|Bearer/);
  });

  it("una clave mala por stdin: error claro, no llama a la API y no repite lo recibido", async () => {
    const { fn, llamadas } = fetchFalso();
    const { codigo, out, err } = await correr({ texto: "contraseña-que-no-es-pem", fetchFn: fn });
    expect(codigo).toBe(1);
    expect(out).toBe("");
    expect(err).toMatch(/no es un PEM válido/);
    expect(err).not.toContain("contraseña-que-no-es-pem");
    expect(llamadas).toHaveLength(0);
  });

  it("sin ids o con la entrada en una terminal: se niega con la causa", async () => {
    const sinIds = await correr({ fetchFn: fetchFalso().fn, idsFn: () => ({ appId: undefined, installationId: undefined }) });
    expect(sinIds.codigo).toBe(1);
    expect(sinIds.err).toMatch(/SESIONES_APP_ID/);
    let err = "";
    const tty = Object.assign(Readable.from([]), { isTTY: true });
    const codigo = await ejecutar({ entrada: tty, ids, fetchFn: fetchFalso().fn, errores: (t) => { err += t; }, salida: () => {} });
    expect(codigo).toBe(1);
    expect(err).toMatch(/por tubería/);
  });
});

describe("sinSecretos", () => {
  it("quita PEM, JWT y tokens de GitHub, y los secretos que se le dan", () => {
    const t = sinSecretos(`a -----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY----- b eyJhbGciOi.eyJpc3MiOi.c2ln c ${TOKEN} d valor-raro`, ["valor-raro"]);
    expect(t).toBe("a [oculto] b [oculto] c [oculto] d [oculto]");
  });
  it("también los pegados a letras, números o «_» (sin \\b)", () => {
    expect(sinSecretos(`xeyJhbGciOi.eyJpc3MiOi.c2ln y9${TOKEN} z_${TOKEN}`)).toBe("x[oculto] y9[oculto] z_[oculto]");
  });
  it("ErrorToken es el único error que enseña su mensaje", () => {
    expect(new ErrorToken("x")).toBeInstanceOf(Error);
  });
});
