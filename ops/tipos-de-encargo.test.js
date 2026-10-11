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
const inicio = md.indexOf("## 3. Qué pipeline");
if (inicio < 0) throw new Error("orquestar.md ya no tiene la sección «## 3. Qué pipeline»: actualiza este test");
const tabla = md.slice(inicio).split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| Acción") && !l.startsWith("|---"))
  .map((l) => { const [, accion, pipeline] = l.split("|").map((x) => x.trim()); return { accion, pipeline }; });

// La tabla, paso a paso: quita las notas entre paréntesis, separa por «→» y, en cada paso, lo que entra siempre,
// lo opcional ([`agente` si …]) y lo especial (sesión principal, constructor). Un paso en cursiva es el cierre.
const ESPECIAL_MD = [[/sesión principal/, "sesion"], [/constructores por dominio/, "constructores"], [/constructor(?!es)/, "constructor"]];
const deTabla = (pipeline) => {
  const pasos = pipeline.replace(/\([^)]*\)/g, "").split("→").map((x) => x.trim());
  const cierre = pasos.find((p) => p.startsWith("*"))?.replace(/\*/g, "") ?? null;
  const reales = (t) => [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((n) => AGENTES.includes(n));
  return {
    cierre,
    pasos: pasos.filter((p) => !p.startsWith("*")).map((p) => ({
      siempre: [...reales(p.replace(/\[[^\]]*\]/g, "")), ...ESPECIAL_MD.filter(([r]) => r.test(p)).map(([, n]) => n)].sort(),
      opcional: [...p.matchAll(/\[([^\]]*)\]/g)].map((m) => reales(m[1])[0] + " si " + m[1].split(" si ")[1]).sort(),
    })),
  };
};
const deJson = (t) => ({
  cierre: t.cierra_con ?? null,
  pasos: t.pasos.map((p) => ({
    siempre: [...(p.agentes ?? [])].sort(),
    opcional: (p.opcional ?? []).map((o) => `${o.agente} si ${o.si}`).sort(),
  })),
});

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

  it("en cada acción, los pasos, lo paralelo, lo opcional (con su condición) y el cierre son los de la tabla", () => {
    DATOS.tipos.forEach((t, i) => {
      expect(deJson(t), t.id).toEqual(deTabla(tabla[i].pipeline));
    });
  });
});
