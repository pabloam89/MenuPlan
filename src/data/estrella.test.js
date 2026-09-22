/**
 * `estrella` dice si una receta PUEDE salir propuesta. Aquí se comprueba que
 * esa bandera esté donde alguien la lee, y que lo que promete sea cierto.
 *
 * El eje existe porque una señal anterior —«¿tiene foto?»— promovió ~200
 * recetas del fondo de armario al pool principal de golpe cuando alguien
 * conectó una foto huérfana. Desde entonces es un flag marcado a mano, y por
 * eso merece un fusible: una curación manual se desincroniza en silencio.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { recipeCatalog } from "./recipeCatalog.js";

const R = "src/data/recipes";
const porFichero = Object.fromEntries(
  readdirSync(R)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(`${R}/${f}`, "utf8"))]),
);
const todas = Object.values(porFichero).flat();

describe("la bandera estrella", () => {
  /**
   * BANDERA MUERTA: `estrella` en un fichero que `recipeCatalog` no carga.
   *
   * `guarniciones.json`, `salsas.json` y `bases.json` viven fuera del catálogo
   * de comida/cena a propósito —nunca ocupan un hueco de menú por sí mismos—
   * así que `isPrimaryCatalog` no las ve nunca. Cuatro guarniciones llevan la
   * bandera igualmente y no hace absolutamente nada:
   *
   *   guarniciones_042 Coliflor gratinada con bechamel
   *   guarniciones_064 Raita de pepino y yogur
   *   guarniciones_065 Pan naan casero
   *   guarniciones_066 Cuscús con verduras asadas y pasas
   *
   * No se borran desde un test: puede que estén marcadas para promoverlas. Lo
   * que no puede pasar es que crezcan sin que nadie lo note, ni que alguien lea
   * el recuento de estrella creyendo que son todas servibles.
   */
  const FUERA_DEL_CATALOGO = ["guarniciones.json", "salsas.json", "bases.json"];

  it("no crece en los ficheros que el catálogo no carga", () => {
    const muertas = FUERA_DEL_CATALOGO.flatMap((f) =>
      (porFichero[f] ?? []).filter((r) => r.estrella).map((r) => `${r.id} ${r.name}`),
    );
    expect(muertas.length).toBeLessThanOrEqual(4);
  });

  it("y las que sí se cargan están todas en recipeCatalog", () => {
    const enCatalogo = new Set(recipeCatalog.map((r) => r.id));
    const servibles = todas.filter(
      (r) =>
        r.estrella &&
        !FUERA_DEL_CATALOGO.some((f) => (porFichero[f] ?? []).some((x) => x.id === r.id)),
    );
    const perdidas = servibles.filter((r) => !enCatalogo.has(r.id)).map((r) => r.id);
    expect(perdidas).toEqual([]);
  });

  /**
   * Una receta que puede salir tiene que poder pintarse. Si alguna de estas
   * falta, la tarjeta sale coja y nadie se entera hasta que la ve un usuario.
   */
  it("todas traen lo que la tarjeta necesita", () => {
    const CAMPOS = ["name", "time", "difficulty", "season"];
    const cojas = [];
    for (const r of recipeCatalog) {
      if (!r.estrella) continue;
      for (const campo of CAMPOS) {
        if (r[campo] == null || r[campo] === "") cojas.push(`${r.id}: sin ${campo}`);
      }
      if (!(r.ingredients ?? []).length) cojas.push(`${r.id}: sin ingredientes`);
      if (!(r.steps ?? []).length && !(r.stepsRich ?? []).length) cojas.push(`${r.id}: sin pasos`);
      if (!(r.time > 0)) cojas.push(`${r.id}: time ${r.time}`);
    }
    expect(cojas).toEqual([]);
  });

  /**
   * SUELO, no objetivo. 747 el 23 sep 2026. Si baja de golpe es que alguien
   * quitó banderas sin querer; el catálogo solo debería crecer.
   */
  it("no se encoge sola", () => {
    expect(todas.filter((r) => r.estrella).length).toBeGreaterThanOrEqual(747);
  });
});
