import { describe, it, expect, vi } from "vitest";
import { filaDeCocinado, claveCocinado, clavesDeCocinados, sinCocinados, cocinadosLocales, ponerCocinadoLocal } from "./cocinados.js";
import { leerCocinados, mandarCocinado } from "./cocinadosApp.js";
import { DATOS_CASA } from "./registroFicha.js";

const FILA = { semana: "2026-11-02", dia: "Mar", comida: "Cena", receta_id: "lentejas" };
const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe("lo cocinado vive en su tabla, no en el documento (trozo 22 de #1037)", () => {
  it("una fila es la de la tabla: primer día del menú, día, comida y receta, del vocabulario; lo demás lanza antes de pedir nada", () => {
    expect(filaDeCocinado(FILA)).toEqual(FILA);
    expect(() => filaDeCocinado({ ...FILA, semana: "2026-02-30" })).toThrow(/fecha/);
    expect(() => filaDeCocinado({ ...FILA, semana: "semana" })).toThrow(/fecha/);
    expect(() => filaDeCocinado({ ...FILA, dia: "Tue" })).toThrow(/día/);
    expect(() => filaDeCocinado({ ...FILA, comida: "dinner" })).toThrow(/comida/);
    expect(() => filaDeCocinado({ ...FILA, receta_id: "" })).toThrow(/receta/);
  });

  it("un menú empieza cualquier día: un jueves, un martes o un domingo también son su semana", () => {
    for (const semana of ["2026-11-05", "2026-10-27", "2026-11-08"]) expect(filaDeCocinado({ ...FILA, semana }).semana).toBe(semana);
  });

  it("el registro dice dónde vive, y el documento que se guarda ya no lleva la lista vieja", () => {
    expect(DATOS_CASA.cookedDishes.vive).toBe("tabla:cocinado");
    expect(sinCocinados({ members: [], cookedDishes: ["m:0::Mar::Cena::x"], cookedDeltas: { k: [] } })).toEqual({ members: [], cookedDeltas: { k: [] } });
    const limpio = { members: [] };
    expect(sinCocinados(limpio)).toBe(limpio);
  });

  it("sin casa, lo recuerda el móvil por semana, con la misma clave", () => {
    const almacen = movil();
    ponerCocinadoLocal(FILA, true, almacen);
    expect(cocinadosLocales("2026-11-02", almacen)).toEqual(new Set([claveCocinado(FILA)]));
    expect(cocinadosLocales("2026-11-09", almacen).size).toBe(0);
    ponerCocinadoLocal(FILA, false, almacen);
    expect(cocinadosLocales("2026-11-02", almacen).size).toBe(0);
  });
});

describe("la app y la tabla (cocinadosApp.js)", () => {
  const token = async () => "tok";
  const respuesta = (status, cuerpo) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));

  it("lee las claves de la semana; si no puede, lo dice y no da «nada cocinado»", async () => {
    const ok = await leerCocinados("c1", "2026-11-02", { token, fetcher: respuesta(200, { cocinados: [FILA] }) });
    expect(ok).toEqual({ ok: true, claves: clavesDeCocinados([FILA]) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leerCocinados("c1", "2026-11-02", { token, fetcher: respuesta(500, { fallo: "servidor" }) })).toMatchObject({ ok: false });
    expect(await leerCocinados("c1", "2026-11-02", { token: async () => null, fetcher: respuesta(200, {}) })).toMatchObject({ ok: false, fallo: "sin_sesion" });
    vi.restoreAllMocks();
  });

  it("marca y desmarca; si el servidor no lo guardó, ok: false", async () => {
    const f = respuesta(200, { guardado: true, hecho: true });
    expect(await mandarCocinado("c1", FILA, true, { token, fetcher: f })).toEqual({ ok: true });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ casa: "c1", cocinado: { ...FILA, hecho: true } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mandarCocinado("c1", FILA, true, { token, fetcher: respuesta(403, { fallo: "sin_permiso" }) })).toMatchObject({ ok: false });
    expect(await mandarCocinado("c1", FILA, true, { token, fetcher: vi.fn(async () => { throw new TypeError("sin red"); }) })).toEqual({ ok: false, fallo: "sin_red" });
    vi.restoreAllMocks();
  });
});
