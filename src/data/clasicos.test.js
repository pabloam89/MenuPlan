import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { recipeCatalogById } from "./recipeCatalog.js";
import manifest from "../assets/dishes/dishImages.json";

// Los marcados en el JSON, no en el catálogo ya cargado: si una receta marcada
// no llega a `recipeCatalog` (las de guarniciones.json se quedan fuera), mirar
// solo el catálogo la haría desaparecer sin que nadie se entere.
const DIR = new URL("./recipes/", import.meta.url);
const marcados = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")))
  .filter((r) => r?.clasico === true);

const PAPELES_DE_MENU = ["primero", "segundo", "plato_unico", "cena"];

describe("los clásicos de casa (`clasico`)", () => {
  it("hay una tanda que elegir", () => {
    // Suelo, no la cifra: añadir clásicos no debe romperlo.
    expect(marcados.length).toBeGreaterThanOrEqual(40);
  });

  it("todos llegan al catálogo que leen la pizarra y el recetario", () => {
    expect(marcados.filter((r) => !recipeCatalogById[r.id]).map((r) => r.id)).toEqual([]);
  });

  it("todos tienen foto", () => {
    expect(marcados.filter((r) => !manifest[r.id]).map((r) => r.id)).toEqual([]);
  });

  it("todos caben en una comida o una cena", () => {
    const fuera = marcados.filter((r) => !(r.mealRole ?? []).some((p) => PAPELES_DE_MENU.includes(p)));
    expect(fuera.map((r) => r.id)).toEqual([]);
  });
});
