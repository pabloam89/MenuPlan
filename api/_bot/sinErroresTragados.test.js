// Ningún error del bot se traga sin dejar aviso (#177, #183).
//
// Recorre api/_bot/ y api/bot/ (sin los tests) y falla con cada `catch` que
// ni avisa (console.warn / console.error), ni vuelve a lanzar, ni lleva al
// lado su porqué con «a propósito: …». Vale para `try {} catch {}` y para
// `.catch(() => valor)`. Un `.catch(manejador)` con nombre no cuenta: el
// manejador es quien decide.
//
// Tragarse un error a propósito se puede, pero escrito: el comentario
// «a propósito: …» en la línea del catch, en la de antes o dentro, y si el
// error no sale por otro lado, un console.warn con el motivo.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CARPETAS = ["api/_bot", "api/bot"];

const PALABRAS_ANTES_DE_REGEX = new Set(["return", "typeof", "case", "in", "of", "void", "delete", "throw", "new", "else", "yield", "await", "do"]);

/**
 * El código con cadenas, plantillas, regex y comentarios cambiados por
 * espacios (mismo largo y mismos saltos de línea): así las llaves y los
 * paréntesis se cuentan sin tropezar con un «{» dentro de un texto.
 */
function enmascarar(src) {
  const out = src.split("");
  const tapar = (i) => { if (out[i] !== "\n") out[i] = " "; };
  const plantillas = []; // por cada `${` abierto, cuántas llaves de código lleva dentro
  let i = 0;
  let ultimo = ""; // último carácter de código no blanco
  let palabra = ""; // última palabra de código
  let enPlantilla = false;
  while (i < src.length) {
    const c = src[i];
    if (enPlantilla) {
      if (c === "\\") { tapar(i); tapar(i + 1); i += 2; continue; }
      if (c === "`") { tapar(i); enPlantilla = false; ultimo = ")"; palabra = ""; i++; continue; }
      if (c === "$" && src[i + 1] === "{") { tapar(i); tapar(i + 1); plantillas.push(0); enPlantilla = false; ultimo = "{"; palabra = ""; i += 2; continue; }
      tapar(i); i++; continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") tapar(i++);
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      const hasta = fin < 0 ? src.length : fin + 2;
      while (i < hasta) tapar(i++);
      continue;
    }
    if (c === "'" || c === '"') {
      tapar(i++);
      while (i < src.length && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") tapar(i++);
        tapar(i++);
      }
      tapar(i++);
      ultimo = ")"; palabra = "";
      continue;
    }
    if (c === "`") { tapar(i++); enPlantilla = true; continue; }
    if (c === "/" && (ultimo === "" || "(,=:[!&|?{};+-*%<>~^".includes(ultimo) || PALABRAS_ANTES_DE_REGEX.has(palabra))) {
      tapar(i++);
      let clase = false;
      while (i < src.length && src[i] !== "\n" && (clase || src[i] !== "/")) {
        if (src[i] === "\\") tapar(i++);
        else if (src[i] === "[") clase = true;
        else if (src[i] === "]") clase = false;
        tapar(i++);
      }
      tapar(i++);
      while (/[a-z]/i.test(src[i] ?? "")) tapar(i++);
      ultimo = ")"; palabra = "";
      continue;
    }
    if (plantillas.length) {
      if (c === "{") plantillas[plantillas.length - 1]++;
      else if (c === "}") {
        if (plantillas[plantillas.length - 1] === 0) { plantillas.pop(); tapar(i); enPlantilla = true; i++; continue; }
        plantillas[plantillas.length - 1]--;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      palabra = src.slice(i, j);
      ultimo = src[j - 1];
      i = j;
      continue;
    }
    ultimo = c; palabra = "";
    i++;
  }
  return out.join("");
}

/** Dónde cierra el `abre` que hay en `desde` (índice del cierre). */
function cierre(mascara, desde, abre, cierra) {
  let n = 0;
  for (let i = desde; i < mascara.length; i++) {
    if (mascara[i] === abre) n++;
    else if (mascara[i] === cierra && --n === 0) return i;
  }
  return mascara.length - 1;
}

const AVISA = /console\.(warn|error)\s*\(|\bthrow\b/;
const A_PROPOSITO = /a propósito/i;

/** Los catch de `src` que se tragan el error sin decirlo: [{ linea, texto }]. */
function tragados(src) {
  const mascara = enmascarar(src);
  const lineas = src.split("\n");
  const lineaDe = (i) => src.slice(0, i).split("\n").length;
  const malos = [];
  const juzgar = (inicio, cuerpo) => {
    const n = lineaDe(inicio);
    const cerca = `${lineas[n - 2] ?? ""}\n${lineas[n - 1]}`;
    if (AVISA.test(cuerpo) || A_PROPOSITO.test(cuerpo) || A_PROPOSITO.test(cerca)) return;
    malos.push({ linea: n, texto: lineas[n - 1].trim().slice(0, 140) });
  };
  // try { … } catch (e) { … }
  for (const m of mascara.matchAll(/(?<![.\w$])catch\s*(\([^)]*\))?\s*\{/g)) {
    const abre = m.index + m[0].length - 1;
    juzgar(m.index, src.slice(abre, cierre(mascara, abre, "{", "}") + 1));
  }
  // promesa.catch(…): solo si el manejador está escrito ahí mismo.
  for (const m of mascara.matchAll(/\.catch\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const arg = src.slice(abre + 1, cierre(mascara, abre, "(", ")"));
    if (!/=>|\bfunction\b/.test(arg)) continue;
    juzgar(m.index, arg);
  }
  return malos;
}

function ficheros(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__snapshots__" ? [] : ficheros(ruta);
    return /\.(m?js)$/.test(e.name) && !/\.test\.m?js$/.test(e.name) ? [ruta] : [];
  });
}

describe("el detector de errores tragados", () => {
  it("salta con un catch vacío, uno que solo devuelve y un .catch(() => valor)", () => {
    expect(tragados("try { x(); } catch {}")).toHaveLength(1);
    expect(tragados("try { x(); } catch (e) { return null; }")).toHaveLength(1);
    expect(tragados("const a = await p.catch(() => null);")).toHaveLength(1);
    expect(tragados("p.catch(() => {});")).toHaveLength(1);
  });

  it("deja pasar el que avisa, relanza o dice su porqué", () => {
    expect(tragados("try { x(); } catch (e) { console.warn('[x]', e); return null; }")).toEqual([]);
    expect(tragados("try { x(); } catch (e) { if (!ok(e)) throw e; }")).toEqual([]);
    expect(tragados("// a propósito: da igual\np.catch(() => {});")).toEqual([]);
    expect(tragados("p.catch((e) => { console.error('[p]', e?.message); return []; });")).toEqual([]);
    expect(tragados("p.catch(avisar);")).toEqual([]);
  });

  it("no se lía con llaves, comillas o barras dentro de textos y regex", () => {
    const src = [
      "const r = /parse entities|can't find end/i.test(m) ? `a ${b({ c: 1 })} }` : \"}\";",
      "try { x(); } catch (e) { if (/{'/.test(e)) y('}'); }",
      "q.catch(() => 1);",
    ].join("\n");
    expect(tragados(src).map((m) => m.linea)).toEqual([2, 3]);
  });
});

describe("api/_bot y api/bot no se tragan errores sin decirlo", () => {
  it("cada catch avisa, relanza o lleva su «a propósito: …»", () => {
    const malos = CARPETAS.flatMap((c) => ficheros(path.join(RAIZ, c)).flatMap((f) =>
      tragados(fs.readFileSync(f, "utf8")).map((m) => `${path.relative(RAIZ, f).replaceAll("\\", "/")}:${m.linea}  ${m.texto}`)));
    expect(malos).toEqual([]);
  });
});
