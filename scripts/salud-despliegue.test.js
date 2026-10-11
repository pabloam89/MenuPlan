// La puerta de salud tras desplegar (scripts/salud-despliegue.mjs, #589): con una API de
// mentira, cada forma de fallo de un despliegue sale como fallo con su motivo (falla cerrado).
import { describe, it, expect } from "vitest";
import { comprobar, evaluar, informe, leerUrl, lineas, MOTIVOS_SALUD } from "./salud-despliegue.mjs";

const URL_OK = "https://homenu-git-staging-menuplan.vercel.app";
const HTML = '<!doctype html><div id="root"></div>';

/** Una respuesta de mentira. */
const resp = (status, cuerpo = "", location = "") => ({ status, text: async () => cuerpo, headers: { get: (k) => (k === "location" ? location : null) } });

/** Un `fetch` de mentira: la página y la función con lo que se le diga. */
function api({ pagina = resp(200, HTML), funcion = resp(401, "") } = {}) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url, metodo: init.method ?? "GET", conSecreto: Boolean(init.headers?.["X-Telegram-Bot-Api-Secret-Token"]) });
    const que = url.endsWith("/api/bot/telegram") ? funcion : pagina;
    if (typeof que === "function") return que();
    return que;
  };
  f.llamadas = llamadas;
  return f;
}

const rapido = { esperaMs: 0, dormir: async () => {}, intentos: 3 };
const env = (extra = {}) => ({ DESPLIEGUE_URL: URL_OK, DESPLIEGUE_ESTADO: "success", DESPLIEGUE_REF: "staging", ...extra });
const motivos = (r) => Object.fromEntries(r.chequeos.map((c) => [c.chequeo, c.motivo]));

describe("la puerta de salud: despliegue sano", () => {
  it("pasa con la página y la función como deben ser, y no manda ningún secreto", async () => {
    const f = api();
    const r = await evaluar(env(), { fetchFn: f, ...rapido });
    expect(r.ok).toBe(true);
    expect(r.chequeos.map((c) => c.chequeo)).toEqual(["pagina", "funcion"]);
    expect(f.llamadas.every((l) => !l.conSecreto)).toBe(true);
    expect(f.llamadas.map((l) => l.metodo)).toEqual(["GET", "POST"]);
    expect(lineas(r).at(-1)).toBe("salud-despliegue resultado: ok ref: staging estado: success");
  });
});

describe("la puerta de salud: falla cerrado", () => {
  it("un 5xx de la función es error_servidor, tras reintentar", async () => {
    let n = 0;
    const f = api({ funcion: () => { n++; return resp(500); } });
    const r = await evaluar(env(), { fetchFn: f, ...rapido });
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual({ pagina: null, funcion: "error_servidor" });
    expect(n).toBe(3);
  });

  it("un 5xx pasajero que se recupera al reintentar pasa", async () => {
    let n = 0;
    const f = api({ pagina: () => (++n < 3 ? resp(503) : resp(200, HTML)) });
    const r = await evaluar(env(), { fetchFn: f, ...rapido });
    expect(r.ok).toBe(true);
    expect(r.chequeos[0].intento).toBe(3);
  });

  it("un timeout o una conexión caída es sin_respuesta", async () => {
    const f = async () => { throw Object.assign(new Error("agotado"), { name: "TimeoutError" }); };
    const r = await evaluar(env(), { fetchFn: f, ...rapido });
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual({ pagina: "sin_respuesta", funcion: "sin_respuesta" });
  });

  it("una página 200 sin id=root es sin_campo (no se reintenta)", async () => {
    let n = 0;
    const f = api({ pagina: () => { n++; return resp(200, "<html>Mantenimiento</html>"); } });
    const r = await evaluar(env(), { fetchFn: f, ...rapido });
    expect(motivos(r).pagina).toBe("sin_campo");
    expect(n).toBe(1);
  });

  it("la función que no carga (404) o que contesta 200 sin guardia es respuesta_inesperada", async () => {
    for (const funcion of [resp(404, "NOT_FOUND"), resp(200, "{}")]) {
      const r = await evaluar(env(), { fetchFn: api({ funcion }), ...rapido });
      expect(motivos(r).funcion).toBe("respuesta_inesperada");
    }
  });

  it("una protección de Vercel (login) es protegido, no un falso sano", async () => {
    const login = api({ pagina: resp(307, "", "https://vercel.com/sso-api?url=x"), funcion: resp(401, "<html>Authentication Required</html>") });
    const r = await evaluar(env(), { fetchFn: login, ...rapido });
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual({ pagina: "protegido", funcion: "protegido" });
  });

  it("un despliegue que Vercel marcó como fallido falla sin llamar a nada", async () => {
    for (const estado of ["failure", "error"]) {
      const f = api();
      const r = await evaluar(env({ DESPLIEGUE_ESTADO: estado }), { fetchFn: f, ...rapido });
      expect(r.ok).toBe(false);
      expect(motivos(r)).toEqual({ despliegue: "despliegue_fallido" });
      expect(f.llamadas).toEqual([]);
    }
  });

  it("un estado desconocido o vacío falla cerrado", async () => {
    const f = api();
    for (const DESPLIEGUE_ESTADO of ["", "pending", undefined]) {
      expect((await evaluar(env({ DESPLIEGUE_ESTADO }), { fetchFn: f, ...rapido })).ok).toBe(false);
    }
    expect(f.llamadas).toEqual([]);
  });

  it("una URL ilegible, sin https, con credenciales, con puerto o de otro dominio falla sin llamar", async () => {
    const f = api();
    for (const DESPLIEGUE_URL of [undefined, "", "no es una url", "http://x.vercel.app", "https://u:p@x.vercel.app", "https://x.vercel.app:8443", "https://evil.example.com", "https://vercel.app.evil.com", "javascript:alert(1)"]) {
      const r = await evaluar(env({ DESPLIEGUE_URL }), { fetchFn: f, ...rapido });
      expect(r.ok, String(DESPLIEGUE_URL)).toBe(false);
      expect(motivos(r)).toEqual({ despliegue: "url_ilegible" });
    }
    expect(f.llamadas).toEqual([]);
  });
});

describe("la dirección del despliegue", () => {
  it("acepta *.vercel.app y los dominios que se permiten a propósito, y solo el origen", () => {
    expect(leerUrl("https://a.vercel.app/ruta?x=1")).toEqual({ base: "https://a.vercel.app" });
    expect(leerUrl("https://app.ejemplo.es", "otro.es, app.ejemplo.es")).toEqual({ base: "https://app.ejemplo.es" });
    expect(leerUrl("https://app.ejemplo.es")).toEqual({ motivo: "url_ilegible" });
  });
});

describe("el informe", () => {
  it("lleva solo motivos y cifras, cada motivo del vocabulario, y avisa de que las migraciones no se revierten", async () => {
    const r = await evaluar(env(), { fetchFn: api({ funcion: resp(500) }), ...rapido });
    const t = informe(r);
    expect(t).toContain("funcion");
    expect(t).toContain("error_servidor");
    expect(t).not.toContain(URL_OK);
    expect(t).toContain("migraciones");
    for (const c of r.chequeos.filter((x) => x.motivo)) expect(Object.keys(MOTIVOS_SALUD)).toContain(c.motivo);
  });

  it("comprobar con tope de intentos 1 no duerme", async () => {
    let dormido = 0;
    await comprobar({ base: URL_OK, fetchFn: api({ funcion: resp(500) }), intentos: 1, dormir: async () => { dormido++; } });
    expect(dormido).toBe(0);
  });
});
