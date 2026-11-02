import { describe, it, expect, vi } from "vitest";
import { familiaDeFilas, RPC_FAMILIA, RPC_FICHA, fichaDePrueba, RPC_PREFERENCIAS_DE_CASA, preferenciasDeFilas } from "./familiaDePrueba.js";
import { CANAL_DATO } from "../../src/lib/vocabularios.js";

// Trozo 18: un plato que cambia Lola lleva su sobre (sobreHueco.js); fuera de un turno, el del sistema.
const delMotor = { canal: CANAL_DATO.SISTEMA, cuando: "2026-11-02", motivo: ["base.pescado"] };
const plan = { g1: { "Lun-Comida": { recipeId: "merluza", sobre: delMotor }, "Lun-Cena": { recipeId: "tortilla", sobre: delMotor } } };
const llamadas = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "household_state") return [{ state: { data: {} }, bot_rev: 1, updated_at: "2026-11-02T10:00:00Z" }];
    if (tabla === "households") return [{ owner_user_id: "u1" }];
    if (tabla === "user_menus") return [{ id: "m1", user_id: "u1", is_active: true, updated_at: "2026-11-01T10:00:00Z" }];
    if (tabla === "user_menu_weeks") {
      return [{ menu_id: "m1", week_start: "2026-11-02", week_end: "2026-11-08", week_offset: 0, start_day_idx: 0, active_days: null, plan, shopping: { items: [] } }];
    }
    return [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async (fn, args) => {
    llamadas.push([fn, args]);
    if (fn === RPC_FAMILIA) return familiaDeFilas();
    if (fn === RPC_FICHA) return fichaDePrueba();
    if (fn === RPC_PREFERENCIAS_DE_CASA) return preferenciasDeFilas();
    if (fn === "bot_save_casa") return { ok: true, bot_rev: 2 };
    return null;
  }),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));
vi.mock("./propias.js", () => ({ recetasPropiasDeCasa: vi.fn(async () => []) }));

const { cargarCasa, guardarCasa } = await import("./casa.js");
const { usarMotor, porQuePlato } = await import("./menu.js");
usarMotor(await import("../../src/server/botCore.js"));
const { conOperacion, ponerAutor } = await import("./operacion.js");

const cambiaLaCena = async (casa) => {
  const nuevo = { g1: { ...casa.semana.plan.g1, "Lun-Cena": { ...casa.semana.plan.g1["Lun-Cena"], recipeId: "crema" } } };
  llamadas.length = 0;
  const r = await guardarCasa(casa, { state: casa.state, semana: { plan: nuevo } });
  return [r, llamadas.find(([fn]) => fn === "bot_save_casa")?.[1]];
};

describe("Lola sella el plato que cambia", () => {
  it("el hueco cambiado lleva canal, cuándo y quién; el otro conserva el del motor", async () => {
    const casa = await cargarCasa("h1", { fresca: true });
    const nuevo = { g1: { ...casa.semana.plan.g1, "Lun-Cena": { ...casa.semana.plan.g1["Lun-Cena"], recipeId: "crema" } } };
    llamadas.length = 0;
    expect((await guardarCasa(casa, { state: casa.state, semana: { plan: nuevo } })).ok).toBe(true);
    const [, args] = llamadas.find(([fn]) => fn === "bot_save_casa");
    const cena = args.p_week.plan.g1["Lun-Cena"].sobre;
    expect(cena).toEqual({ canal: CANAL_DATO.SISTEMA, cuando: expect.any(String), quien: null });
    expect(Number.isNaN(Date.parse(cena.cuando))).toBe(false);
    expect(args.p_week.plan.g1["Lun-Comida"].sobre).toEqual(delMotor);
  });

  it("por_que_plato lee el sobre del hueco de la fecha pedida", async () => {
    // Una fecha escrita: no depende del día de hoy.
    expect(await porQuePlato("h1", { dia: "2026-11-02", franja: "Comida" })).toMatch(/^Lo puso el menú automático \(2026-11-02\)\./);
  });

  it("en un turno, el sobre es el de quien habla y por dónde", async () => {
    const casa = await cargarCasa("h1", { fresca: true });
    const [, args] = await conOperacion({ chat: "c1" }, async () => {
      ponerAutor({ userId: "u1", papel: "owner", canal: CANAL_DATO.TELEGRAM });
      return cambiaLaCena(casa);
    });
    expect(args.p_week.plan.g1["Lun-Cena"].sobre).toEqual({ canal: CANAL_DATO.TELEGRAM, cuando: expect.any(String), quien: "u1" });
  });

  it("un autor sin canal no se firma como el menú automático: falla", async () => {
    const casa = await cargarCasa("h1", { fresca: true });
    await expect(conOperacion({ chat: "c1" }, async () => {
      ponerAutor({ userId: "u1", papel: "owner" });
      return cambiaLaCena(casa);
    })).rejects.toThrow(/canal/);
    expect(llamadas.find(([fn]) => fn === "bot_save_casa")).toBeUndefined();
  });
});
