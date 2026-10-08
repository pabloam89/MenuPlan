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
 * - Un fichero DEJA de tocarla: bien, pero se quita de cableado.json en el
 *   mismo PR (`node scripts/cableado.mjs --escribir`). Así el número solo baja
 *   y nadie vuelve a abrir esa puerta sin que se vea.
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

  it("lo que ya no toca una tabla sale de la base (el número solo baja)", () => {
    const viejos = [...antes].filter((p) => !ahora.has(p));
    expect(viejos, "Bien: ahora quítalos con `node scripts/cableado.mjs --escribir`").toEqual([]);
  });
});
