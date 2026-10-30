import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, POR, APLICA } from "./registroCampos.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

/**
 * La 0097 copió REGISTRO_CAMPOS en registro_campo y la 0105 la regeneró entera
 * con las columnas del eje. Este test es lo que impide que el SQL y el JS se
 * separen: un campo nuevo en JS sin migración no existiría en la base, y un
 * sobre suyo violaría la FK. Compara con el último INSERT de registro_campo de
 * las migraciones (hoy, el de la 0105): una migración que la regenere pasa a ser
 * la que se mira.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const MIGRACIONES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
  .map((fichero) => ({ fichero, codigo: sinComentarios(readFileSync(new URL(fichero, DIR), "utf8")) }));
const RE_INSERT = /insert into public\.registro_campo\s*\(([^)]*)\)\s*values([\s\S]*?)on conflict/i;
const ULTIMA = MIGRACIONES.filter((m) => RE_INSERT.test(m.codigo)).at(-1);
const codigo = ULTIMA.codigo;

/** Los literales '…' del CHECK con ese nombre (en la última migración que lo define), en orden. */
function literales(constraint) {
  const re = new RegExp(`constraint ${constraint}\\s+check\\s*\\(([^;]*?)\\)\\s*(?:not valid\\s*)?[,);]`, "i");
  const m = MIGRACIONES.map((x) => x.codigo.match(re)).filter(Boolean).at(-1);
  expect(m, `falta el CHECK ${constraint} en las migraciones`).toBeTruthy();
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const ordenado = (xs) => [...xs].sort();

/** Las filas del INSERT de registro_campo, como objetos con las columnas de la migración. */
function filasDelInsert() {
  const m = codigo.match(RE_INSERT);
  expect(m, `falta el INSERT de registro_campo en la ${ULTIMA.fichero}`).not.toBeNull();
  const cols = m[1].split(",").map((c) => c.trim());
  const valor = (t) => {
    t = t.trim();
    if (t === "null") return null;
    if (t === "true" || t === "false") return t === "true";
    // Un defecto jsonb: '<json>'::jsonb.
    if (/^'.*'::jsonb$/.test(t)) return JSON.parse(t.slice(1, t.lastIndexOf("'")));
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    return Number(t);
  };
  return [...m[2].matchAll(/\(([^()]*)\)/g)].map((f) => {
    const vals = f[1].split(",").map(valor);
    expect(vals.length).toBe(cols.length);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
}

describe("registro_campo (0097, regenerada en la 0105) dice lo mismo que registroCampos.js", () => {
  it("el último INSERT es el de la 0105, con las columnas del eje", () => {
    expect(ULTIMA.fichero).toBe("0105_dato_con_sobre.sql");
    const cols = codigo.match(RE_INSERT)[1].split(",").map((c) => c.trim());
    for (const c of ["ficha", "clase", "defecto", "suposicion", "minimo_para_generar", "peso_menu", "escribe", "choque"]) expect(cols, c).toContain(c);
  });

  it("mismos campos y, en cada uno, mismas columnas", () => {
    const filas = filasDelInsert();
    expect(ordenado(filas.map((f) => f.id))).toEqual(ordenado(Object.keys(REGISTRO_CAMPOS)));
    for (const { id, ...fila } of filas) {
      const js = REGISTRO_CAMPOS[id];
      for (const [col, v] of Object.entries(fila)) expect(v, `${id}.${col}`).toEqual(js[col]);
    }
  });

  it("las claves de cada campo en JS son las columnas del INSERT (ni una de más ni de menos)", () => {
    const m = codigo.match(/insert into public\.registro_campo\s*\(([^)]*)\)/i);
    const cols = m[1].split(",").map((c) => c.trim()).filter((c) => c !== "id");
    for (const [id, c] of Object.entries(REGISTRO_CAMPOS)) expect(ordenado(Object.keys(c)), id).toEqual(ordenado(cols));
  });

  it("los CHECK de registro_campo son los del JS", () => {
    expect(literales("registro_campo_tipo_vocabulario")).toEqual(TIPOS_CAMPO);
    expect(literales("registro_campo_politica_vocabulario")).toEqual(POLITICAS);
    expect(literales("registro_campo_por_vocabulario")).toEqual(POR);
    expect(literales("registro_campo_aplica_vocabulario")).toEqual(APLICA);
  });

  it("REGISTRO_CAMPOS es una proyección del registro de la ficha: los campos son los datos con `campo`", () => {
    const conCampo = [...Object.values(DATOS_CASA), ...Object.values(DATOS_PERSONA)].filter((d) => d.campo).map((d) => d.campo);
    expect(ordenado(conCampo)).toEqual(ordenado(Object.keys(REGISTRO_CAMPOS)));
  });

  // sobre.origen, sobre.canal y sobre.ref_tipo: su paridad con ORIGEN_DATO, CANALES_DATO y REF_TIPO la lleva
  // src/lib/vocabularios.test.js, por columna y con los retirados (#497); aquí no se repite.

  it("cada valor de los CHECK está en NFC (comparan bytes)", () => {
    for (const f of filasDelInsert()) for (const v of Object.values(f)) if (typeof v === "string") expect(v).toBe(v.normalize("NFC"));
  });
});
