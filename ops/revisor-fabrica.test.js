import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";

/**
 * .github/workflows/revisor.yml no juzga nada por sí mismo: llama al juez reutilizable de la
 * Fábrica (factory-am89/fabrica) y le pasa lo que ese juez exige. Esta prueba fija lo que no
 * puede cambiar sin que se note: que llama a un sha y no a una rama (una rama movería el juez
 * sin que nadie lo revise), que solo corre para PR a staging, que pasa el slug de la App
 * revisora propia y que los secretos (CLAUDE_CODE_OAUTH_TOKEN, REVISOR_CLIENT_ID, REVISOR_APP_KEY) los hereda del environment `revisor`.
 */
const RAIZ = resolve(import.meta.dirname, "..");
const FICHERO = join(RAIZ, ".github", "workflows", "revisor.yml");

const leer = () => (existsSync(FICHERO) ? readFileSync(FICHERO, "utf8") : "");
const wf = () => parseDocument(leer()).toJS() ?? {};
const trabajo = () => Object.values(wf().jobs ?? {})[0] ?? {};

describe("revisor.yml llama al juez de la Fábrica", () => {
  it("existe", () => expect(existsSync(FICHERO), ".github/workflows/revisor.yml").toBe(true));

  it("se despierta solo con pull_request_target sobre staging", () => {
    const on = wf().on ?? {};
    expect(Object.keys(on)).toEqual(["pull_request_target"]);
    expect(on.pull_request_target.branches).toEqual(["staging"]);
  });

  it("tiene un solo trabajo, que llama al workflow reutilizable de la Fábrica fijado a un sha", () => {
    expect(Object.keys(wf().jobs ?? {})).toHaveLength(1);
    expect(trabajo().uses).toMatch(/^factory-am89\/fabrica\/\.github\/workflows\/revisor\.yml@[0-9a-f]{40}$/);
    expect(trabajo().steps, "un trabajo que llama no tiene pasos").toBeUndefined();
  });

  it("pasa los bots de HoMenu y el slug de la App revisora propia", () => {
    const con = trabajo().with ?? {};
    expect(con.bots).toBe("homenu-sesiones,homenu-dependabot-merge");
    expect(con["revisor-app-slug"]).toBe("homenu-revisor");
    expect(Object.keys(con).sort()).toEqual(["bots", "revisor-app-slug"]);
  });

  it("hereda los secretos (los resuelve el environment `revisor` del juez) y no escribe ninguno", () => {
    expect(trabajo().secrets).toBe("inherit");
    expect(leer()).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("da solo lectura: un workflow llamado no puede subir los permisos del llamador", () => {
    expect(wf().permissions).toEqual({ contents: "read", "pull-requests": "read", checks: "read" });
  });
});
