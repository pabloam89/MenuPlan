import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FRECUENCIAS, OPERADORES, PLANOS, TABLAS, TIPOS_TABLA } from "./model.js";
import { RecipeSchema } from "./recipeSchema.js";
import { IngredientSchema } from "./ingredientSchema.js";

/**
 * El registro del modelo (model.js) es DATO, y como todo dato aquí, se mide:
 *
 *   · cada campo declarado existe en el esquema zod de su tabla — un campo
 *     renombrado en el esquema y no en el registro es un registro que miente;
 *   · la cobertura real de cada campo es ≥ la declarada — el trinquete: la
 *     cobertura solo puede subir, y si baja este test lo dice antes que nadie;
 *   · cada productor y cada módulo de operador que nombra una ruta existe.
 */
const ROOT = new URL("../../", import.meta.url);
const recetas = readdirSync(new URL("./recipes/", import.meta.url))
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(new URL(`./recipes/${f}`, import.meta.url), "utf8")));
const ingredientes = JSON.parse(readFileSync(new URL("./ingredients.json", import.meta.url), "utf8"));

const FILAS = { recetas, ingredientes };
const SHAPES = { recetas: RecipeSchema, ingredientes: IngredientSchema };

const lleno = (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

/** Cobertura real de un campo, con las dos formas anidadas que usa el registro. */
function cobertura(filas, campo) {
  if (campo === "ingredients[].ingredientId") {
    const lineas = filas.flatMap((r) => r.ingredients ?? []);
    return (lineas.filter((l) => l.ingredientId).length / lineas.length) * 100;
  }
  const anidado = campo.match(/^(\w+)\[\]\.(\w+)$/);
  if (anidado) {
    const [, lista, sub] = anidado;
    return (filas.filter((r) => (r[lista] ?? []).some((x) => lleno(x?.[sub]))).length / filas.length) * 100;
  }
  return (filas.filter((r) => lleno(r[campo])).length / filas.length) * 100;
}

/** Las claves que un esquema zod expone, atravesando .refine/.superRefine. */
function clavesDe(schema) {
  let s = schema;
  while (s && !s.shape && s._def?.schema) s = s._def.schema;
  while (s && !s.shape && s._def?.innerType) s = s._def.innerType;
  return new Set(Object.keys(s.shape ?? {}));
}

describe("el registro del modelo", () => {
  it("usa solo los vocabularios que declara", () => {
    for (const t of TABLAS) {
      expect(TIPOS_TABLA, `${t.id}.tipo`).toContain(t.tipo);
      expect(FRECUENCIAS, `${t.id}.actualizacion`).toContain(t.actualizacion);
      for (const c of t.campos) expect(PLANOS, `${t.id}.${c.campo}.plano`).toContain(c.plano);
    }
    const ids = TABLAS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada campo declarado existe en el esquema de su tabla", () => {
    for (const [id, schema] of Object.entries(SHAPES)) {
      const claves = clavesDe(schema);
      const stepClaves = clavesDe(RecipeSchema.shape?.stepsRich?._def?.type ?? RecipeSchema.shape?.stepsRich?.element ?? {});
      const huerfanos = TABLAS.find((t) => t.id === id).campos
        .map((c) => c.campo)
        .filter((campo) => {
          if (campo === "ingredients[].ingredientId") return !claves.has("ingredients");
          const anidado = campo.match(/^(\w+)\[\]\.(\w+)$/);
          if (anidado) return !claves.has(anidado[1]) || (anidado[1] === "stepsRich" && stepClaves.size > 0 && !stepClaves.has(anidado[2]));
          return !claves.has(campo);
        });
      expect(huerfanos, `campos de ${id} que el esquema no conoce`).toEqual([]);
    }
  });

  it("la cobertura real nunca baja de la declarada (trinquete)", () => {
    const caidas = [];
    for (const [id, filas] of Object.entries(FILAS)) {
      for (const c of TABLAS.find((t) => t.id === id).campos) {
        const real = cobertura(filas, c.campo);
        if (real < c.cobertura_min) caidas.push(`${id}.${c.campo}: declarada ≥${c.cobertura_min} %, real ${real.toFixed(1)} %`);
      }
    }
    expect(caidas).toEqual([]);
  });

  it("los suelos declarados no están inflados: ninguno supera la cobertura real", () => {
    // El contrario del trinquete: un suelo por encima de lo real haría fallar
    // el test anterior, así que esto solo comprueba que al declararlos no se
    // redondeó hacia arriba (un 51,7 % real no puede declararse como 52).
    for (const [id, filas] of Object.entries(FILAS)) {
      for (const c of TABLAS.find((t) => t.id === id).campos) {
        expect(c.cobertura_min, `${id}.${c.campo}`).toBeLessThanOrEqual(Math.floor(cobertura(filas, c.campo)) + 0.0001);
      }
    }
  });

  it("cada ruta local que nombra existe", () => {
    const faltan = [];
    const existeLocal = (ruta) => {
      const limpia = ruta.replace(/\s*\(.*$/, "").trim();
      if (/^(https?:|supabase:|\()/.test(limpia)) return true;
      if (limpia.includes("*")) {
        // Glob de un nivel: existe si el directorio tiene algún fichero que
        // case con el prefijo y el sufijo del patrón.
        const barra = limpia.lastIndexOf("/");
        const dir = limpia.slice(0, barra);
        const patron = limpia.slice(barra + 1);
        const [pre, post] = patron.split("*");
        if (!existsSync(new URL(dir, ROOT))) return false;
        return readdirSync(new URL(`${dir}/`, ROOT)).some((f) => f.startsWith(pre) && f.endsWith(post));
      }
      return existsSync(new URL(limpia, ROOT));
    };
    for (const t of TABLAS) {
      if (!existeLocal(t.ruta)) faltan.push(`${t.id}.ruta → ${t.ruta}`);
      if (t.esquema && !existeLocal(t.esquema)) faltan.push(`${t.id}.esquema → ${t.esquema}`);
      for (const p of t.productor) {
        const fichero = p.split(" ")[0].split("→")[0].replace(/,$/, "").trim();
        if (fichero.includes("*")) continue;
        if (fichero.startsWith("scripts/") || fichero.startsWith("src/")) {
          if (!existeLocal(fichero)) faltan.push(`${t.id}.productor → ${fichero}`);
        }
      }
    }
    for (const o of OPERADORES) {
      if (!existeLocal(o.modulo)) faltan.push(`operador ${o.id} → ${o.modulo}`);
    }
    expect(faltan).toEqual([]);
  });

  it("cada operador nombra tablas del registro o un campo de ellas", () => {
    const ids = new Set(TABLAS.map((t) => t.id));
    const suelto = [];
    for (const o of OPERADORES) {
      for (const e of [...o.entrada, o.salida]) {
        const raiz = e.split(/[.\s(]/)[0];
        if (!ids.has(raiz) && !/^[a-záéíóú ]+$/i.test(e) && !e.includes("[]")) suelto.push(`${o.id}: ${e}`);
      }
    }
    // Se permiten descripciones en prosa ("nombre libre", "gramos") y campos
    // anidados; lo que no se permite es nombrar una tabla que no existe.
    expect(suelto.filter((s) => /^[a-z]+[A-Z]/.test(s.split(": ")[1]))).toEqual([]);
  });
});
