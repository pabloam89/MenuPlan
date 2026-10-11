import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Los tipos de encargo (ops/tipos-de-encargo.json) y la tabla «Qué pipeline
 * según la acción» de /orquestar dicen lo mismo: mismas acciones, mismo orden
 * y los mismos agentes en cada una. El JSON es el dato (lo lee el panel de la
 * factoría); la tabla, su lectura para personas. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = JSON.parse(readFileSync(join(RAIZ, "ops", "tipos-de-encargo.json"), "utf8"));
const AGENTES = readdirSync(join(RAIZ, ".claude", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
const ESPECIALES = Object.keys(DATOS.especiales);

const md = readFileSync(join(RAIZ, ".claude", "commands", "orquestar.md"), "utf8");
const tabla = md.slice(md.indexOf("## 3. Qué pipeline")).split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| Acción") && !l.startsWith("|---"))
  .map((l) => { const [, accion, pipeline] = l.split("|").map((x) => x.trim()); return { accion, pipeline }; });

const nombres = (texto) => [...texto.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((n) => AGENTES.includes(n));
// Agentes de un tipo en orden de aparición: de cada paso, los suyos, los opcionales y los que nombra la nota.
const agentesDe = (tipo) => tipo.pasos.flatMap((p) => [
  ...(p.agentes || []).filter((a) => AGENTES.includes(a)),
  ...(p.opcional || []).map((o) => o.agente),
  ...((p.nota || "").split(/\W+/).filter((w) => AGENTES.includes(w))),
]);

describe("ops/tipos-de-encargo.json", () => {
  it("tiene la forma esperada y ids únicos", () => {
    expect(DATOS.version).toBe(1);
    const ids = DATOS.tipos.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DATOS.tipos) {
      expect(t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(t.accion.length).toBeGreaterThan(2);
      expect(t.pasos.length).toBeGreaterThan(0);
    }
  });

  it("cada agente nombrado existe en .claude/agents o es uno de los especiales", () => {
    for (const t of DATOS.tipos) {
      for (const p of t.pasos) {
        for (const a of [...(p.agentes || []), ...(p.opcional || []).map((o) => o.agente)]) {
          expect([...AGENTES, ...ESPECIALES], `${t.id}: ${a}`).toContain(a);
        }
        expect((p.agentes || []).length + (p.opcional || []).length, `${t.id}: paso vacío`).toBeGreaterThan(0);
      }
    }
  });

  it("lleva las mismas acciones, en el mismo orden, que la tabla de /orquestar", () => {
    const limpia = (s) => s.replace(/`/g, "");
    expect(DATOS.tipos.map((t) => limpia(t.accion))).toEqual(tabla.map((f) => limpia(f.accion)));
  });

  it("en cada acción, los agentes son los mismos y van en el mismo orden que en la tabla", () => {
    DATOS.tipos.forEach((t, i) => {
      expect(agentesDe(t), t.id).toEqual(nombres(tabla[i].pipeline));
    });
  });
});
