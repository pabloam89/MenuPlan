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
 * La lectura de columnas y FK es la de scripts/lib/migraciones.mjs (aplicarEsquema), la misma que usa
 * cascadaPersona.test.js. Límites, a propósito: lo que va dentro de un cuerpo `$$ … $$` no se ve (una FK creada desde un `do $$` contaría
 * como que no está, y el test lo diría: se apunta en ANONIMIZADAS o se saca del `do`), ni `alter table … rename`.
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCION_BORRADO, aplicarEsquema, esquemaFinal, sentencias } from "../scripts/lib/migraciones.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** Las columnas que dicen de quién es una fila. */
export const COLUMNAS_DUENO = ["household_id", "user_id", "persona_id"];

/** Lo que basta: la fila se va con su dueño o se queda sin él. */
export const BORRADOS_VALIDOS = [ACCION_BORRADO.CASCADE, ACCION_BORRADO.SET_NULL];

/**
 * Columnas de dueño que se quedan sin regla de borrado a propósito, con su porqué. `tabla.columna`.
 * Vacía el 3 nov 2026: en la base, las 61 columnas de dueño tienen FK con cascade o set null.
 */
export const ANONIMIZADAS = new Map([]);

/** El estado tras todas las migraciones (la lectura vive en scripts/lib/migraciones.mjs). */
export const estadoFinal = (dir = DIR) => esquemaFinal(dir);

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

const estadoDe = (...sql) => sql.reduce((e, x) => { for (const s of sentencias(x)) aplicarEsquema(e, s); return e; }, new Map());

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
