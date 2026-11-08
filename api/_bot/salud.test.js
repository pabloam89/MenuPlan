/**
 * ajustar_salud (ajustes.js): intolerancias y estados desde el chat, donde los
 * guarda la app (member.intolerances, member.dietaryStates). Con la casa de
 * mentira: conCasa le pasa una y se queda con lo que devuelve.
 */
import { describe, it, expect, vi } from "vitest";

let guardada = null;
const casa = () => ({
  state: { data: { members: [
    { id: "m", name: "Marta", intolerances: [], dietaryStates: [] },
    { id: "l", name: "Leo", intolerances: ["fructosa"], dietaryStates: [] },
  ] } },
});
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? casa());
    if (r) guardada = r;
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), motor: async () => ({}) }));

const { ajustarSalud } = await import("./ajustes.js");
const persona = (nombre) => guardada.state.data.members.find((p) => p.name === nombre);

describe("ajustar_salud", () => {
  it("sin confirmar no se guarda nada", async () => {
    guardada = null;
    expect(await ajustarSalud("h", { persona: "Marta", estados: ["embarazo"] })).toMatch(/confirmación/);
    expect(guardada).toBe(null);
  });

  it("un estado con fecha y una intolerancia, donde los lee el motor", async () => {
    guardada = null;
    const t = await ajustarSalud("h", { persona: "Marta", estados: ["lactancia"], hasta: "2027-03-01", confirmado: true });
    expect(t).toMatch(/Guardado para Marta: lactancia \(hasta el 2027-03-01\)/);
    expect(persona("Marta").dietaryStates).toEqual(["lactancia"]);
    expect(persona("Marta").dietaryStatesMeta).toEqual({ lactancia: { hasta: "2027-03-01" } });
    await ajustarSalud("h", { persona: "Leo", intolerancias: ["lactosa_fina"], confirmado: true });
    expect(persona("Leo").intolerances).toEqual(["fructosa", "lactosa_fina"]);
  });

  it("quitar deja lo demás y borra su fecha", async () => {
    // Aunque al quitar venga una fecha, la fecha se va con el estado.
    await ajustarSalud("h", { persona: "Marta", estados: ["lactancia"], quitar: true, hasta: "2027-03-01", confirmado: true });
    expect(persona("Marta").dietaryStates).toEqual([]);
    expect(persona("Marta").dietaryStatesMeta).toBeUndefined();
    await ajustarSalud("h", { persona: "Leo", intolerancias: ["fructosa"], quitar: true, confirmado: true });
    expect(persona("Leo").intolerances).toEqual(["lactosa_fina"]);
  });

  it("lo que no es suyo (un alérgeno, algo inventado) no se guarda aquí", async () => {
    expect(await ajustarSalud("h", { persona: "Leo", intolerancias: ["gluten"], confirmado: true })).toMatch(/ajustar_alergias/);
    expect(await ajustarSalud("h", { persona: "Nadie", estados: ["embarazo"], confirmado: true })).toMatch(/No encuentro/);
    expect(await ajustarSalud("h", { persona: "Marta", estados: ["embarazo"], hasta: "marzo", confirmado: true })).toMatch(/AAAA-MM-DD/);
  });
});
