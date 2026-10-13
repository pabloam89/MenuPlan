import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_DECISIONES, RUTA_DOC, calcular, documento, fallosDeCuentas, fallosDeDecisiones, fallosDeDudas, fallosDeNormas } from "../scripts/lib/inventarioVertical.mjs";

/**
 * El inventario vertical/horizontal (#710, parte de #652). La instantánea de docs/ops/INVENTARIO-VERTICAL.md NO se
 * compara con el repo de hoy a propósito: sus cifras cambian con cada PR ajeno y el test fallaría a todas las sesiones.
 * Lo que sí se vigila: que las cuentas cuadren, que las decisiones a mano apunten a piezas que existen, y que cada duda
 * lleve su razón. Cada comprobación es una función pura que se prueba con datos buenos y con datos rotos (un test que
 * nunca ha fallado no demuestra nada). Cero dudas es un resultado válido: es el objetivo del programa.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const d = calcular(RAIZ);
const decisiones = JSON.parse(readFileSync(join(RAIZ, RUTA_DECISIONES), "utf8"));
const existe = (ruta) => existsSync(join(RAIZ, ruta));
const entidades = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8")).entities.map((e) => e.id);

describe("el inventario vertical, sobre el repo de hoy", () => {
  it("en cada capa, horizontal + vertical + duda suman el total", () => {
    expect(fallosDeCuentas(d.filas)).toEqual([]);
  });

  it("las normas verticales son todas verticales y las horizontales ninguna", () => {
    expect(fallosDeNormas(d.filas)).toEqual([]);
  });

  it("cada duda lleva capa, id y una razón con sentido (vale también con cero dudas)", () => {
    expect(fallosDeDudas(d.dudosos)).toEqual([]);
  });

  it("las decisiones a mano apuntan a piezas que existen (un id que desaparece falla)", () => {
    expect(fallosDeDecisiones(decisiones, { existe, entidades })).toEqual([]);
  });

  it("el documento se escribe entero, con una tabla por capa y la propuesta de PR", () => {
    const md = documento(d, "2026-01-01");
    for (const f of d.filas) expect(md).toContain(`| ${f.unidad} | ${f.total} | ${f.horizontal} | ${f.vertical} | ${f.duda} |`);
    expect(md).toContain("## Propuesta de orden de PR");
    expect(md).toContain("## Dudas de clasificación que solo puede resolver Pablo");
  });

  it("el documento se escribe también con cero dudas", () => {
    const sinDudas = { ...d, dudosos: [], filas: d.filas.map((f) => ({ ...f, horizontal: f.total, vertical: 0, duda: 0 })) };
    expect(() => documento(sinDudas, "2026-01-01")).not.toThrow();
  });

  it("la instantánea existe y dice de dónde sale", () => {
    expect(existsSync(join(RAIZ, RUTA_DOC))).toBe(true);
    const md = readFileSync(join(RAIZ, RUTA_DOC), "utf8");
    expect(md).toContain("npm run inventario-vertical -- --escribir");
    expect(md).toContain("## Resumen por capa");
  });
});

describe("las comprobaciones, con datos rotos (casos negativos)", () => {
  const fila = (unidad, total, horizontal, vertical, duda) => ({ unidad, total, horizontal, vertical, duda });

  it("una capa que no suma el total se detecta; una que suma, no", () => {
    expect(fallosDeCuentas([fila("a", 10, 5, 3, 2)])).toEqual([]);
    expect(fallosDeCuentas([fila("a", 10, 5, 3, 1)])).toHaveLength(1);
  });

  it("una norma vertical en el registro horizontal, o una vertical sin contar, se detecta", () => {
    const bien = [fila("normas horizontales (x)", 5, 5, 0, 0), fila("normas verticales (y)", 3, 0, 3, 0)];
    expect(fallosDeNormas(bien)).toEqual([]);
    expect(fallosDeNormas([fila("normas horizontales (x)", 5, 4, 1, 0), bien[1]])).toHaveLength(1);
    expect(fallosDeNormas([bien[0], fila("normas verticales (y)", 3, 1, 2, 0)])).toHaveLength(1);
    expect(fallosDeNormas([])).toHaveLength(1);
  });

  it("una duda sin razón, con razón corta, sin capa o sin id se detecta; cero dudas, no", () => {
    expect(fallosDeDudas([])).toEqual([]);
    expect(fallosDeDudas([{ capa: "normas", id: "x", razon: "porque el texto nombra el proyecto" }])).toEqual([]);
    expect(fallosDeDudas([{ capa: "normas", id: "x" }])).toHaveLength(1);
    expect(fallosDeDudas([{ capa: "normas", id: "x", razon: "corta" }])).toHaveLength(1);
    expect(fallosDeDudas([{ id: "x", razon: "una razón suficientemente larga" }])).toHaveLength(1);
    expect(fallosDeDudas([{ capa: "normas", razon: "una razón suficientemente larga" }])).toHaveLength(1);
  });

  it("una decisión que apunta a un principio, entidad o agente que no existe se detecta", () => {
    const dec = { principios_verticales: { p1: "x" }, entidades_verticales_genericas: { e1: "x" }, agentes_dudosos: { a1: "x" } };
    const todo = { existe: () => true, entidades: ["e1"] };
    expect(fallosDeDecisiones(dec, todo)).toEqual([]);
    expect(fallosDeDecisiones(dec, { ...todo, existe: (r) => !r.includes("principios/p1") })).toEqual(["principio p1"]);
    expect(fallosDeDecisiones(dec, { ...todo, entidades: [] })).toEqual(["entidad e1"]);
    expect(fallosDeDecisiones(dec, { ...todo, existe: (r) => !r.includes("agents/a1") })).toEqual(["agente a1"]);
  });
});
