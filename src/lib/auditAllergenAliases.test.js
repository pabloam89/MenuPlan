import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeAllergenId } from "./allergens.js";

/**
 * `scripts/audit-catalog.mjs` lleva una copia del mapa de alias de alérgeno
 * porque no puede importar `lib/allergens.js`: ese módulo arrastra iconos
 * `.jsx` y el script corre en node pelado, sin bundler.
 *
 * Una copia sin candado se desincroniza — le pasó a la tabla de pesos por
 * pieza, que acabó siendo una tercera verdad peor que las dos que ya había.
 * Este test es el candado: compara las dos entrada por entrada.
 */
describe("el mapa de alérgenos copiado en la auditoría", () => {
  it("dice lo mismo que el de producción", () => {
    const fuente = readFileSync(new URL("../../scripts/audit-catalog.mjs", import.meta.url), "utf8");
    const bloque = fuente.match(/const ALIAS_ALERGENO = \{([\s\S]*?)\n\};/);
    expect(bloque, "no se encontró ALIAS_ALERGENO en el script").not.toBeNull();

    const claves = [...bloque[1].matchAll(/["']?([\wáéíóúñ_]+)["']?\s*:/g)].map((m) => m[1]);
    expect(claves.length).toBeGreaterThan(20);

    const discrepan = claves.filter((k) => {
      const copia = bloque[1].match(new RegExp(`["']?${k}["']?\\s*:\\s*["'](\\w+)["']`))?.[1];
      return copia !== normalizeAllergenId(k);
    });
    expect(discrepan).toEqual([]);
  });
});
