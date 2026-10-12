import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosDeGit } from "./ficherosGit.js";
import { REFERENCIA, jsonEnReferenciaAvisando } from "../scripts/lib/forjaReferencia.mjs";
import { RUTA_ZONAS, ZONAS, clasificar, compilar, contarPorZona, leerZonas, lineasDeZonas, problemasDeReglas } from "../scripts/lib/zonasProyecto.mjs";

/**
 * Zonas del repo (#652, línea 3 del programa factoría/proyecto): cada fichero cae en UNA zona
 * (`factoria`, `producto` o `mixto`) según ops/zonas.json. Vigila:
 *
 *  1. todo fichero versionado (y los nuevos sin commitear) tiene zona: uno nuevo obliga a decidirla;
 *  2. los ficheros `mixto` no superan `tope_mixto`, que solo baja (lo mixto es lo que aún no se ha separado);
 *  3. el fichero de reglas está bien formado y ninguna regla sobra (cada una decide algo);
 *  4. la cifra «ficheros por zona» está registrada con su «antes» y su «después».
 */
/** Cuántos ficheros mixtos más que los reales puede dejar el tope. */
const HOLGURA_MAX = 3;
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = leerZonas(RAIZ);
const C = compilar(DATOS);
const RUTAS = ficherosDeGit(RAIZ);
const CUENTA = contarPorZona(RUTAS, C);

describe("ops/zonas.json: cada fichero tiene su zona", () => {
  it("ningún fichero del repo se queda sin zona", () => {
    expect(CUENTA.sin, `ficheros sin zona (añade una regla a ops/zonas.json): ${CUENTA.sin.slice(0, 15).join(", ")}`).toEqual([]);
    expect(CUENTA.factoria + CUENTA.producto + CUENTA.mixto).toBe(CUENTA.total);
  });

  it("lo mixto no supera el tope (con una holgura fija de unos pocos ficheros) y el tope solo baja", () => {
    expect(CUENTA.mixto, "hay más ficheros mixtos que el tope: decide si son de la factoría o del producto, o sube el tope con su motivo en el PR").toBeLessThanOrEqual(DATOS.tope_mixto);
    // La holgura es fija y pequeña: un PR ajeno que añade un mixto no rompe, pero el tope no queda lejos de lo real.
    expect(DATOS.tope_mixto - CUENTA.mixto, "el tope deja demasiada holgura: bájalo").toBeLessThanOrEqual(HOLGURA_MAX);
  });

  it("el tope de lo mixto no sube respecto a origin/staging (se baja, no se sube)", () => {
    const ref = jsonEnReferenciaAvisando(RAIZ, REFERENCIA(), RUTA_ZONAS, "tope_mixto");
    if (!ref) return; // sin git o antes de que este fichero esté en staging: el aviso lo dice
    expect(DATOS.tope_mixto, `tope_mixto subió de ${ref.tope_mixto} a ${DATOS.tope_mixto}: separa ficheros en vez de subir el tope`).toBeLessThanOrEqual(ref.tope_mixto);
  });

  it("el fichero de reglas está bien formado", () => {
    expect(problemasDeReglas(DATOS)).toEqual([]);
  });

  it("una regla que no decide ningún fichero AVISA; solo falla si la deja huérfana este PR (no estaba en staging)", () => {
    const claves = (d) => [
      ...(d.prefijos ?? []).map((p) => `prefijo:${p.prefijo}`),
      ...(d.patrones ?? []).map((p) => `patron:${p.re}`),
      ...Object.keys(d.excepciones ?? {}).map((r) => `excepcion:${r}`),
    ];
    const huerfanas = claves(DATOS).filter((k) => !CUENTA.usadas.has(k));
    if (huerfanas.length) console.warn(`[zonas] reglas que no deciden ningún fichero (bórralas cuando puedas): ${huerfanas.join(" | ")}`);
    const ref = jsonEnReferenciaAvisando(RAIZ, REFERENCIA(), RUTA_ZONAS, "reglas huérfanas");
    if (!ref) return; // sin referencia solo se avisa
    const deAntes = new Set(claves(ref));
    expect(huerfanas.filter((k) => !deAntes.has(k)), "reglas nuevas de este PR que no deciden nada (bórralas)").toEqual([]);
  });

  it("la lógica de las huérfanas: una regla de antes sin ficheros no rompe, una nueva sí", () => {
    const antes = new Set(["prefijo:a/"]);
    const nuevas = (huerfanas) => huerfanas.filter((k) => !antes.has(k));
    expect(nuevas(["prefijo:a/"])).toEqual([]);
    expect(nuevas(["prefijo:b/"])).toEqual(["prefijo:b/"]);
  });

  it("la cifra «ficheros por zona» está registrada antes y después", () => {
    const origenes = (DATOS.medidas ?? []).map((m) => m.origen);
    expect(origenes).toContain("antes: estimación del informe, por nombre");
    expect(origenes).toContain("despues: reglas de ops/zonas.json");
  });
});

describe("clasificar: el orden de las reglas", () => {
  const c = compilar({
    prefijos: [{ prefijo: "a/", zona: "factoria" }, { prefijo: "a/b/", zona: "producto" }],
    patrones: [{ re: "^a/b/c\\.js$", zona: "mixto" }],
    excepciones: { "a/b/c.js": "factoria" },
  });

  it("la excepción gana al patrón, el patrón al prefijo y el prefijo más largo al corto", () => {
    expect(clasificar("a/b/c.js", c)).toMatchObject({ zona: "factoria", por: { tipo: "excepcion" } });
    expect(clasificar("a/b/d.js", c)).toMatchObject({ zona: "producto", por: { tipo: "prefijo", regla: "a/b/" } });
    expect(clasificar("a/x.js", c)).toMatchObject({ zona: "factoria" });
    expect(clasificar("a/b/c.js", compilar({ ...c, excepciones: {} }))).toMatchObject({ zona: "mixto", por: { tipo: "patron" } });
  });

  it("una ruta sin regla no tiene zona (el test de arriba la rechaza)", () => {
    expect(clasificar("z/x.js", c)).toEqual({ zona: null, por: null });
    const r = contarPorZona(["a/x.js", "z/x.js"], c);
    expect(r).toMatchObject({ factoria: 1, sin_zona: 1, total: 2, sin: ["z/x.js"] });
  });

  it("problemasDeReglas rechaza una zona fuera del vocabulario y una medida que no suma", () => {
    const mal = { zonas: ZONAS, tope_mixto: 0, prefijos: [{ prefijo: "a/", zona: "otra" }], patrones: [{ re: "(", zona: "mixto" }], excepciones: { x: "nada" }, medidas: [{ fecha: "2026-10-12", origen: "x", factoria: 1, producto: 0, mixto: 0, total: 5 }] };
    const p = problemasDeReglas(mal).join(" | ");
    expect(p).toMatch(/zona «otra»/);
    expect(p).toMatch(/no es una expresión regular/);
    expect(p).toMatch(/excepción «x»/);
    expect(p).toMatch(/medida «2026-10-12»/);
  });
});

describe("la línea de la cifra", () => {
  it("lleva una línea por zona y la del total", () => {
    expect(lineasDeZonas({ factoria: 3, producto: 5, mixto: 1, total: 9, sin_zona: 0 })).toEqual([
      "zonas-proyecto zona: factoria ficheros: 3",
      "zonas-proyecto zona: producto ficheros: 5",
      "zonas-proyecto zona: mixto ficheros: 1",
      "zonas-proyecto total: 9 sin_zona: 0",
    ]);
  });
});
