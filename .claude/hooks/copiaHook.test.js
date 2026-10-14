import { afterAll, describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { avisoDeCopia, avisosDeCopiaEnArranque, carpetasHuerfanas, lineaDeHuerfanas, rutaCopiaDelHook, tieneGitDeCarpeta } from "./copiaHook.mjs";

// #725: el arreglo de la limpieza vive en el repo, pero lo que se ejecuta es la
// copia de ~/.claude/hooks/. Sin este aviso, un arreglo fusionado no llega.
describe("copiaHook: la copia de usuario del hook de limpieza", () => {
  const repo = "export const a = 1;\nexport const b = 2;\n";

  it("con la copia distinta, avisa con una línea campo: valor", () => {
    const aviso = avisoDeCopia({ repo, copia: "export const a = 1;\n", ruta: "C:\\u\\.claude\\hooks\\limpiar-worktrees.mjs" });
    expect(aviso).toMatch(/^limpieza-copia: difiere/);
    expect(aviso).toContain("C:\\u\\.claude\\hooks\\limpiar-worktrees.mjs");
  });
  it("con la copia igual, no dice nada", () => expect(avisoDeCopia({ repo, copia: repo })).toBeNull());
  it("los saltos de línea de Windows y el espacio final no cuentan", () =>
    expect(avisoDeCopia({ repo, copia: repo.replace(/\n/g, "\r\n") + "\r\n\r\n" })).toBeNull());
  it("sin copia en el perfil, lo dice", () => expect(avisoDeCopia({ repo, copia: null })).toMatch(/^limpieza-copia: falta/));
  it("sin la del repo no se acusa a nadie", () => expect(avisoDeCopia({ repo: null, copia: "x" })).toBeNull());

  it("cuenta las huérfanas solo cuando las hay", () => {
    expect(lineaDeHuerfanas(0)).toBeNull();
    expect(lineaDeHuerfanas(4)).toMatch(/^huerfanas: 4 /);
  });
  it("la copia vive en el perfil de usuario", () =>
    expect(rutaCopiaDelHook("C:\\Users\\pablo")).toMatch(/pablo.*\.claude.*hooks.*limpiar-worktrees\.mjs$/));
});

// El punto ciego del detectivo (#725): el contador solo miraba claude-limpieza.json.
// Una hermana MenuPlan-* que git soltó sin que el registro la anotara no se contaba.
describe("carpetasHuerfanas: también las hermanas sin registro", () => {
  const todas = () => true;
  const norm = (rs) => rs.map((r) => r.replaceAll("\\", "/")).sort();

  it("cuenta una hermana MenuPlan-* sin registro, sin worktree vivo y sin .git de carpeta", () => {
    const r = carpetasHuerfanas({ pendientes: [], hermanas: ["C:/dev/MenuPlan-vieja"], existe: todas, esClon: () => false });
    expect(norm(r)).toEqual(["C:/dev/MenuPlan-vieja"]);
  });
  it("MenuPlan-panel-lectura (clon con .git propio) NO cuenta", () => {
    const r = carpetasHuerfanas({ hermanas: ["C:/dev/MenuPlan-panel-lectura"], existe: todas, esClon: (d) => d.endsWith("panel-lectura") });
    expect(r).toEqual([]);
  });
  it("un worktree vivo no cuenta, aunque esté en las hermanas", () => {
    const vivos = new Set(["c:/dev/menuplan-viva"]);
    expect(carpetasHuerfanas({ hermanas: ["C:\\dev\\MenuPlan-viva"], vivos, existe: todas, esClon: () => false })).toEqual([]);
  });
  it("lo del registro cuenta una sola vez aunque también salga como hermana", () => {
    const r = carpetasHuerfanas({ pendientes: [{ dir: "C:/dev/MenuPlan-a" }], hermanas: ["C:/dev/MenuPlan-a", "C:/dev/MenuPlan-b"], existe: todas, esClon: () => false });
    expect(r).toHaveLength(2);
  });
  it("lo apuntado cuya carpeta ya no existe no cuenta", () => {
    expect(carpetasHuerfanas({ pendientes: [{ dir: "C:/dev/MenuPlan-a" }], existe: () => false, esClon: () => false })).toEqual([]);
  });
  it("lo que no se llama MenuPlan-* no es hermana nuestra", () => {
    expect(carpetasHuerfanas({ hermanas: ["C:/dev/otra-cosa"], existe: todas, esClon: () => false })).toEqual([]);
  });
});

describe("tieneGitDeCarpeta: con carpetas de verdad", () => {
  const base = mkdtempSync(join(tmpdir(), "copiahook-"));
  afterAll(() => rmSync(base, { recursive: true, force: true }));
  it("distingue clon (.git carpeta), fichero .git de worktree y nada", () => {
    mkdirSync(join(base, "clon", ".git"), { recursive: true });
    mkdirSync(join(base, "vacia"), { recursive: true });
    expect(tieneGitDeCarpeta(join(base, "clon"))).toBe(true);
    expect(tieneGitDeCarpeta(join(base, "vacia"))).toBe(false);
    expect(tieneGitDeCarpeta(join(base, "no-existe"))).toBe(false);
  });
});

// El cableado de arranque.mjs: de dónde sale la referencia y cuándo no se mira.
describe("avisosDeCopiaEnArranque: el cableado del arranque", () => {
  const ficheros = { "/repo/limpiar.mjs": "A", "/perfil/limpiar.mjs": "B" };
  const base = { rutaRepo: "/repo/limpiar.mjs", ruta: "/perfil/limpiar.mjs", leer: (r) => ficheros[r], existe: (r) => r in ficheros };

  it("en la nube no se mira nada", () => expect(avisosDeCopiaEnArranque({ ...base, nube: true, deGit: "A" })).toEqual([]));
  it("usa la de git como referencia", () => {
    expect(avisosDeCopiaEnArranque({ ...base, nube: false, deGit: "B" })).toEqual([]); // copia B = git B
    expect(avisosDeCopiaEnArranque({ ...base, nube: false, deGit: "A" })[0]).toMatch(/^limpieza-copia: difiere/);
  });
  it("si git no la da, cae al fichero del disco", () => {
    expect(avisosDeCopiaEnArranque({ ...base, nube: false, deGit: null })[0]).toMatch(/^limpieza-copia: difiere/); // disco A != copia B
    expect(avisosDeCopiaEnArranque({ ...base, nube: false, deGit: null, leer: () => "B" })).toEqual([]);
  });
  it("sin referencia en ningún sitio no acusa a nadie", () => {
    expect(avisosDeCopiaEnArranque({ ...base, nube: false, deGit: null, existe: (r) => r === base.ruta })).toEqual([]);
  });
  it("un fallo de lectura se dice, no se calla", () => {
    const r = avisosDeCopiaEnArranque({ ...base, nube: false, deGit: "A", leer: () => { throw new Error("EPERM"); } });
    expect(r[0]).toMatch(/^limpieza-copia: no he podido compararla \(EPERM\)/);
  });
});
