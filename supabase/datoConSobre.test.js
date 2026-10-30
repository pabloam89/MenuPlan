import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { CHOQUE, CHOQUES, CLASES_DATO, ESCRITORES, ESTADOS_OPERACION, MOTIVOS_SIN_HACER_DATO, ORIGEN_DATO, ORIGENES_DE_LA_FAMILIA } from "../src/lib/vocabularios.js";

/**
 * El dato con sobre (plan fichas con estado, trozo 7): lo que no vigilan principios.test.js ni
 * vocabularios.test.js. La 0105 crea la tabla operacion; la escriben las RPC de la 0106 (trozo 39). Ningún
 * código llama aún a aplicar_operacion ni a escribir_dato (trozo 8): este test es su lector.
 *  - operacion: solo el servidor la lee y la escribe (guarda salud); una clave por casa.
 *  - sobre apunta a su operación, que se puede purgar sin llevarse el dato.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = readFileSync(new URL("./migrations/0105_dato_con_sobre.sql", import.meta.url), "utf8");
const codigo = sinComentarios(sql);
const codigo0106 = sinComentarios(readFileSync(new URL("./migrations/0106_aplicar_operacion.sql", import.meta.url), "utf8"));

/** El cuerpo de una función de la 0106, de su create a su $$ de cierre. */
function cuerpo(nombre) {
  const i = codigo0106.search(new RegExp(String.raw`create (?:or replace )?function public\.${nombre}\(`));
  expect(i, `falta la función ${nombre}`).toBeGreaterThan(-1);
  const abre = codigo0106.indexOf("$$", i);
  return codigo0106.slice(i, codigo0106.indexOf("$$", abre + 2) + 2);
}
const literales = (texto) => [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const ordenado = (xs) => [...new Set(xs)].sort();

/** Las migraciones de la 0105 en adelante, sin comentarios. */
function desde0105() {
  const dir = new URL("./migrations/", import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 105)
    .map((f) => sinComentarios(readFileSync(new URL(f, dir), "utf8"))).join("\n");
}

/** Nombres de las políticas creadas sobre `tabla` en `texto`, con o sin comillas y con o sin `public.`. */
function politicasSobre(texto, tabla) {
  const re = new RegExp(`create\\s+policy\\s+("[^"]+"|\\w+)\\s+on\\s+(?:public\\.)?${tabla}\\b`, "gi");
  return [...texto.matchAll(re)].map((m) => m[1]);
}

describe("0105: operacion, solo para el servidor", () => {
  it("nace con RLS y sin ningún permiso de usuario: guarda salud y aún no tiene lector en la app", () => {
    expect(codigo).toMatch(/alter table public\.operacion enable row level security;/);
    expect(codigo).toMatch(/revoke all on table public\.operacion from anon, authenticated;/);
    const grants = [...desde0105().matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.operacion\b[^;]*?\bto\s+([^;]*);/gi)].map((m) => [m[1].trim(), m[2].trim()]);
    expect(grants).toEqual([]);
  });

  it("ninguna política la abre (la lectura por papel llegará en su propia migración)", () => {
    expect(politicasSobre(desde0105(), "operacion")).toEqual([]);
  });

  it("el detector de políticas casa con las dos formas del repo: nombre entre comillas y sin ellas", () => {
    // 97 de los 101 `create policy` del repo llevan el nombre entre comillas (p. ej. 0104:83).
    const malo = 'create policy "Household members read ops"\n  on public.operacion for select using (true);\ncreate policy lee_ops on operacion for select using (true);';
    expect(politicasSobre(malo, "operacion")).toEqual(['"Household members read ops"', "lee_ops"]);
    expect(politicasSobre('create policy "x" on public.operacion_vieja for select using (true);', "operacion")).toEqual([]);
  });

  it("una clave de idempotencia por casa", () => {
    expect(codigo).toMatch(/create unique index uq_operacion_clave on public\.operacion \(household_id, clave\);/);
  });

  it("cada estado con su fecha (PRINCIPIOS §21)", () => {
    expect(codigo).toMatch(/constraint operacion_ejecutada check \(\(estado in \('hecha', 'deshecha'\)\) = \(ejecutada_at is not null\)\)/);
    expect(codigo).toMatch(/constraint operacion_deshecha check \(\(estado = 'deshecha'\) = \(deshecha_at is not null\)\)/);
  });

  it("el sobre apunta a su operación de la misma casa; purgarla no se lleva el dato", () => {
    expect(codigo).toMatch(/foreign key \(household_id, operacion_id\)\s+references public\.operacion\(household_id, id\) on delete set null \(operacion_id\)/);
    expect(codigo).toMatch(/create index sobre_operacion on public\.sobre \(household_id, operacion_id\);/);
  });

  it("la persona autora se puede borrar sin llevarse la operación (ni la casa de la fila)", () => {
    expect(codigo).toMatch(/references public\.persona\(household_id, id\) on delete set null \(autor_persona_id\)/);
  });
});

describe("0106: las RPC de escritura, solo para el servidor", () => {
  it("aplicar_operacion es definer con search_path fijo; escribir_dato, invoker; solo service_role las ejecuta", () => {
    expect(cuerpo("aplicar_operacion")).toMatch(/language plpgsql security definer set search_path = public, pg_temp as \$\$/);
    expect(cuerpo("escribir_dato")).not.toMatch(/security definer/);
    expect(cuerpo("escribir_dato")).toMatch(/select public\.aplicar_operacion\(/);
    const grants = [...desde0105().matchAll(/grant\s+[^;]*?\bon\s+function\s+public\.(aplicar_operacion|escribir_dato)\b[^;]*?\bto\s+([^;]*);/gi)];
    expect(grants.map((m) => [m[1], m[2].trim()])).toEqual([["aplicar_operacion", "service_role"], ["escribir_dato", "service_role"]]);
    expect(codigo0106).toMatch(/revoke all on function public\.aplicar_operacion\(jsonb\) from public, anon, authenticated;/);
    expect(codigo0106).toMatch(/revoke all on function public\.escribir_dato\([^)]*\) from public, anon, authenticated;/);
    // Idempotente: la clave se apunta primero y una repetida devuelve la de antes (una pendiente no avanza).
    expect(cuerpo("aplicar_operacion")).toMatch(/on conflict \(household_id, clave\) do nothing\s+returning id into v_id;/);
    expect(cuerpo("aplicar_operacion")).toMatch(/'repetida', true/);
  });

  it("concurrencia: recorre los datos en orden fijo y crea el sobre con on conflict, sin 23505", () => {
    const f = cuerpo("aplicar_operacion");
    expect(f).toMatch(/jsonb_array_elements\(v_datos\) x\s+order by x\.value->>'campo', coalesce\(x\.value->>'persona_id', ''\)/);
    expect(f).toMatch(/insert into public\.sobre[\s\S]*?on conflict do nothing\s+returning id into v_sobre;/);
  });

  it("al actualizar un sobre conserva bloqueado, peso y caduca_at si el pedido no los trae; nadie escribe «deshecha»", () => {
    const set = cuerpo("aplicar_operacion").match(/update public\.sobre\s+set([\s\S]*?)\bwhere id = v_antes\.id/)?.[1] ?? "";
    for (const c of ["bloqueado", "peso", "caduca_at"]) expect(set, c).toMatch(new RegExp(`${c} = case when d \\? '${c}' then [^\\n]* else ${c} end`));
    expect(cuerpo("escribir_dato")).toMatch(/jsonb_strip_nulls\(/);
    // Nadie escribe «deshecha» todavía: deshacer llega con la tubería (trozo 26).
    expect(codigo0106).not.toMatch(/estado\s*=\s*'deshecha'|deshecha_at\s*=/);
  });
});

describe("0106: el registro manda, y sus literales salen de vocabularios.js", () => {
  const rpc = cuerpo("aplicar_operacion");

  it("los motivos de sin_hacer son MOTIVOS_SIN_HACER_DATO, y lo que mira el case es de sus listas", () => {
    const m = rpc.match(/v_motivo := case([\s\S]*?)\bend;/);
    expect(m, "falta el case de v_motivo").not.toBeNull();
    const motivos = [...m[1].matchAll(/then '(\w+)'/g), ...rpc.matchAll(/v_motivo := '(\w+)';/g)].map((x) => x[1]);
    expect(ordenado(motivos)).toEqual(ordenado(MOTIVOS_SIN_HACER_DATO));
    expect(CLASES_DATO).toContain(m[1].match(/r\.clase <> '(\w+)'/)[1]);
    expect(ESCRITORES).toContain(m[1].match(/r\.escribe = '(\w+)'/)[1]);
    // Un campo con columna propia (persona, persona_*) va a sin_hacer: no se apunta «dicho» sin escribir su tabla.
    expect(rpc).toMatch(/when r\.columna is not null then 'tiene_columna'/);
  });

  it("lo que dice la familia es ORIGENES_DE_LA_FAMILIA, y lo supuesto no pisa lo dicho vigente", () => {
    const m = rpc.match(/v_de_la_familia := v_origen in \(([^)]*)\);/);
    expect(m, "falta v_de_la_familia").not.toBeNull();
    expect(ordenado(literales(m[1]))).toEqual(ordenado(ORIGENES_DE_LA_FAMILIA));
    for (const o of ORIGENES_DE_LA_FAMILIA) expect(ORIGEN_DATO).toContain(o);
    const pisa = rpc.match(/if v_habia and not v_de_la_familia and v_antes\.origen in \(([^)]*)\)\s+and \(v_antes\.caduca_at is null or v_antes\.caduca_at > now\(\)\) then\s+v_motivo := 'ya_lo_dijo_la_familia';/);
    expect(pisa, "lo supuesto pisa lo dicho").not.toBeNull();
    expect(ordenado(literales(pisa[1]))).toEqual(ordenado(ORIGENES_DE_LA_FAMILIA));
  });

  it("los estados que escribe son de ESTADOS_OPERACION, y aplica las reglas de choque que no son «el último gana»", () => {
    const estados = [...rpc.matchAll(/v_estado (?::=|<>|=) ('\w+')|v_estado not in \(([^)]*)\)|then ('\w+') else v_estado/g)].flatMap((m) => literales(m[1] ?? m[2] ?? m[3]));
    expect(estados.length).toBeGreaterThan(2);
    for (const e of estados) expect(ESTADOS_OPERACION, e).toContain(e);
    const reglas = [...rpc.matchAll(/r\.choque = '(\w+)'/g)].map((m) => m[1]);
    expect(ordenado(reglas)).toEqual(ordenado(CHOQUES.filter((c) => c !== CHOQUE.ULTIMO_GANA)));
  });
});
