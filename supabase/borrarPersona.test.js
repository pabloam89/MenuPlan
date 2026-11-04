// Borrar una persona (trozo 36 de #1037): todo lo que apunta a una persona en el estado final de las migraciones
// está en AL_BORRAR_PERSONA (src/lib/borrarPersona.js), con el destino que dice su FK. Una tabla nueva que la nombre
// y no esté, falla aquí.
import { describe, it, expect } from "vitest";
import { esquemaFinal } from "../scripts/lib/migraciones.mjs";
import { DIR_MIGRACIONES } from "../scripts/lib/cascadas.mjs";
import { ACCION_BORRADO } from "../scripts/lib/migraciones.mjs";
import { AL_BORRAR_PERSONA, DESTINOS_AL_BORRAR, DESTINO_AL_BORRAR } from "../src/lib/borrarPersona.js";

const estado = esquemaFinal(DIR_MIGRACIONES);
const DESTINO_DE_FK = { [ACCION_BORRADO.CASCADE]: DESTINO_AL_BORRAR.BORRA, [ACCION_BORRADO.SET_NULL]: DESTINO_AL_BORRAR.SUELTA };

/** Las FK a persona: «tabla.columna» → el destino que da su on delete. Sin la columna de casa, que va en todas. */
function fksAPersona() {
  const fuera = {};
  for (const [tabla, t] of estado) {
    for (const fk of t.fks.values()) {
      if (!/(^|\.)persona$/.test(fk.destino)) continue;
      for (const c of fk.columnas.filter((x) => x !== "household_id")) fuera[`${tabla}.${c}`] = DESTINO_DE_FK[fk.onDelete] ?? fk.onDelete;
    }
  }
  return fuera;
}

describe("borrar una persona: cada tabla que la nombra, con su destino", () => {
  it("toda FK a persona está en AL_BORRAR_PERSONA con el destino de su on delete", () => {
    const fks = fksAPersona();
    expect(Object.keys(fks).length).toBeGreaterThan(5);
    const mal = Object.entries(fks).filter(([k, d]) => AL_BORRAR_PERSONA[k]?.destino !== d).map(([k, d]) => `${k}: la FK dice ${d}, la lista ${AL_BORRAR_PERSONA[k]?.destino ?? "nada"}`);
    expect(mal).toEqual([]);
  });

  it("toda columna *_member (una persona sin FK) está en la lista y la barre caducidades.js", () => {
    const members = [...estado].flatMap(([tabla, t]) => [...t.columnas.keys?.() ?? t.columnas].filter((c) => /_member$/.test(c)).map((c) => `${tabla}.${c}`));
    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((k) => AL_BORRAR_PERSONA[k]?.destino !== DESTINO_AL_BORRAR.BARRE)).toEqual([]);
  });

  it("cada entrada existe en el esquema, con un destino del vocabulario y su porqué; borra y suelta, solo con su FK", () => {
    const fks = fksAPersona();
    for (const [k, { destino, por }] of Object.entries(AL_BORRAR_PERSONA)) {
      const [tabla, columna] = k.split(".");
      expect(estado.get(tabla)?.columnas.has(columna), k).toBe(true);
      expect(DESTINOS_AL_BORRAR, k).toContain(destino);
      expect(por.length, k).toBeGreaterThan(5);
      if (k !== "persona.id" && [DESTINO_AL_BORRAR.BORRA, DESTINO_AL_BORRAR.SUELTA].includes(destino)) expect(fks[k], k).toBe(destino);
    }
  });
});
