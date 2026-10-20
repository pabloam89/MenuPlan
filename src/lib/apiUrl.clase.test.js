/**
 * Test de CLASE: toda llamada a `/api/…` desde `src/` pasa por `apiUrl()`.
 *
 * Por qué: en la app nativa iOS (Capacitor) la web va empaquetada y se sirve
 * desde capacitor://localhost; una ruta relativa como `fetch("/api/bot/link")`
 * no llega a Vercel. En la web y en el TWA `apiUrl` devuelve la ruta tal cual,
 * así que olvidarse no rompe nada ahí y solo se descubre en el iPhone (así
 * pasó con el enlace con Lola, frontalBot.js y BotEnlace.jsx).
 *
 * Qué mira: cada literal de cadena que empieza por «/api/» en un fichero de
 * `src/` (menos los tests) tiene que estar justo dentro de `apiUrl(`. Los
 * comentarios no cuentan. Sin excepciones hoy; si alguna hiciera falta, va en
 * EXCEPCIONES con su porqué.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

// `fichero:linea` → porqué una ruta relativa es correcta ahí. Vacío a propósito.
const EXCEPCIONES = {};

function ficheros(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ficheros(p);
    return /\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

// Devuelve las líneas (1-based) con un literal «/api/…» que no está dentro de apiUrl(.
export function sueltas(codigo) {
  const malas = [];
  let enBloque = false;
  codigo.split("\n").forEach((linea, i) => {
    let texto = linea;
    if (enBloque) {
      const fin = texto.indexOf("*/");
      if (fin === -1) return;
      enBloque = false;
      texto = texto.slice(fin + 2);
    }
    // Comentarios de bloque dentro de la línea y de línea (aproximado: basta
    // para el código de la casa, que no lleva «//» ni «/*» dentro de cadenas
    // junto a una ruta /api/).
    texto = texto.replace(/\/\*.*?\*\//g, "");
    const ini = texto.indexOf("/*");
    if (ini !== -1) { enBloque = true; texto = texto.slice(0, ini); }
    texto = texto.replace(/(^|\s)\/\/.*$/, "$1");
    for (const m of texto.matchAll(/["'`]\/api\//g)) {
      if (!texto.slice(0, m.index).endsWith("apiUrl(")) malas.push(i + 1);
    }
  });
  return malas;
}

describe("toda ruta /api/ de src/ pasa por apiUrl()", () => {
  it("ningún fetch (ni otra cosa) usa una ruta relativa suelta", () => {
    const fallos = [];
    for (const f of ficheros(RAIZ)) {
      const codigo = fs.readFileSync(f, "utf8");
      for (const n of sueltas(codigo)) {
        const clave = `${path.relative(RAIZ, f).replaceAll("\\", "/")}:${n}`;
        if (!EXCEPCIONES[clave]) fallos.push(clave);
      }
    }
    expect(fallos, "envuélvelas con apiUrl() de src/lib/apiUrl.js").toEqual([]);
  });

  it("el detector ve lo que debe (y deja pasar lo que no es una llamada)", () => {
    expect(sueltas('const r = await fetch("/api/bot/link", {});')).toEqual([1]);
    expect(sueltas("await fetch(`/api/x/${id}`);")).toEqual([1]);
    expect(sueltas("const u = '/api/track';")).toEqual([1]);
    expect(sueltas('await fetch(apiUrl("/api/bot/link"), {});')).toEqual([]);
    expect(sueltas('// fetch("/api/viejo")')).toEqual([]);
    expect(sueltas(["/**", " * Llama a `/api/generate-dish-photo`", " */", "const a = 1;"].join("\n"))).toEqual([]);
    expect(sueltas('/* "/api/a" */ const x = 1;')).toEqual([]);
  });
});
