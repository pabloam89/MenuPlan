import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REGISTRO_CAMPOS } from "../src/lib/registroCampos.js";
import { ESTADOS_OPERACION, ORIGENES_DE_LA_FAMILIA } from "../src/lib/vocabularios.js";

/**
 * Persona y salud, fuente única (plan fichas con estado, trozo 10; 0108): lo que no vigilan principios.test.js,
 * tuberiaUnica.test.js ni datoConSobre.test.js. Lee el SQL: la migración no está aplicada y no hay base en los tests.
 *  - fuera la copia desde el documento (disparadores de la 0089 y sus funciones);
 *  - escribir_persona, solo para el servidor, escribe todas las columnas de persona, solo con origen de la
 *    familia, y el sobre de los campos del registro con columna propia;
 *  - personas_de_casa, para los de la casa.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = sinComentarios(readFileSync(new URL("./migrations/0108_persona_fuente.sql", import.meta.url), "utf8"));
const sql0079 = sinComentarios(readFileSync(new URL("./migrations/0079_personas_y_grupos.sql", import.meta.url), "utf8"));

/** El cuerpo de una función de la 0108, de su create a su $$ de cierre. */
function cuerpo(nombre) {
  const i = sql.search(new RegExp(String.raw`create (?:or replace )?function public\.${nombre}\(`));
  expect(i, `falta la función ${nombre}`).toBeGreaterThan(-1);
  const abre = sql.indexOf("$$", i);
  return sql.slice(i, sql.indexOf("$$", abre + 2) + 2);
}
const ordenado = (xs) => [...new Set(xs)].sort();

describe("0108: fuera la copia de data.members a persona", () => {
  const RETIRADAS = ["_personas_al_guardar()", "_persona_filas_de_estado(jsonb)", "_fecha_iso_o_null(text)",
    "persona_reemplazar_casa(uuid, jsonb)", "persona_sincronizar_casa(uuid, jsonb)"];

  it("quita los dos disparadores de household_state antes que la función que llaman", () => {
    const disparadores = ["personas_al_guardar", "personas_al_crear"].map((t) => sql.indexOf(`drop trigger if exists ${t} on public.household_state;`));
    for (const i of disparadores) expect(i).toBeGreaterThan(-1);
    expect(Math.max(...disparadores)).toBeLessThan(sql.indexOf("drop function if exists public._personas_al_guardar()"));
  });

  it("quita las cinco funciones, con su firma", () => {
    for (const f of RETIRADAS) expect(sql, f).toContain(`drop function if exists public.${f};`);
  });

  it("la autoprueba comprueba que no queda ningún disparador personas_al_", () => {
    expect(sql).toMatch(/if exists \(select 1 from pg_trigger where tgname like 'personas_al_%'\) then\s+raise exception/);
  });
});

describe("0108: escribir_persona", () => {
  const f = cuerpo("escribir_persona");

  it("solo para el servidor: nadie con sesión la ejecuta", () => {
    expect(sql).toMatch(/revoke all on function public\.escribir_persona\(jsonb\) from public, anon, authenticated;/);
    const grants = [...sql.matchAll(/grant execute on function public\.escribir_persona\(jsonb\) to ([^;]+);/g)].map((m) => m[1].trim());
    expect(grants).toEqual(["service_role"]);
    expect(f).toMatch(/language plpgsql security definer set search_path = public, pg_temp/);
  });

  it("la persona y su salud solo las dice la familia: los mismos orígenes que ORIGENES_DE_LA_FAMILIA", () => {
    // El de la operación y el de cada persona.
    const guardas = [...f.matchAll(/if (v_origen\w*) not in \(([^)]*)\) then\s+raise exception/g)];
    expect(guardas.map((m) => m[1])).toEqual(["v_origen", "v_origen_p"]);
    for (const m of guardas) expect(ordenado([...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]))).toEqual(ordenado(ORIGENES_DE_LA_FAMILIA));
    // Los sobres llevan el de la persona.
    expect(f).not.toMatch(/origen = v_origen,|null, v_origen,/);
  });

  it("escribe todas las columnas de persona de la 0079 (ninguna se queda sin escritor)", () => {
    const tabla = /create table if not exists public\.persona \(([\s\S]*?)\n\);/.exec(sql0079)[1];
    const columnas = [...tabla.matchAll(/^\s{2}(\w+)\s+(?!key\b)\w/gm)].map((m) => m[1])
      .filter((c) => !["household_id", "id", "created_at", "updated_at", "primary"].includes(c));
    const escritas = [...f.matchAll(/^\s+(\w+) = case when p \? '(\w+)'/gm)].map((m) => [m[1], m[2]]);
    for (const [col, clave] of escritas) expect(clave, `la clave de ${col} es su columna`).toBe(col);
    expect(ordenado(escritas.map(([c]) => c))).toEqual(ordenado(columnas));
  });

  it("escribe el sobre de los campos del registro con columna propia, y solo de esos", () => {
    const valores = /from \(values([\s\S]*?)\) as c\(campo, tiene\)/.exec(f)?.[1] ?? "";
    const campos = [...valores.matchAll(/\('(\w+)', case when/g)].map((m) => m[1]);
    const conColumna = Object.keys(REGISTRO_CAMPOS).filter((c) => REGISTRO_CAMPOS[c].columna && REGISTRO_CAMPOS[c].por === "persona");
    expect(ordenado(campos)).toEqual(ordenado(conColumna));
  });

  it("solo borra a una persona cuando se pide (borrar), nunca para reinsertarla", () => {
    const borrados = [...f.matchAll(/delete from public\.persona where/g)];
    expect(borrados).toHaveLength(1);
    const antes = f.slice(0, borrados[0].index);
    expect(antes.slice(antes.lastIndexOf("if p->'borrar'"))).toMatch(/^if p->'borrar' = 'true'::jsonb then\s+if v_habia then\s*$/);
  });

  it("la salud más restrictiva la decide la regla de choque del registro (alergias)", () => {
    expect(REGISTRO_CAMPOS.alergias.choque).toBe("mas_restrictivo");
    expect(f).toMatch(/select choque into v_choque from public\.registro_campo where id = 'alergias';/);
    expect(f).toMatch(/if v_choque = 'mas_restrictivo' and exists \(/);
  });

  it("apunta la operación con estados de ESTADOS_OPERACION", () => {
    const estados = [...f.matchAll(/estado = '(\w+)'|'(pendiente)',\s*\n/g)].map((m) => m[1] ?? m[2]);
    expect(estados.length).toBeGreaterThan(0);
    for (const e of estados) expect(ESTADOS_OPERACION).toContain(e);
  });

  it("su inversa no lleva «datos»: deshacer_operacion (0111) falla en alto en vez de marcarla deshecha sin deshacer nada", () => {
    const inversa = /inversa = ([\s\S]*?)\n\s+where household_id = v_casa and id = v_id;/.exec(f)?.[1] ?? "";
    expect(inversa).toMatch(/'personas'/);
    expect(inversa).not.toMatch(/'datos'/);
  });
});

describe("0108: personas_de_casa", () => {
  const f = cuerpo("personas_de_casa");

  it("la leen los de la casa (lo mismo que ya leían en household_state) y el servidor; solo lee", () => {
    const grants = [...sql.matchAll(/grant execute on function public\.personas_de_casa\(uuid\) to ([^;]+);/g)].map((m) => m[1].trim());
    expect(grants).toEqual(["authenticated, service_role"]);
    expect(f).toMatch(/stable security definer/);
    expect(f).toMatch(/m\.household_id = p_casa and m\.user_id = auth\.uid\(\)\) then\s+raise exception 'personas_de_casa: no eres de esta casa' using errcode = '42501'/);
    expect(f).not.toMatch(/\b(insert into|update public|delete from)\b/);
  });
});

describe("0108: autoprueba", () => {
  it("acaba siempre deshecha", () => {
    expect(sql).toMatch(/raise exception 'autoprueba 0108 bien' using errcode = 'MP108';\s+exception when sqlstate 'MP108' then/);
  });
});
