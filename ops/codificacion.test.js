import { describe, expect, it } from "vitest";
import { closeSync, openSync, readSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "./ficherosGit.js";

/**
 * Norma `texto-en-utf8-sin-bom` (parte de #690): ningún fichero de texto del repo empieza por la marca BOM
 * de UTF-8 (EF BB BF). PowerShell 5.1 la mete al escribir y rompe lectores que comparan el primer carácter
 * (JSON.parse, cabeceras de skills, el `#!` de un script). Solo lee los tres primeros bytes de cada fichero.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXTO = /\.(m?js|cjs|jsx|tsx?|json|md|css|html|sql|ya?ml|sh|txt|csv|svg)$|^\.(gitattributes|gitignore|vercelignore)$/;
const BOM = [0xef, 0xbb, 0xbf];

const empiezaPorBom = (buf) => buf.length >= 3 && BOM.every((b, i) => buf[i] === b);

function primerosBytes(ruta) {
  const fd = openSync(ruta, "r");
  try {
    const buf = Buffer.alloc(3);
    const n = readSync(fd, buf, 0, 3, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

describe("texto en UTF-8 sin BOM (norma texto-en-utf8-sin-bom)", () => {
  it("ningún fichero de texto del repo empieza por BOM", () => {
    const deTexto = ficherosDeGit(RAIZ).filter((f) => TEXTO.test(f.split("/").pop()) || TEXTO.test(f));
    expect(deTexto.length).toBeGreaterThan(500);
    const conBom = deTexto.filter((f) => empiezaPorBom(primerosBytes(join(RAIZ, f))));
    expect(conBom, "Quita la marca BOM (los tres primeros bytes EF BB BF) y guarda en UTF-8 sin BOM").toEqual([]);
  });

  it("se ve fallar: un búfer con BOM sí se detecta, y uno sin BOM o corto no", () => {
    expect(empiezaPorBom(Buffer.from([0xef, 0xbb, 0xbf, 0x7b]))).toBe(true);
    expect(empiezaPorBom(Buffer.from("{\"a\":1}"))).toBe(false);
    expect(empiezaPorBom(Buffer.from([0xef, 0xbb]))).toBe(false);
  });
});
