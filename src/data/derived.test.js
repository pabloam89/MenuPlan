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
// Misma normalización que scripts/build-derived.mjs: se hashea el contenido,
// no el CRLF que mete git en Windows con core.autocrlf.
const hash = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
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

  /**
   * UN VECTOR DE CEROS TAMBIÉN ES UNA TABLA CADUCADA, y este fichero no lo
   * miraba: comprobaba que la fila declarase su origen y que solo `curado`
   * llevara vector, y las dos cosas eran ciertas mientras las 428 partes de las
   * 180 filas curadas publicaban `kcal: 0` con `cobertura: 0`. 171 de esas
   * filas son estrella.
   *
   * La causa fue un `resolveIngredient(...)?.nutrition` que dejó de existir
   * cuando la composición se mudó a `alimentosApp.json`: el `continue` se
   * disparaba en todas las líneas y el resultado era un campo de ceros con el
   * hash de fuentes cuadrando y `_meta` declarando «curado: 180».
   *
   * Que una parte tenga masa y no tenga macros solo puede significar que el
   * cálculo se rompió, así que se pregunta por las dos cosas a la vez.
   */
  it("las partes curadas traen macros, no un campo de ceros", () => {
    const partes = JSON.parse(leer("./derived/recipeParts.json"));
    const mudas = [];
    for (const [id, fila] of Object.entries(partes)) {
      if (fila.origen !== "curado") continue;
      for (const [nombre, parte] of Object.entries(fila.partes ?? {})) {
        if (parte.masa_g > 0 && !(parte.kcal > 0)) mudas.push(`${id}/${nombre}`);
      }
    }
    expect(mudas).toEqual([]);
  });

  /**
   * La cobertura de una parte es qué fracción de su masa tiene ficha. Si se
   * hunde, alguien rompió el puente con el catálogo de alimentos otra vez.
   */
  it("y esas partes están cubiertas casi del todo", () => {
    const partes = JSON.parse(leer("./derived/recipeParts.json"));
    const cob = Object.values(partes)
      .filter((f) => f.origen === "curado")
      .flatMap((f) => Object.values(f.partes ?? {}).map((p) => p.cobertura));
    expect(cob.length).toBeGreaterThan(400);
    expect(Math.min(...cob)).toBeGreaterThan(0.5);
    const media = cob.reduce((a, v) => a + v, 0) / cob.length;
    expect(media).toBeGreaterThan(0.97);
  });

  /**
   * TRINQUETE DE LO QUE SOSTIENE LOS MICROS.
   *
   * `cobertura_media` es masa con ficha y vale 1,0 en 1.019 de 1.033 recetas:
   * no distingue nada, y publicada sola hacía parecer resuelto un catálogo
   * donde 586 recetas estrella están por debajo del 95 % de cobertura en los
   * campos secundarios. Con esos campos se decide «rico en hierro».
   *
   * El número puede bajar —rellenar fichas lo baja— pero no puede subir sin
   * que alguien lo vea.
   */
  it("publica el reparto de micros y no solo su media", () => {
    const r = meta.recipeNutrition.estrella.reparto_micros;
    expect(r).toBeTruthy();
    expect(r.bajo_95).toBeLessThanOrEqual(586);
    expect(r.bajo_80).toBeLessThanOrEqual(113);
    expect(r.mediana).toBeGreaterThan(0.85);
    // Y las diez peores con nombre, para que rellenar fichas tenga una cola.
    expect(meta.recipeNutrition.estrella.peores_micros).toHaveLength(10);
  });

  it("no promociona el operador determinista sin volver a medirlo", () => {
    const op = meta.recipeParts.operador_determinista;
    expect(op.promocionable).toBe(false);
    // Si alguien mejora el operador y la concordancia sube de verdad, este
    // test falla y obliga a decidir a conciencia si ya vale para rellenar.
    expect(op.concordancia_con_curado).toBeLessThan(0.85);
  });
});
