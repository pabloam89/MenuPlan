import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import {
  CODIGOS_WORDING, LECTORES, RAIZ_REPO, RUTA_TOPES, ajustar, codigosDeWording, estadisticas, faltasDeWording, leerTopes, medir,
  problemasContraReferencia, problemasDeMedida, problemasDeTopes, problemasDeWording, tiposDeLaBase,
} from "../scripts/lib/topes.mjs";

/**
 * Topes en caracteres y wording por tipo de texto (#689, programa #652). Falla cuando:
 *  1. ops/topes.json no cubre justo los campos que se miden, o un campo declara un tipo de texto que no existe;
 *  2. el vocabulario de tipos no incluye cada fila de la tabla de redacción de la base;
 *  3. un texto pasa del tope de su campo (o el tope tiene holgura: solo baja);
 *  4. un tope o una excepción de wording sube respecto a origin/staging;
 *  5. un texto incumple la regla de su tipo y no está en las excepciones (que solo bajan).
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const topes = leerTopes();
const medido = medir();
const faltas = faltasDeWording(RAIZ_REPO, topes);
const tiposBase = tiposDeLaBase();
const clon = () => structuredClone(topes);

// El mismo fichero en origin/staging, sin red; null si no se puede leer (rama sin la referencia o fichero nuevo).
const deStaging = () => {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/staging:${RUTA_TOPES}`], { cwd: RAIZ_REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return null; }
};

describe("ops/topes.json", () => {
  it("cubre los campos que se miden y declara tipos que existen", () => expect(problemasDeTopes(topes, { tiposBase })).toEqual([]));
  it("tiene un tipo de texto por cada fila de la tabla de redacción de la base", () => {
    for (const t of tiposBase) expect(Object.keys(topes.tipos_de_texto)).toContain(t);
  });
  it("ningún texto pasa del tope de su campo y el tope no tiene holgura", () => expect(problemasDeMedida(topes, medido)).toEqual([]));
  it("el wording de hoy es el de las excepciones: ni una falta nueva ni una excepción que sobre", () => expect(problemasDeWording(faltas, topes.excepciones_wording)).toEqual([]));
  it("ningún tope ni excepción sube respecto a origin/staging (si se puede leer sin red)", () => {
    const ref = deStaging();
    if (!ref) return;
    expect(problemasContraReferencia(topes, ref)).toEqual([]);
  });
});

describe("cada regla se ve fallar", () => {
  it("un campo medido sin tope", () => {
    const t = clon(); delete t.campos["norma.exigencia"];
    expect(problemasDeTopes(t, { tiposBase }).join("\n")).toContain("norma.exigencia: se mide y no tiene tope");
  });
  it("un tope sin lector", () => {
    const t = clon(); t.campos["fantasma.campo"] = { tipo_texto: "norma", tope: 10 };
    expect(problemasDeTopes(t, { tiposBase }).join("\n")).toContain("nadie lo mide");
  });
  it("un tipo de texto inventado", () => {
    const t = clon(); t.campos["norma.nota"].tipo_texto = "poema";
    expect(problemasDeTopes(t, { tiposBase }).join("\n")).toContain("«poema» no está en tipos_de_texto");
  });
  it("una fila de la base que falta en el vocabulario", () => {
    const t = clon(); delete t.tipos_de_texto.respuesta;
    expect(problemasDeTopes(t, { tiposBase }).join("\n")).toContain("falta «respuesta»");
  });
  it("un texto que pasa del tope", () => {
    const t = clon(); t.campos["norma.exigencia"].tope = medido["norma.exigencia"].max - 1;
    expect(problemasDeMedida(t, medido).join("\n")).toContain("el tope no sube");
  });
  it("un tope con holgura", () => {
    const t = clon(); t.campos["norma.exigencia"].tope += 5;
    expect(problemasDeMedida(t, medido).join("\n")).toContain("Bájalo");
  });
  it("un tope que sube respecto a la referencia", () => {
    const t = clon(); t.campos["norma.nota"].tope += 1;
    expect(problemasContraReferencia(t, topes).join("\n")).toContain("solo baja");
  });
  it("una excepción nueva o que sube respecto a la referencia", () => {
    const t = clon(); t.excepciones_wording["norma.exigencia:fuerza-en-principio"] = 1;
    expect(problemasContraReferencia(t, topes).join("\n")).toContain("excepción nueva");
    const u = clon(); const k = Object.keys(u.excepciones_wording)[0]; u.excepciones_wording[k] += 1;
    expect(problemasContraReferencia(u, topes).join("\n")).toContain("sube de");
  });
  it("cambiar el tipo de texto o subir palabras_max respecto a la referencia esquivaría el wording (hallazgo del revisor, #701)", () => {
    const t = clon(); t.campos["norma.nota"].tipo_texto = "documento";
    expect(problemasContraReferencia(t, topes).join("\n")).toContain("tipo_texto");
    const u = clon(); const c = Object.keys(u.campos).find((k) => u.campos[k].palabras_max); u.campos[c].palabras_max += 5;
    expect(problemasContraReferencia(u, topes).join("\n")).toContain("palabras_max");
  });
  it("un campo que deja de medirse respecto a la referencia", () => {
    const t = clon(); delete t.campos["norma.nota"];
    expect(problemasContraReferencia(t, topes).join("\n")).toContain("ha desaparecido");
  });
  it("una falta de wording sin excepción, y una excepción que ya sobra", () => {
    expect(problemasDeWording({ ...faltas, "norma.exigencia:fuerza-en-principio": 1 }, topes.excepciones_wording).join("\n")).toContain("incumplen la regla de su tipo");
    const k = Object.keys(faltas)[0];
    expect(problemasDeWording({ ...faltas, [k]: faltas[k] - 1 }, topes.excepciones_wording).join("\n")).toContain("Bájalo");
  });
  it("una excepción con un código inventado", () => {
    const t = clon(); t.excepciones_wording["norma.nota:poesia"] = 1;
    expect(problemasDeTopes(t, { tiposBase }).join("\n")).toContain("no es un código");
  });
});

describe("la regla de wording de cada tipo", () => {
  const base = { norma: { modo_tiempo: "presente", persona: ["tercera"] }, practica: { modo_tiempo: "imperativo", persona: ["segunda"] } };
  it("un texto limpio no lleva ningún código", () => {
    expect(codigosDeWording("Mantén la coherencia dentro del producto", base.practica, { tipo: "practica" })).toEqual([]);
    expect(codigosDeWording("gastar menos de 75 € al mes", base.norma, { tipo: "norma" })).toEqual([]);
  });
  it("voz pasiva", () => expect(codigosDeWording("El fichero es guardado por el script", base.norma)).toContain("voz-pasiva"));
  it("futuro en un tipo de presente", () => expect(codigosDeWording("El script leerá el fichero", base.norma)).toContain("modo-tiempo"));
  it("una práctica que empieza por un sujeto en vez de un imperativo", () => expect(codigosDeWording("La coherencia dentro del producto importa", base.practica)).toContain("modo-tiempo"));
  it("persona que no es la del tipo", () => expect(codigosDeWording("Guarda tu fichero", base.norma)).toContain("persona"));
  it("palabra de fuerza solo en un principio", () => {
    expect(codigosDeWording("Todo script debe llevar su test", base.norma, { tipo: "principio" })).toContain("fuerza-en-principio");
    expect(codigosDeWording("Todo script debe llevar su test", base.norma, { tipo: "norma" })).not.toContain("fuerza-en-principio");
  });
  it("más palabras de las que declara el campo", () => expect(codigosDeWording("uno dos tres cuatro", base.norma, { palabras_max: 3 })).toContain("frase-larga"));
  it("todo código que se emite está en el vocabulario", () => {
    for (const k of Object.keys(faltas)) expect(Object.keys(CODIGOS_WORDING)).toContain(k.split(":")[1]);
  });
});

describe("la medida y el ajuste", () => {
  it("estadisticas: mínimo, mediana, p95 y máximo en caracteres", () => {
    expect(estadisticas(["a", "bb", "ccc", "dddd"])).toEqual({ n: 4, min: 1, mediana: 3, p95: 4, max: 4 });
    expect(estadisticas([])).toEqual({ n: 0, min: 0, mediana: 0, p95: 0, max: 0 });
  });
  it("cada campo medido tiene textos", () => {
    for (const c of Object.keys(LECTORES)) expect(medido[c].n, c).toBeGreaterThan(0);
  });
  it("ajustar solo baja: un tope con holgura baja y una excepción que sobra se ajusta", () => {
    const t = clon(); t.campos["norma.exigencia"].tope += 40; const k = Object.keys(t.excepciones_wording)[0]; t.excepciones_wording[k] += 2;
    const a = ajustar(t, medido, faltas);
    expect(a.campos["norma.exigencia"].tope).toBe(medido["norma.exigencia"].max);
    expect(a.excepciones_wording[k]).toBe(faltas[k]);
  });
  it("ajustar nunca sube un tope aunque lo medido sea mayor", () => {
    const t = clon(); const m = structuredClone(medido); m["norma.nota"].max += 100;
    expect(ajustar(t, m, faltas).campos["norma.nota"].tope).toBe(t.campos["norma.nota"].tope);
  });
});
