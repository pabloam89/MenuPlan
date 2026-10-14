import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Vigila el workflow del proyecto que sincroniza Mercadona. Vivía en scripts/rulesets.test.js (de la casa):
// lee y nombra ficheros de HoMenu (public/store/, src/data/derived/), y un test de la casa no los lee (#710, PR 6).
// ── mercadona-sync: lo que sale con la deploy key ────────────────────────
describe("mercadona-sync.yml limita lo que empuja la deploy key (#330)", () => {
  const wf = readFileSync(join(RAIZ, ".github/workflows/mercadona-sync.yml"), "utf8");
  it("instala sin scripts", () => {
    expect(wf).toMatch(/run: npm ci --ignore-scripts/);
    expect(wf).not.toMatch(/run: npm ci\s*$/m);
  });
  it("antes de escribir la key comprueba commits y ficheros contra origin/staging", () => {
    const control = wf.indexOf("origin/staging..HEAD");
    const clave = wf.indexOf('printf \'%s\\n\' "$DEPLOY_KEY"');
    const pushToken = wf.indexOf("          git push\n");
    expect(control).toBeGreaterThan(0);
    expect(control).toBeLessThan(clave);
    expect(control).toBeLessThan(pushToken);
    expect(wf).toMatch(/rev-list --count origin\/staging\.\.HEAD\)" -gt 1/);
    expect(wf).toContain("git diff --name-only origin/staging..HEAD");
    expect(wf).toContain("public/store/mercadona.json");
    expect(wf).toContain("src/data/derived/recipeCoste.json");
    expect(wf).toMatch(/exit 1/);
  });
  it("solo esos dos ficheros se añaden al commit", () => {
    expect(wf).toContain("git add public/store/mercadona.json src/data/derived/recipeCoste.json");
  });
});
