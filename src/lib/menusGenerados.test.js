import { describe, it, expect, vi, afterEach } from "vitest";
import { MENUS_QUE_SE_LEEN, sinHistorialDeMenus, menusDeFechas, menusLocales, apuntarMenuLocal } from "./menusGenerados.js";
import { leerMenusGenerados, mandarMenuGenerado } from "./menusGeneradosApp.js";
import { countMenusGenerated } from "./menuStats.js";
import { DATOS_CASA } from "./registroFicha.js";

const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const token = async () => "tok";
const respuesta = (status, cuerpo) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
afterEach(() => vi.restoreAllMocks());

describe("los menús generados viven en su tabla, no en el documento (trozo 22 de #1037)", () => {
  it("el registro dice dónde viven, y el documento que se guarda ya no lleva la lista", () => {
    expect(DATOS_CASA.menuHistory.vive).toBe("tabla:menu_generado");
    expect(sinHistorialDeMenus({ members: [], menuHistory: [{ at: 1, groups: 2 }] })).toEqual({ members: [] });
    const limpio = { members: [] };
    expect(sinHistorialDeMenus(limpio)).toBe(limpio);
  });

  it("las fechas del servidor pasan a la forma de la racha; una que no lo es, lanza; el tope del contador es el de la lectura", () => {
    expect(menusDeFechas(["2026-11-04T10:00:00+00:00"])).toEqual([{ at: Date.parse("2026-11-04T10:00:00Z") }]);
    expect(() => menusDeFechas(["ayer"])).toThrow(/no es una fecha/);
    const lleno = Array.from({ length: MENUS_QUE_SE_LEEN }, (_, i) => ({ at: i }));
    expect(countMenusGenerated(lleno)).toEqual({ count: MENUS_QUE_SE_LEEN, isCapped: true });
  });

  it("sin casa, los recuerda el móvil, con el mismo tope; si no se puede leer, lanza y no lo pisa", () => {
    const almacen = movil();
    expect(menusLocales(almacen)).toEqual([]);
    for (let i = 0; i <= MENUS_QUE_SE_LEEN; i++) apuntarMenuLocal(almacen, i);
    const l = menusLocales(almacen);
    expect(l).toHaveLength(MENUS_QUE_SE_LEEN);
    expect(l.at(-1)).toEqual({ at: MENUS_QUE_SE_LEEN });
    almacen.setItem("hm.menus", "{roto");
    expect(() => apuntarMenuLocal(almacen, 99)).toThrow(/no se puede leer/);
    expect(almacen.getItem("hm.menus")).toBe("{roto");
  });
});

describe("la app y la tabla (menusGeneradosApp.js)", () => {
  it("lee los menús; si no puede, lo dice y no da «ningún menú»", async () => {
    const f = respuesta(200, { menus: ["2026-11-04T10:00:00+00:00"] });
    expect(await leerMenusGenerados("c1", { token, fetcher: f })).toEqual({ ok: true, menus: [{ at: Date.parse("2026-11-04T10:00:00Z") }] });
    expect(f.mock.calls[0][0]).toMatch(/\?casa=c1&menus=1$/);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leerMenusGenerados("c1", { token, fetcher: respuesta(500, { fallo: "servidor" }) })).toMatchObject({ ok: false });
    expect(await leerMenusGenerados("c1", { token, fetcher: respuesta(200, {}) })).toMatchObject({ ok: false });
    expect(await leerMenusGenerados("c1", { token: async () => null, fetcher: f })).toEqual({ ok: false, fallo: "sin_sesion" });
  });

  it("apunta un menú; si el servidor no lo guardó, ok: false", async () => {
    const f = respuesta(200, { guardado: true, apuntado: true });
    expect(await mandarMenuGenerado("c1", { token, fetcher: f })).toEqual({ ok: true });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ casa: "c1", menu_generado: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mandarMenuGenerado("c1", { token, fetcher: respuesta(403, { fallo: "sin_permiso" }) })).toMatchObject({ ok: false });
    expect(await mandarMenuGenerado("c1", { token, fetcher: vi.fn(async () => { throw new TypeError("sin red"); }) })).toEqual({ ok: false, fallo: "sin_red" });
  });
});
