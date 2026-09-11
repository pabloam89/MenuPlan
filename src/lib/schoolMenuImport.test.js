import { describe, it, expect } from "vitest";
import {
  parseSchoolMenuText,
  parseSchoolMenuCsv,
  selectBestWeek,
  importSchoolMenuFile,
} from "./schoolMenuImport.js";

// ---------------------------------------------------------------------------
// Free-text parser — the local fallback used for OCR / flat-text PDFs.
// This is the core of the fast (no-API) import path, so it must stay solid.
// ---------------------------------------------------------------------------

describe("parseSchoolMenuText", () => {
  it("extracts a full week from labelled day blocks", () => {
    const text = `LUNES
Primero: Lentejas estofadas
Segundo: Pollo asado
Postre: Manzana
MARTES
Primero: Sopa de fideos
Segundo: Merluza a la plancha
Postre: Yogur
MIÉRCOLES
Primero: Macarrones con tomate
Segundo: Tortilla francesa
Postre: Pera
JUEVES
Primero: Arroz a la cubana
Segundo: Filete de cerdo
Postre: Flan
VIERNES
Primero: Judías verdes
Segundo: Croquetas
Postre: Fruta`;

    const entries = parseSchoolMenuText(text);

    expect(entries["Lun-Primero"]).toBe("Lentejas estofadas");
    expect(entries["Lun-Postre"]).toBe("Manzana");
    expect(entries["Vie-Segundo"]).toBe("Croquetas");

    const days = new Set(Object.keys(entries).map((k) => k.split("-")[0]));
    expect(days.size).toBe(5);
  });

  it("filters out nutritional noise lines", () => {
    const text = `LUNES
Lentejas estofadas
Pollo asado
Manzana
640 kcal | P: 28 HC: 72 G: 20`;

    const entries = parseSchoolMenuText(text);
    const values = Object.values(entries);
    expect(values).toContain("Lentejas estofadas");
    expect(values.some((v) => /kcal/i.test(v))).toBe(false);
  });

  it("returns nothing when no day markers are present", () => {
    const entries = parseSchoolMenuText("Just some random text\nwith no days");
    expect(Object.keys(entries)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CSV fallback parser
// ---------------------------------------------------------------------------

describe("parseSchoolMenuCsv", () => {
  it("parses row-per-day CSV", () => {
    const csv = `Lunes,Lentejas,Pollo,Manzana
Martes,Sopa,Merluza,Yogur`;
    const entries = parseSchoolMenuCsv(csv);
    expect(entries["Lun-Primero"]).toBe("Lentejas");
    expect(entries["Mar-Postre"]).toBe("Yogur");
  });
});

// ---------------------------------------------------------------------------
// Week selection — picks the most complete / current week.
// ---------------------------------------------------------------------------

describe("selectBestWeek", () => {
  it("returns 0 for a single week", () => {
    expect(selectBestWeek([{ weekLabel: "", entries: { "Lun-Primero": "x" } }])).toBe(0);
  });

  it("picks the week with the most entries when labels are unhelpful", () => {
    const weeks = [
      { weekLabel: "", entries: { "Lun-Primero": "a" } },
      { weekLabel: "", entries: { "Lun-Primero": "a", "Mar-Primero": "b", "Mié-Primero": "c" } },
    ];
    expect(selectBestWeek(weeks)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// High-level entry point — CSV goes fully local (no network), exercising the
// refactored importSchoolMenuFile end to end.
// ---------------------------------------------------------------------------

describe("importSchoolMenuFile (CSV, local path)", () => {
  // 20 s, y no es que la importación sea lenta: es la única prueba del fichero
  // que llega a `importSchoolMenuFile`, y esa función hace
  // `await import("./menuParser.js")` DENTRO del cuerpo (schoolMenuImport.js:593)
  // para que el catálogo no entre en el chunk inicial. Cargar ese grafo —los 16
  // JSON de recetas, 5 MB— por el pipeline de Vite se cobra contra el
  // presupuesto de ESTA prueba, no contra el `transform` de la suite: medido,
  // 5,1 s de los que el round-trip a Supabase son ~230 ms y el emparejamiento
  // con el catálogo 11 ms. Con el timeout de 5 s por defecto rozaba el límite y
  // pasó a rojo cuando el catálogo de esta rama creció.
  //
  // Se sube el presupuesto en vez de volver estático ese import: hacerlo
  // estático arreglaría la prueba y metería el catálogo en el chunk de arranque,
  // que es justo lo contrario de lo que se quiere.
  it("imports a CSV file without touching the network", async () => {
    const csv = `día,primero,segundo,postre
Lunes,Lentejas estofadas,Pollo asado,Manzana
Martes,Sopa de fideos,Merluza,Yogur
Miércoles,Macarrones,Tortilla,Pera
Jueves,Arroz,Filete,Flan
Viernes,Judías,Croquetas,Fruta`;
    const file = new File([csv], "menu.csv", { type: "text/csv" });

    const { weeks, entries } = await importSchoolMenuFile(file);

    expect(weeks.length).toBeGreaterThan(0);
    expect(entries["Lun-Primero"]).toBe("Lentejas estofadas");
    expect(entries["Vie-Postre"]).toBe("Fruta");
  }, 20000);
});
