/**
 * Barrera: ninguna FK nueva borra en cascada al borrar una persona.
 *
 * La sincronización por clave (0081, y desde la 0089 en cada guardado) borra
 * la fila de `persona` de quien sale de data.members. Todo lo que cuelgue de
 * ella con `on delete cascade` se va con ella sin que nadie lo vea: así se
 * perdían las tareas de la 0083 hasta que la 0089 las pasó a `set null`.
 *
 * Solo pueden ir en cascada su salud (dato de salud: debe irse con ella) y su
 * pertenencia a un grupo. Cualquier otra tabla que apunte a persona lleva
 * `set null` o `restrict`. Si de verdad tiene que irse con la persona, se
 * añade aquí con su porqué, en el mismo PR y con el juez auditor-datos.
 *
 * Mira el estado final: si una migración posterior cambia el on delete de una
 * FK, cuenta la última (por eso la 0083 no falla).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { borrados } from "../scripts/lib/migraciones.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export const CASCADA_PERMITIDA = new Map([
  ["persona_alergia", "salud: se va con la persona (PRINCIPIOS §17)"],
  ["persona_intolerancia", "salud: se va con la persona (PRINCIPIOS §17)"],
  ["persona_estado", "salud: se va con la persona (PRINCIPIOS §17)"],
  ["persona_perfil_salud", "salud: se va con la persona (PRINCIPIOS §17)"],
  ["grupo_persona", "pertenencia a un grupo: sin la persona no significa nada"],
]);

/** Quita comentarios y cuerpos $x$…$x$, que no declaran FKs de tabla. */
function limpiar(sql) {
  return sql
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''")
    .replace(/--[^\n]*/g, "");
}

/**
 * FKs hacia persona de un SQL, en orden: { tabla, nombre, onDelete }.
 * La tabla es la del `create table` o `alter table` de la sentencia.
 */
export function fksAPersona(sql) {
  const fks = [];
  for (const sentencia of limpiar(sql).split(";")) {
    if (!/references\s+(public\.)?persona\s*\(/i.test(sentencia)) continue;
    const tabla = /(?:create\s+table|alter\s+table)\s+(?:if\s+not\s+exists\s+|only\s+)?(?:public\.)?(\w+)/i.exec(sentencia)?.[1];
    const trozos = sentencia.split(/(?=\breferences\s+(?:public\.)?\w+\s*\()/i);
    for (let i = 1; i < trozos.length; i++) {
      if (!/^references\s+(public\.)?persona\s*\(/i.test(trozos[i])) continue;
      const nombre = /constraint\s+(\w+)\s+foreign\s+key\s*\([^)]*\)\s*$/i.exec(trozos[i - 1])?.[1] ?? null;
      const accion = /on\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i.exec(trozos[i].split(/,\s*(?:add\s|foreign\s|constraint\s|\w+\s+\w)/i)[0])?.[1];
      fks.push({ tabla, nombre, onDelete: (accion ?? "no action").toLowerCase().replace(/\s+/g, " ") });
    }
  }
  return fks;
}

/** Estado final tras todas las migraciones: la última definición de cada FK gana. */
function estadoFinal() {
  const fks = new Map();
  for (const f of readdirSync(DIR).filter((n) => /^\d{4}.*\.sql$/.test(n)).sort()) {
    const sql = readFileSync(join(DIR, f), "utf8");
    for (const fk of fksAPersona(sql)) {
      fks.set(`${fk.tabla}:${fk.nombre ?? "persona"}`, { ...fk, fichero: f });
    }
    // Una tabla que borra un `drop table` se lleva sus FK.
    for (const b of borrados(sql)) {
      if (b.tipo === "tabla") for (const k of [...fks.keys()]) if (k.startsWith(`${b.nombre}:`)) fks.delete(k);
    }
  }
  return [...fks.values()];
}

describe("cascada hacia persona", () => {
  it("lee bien las formas que usamos", () => {
    expect(fksAPersona(`create table if not exists public.persona_alergia (
      household_id uuid not null,
      foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
    );`)).toEqual([{ tabla: "persona_alergia", nombre: null, onDelete: "cascade" }]);
    expect(fksAPersona(`alter table public.bot_tareas
      drop constraint if exists bot_tareas_persona_fk,
      add constraint bot_tareas_persona_fk
        foreign key (household_id, persona_id) references public.persona(household_id, id)
        on delete set null (persona_id) not valid;`)).toEqual([{ tabla: "bot_tareas", nombre: "bot_tareas_persona_fk", onDelete: "set null" }]);
    expect(fksAPersona(`create table public.x (
      a text references public.grupo(id) on delete cascade,
      persona_id text references public.persona(id)
    );`)).toEqual([{ tabla: "x", nombre: null, onDelete: "no action" }]);
    expect(fksAPersona("-- references public.persona(id) on delete cascade\nselect 1;")).toEqual([]);
  });

  it("la 0083 en cascada la deja en set null la 0089", () => {
    const tareas = estadoFinal().find((f) => f.tabla === "bot_tareas");
    expect(tareas).toMatchObject({ onDelete: "set null", fichero: expect.stringMatching(/^0089/) });
  });

  it("solo la salud y los grupos se borran en cascada con la persona", () => {
    const malas = estadoFinal()
      .filter((f) => f.onDelete === "cascade" && !CASCADA_PERMITIDA.has(f.tabla))
      .map((f) => `${f.fichero}: ${f.tabla}${f.nombre ? ` (${f.nombre})` : ""}`);
    expect(malas, "Estas FKs borran en cascada al quitar a alguien de la familia. Usa `on delete set null` o `restrict`, o añádela a CASCADA_PERMITIDA con su porqué").toEqual([]);
  });
});
