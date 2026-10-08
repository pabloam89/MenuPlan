import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BASE, medir } from "../scripts/cableado.mjs";

/**
 * Trinquete del cableado código ↔ tabla (docs/datos/PRINCIPIOS.md, «Cableado»).
 *
 * supabase/cableado.json es la foto de qué fichero toca qué tabla. Dos fallos
 * posibles, los dos a propósito:
 *
 * - Un fichero NUEVO se pone a tocar una tabla: usa el módulo que ya la toca.
 *   Si de verdad tiene que ser así, se añade a mano a cableado.json y el PR
 *   explica por qué.
 * - Un fichero DEJA de tocarla: bien, y se quita de cableado.json con
 *   `node scripts/cableado.mjs --escribir`. Solo avisa, no falla: con sesiones
 *   en paralelo, el PR que dejaba de tocar una tabla ponía en rojo el CI de
 *   todos los demás hasta que alguien regenerara el fichero (8 oct 2026).
 *   Mientras no se quite, ese par sigue abierto: el aviso sale en cada CI.
 */
const base = JSON.parse(readFileSync(BASE, "utf8"));
const hoy = medir();

const pares = (mapa) => new Set(Object.entries(mapa).flatMap(([t, fs]) => fs.map((f) => `${t} ← ${f}`)));

describe("cableado: qué fichero toca qué tabla", () => {
  const antes = pares(base);
  const ahora = pares(hoy);

  it("ningún fichero nuevo toca una tabla directamente", () => {
    const nuevos = [...ahora].filter((p) => !antes.has(p));
    expect(nuevos, "Pasa por el módulo que ya toca esa tabla, o añádelo a supabase/cableado.json con su porqué").toEqual([]);
  });

  it("lo que ya no toca una tabla se avisa para sacarlo de la base", () => {
    const viejos = [...antes].filter((p) => !ahora.has(p));
    if (viejos.length) {
      console.warn(`cableado: ${viejos.length} par(es) ya no se usan; quítalos con \`node scripts/cableado.mjs --escribir\`:\n  ${viejos.join("\n  ")}`);
    }
  });
});
