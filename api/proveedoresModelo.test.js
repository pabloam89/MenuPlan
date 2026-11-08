import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "../ops/ficherosGit.js";

/**
 * Norma de HoMenu `texto-anthropic-imagen-gemini` (parte de #690): el texto se pide a Anthropic y las imágenes a
 * Gemini. Se mira lo que el código escribe: todo modelo de Gemini nombrado en el código (un literal «gemini-…»)
 * es de imagen. El 23 sep 2026 una tanda de texto pedida a la clave de las fotos agotó el crédito de AI Studio.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODIGO = /^(api|scripts|src)\/.*\.(m?js|cjs|jsx)$/;
const ES_TEST = /\.test\.(m?js|jsx)$/;
const MODELO_GEMINI = /["'`](gemini-[\w.-]+)["'`]/g;

/** Ficheros que nombran un modelo de texto de Gemini a propósito, con su porqué. Solo baja. */
const EXCEPCIONES = {
  "scripts/gen-appliance-methods.mjs": "--proveedor gemini se queda para comparar salidas; por defecto pide el texto a Anthropic",
};

/** Los modelos de Gemini que no son de imagen, con su fichero. */
function textoAGemini(ficheros, leer) {
  const malos = [];
  for (const f of ficheros) {
    for (const m of leer(f).matchAll(MODELO_GEMINI)) if (!/image/.test(m[1])) malos.push(`${f}: ${m[1]}`);
  }
  return malos;
}

describe("texto a Anthropic, imágenes a Gemini (norma texto-anthropic-imagen-gemini)", () => {
  const codigo = ficherosDeGit(RAIZ).filter((f) => CODIGO.test(f) && !ES_TEST.test(f));
  const leer = (f) => readFileSync(join(RAIZ, f), "utf8");

  it("ningún código pide texto a Gemini, salvo las excepciones declaradas", () => {
    expect(codigo.length).toBeGreaterThan(100);
    const malos = textoAGemini(codigo.filter((f) => !(f in EXCEPCIONES)), leer);
    expect(malos, "El texto va por Anthropic; Gemini solo para imágenes (un modelo «gemini-…-image»)").toEqual([]);
  });

  it("cada excepción existe y sigue nombrando un modelo de texto de Gemini (si no, sobra)", () => {
    for (const [f, porque] of Object.entries(EXCEPCIONES)) {
      expect(codigo, f).toContain(f);
      expect(porque.length).toBeGreaterThan(20);
      expect(textoAGemini([f], leer).length, `${f} ya no pide texto a Gemini: quita su excepción`).toBeGreaterThan(0);
    }
  });

  it("se ve fallar: un modelo de texto de Gemini se señala y uno de imagen no", () => {
    const fuente = { "a.mjs": 'const M = "gemini-2.5-flash";', "b.mjs": 'const M = "gemini-2.5-flash-image";' };
    expect(textoAGemini(Object.keys(fuente), (f) => fuente[f])).toEqual(["a.mjs: gemini-2.5-flash"]);
  });
});
