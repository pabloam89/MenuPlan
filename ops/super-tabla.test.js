import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FIN, INICIO, FAMILIES, LEVELS, PROPUESTA_FILAS, SCOPES, bloque, cargar } from "../scripts/super-tabla-entidades.mjs";

/**
 * La súper tabla de entidades (docs/entidades/SUPER-TABLA.md). Vigila que la propuesta cubra
 * exactamente las entidades de ops/entidades.json, que use solo vocabulario cerrado, que lo
 * de nivel meta o template no sea vertical (extensión de N0: regla 1 a 4) y que el bloque
 * del .md sea el generado. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MD = readFileSync(join(RAIZ, "docs/entidades/SUPER-TABLA.md"), "utf8");

export function problemas(filas, ids) {
  const p = [];
  const vistos = new Set();
  for (const [id, fam, nivel, ambito, crea, lee] of filas) {
    if (vistos.has(id)) p.push(`${id}: repetida en la propuesta`);
    vistos.add(id);
    if (!ids.includes(id)) p.push(`${id}: no es una entidad de ops/entidades.json`);
    if (!(fam in FAMILIES)) p.push(`${id}: familia «${fam}» fuera del vocabulario`);
    if (!(nivel in LEVELS)) p.push(`${id}: nivel «${nivel}» fuera del vocabulario`);
    if (!(ambito in SCOPES)) p.push(`${id}: ámbito «${ambito}» fuera del vocabulario`);
    if (nivel !== "piece" && ambito === "vertical") p.push(`${id}: un ${nivel} no puede ser vertical (sería una extensión: dilo y cita su meta horizontal)`);
    if (!crea?.trim()) p.push(`${id}: sin quién la crea`);
    if (!lee?.trim()) p.push(`${id}: sin quién la lee (ninguna entidad sin lector; di «nadie» con motivo)`);
  }
  for (const id of ids) if (!vistos.has(id)) p.push(`${id}: entidad del registro sin fila en la propuesta`);
  return p;
}

describe("súper tabla de entidades", () => {
  const ids = cargar().entities.map((e) => e.id);
  it("la propuesta cubre las entidades del registro y usa vocabulario cerrado", () => {
    expect(problemas(PROPUESTA_FILAS, ids)).toEqual([]);
  });
  it("el bloque del .md es el generado", () => {
    const i = MD.indexOf(INICIO);
    const f = MD.indexOf(FIN);
    expect(i).toBeGreaterThan(-1);
    expect(MD.slice(i + INICIO.length, f).trim()).toBe(bloque().trim());
  });
  describe("autotest: cada regla falla con datos malos", () => {
    const base = ["x"];
    it("familia, nivel y ámbito fuera de vocabulario", () => {
      expect(problemas([["x", "zz", "piece", "horizontal", "a", "b"]], base).join()).toMatch(/familia/);
      expect(problemas([["x", "work", "N2", "horizontal", "a", "b"]], base).join()).toMatch(/nivel/);
      expect(problemas([["x", "work", "piece", "bridge", "a", "b"]], base).join()).toMatch(/ámbito/);
    });
    it("un meta vertical, una entidad sin fila y una sin lector", () => {
      expect(problemas([["x", "work", "meta", "vertical", "a", "b"]], base).join()).toMatch(/no puede ser vertical/);
      expect(problemas([], base).join()).toMatch(/sin fila/);
      expect(problemas([["x", "work", "piece", "horizontal", "a", ""]], base).join()).toMatch(/sin quién la lee/);
    });
  });
});
