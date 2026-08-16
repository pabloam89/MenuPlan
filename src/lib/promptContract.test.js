import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPTS, PROMPT_ALLERGEN_IDS } from "../../api/_prompts.js";
import { EU_ALLERGENS } from "./allergens.js";

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

  it("no prompt carries an unresolved template placeholder", () => {
    for (const [task, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      expect(prompt, `${task} has an unresolved \${...}`).not.toMatch(/\$\{/);
    }
  });
});
