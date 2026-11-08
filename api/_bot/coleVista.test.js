/**
 * guardar_menu_cole guarda solo lo que está a la vista (#958). Lo leído de un
 * PDF solo existe en el turno en que llega; en el del «sí», la herramienta
 * aceptaba cualquier plato, y se guardó uno que no venía en el PDF. Y una
 * semana casi vacía pisaba el menú del cole entero. Se prueba por la
 * herramienta (guardarMenuCole), con la casa en memoria.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let guardada = null;
const casa = () => ({ state: { data: { schedule: {}, members: [{ id: "c", name: "Leo", age: 6, homeRole: "Hijo/a" }] } } });
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-29",
  conCasa: vi.fn(async (_id, cambiar) => { const r = await cambiar(guardada ?? casa()); if (r) guardada = r; return { ok: true }; }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false, rastro: vi.fn() }));
vi.mock("./tareas.js", () => ({ cerrarPorEstado: vi.fn(async () => {}), abrirPreguntaDeEstado: vi.fn(async () => {}) }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({ slotKey: (id, d, c) => `${id}|${d}|${c}`, replaceSchoolWeeks: (sm, x) => ({ ...(sm ?? {}), ultimo: x }) }),
}));

const { guardarMenuCole, DIAS_MINIMOS_COLE } = await import("./cole.js");
const guardado = () => guardada?.state?.data?.schoolMenus?.ultimo?.weeksEntries ?? null;

const semana = { dias: { lunes: { primero: "Lentejas estofadas" }, martes: { primero: "Arroz a la cubana" }, miercoles: { primero: "Macarrones con tomate" }, jueves: { sinClase: true }, viernes: { primero: "Pescado rebozado" } } };
const resumen = "Menú del cole: lunes lentejas estofadas, martes arroz a la cubana, miércoles macarrones con tomate, viernes pescado rebozado.";

beforeEach(() => { guardada = null; });

describe("guardar_menu_cole: solo lo que está a la vista", () => {
  it("con el PDF en este mismo mensaje, se guarda todo", async () => {
    await guardarMenuCole("h", { semanas: [semana] }, { adjunto: { tipo: "document" } });
    expect(guardado()[0]["Mar-Primero"]).toBe("Arroz a la cubana");
  });

  it("en el turno del «sí», lo que salió en el resumen se guarda", async () => {
    const r = await guardarMenuCole("h", { semanas: [semana] }, { texto: "sí, guárdalo", anterior: resumen });
    expect(guardado()[0]["Mar-Primero"]).toBe("Arroz a la cubana");
    expect(r.sinHacer).toEqual([]);
  });

  it("en el turno del «sí», un plato que no salió en el resumen no se guarda y se dice (el caso real)", async () => {
    const conInventado = { dias: { ...semana.dias, martes: { primero: "Pollo al curry" } } };
    const r = await guardarMenuCole("h", { semanas: [conInventado] }, { texto: "sí, guárdalo", anterior: resumen });
    expect(guardado()[0]["Mar-Primero"]).toBeUndefined();
    expect(r.sinHacer).toEqual([expect.objectContaining({ que: "Pollo al curry", motivo: expect.stringMatching(/solo se lee en el mensaje en que llega/) })]);
  });

  it(`una semana con menos de ${DIAS_MINIMOS_COLE} días no se guarda: pisaría la que hay`, async () => {
    const r = await guardarMenuCole("h", { semanas: [{ dias: { lunes: { primero: "Lentejas" } } }] }, { texto: "el lunes lentejas" });
    expect(guardado()).toBeNull();
    expect(r.sinHacer[0].motivo).toMatch(/1 de 5 días/);
  });
});
