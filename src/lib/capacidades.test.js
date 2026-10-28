import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CAPACIDADES, VERBOS, SOBRE, PANTALLAS, ESTADOS_CAPACIDAD, estadoDe, esHueco } from "./capacidades.js";
import { MODULOS, DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Las herramientas que Lola tiene de verdad, leídas de su código.
const HERRAMIENTAS = [...readFileSync(join(raiz, "api/_bot/agente.js"), "utf8").matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
const BASE = JSON.parse(readFileSync(join(raiz, "src/lib/capacidades.base.json"), "utf8"));

describe("mapa de capacidades (#939)", () => {
  it("cada columna cerrada tiene un valor de su lista, y los ids no se repiten", () => {
    expect(new Set(CAPACIDADES.map((c) => c.id)).size).toBe(CAPACIDADES.length);
    for (const c of CAPACIDADES) {
      expect(MODULOS, `${c.id}.parte`).toContain(c.parte);
      expect(VERBOS, `${c.id}.verbo`).toContain(c.verbo);
      expect(SOBRE, `${c.id}.sobre`).toContain(c.sobre);
      if (c.app) expect(PANTALLAS[c.app.pantalla], `${c.id}.app`).toBeTruthy();
      expect(ESTADOS_CAPACIDAD).toContain(estadoDe(c));
    }
  });

  it("cada herramienta de Lola está en alguna capacidad; ninguna inventada", () => {
    const usadas = new Set(CAPACIDADES.flatMap((c) => c.lola));
    for (const h of HERRAMIENTAS) expect(usadas.has(h), `${h} sin capacidad`).toBe(true);
    for (const h of usadas) expect(HERRAMIENTAS, `${h} no existe en agente.js`).toContain(h);
  });

  it("las pantallas existen y los datos están en el registro de la ficha", () => {
    for (const [p, f] of Object.entries(PANTALLAS)) expect(existsSync(join(raiz, f)), `${p}: ${f}`).toBe(true);
    for (const c of CAPACIDADES) {
      for (const d of c.datos) {
        const [r, sub] = d.split(".");
        expect(sub ? r === "members" && DATOS_PERSONA[sub] : DATOS_CASA[r], `${c.id}: ${d}`).toBeTruthy();
      }
    }
  });

  it("los huecos de sincronía solo bajan", () => {
    const hoy = { huecos: CAPACIDADES.filter(esHueco).length, apagadas: CAPACIDADES.filter((c) => estadoDe(c) === "apagada").length };
    // Si sube: npm run capacidades dice cuál es nuevo. Si baja: actualiza capacidades.base.json.
    expect(hoy).toEqual({ huecos: BASE.huecos, apagadas: BASE.apagadas });
  });
});
