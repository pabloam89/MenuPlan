import { describe, expect, it } from "vitest";

import { CONTROL, RESULTADOS, SONDAS_GITHUB, leerBovedaDePablo, lineaDeSonda, main, sondaGithub } from "./detector-identidades.mjs";

const SIN_PERMISO = "Resource not accessible by integration";
// Una respuesta de GitHub: estado, mensaje del cuerpo y cabeceras
const respuesta = (status, message = status === 403 ? SIN_PERMISO : "", cabeceras = {}) => async () => ({ status, headers: new Headers(cabeceras), json: async () => ({ message }) });
const SONDA = SONDAS_GITHUB[0];
const resultadoDe = async (f, sonda = SONDA) => (await sondaGithub(sonda, { token: "t", fetch: f })).resultado;

describe("una sonda de GitHub", () => {
  it("un 403 de «no tienes permiso» es denegado: bien", async () => {
    expect(await resultadoDe(respuesta(403))).toBe("bien");
  });

  it.each([200, 201, 204, 422])("%i es que el token tiene el permiso: mal", async (status) => {
    expect(await resultadoDe(respuesta(status))).toBe("mal");
  });

  it.each([400, 401, 404, 429, 500, 502, 503])("%i no dice nada del permiso: sin-comprobar", async (status) => {
    expect(await resultadoDe(respuesta(status))).toBe("sin-comprobar");
  });

  it("un 403 con otro mensaje (límite, bloqueo) no es un bien", async () => {
    expect(await resultadoDe(respuesta(403, "You have exceeded a secondary rate limit"))).toBe("sin-comprobar");
    expect(await resultadoDe(respuesta(403, ""))).toBe("sin-comprobar");
  });

  it("un 403 con cabeceras de límite (retry-after o ratelimit-remaining 0) es sin-comprobar", async () => {
    expect(await resultadoDe(respuesta(403, SIN_PERMISO, { "retry-after": "60" }))).toBe("sin-comprobar");
    expect(await resultadoDe(respuesta(403, SIN_PERMISO, { "x-ratelimit-remaining": "0" }))).toBe("sin-comprobar");
    expect(await resultadoDe(respuesta(403, SIN_PERMISO, { "x-ratelimit-remaining": "42" }))).toBe("bien");
  });

  it("sin red no es ni bien ni mal", async () => {
    const r = await sondaGithub(SONDA, { token: "t", fetch: async () => { throw new Error("red"); } });
    expect([r.resultado, r.estado]).toEqual(["sin-comprobar", null]);
  });

  it("manda un cuerpo vacío en las de escritura y ninguno en la de solo lectura", async () => {
    const pedidos = {};
    for (const s of SONDAS_GITHUB) {
      await sondaGithub(s, { token: "secreto", fetch: async (url, opc) => ((pedidos[s.id] = { url, ...opc }), { status: 403, headers: new Headers(), json: async () => ({ message: SIN_PERMISO }) }) });
    }
    for (const s of SONDAS_GITHUB.filter((x) => x.metodo !== "GET")) expect(pedidos[s.id].body).toBe("{}");
    for (const s of SONDAS_GITHUB.filter((x) => x.metodo === "GET")) expect("body" in pedidos[s.id]).toBe(false);
    expect(pedidos[SONDA.id].headers.authorization).toBe("Bearer secreto");
  });

  it("las sondas son las que cambian reglas, protección, secretos y las invitaciones; ninguna invita a nadie", () => {
    expect(SONDAS_GITHUB.map((s) => s.id)).toEqual(["crear-ruleset", "proteger-main", "escribir-secreto-de-actions", "ver-invitaciones"]);
    expect(new Set(SONDAS_GITHUB.map((s) => s.ruta)).size).toBe(SONDAS_GITHUB.length);
    expect(SONDAS_GITHUB.some((s) => /collaborators/.test(s.ruta))).toBe(false);
  });
});

describe("la sonda de la bóveda de administración", () => {
  const lista = (...nombres) => (_cmd, _args, _opc, cb) => cb(null, JSON.stringify(nombres.map((name) => ({ name }))), "");
  const falla = (stderr) => (_cmd, _args, _opc, cb) => cb(Object.assign(new Error(stderr), { code: 1 }), "", stderr);
  const sonda = (correr) => leerBovedaDePablo({ correr, token: "ops_token_de_prueba" });

  it("si solo ve la bóveda de sesiones: bien", async () => {
    expect((await sonda(lista("HoMenu-sesiones"))).resultado).toBe("bien");
  });

  it("si ve la de administración: mal", async () => {
    expect((await sonda(lista("HoMenu-sesiones", "HoMenu"))).resultado).toBe("mal");
    expect((await sonda(lista("HoMenu"))).resultado).toBe("mal");
  });

  it("una lista vacía o con otra bóveda no prueba nada: sin-comprobar", async () => {
    expect((await sonda(lista())).resultado).toBe("sin-comprobar");
    expect((await sonda(lista("Otra"))).resultado).toBe("sin-comprobar");
  });

  it.each(["Too many requests. Your client has been rate-limited", "could not sign in: (401) Unauthorized", "cannot access 1password.com: timeout", "account not found"])(
    "un fallo de `op` («%s») nunca es un bien",
    async (texto) => {
      expect((await sonda(falla(texto))).resultado).toBe("sin-comprobar");
    },
  );

  it("una salida que no es una lista no prueba nada", async () => {
    expect((await sonda((_c, _a, _o, cb) => cb(null, "no soy json", ""))).resultado).toBe("sin-comprobar");
  });

  it("pide la lista de bóvedas con la cuenta de servicio, no con la app de Pablo", async () => {
    let visto;
    await leerBovedaDePablo({ correr: (cmd, args, opc, cb) => { visto = { cmd, args, env: opc.env }; cb(null, "[]", ""); }, token: "ops_token_de_prueba" });
    expect(visto.args).toEqual(["vault", "list", "--format", "json"]);
    expect(visto.env.OP_SERVICE_ACCOUNT_TOKEN).toBe("ops_token_de_prueba");
  });

  it("sin cuenta de servicio no llama a `op` (iría por la app de Pablo)", async () => {
    let llamado = false;
    const r = await leerBovedaDePablo({ correr: () => { llamado = true; }, token: "" });
    expect([r.resultado, llamado]).toEqual(["sin-comprobar", false]);
  });
});

describe("main", () => {
  const salida = () => {
    const l = [];
    return { l, log: (x) => l.push(x), error: (x) => l.push(x) };
  };
  const bien = async () => ({ id: "leer-boveda-de-administracion", resultado: "bien", estado: 0 });
  // GitHub contesta 200 al control y lo que se diga a las sondas
  const github = (sondas) => async (url, opc) => (url.endsWith(CONTROL.ruta) ? { status: 200, headers: new Headers(), json: async () => ({}) } : sondas(url, opc));
  const generar = async () => ({ token: "t" });

  it("todo denegado: sale 0 y cuenta cada sonda", async () => {
    const s = salida();
    expect(await main({ generar, fetch: github(respuesta(403)), leerBoveda: bien, salida: s })).toBe(0);
    expect(s.l.at(-1)).toBe("detector-identidades: resumen: sondas: 5 mal: 0 sin_comprobar: 0");
  });

  it("una sonda que pasa pone la salida en 1", async () => {
    const s = salida();
    const f = github((url) => respuesta(url.includes("/rulesets") ? 422 : 403)());
    expect(await main({ generar, fetch: f, leerBoveda: bien, salida: s })).toBe(1);
    expect(s.l.filter((x) => x.includes("resultado: mal"))).toEqual(["detector-identidades: sonda: crear-ruleset resultado: mal estado: 422"]);
  });

  it("un token caducado (el control da 401) no prueba nada y no sale 0", async () => {
    const s = salida();
    expect(await main({ generar, fetch: respuesta(401), leerBoveda: bien, salida: s })).toBe(2);
    expect(s.l.some((x) => x.includes("resultado: bien"))).toBe(false);
  });

  it("sin el control en 200 las sondas no cuentan: un 403 en todo (token sin permiso de lectura) sale 2, no 0", async () => {
    const s = salida();
    expect(await main({ generar, fetch: respuesta(403), leerBoveda: bien, salida: s })).toBe(2);
    expect(s.l.some((x) => x.includes("resultado: bien"))).toBe(false);
    expect(s.l.join("\n")).toContain("el control (leer el repo) no dio 200 sino 403");
  });

  it("todo sin comprobar (sin red) sale 2, no 0", async () => {
    const sinRed = async () => { throw new Error("red"); };
    expect(await main({ generar, fetch: sinRed, leerBoveda: bien, salida: salida() })).toBe(2);
  });

  it("una sonda sin comprobar (límite de uso) con las demás en bien sale 2", async () => {
    const f = github((url) => respuesta(url.includes("/rulesets") ? 429 : 403)());
    expect(await main({ generar, fetch: f, leerBoveda: bien, salida: salida() })).toBe(2);
  });

  it("sin token de sesión no prueba nada y sale 2", async () => {
    const { ErrorTokenSesion } = await import("./lib/tokenSesion.mjs");
    const sinToken = async () => { throw new ErrorTokenSesion("sin-clave", "x"); };
    expect(await main({ generar: sinToken, fetch: github(respuesta(403)), leerBoveda: bien, salida: salida() })).toBe(2);
  });

  it("la línea es campo: valor y nunca lleva el token", () => {
    expect(lineaDeSonda({ id: "a", resultado: "bien", estado: 403 })).toBe("detector-identidades: sonda: a resultado: bien estado: 403");
    expect(RESULTADOS).toEqual(["bien", "mal", "sin-comprobar"]);
  });
});
