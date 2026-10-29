import { describe, it, expect } from "vitest";
import { resumenVitest, fallosTragados, tamano, cuerpo, esTest, primerError, TOPE_LINEAS } from "./prCuerpo.mjs";

describe("prCuerpo: el cuerpo del PR que pide el revisor", () => {
  it("saca las líneas de resumen de vitest, sin colores", () => {
    const salida = "\x1b[32m✓\x1b[39m a.test.js\n Test Files  2 passed (2)\n      Tests  14 passed | 1 failed (15)\n   Duration 3s";
    expect(resumenVitest(salida)).toEqual(["Test Files  2 passed (2)", "Tests  14 passed | 1 failed (15)"]);
  });

  it("ve un fallo tragado en lo añadido, no en lo quitado ni en lo que registra", () => {
    const diff = [
      "+++ b/api/x.js",
      "+  } catch {}",
      "+  await f().catch(() => null);",
      "-  } catch {}",
      "+  await g().catch((e) => console.error(e));",
    ].join("\n");
    const avisos = fallosTragados(diff);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatch(/^api\/x\.js: /);
    // En un test, el catch vacío es el ejemplo de lo que se busca.
    expect(fallosTragados("+++ b/api/x.test.js\n+  } catch {}")).toEqual([]);
  });

  it("dice por qué falla cuando el resumen no lo cuenta", () => {
    expect(primerError("Test Files  1 failed (1)\nError: Cannot find module './prCuerpo.mjs'\n")).toBe("Error: Cannot find module './prCuerpo.mjs'");
    expect(primerError("Tests  3 passed (3)")).toBe("");
  });

  it("mide el tamaño con numstat y avisa si no cabe en una sentada", () => {
    expect(tamano("10\t2\ta.js\n5\t0\tb.js")).toEqual({ ficheros: 2, lineas: 17, grande: false });
    expect(tamano(`${TOPE_LINEAS}\t1\ta.js`).grande).toBe(true);
    expect(tamano("-\t-\timagen.png").lineas).toBe(0);
  });

  it("reconoce los tests del repo", () => {
    expect(esTest("api/_bot/x.test.js")).toBe(true);
    expect(esTest("scripts/lib/x.test.mjs")).toBe(true);
    expect(esTest("api/_bot/x.js")).toBe(false);
  });

  it("el cuerpo lleva cada sección que mira el juez, y dice si el rojo antes no fue rojo", () => {
    const base = {
      ahora: { comando: "npx vitest run a.test.js", salida: "Tests  3 passed (3)", codigo: 0 },
      talla: { ficheros: 2, lineas: 40, grande: false },
    };
    const c = cuerpo({ ...base, antes: { comando: "npx vitest run a.test.js", salida: "Tests  2 failed (3)", codigo: 1 }, refs: "Refs #1" });
    for (const s of ["## What changes", "## Evidence", "## Red before", "## Decisions", "## Not verified", "Refs #1"]) expect(c).toContain(s);
    expect(c).toContain("código 1");
    expect(c).not.toContain("también pasan");
    expect(cuerpo({ ...base, antes: { comando: "x", salida: "Tests  3 passed (3)", codigo: 0 } })).toContain("también pasan");
    expect(cuerpo(base)).toContain("No aplica: el PR no trae tests nuevos.");
  });
});
