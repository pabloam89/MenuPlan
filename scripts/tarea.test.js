import { describe, expect, it } from "vitest";

import { elegir, leerWorktrees, motivosParaNo } from "./retirar.mjs";
import { leerRama } from "./tarea.mjs";

describe("tarea: el nombre de la rama", () => {
  it.each(["datos/descartes", "ops/oficio", "fix/iconos-alergenos"])("acepta %s", (r) => expect(leerRama(r).rama).toBe(r));
  it("saca el nombre de la carpeta", () => expect(leerRama("datos/descartes").nombre).toBe("descartes"));
  it.each(["descartes", "Datos/Descartes", "datos/con espacio", "cosas/x", "datos/", "staging", "../fuera"])("rechaza %s", (r) =>
    expect(leerRama(r).error).toBeTruthy());
});

describe("retirar", () => {
  const porcelana = [
    "worktree C:/dev/MenuPlan\nHEAD 1\nbranch refs/heads/staging",
    "worktree C:/dev/MenuPlan-descartes\nHEAD 2\nbranch refs/heads/datos/descartes",
    "worktree C:/dev/MenuPlan-suelto\nHEAD 3\ndetached",
  ].join("\n\n");
  const wts = leerWorktrees(porcelana);

  it("lee los worktrees", () =>
    expect(wts).toEqual([
      { ruta: "C:/dev/MenuPlan", rama: "staging" },
      { ruta: "C:/dev/MenuPlan-descartes", rama: "datos/descartes" },
      { ruta: "C:/dev/MenuPlan-suelto", rama: null },
    ]));

  it.each(["descartes", "MenuPlan-descartes", "datos/descartes"])("encuentra «%s»", (t) => expect(elegir(wts, t)).toHaveLength(1));

  const base = { principal: "C:/dev/MenuPlan", ruta: "C:/dev/MenuPlan-descartes", sucios: [], sesiones: [], sinSubir: [] };
  it("limpio y subido: se puede", () => expect(motivosParaNo(base)).toEqual([]));
  it("la carpeta principal, nunca", () => expect(motivosParaNo({ ...base, ruta: "c:\\dev\\menuplan" })).toHaveLength(1));
  it("con cambios sin commitear, no", () => expect(motivosParaNo({ ...base, sucios: [" M src/App.jsx"] })[0]).toMatch(/sin commitear/));
  it("con commits sin subir, no", () => expect(motivosParaNo({ ...base, sinSubir: ["abc fix"] })[0]).toMatch(/no están en GitHub/));
  it("con una sesión activa dentro, no", () => expect(motivosParaNo({ ...base, sesiones: [{ id: "x" }] })[0]).toMatch(/sesión/));
});
