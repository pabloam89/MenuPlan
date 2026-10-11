import { describe, expect, it } from "vitest";

import { RESULTADOS, SONDAS_GITHUB, leerBovedaDePablo, lineaDeSonda, main, sondaGithub } from "./detector-identidades.mjs";

const respuesta = (status) => async () => ({ status });
const SONDA = SONDAS_GITHUB[0];

describe("una sonda de GitHub", () => {
  it.each([403, 404])("%i es denegado: bien", async (status) => {
    expect((await sondaGithub(SONDA, { token: "t", fetch: respuesta(status) })).resultado).toBe("bien");
  });

  it.each([400, 401, 429, 500, 502, 503])("%i no dice nada del permiso: sin-comprobar", async (status) => {
    expect((await sondaGithub(SONDA, { token: "t", fetch: respuesta(status) })).resultado).toBe("sin-comprobar");
  });

  it("un 403 por límite de uso (retry-after o ratelimit-remaining 0) es sin-comprobar, no bien", async () => {
    const con = (h) => async () => ({ status: 403, headers: new Headers(h) });
    expect((await sondaGithub(SONDA, { token: "t", fetch: con({ "retry-after": "60" }) })).resultado).toBe("sin-comprobar");
    expect((await sondaGithub(SONDA, { token: "t", fetch: con({ "x-ratelimit-remaining": "0" }) })).resultado).toBe("sin-comprobar");
    expect((await sondaGithub(SONDA, { token: "t", fetch: con({ "x-ratelimit-remaining": "42" }) })).resultado).toBe("bien");
  });

  it("la sonda de solo lectura no manda cuerpo", async () => {
    let pedido;
    const lectura = SONDAS_GITHUB.find((s) => s.metodo === "GET");
    await sondaGithub(lectura, { token: "t", fetch: async (_u, opc) => ((pedido = opc), { status: 403 }) });
    expect("body" in pedido).toBe(false);
  });

  it.each([200, 201, 204, 422])("%i es que el token tiene el permiso: mal", async (status) => {
    expect((await sondaGithub(SONDA, { token: "t", fetch: respuesta(status) })).resultado).toBe("mal");
  });

  it("sin red no es ni bien ni mal", async () => {
    const r = await sondaGithub(SONDA, { token: "t", fetch: async () => { throw new Error("red"); } });
    expect([r.resultado, r.estado]).toEqual(["sin-comprobar", null]);
  });

  it("manda un cuerpo vacío: ninguna sonda puede cambiar nada aunque pase", async () => {
    let pedido;
    await sondaGithub(SONDA, { token: "secreto", fetch: async (url, opc) => ((pedido = { url, ...opc }), { status: 403 }) });
    expect(pedido.body).toBe("{}");
    expect(pedido.headers.authorization).toBe("Bearer secreto");
  });

  it("las sondas son las que cambian reglas, protección, secretos y colaboradores", () => {
    expect(SONDAS_GITHUB.map((s) => s.id)).toEqual(["crear-ruleset", "proteger-main", "escribir-secreto-de-actions", "ver-invitaciones"]);
    expect(new Set(SONDAS_GITHUB.map((s) => s.ruta)).size).toBe(SONDAS_GITHUB.length);
  });
});

describe("la sonda de la bóveda de administración", () => {
  const con = (error, stderr) => (_cmd, _args, _opc, cb) => cb(error, "", stderr);

  it("«no es una bóveda de esta cuenta» es denegado: bien", async () => {
    const r = await leerBovedaDePablo({ correr: con(Object.assign(new Error("x"), { code: 1 }), `"HoMenu" isn't a vault in this account.`) });
    expect(r.resultado).toBe("bien");
  });

  it("si la lee, es mal", async () => {
    expect((await leerBovedaDePablo({ correr: con(null, "") })).resultado).toBe("mal");
  });

  it("un texto con «access» suelto no basta para dar bien: sin-comprobar", async () => {
    const r = await leerBovedaDePablo({ correr: con(Object.assign(new Error("x"), { code: 1 }), "no access token found in the keychain") });
    expect(r.resultado).toBe("sin-comprobar");
  });

  it("un límite de lecturas no prueba nada: sin-comprobar, no bien", async () => {
    const r = await leerBovedaDePablo({ correr: con(Object.assign(new Error("x"), { code: 1 }), "Too many requests. Your client has been rate-limited") });
    expect(r.resultado).toBe("sin-comprobar");
  });
});

describe("main", () => {
  const salida = () => {
    const l = [];
    return { l, log: (x) => l.push(x), error: (x) => l.push(x) };
  };
  const bien = async () => ({ id: "leer-boveda-de-administracion", resultado: "bien", estado: 1 });

  it("todo denegado: sale 0 y cuenta cada sonda", async () => {
    const s = salida();
    expect(await main({ generar: async () => ({ token: "t" }), fetch: respuesta(403), leerBoveda: bien, salida: s })).toBe(0);
    expect(s.l.at(-1)).toBe("detector-identidades: resumen: sondas: 5 mal: 0 sin_comprobar: 0");
  });

  it("una sonda que pasa pone la salida en 1", async () => {
    const s = salida();
    const f = async (url) => ({ status: url.includes("/rulesets") ? 422 : 403 });
    expect(await main({ generar: async () => ({ token: "t" }), fetch: f, leerBoveda: bien, salida: s })).toBe(1);
    expect(s.l.filter((x) => x.includes("resultado: mal"))).toEqual(["detector-identidades: sonda: crear-ruleset resultado: mal estado: 422"]);
  });

  it("todo sin comprobar (sin red) sale 2, no 0", async () => {
    const sinRed = async () => { throw new Error("red"); };
    const sin = async () => ({ id: "leer-boveda-de-administracion", resultado: "sin-comprobar", estado: null });
    expect(await main({ generar: async () => ({ token: "t" }), fetch: sinRed, leerBoveda: sin, salida: salida() })).toBe(2);
  });

  it("un token caducado (401 en todas) no sale 0", async () => {
    expect(await main({ generar: async () => ({ token: "t" }), fetch: respuesta(401), leerBoveda: bien, salida: salida() })).toBe(2);
  });

  it("sin token de sesión no prueba nada y sale 2", async () => {
    const { ErrorTokenSesion } = await import("./lib/tokenSesion.mjs");
    const s = salida();
    const generar = async () => { throw new ErrorTokenSesion("sin-clave", "x"); };
    expect(await main({ generar, fetch: respuesta(403), leerBoveda: bien, salida: s })).toBe(2);
  });

  it("la línea es campo: valor y nunca lleva el token", () => {
    expect(lineaDeSonda({ id: "a", resultado: "bien", estado: 403 })).toBe("detector-identidades: sonda: a resultado: bien estado: 403");
    expect(RESULTADOS).toEqual(["bien", "mal", "sin-comprobar"]);
  });
});
