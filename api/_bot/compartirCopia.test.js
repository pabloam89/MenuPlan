/**
 * «Guardar en mi recetario» una receta que te pasan (copiarReceta): la copia
 * va a user_recipes y a ningún sitio más (#958). Antes se copiaba además en
 * data.userRecipes de la casa, que la app quita en cada guardado: dos sitios
 * para un mismo dato.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => []), update: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn(async () => ({ ok: true })), olvidarCasa: vi.fn() }));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1"), duenoDeEstricto: vi.fn(), rastro: vi.fn(async () => {}) }));
vi.mock("./menu.js", () => ({
  motor: vi.fn(async () => ({ rowToRecipe: (f) => ({ id: f.id, name: f.name, source: "user" }) })),
  prepararRecetas: vi.fn(), grupos: vi.fn(), DIAS: [], recetasDeCasa: vi.fn(), deSerieDelMotor: vi.fn(),
}));
vi.mock("./telegram.js", () => ({ nombreDelBot: vi.fn() }));

const { copiarReceta } = await import("./compartir.js");
const { insert } = await import("./db.js");
const { conCasa } = await import("./casa.js");

describe("copiarReceta: la copia vive en user_recipes", () => {
  it("escribe su fila y no toca el JSON de la casa", async () => {
    const fila = { id: "user_de_ana", owner_id: "u9", name: "Pisto de Ana", ingredients: [], steps: [] };
    const r = await copiarReceta("h1", fila);
    expect(r).toMatchObject({ ok: true, nombre: "Pisto de Ana" });
    expect(insert).toHaveBeenCalledWith("user_recipes", [expect.objectContaining({ owner_id: "u1", copied_from_recipe_id: "user_de_ana" })]);
    expect(conCasa).not.toHaveBeenCalled();
  });
});
