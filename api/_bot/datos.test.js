// escribirDato en el servidor (plan fichas con estado, trozos 8 y 26) y su entrada
// para la app (api/operacion.js): una operación de tipo dato por la tubería y su
// puerta a aplicar_operacion, nunca al documento de la casa; si la RPC no está, no
// se guarda, se dice y queda la línea `dato_sin_guardar` con `rpc_ausente`. Deshacer
// (trozo 41) va por la misma entrada a deshacer_operacion, con quien tiene la sesión.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escribirDato, falloDeMotivo } from "./datos.js";
import { RPC_OPERACION, RPC_DESHACER, SUFIJO_CLAVE_PERSONA, RPC_PREFERENCIAS } from "../../src/lib/operaciones/tuberia.js";
import { ACCION_LIBRETA } from "../../src/lib/libretaCasa.js";
import handler from "../operacion.js";
import { MENUS_QUE_SE_LEEN } from "../../src/lib/menusGenerados.js";
import { filaDeTicket, filaDePrecio, COLUMNAS_TICKET, COLUMNAS_PRECIO, DE_LA_0124 } from "../../src/lib/historialCompra.js";
import { HTTP_DE_FALLO } from "../../src/lib/escribirDato.js";
import { TABLAS_EXPORTADAS } from "../../src/lib/exportarCasa.js";
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
    const r = await escribirDato(PEDIDO, { papel: "owner" });
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
    expect(await escribirDato(PEDIDO, { papel: "owner" })).toMatchObject({ guardado: false, estado: "rechazada", sin_hacer: sinHacer });
  });

  it("sin la RPC (0106 sin aplicar): no se guarda, se dice rpc_ausente, queda en el log y no toca el documento", async () => {
    responde(/rpc\/aplicar_operacion/, SIN_RPC);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await escribirDato(PEDIDO, { papel: "owner" });
    expect(r).toEqual({ guardado: false, fallo: FALLO_DATO.RPC_AUSENTE });
    expect(lineas(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "rpc_ausente", motivo: "no_existe", canal: "telegram", campo: "sexo" }]);
    expect(llamadas.map((l) => l.ruta)).toEqual([`/rest/v1/rpc/${RPC_OPERACION}`]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("una acción con otra forma la para el CHECK de la base (23514) y vuelve invalido", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 400, cuerpo: { code: "23514", message: "violates check constraint operacion_accion_forma" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await escribirDato({ ...PEDIDO, accion: "Ver Ajustes" }, { papel: "owner" })).toEqual({ guardado: false, fallo: FALLO_DATO.INVALIDO });
  });

  it("un autor que no es de la casa (42501) da sin_permiso", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 403, cuerpo: { code: "42501", message: "aplicar_operacion: el autor no es de esta casa" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await escribirDato(PEDIDO, { papel: "owner" })).toEqual({ guardado: false, fallo: FALLO_DATO.SIN_PERMISO });
  });

  it("un dato mal hecho no sale hacia la base", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await escribirDato({ ...PEDIDO, dato: { ...DATO, valor: "otro_valor" } }, { papel: "owner" });
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

  // Lo que para la puerta no llega como dato: va a aplicar_operacion solo para apuntarse rechazado, sin el valor.
  const rechazos = () => llamadas.filter((l) => l.ruta.includes("rpc/")).map((l) => l.cuerpo.p_operacion);

  it("desde la app solo hablan personas: un origen del sistema (supuesto) lo para la puerta y no llega como dato", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: { ...CUERPO, dato: { ...DATO, origen: "supuesto" } } });
    expect(res.codigo).toBe(400);
    expect(res.body).toEqual({ fallo: FALLO_DATO.INVALIDO, error: "origen_no_vale" });
    expect(rechazos()).toMatchObject([{ estado: ESTADO_OPERACION.RECHAZADA, sin_hacer: [{ motivo: "origen_no_vale", campo: "sexo" }] }]);
    expect(rechazos()[0].pedido.datos[0]).not.toHaveProperty("valor");
  });

  it("una clave que no es un uuid, o un cuerpo sin dato, se contestan con invalido y no llegan a la RPC", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await pedir({ body: { ...CUERPO, clave: "tg:123:sexo" } })).codigo).toBe(400);
    expect((await pedir({ body: { ...CUERPO, dato: null } })).codigo).toBe(400);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("un lector no escribe datos de la casa: la puerta lo para y queda apuntado como rechazado", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: CUERPO });
    expect(res.codigo).toBe(403);
    expect(res.body).toEqual({ fallo: FALLO_DATO.SIN_PERMISO, error: "sin_permiso" });
    expect(rechazos()).toMatchObject([{ estado: ESTADO_OPERACION.RECHAZADA, sin_hacer: [{ motivo: "sin_permiso" }] }]);
  });

  it("quien no es de la casa no escribe, ni queda apuntado (la base no acepta autores de fuera)", async () => {
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

describe("api/operacion.js: deshacer una operación propia (trozo 41)", () => {
  const OP = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const DESHECHA = { operacion_id: OP, estado: ESTADO_OPERACION.DESHECHA, repetida: false, deshecho: [{ campo: "sexo", persona_id: "p1" }], sin_hacer: [], rev: 9 };
  const aLaBase = () => llamadas.filter((l) => l.ruta.includes("rpc/"));
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("deshace con quien tiene la sesión, aunque el cuerpo diga otro autor, y por deshacer_operacion", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor", user_id: "u1" }] });
    responde(/rpc\/deshacer_operacion/, { status: 200, cuerpo: DESHECHA });
    const res = await pedir({ body: { casa: CASA, deshacer: OP, autor_user_id: "otro" } });
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ guardado: true, ...DESHECHA });
    expect(aLaBase()).toEqual([{ ruta: `/rest/v1/rpc/${RPC_DESHACER}`, metodo: "POST", cuerpo: { p_casa: CASA, p_operacion_id: OP, p_autor_user_id: "u1" } }]);
  });

  it("deshacer y un dato a la vez, o una operación que no es un uuid: invalido, sin llegar a la base", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    for (const body of [{ ...CUERPO, deshacer: OP }, { casa: CASA, deshacer: "op1" }]) {
      const res = await pedir({ body });
      expect(res.codigo).toBe(400);
      expect(res.body).toEqual({ fallo: FALLO_DATO.INVALIDO, error: "deshacer" });
    }
    expect(aLaBase()).toEqual([]);
  });

  it("un lector no deshace: sin_permiso y no llega a la base", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer", user_id: "u1" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: { casa: CASA, deshacer: OP } });
    expect(res.codigo).toBe(403);
    expect(aLaBase()).toEqual([]);
  });

  it("sin la RPC (0111 sin aplicar): rpc_ausente, queda en el log y no toca el documento", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
    responde(/rpc\/deshacer_operacion/, { status: 404, cuerpo: { code: "PGRST202", message: "Could not find the function public.deshacer_operacion in the schema cache" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: { casa: CASA, deshacer: OP } });
    expect(res.codigo).toBe(503);
    expect(res.body).toEqual({ fallo: FALLO_DATO.RPC_AUSENTE });
    expect(lineas(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "rpc_ausente", motivo: "no_existe", canal: "app", campo: null }]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });
});

describe("api/operacion.js: un cambio de la familia (trozo 10) va a escribir_persona", () => {
  const PERSONAS = [{ id: "00000000-0000-4000-8000-00000000000a", alergias: ["Gluten"], alergias_revisadas: true }];
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("por la misma puerta y con el autor de la sesión, a escribir_persona y nunca al documento", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/escribir_persona/, { status: 200, cuerpo: HECHA });
    const { dato: _sinDato, ...sinDato } = CUERPO;
    const res = await pedir({ body: { ...sinDato, accion: "editar_persona", personas: PERSONAS, autor_user_id: "otro" } });
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ guardado: true, ...HECHA });
    const op = llamadas.find((l) => l.ruta.includes("escribir_persona")).cuerpo.p_operacion;
    expect(op).toMatchObject({ canal: "app", ref_tipo: "pantalla", autor_user_id: "u1", personas: PERSONAS });
    expect(op.clave).toBe("app:" + CLAVE_APP + SUFIJO_CLAVE_PERSONA);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("un dato y un cambio de la familia a la vez: no se escribe nada (uno se tiraría en silencio)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await pedir({ body: { ...CUERPO, personas: PERSONAS } });
    expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("sin la 0108 contesta rpc_ausente y no toca el documento", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/escribir_persona/, SIN_RPC);
    const { dato: _sinDato, ...sinDato } = CUERPO;
    const res = await pedir({ body: { ...sinDato, personas: PERSONAS } });
    expect(res).toMatchObject({ codigo: HTTP_DE_FALLO[FALLO_DATO.RPC_AUSENTE], body: { fallo: FALLO_DATO.RPC_AUSENTE } });
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });
});

describe("api/operacion.js: un cambio de la libreta (trozo 14) va a escribir_preferencias", () => {
  const PREFERENCIAS = [{ nivel: "semana", eje: "composicion", medida: "cuenta", operador: "como_mucho", valor: "pescado", cantidad: 2, fuerza: "obligatoria" }];
  const { dato: _sinDato, ...sinDato } = CUERPO;
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    // Antes de escribir se leen las preferencias de la casa (choques al guardar, trozo 33): una casa sin ninguna.
    responde(/rpc\/preferencias_de_casa/, { status: 200, cuerpo: { v: 1, preferencias: [], planes: [] } });
  });

  it("por la misma puerta y con el autor de la sesión, a escribir_preferencias y nunca al documento", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(new RegExp(`rpc/${RPC_PREFERENCIAS}`), { status: 200, cuerpo: HECHA });
    const res = await pedir({ body: { ...sinDato, accion: ACCION_LIBRETA, preferencias: PREFERENCIAS, autor_user_id: "otro" } });
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ guardado: true, ...HECHA });
    const op = llamadas.find((l) => l.ruta.includes(RPC_PREFERENCIAS)).cuerpo.p_operacion;
    expect(op).toMatchObject({ canal: "app", ref_tipo: "pantalla", autor_user_id: "u1", preferencias: PREFERENCIAS });
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("la libreta con un dato o con la familia a la vez: no se escribe nada (uno se tiraría en silencio)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const body of [{ ...CUERPO, preferencias: PREFERENCIAS }, { ...sinDato, personas: [], preferencias: PREFERENCIAS }]) {
      const res = await pedir({ body });
      expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    }
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("sin la 0109 contesta rpc_ausente y no toca el documento", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(new RegExp(`rpc/${RPC_PREFERENCIAS}`), SIN_RPC);
    const res = await pedir({ body: { ...sinDato, preferencias: PREFERENCIAS } });
    expect(res).toMatchObject({ codigo: HTTP_DE_FALLO[FALLO_DATO.RPC_AUSENTE], body: { fallo: FALLO_DATO.RPC_AUSENTE } });
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });
});

describe("api/operacion.js: la app lee los datos de la ficha Casa (trozo 12)", () => {
  const DATO_CASA = { campo: "wantsPriceEstimates", sujeto: { tipo: "casa", id: null }, estado: "dicho", valor: true, origen: "dicho" };
  const COMUN = { casa: { id: CASA, rev: 3 }, personas: [{ id: "p1" }], faltan: [], tareas: [], callados: [] };
  const ALERGIAS = { campo: "alergias", sujeto: { tipo: "persona", id: "p1" }, estado: "vacio", valor: null, origen: null };
  const FICHA_V2 = { v: 2, ...COMUN, fichas: { casa: [DATO_CASA], persona: [ALERGIAS] } };
  async function leerGet({ token = "tok", casa = CASA } = {}) {
    const res = resFalso();
    await handler({ method: "GET", headers: { host: "prueba.invalid", ...(token ? { authorization: `Bearer ${token}` } : {}) }, query: { casa } }, res);
    return res;
  }
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("quien es de la casa (también un lector) recibe solo la ficha Casa de ficha_casa v2", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/rpc\/ficha_casa/, { status: 200, cuerpo: FICHA_V2 });
    const res = await leerGet();
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ v: 2, datos: [DATO_CASA] });
    expect(llamadas.find((l) => l.ruta.includes("ficha_casa")).cuerpo).toMatchObject({ p_casa: CASA, p_usuario: "u1", p_canal: "app" });
  });

  it("con ficha_casa v1, no es una casa sin datos: 503 y al log (la 0107 y la 0112 a la 0116, aplicadas)", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/rpc\/ficha_casa/, { status: 200, cuerpo: { v: 1, ...COMUN } });
    expect((await leerGet()).codigo).toBe(503);
  });

  it("con la 0113, los de la ficha Rutina (trozo 13) van con los de la Casa; las demás fichas, no", async () => {
    const DATO_RUTINA = { campo: "meals", sujeto: { tipo: "casa", id: null }, estado: "por_defecto", valor: ["Comida", "Cena"], origen: null };
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/ficha_casa/, { status: 200, cuerpo: { ...FICHA_V2, fichas: { ...FICHA_V2.fichas, rutina: [DATO_RUTINA] } } });
    expect((await leerGet()).body).toEqual({ v: 2, datos: [DATO_CASA, DATO_RUTINA] });
  });

  it("una v2 sin la ficha Casa da datos vacíos: que falten es cosa de quien los lee (leidosConSobre lanza)", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/ficha_casa/, { status: 200, cuerpo: { ...FICHA_V2, fichas: { persona: [] } } });
    expect((await leerGet()).body).toEqual({ v: 2, datos: [] });
  });

  it("una forma que no conoce (otra versión, sin fichas, nada) no es una casa vacía: 503 y al log", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const cuerpo of [{ v: 3, fichas: {} }, { v: 2 }, { v: 2, fichas: [] }, null]) {
      respuestas = respuestas.filter(([p]) => !p.test("/rest/v1/rpc/ficha_casa"));
      responde(/rpc\/ficha_casa/, { status: 200, cuerpo });
      expect((await leerGet()).codigo, JSON.stringify(cuerpo)).toBe(503);
    }
    expect(log.mock.calls.filter((a) => String(a[0]).includes("casa_sin_leer"))).toHaveLength(4);
  });

  it("quien no es de la casa no la lee, y la ficha ni se pide", async () => {
    responde(/household_members/, { status: 200, cuerpo: [] });
    const res = await leerGet();
    expect(res.codigo).toBe(403);
    expect(res.body).toEqual({ fallo: FALLO_DATO.SIN_PERMISO });
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("sin sesión 401, y una casa que no es un uuid 400, sin pedir la ficha", async () => {
    expect((await leerGet({ token: null })).codigo).toBe(401);
    expect((await leerGet({ casa: "x" })).codigo).toBe(400);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("si la base falla, no contesta una casa vacía: 503 y la línea casa_sin_leer en el log", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/rpc\/ficha_casa/, { status: 500, cuerpo: { message: "se cayó" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await leerGet();
    expect(res.codigo).toBe(503);
    expect(res.body).toEqual({ fallo: FALLO_DATO.SERVIDOR });
    expect(log.mock.calls.map((a) => a[0]).filter((l) => String(l).includes("casa_sin_leer"))).toHaveLength(1);
  });
});

describe("api/operacion.js: varios datos en una operación (trozo 13)", () => {
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner", user_id: "u1" }] });
  });
  const hueco = (dia, valor) => ({ campo: "schedule", persona_id: "p1", dia, comida: "Comida", valor, origen: "dicho" });

  it("`datos` llega entero a aplicar_operacion, en una sola operación", async () => {
    responde(/rpc\/aplicar_operacion/, { status: 200, cuerpo: HECHA });
    const { dato: _uno, ...sinDato } = CUERPO;
    const res = await pedir({ body: { ...sinDato, datos: [hueco("Lun", "fuera"), hueco("Mar", "cole")] } });
    expect(res.codigo).toBe(200);
    const ops = llamadas.filter((l) => l.ruta.includes("aplicar_operacion")).map((l) => l.cuerpo.p_operacion);
    expect(ops).toHaveLength(1);
    expect(ops[0].datos).toEqual([hueco("Lun", "fuera"), hueco("Mar", "cole")]);
  });

  it("dato y datos a la vez, o datos con un cambio de la familia o con deshacer: invalido, y no llega a la RPC", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await pedir({ body: { ...CUERPO, datos: [hueco("Lun", "fuera")] } })).codigo).toBe(400);
    const { dato: _uno, ...sinDato } = CUERPO;
    expect((await pedir({ body: { ...sinDato, datos: [hueco("Lun", "fuera")], personas: [] } })).codigo).toBe(400);
    expect((await pedir({ body: { casa: CASA, deshacer: "7c9e6679-7425-40de-944b-e07fc1f90ae7", datos: [hueco("Lun", "fuera")] } })).codigo).toBe(400);
    expect(llamadas.filter((l) => l.ruta.includes("rpc/aplicar_operacion") && l.cuerpo.p_operacion.estado !== ESTADO_OPERACION.RECHAZADA)).toEqual([]);
  });
});

describe("api/operacion.js: las señales de la app (trozo 15) se suman en senal", () => {
  const SENALES = [{ eje: "tecnica", valor: "horno", delta: -1 }];
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("de quien edita la casa, sin clave: se leen y se suman en senal, nunca en el documento ni por una RPC", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor" }] });
    const res = await pedir({ body: { casa: CASA, senales: SENALES } });
    expect(res).toMatchObject({ codigo: 200, body: { guardado: true, senales: 1 } });
    const aSenal = llamadas.filter((l) => l.ruta.startsWith("/rest/v1/senal"));
    expect(aSenal.map((l) => l.metodo)).toEqual(["GET", "POST"]);
    expect(aSenal[1].cuerpo).toEqual([{ household_id: CASA, eje: "tecnica", valor: "horno", peso: -1, veces: 1 }]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta) || l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("un lector, alguien de fuera, señales que no valen o con un dato a la vez: no se cuenta nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    expect((await pedir({ body: { casa: CASA, senales: SENALES } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_PERMISO]);
    respuestas.length = 0;
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    for (const body of [{ casa: CASA, senales: [{ ...SENALES[0], delta: 9 }] }, { ...CUERPO, senales: SENALES }]) {
      expect((await pedir({ body })).codigo, JSON.stringify(body)).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    }
    expect(llamadas.filter((l) => l.ruta.startsWith("/rest/v1/senal"))).toEqual([]);
  });

  it("si la base falla, se dice (servidor) y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/senal/, { status: 500, cuerpo: { code: "XX000", message: "roto" } });
    const res = await pedir({ body: { casa: CASA, senales: SENALES } });
    expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.evento === "senales_sin_contar")).toMatchObject({ fallo: FALLO_DATO.SERVIDOR });
  });
});

describe("api/operacion.js: lo cocinado (trozo 22) va a su tabla, cocinado", () => {
  const FILA = { semana: "2026-11-02", dia: "Mar", comida: "Cena", receta_id: "lentejas" };
  const leer = async (query) => {
    const res = resFalso();
    await handler({ method: "GET", headers: { host: "prueba.invalid", authorization: "Bearer tok" }, query }, res);
    return res;
  };
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("quien edita la casa lo marca: una fila en cocinado, sin clave, nunca en el documento ni por una RPC", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor" }] });
    const res = await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: true } } });
    expect(res).toMatchObject({ codigo: 200, body: { guardado: true, hecho: true } });
    const aTabla = llamadas.filter((l) => l.ruta.startsWith("/rest/v1/cocinado"));
    expect(aTabla.map((l) => l.metodo)).toEqual(["POST"]);
    expect(aTabla[0].cuerpo).toEqual([{ household_id: CASA, ...FILA }]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta) || l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("marcarlo otra vez no falla (el índice único dice que ya estaba); desmarcar borra esa fila y solo esa", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/cocinado$/, { status: 409, cuerpo: { code: "23505", message: "duplicate key value violates unique constraint cocinado_unico" } });
    expect(await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: true } } })).toMatchObject({ codigo: 200, body: { hecho: true } });
    expect(await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: false } } })).toMatchObject({ codigo: 200, body: { hecho: false } });
    const borrado = llamadas.find((l) => l.metodo === "DELETE");
    expect(borrado.ruta).toBe(`/rest/v1/cocinado?household_id=eq.${CASA}&semana=eq.2026-11-02&dia=eq.Mar&comida=eq.Cena&receta_id=eq.lentejas`);
  });

  it("un lector no marca; una fila que no es de la tabla (una fecha que no existe como semana, una comida que no existe) es inválida y no se pide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    expect((await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: true } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_PERMISO]);
    respuestas.length = 0;
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    for (const cocinado of [{ ...FILA, semana: "2026-02-30", hecho: true }, { ...FILA, comida: "Cena tardía", hecho: true }, { ...FILA }]) {
      expect((await pedir({ body: { casa: CASA, cocinado } })).codigo, JSON.stringify(cocinado)).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    }
    expect((await pedir({ body: { ...CUERPO, cocinado: { ...FILA, hecho: true } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    expect(llamadas.filter((l) => l.ruta.startsWith("/rest/v1/cocinado"))).toEqual([]);
  });

  it("si la base falla, se dice (servidor) y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/cocinado/, { status: 500, cuerpo: { code: "XX000", message: "roto" } });
    expect((await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: true } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.evento === "cocinado_sin_apuntar")).toMatchObject({ fallo: FALLO_DATO.SERVIDOR });
  });

  it("sin red al apuntar no es una fila mala: sin_red, y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    const conRed = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (String(url).includes("/rest/v1/cocinado")) throw new TypeError("fetch failed");
      return conRed(url, init);
    }));
    expect((await pedir({ body: { casa: CASA, cocinado: { ...FILA, hecho: true } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_RED]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.evento === "cocinado_sin_apuntar")).toMatchObject({ fallo: FALLO_DATO.SIN_RED });
  });

  it("GET ?cocinados=<primer día del menú>: las filas de esa semana, empiece el día que empiece, a quien es de la casa (también a un lector)", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/^\/rest\/v1\/cocinado/, { status: 200, cuerpo: [FILA] });
    const res = await leer({ casa: CASA, cocinados: "2026-11-02" });
    expect(res).toMatchObject({ codigo: 200, body: { cocinados: [FILA] } });
    expect(llamadas.find((l) => l.ruta.startsWith("/rest/v1/cocinado")).ruta).toContain(`household_id=eq.${CASA}&semana=eq.2026-11-02`);
    expect((await leer({ casa: CASA, cocinados: "2026-02-30" })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    expect((await leer({ casa: CASA, cocinados: "2026-11-05" })).codigo).toBe(200);
  });
});

describe("api/operacion.js: lo gastado (trozo 22) va a ticket y precio_observado", () => {
  const TICKET = {
    id: "tk_1", store: "Mercadona", purchasedAt: "2026-11-03T10:00:00.000Z", total: 3.5, lineCount: 2,
    tachedKeys: ["leche|l"], tachedWeekStart: "2026-11-02", pantryIds: ["p1"],
  };
  const LINEA = (i, precio) => ({
    id: `tk_1-${i}`, receiptId: "tk_1", ingredientId: "leche", name: "Leche", brand: null, store: "Mercadona",
    price: precio, qty: 1, unit: "l", purchasedAt: "2026-11-03T10:00:00.000Z", source: "receipt", kind: "food",
  });
  const GASTO = { ...LINEA(0, 2), id: "g_1", receiptId: null, source: "manual" };
  const leer = async (query) => {
    const res = resFalso();
    await handler({ method: "GET", headers: { host: "prueba.invalid", authorization: "Bearer tok" }, query }, res);
    return res;
  };
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("un ticket con sus precios: una fila en ticket (con lo que lo deshace) y las suyas en precio_observado, nunca en el documento", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor" }] });
    const res = await pedir({ body: { casa: CASA, compra: { ticket: TICKET, precios: [LINEA(0, 1.5), LINEA(1, 2)] } } });
    expect(res).toMatchObject({ codigo: 200, body: { guardado: true, precios: 2 } });
    const t = llamadas.find((l) => l.ruta === "/rest/v1/ticket");
    expect(t.cuerpo).toEqual([{ household_id: CASA, id: "tk_1", super: "Mercadona", comprado_at: "2026-11-03T10:00:00.000Z", total: 3.5, lineas: 2, tachados: ["leche|l"], tachados_semana: "2026-11-02", despensa_ids: ["p1"] }]);
    const p = llamadas.find((l) => l.ruta === "/rest/v1/precio_observado");
    expect(p.cuerpo.map((x) => [x.id, x.ticket_id, x.precio, x.fuente, x.tipo])).toEqual([["tk_1-0", "tk_1", 1.5, "receipt", "food"], ["tk_1-1", "tk_1", 2, "receipt", "food"]]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta) || l.ruta.includes("rpc/"))).toEqual([]);
  });

  it("sin la 0124 (PGRST204), el ticket se guarda sin lo que lo deshace y se dice en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    let primera = true;
    const conRed = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (String(url).endsWith("/rest/v1/ticket") && primera) {
        primera = false;
        llamadas.push({ ruta: "/rest/v1/ticket", metodo: "POST", cuerpo: JSON.parse(init.body) });
        return new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'tachados' column of 'ticket' in the schema cache" }), { status: 400 });
      }
      return conRed(url, init);
    }));
    expect((await pedir({ body: { casa: CASA, compra: { ticket: TICKET, precios: [LINEA(0, 1.5)] } } })).codigo).toBe(200);
    const intentos = llamadas.filter((l) => l.ruta === "/rest/v1/ticket");
    expect(intentos).toHaveLength(2);
    expect(Object.keys(intentos[1].cuerpo[0]).sort()).toEqual(["comprado_at", "household_id", "id", "lineas", "super", "total"]);
    expect(aviso.mock.calls.map((c) => JSON.parse(c[0]))).toContainEqual({ evento: "ticket_sin_deshacer", motivo: "sin la 0124", ticket: "tk_1" });
  });

  it("un gasto a mano va solo a precio_observado; borrar un ticket borra esa fila (sus precios, por cascade)", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    expect(await pedir({ body: { casa: CASA, compra: { precios: [GASTO] } } })).toMatchObject({ codigo: 200, body: { precios: 1 } });
    expect(llamadas.filter((l) => l.ruta === "/rest/v1/ticket")).toEqual([]);
    expect(await pedir({ body: { casa: CASA, compra: { borrar_ticket: "tk_1" } } })).toMatchObject({ codigo: 200, body: { borrado: "tk_1" } });
    expect(llamadas.find((l) => l.metodo === "DELETE").ruta).toBe(`/rest/v1/ticket?household_id=eq.${CASA}&id=eq.tk_1`);
  });

  it("un lector no guarda; filas que no son de la tabla, o precios de otro ticket, son inválidos y no se pide nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    expect((await pedir({ body: { casa: CASA, compra: { precios: [GASTO] } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_PERMISO]);
    respuestas.length = 0;
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    const malos = [
      { precios: [{ ...GASTO, source: "foto" }] },
      { precios: [{ ...GASTO, kind: "comida" }] },
      { precios: [{ ...GASTO, price: -1 }] },
      { ticket: { ...TICKET, purchasedAt: "ayer" } },
      { ticket: TICKET, precios: [{ ...LINEA(0, 1), receiptId: "otro" }] },
      { borrar_ticket: "tk_1", precios: [GASTO] },
      {},
    ];
    for (const compra of malos) expect((await pedir({ body: { casa: CASA, compra } })).codigo, JSON.stringify(compra)).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    expect(llamadas.filter((l) => /\/rest\/v1\/(ticket|precio_observado)/.test(l.ruta))).toEqual([]);
  });

  it("si la base falla, se dice (servidor) y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/precio_observado/, { status: 500, cuerpo: { code: "XX000", message: "roto" } });
    expect((await pedir({ body: { casa: CASA, compra: { precios: [GASTO] } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.evento === "compra_sin_apuntar")).toMatchObject({ fallo: FALLO_DATO.SERVIDOR });
  });

  it("un precio de un ticket que ya no está (409 por clave ajena, 23503) no es «ya estaba»: no se da por guardado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/precio_observado/, { status: 409, cuerpo: { code: "23503", message: "insert or update on table precio_observado violates foreign key constraint" } });
    const res = await pedir({ body: { casa: CASA, compra: { precios: [{ ...GASTO, receiptId: "tk_borrado" }] } } });
    expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(res.body?.guardado).not.toBe(true);
  });

  it("las columnas que se leen son las de la fila que se escribe; sin la 0124, la lectura lo dice en el log", async () => {
    expect(Object.keys(filaDeTicket(TICKET))).toEqual(COLUMNAS_TICKET);
    expect(Object.keys(filaDePrecio(GASTO))).toEqual(COLUMNAS_PRECIO);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/^\/rest\/v1\/ticket\?.*tachados/, { status: 400, cuerpo: { code: "42703", message: "column ticket.tachados does not exist" } });
    const res = await leer({ casa: CASA, compra: "1" });
    expect(res.codigo).toBe(200);
    const lecturas = llamadas.filter((l) => l.ruta.startsWith("/rest/v1/ticket?"));
    const sin0124 = COLUMNAS_TICKET.filter((c) => !DE_LA_0124.includes(c));
    expect(lecturas.map((l) => decodeURIComponent(l.ruta).split("select=")[1].split("&")[0])).toEqual([COLUMNAS_TICKET.join(","), sin0124.join(",")]);
    expect(aviso.mock.calls.map((c) => JSON.parse(c[0]))).toContainEqual({ evento: "ticket_sin_deshacer", motivo: "sin la 0124", lectura: true });
  });

  it("GET ?compra=1: los tickets y precios en la forma de la app, a quien es de la casa", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/^\/rest\/v1\/ticket/, { status: 200, cuerpo: [{ id: "tk_1", super: "Mercadona", comprado_at: "2026-11-03T10:00:00.000Z", total: "3.5", lineas: 2, tachados: ["leche|l"], tachados_semana: "2026-11-02", despensa_ids: ["p1"] }] });
    responde(/^\/rest\/v1\/precio_observado/, { status: 200, cuerpo: [{ id: "g_1", ticket_id: null, ingrediente_id: "leche", nombre: "Leche", marca: null, super: "Mercadona", precio: "2", cantidad: "1", unidad: "l", tamano_cantidad: null, tamano_unidad: null, fuente: "manual", tipo: "food", comprado_at: "2026-11-03T10:00:00.000Z" }] });
    const res = await leer({ casa: CASA, compra: "1" });
    expect(res.codigo).toBe(200);
    expect(res.body.tickets).toEqual([{ ...TICKET }]);
    expect(res.body.precios).toEqual([{ ...GASTO, qty: 1, sizeQty: null, sizeUnit: null }]);
  });
});

describe("api/operacion.js: los menús generados (trozo 22) van a menu_generado", () => {
  const leer = async (query) => {
    const res = resFalso();
    await handler({ method: "GET", headers: { host: "prueba.invalid", authorization: "Bearer tok" }, query }, res);
    return res;
  };
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("quien edita apunta un menú en su tabla, nunca en el documento; un lector no; otra forma es inválida", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "editor" }] });
    expect(await pedir({ body: { casa: CASA, menu_generado: true } })).toMatchObject({ codigo: 200, body: { guardado: true, apuntado: true } });
    expect(llamadas.filter((l) => l.metodo === "POST" && l.ruta.startsWith("/rest/v1/"))).toEqual([
      { ruta: "/rest/v1/menu_generado", metodo: "POST", cuerpo: [{ household_id: CASA }] },
    ]);
    expect((await pedir({ body: { casa: CASA, menu_generado: { grupos: 2 } } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.INVALIDO]);
    respuestas.length = 0;
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    expect((await pedir({ body: { casa: CASA, menu_generado: true } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_PERMISO]);
    expect(llamadas.filter((l) => DEL_DOCUMENTO.test(l.ruta))).toEqual([]);
  });

  it("si la base falla, se dice (servidor) y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/menu_generado/, { status: 500, cuerpo: { code: "XX000", message: "roto" } });
    expect((await pedir({ body: { casa: CASA, menu_generado: true } })).codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0])).find((l) => l.evento === "menu_sin_apuntar")).toMatchObject({ fallo: FALLO_DATO.SERVIDOR });
  });

  it("GET ?menus=1: los últimos, del más viejo al más nuevo, a quien es de la casa", async () => {
    responde(/household_members/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/^\/rest\/v1\/menu_generado/, { status: 200, cuerpo: [{ created_at: "2026-11-04T10:00:00+00:00" }, { created_at: "2026-10-28T10:00:00+00:00" }] });
    const res = await leer({ casa: CASA, menus: "1" });
    expect(res.codigo).toBe(200);
    expect(res.body).toEqual({ menus: ["2026-10-28T10:00:00+00:00", "2026-11-04T10:00:00+00:00"] });
    const ruta = decodeURIComponent(llamadas.find((l) => l.ruta.startsWith("/rest/v1/menu_generado")).ruta);
    expect(ruta).toContain(`household_id=eq.${CASA}`);
    expect(ruta).toContain(`limit=${MENUS_QUE_SE_LEEN}`);
  });
});

describe("api/operacion.js: exportar la casa (trozo 36)", () => {
  const leer = async (query) => {
    const res = resFalso();
    await handler({ method: "GET", headers: { host: "prueba.invalid", authorization: "Bearer tok" }, query }, res);
    return res;
  };
  beforeEach(() => {
    responde(/^\/auth\/v1\/user/, { status: 200, cuerpo: { id: "u1" } });
  });

  it("a quien es de la casa (también con papel de ver), todas sus tablas en un JSON", async () => {
    responde(/household_members\?select=role/, { status: 200, cuerpo: [{ role: "viewer" }] });
    responde(/^\/rest\/v1\/persona\?/, { status: 200, cuerpo: [{ id: "ana" }] });
    responde(/^\/rest\/v1\/households\?/, { status: 200, cuerpo: [{ id: CASA, name: "Casa", invite_token: "secreto" }] });
    // u1 es la identidad de Telegram 111; el 222 es el privado de otra persona de la casa.
    responde(/^\/rest\/v1\/bot_identities\?/, { status: 200, cuerpo: [{ channel: "telegram", external_id: "111" }] });
    responde(/^\/rest\/v1\/bot_chats\?/, { status: 200, cuerpo: [{ channel: "telegram", chat_id: "111", kind: "private" }, { channel: "telegram", chat_id: "222", kind: "private" }] });
    responde(/^\/rest\/v1\/bot_messages\?/, { status: 200, cuerpo: [{ channel: "telegram", chat_id: "111", content: "lo mío" }, { channel: "telegram", chat_id: "222", content: "lo de otra" }] });
    const res = await leer({ casa: CASA, exportar: "1" });
    expect(res.codigo).toBe(200);
    // Ni a quien solo ve la casa le llega el enlace para entrar en ella.
    expect(JSON.stringify(res.body)).not.toContain("secreto");
    expect(res.body.tablas.households.filas).toEqual([{ id: CASA, name: "Casa" }]);
    // Ni el chat a solas de otra persona con Lola.
    expect(res.body.tablas.bot_messages.filas.map((m) => m.content)).toEqual(["lo mío"]);
    expect(JSON.stringify(res.body)).not.toContain("lo de otra");
    expect(Object.keys(res.body.tablas)).toEqual([...TABLAS_EXPORTADAS]);
    expect(res.body.tablas.persona.filas).toEqual([{ id: "ana" }]);
    // Ninguna lectura sale de la casa pedida.
    const tablas = llamadas.filter((l) => TABLAS_EXPORTADAS.some((x) => l.ruta.startsWith(`/rest/v1/${x}?`)) && !l.ruta.includes("select=role"));
    expect(tablas.every((l) => l.ruta.includes(`=eq.${CASA}`))).toBe(true);
  });

  it("a quien no es de la casa, sin permiso y sin leer ninguna tabla", async () => {
    responde(/household_members/, { status: 200, cuerpo: [] });
    const res = await leer({ casa: CASA, exportar: "1" });
    expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SIN_PERMISO]);
    expect(llamadas.filter((l) => l.ruta.startsWith("/rest/v1/persona?"))).toEqual([]);
  });

  it("si una tabla no se puede leer, no hay exportación a medias: se dice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/household_members\?select=role/, { status: 200, cuerpo: [{ role: "owner" }] });
    responde(/^\/rest\/v1\/sobre\?/, { status: 503, cuerpo: { message: "no" } });
    const res = await leer({ casa: CASA, exportar: "1" });
    expect(res.codigo).toBe(HTTP_DE_FALLO[FALLO_DATO.SERVIDOR]);
    expect(res.body?.tablas).toBeUndefined();
  });
});
