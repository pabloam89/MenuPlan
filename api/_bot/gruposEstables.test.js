/**
 * ajustar_menu_peques (ajustes.js) y la app rehacen los grupos igual: cada
 * grupo nuevo hereda el id del viejo de su tipo (Familia ↔ Adultos, Bebé ↔
 * Bebé), y el menú en curso, guardado con esos ids, sigue siendo suyo. Antes el
 * bot heredaba por su cuenta (papel()) y la app daba ids nuevos cada vez.
 */
import { describe, it, expect, vi } from "vitest";
import * as grupos from "../../src/lib/groups.js";
import * as kids from "../../src/lib/kidsMenu.js";

let inicial = null;
let guardada = null;
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-07",
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

const { ajustarMenuPeques } = await import("./ajustes.js");

const papa = { id: "p", name: "Papá", age: 38, homeRole: "Adulto" };
const mama = { id: "m", name: "Mamá", age: 36, homeRole: "Adulto" };
const nina = { id: "n", name: "Nina", age: 6, homeRole: "Hijo/a" };
const bebe = { id: "b", name: "Leo", age: 1, homeRole: "Bebé" };

/** Lo que hace la app (Onboarding, cena de los peques) con el mismo cambio. */
const enLaApp = (members, modelo, viejos) =>
  grupos.migrateGroupsForBabies(members, grupos.groupsFromModel(members, modelo, viejos), modelo);

async function enElBot(members, menuModel, groups, cena) {
  inicial = { state: { data: { members, menuModel, groups } } };
  guardada = null;
  await ajustarMenuPeques("h", { cena });
  return guardada.state.data;
}

describe("bot y app rehacen los grupos con los mismos ids", () => {
  it("todos lo mismo → los peques cenan aparte: Familia pasa a Adultos con su id", async () => {
    const members = [papa, mama, nina];
    const viejos = [{ id: "grp_fam", label: "Familia", memberIds: ["p", "m", "n"], color: "#2d5a3d" }];
    const bot = await enElBot(members, "same", viejos, "aparte");
    expect(bot.menuModel).toBe("separate");
    const app = enLaApp(members, "separate", viejos);
    const adultos = (gs) => gs.find((g) => grupos.tipoDeGrupo(g) === "adultos");
    expect(adultos(bot.groups).id).toBe("grp_fam");
    expect(adultos(app).id).toBe("grp_fam");
  });

  it("menús separados con bebé → todos lo mismo: mismos ids en los dos", async () => {
    // Con un adolescente: con un niño de 3 a 11, Familia no hereda (ver abajo).
    const members = [papa, mama, { ...nina, age: 14 }, bebe];
    const viejos = [
      { id: "grp_a", label: "Adultos", memberIds: ["p", "m"], color: "#2d5a3d" },
      { id: "grp_n", label: "Niños", memberIds: ["n"], color: "#c67030" },
      { id: "grp_b", label: "Bebé", memberIds: ["b"], color: "#5a7ea8" },
    ];
    const bot = await enElBot(members, "separate", viejos, "igual");
    expect(bot.menuModel).toBe("same");
    const app = enLaApp(members, "same", viejos);
    expect(bot.groups.map((g) => g.id)).toEqual(["grp_a", "grp_b"]);
    expect(app.map((g) => g.id)).toEqual(bot.groups.map((g) => g.id));
  });

  // El plan de Adultos se hizo sin Nina: heredar su id le serviría la tortilla
  // del martes sin pasar por su alergia al huevo. Familia estrena id en los dos.
  it("menús separados → todos lo mismo con Nina alérgica al huevo: Familia no hereda el plan de Adultos", async () => {
    const members = [papa, mama, { ...nina, allergies: ["Huevo"] }];
    const viejos = [
      { id: "grp_a", label: "Adultos", memberIds: ["p", "m"], color: "#2d5a3d" },
      { id: "grp_n", label: "Niños", memberIds: ["n"], color: "#c67030" },
    ];
    const bot = await enElBot(members, "separate", viejos, "igual");
    const app = enLaApp(members, "same", viejos);
    for (const gs of [bot.groups, app]) {
      expect(gs).toHaveLength(1);
      expect(["grp_a", "grp_n"]).not.toContain(gs[0].id);
    }
  });
});
