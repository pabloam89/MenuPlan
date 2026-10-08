import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resumen } from "./migraciones.mjs";
import { activas, apuntar, enCarpeta, listar, quitar, tocar } from "./sesiones.mjs";

describe("registro de sesiones", () => {
  const dir = mkdtempSync(join(tmpdir(), "sesiones-"));
  const ID = "abc123-def";

  it("apunta, toca y quita", () => {
    apuntar(dir, { id: ID, cwd: "C:\\dev\\MenuPlan-x", rama: "datos/x" });
    tocar(dir, ID);
    expect(listar(dir).map((s) => s.rama)).toEqual(["datos/x"]);
    expect(enCarpeta(listar(dir), "c:/dev/MenuPlan-x")).toHaveLength(1);
    quitar(dir, ID);
    expect(listar(dir)).toEqual([]);
  });

  it("una sesión sin actividad en horas deja de contar como activa, y caduca", () => {
    const hace = (h) => new Date(Date.now() - h * 36e5).toISOString();
    writeFileSync(join(dir, "vieja-1234.json"), JSON.stringify({ id: "vieja-1234", cwd: "C:/a", rama: "a", inicio: hace(10), ultima: hace(10) }));
    writeFileSync(join(dir, "muerta-1234.json"), JSON.stringify({ id: "muerta-1234", cwd: "C:/b", rama: "b", inicio: hace(99), ultima: hace(99) }));
    const lista = listar(dir);
    expect(lista.map((s) => s.id)).toEqual(["vieja-1234"]);
    expect(activas(lista)).toEqual([]);
    expect(readdirSync(dir)).not.toContain("muerta-1234.json");
  });

  it("ignora ids raros (nada de rutas en el nombre del fichero)", () => {
    apuntar(dir, { id: "../../fuera", cwd: "C:/c", rama: "c" });
    expect(readdirSync(dir).some((f) => f.includes("fuera"))).toBe(false);
  });
});

describe("números de migración", () => {
  const staging = ["0084_bot_codigo_alta", "0086_vocabulario_de_la_app"];

  it("el siguiente libre cuenta lo de fuera de staging", () => {
    const r = resumen(staging, [{ nombre: "0087_persona_vocab", donde: "PR #90 (datos/x)" }]);
    expect(r).toMatchObject({ ultimo: 86, siguiente: "0088", choques: [] });
    expect(r.ocupados).toEqual([{ nombre: "0087_persona_vocab", donde: ["PR #90 (datos/x)"] }]);
  });

  it("la misma migración en un worktree y en su PR no es un choque", () => {
    const r = resumen(staging, [
      { nombre: "0087_a", donde: "datos/a (MenuPlan-a)", ruta: "C:/dev/MenuPlan-a" },
      { nombre: "0087_a", donde: "PR #90 (datos/a)" },
    ]);
    expect(r.choques).toEqual([]);
  });

  it("dos nombres con el mismo número sí, también contra staging", () => {
    expect(resumen(staging, [{ nombre: "0087_a", donde: "x" }, { nombre: "0087_b", donde: "y" }]).choques).toEqual(["0087: 0087_a + 0087_b"]);
    expect(resumen(staging, [{ nombre: "0086_otra", donde: "x" }]).choques).toEqual(["0086: 0086_vocabulario_de_la_app + 0086_otra"]);
  });

  it("lo de mi propia carpeta no sale como «de otro»", () => {
    const r = resumen(staging, [{ nombre: "0087_mia", donde: "yo", ruta: "C:/dev/MenuPlan-yo" }], "c:/dev/menuplan-yo");
    expect(r.ocupados).toEqual([]);
    expect(r.siguiente).toBe("0088");
  });
});
