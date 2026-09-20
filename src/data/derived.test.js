import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Una tabla derivada caducada es peor que no tenerla: parece fresca y no lo
 * está. scripts/build-derived.mjs guarda en _meta.json el hash de las fuentes
 * con las que generó; esto lo recalcula y compara.
 *
 * Si falla: `node scripts/build-derived.mjs` y commitea lo que cambie.
 */
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");
const meta = JSON.parse(leer("./derived/_meta.json"));

describe("las tablas derivadas", () => {
  it("se generaron con las fuentes que hay ahora", () => {
    const ficheros = readdirSync(new URL("./recipes/", import.meta.url)).filter((f) => f.endsWith(".json")).sort();
    expect({
      ingredientes: hash(leer("./ingredients.json")),
      recetas: hash(ficheros.map((f) => leer(`./recipes/${f}`)).join("")),
    }).toEqual(meta.hash_fuentes);
  });

  it("declaran de dónde sale cada fila", () => {
    const partes = JSON.parse(leer("./derived/recipeParts.json"));
    const sinOrigen = Object.entries(partes).filter(([, v]) => !v.origen).map(([k]) => k);
    expect(sinOrigen).toEqual([]);
    // `curado` es el único origen con vector: si algún día una fila derivada
    // por el operador se colara aquí, este test la caza.
    const conVector = Object.entries(partes).filter(([, v]) => v.partes);
    expect(conVector.every(([, v]) => v.origen === "curado")).toBe(true);
  });

  it("no promociona el operador determinista sin volver a medirlo", () => {
    const op = meta.recipeParts.operador_determinista;
    expect(op.promocionable).toBe(false);
    // Si alguien mejora el operador y la concordancia sube de verdad, este
    // test falla y obliga a decidir a conciencia si ya vale para rellenar.
    expect(op.concordancia_con_curado).toBeLessThan(0.85);
  });
});
