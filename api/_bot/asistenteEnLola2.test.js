/**
 * Lo que el asistente de la app pregunta y Lola no podía decir, parte 2
 * (#939): cuánto aprovecha el menú lo de casa, y cómo comen los peques con
 * detalle (mediodía, finde y qué no repite la cena del comedor).
 */
import { describe, it, expect, vi } from "vitest";
import * as grupos from "../../src/lib/groups.js";
import * as kids from "../../src/lib/kidsMenu.js";

let inicial = null;
let guardada = null;
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-28",
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? inicial);
    if (r) guardada = r;
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({ ...grupos, ...kids }),
}));

const { ajustarMenuPeques, aplicarModoDespensa } = await import("./ajustes.js");

const papa = { id: "p", name: "Papá", age: 38, homeRole: "Adulto" };
const nina = { id: "n", name: "Nina", age: 6, homeRole: "Hijo/a" };
const familia = [{ id: "grp_fam", label: "Familia", memberIds: ["p", "n"], color: "#2d5a3d" }];

async function peques(args, antes = {}) {
  inicial = { state: { data: { members: [papa, nina], menuModel: "same", groups: familia, ...antes } } };
  guardada = null;
  const texto = await ajustarMenuPeques("h", args);
  return { cfg: guardada?.state.data.kidDinnerConfig?.byMember?.n, texto };
}

describe("ajustar_menu_peques con detalle", () => {
  it("el mediodía y el finde, sin tocar la cena", async () => {
    const { cfg, texto } = await peques({ mediodia: "aparte", finde: "igual" });
    expect(cfg).toMatchObject({ weekdayLunch: "own", weekend: "together", dinner: "sameDinner" });
    expect(texto).toMatch(/a mediodía, cuando comen en casa, algo suyo/);
  });

  it("lo que no se dice se queda: cambiar la cena no devuelve el mediodía a «con la familia»", async () => {
    const antes = { kidDinnerConfig: { byMember: { n: { ...kids.KID_DINNER_DEFAULTS, weekdayLunch: "own" } } } };
    const { cfg } = await peques({ cena: "aparte" }, antes);
    expect(cfg).toMatchObject({ weekdayLunch: "own", dinner: "different" });
  });

  it("qué no repite la cena del comedor", async () => {
    const { cfg } = await peques({ cena: "aparte", noRepetir: ["proteina"] });
    expect(cfg.avoid).toEqual({ protein: true, carbs: false, veg: false });
  });

  it("sin nada que cambiar, no guarda", async () => {
    const { cfg, texto } = await peques({});
    expect(cfg).toBeUndefined();
    expect(texto).toMatch(/No había nada que cambiar/);
  });
});

describe("ajustar_uso_despensa", () => {
  it("las mismas tres claves que el paso del asistente", () => {
    expect(aplicarModoDespensa({}, "strict").data).toEqual({ pantryMode: "strict", pantryModeSet: true, useHomeStock: true });
    expect(aplicarModoDespensa({}, "nada").data).toBeUndefined();
  });
});
