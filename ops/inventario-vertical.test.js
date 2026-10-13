import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_DECISIONES, RUTA_DOC, calcular, documento } from "../scripts/lib/inventarioVertical.mjs";

/**
 * El inventario vertical/horizontal (#710, parte de #652). La instantánea de docs/ops/INVENTARIO-VERTICAL.md NO se
 * compara con el repo de hoy a propósito: sus cifras cambian con cada PR ajeno y el test fallaría a todas las sesiones.
 * Lo que sí se vigila: que las cuentas cuadren, que las decisiones a mano apunten a piezas que existen, y que cada duda
 * lleve su razón.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const d = calcular(RAIZ);
const decisiones = JSON.parse(readFileSync(join(RAIZ, RUTA_DECISIONES), "utf8"));

describe("el inventario vertical", () => {
  it("en cada capa, horizontal + vertical + duda suman el total", () => {
    for (const f of d.filas) expect(f.horizontal + f.vertical + f.duda, f.unidad).toBe(f.total);
  });

  it("las normas verticales son todas verticales y las horizontales ninguna (el cargador común ya las separa)", () => {
    const h = d.filas.find((f) => f.unidad.startsWith("normas horizontales"));
    const v = d.filas.find((f) => f.unidad.startsWith("normas verticales"));
    expect(h.vertical).toBe(0);
    expect(v.vertical).toBe(v.total);
  });

  it("cada duda lleva capa, id y una razón con sentido", () => {
    expect(d.dudosos.length).toBeGreaterThan(0);
    for (const x of d.dudosos) {
      expect(x.capa && x.id, JSON.stringify(x)).toBeTruthy();
      expect(String(x.razon ?? "").length, `${x.capa}/${x.id}: sin razón`).toBeGreaterThan(15);
    }
  });

  it("las decisiones a mano apuntan a piezas que existen (un id que desaparece falla)", () => {
    const ids = () => d.dudosos.map((x) => x.id).concat(d.cifras.principiosVerticales).filter(Boolean);
    const principios = JSON.parse(readFileSync(join(RAIZ, "ops/principios/_catalogo.json"), "utf8"));
    expect(principios).toBeTruthy();
    for (const id of Object.keys(decisiones.principios_verticales)) {
      expect(existsSync(join(RAIZ, `ops/principios/principios/${id}.json`)), `principio ${id}`).toBe(true);
    }
    const entidades = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8")).entities.map((e) => e.id);
    for (const id of Object.keys(decisiones.entidades_verticales_genericas)) expect(entidades, `entidad ${id}`).toContain(id);
    for (const id of Object.keys(decisiones.agentes_dudosos)) expect(existsSync(join(RAIZ, `.claude/agents/${id}.md`)), `agente ${id}`).toBe(true);
    expect(ids().length).toBeGreaterThan(0);
  });

  it("el documento se escribe entero, con una tabla por capa y la propuesta de PR", () => {
    const md = documento(d, "2026-01-01");
    for (const f of d.filas) expect(md).toContain(`| ${f.unidad} | ${f.total} | ${f.horizontal} | ${f.vertical} | ${f.duda} |`);
    expect(md).toContain("## Propuesta de orden de PR");
    expect(md).toContain("## Dudas de clasificación que solo puede resolver Pablo");
  });

  it("la instantánea existe y dice de dónde sale", () => {
    expect(existsSync(join(RAIZ, RUTA_DOC))).toBe(true);
    const md = readFileSync(join(RAIZ, RUTA_DOC), "utf8");
    expect(md).toContain("npm run inventario-vertical -- --escribir");
    expect(md).toContain("## Resumen por capa");
  });
});
