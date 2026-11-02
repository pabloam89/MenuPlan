import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { REGISTRO_CAMPOS } from "../src/lib/registroCampos.js";
import { CHOQUE, CHOQUES, CLASES_DATO, COMIDAS, DIAS, DIMENSIONES_AMBITO, ESCRITORES, ESTADO_DE_ORIGEN, ESTADOS_DATO, ESTADOS_OPERACION, MOTIVOS_SIN_DESHACER, MOTIVOS_SIN_HACER_DATO, ORIGEN_DATO, ORIGENES_DE_LA_FAMILIA } from "../src/lib/vocabularios.js";
import { CAMPOS_DESHACER } from "../src/lib/operaciones/tuberia.js";
import { FICHA_CON_ESTADO } from "../src/lib/estadoDeDato.js";

/**
 * El dato con sobre (plan fichas con estado, trozo 7): lo que no vigilan principios.test.js ni
 * vocabularios.test.js. La 0105 crea la tabla operacion; la escriben las RPC de la 0106 (trozo 39). Ningún
 * código llama aún a aplicar_operacion ni a escribir_dato (trozo 8): este test es su lector. La 0107
 * (trozo 40) rehace ficha_casa (v2) y quita sobre.ref_tipo/ref_id. La 0111 (trozo 41) crea deshacer_operacion,
 * que llama la tubería (src/lib/operaciones/tuberia.js, deshacer) y cuenta con CAMPOS_DESHACER.
 *  - operacion: solo el servidor la lee y la escribe (guarda salud); una clave por casa.
 *  - sobre apunta a su operación, que se puede purgar sin llevarse el dato.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = readFileSync(new URL("./migrations/0105_dato_con_sobre.sql", import.meta.url), "utf8");
const codigo = sinComentarios(sql);
const codigo0106 = sinComentarios(readFileSync(new URL("./migrations/0106_aplicar_operacion.sql", import.meta.url), "utf8"));

const codigo0107 = sinComentarios(readFileSync(new URL("./migrations/0107_ficha_casa_v2.sql", import.meta.url), "utf8"));
const codigo0111 = sinComentarios(readFileSync(new URL("./migrations/0111_deshacer_operacion.sql", import.meta.url), "utf8"));

/** La última migración (de la 0105 en adelante) que define la función: la que vale en la base. */
function ultimaQueDefine(nombre) {
  const dir = new URL("./migrations/", import.meta.url);
  const re = new RegExp(String.raw`create (?:or replace )?function public\.${nombre}\(`);
  const f = readdirSync(dir).filter((x) => x.endsWith(".sql") && Number(x.slice(0, 4)) >= 105).sort()
    .map((x) => sinComentarios(readFileSync(new URL(x, dir), "utf8"))).filter((t) => re.test(t)).at(-1);
  expect(f, `ninguna migración define ${nombre}`).toBeTruthy();
  return f;
}

/** El cuerpo de una función (de la última migración que la define, si no se dice otra), de su create a su $ de cierre. */
function cuerpo(nombre, texto = ultimaQueDefine(nombre)) {
  const i = texto.search(new RegExp(String.raw`create (?:or replace )?function public\.${nombre}\(`));
  expect(i, `falta la función ${nombre}`).toBeGreaterThan(-1);
  const abre = texto.indexOf("$$", i);
  return texto.slice(i, texto.indexOf("$$", abre + 2) + 2);
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
    // Cada vez que se rehace (0106, 0115), solo para service_role.
    expect(ordenado(grants.map((m) => `${m[1]} → ${m[2].trim()}`))).toEqual(["aplicar_operacion → service_role", "escribir_dato → service_role"]);
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

  it("al actualizar un sobre conserva bloqueado, peso y caduca_at si el pedido no los trae; aplicar_operacion no escribe «deshecha»", () => {
    const set = cuerpo("aplicar_operacion").match(/update public\.sobre\s+set([\s\S]*?)\bwhere id = v_antes\.id/)?.[1] ?? "";
    for (const c of ["bloqueado", "peso", "caduca_at"]) expect(set, c).toMatch(new RegExp(`${c} = case when d \\? '${c}' then [^\\n]* else ${c} end`));
    expect(cuerpo("escribir_dato")).toMatch(/jsonb_strip_nulls\(/);
    // «deshecha» solo la escribe deshacer_operacion (0111, trozo 41).
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
    expect(rpc).toMatch(/\(r\.choque = 'mas_restrictivo' and r\.tipo <> 'lista_enum'\) or \(r\.choque = 'suma' and r\.tipo not in \('int', 'decimal'\)\) then\s+raise exception/);
    const reglas = [...rpc.matchAll(/r\.choque = '(\w+)'/g)].map((m) => m[1]);
    expect(ordenado(reglas)).toEqual(ordenado(CHOQUES.filter((c) => c !== CHOQUE.ULTIMO_GANA)));
  });
});

describe("0107: ficha_casa v2 y fuera sobre.ref", () => {
  // La que vale en la base (0107, o la que la rehaga después): sus reglas siguen.
  const ficha = cuerpo("ficha_casa");
  const vigente = /and \(s\.caduca_at is null or s\.caduca_at > now\(\)\)\)/g;

  it("quita sobre.ref_tipo y sobre.ref_id, con CONTRAE y la guardia de filas; ficha_casa sigue solo para service_role", () => {
    expect(codigo0107).toMatch(/alter table public\.sobre\s+drop column ref_tipo,\s+drop column ref_id;/);
    expect(readFileSync(new URL("./migrations/0107_ficha_casa_v2.sql", import.meta.url), "utf8")).toMatch(/^-- CONTRAE: sobre\.ref_tipo y sobre\.ref_id/m);
    expect(codigo0107).toMatch(/if exists \(select 1 from public\.sobre where ref_tipo is not null or ref_id is not null\) then\s+raise exception/);
    expect(codigo0107).toMatch(/revoke all on function public\.ficha_casa\(uuid, uuid, text, integer\) from public, anon, authenticated;/);
    expect([...codigo0107.matchAll(/grant\s+[^;]*?\bon\s+function\s+public\.ficha_casa\b[^;]*?\bto\s+([^;]*);/gi)].map((m) => m[1].trim())).toEqual(["service_role"]);
    expect(ficha).toMatch(/'v', 2,/);
  });

  it("el estado de cada dato sale de ESTADO_DE_ORIGEN, que cubre ORIGEN_DATO y da estados de ESTADOS_DATO", () => {
    const m = ficha.match(/else case d\.origen([\s\S]*?)\bend end,/);
    expect(m, "falta el case del estado").not.toBeNull();
    expect(Object.fromEntries([...m[1].matchAll(/when '(\w+)' then '(\w+)'/g)].map((x) => [x[1], x[2]]))).toEqual(ESTADO_DE_ORIGEN);
    expect(ordenado(Object.keys(ESTADO_DE_ORIGEN))).toEqual(ordenado(ORIGEN_DATO));
    for (const e of [...Object.values(ESTADO_DE_ORIGEN), ...literales(ficha.match(/'estado', case when not d\.vigente then ([^\n]*)/)[1])]) expect(ESTADOS_DATO).toContain(e);
  });

  it("un campo con columna y sin sobre vigente sale sin valor (o con su defecto), y los «when d.campo» son los de REGISTRO_CAMPOS con columna", () => {
    const valor = ficha.match(/'valor', case when not d\.vigente then d\.defecto([\s\S]*?)else d\.valor end,/);
    expect(valor, "el valor no mira primero si el sobre está vigente").not.toBeNull();
    // Un sobre vigente cuyo estado es «vacío» (no_quiere_decirlo) tampoco lleva valor: ni la columna ni un [] de alergias.
    const vacios = Object.keys(ESTADO_DE_ORIGEN).filter((o) => ESTADO_DE_ORIGEN[o] === "vacio");
    expect(ordenado([...valor[1].matchAll(/when d\.origen = '(\w+)' then null/g)].map((x) => x[1]))).toEqual(ordenado(vacios));
    const conColumna = Object.entries(REGISTRO_CAMPOS).filter(([, c]) => c.columna).map(([id]) => id);
    expect(ordenado([...valor[1].matchAll(/when d\.campo = '(\w+)'/g)].map((x) => x[1]))).toEqual(ordenado(conColumna));
  });

  it("«faltan» solo da por sabido lo que tiene sobre vigente: ni la columna ni un sobre caducado cuentan", () => {
    const faltan = ficha.slice(ficha.indexOf("into v_faltan"), ficha.indexOf("into v_tareas"));
    expect(faltan.match(vigente)?.length).toBe(2);
    expect(faltan).not.toMatch(/alergias_revisadas|p\.edad|p\.fecha_nacimiento/);
  });
});

describe("0111: deshacer_operacion, en una transacción y solo lo propio", () => {
  const f = cuerpo("deshacer_operacion");

  it("es definer con search_path fijo y solo la ejecuta service_role", () => {
    expect(f).toMatch(/language plpgsql security definer set search_path = public, pg_temp as \$\$/);
    expect(codigo0111).toMatch(/revoke all on function public\.deshacer_operacion\(uuid, uuid, uuid\) from public, anon, authenticated;/);
    const grants = [...desde0105().matchAll(/grant\s+[^;]*?\bon\s+function\s+public\.deshacer_operacion\b[^;]*?\bto\s+([^;]*);/gi)];
    expect(ordenado(grants.map((m) => m[1].trim()))).toEqual(["service_role"]);
  });

  it("los motivos de sin_hacer son MOTIVOS_SIN_DESHACER, y los estados que mira o escribe, de ESTADOS_OPERACION", () => {
    expect(ordenado([...f.matchAll(/'motivo', '(\w+)'/g)].map((m) => m[1]))).toEqual(ordenado(MOTIVOS_SIN_DESHACER));
    const estados = [...f.matchAll(/estado (?:=|<>) '(\w+)'|'estado', '(\w+)'/g)].map((m) => m[1] ?? m[2]);
    expect(ordenado(estados)).toEqual(["deshecha", "hecha"]);
    for (const e of estados) expect(ESTADOS_OPERACION).toContain(e);
  });

  it("devuelve en cada salida las claves que cuenta la tubería (CAMPOS_DESHACER)", () => {
    // Las claves de arriba: el sin_hacer de «no_existe» lleva dentro su propio objeto.
    const arriba = (s) => s.replace(/jsonb_build_array\(jsonb_build_object\([^)]*\)\)/g, "");
    // Pares clave, valor: el valor es un literal (con su tipo), un paréntesis sin otros dentro o una expresión sin comas.
    const par = /'(\w+)',\s*(?:'[^']*'(?:::\w+)?|\([^()]*\)|[^,()]+)/g;
    const salidas = [...f.matchAll(/return jsonb_build_object\(([\s\S]*?)\);/g)].map((m) => [...arriba(m[1]).matchAll(par)].map((x) => x[1]));
    expect(salidas.length).toBe(5);
    for (const s of salidas) expect(ordenado(s)).toEqual(ordenado(CAMPOS_DESHACER));
  });

  it("solo lo propio: quien pide tiene que ser el autor y ser de la casa", () => {
    expect(f).toMatch(/if v_op\.autor_user_id is distinct from v_quien then\s+v_sin_hacer := jsonb_build_array\(jsonb_build_object\('motivo', 'no_es_suya'\)\);/);
    expect(f).toMatch(/not exists \(select 1 from public\.household_members m where m\.household_id = p_casa and m\.user_id = v_quien\)/);
  });

  it("si un dato que tocó cambió después, no escribe nada: mira todos los sobres antes de la primera escritura", () => {
    const mira = f.search(/if not found or v_ahora\.operacion_id is distinct from v_op\.id then\s+v_sin_hacer := v_sin_hacer \|\| [^\n]*'cambio_despues'/);
    expect(mira, "falta la comprobación de cambio_despues").toBeGreaterThan(-1);
    const corta = f.indexOf("if jsonb_array_length(v_sin_hacer) > 0 then", mira);
    const escribe = f.search(/delete from public\.sobre|update public\.sobre|update public\.operacion|update public\.household_state/);
    expect(corta).toBeGreaterThan(mira);
    expect(escribe).toBeGreaterThan(corta);
  });

  it("aplica la inversa: borra el sobre nacido en la operación, devuelve el de antes, y la marca deshecha con su fecha", () => {
    expect(f).toMatch(/if jsonb_typeof\(d->'antes'\) is distinct from 'object' then\s+delete from public\.sobre/);
    expect(f).toMatch(/v_antes := jsonb_populate_record\(null::public\.sobre, d->'antes'\);\s+update public\.sobre/);
    expect(f).toMatch(/update public\.operacion set estado = 'deshecha', deshecha_at = now\(\)/);
    // Concurrencia: la operación con «no key update» y sus sobres en el orden de aplicar_operacion.
    expect(f).toMatch(/for no key update;/);
    expect(f.match(/order by x\.value->>'campo', coalesce\(x\.value->>'persona_id', ''\)/g)).toHaveLength(2);
  });
});

describe("0115: escribir y deshacer por la clave entera del sobre (campo, persona y ámbito)", () => {
  const codigo0115 = sinComentarios(readFileSync(new URL("./migrations/0115_escribir_con_ambito.sql", import.meta.url), "utf8"));
  const aplicar = cuerpo("aplicar_operacion", codigo0115);
  const deshacer = cuerpo("deshacer_operacion", codigo0115);
  const columna = (d) => (d === "grupo" ? "grupo_id" : d);
  const variable = (d) => `v_${d}`;

  it("son las que valen en la base, con su firma y solo para service_role", () => {
    expect(ultimaQueDefine("aplicar_operacion")).toBe(codigo0115);
    expect(ultimaQueDefine("deshacer_operacion")).toBe(codigo0115);
    expect(codigo0115).toMatch(/revoke all on function public\.aplicar_operacion\(jsonb\) from public, anon, authenticated;/);
    expect(codigo0115).toMatch(/revoke all on function public\.deshacer_operacion\(uuid, uuid, uuid\) from public, anon, authenticated;/);
    expect(codigo0115).not.toMatch(/function public\.escribir_dato/);
  });

  it("un dato cuyo ámbito no es el de su campo va a sin_hacer, mirando cada dimensión de DIMENSIONES_AMBITO", () => {
    const caso = aplicar.match(/v_motivo := case([\s\S]*?)\bend;/)[1];
    const regla = caso.match(/when ([^\n]*(?:\n\s+or [^\n]*)*) then 'ambito_no_cuadra'/);
    expect(regla, "falta la regla de ambito_no_cuadra").not.toBeNull();
    for (const d of DIMENSIONES_AMBITO) expect(regla[1], d).toContain(`(${variable(d)} is not null) <> ('${d}' = any(r.ambito))`);
  });

  it("repetidos, orden de bloqueo, búsqueda y sobre nuevo, por cada dimensión", () => {
    const repetidos = aplicar.match(/group by ([^)]*\)(?:,[^)]*\))*) having count\(\*\) > 1/)[1];
    for (const d of DIMENSIONES_AMBITO) {
      expect(repetidos, d).toContain(`coalesce(x.value->>'${columna(d)}', '')`);
      for (const f of [aplicar, deshacer]) expect(f.match(/order by x\.value->>'campo'[^\n]*\n[^\n]*/g).every((o) => o.includes(`coalesce(x.value->>'${columna(d)}', '')`)), d).toBe(true);
      expect(aplicar.split(`s.${columna(d)} is not distinct from ${variable(d)}`).length - 1, d).toBe(2);
      expect(deshacer.split(`s.${columna(d)} is not distinct from nullif(d->>'${columna(d)}', '')`).length - 1, d).toBe(3);
    }
    const insert = aplicar.match(/insert into public\.sobre \(([^)]*)\)/)[1].split(",").map((c) => c.trim());
    for (const d of DIMENSIONES_AMBITO) expect(insert, d).toContain(columna(d));
  });

  it("lo que devuelven y la inversa llevan el ámbito del dato, y nada si no lo trae", () => {
    expect(aplicar).toMatch(/v_ambito := jsonb_strip_nulls\(jsonb_build_object\('grupo_id', v_grupo, 'semana', v_semana, 'dia', v_dia, 'comida', v_comida\)\);/);
    for (const clave of ["'motivo', v_motivo", "'regla', r.choque", "'sobre_id', v_sobre", "to_jsonb(v_antes) - 'household_id' end"]) {
      expect(aplicar, clave).toContain(`${clave}) || v_ambito)`);
    }
    for (const clave of ["'motivo', 'cambio_despues'", "'persona_id', v_persona"]) expect(deshacer, clave).toContain(`${clave}) || v_ambito)`);
  });

  it("el tope de datos deja un horario entero de la casa más grande en una operación", () => {
    // Medido el 2 nov 2026: npm run consulta -- "select max(n) from (select count(*) n from persona group by household_id) x" → 8.
    const PERSONAS_CASA_MAS_GRANDE = 8;
    const tope = Number(aplicar.match(/c_max_datos constant integer := (\d+);/)[1]);
    expect(tope).toBeGreaterThanOrEqual(PERSONAS_CASA_MAS_GRANDE * DIAS.length * COMIDAS.length);
  });
});

describe("0116: ficha_casa con ámbito, sin subir de versión", () => {
  const codigo0116 = sinComentarios(readFileSync(new URL("./migrations/0116_ficha_casa_ambito.sql", import.meta.url), "utf8"));
  const ficha = cuerpo("ficha_casa", codigo0116);
  const columna = (d) => (d === "grupo" ? "grupo_id" : d);

  it("es la que vale en la base, sigue en la versión que leen Lola y la app y solo para service_role", () => {
    expect(ultimaQueDefine("ficha_casa")).toBe(codigo0116);
    expect(ficha).toContain(`'v', ${FICHA_CON_ESTADO},`);
    expect([...codigo0116.matchAll(/grant\s+[^;]*?\bon\s+function\s+public\.ficha_casa\b[^;]*?\bto\s+([^;]*);/gi)].map((m) => m[1].trim())).toEqual(["service_role"]);
  });

  it("cada elemento dice su ámbito, hecho con cada dimensión de DIMENSIONES_AMBITO, y van en orden fijo", () => {
    expect(ficha).toMatch(/'ambito', d\.ambito,/);
    const objeto = ficha.match(/jsonb_strip_nulls\(jsonb_build_object\(([^)]*)\)\)/)[1];
    expect([...objeto.matchAll(/'(\w+)', s\.(\w+)/g)].map((m) => [m[1], m[2]])).toEqual(DIMENSIONES_AMBITO.map((d) => [columna(d), columna(d)]));
    expect(ficha).toMatch(/order by d\.campo, \(d\.persona_id is not null\), d\.persona_id, d\.ambito nulls first\) as datos/);
  });

  it("sin ámbito, como en la 0107; con ámbito, la base sin sobre y un elemento por sobre vigente", () => {
    const datos = ficha.slice(ficha.indexOf("), datos as ("), ficha.indexOf("select coalesce(jsonb_object_agg"));
    const ramas = datos.split(/\n\s+union all\n/);
    expect(ramas).toHaveLength(3);
    expect(ramas[0]).toMatch(/left join public\.sobre s[\s\S]*where cardinality\(x\.ambito\) = 0/);
    expect(ramas[1]).toMatch(/null::jsonb,\s+null::jsonb,[\s\S]*false\s+from sujetos x\s+where cardinality\(x\.ambito\) > 0\s*$/);
    expect(ramas[1]).not.toMatch(/public\.sobre/);
    expect(ramas[2]).toMatch(/join public\.sobre s[\s\S]*where cardinality\(x\.ambito\) > 0 and \(s\.caduca_at is null or s\.caduca_at > now\(\)\)/);
  });
});
