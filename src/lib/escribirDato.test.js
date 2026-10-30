// escribirDato, lo común a la app y a Lola (plan fichas con estado, trozo 8): el
// dato contra el registro y sus vocabularios, la operación de tipo dato y lo que
// se devuelve de ella (sin pedido ni inversa, que llevan salud); y la cola de la
// app, que guarda al momento, propone al servidor en orden, espera si falta la
// RPC o la red, y no tira nada.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  datoValido, operacionDeDato, resultadoDeOperacion, falloDeRespuesta, crearColaDeDatos, enviarAlServidor,
  DatoInvalido, FALLOS_QUE_ESPERAN, CLAVE_COLA, AVISO_PENDIENTE_MS, CAMPOS_RESULTADO, HTTP_DE_FALLO, RUTA_OPERACION,
} from "./escribirDato.js";
import { FALLO_DATO, FALLOS_DATO, ESTADO_OPERACION, SEXO, CANAL_DATO, REF_OPERACION } from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const DATO = { campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho" };
const PEDIDO = { casa: CASA, accion: "ver_ajustes", ref_id: "ajustes", dato: DATO };
const HECHA = { operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ campo: "sexo" }], sin_hacer: [], choques: [], rev: 7 };

function almacenFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const cola = (almacen) => JSON.parse(almacen.getItem(CLAVE_COLA) ?? "[]");

afterEach(() => vi.restoreAllMocks());

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
  it("cada fallo tiene su HTTP, y el HTTP sin cuerpo da un fallo de la lista", () => {
    expect(Object.keys(HTTP_DE_FALLO).sort()).toEqual([...FALLOS_DATO].sort());
    for (const f of FALLOS_DATO) expect(falloDeRespuesta(HTTP_DE_FALLO[f], { fallo: f })).toBe(f);
    expect(falloDeRespuesta(403, null)).toBe(FALLO_DATO.SIN_PERMISO);
    expect(falloDeRespuesta(502, null)).toBe(FALLO_DATO.SERVIDOR);
  });
});

describe("la cola de la app", () => {
  const nuevaClave = (() => { let n = 0; return () => `k${++n}`; });

  it("guarda al momento, lo propone y, si la base lo aplica, sale de la cola", async () => {
    const almacen = almacenFalso();
    const enviados = [];
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), ahora: () => 0, enviar: async () => { enviados.push(cola(almacen).length); return { status: 200, cuerpo: HECHA }; } });
    const r = await c.escribir(PEDIDO);
    expect(enviados).toEqual([1]); // estaba en la cola antes de salir
    expect(r).toMatchObject({ guardado: true, pendiente: false, operacion_id: "op1" });
    expect(cola(almacen)).toEqual([]);
  });

  it("si falta la RPC (rpc_ausente) no se guarda, se dice y espera en la cola", async () => {
    const almacen = almacenFalso();
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), enviar: async () => ({ status: 503, cuerpo: { fallo: FALLO_DATO.RPC_AUSENTE } }) });
    const r = await c.escribir(PEDIDO);
    expect(r).toEqual({ guardado: false, pendiente: true, fallo: FALLO_DATO.RPC_AUSENTE });
    expect(cola(almacen)).toHaveLength(1);
    expect(cola(almacen)[0]).toMatchObject({ clave: "k1", fallo: FALLO_DATO.RPC_AUSENTE, intentos: 1, dato: DATO });
  });

  it("al volver la red se reintenta con la misma clave, y el siguiente no adelanta al que espera", async () => {
    const almacen = almacenFalso();
    let red = false;
    const enviados = [];
    const enviar = async (item) => {
      if (!red) throw new TypeError("fetch failed");
      enviados.push(item.clave);
      return { status: 200, cuerpo: HECHA };
    };
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), enviar });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await c.escribir(PEDIDO)).toMatchObject({ pendiente: true, fallo: FALLO_DATO.SIN_RED });
    expect(await c.escribir({ ...PEDIDO, dato: { ...DATO, valor: SEXO[1] } })).toMatchObject({ pendiente: true });
    expect(cola(almacen).map((x) => x.clave)).toEqual(["k1", "k2"]);

    const oyentes = {};
    c.escucharRed({ addEventListener: (ev, f) => { oyentes[ev] = f; }, removeEventListener: () => {} });
    red = true;
    await oyentes.online();
    expect(enviados).toEqual(["k1", "k2"]);
    expect(cola(almacen)).toEqual([]);
  });

  it("lo que el servidor rechaza por inválido sale de la cola diciéndolo, y deja la línea en el log", async () => {
    const almacen = almacenFalso();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), enviar: async () => ({ status: 400, cuerpo: { fallo: FALLO_DATO.INVALIDO } }) });
    expect(await c.escribir(PEDIDO)).toEqual({ guardado: false, pendiente: false, fallo: FALLO_DATO.INVALIDO });
    expect(cola(almacen)).toEqual([]);
    expect(log.mock.calls.map((a) => JSON.parse(a[0]))).toEqual([{ evento: "dato_sin_guardar", fallo: "invalido", motivo: null, canal: "app", campo: "sexo" }]);
  });

  it("los fallos que esperan son los de FALLOS_QUE_ESPERAN, y ninguno más", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fallo of FALLOS_DATO) {
      const almacen = almacenFalso();
      const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), enviar: async () => ({ status: HTTP_DE_FALLO[fallo], cuerpo: { fallo } }) });
      await c.escribir(PEDIDO);
      expect(cola(almacen).length, fallo).toBe(FALLOS_QUE_ESPERAN.has(fallo) ? 1 : 0);
    }
  });

  it("lo pendiente más de 24 h se dice y sigue en la cola", async () => {
    const almacen = almacenFalso();
    let t = Date.parse("2026-10-30T10:00:00Z");
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), ahora: () => t, enviar: async () => ({ status: 503, cuerpo: { fallo: FALLO_DATO.RPC_AUSENTE } }) });
    await c.escribir(PEDIDO);
    expect(c.pendientesViejos()).toEqual([]);
    t += AVISO_PENDIENTE_MS + 1;
    await c.vaciar();
    expect(c.pendientesViejos().map((x) => x.clave)).toEqual(["k1"]);
    expect(c.pendientes()).toHaveLength(1);
  });

  it("un dato mal hecho no entra en la cola ni sale hacia el servidor", async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn();
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), enviar });
    await expect(c.escribir({ ...PEDIDO, dato: { ...DATO, valor: "otro_valor" } })).rejects.toThrow(DatoInvalido);
    expect(enviar).not.toHaveBeenCalled();
    expect(cola(almacen)).toEqual([]);
  });

  it("una cola guardada ilegible no se tira: se aparta y se dice", async () => {
    const almacen = almacenFalso({ [CLAVE_COLA]: "{roto" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = crearColaDeDatos({ almacen, nuevaClave: nuevaClave(), ahora: () => 5, enviar: async () => ({ status: 200, cuerpo: HECHA }) });
    expect(c.pendientes()).toEqual([]);
    expect(almacen.getItem(`${CLAVE_COLA}.ilegible.5`)).toBe("{roto");
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("enviarAlServidor", () => {
  it("manda el pedido a api/operacion.js con la sesión", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(HECHA), { status: 200 }));
    const r = await enviarAlServidor({ token: async () => "tok", fetchFn })({ clave: "k1" });
    expect(r).toEqual({ status: 200, cuerpo: HECHA });
    expect(fetchFn.mock.calls[0][0]).toBe(RUTA_OPERACION);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("sin sesión no sale y espera como sin_sesion", async () => {
    const fetchFn = vi.fn();
    expect(await enviarAlServidor({ token: async () => null, fetchFn })({})).toEqual({ status: 401, cuerpo: { fallo: FALLO_DATO.SIN_SESION } });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
