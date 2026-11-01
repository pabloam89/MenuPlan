/**
 * Los datos de la ficha Casa en la app (trozo 12 de #1037): de su sobre al cargar (ficha_casa v2 por
 * api/operacion.js), a la cola de la app al guardar, y del documento como antes mientras la base no tenga el
 * campo (0112) o ficha_casa sea la v1. Nunca en los dos sitios.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: null }));

const { leerDatosDeCasa, conCasaLeida, sinCasa, casaDeCasa, guardarCasaEnCola, CAMPOS_CASA_CON_SOBRE, REF_CASA } = await import("./casaDatos.js");
const { crearColaDeDatos } = await import("./escribirDato.js");
const { REGISTRO_CAMPOS } = await import("./registroCampos.js");

const CASA = "00000000-0000-4000-8000-0000000000ca";
const sobre = (campo, valor, origen = "dicho") => ({
  campo, sujeto: { tipo: "casa", id: null }, estado: origen === "dicho" ? "dicho" : "por_defecto", valor, origen,
  bloqueado: false, peso: null, confirmado_el: null, caduca_at: null, cambiado_at: null, dicho_por: null, canal: "app", operacion_id: null,
});
const porDefecto = (campo, valor) => ({ ...sobre(campo, valor), estado: "por_defecto", origen: null });
/** api/operacion.js de mentira: contesta `cuerpo` (un objeto, o un texto tal cual) con `status`. */
const servidor = (cuerpo, status = 200) => vi.fn(async () => new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status }));
const leer = (fetcher, mas = {}) => leerDatosDeCasa(CASA, { token: async () => "tok", fetcher, enDesarrollo: false, ...mas });

afterEach(() => vi.restoreAllMocks());

describe("los campos con sobre", () => {
  it("son de la casa en el registro (registro_campo, por = 'casa')", () => {
    for (const c of CAMPOS_CASA_CON_SOBRE) expect(REGISTRO_CAMPOS[c]?.por, c).toBe("casa");
  });
});

describe("leer los datos de la casa", () => {
  it("con la 0112 aplicada, de su sobre, pidiéndolos a api/operacion.js con la sesión", async () => {
    const fetcher = servidor({ v: 2, datos: [sobre("wantsPriceEstimates", true), sobre("cookLevel", "rapido")] });
    expect(await leer(fetcher)).toEqual({ valores: { wantsPriceEstimates: true } });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/operacion?casa=${CASA}`);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("sin sobre, el defecto del registro que trae la ficha (sin repoblar desde el documento)", async () => {
    expect(await leer(servidor({ v: 2, datos: [porDefecto("wantsPriceEstimates", false)] }))).toEqual({ valores: { wantsPriceEstimates: false } });
  });

  it("sin la 0112 (la ficha no trae el campo) o con ficha_casa v1, nada: siguen en el documento", async () => {
    expect(await leer(servidor({ v: 2, datos: [] }))).toEqual({ valores: {} });
    expect(await leer(servidor({ v: 1, datos: null }))).toEqual({ valores: {} });
  });

  it("sin poder leerla no es una casa sin datos: error (la carga no sigue)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leer(servidor({ fallo: "servidor" }, 503))).toEqual({ error: true });
    expect(await leer(servidor("<html>despliegue a medias</html>"))).toEqual({ error: true });
    expect(await leer(servidor({ v: 2, datos: [{ ...sobre("wantsPriceEstimates", true), estado: "inventado" }] }))).toEqual({ error: true });
    expect(await leer(servidor({ v: 2 }))).toEqual({ error: true });
    expect(await leerDatosDeCasa(CASA, { token: async () => null, fetcher: vi.fn(), enDesarrollo: false })).toEqual({ error: true });
  });

  it("sin red, o sin poder leer la sesión, error y no un rechazo (la carga de App.jsx lo dice con cargaSinSeguir)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leer(vi.fn(async () => { throw new TypeError("Failed to fetch"); }))).toEqual({ error: true });
    expect(await leerDatosDeCasa(CASA, { token: async () => { throw new Error("sin sesión"); }, fetcher: vi.fn(), enDesarrollo: true })).toEqual({ error: true });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("en desarrollo, sin las funciones de api/ (contesta la página de vite), del documento y dicho en consola", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await leer(servidor("<!doctype html>"), { enDesarrollo: true })).toEqual({ valores: {} });
    expect(aviso).toHaveBeenCalledTimes(1);
    // Un fallo del servidor de verdad sigue siendo error también en desarrollo.
    expect(await leer(servidor({ fallo: "servidor" }, 503), { enDesarrollo: true })).toEqual({ error: true });
  });
});

describe("el documento y los datos con sobre", () => {
  const doc = { wantsPriceEstimates: true, hasBudget: true };
  it("con el dato en su sobre, vale el sobre y el documento deja de llevarlo", () => {
    const carga = { valores: { wantsPriceEstimates: false } };
    expect(conCasaLeida(doc, carga)).toEqual({ wantsPriceEstimates: false, hasBudget: true });
    expect(sinCasa(doc, carga)).toEqual({ hasBudget: true });
  });
  it("sin él (0112 sin aplicar), el documento como hasta ahora", () => {
    const carga = { valores: {} };
    expect(conCasaLeida(doc, carga)).toEqual(doc);
    expect(sinCasa(doc, carga)).toEqual(doc);
  });
});

describe("guardar los datos con sobre", () => {
  const colaFalsa = (r = { guardado: true, pendiente: false, rev: 5 }) => ({ escribir: vi.fn(async () => r) });

  it("lo que cambió va a la cola como dicho desde la pantalla de la casa, una vez", async () => {
    const cola = colaFalsa();
    const casa = casaDeCasa({ casa: CASA, valores: { wantsPriceEstimates: false }, cola });
    expect(await casa.guardar({ wantsPriceEstimates: true, hasBudget: true })).toMatchObject({ ok: true, enviado: true, rev: 5 });
    expect(await casa.guardar({ wantsPriceEstimates: true, hasBudget: false })).toEqual({ ok: true, enviado: false });
    expect(cola.escribir.mock.calls).toEqual([[{ casa: CASA, accion: "guardar_casa", ref_id: REF_CASA, dato: { campo: "wantsPriceEstimates", valor: true, origen: "dicho" } }]]);
  });

  it("sin el dato en su sobre (0112 sin aplicar), nada va a la cola", async () => {
    const cola = colaFalsa();
    expect(await casaDeCasa({ casa: CASA, valores: {}, cola }).guardar({ wantsPriceEstimates: true })).toEqual({ ok: true, enviado: false });
    expect(cola.escribir).not.toHaveBeenCalled();
  });

  it("lo que espera en la cola no cuenta como guardado ni se vuelve a encolar en cada guardado", async () => {
    const cola = colaFalsa({ guardado: false, pendiente: true, fallo: "rpc_ausente" });
    const casa = casaDeCasa({ casa: CASA, valores: { wantsPriceEstimates: false }, cola });
    expect(await casa.guardar({ wantsPriceEstimates: true })).toMatchObject({ ok: false, enviado: true });
    expect(await casa.guardar({ wantsPriceEstimates: true })).toEqual({ ok: true, enviado: false });
    expect(cola.escribir).toHaveBeenCalledTimes(1);
  });

  it("con la cola de verdad, el dato pasa la validación del registro y sale hacia api/operacion.js", async () => {
    const m = new Map();
    const enviados = [];
    const cola = crearColaDeDatos({
      almacen: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) },
      enviar: async (item) => { enviados.push(item.dato); return { status: 200, cuerpo: { guardado: true, estado: "hecha", rev: 3 } }; },
      nuevaClave: () => "00000000-0000-4000-8000-00000000c1a0", ahora: () => 0,
    });
    const r = await casaDeCasa({ casa: CASA, valores: { wantsPriceEstimates: false }, cola }).guardar({ wantsPriceEstimates: true });
    expect(r).toMatchObject({ ok: true, rev: 3 });
    expect(enviados).toEqual([{ campo: "wantsPriceEstimates", persona_id: null, valor: true, origen: "dicho" }]);
  });

  it("en la cola de la casa apunta la versión que deja; si otro escribió entretanto, conflict", async () => {
    const enCola = (version, enviar) => enviar(version.leer());
    const conRev = (rev) => ({ guardada: { guardar: async () => ({ ok: true, enviado: true, rev }) } });
    const version = { leer: () => 4 };
    expect(await guardarCasaEnCola({ version, casa: conRev(5), datos: {}, enCola })).toMatchObject({ ok: true, botRev: 5 });
    expect(await guardarCasaEnCola({ version, casa: conRev(7), datos: {}, enCola })).toMatchObject({ conflict: true });
    expect(await guardarCasaEnCola({ version, casa: null, datos: {}, enCola })).toEqual({ ok: true, enviado: false });
  });
});
