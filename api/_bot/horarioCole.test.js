/**
 * ajustar_horario (ajustes.js): al cole solo van los menores. Staging, 2 oct
 * 2026: «los niños en el colegio» acabó con un adulto de 36 años en el cole de
 * lunes a viernes, y el motor dejó de planificarle la comida.
 */
import { describe, it, expect, vi } from "vitest";

let guardada = null;
const casa = () => ({
  state: { data: { schedule: {}, members: [
    { id: "n", name: "Marcela", age: 6, homeRole: "Hijo/a" },
    { id: "a", name: "Juan", age: 36, homeRole: "Adulto" },
    { id: "s", name: "Sin edad" },
  ] } },
});
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-02",
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? casa());
    if (r) guardada = r;
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({ SLOT_VALUES: ["casa", "tupper", "fuera", "cole", "off"], slotKey: (id, d, c) => `${id}|${d}|${c}` }),
}));

const { ajustarHorario } = await import("./ajustes.js");
const horario = () => guardada?.state?.data?.schedule ?? {};

describe("ajustar_horario: al cole solo van los menores", () => {
  it("«todos» al cole: los niños sí, el adulto no, y se dice", async () => {
    guardada = null;
    const t = await ajustarHorario("h", { personas: ["todos"], dias: ["entre semana"], comidas: ["Comida"], donde: "cole" });
    expect(horario()["n|Lun|Comida"]).toBe("cole");
    expect(Object.keys(horario()).some((k) => k.startsWith("a|"))).toBe(false);
    expect(t).toMatch(/Juan no va al cole/);
    // Sin edad no se sabe: se deja como estaba, igual que antes.
    expect(horario()["s|Lun|Comida"]).toBe("cole");
  });

  it("solo un adulto al cole: no se cambia nada", async () => {
    guardada = null;
    const t = await ajustarHorario("h", { personas: ["Juan"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(guardada).toBe(null);
    expect(t).toMatch(/No he cambiado nada.*Juan no va al cole/);
  });

  it("un adulto que come fuera, sin cambios en cómo era", async () => {
    guardada = null;
    await ajustarHorario("h", { personas: ["adultos"], dias: ["lunes"], comidas: ["Comida"], donde: "fuera" });
    expect(horario()["a|Lun|Comida"]).toBe("fuera");
  });
});
