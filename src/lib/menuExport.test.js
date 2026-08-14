// @vitest-environment jsdom
// downloadMenuPdf/downloadMenu use window.open and document.createElement,
// neither of which exist under vitest's default "node" environment.

import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMenuText, buildMenuPrintHtml, downloadMenuPdf } from "./menuExport.js";
import { registerRecipes } from "../data/recipes.js";

const group = { id: "g1", label: "Familia", memberIds: ["m1"] };

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
      { id: "test_html_cena", name: "Merluza" },
      { id: "test_html_postre", name: 'Tarta <casera> & "buena"' },
    ]);
    const data = {
      members: [{ id: "m1", name: "Ana <3", avatarKey: "mama_1", color: "#d81b60" }],
      groups: [group],
      meals: ["Comida", "Cena"],
      extraMeals: { postre: "cena" },
    };
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_html_comida", eaters: 2 },
        "Lun-Cena": { recipeId: "test_html_cena", eaters: 2 },
        "Lun-Postre": { recipeId: "test_html_postre", eaters: 2, extraMeal: "postre" },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group], {
      assetBase: "https://app.example",
    });

    expect(html).toContain("Lentejas");
    expect(html).not.toContain('Tarta <casera> & "buena"');
    expect(html).toContain("Tarta &lt;casera&gt; &amp; &quot;buena&quot;");
    expect(html).not.toContain("Ana <3");
    expect(html).toContain("Ana");
    expect(html).toContain('class="person"');
    expect(html).toContain("border-color:#d81b60");
    expect(html).toContain("https://app.example/avatares/thumbs/mama/mama_1.png");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain('class="grid"');
    expect(html).toContain('class="meal-label icon-only"');
    expect(html).not.toContain(">Comida<");
    expect(html).not.toContain(">Cena<");
    expect(html).not.toContain(">Postre<");
    expect(html).toContain('class="glyph"');
    expect(html).toContain('stroke="#');
  });

  it("folds primero + segundo into a single Comida block (Lucide Comida)", () => {
    registerRecipes([
      { id: "test_primero", name: "Ensalada verde" },
      { id: "test_segundo", name: "Pollo al horno" },
    ]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": {
          recipeId: "test_segundo",
          firstRecipeId: "test_primero",
          eaters: 2,
        },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group]);

    expect(html).not.toContain(">Primero<");
    expect(html).not.toContain(">Segundo<");
    expect(html).toContain("Ensalada verde");
    expect(html).toContain("Pollo al horno");
    expect(html).toContain('class="meal-label icon-only"');
    expect(html).toContain('stroke="#d4a017"');
    expect(html).not.toContain("Ensalada verde · Pollo al horno");
  });

  it("folds postre into the Cena block when postre is attached to dinner", () => {
    registerRecipes([
      { id: "test_cena_fold", name: "Tortilla" },
      { id: "test_postre_fold", name: "Yogur con miel" },
    ]);
    const data = {
      members: [],
      groups: [group],
      meals: ["Comida", "Cena"],
      extraMeals: { postre: "cena" },
    };
    const menuPlan = {
      [group.id]: {
        "Lun-Cena": { recipeId: "test_cena_fold", eaters: 2 },
        "Lun-Postre": { recipeId: "test_postre_fold", eaters: 2, extraMeal: "postre" },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group]);

    expect(html).toContain("Tortilla");
    expect(html).toContain("Yogur con miel");
    expect(html).toContain('class="meal-label icon-only"');
    expect(html).not.toContain(">Postre<");
  });

  it("hides postre in the Cena block when that day has no dinner dish", () => {
    registerRecipes([
      { id: "test_postre_orphan", name: "Flan casero" },
    ]);
    const data = {
      members: [],
      groups: [group],
      meals: ["Comida", "Cena"],
      extraMeals: { postre: "cena" },
    };
    // Postre exists in the plan but Cena is empty (e.g. everyone fuera) —
    // fridge sheet must not show a dangling dessert.
    const menuPlan = {
      [group.id]: {
        "Lun-Postre": { recipeId: "test_postre_orphan", eaters: 2, extraMeal: "postre" },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group]);
    expect(html).not.toContain("Flan casero");
  });

  it("renders the full weekday band and dims inactive days on a mid-week start", () => {
    registerRecipes([{ id: "test_thu", name: "Lentejas" }]);
    const data = {
      members: [],
      groups: [group],
      meals: ["Comida", "Cena"],
      menuWeek: { offset: 0, startDayIdx: 3 },
    };
    const menuPlan = {
      [group.id]: { "Jue-Comida": { recipeId: "test_thu", eaters: 2 } },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group], {
      weeks: [{ plan: menuPlan, offset: 0, startDayIdx: 3 }],
      export: { dayScope: "weekday", meals: ["Comida", "Cena"], includeSchoolMenu: false },
    });

    // All five weekdays render (dish lands on its real weekday)…
    expect(html).toContain("--day-cols:5");
    expect(html).toContain("Lentejas");
    // …but the days before startDayIdx are dimmed, not collapsed.
    expect(html).toContain("day-head inactive");
    expect(html).toContain("cell inactive");
    // Weekend is never rendered in weekday scope.
    expect(html).not.toContain(">Sábado<");
    expect(html).not.toContain(">Domingo<");
  });

  it("marks school-menu dishes with a cole bullet", () => {
    const kids = { id: "g-kids", label: "Niños", memberIds: ["kid1"] };
    const data = {
      members: [{ id: "kid1", name: "Cova", homeRole: "Hijo/a" }],
      groups: [kids],
      meals: ["Comida", "Cena"],
      schedule: { "kid1|Lun|Comida": "cole" },
      schoolMenus: {
        shared: {},
        byMember: {
          kid1: {
            "Lun-Primero": "Sopa de verduras",
            "Lun-Segundo": "Filete empanado",
          },
        },
      },
    };
    const menuPlan = { [kids.id]: {} };

    const html = buildMenuPrintHtml(data, menuPlan, [kids]);

    expect(html).toContain("Sopa de verduras");
    expect(html).toContain("Filete empanado");
    expect(html).toContain("cole-dot");
    expect(html).toContain('class="slot cole"');
  });

  it("stacks every week on a single sheet when exporting a multi-week menú", () => {
    registerRecipes([
      { id: "w1", name: "Paella" },
      { id: "w2", name: "Cocido" },
    ]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const weeks = [
      {
        plan: { [group.id]: { "Lun-Comida": { recipeId: "w1", eaters: 2 } } },
        offset: 0,
        startDayIdx: 0,
        startISO: "2026-08-10",
      },
      {
        plan: { [group.id]: { "Lun-Comida": { recipeId: "w2", eaters: 2 } } },
        offset: 1,
        startDayIdx: 0,
        startISO: "2026-08-17",
      },
    ];

    const html = buildMenuPrintHtml(data, weeks[0].plan, [group], { weeks });

    expect(html).toContain("Paella");
    expect(html).toContain("Cocido");
    expect(html).toContain("Menú del mes");
    expect(html).toContain("week-block");
    expect(html).toContain("header-mid");
    // No per-week title rows — dates in the day heads distinguish weeks.
    expect(html).not.toContain("week-band");
    expect(html).not.toContain("Semana 1");
    // One shared sheet — not one full menu page per week.
    expect((html.match(/class="sheet/g) ?? []).length).toBe(1);
    expect(html).not.toContain("page-break-after: always");
  });

  it("hides school menu when includeSchoolMenu is false", () => {
    const kids = { id: "g-kids", label: "Niños", memberIds: ["kid1"] };
    const data = {
      members: [{ id: "kid1", name: "Cova", homeRole: "Hijo/a" }],
      groups: [kids],
      meals: ["Comida", "Cena"],
      schedule: { "kid1|Lun|Comida": "cole" },
      schoolMenus: {
        shared: {},
        byMember: {
          kid1: {
            "Lun-Primero": "Sopa de verduras",
            "Lun-Segundo": "Filete empanado",
          },
        },
      },
    };
    const menuPlan = { [kids.id]: {} };

    const html = buildMenuPrintHtml(data, menuPlan, [kids], {
      export: { dayScope: "weekday", meals: ["Comida", "Cena"], includeSchoolMenu: false },
    });

    expect(html).not.toContain("Sopa de verduras");
    expect(html).not.toContain('class="slot cole"');
    expect(html).not.toContain("Menú del cole");
  });

  it("exports only weekend days when dayScope is weekend", () => {
    registerRecipes([
      { id: "test_sat", name: "Paella dominguera" },
      { id: "test_mon", name: "Lentejas" },
    ]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = {
      [group.id]: {
        "Sáb-Comida": { recipeId: "test_sat", eaters: 2 },
        "Lun-Comida": { recipeId: "test_mon", eaters: 2 },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group], {
      export: { dayScope: "weekend", meals: ["Comida", "Cena"], includeSchoolMenu: false },
    });

    expect(html).toContain("--day-cols:2");
    expect(html).toContain("Paella dominguera");
    expect(html).not.toContain("Lentejas");
    expect(html).toContain("Fin de semana");
  });

  it("omits Cena row when meals filter excludes it", () => {
    registerRecipes([
      { id: "test_lunch_only", name: "Ensalada" },
      { id: "test_dinner_only", name: "Tortilla" },
    ]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_lunch_only", eaters: 2 },
        "Lun-Cena": { recipeId: "test_dinner_only", eaters: 2 },
      },
    };

    const html = buildMenuPrintHtml(data, menuPlan, [group], {
      export: { dayScope: "weekday", meals: ["Comida"], includeSchoolMenu: false },
    });

    expect(html).toContain("Ensalada");
    expect(html).not.toContain("Tortilla");
    expect(html).toContain('stroke="#d4a017"');
    expect(html).not.toContain('stroke="#3a5a72"');
  });

  it("embeds absolute asset URLs and a QR when opts are provided", () => {
    registerRecipes([{ id: "test_qr_comida", name: "Paella" }]);
    const data = { members: [], groups: [group], meals: ["Comida", "Cena"] };
    const menuPlan = { [group.id]: { "Lun-Comida": { recipeId: "test_qr_comida", eaters: 2 } } };

    const html = buildMenuPrintHtml(data, menuPlan, [group], {
      assetBase: "https://app.example",
      qrDataUrl: "data:image/png;base64,AAA",
      appUrl: "https://app.example",
    });

    expect(html).toContain("https://app.example/categories/frutas.png");
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(html).toContain("app.example");
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
