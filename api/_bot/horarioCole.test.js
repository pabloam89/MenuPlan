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
// `fallaLaBase`: la escritura de la casa no llega (conCasa devuelve el error).
let fallaLaBase = false;
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-02",
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? casa());
    if (fallaLaBase) return { ok: false, error: "sin conexión" };
    if (r) guardada = r;
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({ SLOT_VALUES: ["casa", "tupper", "fuera", "cole", "off"], slotKey: (id, d, c) => `${id}|${d}|${c}` }),
}));

const { ajustarHorario, SIN_HORARIO } = await import("./ajustes.js");
const { ESTADO, NO_GUARDADO, recibo } = await import("./resultado.js");
const horario = () => guardada?.state?.data?.schedule ?? {};

describe("ajustar_horario: al cole solo van los menores", () => {
  it("«todos» al cole: los niños sí, el adulto no, y se dice", async () => {
    guardada = null;
    const t = await ajustarHorario("h", { personas: ["todos"], dias: ["entre semana"], comidas: ["Comida"], donde: "cole" });
    expect(horario()["n|Lun|Comida"]).toBe("cole");
    expect(Object.keys(horario()).some((k) => k.startsWith("a|"))).toBe(false);
    expect(t.nota).toMatch(/Juan no va al cole/);
    // Sin edad no se sabe: se deja como estaba, igual que antes.
    expect(horario()["s|Lun|Comida"]).toBe("cole");
  });

  it("solo un adulto al cole: no se cambia nada", async () => {
    guardada = null;
    const t = await ajustarHorario("h", { personas: ["Juan"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(guardada).toBe(null);
    expect(t.nota).toMatch(/No he cambiado nada.*Juan no va al cole/);
  });

  it("un adulto que come fuera, sin cambios en cómo era", async () => {
    guardada = null;
    await ajustarHorario("h", { personas: ["adultos"], dias: ["lunes"], comidas: ["Comida"], donde: "fuera" });
    expect(horario()["a|Lun|Comida"]).toBe("fuera");
  });
});

describe("ajustar_horario devuelve su resultado (trozo 27 de #1037)", () => {
  it("lo cambiado, en una línea del recibo; sin valores (el «dónde» no se compara aún)", async () => {
    guardada = null;
    const r = await ajustarHorario("h", { personas: ["Marcela"], dias: ["lunes"], comidas: ["Comida"], donde: "tupper" });
    expect(r.estado).toBe(ESTADO.HECHO);
    expect(r.hecho).toEqual(["Marcela → tupper (lunes; Comida)"]);
    expect(r.valores).toBeNull();
    expect(recibo([r])).toBe("✅ <b>Horario cambiado</b>: Marcela → tupper (lunes; Comida).");
  });

  it("alguien que no está en la casa: sin hacer y por qué, y no se toca nada", async () => {
    guardada = null;
    const r = await ajustarHorario("h", { personas: ["Pepe"], dias: ["lunes"], donde: "fuera" });
    expect(guardada).toBe(null);
    expect(r.sinHacer).toEqual([{ que: "Pepe", motivo: SIN_HORARIO.NO_ESTA }]);
  });

  it("lo que falta saber (qué día) y el aviso del cole van en la nota, sin línea en el recibo", async () => {
    guardada = null;
    const duda = await ajustarHorario("h", { personas: ["Marcela"], dias: ["cuando pueda"], donde: "fuera" });
    expect(duda.estado).toBe(ESTADO.NADA);
    expect(recibo([duda])).toBe("");
    expect(duda.nota).toMatch(/No entiendo qué días/);
    const cole = await ajustarHorario("h", { personas: ["Juan"], dias: ["lunes"], donde: "cole" });
    expect(recibo([cole])).toBe("");
  });

  it("si la casa no se guarda: lo que iba a quedar hecho, sin hacer porque no se ha podido guardar", async () => {
    guardada = null;
    fallaLaBase = true;
    try {
      const r = await ajustarHorario("h", { personas: ["Marcela"], dias: ["lunes"], comidas: ["Comida"], donde: "fuera" });
      expect(r.estado).toBe(ESTADO.NADA);
      expect(r.sinHacer).toEqual([{ que: "Marcela → fuera (lunes; Comida)", motivo: NO_GUARDADO }]);
      expect(r.nota).toMatch(/sin conexión/);
    } finally {
      fallaLaBase = false;
    }
  });
});
