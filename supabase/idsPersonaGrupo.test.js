/**
 * Barrera: ninguna columna que guarde ids de persona o de grupo se queda fuera
 * del paso a UUID (issue #194, migración 0091).
 *
 * Los ids de persona y grupo viven en muchos sitios además de persona.id y
 * grupo.id: FK (persona_alergia…, bot_tareas.persona_id), texto sin FK
 * (bot_tareas.clave «alergias:<persona>», user_menu_recipes.recipe_id
 * «<grupo>__<receta>») y JSON (el horario «<persona>|Lun|Comida», el plan por
 * grupo, la compra…). La 0091 los cambia todos: las FK las lee de
 * pg_constraint (entran solas), y el resto de su INVENTARIO. Una columna que
 * nadie apunte ahí se quedaría con ids viejos, y la 0091 abortaría al
 * aplicarse (su barrido final) o, peor, una pasada posterior la olvidaría.
 *
 * Por eso cada columna JSON de las migraciones, y cada columna cuyo nombre
 * suena a persona, grupo, miembro, comensal o receta del plan, tiene que estar
 * clasificada: en el INVENTARIO de la 0091, con FK a persona o grupo, o en
 * NO_LLEVAN con su porqué. Una columna nueva sin clasificar pone el CI en rojo.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eventosTabla } from "../scripts/lib/migraciones.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRACION = "0091_ids_persona_grupo_a_uuid.sql";
const MODOS = new Set(["jsonb_casa", "jsonb", "jsonb_sin_texto", "texto"]);

/** Nombres de columna que suelen llevar un id de persona o de grupo. */
const NOMBRE_SOSPECHOSO = /persona|grupo|group|member|miembro|comensal|eater|recipe_id/;

/**
 * Columnas que parecen llevar ids de persona o grupo y no los llevan. Cada una
 * con su porqué; el barrido final de la 0091 lo comprobó el 8 oct 2026 (0
 * apariciones en todas).
 */
export const NO_LLEVAN = new Map([
  ["app_feedback.metadata", "pantalla, versión y contexto del comentario; sin ids de la casa"],
  ["bot_cola.item", "el mensaje entrante mientras espera turno (texto de la persona); dura segundos"],
  ["bot_idempotencia.resultado", "la respuesta ya dada a un turno repetido; caduca sola"],
  ["cookings.sticker", "el sello decorativo de la foto"],
  ["persona.resto", "lo que no tiene columna de una persona: lo recalcula del JSON de la casa cada guardado (0089)"],
  ["user_recipes.ingredients", "receta propia: sus ingredientes"],
  ["user_recipes.methods", "receta propia: sus métodos"],
  ["user_recipes.owner_snapshot", "receta propia: quién la publicó (usuario, no persona de la casa)"],
  ["user_recipes.steps_rich", "receta propia: sus pasos"],
  ["household_recipe_discards.recipe_id", "id base de la receta, sin prefijo de grupo"],
  ["recipe_votes.recipe_id", "id base de la receta, sin prefijo de grupo"],
  ["recipe_share_links.recipe_id", "id base de la receta propia que se comparte"],
  ["household_favorites.recipe_id", "id base de la receta, sin prefijo de grupo"],
  ["recipe_collections.recipe_id", "id base de la receta en una carpeta"],
  ["user_recipes.copied_from_recipe_id", "id base de la receta de la que se copió"],
  ["user_recipe_discards.recipe_id", "tabla que no existe en producción (ESTADO.md, 0010)"],
]);

/** Quita comentarios y cuerpos $x$…$x$ (no declaran columnas de tabla). */
const limpiar = (sql) => sql
  .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, "''")
  .replace(/--[^\n]*/g, "")
  .toLowerCase();

/** Parte por comas que no estén dentro de paréntesis. */
function trozos(s) {
  const r = [];
  let prof = 0;
  let desde = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") prof++;
    else if (s[i] === ")") prof--;
    else if (s[i] === "," && prof === 0) { r.push(s.slice(desde, i)); desde = i + 1; }
  }
  r.push(s.slice(desde));
  return r.map((x) => x.trim());
}

const NO_COLUMNA = /^(constraint|primary|foreign|unique|check|exclude|like)$/;
const RE_FK = /foreign\s+key\s*\(\s*household_id\s*,\s*"?(\w+)"?\s*\)\s*references\s+(?:public\.)?(persona|grupo)\s*\(/g;

/** Columnas declaradas en un SQL: { "tabla.col": tipo }, y FKs a persona o grupo. */
export function columnasDe(sql) {
  const cols = new Map();
  const fks = new Set();
  const borradas = new Set(); // tablas de `public` que borra este SQL (las de antes ya no existen)
  for (const s of limpiar(sql).split(";").map((x) => x.trim())) {
    // En orden: un `drop table x` quita lo que este mismo fichero había declarado de x,
    // y un `create table x` posterior lo vuelve a declarar más abajo.
    for (const e of eventosTabla(s)) {
      if (e.accion !== "borra" || e.tipo !== "tabla" || e.esquema !== "public") continue;
      borradas.add(e.nombre);
      for (const k of [...cols.keys()]) if (k.startsWith(`${e.nombre}.`)) cols.delete(k);
      for (const k of [...fks]) if (k.startsWith(`${e.nombre}.`)) fks.delete(k);
    }
    let tabla = null;
    const ct = /^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*)\)/.exec(s);
    const at = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+([\s\S]*)$/.exec(s);
    if (ct) {
      tabla = ct[1];
      for (const c of trozos(ct[2])) {
        const k = /^"?(\w+)"?\s+([\w[\]]+)/.exec(c);
        if (k && !NO_COLUMNA.test(k[1])) cols.set(`${tabla}.${k[1]}`, k[2]);
        const ref = /\breferences\s+(?:public\.)?(persona|grupo)\s*\(/.exec(c);
        if (k && ref && !NO_COLUMNA.test(k[1])) fks.add(`${tabla}.${k[1]}`);
      }
    } else if (at) {
      tabla = at[1];
      for (const c of trozos(at[2])) {
        const k = /^add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s+([\w[\]]+)/.exec(c);
        if (k) cols.set(`${tabla}.${k[1]}`, k[2]);
      }
    }
    if (tabla) for (const m of s.matchAll(RE_FK)) fks.add(`${tabla}.${m[1]}`);
  }
  return { cols, fks, borradas };
}

/** El INVENTARIO de la 0091: [tabla, columna, modo]. */
export function inventarioDe(sql) {
  const m = /v_inventario\s+constant\s+jsonb\s*:=\s*'([\s\S]*?)'::jsonb/.exec(sql);
  if (!m) throw new Error("No encuentro v_inventario en la 0091");
  return JSON.parse(m[1]);
}

export function todas(dir = DIR) {
  const cols = new Map();
  const fks = new Set();
  for (const f of readdirSync(dir).filter((n) => /^\d{4}.*\.sql$/.test(n)).sort()) {
    const r = columnasDe(readFileSync(join(dir, f), "utf8"));
    // Un `drop table` de este fichero se lleva lo que declararon los anteriores; lo que el
    // propio fichero declara de esa tabla es posterior al drop (columnasDe ya lo ordenó).
    for (const t of r.borradas) {
      for (const k of [...cols.keys()]) if (k.startsWith(`${t}.`)) cols.delete(k);
      for (const k of [...fks]) if (k.startsWith(`${t}.`)) fks.delete(k);
    }
    for (const [k, v] of r.cols) cols.set(k, v);
    for (const k of r.fks) fks.add(k);
  }
  return { cols, fks };
}

const sql0091 = readFileSync(join(DIR, MIGRACION), "utf8");
const inventario = inventarioDe(sql0091);
const enInventario = new Set(inventario.map(([t, c]) => `${t}.${c}`));

describe("ids de persona y grupo: ninguna columna fuera del paso a UUID", () => {
  it("el lector ve columnas, FKs compuestas y FKs de columna", () => {
    const { cols, fks } = columnasDe(`
      create table if not exists public.x (
        household_id uuid not null,
        persona_id text,
        datos jsonb not null default '{}'::jsonb,
        dueno text references public.persona(id) on delete set null,
        foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
      );
      alter table public.y add column if not exists plan jsonb, add column grupo_id text;
      -- create table public.z (comentario jsonb);
      create or replace function f() returns void as $$ create table q (a jsonb); $$ language sql;`);
    expect(Object.fromEntries(cols)).toEqual({
      "x.household_id": "uuid", "x.persona_id": "text", "x.datos": "jsonb", "x.dueno": "text",
      "y.plan": "jsonb", "y.grupo_id": "text",
    });
    expect([...fks].sort()).toEqual(["x.dueno", "x.persona_id"]);
  });

  it("el INVENTARIO de la 0091 se lee y solo usa modos que la 0091 sabe hacer", () => {
    expect(inventario.length).toBeGreaterThan(10);
    const { cols } = todas();
    for (const [t, c, modo, casa, usuario] of inventario) {
      expect(MODOS.has(modo), `${t}.${c}: modo ${modo}`).toBe(true);
      // De quién es la fila: la 0091 aborta si un id viejo sale en otra casa.
      expect(casa ?? usuario, `${t}.${c}: sin columna de dueño`).toBeTruthy();
      for (const d of [casa, usuario].filter(Boolean)) {
        expect(cols.has(`${t}.${d}`), `${t}.${d}: columna de dueño que ninguna migración declara`).toBe(true);
      }
    }
    expect(inventario.filter(([, , m]) => m === "jsonb_casa").map(([t]) => t)).toEqual(["household_state"]);
  });

  it("cada columna del INVENTARIO existe en alguna migración, y no tiene FK (esas van solas)", () => {
    const { cols, fks } = todas();
    const faltan = [...enInventario].filter((k) => !cols.has(k));
    expect(faltan, "Columnas del INVENTARIO que ninguna migración declara").toEqual([]);
    const conFk = [...enInventario].filter((k) => fks.has(k));
    expect(conFk, "Con FK a persona o grupo las mueve la 0091 desde pg_constraint: no van en el INVENTARIO").toEqual([]);
  });

  it("las FK a persona o grupo las mueve la 0091 leyéndolas del catálogo", () => {
    expect(sql0091).toMatch(/c\.confrelid\s+in\s+\('public\.persona'::regclass,\s*'public\.grupo'::regclass\)/);
    const { cols, fks } = todas();
    const noTexto = [...fks].filter((k) => cols.get(k) !== "text");
    expect(noTexto, "La 0091 solo sabe mover FK de texto; si ya es uuid, revisa la migración").toEqual([]);
  });

  it("toda columna JSON o con nombre de persona, grupo o receta del plan está clasificada", () => {
    const { cols, fks } = todas();
    const sinClasificar = [...cols]
      .filter(([k, tipo]) => /^jsonb?$/.test(tipo) || NOMBRE_SOSPECHOSO.test(k.split(".")[1]))
      .map(([k]) => k)
      .filter((k) => !enInventario.has(k) && !fks.has(k) && !NO_LLEVAN.has(k))
      .filter((k) => !/^(persona|grupo)\.id$/.test(k));
    expect(sinClasificar, "Añádela al INVENTARIO de una migración que la pase a UUID, o a NO_LLEVAN con su porqué").toEqual([]);
  });

  it("NO_LLEVAN no guarda columnas que ya no existen ni que estén en el INVENTARIO", () => {
    const { cols } = todas();
    const sobran = [...NO_LLEVAN.keys()].filter((k) => !cols.has(k) || enInventario.has(k));
    expect(sobran).toEqual([]);
  });
});

describe("columnasDe() y el drop table (#302)", () => {
  it("devuelve las tablas que borra, sin contar comentarios", () => {
    const r = columnasDe("create table public.a (x int);\n-- drop table public.z;\ndrop table if exists public.a, public.b;");
    expect([...r.borradas].sort()).toEqual(["a", "b"]);
  });

  /** Una carpeta de migraciones sintética: { "0001_a": sql, … }. */
  const carpeta = (migraciones) => {
    const d = mkdtempSync(join(tmpdir(), "menuplan-ids-"));
    for (const [n, sql] of Object.entries(migraciones)) writeFileSync(join(d, `${n}.sql`), sql);
    return d;
  };
  const COSA = "create table public.cosa_nueva (id uuid primary key, persona_id uuid references public.persona(id) on delete cascade, grupo_x jsonb);";

  it("un drop de una migración posterior se lleva las columnas y FK de la tabla", () => {
    const d = carpeta({ "0001_a": COSA, "0002_b": "drop table public.cosa_nueva;" });
    const { cols, fks } = todas(d);
    expect([...cols.keys(), ...fks]).toEqual([]);
    rmSync(d, { recursive: true });
  });

  it("drop + create en el mismo fichero: la tabla vive con lo que declara el create", () => {
    const d = carpeta({ "0001_a": "drop table if exists public.cosa_nueva;\n" + COSA });
    const { cols, fks } = todas(d);
    expect([...cols.keys()].sort()).toEqual(["cosa_nueva.grupo_x", "cosa_nueva.id", "cosa_nueva.persona_id"]);
    expect([...fks]).toEqual(["cosa_nueva.persona_id"]);
    rmSync(d, { recursive: true });
  });

  it("create + drop en el mismo fichero: la tabla no vive; y drop de otro esquema no cuenta", () => {
    const d = carpeta({ "0001_a": COSA + "\ndrop table public.cosa_nueva;", "0002_b": COSA.replace("cosa_nueva", "otra") + "\ndrop table otro.otra;" });
    const { cols } = todas(d);
    expect([...cols.keys()].some((k) => k.startsWith("cosa_nueva."))).toBe(false);
    expect([...cols.keys()].some((k) => k.startsWith("otra."))).toBe(true);
    rmSync(d, { recursive: true });
  });

  it("recrear después de un drop en otro fichero: vuelve a contar solo lo nuevo", () => {
    const d = carpeta({ "0001_a": COSA, "0002_b": "drop table public.cosa_nueva;", "0003_c": "create table public.cosa_nueva (id uuid primary key);" });
    expect([...todas(d).cols.keys()]).toEqual(["cosa_nueva.id"]);
    rmSync(d, { recursive: true });
  });
});
