/**
 * Barrera (trozo 36 de #1037): ninguna columna de dueño (household_id, user_id, persona_id) sin regla de borrado.
 * La regla, las listas y su porqué viven en scripts/lib/cascadas.mjs; la lectura de las migraciones, en
 * scripts/lib/migraciones.mjs (la misma que usa cascadaPersona.test.js, que mira qué se va con la PERSONA).
 * Límites, a propósito: lo que va dentro de un cuerpo de función o de `do` no se ve (una FK creada desde ahí
 * contaría como que no está, y el test lo diría), ni `alter table … rename`.
 */
import { describe, it, expect } from "vitest";
import { aplicarEsquema, esquemaFinal, sentencias } from "../scripts/lib/migraciones.mjs";
import { ANONIMIZADAS, DIR_MIGRACIONES, columnasDeDueno, medirCascadas, sinRegla } from "../scripts/lib/cascadas.mjs";

const estadoFinal = () => esquemaFinal(DIR_MIGRACIONES);
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
    expect(columnasDeDueno(estado)).toBeGreaterThanOrEqual(55);
    expect(sinRegla(estado), "Estas columnas no dicen qué pasa con la fila al borrar su casa, su usuario o su persona: ponles `on delete cascade` o `set null`, o apúntalas en ANONIMIZADAS con su porqué").toEqual([]);
  });

  it("la cifra tablas_sin_cascada cuenta lo mismo que la barrera", () => {
    const estado = estadoFinal();
    expect(medirCascadas()).toEqual({ valor: sinRegla(estado).length, de: columnasDeDueno(estado) });
  });

  it("ninguna anonimizada sobra: cada una es una columna de dueño que existe", () => {
    const estado = estadoFinal();
    for (const k of ANONIMIZADAS.keys()) {
      const [tabla, col] = k.split(".");
      expect(estado.get(tabla)?.columnas.has(col), k).toBe(true);
    }
  });
});
