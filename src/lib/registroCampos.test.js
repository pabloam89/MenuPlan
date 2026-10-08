import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, POR, APLICA } from "./registroCampos.js";
import { ORIGEN_DATO, REF_TIPO, VISIBILIDAD, CANALES, ACTORES_CAMBIO, ALCANCES_CAMBIO } from "./vocabularios.js";

/**
 * La 0097 copia REGISTRO_CAMPOS en registro_campo y cierra los vocabularios de
 * sobre y cambio con CHECK. Este test es lo que impide que el SQL y el JS se
 * separen: un campo nuevo en JS sin migración no existiría en la base, y un
 * sobre suyo violaría la FK.
 */
const sql = readFileSync(new URL("../../supabase/migrations/0097_ficha_registro_sobre_cambio.sql", import.meta.url), "utf8");
const codigo = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

/** Los literales '…' del CHECK con ese nombre, en orden. */
function literales(constraint) {
  const m = codigo.match(new RegExp(`constraint ${constraint}\\s+check\\s*\\(([^;]*?)\\)\\s*[,)]`, "i"));
  expect(m, `falta el CHECK ${constraint} en la 0097`).not.toBeNull();
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const ordenado = (xs) => [...xs].sort();

/** Las filas del INSERT de registro_campo, como objetos con las columnas de la migración. */
function filasDelInsert() {
  const m = codigo.match(/insert into public\.registro_campo\s*\(([^)]*)\)\s*values([\s\S]*?)on conflict/i);
  expect(m, "falta el INSERT de registro_campo en la 0097").not.toBeNull();
  const cols = m[1].split(",").map((c) => c.trim());
  const valor = (t) => {
    t = t.trim();
    if (t === "null") return null;
    if (t === "true" || t === "false") return t === "true";
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    return Number(t);
  };
  return [...m[2].matchAll(/\(([^()]*)\)/g)].map((f) => {
    const vals = f[1].split(",").map(valor);
    expect(vals.length).toBe(cols.length);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
}

describe("0097: registro_campo dice lo mismo que registroCampos.js", () => {
  it("mismos campos y, en cada uno, mismas columnas", () => {
    const filas = filasDelInsert();
    expect(ordenado(filas.map((f) => f.id))).toEqual(ordenado(Object.keys(REGISTRO_CAMPOS)));
    for (const { id, ...fila } of filas) {
      const js = REGISTRO_CAMPOS[id];
      for (const [col, v] of Object.entries(fila)) expect(v, `${id}.${col}`).toEqual(js[col]);
    }
  });

  it("los CHECK de registro_campo son los del JS", () => {
    expect(literales("registro_campo_tipo_vocabulario")).toEqual(TIPOS_CAMPO);
    expect(literales("registro_campo_politica_vocabulario")).toEqual(POLITICAS);
    expect(literales("registro_campo_visibilidad_vocabulario")).toEqual(VISIBILIDAD);
    expect(literales("registro_campo_por_vocabulario")).toEqual(POR);
    expect(literales("registro_campo_aplica_vocabulario")).toEqual(APLICA);
  });

  it("sobre y cambio: origen, canal y referencia con los vocabularios de siempre", () => {
    expect(literales("sobre_origen_vocabulario")).toEqual(ORIGEN_DATO);
    const canal = ["app", ...CANALES, "sistema"];
    expect(literales("sobre_canal_vocabulario")).toEqual(canal);
    expect(literales("cambio_canal_vocabulario")).toEqual(canal);
    expect(literales("sobre_ref_tipo_vocabulario")).toEqual(REF_TIPO);
    expect(literales("cambio_ref_tipo_vocabulario")).toEqual(REF_TIPO);
    expect(literales("cambio_actor_vocabulario")).toEqual(ACTORES_CAMBIO);
    expect(literales("cambio_alcance_vocabulario")).toEqual(ALCANCES_CAMBIO);
  });

  it("cada valor de los CHECK está en NFC (comparan bytes)", () => {
    for (const f of filasDelInsert()) for (const v of Object.values(f)) if (typeof v === "string") expect(v).toBe(v.normalize("NFC"));
  });
});
