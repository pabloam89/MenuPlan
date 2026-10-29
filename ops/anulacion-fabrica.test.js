import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";

/**
 * senal-review.yml y anulacion.yml no deciden nada por sí mismos: llaman a los reutilizables de la
 * Fábrica (factory-am89/fabrica), donde vive la regla. Esta prueba fija lo que no puede cambiar sin que
 * se note: que llaman a un sha y no a una rama, que anulacion.yml despierta tras la señal de este repo,
 * que pasa el slug de la App revisora propia y que pasa por nombre exactamente los dos secretos que la
 * anulación declara (REVISOR_CLIENT_ID, REVISOR_APP_KEY), nunca `secrets: inherit`. La señal no recibe
 * ningún secreto.
 */
const RAIZ = resolve(import.meta.dirname, "..");
const DIR = join(RAIZ, ".github", "workflows");
const SHA = "60a7008c68629aedde441a9ee27e68f6b7e0c1b9";

const leer = (f) => (existsSync(join(DIR, f)) ? readFileSync(join(DIR, f), "utf8") : "");
const wf = (f) => parseDocument(leer(f)).toJS() ?? {};
const trabajo = (f) => Object.values(wf(f).jobs ?? {})[0] ?? {};

describe("senal-review.yml llama a la señal de la Fábrica", () => {
  const F = "senal-review.yml";
  it("existe", () => expect(existsSync(join(DIR, F)), F).toBe(true));

  it("se llama senal-review y se despierta solo con pull_request_review enviada", () => {
    expect(wf(F).name).toBe("senal-review");
    const on = wf(F).on ?? {};
    expect(Object.keys(on)).toEqual(["pull_request_review"]);
    expect(on.pull_request_review.types).toEqual(["submitted"]);
  });

  it("un solo trabajo que llama a la Fábrica fijada a un sha, sin secretos ni permisos", () => {
    expect(Object.keys(wf(F).jobs ?? {})).toHaveLength(1);
    expect(trabajo(F).uses).toBe(`factory-am89/fabrica/.github/workflows/senal-review.yml@${SHA}`);
    expect(trabajo(F).steps, "un trabajo que llama no tiene pasos").toBeUndefined();
    expect(trabajo(F).secrets, "la señal no usa credenciales").toBeUndefined();
    expect(trabajo(F).with).toBeUndefined();
    expect(wf(F).permissions).toEqual({});
    expect(leer(F)).not.toMatch(/inherit/);
  });
});

describe("anulacion.yml llama a la anulación de la Fábrica", () => {
  const F = "anulacion.yml";
  it("existe", () => expect(existsSync(join(DIR, F)), F).toBe(true));

  it("se despierta solo con workflow_run tras senal-review", () => {
    const on = wf(F).on ?? {};
    expect(Object.keys(on)).toEqual(["workflow_run"]);
    expect(on.workflow_run.workflows).toEqual(["senal-review"]);
    expect(on.workflow_run.types).toEqual(["completed"]);
  });

  it("un solo trabajo que llama a la Fábrica fijada a un sha, no a una rama", () => {
    expect(Object.keys(wf(F).jobs ?? {})).toHaveLength(1);
    expect(trabajo(F).uses).toBe(`factory-am89/fabrica/.github/workflows/anulacion.yml@${SHA}`);
    expect(trabajo(F).uses).toMatch(/@[0-9a-f]{40}$/);
    expect(trabajo(F).steps, "un trabajo que llama no tiene pasos").toBeUndefined();
  });

  it("pasa solo el slug de la App revisora propia", () => {
    expect(trabajo(F).with).toEqual({ "revisor-app-slug": "homenu-revisor" });
  });

  it("pasa por nombre exactamente los dos secretos de la anulación, nunca inherit", () => {
    const secretos = trabajo(F).secrets;
    expect(secretos, "secrets: inherit entregaría todos los secretos del repo a otro repo").not.toBe("inherit");
    expect(Object.keys(secretos ?? {}).sort()).toEqual(["REVISOR_APP_KEY", "REVISOR_CLIENT_ID"]);
    for (const [nombre, valor] of Object.entries(secretos ?? {})) expect(valor).toBe("${{ secrets." + nombre + " }}");
    expect(leer(F)).not.toMatch(/inherit/);
  });

  it("da solo lectura de contenido: un workflow llamado no puede subir los permisos del llamador", () => {
    expect(wf(F).permissions).toEqual({ contents: "read" });
  });
});
