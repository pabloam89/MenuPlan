import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El fusible de las migraciones.
 *
 * ── Qué problema sujeta ───────────────────────────────────────────────────
 * Había TRES números repetidos en el repo — 0003, 0006 y 0051 — cada uno con
 * dos ficheros distintos. No rompe el despliegue (`supabase db push` ordena por
 * nombre y desempata de forma determinista), pero rompe a las personas: "aplica
 * la 0051" no significaba nada, porque eran dos cosas sin relación ninguna
 * (`0051_ops_reader` y `0051_recipe_base_mode_and_nutrients`). Con 54 ficheros
 * y un historial que se ha aplicado a mano desde el editor SQL, el número es lo
 * único que permite hablar de una migración sin ambigüedad.
 *
 * ── Por qué no se renumeraron los tres duplicados que ya existen ───────────
 * Porque ya están aplicados en producción, y algunos están registrados en
 * `supabase_migrations.schema_migrations` POR SU NOMBRE (`0051_ops_reader`).
 * Renombrarlos ahora rompería la única trazabilidad que queda entre el repo y
 * la base, a cambio de que `ls` se vea más bonito. Se quedan como están, y este
 * test impide que haya un cuarto.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

const ficheros = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * Los duplicados HISTÓRICOS, congelados.
 *
 * Están aquí para que el test pase sin tener que renombrarlos, y para que la
 * lista sea incómoda de ampliar: añadir un número a esta constante debería
 * costar más que elegir el siguiente número libre.
 */
const DUPLICADOS_HEREDADOS = new Set(["0003", "0006", "0051"]);

describe("las migraciones se pueden nombrar sin ambigüedad", () => {
  it("ningún número nuevo repetido", () => {
    const porNumero = new Map();
    for (const f of ficheros) {
      const n = f.slice(0, 4);
      porNumero.set(n, [...(porNumero.get(n) ?? []), f]);
    }
    const repetidos = [...porNumero.entries()]
      .filter(([n, fs_]) => fs_.length > 1 && !DUPLICADOS_HEREDADOS.has(n))
      .map(([n, fs_]) => `${n}: ${fs_.join(" + ")}`);

    expect(
      repetidos,
      `Estas migraciones comparten número:\n  ${repetidos.join("\n  ")}\n`
      + "Coge el siguiente número libre. Dos ficheros con el mismo número hacen\n"
      + "que 'aplica la 00XX' no signifique nada, que es como se quedó sin\n"
      + "aplicar la 0051 de base_mode durante meses.",
    ).toEqual([]);
  });

  it("los duplicados heredados siguen siendo exactamente los que sabemos", () => {
    // Si uno desaparece (porque alguien lo renombró bien), que este test lo
    // diga y se pueda quitar de la lista, en vez de dejarla creciendo sola.
    const conDuplicado = new Set(
      ficheros
        .map((f) => f.slice(0, 4))
        .filter((n, i, arr) => arr.indexOf(n) !== i),
    );
    expect([...conDuplicado].sort()).toEqual([...DUPLICADOS_HEREDADOS].sort());
  });

  it("todos empiezan por cuatro dígitos y un guion bajo", () => {
    const malos = ficheros.filter((f) => !/^\d{4}_/.test(f));
    expect(malos, `Nombre fuera de convención: ${malos.join(", ")}`).toEqual([]);
  });

  it("no hay huecos sin explicar en la numeración", () => {
    // Un hueco suele significar una migración retirada (la 0051 de reglas se
    // retiró antes de aplicarse por una brecha de RLS). Que salga en el fallo
    // obliga a mirarlo en vez de asumir que se perdió un fichero.
    const nums = [...new Set(ficheros.map((f) => Number(f.slice(0, 4))))].sort((a, b) => a - b);
    const huecos = [];
    for (let n = nums[0]; n < nums[nums.length - 1]; n++) {
      if (!nums.includes(n)) huecos.push(String(n).padStart(4, "0"));
    }
    expect(huecos, `Huecos en la numeración: ${huecos.join(", ")}`).toEqual([]);
  });
});
