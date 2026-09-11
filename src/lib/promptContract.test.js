import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPTS, PROMPT_ALLERGEN_IDS } from "../../api/_prompts.js";
import { EU_ALLERGENS } from "./allergens.js";
import { STEP_PARTS } from "./recipeSteps.js";
import { CAMPOS } from "./notepadFields.js";
import { APPLIANCE_LABELS } from "./applianceMethods.js";
import { CARB_TYPE_BY_BASE, MAIN_BASES } from "../data/recipeSchema.js";

// The system prompts live server-side (api/_prompts.js) so /api/generate can't
// be driven as a general-purpose LLM — see the header there. Two things can
// silently rot as a result, and these tests pin both:
//
//  1. The allergen id list used to be interpolated from EU_ALLERGENS at build
//     time. It's now a literal string in api/_prompts.js, so adding an allergen
//     to EU_ALLERGENS would no longer reach the prompt and the model would
//     never emit the new id.
//  2. The client sends a `task` key instead of the prompt text. A typo, or a
//     prompt renamed on the server, would mean the request silently runs with
//     NO system prompt at all.

describe("server-owned system prompts", () => {
  it("the inlined allergen list still matches EU_ALLERGENS", () => {
    const expected = Object.keys(EU_ALLERGENS).join(", ");
    expect(PROMPT_ALLERGEN_IDS).toBe(expected);
  });

  it("embeds every allergen id in the recipe-structuring prompt", () => {
    for (const id of Object.keys(EU_ALLERGENS)) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(id);
    }
  });

  // Fase 6: el prompt tiene que pedir "part" con los mismos 4 valores que
  // STEP_PARTS (recipeSteps.js) — si alguien añade un valor nuevo al enum ahí
  // sin tocar el prompt, el modelo seguirá sin poder usarlo nunca.
  it("pide los 4 valores de STEP_PARTS en el prompt de structure-recipe", () => {
    for (const part of STEP_PARTS) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(`"${part}"`);
    }
  });

  it("defines a prompt for every task the client asks for", () => {
    // Keep in sync with the `task:` values sent from src/lib.
    const tasksUsedByClient = [
      "planner",
      "steps",
      "school-menu",
      "suggest-ingredients",
      "structure-recipe",
    ];
    for (const task of tasksUsedByClient) {
      expect(Object.keys(SYSTEM_PROMPTS)).toContain(task);
      expect(SYSTEM_PROMPTS[task].length).toBeGreaterThan(50);
    }
  });

  // ── Contratos de vocabulario (11 sep 2026) ────────────────────────────────
  // Los prompts enumeran en prosa listas que el código también conoce. Hasta
  // hoy solo los alérgenos y STEP_PARTS estaban atados; las demás derivaban:
  // el mismo día se encontraron TRES versiones de la lista de bases en este
  // fichero, "cuscús" con tilde en una y "cuscus" en otra, y un prompt que
  // describía el electrodoméstico con etiquetas ("Olla rápida") cuando el
  // cliente le manda el id ("olla_express"). Cada test de aquí abajo hace que
  // esa deriva rompa la suite en vez de descubrirse a mano meses después.

  it("el panel enumera exactamente el dominio de cada campo de CAMPOS", () => {
    // El bloque "Campos y sus valores permitidos" es una vista de
    // notepadFields.js#CAMPOS: mismo id, mismos valores, mismo orden.
    const enPanel = ["freqs", "base", "cocina", "tecnica", "salsa", "esfuerzo"];
    for (const id of enPanel) {
      const campo = CAMPOS.find((c) => c.id === id);
      expect(campo, `CAMPOS no tiene "${id}"`).toBeDefined();
      expect(Array.isArray(campo.dominio), `"${id}" no tiene dominio cerrado`).toBe(true);
      expect(SYSTEM_PROMPTS.panel).toContain(`- "${id}": ${campo.dominio.join(", ")}`);
    }
  });

  it("todo campo que el panel promete existe en CAMPOS", () => {
    // La dirección contraria: si el prompt anuncia un campo que el parser no
    // conoce, el modelo lo emitirá y se perderá en silencio.
    // Solo el párrafo pegado al encabezado: el prompt sigue con "CÓMO SE
    // CONTESTA", que describe el sobre de la respuesta ("propuestas"…) con la
    // misma sintaxis `- "x":` y NO son campos de la libreta.
    const bloque = (SYSTEM_PROMPTS.panel.split("Campos y sus valores permitidos")[1] ?? "").split("\n\n")[0];
    const ids = [...bloque.matchAll(/^- "([a-z_]+)":/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      expect(CAMPOS.some((c) => c.id === id), `el panel promete "${id}" y CAMPOS no lo tiene`).toBe(true);
    }
  });

  it("el planificador enumera las bases que tienen hidrato, y solo esas, en las dos reglas", () => {
    // No es MAIN_BASES a secas: `legumbre` es base (olla) pero su carbType es
    // null —la repetición de legumbre la vigila la regla 13, no la 9— y por
    // eso NO se le nombra al modelo como base de hidrato. La lista correcta es
    // la que sale de CARB_TYPE_BY_BASE, y aparece dos veces (regla del mismo
    // día y schoolCarbsToAvoid). Ambas tienen que ser idénticas: aquí es donde
    // convivían "cuscus" y "cuscús".
    const conHidrato = MAIN_BASES.filter((b) => CARB_TYPE_BY_BASE[b] != null);
    const literal = `(${conHidrato.join("/")})`;
    const veces = SYSTEM_PROMPTS.planner.split(literal).length - 1;
    expect(veces, `esperaba ${literal} dos veces en el prompt del planificador`).toBe(2);
    // Y la base sin hidrato no se cuela en ninguna de las dos.
    expect(SYSTEM_PROMPTS.planner).not.toMatch(/\([a-z/]*legumbre[a-z/]*\)/);
  });

  it("structure-recipe nombra los electrodomésticos por su id, el que manda el cliente", () => {
    // userRecipes.js manda `appliance: requiredAppliances[0]`, o sea el id
    // ("olla_express"), no la etiqueta ("Olla exprés"). Si el prompt describe
    // etiquetas, el modelo tiene que adivinar el mapeo.
    for (const id of Object.keys(APPLIANCE_LABELS)) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(id);
    }
  });

  it("no prompt carries an unresolved template placeholder", () => {
    for (const [task, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      expect(prompt, `${task} has an unresolved \${...}`).not.toMatch(/\$\{/);
    }
  });
});
