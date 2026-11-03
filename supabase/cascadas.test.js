/**
 * Barrera (trozo 36 de #1037): toda tabla que guarda algo de una casa, de un usuario o de una persona se va, o se
 * suelta, cuando se borra esa casa, ese usuario o esa persona.
 *
 * El borrado de cuenta depende de las cascadas de las FK y ya falló una vez en producción (specs/auth.md, 15 ago
 * 2026): una tabla con `household_id`, `user_id` o `persona_id` sin FK, o con una FK que no dice qué hacer, deja
 * restos o hace fallar el borrado. Aquí se recorren las migraciones en orden y, en el estado final, cada una de esas
 * columnas tiene que tener una FK con `on delete cascade` o `on delete set null`, o estar en ANONIMIZADAS con su
 * porqué (lo que se guarda a propósito, sin dueño, tras el borrado).
 *
 * Qué se va con la PERSONA y qué no lo vigila supabase/cascadaPersona.test.js; esto mira que nada quede sin regla.
 *
 * Límites, a propósito: lo que va dentro de un cuerpo `$$ … $$` no se ve (una FK creada desde un `do $$` contaría
 * como que no está, y el test lo diría: se apunta en ANONIMIZADAS o se saca del `do`), ni `alter table … rename`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eventosTabla, sentencias } from "../scripts/lib/migraciones.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** Las columnas que dicen de quién es una fila. */
export const COLUMNAS_DUENO = ["household_id", "user_id", "persona_id"];

/** Lo que basta: la fila se va con su dueño o se queda sin él. */
export const BORRADOS_VALIDOS = ["cascade", "set null"];

/**
 * Columnas de dueño que se quedan sin regla de borrado a propósito, con su porqué. `tabla.columna`.
 * Vacía el 3 nov 2026: en la base, las 61 columnas de dueño tienen FK con cascade o set null.
 */
export const ANONIMIZADAS = new Map([]);

const TABLA = String.raw`(?:if\s+not\s+exists\s+|if\s+exists\s+|only\s+)*(?:"?public"?\.)?"?(\w+)"?`;
const BORRADO = /on\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i;

/** Parte por comas de primer nivel (fuera de paréntesis). */
function trozos(texto) {
  const out = [];
  let nivel = 0;
  let actual = "";
  for (const ch of texto) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { out.push(actual.trim()); actual = ""; continue; }
    actual += ch;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

/** Una FK de un trozo («col tipo references t(…) on delete …» o «[constraint n] foreign key (…) references …»). */
function fkDe(trozo, tabla) {
  const ref = /\breferences\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i.exec(trozo);
  if (!ref) return null;
  const onDelete = (BORRADO.exec(trozo)?.[1] ?? "no action").toLowerCase().replace(/\s+/g, " ");
  const destino = `${(ref[1] ?? "public").toLowerCase()}.${ref[2].toLowerCase()}`;
  const tabla_ = /^(?:constraint\s+"?(\w+)"?\s+)?foreign\s+key\s*\(([^)]*)\)/i.exec(trozo);
  if (tabla_) {
    const columnas = tabla_[2].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase());
    return { nombre: (tabla_[1] ?? `${tabla}_${columnas.join("_")}_fkey`).toLowerCase(), columnas, destino, onDelete };
  }
  const col = /^"?(\w+)"?/.exec(trozo)[1].toLowerCase();
  const nombre = /\bconstraint\s+"?(\w+)"?\s+references\b/i.exec(trozo)?.[1]?.toLowerCase();
  return { nombre: nombre ?? `${tabla}_${col}_fkey`, columnas: [col], destino, onDelete };
}

/**
 * Aplica una sentencia al estado: Map tabla → { columnas: Set, fks: Map nombre → fk }.
 * Solo `public`; lo que no entiende no lo toca.
 */
export function aplicar(estado, sentencia) {
  const s = sentencia.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''");
  for (const e of eventosTabla(s)) {
    if (e.tipo === "tabla" && e.esquema === "public" && e.accion === "borra") estado.delete(e.nombre);
  }
  const crea = new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+${TABLA}\s*\(([\s\S]*)\)`, "i").exec(s);
  if (crea && !/^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?"?(?!public)\w+"?\./i.test(s)) {
    const tabla = crea[1].toLowerCase();
    // `create table if not exists` de una que ya está no hace nada.
    if (/if\s+not\s+exists/i.test(s.slice(0, crea.index + 40)) && estado.has(tabla)) return estado;
    const t = { columnas: new Set(), fks: new Map() };
    for (const trozo of trozos(crea[2])) {
      const col = /^"?(\w+)"?\s/.exec(trozo)?.[1]?.toLowerCase();
      if (col && !["constraint", "foreign", "primary", "unique", "check", "exclude", "like"].includes(col)) t.columnas.add(col);
      const fk = fkDe(trozo, tabla);
      if (fk) t.fks.set(fk.nombre, fk);
    }
    estado.set(tabla, t);
    return estado;
  }
  const cambia = new RegExp(String.raw`^alter\s+table\s+${TABLA}\s+([\s\S]*)$`, "i").exec(s);
  if (cambia && estado.has(cambia[1].toLowerCase())) {
    const tabla = cambia[1].toLowerCase();
    const t = estado.get(tabla);
    for (const trozo of trozos(cambia[2])) {
      const anade = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\s\S]*)$/i.exec(trozo);
      const quitaCol = /^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(trozo);
      const quitaFk = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(trozo);
      if (quitaCol) {
        const col = quitaCol[1].toLowerCase();
        t.columnas.delete(col);
        for (const [n, fk] of t.fks) if (fk.columnas.includes(col)) t.fks.delete(n);
      } else if (quitaFk) {
        t.fks.delete(quitaFk[1].toLowerCase());
      } else if (anade) {
        const resto = anade[1];
        const fk = fkDe(resto, tabla);
        if (!/^(?:constraint|foreign|primary|unique|check|exclude)\b/i.test(resto)) t.columnas.add(/^"?(\w+)"?/.exec(resto)[1].toLowerCase());
        if (fk) t.fks.set(fk.nombre, fk);
      }
    }
  }
  return estado;
}

/** El estado final tras todas las migraciones de `dir`. */
export function estadoFinal(dir = DIR) {
  const estado = new Map();
  for (const f of readdirSync(dir).filter((n) => /^\d{4}.*\.sql$/.test(n)).sort()) {
    for (const s of sentencias(readFileSync(join(dir, f), "utf8"))) aplicar(estado, s);
  }
  return estado;
}

/** Las columnas de dueño sin una FK que diga qué hacer al borrar: ["tabla.columna (lo que tiene)"]. */
export function sinRegla(estado, anonimizadas = ANONIMIZADAS) {
  const malas = [];
  for (const [tabla, t] of [...estado].sort(([a], [b]) => a.localeCompare(b))) {
    for (const col of COLUMNAS_DUENO) {
      if (!t.columnas.has(col) || anonimizadas.has(`${tabla}.${col}`)) continue;
      const fks = [...t.fks.values()].filter((fk) => fk.columnas.includes(col));
      if (fks.some((fk) => BORRADOS_VALIDOS.includes(fk.onDelete))) continue;
      malas.push(`${tabla}.${col} (${fks.length ? fks.map((fk) => `${fk.destino} on delete ${fk.onDelete}`).join(", ") : "sin FK"})`);
    }
  }
  return malas;
}

const estadoDe = (...sql) => sql.reduce((e, x) => { for (const s of sentencias(x)) aplicar(e, s); return e; }, new Map());

describe("cascadas: ninguna fila de una casa, un usuario o una persona se queda sin regla de borrado", () => {
  it("lee las formas que usamos: en línea, de tabla, con nombre y por alter", () => {
    const e = estadoDe(
      `create table if not exists public.a (id uuid primary key,
         household_id uuid not null references public.households(id) on delete cascade,
         user_id uuid references auth.users(id) on delete set null);`,
      `create table public.b (household_id uuid not null, persona_id text,
         constraint b_persona_fk foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade);`,
      `alter table public.a add column if not exists persona_id text,
         add constraint a_persona_fk foreign key (household_id, persona_id) references public.persona(household_id, id) on delete set null (persona_id) not valid;`,
    );
    expect(sinRegla(e)).toEqual([]);
    expect([...e.get("a").columnas].sort()).toEqual(["household_id", "id", "persona_id", "user_id"]);
    expect(e.get("a").fks.get("a_user_id_fkey")).toMatchObject({ destino: "auth.users", onDelete: "set null" });
  });

  it("una columna de dueño sin FK, o con una FK sin on delete, sale", () => {
    const e = estadoDe(
      "create table public.c (id uuid, household_id uuid not null);",
      "create table public.d (user_id uuid references auth.users(id));",
    );
    expect(sinRegla(e)).toEqual(["c.household_id (sin FK)", "d.user_id (auth.users on delete no action)"]);
    expect(sinRegla(e, new Map([["c.household_id", "a propósito"], ["d.user_id", "a propósito"]]))).toEqual([]);
  });

  it("cuenta la última: quitar la FK la deja sin regla; volver a ponerla, con; borrar la tabla, nada", () => {
    const crea = "create table public.e (household_id uuid constraint e_casa_fk references public.households(id) on delete cascade);";
    expect(sinRegla(estadoDe(crea, "alter table public.e drop constraint e_casa_fk;"))).toEqual(["e.household_id (sin FK)"]);
    expect(sinRegla(estadoDe(crea, "alter table public.e drop constraint if exists e_casa_fk, add constraint e_casa_fk foreign key (household_id) references public.households(id) on delete cascade;"))).toEqual([]);
    expect(sinRegla(estadoDe("create table public.f (household_id uuid);", "drop table if exists public.f;"))).toEqual([]);
    expect(sinRegla(estadoDe("create table public.g (household_id uuid);", "alter table public.g drop column household_id;"))).toEqual([]);
  });

  it("las migraciones de verdad: cada columna de dueño tiene su regla", () => {
    const estado = estadoFinal();
    // Suelo: si la lectura se rompe y no ve nada, el test pasaría vacío. El 3 nov 2026 la base tenía 61.
    const columnas = [...estado.values()].reduce((n, t) => n + COLUMNAS_DUENO.filter((c) => t.columnas.has(c)).length, 0);
    expect(columnas).toBeGreaterThanOrEqual(55);
    expect(sinRegla(estado), "Estas columnas no dicen qué pasa con la fila al borrar su casa, su usuario o su persona: ponles `on delete cascade` o `set null`, o apúntalas en ANONIMIZADAS con su porqué").toEqual([]);
  });

  it("ninguna anonimizada sobra: cada una es una columna de dueño que existe", () => {
    const estado = estadoFinal();
    for (const k of ANONIMIZADAS.keys()) {
      const [tabla, col] = k.split(".");
      expect(estado.get(tabla)?.columnas.has(col), k).toBe(true);
    }
  });
});
