import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CAPACIDADES, VERBOS, SOBRE, PANTALLAS, ESTADOS_CAPACIDAD, estadoDe, esHueco } from "./capacidades.js";
import { MODULOS, DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

  // Que cada herramienta de Lola esté en alguna capacidad, y ninguna inventada,
  // lo comprueba ahora su ficha (api/_bot/fichas.test.js): el `lola` de aquí sale de ellas.
  it("el lado de Lola no se escribe a mano: ninguna capacidad lleva `lola`", () => {
    const fuente = readFileSync(join(raiz, "src/lib/capacidades.js"), "utf8").split("\n");
    expect(fuente.filter((l) => /^\s+c\(".*\blola: \[/.test(l))).toEqual([]);
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
