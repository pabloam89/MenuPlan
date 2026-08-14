// @vitest-environment jsdom
// downloadMenuPdf/downloadMenu use window.open and document.createElement,
// neither of which exist under vitest's default "node" environment.

import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMenuText, buildMenuPrintHtml, downloadMenuPdf } from "./menuExport.js";
import { registerRecipes } from "../data/recipes.js";

const group = { id: "g1", label: "Familia" };

function baseData(extra = {}) {
  return {
    members: [{ id: "m1", name: "Ana" }],
    groups: [group],
    meals: ["Comida", "Cena"],
    ...extra,
  };
}

describe("formatMenuText includes active off-menu meals (desayuno/merienda/postre)", () => {
  it("previously dropped postre/desayuno/merienda entirely — it only ever walked getMeals() (Comida/Cena)", () => {
    registerRecipes([
      { id: "test_comida", name: "Lentejas" },
      { id: "test_cena", name: "Tortilla francesa" },
      { id: "test_desayuno", name: "Tostada con tomate" },
      { id: "test_postre", name: "Macedonia de fruta" },
    ]);
    const data = baseData({ extraMeals: { desayuno: "variado", postre: "cena" } });
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_comida", eaters: 2 },
        "Lun-Cena": { recipeId: "test_cena", eaters: 2 },
        "Lun-Desayuno": { recipeId: "test_desayuno", eaters: 2, extraMeal: "desayuno" },
        "Lun-Postre": { recipeId: "test_postre", eaters: 2, extraMeal: "postre" },
      },
    };

    const text = formatMenuText(data, menuPlan, [group]);

    expect(text).toContain("Lentejas");
    expect(text).toContain("Tortilla francesa");
    expect(text).toContain("Tostada con tomate");
    expect(text).toContain("Macedonia de fruta");
  });

  it("still exports a plain Comida/Cena menu unchanged when no extra meals are active", () => {
    registerRecipes([
      { id: "test_comida2", name: "Arroz con pollo" },
      { id: "test_cena2", name: "Crema de calabacín" },
    ]);
    const data = baseData();
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_comida2", eaters: 2 },
        "Lun-Cena": { recipeId: "test_cena2", eaters: 2 },
      },
    };

    const text = formatMenuText(data, menuPlan, [group]);
    expect(text).toContain("Arroz con pollo");
    expect(text).toContain("Crema de calabacín");
    expect(text).not.toContain("Desayuno");
    expect(text).not.toContain("Postre");
  });
});

describe("buildMenuPrintHtml", () => {
  it("includes every active meal, including postre, and escapes dish/member names", () => {
    registerRecipes([
      { id: "test_html_comida", name: "Lentejas" },
      { id: "test_html_postre", name: 'Tarta <casera> & "buena"' },
    ]);
    const data = {
      members: [{ id: "m1", name: "Ana <3" }],
      groups: [group],
      meals: ["Comida", "Cena"],
      extraMeals: { postre: "cena" },
    };
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_html_comida", eaters: 2 },
        "Lun-Postre": { recipeId: "test_html_postre", eaters: 2, extraMeal: "postre" },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group]);

    expect(html).toContain("Lentejas");
    // The raw name must never appear unescaped — that's an HTML-injection risk
    // in a document written into a real window via document.write.
    expect(html).not.toContain('Tarta <casera> & "buena"');
    expect(html).toContain("Tarta &lt;casera&gt; &amp; &quot;buena&quot;");
    expect(html).not.toContain("Ana <3");
    expect(html).toContain("<!doctype html>");
  });
});

describe("downloadMenuPdf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a print window with the menu HTML and calls print() instead of downloading a .txt", async () => {
    registerRecipes([{ id: "test_pdf_comida", name: "Paella" }]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = { [group.id]: { "Lun-Comida": { recipeId: "test_pdf_comida", eaters: 2 } } };

    const fakeWin = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        readyState: "complete",
      },
      addEventListener: vi.fn(),
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.stubGlobal("window", { ...window, open: vi.fn(() => fakeWin) });

    const result = await downloadMenuPdf(data, menuPlan, [group]);

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(fakeWin.document.write).toHaveBeenCalledWith(expect.stringContaining("Paella"));
    expect(fakeWin.print).toHaveBeenCalled();
    expect(result).toEqual({ method: "print" });
  });

  it("falls back to the plain-text download when the print window is blocked (popup blocker)", async () => {
    registerRecipes([{ id: "test_pdf_blocked", name: "Merluza" }]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = { [group.id]: { "Lun-Comida": { recipeId: "test_pdf_blocked", eaters: 2 } } };

    vi.stubGlobal("window", { ...window, open: vi.fn(() => null) });
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    const result = await downloadMenuPdf(data, menuPlan, [group]);

    expect(result).toEqual({ method: "download" });
    expect(clickSpy).toHaveBeenCalled();
    document.createElement.mockRestore();
  });
});
