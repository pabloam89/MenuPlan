/**
 * editar_tarea: una fecha pasada no se acepta, y cambiar el texto o para quién
 * recalcula la clave como al crearla (si choca con otra abierta, no se cambia).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let filas = [];
const deFiltro = (filtro) => Object.fromEntries(String(filtro).split("&").map((p) => p.split("=")));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  rpc: vi.fn(),
  select: vi.fn(async () => []),
  insert: vi.fn(async () => []),
  update: vi.fn(async (tabla, filtro, parche) => {
    const f = deFiltro(filtro);
    const hits = filas.filter((t) => `eq.${t.id}` === f.id && t.status === "abierta");
    for (const t of hits) {
      if (parche.clave && filas.some((o) => o !== t && o.household_id === t.household_id && o.status === "abierta" && o.clave === parche.clave)) {
        throw new Error("409 duplicate key value violates unique constraint");
      }
      Object.assign(t, parche);
    }
    return hits;
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));

const { editarTarea } = await import("./tareas.js");
const { claveLibre } = await import("./estadoCasa.js");

const data = { members: [{ id: "isa", name: "Isa", age: 34 }, { id: "pablo", name: "Pablo", age: 36 }] };
const ctx = { householdId: "h", chatId: "c1" };
const AHORA = new Date("2026-10-05T10:00:00Z");
const seg = (id, texto, para = null) => ({
  id, household_id: "h", kind: "seguimiento", status: "abierta", texto, para_member: para, clave: claveLibre("seguimiento", texto, para),
});

beforeEach(() => { filas = []; });

describe("editar_tarea", () => {
  it("una fecha que ya ha pasado no se acepta", async () => {
    filas = [seg("aaaa1111-x", "pan para el sábado")];
    const r = await editarTarea(ctx, filas, "aaaa1111", { vence: "2026-10-01" }, data, AHORA);
    expect(r).toMatch(/ya ha pasado/i);
    expect(filas[0].vence).toBeUndefined();
  });

  it("una fecha futura sí", async () => {
    filas = [seg("aaaa1111-x", "pan para el sábado")];
    expect(await editarTarea(ctx, filas, "aaaa1111", { vence: "2026-10-10" }, data, AHORA)).toBe("Cambiado.");
    expect(filas[0].vence).toBe("2026-10-10");
  });

  it("cambiar el texto recalcula la clave", async () => {
    filas = [seg("aaaa1111-x", "pan para el sábado")];
    await editarTarea(ctx, filas, "aaaa1111", { texto: "leche para el sábado" }, data, AHORA);
    expect(filas[0].clave).toBe(claveLibre("seguimiento", "leche para el sábado", null));
  });

  it("cambiar para quién recalcula la clave", async () => {
    filas = [seg("aaaa1111-x", "pan para el sábado")];
    await editarTarea(ctx, filas, "aaaa1111", { para: "Isa" }, data, AHORA);
    expect(filas[0].clave).toBe(claveLibre("seguimiento", "pan para el sábado", "isa"));
  });

  it("si la clave nueva choca con otra abierta, no cambia nada y lo dice", async () => {
    filas = [seg("aaaa1111-x", "pan para el sábado"), seg("bbbb2222-x", "leche para el sábado")];
    const r = await editarTarea(ctx, filas, "aaaa1111", { texto: "leche para el sábado" }, data, AHORA);
    expect(r).toMatch(/ya hay otra igual/i);
    expect(filas[0].texto).toBe("pan para el sábado");
  });

  it("una pregunta de estado no cambia de clave", async () => {
    filas = [{ id: "cccc3333-x", household_id: "h", kind: "pregunta", status: "abierta", texto: "alergias de Isa", clave: "alergias:isa" }];
    await editarTarea(ctx, filas, "cccc3333", { texto: "¿Isa tiene alguna alergia?" }, data, AHORA);
    expect(filas[0].clave).toBe("alergias:isa");
  });
});
