// escribirDato, lo común a la app y a Lola (plan fichas con estado, trozo 8): el
// dato contra el registro y sus vocabularios, la operación de tipo dato y lo que
// se devuelve de ella (sin pedido ni inversa, que llevan salud); y la cola de la
// app, que guarda al momento, propone al servidor en orden, espera si falta la
// RPC o la red, y no tira nada.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  datoValido, operacionDeDato, resultadoDeOperacion, DatoInvalido, CAMPOS_RESULTADO,
  crearColaDeDatos, enviarAlServidor, FALLOS_QUE_ESPERAN, CLAVE_COLA, AVISO_PENDIENTE_MS, HTTP_DE_FALLO, RUTA_OPERACION,
} from "./escribirDato.js";
import { ESTADO_OPERACION, SEXO, CANAL_DATO, REF_OPERACION, FALLO_DATO, FALLOS_DATO } from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const DATO = { campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho" };
const PEDIDO = { casa: CASA, accion: "ver_ajustes", dato: DATO };
const HECHA = { operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ campo: "sexo" }], sin_hacer: [], choques: [], rev: 7 };

describe("datoValido", () => {
  it("pasa un dato del registro con su valor de vocabulario", () => {
    expect(datoValido(DATO)).toEqual(DATO);
  });
  it("un campo fuera del registro no entra", () => {
    expect(REGISTRO_CAMPOS.noEsUnCampo).toBeUndefined();
    expect(() => datoValido({ ...DATO, campo: "noEsUnCampo" })).toThrow(DatoInvalido);
  });
  it("un origen fuera de ORIGEN_DATO no entra", () => {
    expect(() => datoValido({ ...DATO, origen: "inventado" })).toThrow(/origen/);
  });
  it("un valor fuera del vocabulario del campo no entra", () => {
    expect(SEXO).not.toContain("otro_valor");
    expect(() => datoValido({ ...DATO, valor: "otro_valor" })).toThrow(DatoInvalido);
  });
  it("sin dato, o con un campo heredado de Object (__proto__), no entra", () => {
    expect(() => datoValido(null)).toThrow(DatoInvalido);
    expect(() => datoValido({ ...DATO, campo: "__proto__" })).toThrow(DatoInvalido);
    expect(() => datoValido({ ...DATO, campo: "constructor" })).toThrow(DatoInvalido);
  });
});

describe("operacionDeDato", () => {
  const base = { ...PEDIDO, clave: "k1", canal: CANAL_DATO.APP, ref: { tipo: REF_OPERACION.PANTALLA, id: "ajustes" }, autor: { user_id: "u1" } };
  it("arma la operación de un solo dato que espera aplicar_operacion", () => {
    expect(operacionDeDato(base)).toEqual({
      casa: CASA, clave: "k1", accion: "ver_ajustes", canal: "app", ref_tipo: "pantalla", ref_id: "ajustes",
      autor_user_id: "u1", autor_persona_id: null, datos: [DATO],
    });
  });
  it("sin clave, con un canal o una ref fuera de su vocabulario, no hay operación", () => {
    expect(() => operacionDeDato({ ...base, clave: "" })).toThrow(/clave/);
    expect(() => operacionDeDato({ ...base, canal: "fax" })).toThrow(/canal/);
    expect(() => operacionDeDato({ ...base, ref: { tipo: "carta", id: "x" } })).toThrow(/referencia/);
    expect(() => operacionDeDato({ ...base, accion: "" })).toThrow(/acción/);
  });
});

describe("lo que vuelve del servidor", () => {
  it("resultadoDeOperacion deja fuera pedido e inversa (llevan salud)", () => {
    const r = resultadoDeOperacion({ ...HECHA, pedido: { datos: [DATO] }, inversa: { datos: [] } });
    expect(Object.keys(r).sort()).toEqual(["guardado", ...CAMPOS_RESULTADO].sort());
    expect(r.guardado).toBe(true);
    expect(resultadoDeOperacion({ ...HECHA, estado: ESTADO_OPERACION.RECHAZADA }).guardado).toBe(false);
  });
});

// ── La cola de la app (trozo 8, 3.ª parte) ──

const PEDIDO_APP = { casa: CASA, accion: "ver_ajustes", ref_id: "ajustes", dato: DATO };
/** Lo que contesta api/operacion.js con una operación hecha (resultadoDeOperacion, con `guardado`). */
const CONTESTA_HECHA = { guardado: true, ...HECHA };

function almacenFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const enCola = (almacen) => JSON.parse(almacen.getItem(CLAVE_COLA) ?? "[]");
const claves = () => { let n = 0; return () => `k${++n}`; };
const lineasDeLog = (espia) => espia.mock.calls.map((a) => JSON.parse(a[0]));

afterEach(() => vi.restoreAllMocks());

describe("la cola de la app", () => {
  it("guarda al momento, lo propone y, si la base lo aplica, sale de la cola", async () => {
    const almacen = almacenFalso();
    const enviados = [];
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), ahora: () => 0, enviar: async (item) => { enviados.push([item, enCola(almacen).length]); return { status: 200, cuerpo: CONTESTA_HECHA }; } });
    const r = await c.escribir(PEDIDO_APP);
    expect(enviados).toEqual([[{ clave: "k1", casa: CASA, accion: "ver_ajustes", ref_id: "ajustes", pedida_at: "1970-01-01T00:00:00.000Z", dato: DATO }, 1]]);
    expect(r).toMatchObject({ guardado: true, pendiente: false, operacion_id: "op1", rev: 7 });
    expect(enCola(almacen)).toEqual([]);
  });

  it("si falta la RPC (rpc_ausente) no se guarda, se dice en el log y espera en la cola", async () => {
    const almacen = almacenFalso();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: async () => ({ status: 503, cuerpo: { fallo: FALLO_DATO.RPC_AUSENTE } }) });
    expect(await c.escribir(PEDIDO_APP)).toEqual({ guardado: false, pendiente: true, fallo: FALLO_DATO.RPC_AUSENTE });
    expect(enCola(almacen)).toMatchObject([{ clave: "k1", fallo: FALLO_DATO.RPC_AUSENTE, intentos: 1, dato: DATO }]);
    expect(lineasDeLog(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "rpc_ausente", motivo: null, canal: "app", campo: "sexo" }]);
  });

  it("un 200 que no es JSON no cuenta como guardado: espera en la cola como fallo del servidor", async () => {
    const almacen = almacenFalso();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = async () => new Response("<html>despliegue a medias</html>", { status: 200 });
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: enviarAlServidor({ token: async () => "tok", fetchFn }) });
    expect(await c.escribir(PEDIDO_APP)).toEqual({ guardado: false, pendiente: true, fallo: FALLO_DATO.SERVIDOR });
    expect(enCola(almacen)).toHaveLength(1);
    expect(lineasDeLog(log).map((l) => l.fallo)).toEqual(["servidor"]);
  });

  it("un 200 rechazado por la base (guardado: false) sale de la cola con su sin_hacer", async () => {
    const almacen = almacenFalso();
    const sinHacer = [{ campo: "sexo", motivo: "persona_ajena" }];
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: async () => ({ status: 200, cuerpo: { ...HECHA, guardado: false, estado: ESTADO_OPERACION.RECHAZADA, sin_hacer: sinHacer } }) });
    expect(await c.escribir(PEDIDO_APP)).toMatchObject({ guardado: false, pendiente: false, sin_hacer: sinHacer });
    expect(enCola(almacen)).toEqual([]);
  });

  it("al volver la red se reintenta con la misma clave, y el siguiente no adelanta al que espera", async () => {
    const almacen = almacenFalso();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let red = false;
    const enviados = [];
    const enviar = async (item) => {
      if (!red) throw new TypeError("fetch failed");
      enviados.push(item.clave);
      return { status: 200, cuerpo: CONTESTA_HECHA };
    };
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar });
    expect(await c.escribir(PEDIDO_APP)).toMatchObject({ pendiente: true, fallo: FALLO_DATO.SIN_RED });
    expect(await c.escribir({ ...PEDIDO_APP, dato: { ...DATO, valor: SEXO[1] } })).toEqual({ guardado: false, pendiente: true, fallo: FALLO_DATO.SIN_RED });
    expect(enCola(almacen).map((x) => x.clave)).toEqual(["k1", "k2"]);

    const oyentes = {};
    c.escucharRed({ addEventListener: (ev, f) => { oyentes[ev] = f; }, removeEventListener: () => {} });
    red = true;
    await oyentes.online();
    expect(enviados).toEqual(["k1", "k2"]);
    expect(enCola(almacen)).toEqual([]);
  });

  it("un error que no es de red sube a quien escribe, y el dato sigue en la cola", async () => {
    const almacen = almacenFalso();
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: async () => { throw new RangeError("un fallo del código"); } });
    await expect(c.escribir(PEDIDO_APP)).rejects.toThrow(RangeError);
    expect(enCola(almacen).map((x) => x.clave)).toEqual(["k1"]);
  });

  it("lo que el servidor rechaza por inválido sale de la cola diciéndolo, y deja la línea en el log", async () => {
    const almacen = almacenFalso();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: async () => ({ status: 400, cuerpo: { fallo: FALLO_DATO.INVALIDO } }) });
    expect(await c.escribir(PEDIDO_APP)).toEqual({ guardado: false, pendiente: false, fallo: FALLO_DATO.INVALIDO });
    expect(enCola(almacen)).toEqual([]);
    expect(lineasDeLog(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "invalido", motivo: null, canal: "app", campo: "sexo" }]);
  });

  it("esperan en la cola los fallos de FALLOS_QUE_ESPERAN y ninguno más, lo diga el cuerpo o solo el HTTP", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fallo of FALLOS_DATO) {
      for (const cuerpo of [{ fallo }, null]) {
        // Sin cuerpo, sin_red y servidor comparten el 503: el HTTP solo dice «servidor», que también espera.
        const almacen = almacenFalso();
        const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar: async () => ({ status: HTTP_DE_FALLO[fallo], cuerpo }) });
        const r = await c.escribir(PEDIDO_APP);
        expect(enCola(almacen).length, `${fallo} ${cuerpo ? "con" : "sin"} cuerpo`).toBe(FALLOS_QUE_ESPERAN.has(r.fallo) ? 1 : 0);
        if (cuerpo) expect(r.fallo).toBe(fallo);
      }
    }
  });

  it("lo pendiente más de 24 h se dice y sigue en la cola", async () => {
    const almacen = almacenFalso();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let t = Date.parse("2026-10-30T10:00:00Z");
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), ahora: () => t, enviar: async () => ({ status: 503, cuerpo: { fallo: FALLO_DATO.RPC_AUSENTE } }) });
    await c.escribir(PEDIDO_APP);
    expect(c.pendientesViejos()).toEqual([]);
    t += AVISO_PENDIENTE_MS + 1;
    await c.vaciar();
    expect(c.pendientesViejos().map((x) => x.clave)).toEqual(["k1"]);
    expect(c.pendientes()).toHaveLength(1);
  });

  it("un dato mal hecho no entra en la cola ni sale hacia el servidor", async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn();
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), enviar });
    await expect(c.escribir({ ...PEDIDO_APP, dato: { ...DATO, valor: "otro_valor" } })).rejects.toThrow(DatoInvalido);
    await expect(c.escribir({ ...PEDIDO_APP, ref_id: "" })).rejects.toThrow(/ref\.id/);
    expect(enviar).not.toHaveBeenCalled();
    expect(enCola(almacen)).toEqual([]);
  });

  it("una cola guardada ilegible no se tira: se aparta y se dice", () => {
    const almacen = almacenFalso({ [CLAVE_COLA]: "{roto" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = crearColaDeDatos({ almacen, nuevaClave: claves(), ahora: () => 5, enviar: vi.fn() });
    expect(c.pendientes()).toEqual([]);
    expect(almacen.getItem(`${CLAVE_COLA}.ilegible.5`)).toBe("{roto");
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("enviarAlServidor", () => {
  it("manda el pedido a api/operacion.js con la sesión, y devuelve el cuerpo leído", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(CONTESTA_HECHA), { status: 200 }));
    expect(await enviarAlServidor({ token: async () => "tok", fetchFn })({ clave: "k1" })).toEqual({ status: 200, cuerpo: CONTESTA_HECHA });
    expect(fetchFn.mock.calls[0][0]).toBe(RUTA_OPERACION);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ clave: "k1" }) });
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("sin sesión no sale y espera como sin_sesion", async () => {
    const fetchFn = vi.fn();
    expect(await enviarAlServidor({ token: async () => null, fetchFn })({})).toEqual({ status: 401, cuerpo: { fallo: FALLO_DATO.SIN_SESION } });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
