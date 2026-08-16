import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STEP_KINDS as API_STEP_KINDS } from "../../api/recipe-steps.js";
import { STEP_KINDS, resolveApplianceSteps } from "./recipeSteps.js";

// Los pasos por electrodoméstico salen de dos sitios que no se ven entre ellos:
// scripts/enrich-recipe-steps.mjs (horneados en el bundle) y /api/recipe-steps
// (runtime, para recetas de usuario). El endpoint se mantiene autocontenido —
// misma decisión que api/_prompts.js — así que su copia de la taxonomía puede
// separarse de la de la app sin que nada falle: los `kind` desconocidos se
// descartan en silencio y el paso pierde su etiqueta. Esto lo pin-ea.

describe("contrato de pasos por electrodoméstico", () => {
  it("la taxonomía del endpoint no se separa de la de la app", () => {
    expect([...API_STEP_KINDS].sort()).toEqual([...STEP_KINDS].sort());
  });

  it("el fichero horneado solo contiene kinds válidos", () => {
    const path = fileURLToPath(new URL("../data/recipeStepsByAppliance.json", import.meta.url));
    const byRecipe = JSON.parse(readFileSync(path, "utf8"));

    for (const [recipeId, appliances] of Object.entries(byRecipe)) {
      for (const [appliance, steps] of Object.entries(appliances)) {
        for (const step of steps) {
          if (typeof step === "string") continue; // formato plano legacy
          if (step.kind == null) continue;
          expect(STEP_KINDS, `${recipeId}/${appliance}: kind "${step.kind}"`).toContain(step.kind);
        }
      }
    }
  });

  it("un `during` que apunta hacia delante degrada a activo en vez de colgar", () => {
    // buildStepDisplay ignora los paralelos sin padre válido, así que dejarlo
    // pasar pintaría un "Mientras tanto" que no cuelga de ningún paso.
    const { rich } = resolveApplianceSteps([
      { text: "Precalentar el horno.", kind: "pasivo", minutes: 10 },
      { text: "Cortar la cebolla.", kind: "paralelo", during: 5 },
    ]);
    expect(rich[1].kind).toBe("activo");
    expect(rich[1].during).toBeUndefined();
  });

  it("acepta el formato plano legacy y no lo pinta como stepper", () => {
    // Redis guarda 90 días de respuestas en string[]: deben seguir leyéndose,
    // pero sin metadatos el stepper se ve peor que la lista numerada.
    const { rich, plain } = resolveApplianceSteps(["Cocer la pasta.", "Escurrir."]);
    expect(rich).toBeNull();
    expect(plain).toEqual(["Cocer la pasta.", "Escurrir."]);
  });

  it("los marcadores no llegan a los pasos planos de fallback", () => {
    // El fallback se pinta tal cual, sin pasar por el resolutor: unas llaves
    // ahí serían visibles para el usuario.
    const { plain } = resolveApplianceSteps([
      { text: "Picar {{Ajo}} y sofreír en {{@Sartén}}.", kind: "prep" },
    ]);
    expect(plain[0]).not.toMatch(/\{\{|\}\}/);
  });
});
