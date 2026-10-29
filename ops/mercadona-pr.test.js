import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";

/**
 * mercadona-sync.yml deja de empujar a staging: abre un PR con el token de una App (el de
 * GITHUB_TOKEN no lanzaría `tests` ni `revisor`) y arma la fusión automática. Esta prueba fija lo
 * que no puede cambiar sin que se note: qué App, con qué permisos, en qué orden y que ninguna
 * orden de GitHub del camino del PR use el token de Actions. La deploy key sigue solo como plan B
 * hasta el paso 7 de Pablo (borrarla), y entonces se quita ese camino en otro PR.
 */
const RAIZ = resolve(import.meta.dirname, "..");
const FICHERO = join(RAIZ, ".github", "workflows", "mercadona-sync.yml");

const texto = () => readFileSync(FICHERO, "utf8");
const wf = () => parseDocument(texto()).toJS() ?? {};
const trabajo = () => wf().jobs.sync;
const pasos = () => trabajo().steps;
const indice = (f) => pasos().findIndex(f);
const pasoToken = () => pasos().find((p) => String(p.uses ?? "").startsWith("actions/create-github-app-token@"));
const pasoCommit = () => pasos().find((p) => /gh pr create/.test(p.run ?? ""));

describe("mercadona-sync abre un PR con una App", () => {
  it("saca el token de la App homenu-dependabot-merge, fijado por SHA y con permisos mínimos", () => {
    const p = pasoToken();
    expect(p, "falta el paso actions/create-github-app-token").toBeDefined();
    expect(p.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}\b/);
    expect(p.with["app-id"]).toBe("${{ vars.DEPENDABOT_APP_ID }}");
    expect(p.with["private-key"]).toBe("${{ secrets.DEPENDABOT_APP_KEY }}");
    expect(p.with.owner).toBe("pabloam89");
    expect(p.with.repositories).toBe("MenuPlan");
    const permisos = Object.keys(p.with).filter((k) => k.startsWith("permission-")).sort();
    expect(permisos, "ni uno más: sin workflows ni administración").toEqual(["permission-contents", "permission-pull-requests"]);
    expect(p.with["permission-contents"]).toBe("write");
    expect(p.with["permission-pull-requests"]).toBe("write");
  });

  it("el token se pide después de instalar y de correr los scripts del repo, y justo antes del commit", () => {
    const iToken = indice((p) => p.uses?.startsWith("actions/create-github-app-token@"));
    const iInstalar = indice((p) => /npm ci/.test(p.run ?? ""));
    const iScripts = indice((p) => /build-coste/.test(p.run ?? ""));
    const iCommit = indice((p) => /gh pr create/.test(p.run ?? ""));
    expect(iToken).toBeGreaterThan(iInstalar);
    expect(iToken).toBeGreaterThan(iScripts);
    expect(iCommit).toBeGreaterThan(iToken);
  });

  it("abre el PR a staging con el token de la App, no con el de Actions", () => {
    const p = pasoCommit();
    expect(p.run).toMatch(/gh pr create[^\n]*--base staging|--base staging/);
    expect(p.env.APP_TOKEN).toMatch(/steps\.\w+\.outputs\.token/);
    expect(p.run).toMatch(/GH_TOKEN="\$APP_TOKEN" gh pr create/);
    expect(p.run).toMatch(/GH_TOKEN="\$APP_TOKEN" gh pr merge --auto --squash/);
    expect(p.run, "la rama sube con el token de la App: el push de Actions no lanza `tests`").toMatch(/x-access-token:\$\{?APP_TOKEN/);
  });

  it("arma la fusión automática y, si el repo no la permite, falla en alto sin dejar el PR sin avisar", () => {
    const run = pasoCommit().run;
    expect(run).toMatch(/allow_auto_merge/);
    expect(run).toMatch(/::error::[^\n]*(auto-merge|fusión automática)/);
    expect(run.indexOf("allow_auto_merge")).toBeGreaterThan(run.indexOf("gh pr create"));
    expect(run).toMatch(/exit 1/);
  });

  it("conserva las salvaguardas: un solo commit y solo los dos ficheros del catálogo", () => {
    const run = texto();
    expect(run).toMatch(/rev-list --count origin\/staging\.\.HEAD/);
    expect(run).toContain("public/store/mercadona.json");
    expect(run).toContain("src/data/derived/recipeCoste.json");
  });

  it("el cuerpo del PR lleva las secciones que pide el juez y no cuenta detalles de seguridad", () => {
    const run = pasoCommit().run;
    for (const s of ["## Evidence", "## Decisions", "## Not verified"]) expect(run).toContain(s);
  });

  it("el plan B avisa siempre con ::warning:: antes de usar la deploy key o el token de Actions", () => {
    const b = pasos().find((p) => /Plan B/.test(p.name ?? ""));
    expect(b.run.split("\n")[0]).toMatch(/^echo "::warning::/);
    expect(b.run.indexOf("::warning::")).toBeLessThan(b.run.indexOf("git push"));
  });

  it("nunca hereda todos los secretos ni escribe ninguno", () => {
    expect(texto()).not.toMatch(/secrets:\s*inherit/);
    expect(texto()).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it("solo el paso del PR (y el plan B) ven la clave de la App o la deploy key; ni `npm ci` ni los scripts", () => {
    const iInstalar = indice((p) => /npm ci/.test(p.run ?? ""));
    for (const p of pasos().slice(0, iInstalar + 3)) {
      expect(JSON.stringify(p), `paso «${p.name ?? p.uses ?? p.run}»`).not.toMatch(/DEPENDABOT_APP_KEY|MERCADONA_DEPLOY_KEY/);
    }
  });

  it("el environment sigue siendo mercadona-sync (solo staging)", () => {
    expect(trabajo().environment).toBe("mercadona-sync");
  });
});
