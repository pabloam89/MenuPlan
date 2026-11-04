import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esquemaFinal } from "../../scripts/lib/migraciones.mjs";
import { armarExportacion, columnaDeCasa, TABLAS_EXPORTADAS, TABLAS_NO_EXPORTADAS, LIMITE_FILAS, VERSION_EXPORTAR } from "./exportarCasa.js";

const MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
// La tabla de la 0010 que no se creó nunca, a propósito (supabase/ESTADO.md, fila 0010).
const NO_CREADAS = new Set(["user_recipe_discards"]);
// Las tablas con una columna de casa (columnaDeCasa): household_id, y la propia tabla de casas por su id.
const deLaCasa = () => [...esquemaFinal(MIGRACIONES)].filter(([t, x]) => x.columnas.has(columnaDeCasa(t)) && (t === "households" || x.columnas.has("household_id")) && !NO_CREADAS.has(t)).map(([t]) => t).sort();

describe("exportar una casa: cada tabla de la casa, exportada o fuera con su porqué", () => {
  it("toda tabla con household_id está en una de las dos listas, y solo en una", () => {
    const tablas = deLaCasa();
    // Suelo: si la lectura de las migraciones no viera nada, el test pasaría vacío. El 4 nov 2026 eran 33 (32 con household_id y households).
    expect(tablas.length).toBeGreaterThanOrEqual(30);
    const clasificadas = [...TABLAS_EXPORTADAS, ...TABLAS_NO_EXPORTADAS.keys()];
    expect(tablas.filter((t) => !clasificadas.includes(t)), "Tabla nueva de la casa: ponla en TABLAS_EXPORTADAS o en TABLAS_NO_EXPORTADAS con su porqué").toEqual([]);
    expect(TABLAS_EXPORTADAS.filter((t) => TABLAS_NO_EXPORTADAS.has(t))).toEqual([]);
  });

  it("ninguna de las listas nombra una tabla que no existe o no es de la casa", () => {
    const tablas = new Set(deLaCasa());
    expect([...TABLAS_EXPORTADAS, ...TABLAS_NO_EXPORTADAS.keys()].filter((t) => !tablas.has(t))).toEqual([]);
  });

  it("los secretos no se exportan", () => {
    for (const t of ["bot_link_tokens", "household_invites"]) {
      expect(TABLAS_EXPORTADAS).not.toContain(t);
      expect(TABLAS_NO_EXPORTADAS.get(t)).toMatch(/^secreto:/);
    }
  });
});

describe("armarExportacion", () => {
  const todas = (filas = []) => Object.fromEntries(TABLAS_EXPORTADAS.map((t) => [t, filas]));

  it("da cada tabla con sus filas, la casa, la fecha y el formato", () => {
    const ahora = new Date("2026-11-04T10:00:00Z");
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), persona: [{ id: "ana" }] }, ahora });
    expect(r).toMatchObject({ formato: VERSION_EXPORTAR, casa: "c1", exportado_at: "2026-11-04T10:00:00.000Z" });
    expect(Object.keys(r.tablas)).toEqual([...TABLAS_EXPORTADAS]);
    expect(r.tablas.persona).toEqual({ filas: [{ id: "ana" }], cortada: false });
  });

  it("con más filas que el límite, corta y lo dice", () => {
    const muchas = Array.from({ length: LIMITE_FILAS + 1 }, (_, i) => ({ id: i }));
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), bot_messages: muchas } });
    expect(r.tablas.bot_messages.cortada).toBe(true);
    expect(r.tablas.bot_messages.filas).toHaveLength(LIMITE_FILAS);
    expect(r.tablas.persona.cortada).toBe(false);
  });

  it("una tabla sin leer lanza: no hay exportación a medias", () => {
    const { persona: _fuera, ...sinPersona } = todas();
    expect(() => armarExportacion({ casa: "c1", leidas: sinPersona })).toThrow(/persona/);
    expect(() => armarExportacion({ leidas: todas() })).toThrow(/casa/);
  });
});
