import { describe, it, expect, vi } from "vitest";
import { pedirExportacion, rutaDeExportar, nombreDelFichero } from "./descargarCasa.js";

const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

describe("descargar los datos de la casa", () => {
  it("pide la exportación de esa casa con el token y devuelve el JSON entero", async () => {
    const pedir = vi.fn(async () => respuesta(200, { formato: 1, casa: "c1", tablas: { persona: { filas: [], cortada: false } } }));
    const texto = await pedirExportacion({ casa: "c1", token: "tok", pedir });
    expect(pedir).toHaveBeenCalledWith(rutaDeExportar("c1"), { headers: { Authorization: "Bearer tok" } });
    expect(JSON.parse(texto)).toMatchObject({ casa: "c1", tablas: { persona: { filas: [] } } });
  });

  it("si el servidor dice que no, lanza con su motivo; sin JSON, con el código", async () => {
    await expect(pedirExportacion({ casa: "c1", token: "t", pedir: async () => respuesta(403, { fallo: "sin_permiso" }) })).rejects.toThrow("sin_permiso");
    await expect(pedirExportacion({ casa: "c1", token: "t", pedir: async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }) })).rejects.toThrow("HTTP 502");
  });

  it("lo que no es una exportación, o sin sesión o sin casa, lanza: nunca un fichero vacío", async () => {
    await expect(pedirExportacion({ casa: "c1", token: "t", pedir: async () => respuesta(200, {}) })).rejects.toThrow(/tablas/);
    await expect(pedirExportacion({ casa: "c1", token: null, pedir: vi.fn() })).rejects.toThrow(/sesión/);
    await expect(pedirExportacion({ casa: null, token: "t", pedir: vi.fn() })).rejects.toThrow(/casa/);
  });

  it("la ruta lleva la casa y exportar; el fichero, la fecha", () => {
    expect(rutaDeExportar("c 1")).toBe("/api/operacion?casa=c%201&exportar=1");
    expect(nombreDelFichero(new Date("2026-11-04T10:00:00Z"))).toBe("homenu-mis-datos-2026-11-04.json");
    // la fecha es la de Madrid: a las 23:30 UTC del 4 ya es día 5 en casa
    expect(nombreDelFichero(new Date("2026-11-04T23:30:00Z"))).toBe("homenu-mis-datos-2026-11-05.json");
  });
});
