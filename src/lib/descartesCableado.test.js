import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// El cableado de la prioridad por descartes: que lo que fija descartesPrioridad.js llegue de verdad
// al solver completo (generateMenuWithAI) y al cambio de plato suelto (pickCatalogReplacement).
// La cuenta pura y el solver suelto los prueba descartesPrioridad.test.js.
const resolverConReintentosEspia = vi.fn();
vi.mock("./solver.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    resolverConReintentos: (...args) => {
      resolverConReintentosEspia(...args);
      return real.resolverConReintentos(...args);
    },
  };
});

import { fijarDescartadas } from "./descartesPrioridad.js";
import { generateMenuWithAI, pickCatalogReplacement } from "./aiPlanner.js";

const group = { id: "g1", label: "Familia", memberIds: ["m1"] };
const data = {
  members: [{ id: "m1", age: 35 }],
  allergiesReviewed: true, groups: [group], schedule: {},
};

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });
afterEach(() => { fijarDescartadas([]); resolverConReintentosEspia.mockClear(); vi.unstubAllGlobals(); });

describe("cableado: generar el menú con el solver", () => {
  it("le pasa al solver los platos bajados de prioridad, sin las favoritas de la casa", async () => {
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    fijarDescartadas(["carnes_054", "carnes_083"]);
    await generateMenuWithAI({ ...data, recipeVotes: { carnes_083: { fav: "all" } } });
    const opciones = resolverConReintentosEspia.mock.calls[0][2];
    expect([...opciones.descartados]).toEqual(["carnes_054"]);
  }, 120000);

  it("sin nada fijado el solver recibe una cuenta vacía", async () => {
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    await generateMenuWithAI(data);
    expect(resolverConReintentosEspia.mock.calls[0][2].descartados.size).toBe(0);
  }, 120000);
});

describe("cableado: cambiar un plato suelto", () => {
  const menuPlan = { [group.id]: { "Lun-Cena": { recipeId: "carnes_002", eaters: 2 } } };
  const pedir = () => pickCatalogReplacement(data, menuPlan, { groupId: group.id, day: "Lun", meal: "Cena", course: "main" });
  // Con un solo grupo activo el id del plato es el del catálogo, sin prefijo de grupo.
  const idDe = (r) => r.recipeId;

  it("no propone los bajados de prioridad mientras haya otro plato, y si no queda otro rellena igual", () => {
    // Lo que sale sin nada fijado: varias decenas de platos distintos en un hueco de cena.
    const vistos = new Set();
    for (let i = 0; i < 120; i++) vistos.add(idDe(pedir()));
    expect(vistos.size).toBeGreaterThan(10);

    // Se bajan la mitad de los que salen: en 60 intentos no sale ninguno de ellos.
    const bajados = new Set([...vistos].slice(0, Math.floor(vistos.size / 2)));
    fijarDescartadas(bajados);
    for (let i = 0; i < 60; i++) expect(bajados.has(idDe(pedir()))).toBe(false);

    // Si se bajan todos los candidatos, el hueco no se queda vacío.
    fijarDescartadas(vistos);
    for (let i = 0; i < 10; i++) expect(pedir()).toBeTruthy();
  });
});
