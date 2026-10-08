import { describe, it, expect, vi } from "vitest";
import { vetosDe, vetosDeCasa, platoVetado } from "./vetos.js";
import { libretaVacia, poner } from "./notepad.js";
import { proyectarReglas } from "./reglas.js";
import { buildGroupContext } from "./aiPlanner.js";
import { generateMenu } from "./planner.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { filterRecipes, filterOffMenuRecipes } from "../utils/filterRecipes.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { chocaConHueco } from "./excluirHueco.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { palabrasDe } = await import("../../api/_bot/voz.js");
const { montarFicha } = await import("../../api/_bot/ficha.js");

vi.setConfig({ testTimeout: 30000 });

const HOY = "2026-10-08";
const dicho = (n, path, valor, extra = {}) => poner(n, path, valor, { origen: "texto", frase: "no me pongas eso", fecha: HOY, ...extra });
const libretaCon = (...vetos) => vetos.reduce((n, v) => dicho(n, `excluidos.${v}`, true), libretaVacia());
const plato = (name, ...ings) => ({ name, tags: [], ingredients: ings.map((i) => ({ name: i })) });

describe("platoVetado: un solo comparador", () => {
  it("«pollo» no veta el repollo; sí la pechuga de pollo", () => {
    expect(platoVetado(plato("Repollo salteado", "Repollo", "Ajo"), ["pollo"])).toBeNull();
    expect(platoVetado(plato("Pechugas a la plancha", "Pechuga de pollo"), ["pollo"])).toBe("pollo");
  });

  it("sin tildes y sin mayúsculas, en los dos lados", () => {
    expect(platoVetado(plato("Encebollado", "Hígado de ternera"), ["higado"])).toBe("higado");
    expect(platoVetado(plato("Batido", "platano"), ["Plátano"])).toBe("Plátano");
  });

  it("singular y plural, en los dos sentidos", () => {
    expect(platoVetado(plato("Guiso", "Patatas"), ["patata"])).toBe("patata");
    expect(platoVetado(plato("Hummus", "Garbanzo cocido"), ["garbanzos"])).toBe("garbanzos");
    expect(platoVetado(plato("Limonada", "Limones"), ["limón"])).toBe("limón");
  });

  it("frontera también al final: «pan» no veta la panceta", () => {
    expect(platoVetado(plato("Lentejas", "Panceta"), ["pan"])).toBeNull();
    expect(platoVetado(plato("Tostada", "Pan de molde"), ["pan"])).toBe("pan");
  });

  it("cuenta el nombre del plato; las etiquetas no", () => {
    expect(platoVetado(plato("Coliflor gratinada", "Bechamel"), ["coliflor"])).toBe("coliflor");
    expect(platoVetado({ ...plato("Merluza", "Merluza"), tags: ["pescado"] }, ["pescado"])).toBeNull();
  });

  it("el veto por hueco usa el mismo comparador", () => {
    expect(chocaConHueco(plato("Lentejas", "Panceta"), ["pan"])).toBeNull();
    expect(chocaConHueco(plato("Guiso", "Patatas"), ["patata"])).toBe("patata");
  });
});

describe("vetosDe: una fuente, calculada al leer", () => {
  it("sale de la libreta, no de la proyección guardada en data.excluidos", () => {
    const data = { notepad: libretaCon("cilantro"), excluidos: ["coliflor"], members: [] };
    expect(vetosDeCasa(data)).toEqual(["cilantro"]);
  });

  it("lo que caducó ya no veta: se mira la libreta con la fecha", () => {
    const notepad = dicho(libretaVacia(), "excluidos.gluten", true, { hasta: "2026-10-31" });
    expect(vetosDeCasa({ notepad }, { hoy: "2026-10-20" })).toEqual(["gluten"]);
    expect(vetosDeCasa({ notepad }, { hoy: "2026-11-03" })).toEqual([]);
    // La generación pasa la fecha de su semana en `vigenteEn`.
    expect(vetosDeCasa({ notepad, vigenteEn: "2026-11-03" })).toEqual([]);
  });

  it("los de una persona alcanzan a su grupo, no a los demás", () => {
    const data = {
      notepad: libretaCon("cilantro"),
      members: [{ id: "a", dislikes: ["Coliflor"] }, { id: "b", dislikes: ["setas"] }],
    };
    expect(vetosDe(data, { grupo: { memberIds: ["a"] } })).toEqual(["cilantro", "Coliflor"]);
    expect(vetosDe(data, { persona: "b" })).toEqual(["cilantro", "setas"]);
    expect(vetosDe(data)).toEqual(["cilantro", "Coliflor", "setas"]);
  });

  it("sin duplicados aunque cambien tildes o mayúsculas", () => {
    const data = { notepad: libretaCon("higado"), dislikes: ["Hígado"], members: [{ id: "a", dislikes: ["HIGADO"] }] };
    expect(vetosDe(data)).toHaveLength(1);
  });

  it("las reglas de la casa entran por su propia clave del delta", () => {
    const regla = { id: "r1", sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "picante" }, ambito: {}, vigencia: {} };
    const data = { notepad: libretaCon("cilantro"), members: [], groups: [], schedule: {} };
    const { delta } = proyectarReglas([regla], data, { hoy: HOY });
    expect(vetosDeCasa({ ...data, ...delta })).toEqual(["cilantro", "picante"]);
  });
});

describe("el motor lee los vetos de la libreta", () => {
  const group = { id: "g1", label: "Familia", memberIds: ["m1"] };
  const data = {
    members: [{ id: "m1", age: 40 }],
    groups: [group],
    schedule: {},
    meals: ["Comida", "Cena"],
    notepad: libretaCon("cebolla"),
  };

  it("aiPlanner y el planner local ven los mismos vetos que vetosDe", () => {
    expect(buildGroupContext(data, group).filterOpts.dislikes).toEqual(vetosDe(data, { grupo: group }));
  });

  it("el planner local no pone ni un plato con cebolla", () => {
    const plan = generateMenu(data);
    const elegidos = Object.values(plan.g1).filter(Boolean).flatMap((s) => [s.recipeId, s.firstRecipeId]).filter(Boolean);
    expect(elegidos.length).toBeGreaterThan(0);
    const conCebolla = elegidos.map((id) => RECIPES_BY_ID[id]).filter((r) => platoVetado(r, ["cebolla"]));
    expect(conCebolla.map((r) => r.name)).toEqual([]);
  });

  it("filterRecipes y el planner coinciden: nada vetado en el pool", () => {
    const { recipes } = filterRecipes({ dislikes: vetosDe(data, { grupo: group }) });
    expect(recipes.filter((r) => platoVetado(r, ["cebolla"]))).toEqual([]);
  });

  it("«pollo» no se lleva los platos de repollo del catálogo de verdad", () => {
    const sinVeto = filterRecipes({}).recipes;
    const deRepollo = sinVeto.filter((r) =>
      r.ingredients.some((i) => /repollo/i.test(i.name)) && !r.ingredients.some((i) => /\bpollo/i.test(i.name)) && !/\bpollo/i.test(r.name));
    expect(deRepollo.length).toBeGreaterThan(0);
    const conVeto = new Set(filterRecipes({ dislikes: ["pollo"] }).recipes.map((r) => r.id));
    expect(deRepollo.filter((r) => !conVeto.has(r.id)).map((r) => r.name)).toEqual([]);
  });

  it("fuera de menú (postres) usa el mismo comparador: «te» no es la mantequilla", () => {
    const todos = filterOffMenuRecipes("postres", {});
    const conMantequilla = todos.filter((r) => r.ingredients.some((i) => /mantequilla/i.test(i.name)) && !platoVetado(r, ["te"]));
    expect(conMantequilla.length).toBeGreaterThan(0);
    const conVeto = new Set(filterOffMenuRecipes("postres", { dislikes: ["te"] }).map((r) => r.id));
    expect(conMantequilla.filter((r) => !conVeto.has(r.id)).map((r) => r.name)).toEqual([]);
  });
});

describe("el bot y la app dicen lo mismo", () => {
  const data = {
    members: [{ id: "a", name: "Iker", age: 40, dislikes: ["setas"] }],
    groups: [{ id: "g", label: "Familia", memberIds: ["a"] }],
    notepad: libretaCon("cilantro"),
    // La proyección vieja, guardada: ya no la lee nadie.
    excluidos: ["coliflor"],
  };

  it("la voz y la ficha nombran los vetos de vetosDe, y no la proyección guardada", () => {
    const voz = palabrasDe(data, []).propias;
    expect(voz).toEqual(vetosDe(data));
    const { estable } = montarFicha({ state: { data } }, {}, HOY);
    const nunca = estable.split("\n").find((l) => l.startsWith("- Nunca:"));
    expect(nunca).toBe(`- Nunca: ${vetosDeCasa(data, { hoy: HOY }).join(", ")}.`);
    expect(estable).not.toContain("coliflor");
  });
});

// Que el catálogo no esté vacío para estos tests: si lo estuviera, todo
// pasaría sin medir nada.
it("hay catálogo", () => {
  expect(recipeCatalog.length).toBeGreaterThan(100);
});
