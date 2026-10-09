/**
 * El catálogo tiene UNA fuente: el bundle (src/data/recipes). La copia de
 * Supabase (recipes, catalog_meta, recipe_ingredients, dish_images) se quedó
 * atrás y no se lee desde el 30 sep 2026 (migración 0064). Si alguien vuelve
 * a leerla desde la app o el bot, esto falla: sería volver a tener dos
 * catálogos que no dicen lo mismo, y uno sin pruebas.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TABLAS as REGISTRO } from "./model.js";

const RAIZ = path.resolve(__dirname, "../..");
// Las tablas y vistas copia salen del registro de fuentes (src/data/model.js,
// rol copia_retirada): una lista, no tres.
const TABLAS = REGISTRO.filter((f) => f.rol === "copia_retirada").flatMap((f) => [...f.tablas, ...f.vistas]);
// supabase-js (`.from("recipes")`), PostgREST a mano (`/rest/v1/recipes`) y
// los ayudantes del bot (api/_bot/db.js: `select("recipes", …)`).
const T = TABLAS.join("|");
const LECTURA = new RegExp(`\\.from\\(\\s*["'\`](${T})["'\`]|/rest/v1/(${T})\\b|\\b(select|insert|update|upsert)\\(\\s*["'\`](${T})["'\`]`);

function ficheros(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : ficheros(p);
    return /\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("catálogo: una sola fuente", () => {
  it("nadie en src/ ni en api/ lee la copia antigua de Supabase", () => {
    const culpables = [...ficheros(path.join(RAIZ, "src")), ...ficheros(path.join(RAIZ, "api"))]
      .filter((f) => LECTURA.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  it("la prueba de arriba ve lo que tiene que ver", () => {
    // Que no mida nada: comprobado contra el cargador antiguo.
    expect(LECTURA.test(`supabase.from("recipes").select("*")`)).toBe(true);
    expect(LECTURA.test(`supabase.from("catalog_meta").select("version")`)).toBe(true);
    expect(LECTURA.test(`fetch(\`\${url}/rest/v1/dish_images?id=eq.1\`)`)).toBe(true);
    expect(LECTURA.test(`supabase.from("user_recipes").select("*")`)).toBe(false);
    expect(LECTURA.test(`await select("recipes", "id=eq.1", "name")`)).toBe(true);
    expect(LECTURA.test(`await select("bot_messages", "x", "y")`)).toBe(false);
  });
});
