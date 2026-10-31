// escribirDato en el servidor (plan fichas con estado, trozo 8) y su entrada
// para la app (api/operacion.js): una operación de tipo dato a aplicar_operacion,
// nunca al documento de la casa; si la RPC no está, no se guarda, se dice y queda
// la línea `dato_sin_guardar` con `rpc_ausente`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escribirDato, RPC_OPERACION, falloDeMotivo } from "./datos.js";
import handler from "../operacion.js";
import { HTTP_DE_FALLO } from "../../src/lib/escribirDato.js";
import { FALLO_DATO, MOTIVOS_FALLO, FALLOS_DATO, ESTADO_OPERACION, SEXO, CANAL_DATO, REF_OPERACION } from "../../src/lib/vocabularios.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const DATO = { campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho" };
const PEDIDO = {
  casa: CASA, clave: "tg:123:sexo", accion: "ver_ajustes", canal: CANAL_DATO.TELEGRAM,
  ref: { tipo: REF_OPERACION.MENSAJE, id: "123" }, autor: { user_id: "u1" }, dato: DATO,
};
const HECHA = {
  operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ campo: "sexo", persona_id: "p1", sobre_id: "s1" }],
  sin_hacer: [], choques: [], rev: 8,
};
const SIN_RPC = { status: 404, cuerpo: { code: "PGRST202", message: "Could not find the function public.aplicar_operacion(p_operacion) in the schema cache" } };
// Por dónde escribe hoy el documento de la casa: escribirDato no pasa nunca por ahí.
const DEL_DOCUMENTO = /household_state|save_household_state|bot_save_casa/;

let llamadas;
let respuestas;
function red() {
  llamadas = [];
  respuestas = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const ruta = String(url).replace("https://base.invalid", "");
    llamadas.push({ ruta, metodo: init.method ?? "GET", cuerpo: init.body ? JSON.parse(init.body) : null });
    const r = respuestas.find(([patron]) => patron.test(ruta))?.[1] ?? { status: 200, cuerpo: [] };
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { "content-type": "application/json" } });
  }));
}
const responde = (patron, r) => respuestas.push([patron, r]);
const lineas = (espia) => espia.mock.calls.map((a) => { try { return JSON.parse(a[0]); } catch { return null; /* a propósito: una línea que no es JSON no es dato_sin_guardar */ } }).filter((x) => x?.evento === "dato_sin_guardar");

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("VITE_SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_falsa");
  red();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("escribirDato (servidor)", () => {
  it("manda una operación de un solo dato a aplicar_operacion y devuelve el resultado sin pedido ni inversa", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 200, cuerpo: { ...HECHA, pedido: { datos: [DATO] }, inversa: {} } });
    const r = await escribirDato(PEDIDO);
    expect(llamadas).toEqual([{
      ruta: `/rest/v1/rpc/${RPC_OPERACION}`, metodo: "POST",
      cuerpo: { p_operacion: {
        casa: CASA, clave: "tg:123:sexo", accion: "ver_ajustes", canal: "telegram", ref_tipo: "mensaje", ref_id: "123",
        autor_user_id: "u1", autor_persona_id: null, datos: [DATO],
      } },
    }]);
    expect(r).toEqual({ guardado: true, ...HECHA });
  });

  it("lo que la RPC no escribe (sin_hacer) vuelve como no guardado, con su motivo", async () => {
    const sinHacer = [{ campo: "sexo", persona_id: "p1", motivo: "ya_lo_dijo_la_familia" }];
    responde(/rpc\/aplicar_operacion/, { status: 200, cuerpo: { ...HECHA, estado: ESTADO_OPERACION.RECHAZADA, hecho: [], sin_hacer: sinHacer } });
    expect(await escribirDato(PEDIDO)).toMatchObject({ guardado: false, estado: "rechazada", sin_hacer: sinHacer });
  });

  it("sin la RPC (0106 sin aplicar): no se guarda, se dice rpc_ausente, queda en el log y no toca el documento", async () => {
    responde(/rpc\/aplicar_operacion/, SIN_RPC);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await escribirDato(PEDIDO);
    expect(r).toEqual({ guardado: false, fallo: FALLO_DATO.RPC_AUSENTE });
    expect(lineas(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "rpc_ausente", motivo: "no_existe", canal: "telegram", campo: "sexo" }]);
    expect(llamadas.map((l) => l.ruta)).toEqual([`/rest/v1/rpc/${RPC_OPERACION}`]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("una acción con otra forma la para el CHECK de la base (23514) y vuelve invalido", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 400, cuerpo: { code: "23514", message: "violates check constraint operacion_accion_forma" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await escribirDato({ ...PEDIDO, accion: "Ver Ajustes" })).toEqual({ guardado: false, fallo: FALLO_DATO.INVALIDO });
  });

  it("un autor que no es de la casa (42501) da sin_permiso", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 403, cuerpo: { code: "42501", message: "aplicar_operacion: el autor no es de esta casa" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await escribirDato(PEDIDO)).toEqual({ guardado: false, fallo: FALLO_DATO.SIN_PERMISO });
  });

  it("un dato mal hecho no sale hacia la base", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await escribirDato({ ...PEDIDO, dato: { ...DATO, valor: "otro_valor" } });
    expect(r).toMatchObject({ guardado: false, fallo: FALLO_DATO.INVALIDO });
    expect(llamadas).toEqual([]);
    expect(lineas(log)).toHaveLength(1);
  });

  it("todo motivo de avisar.js da un fallo de FALLOS_DATO", () => {
    for (const m of MOTIVOS_FALLO) expect(FALLOS_DATO).toContain(falloDeMotivo(m));
    expect(falloDeMotivo("no_existe")).toBe(FALLO_DATO.RPC_AUSENTE);
    // Una persona borrada entre encolar y enviar (23503) no se arregla repitiendo: no se queda en la cola.
    expect(falloDeMotivo("conflicto")).toBe(FALLO_DATO.INVALIDO);
  });
});

function resFalso() {
  const res = { codigo: null, body: undefined, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.getHeader = (k) => res.headers[k];
  res.status = (c) => { res.codigo = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}
async function pedir({ token = "tok", body }) {
  const res = resFalso();
  await handler({ method: "POST", headers: { host: "prueba.invalid", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body, query: {} }, res);
  return res;
}
const CLAVE_APP = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const CUERPO = { casa: CASA, clave: CLAVE_APP, accion: "ver_ajustes", ref_id: "ajustes", dato: DATO };

describe("api/operacion.js: la app propone, el servidor escribe", () => {
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("canal app, la pantalla como ref y el autor de la sesión, aunque el cuerpo diga otra cosa", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/aplicar_operacion/, { status: 200, cuerpo: HECHA });
    const res = await pedir({ body: { ...CUERPO, canal: "sistema", ref_tipo: "motor", autor_user_id: "otro" } });
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ guardado: true, ...HECHA });
    const op = llamadas.find((l) => l.ruta.includes("aplicar_operacion")).cuerpo.p_operacion;
    expect(op).toMatchObject({ canal: "app", ref_tipo: "pantalla", ref_id: "ajustes", autor_user_id: "u1", datos: [DATO] });
    // La clave de la app va a su espacio: no puede coincidir con una de Lola.
    expect(op.clave).toBe(`app:${CLAVE_APP}`);
  });

  it("desde la app solo hablan personas: un origen del sistema (supuesto) lo para la puerta y no llega a la base", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: { ...CUERPO, dato: { ...DATO, origen: "supuesto" } } });
    expect(res.codigo).toBe(400);
    expect(res.body).toEqual({ fallo: FALLO_DATO.INVALIDO, error: "origen_no_vale" });
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("una clave que no es un uuid, o un cuerpo sin dato, se contestan con invalido y no llegan a la RPC", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await pedir({ body: { ...CUERPO, clave: "tg:123:sexo" } })).codigo).toBe(400);
    expect((await pedir({ body: { ...CUERPO, dato: null } })).codigo).toBe(400);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("un lector no escribe datos de la casa", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: CUERPO });
    expect(res.codigo).toBe(403);
    expect(res.body).toEqual({ fallo: FALLO_DATO.SIN_PERMISO, error: "sin_permiso" });
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("quien no es de la casa no escribe", async () => {
    responde(/household_members/, { status: 200, cuerpo: [] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: CUERPO });
    expect(res.codigo).toBe(403);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("sin sesión, 401 sin ir a la base", async () => {
    const res = await pedir({ token: null, body: CUERPO });
    expect(res.codigo).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("sin la RPC contesta rpc_ausente (la cola de la app espera) y no toca el documento", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor", user_id: "u1" }] });
    responde(/rpc\/aplicar_operacion/, SIN_RPC);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: CUERPO });
    expect(res.codigo).toBe(503);
    expect(res.body).toEqual({ fallo: FALLO_DATO.RPC_AUSENTE });
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("cada fallo de FALLOS_DATO tiene su HTTP, y es de error", () => {
    expect(Object.keys(HTTP_DE_FALLO).sort()).toEqual([...FALLOS_DATO].sort());
    for (const f of FALLOS_DATO) expect(HTTP_DE_FALLO[f]).toBeGreaterThanOrEqual(400);
  });

  it("una casa que no es un uuid no llega a la base", async () => {
    const res = await pedir({ body: { ...CUERPO, casa: "x" } });
    expect(res.codigo).toBe(400);
    expect(llamadas.filter((l) => !l.ruta.startsWith("/auth/"))).toEqual([]);
  });
});
