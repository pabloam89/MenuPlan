import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { funcionesImportadas, llamadasSinOcultar } from "../scripts/lib/procesosOcultos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Lo que cargan los hooks o corre en segundo plano sin consola (#506). */
const CARPETAS = [".claude/hooks", "scripts/lib"];

describe("ningún proceso hijo de un hook abre una consola (#506)", () => {
  it("toda llamada de child_process en .claude/hooks y scripts/lib lleva windowsHide: true", () => {
    const malas = [];
    for (const carpeta of CARPETAS) {
      for (const f of readdirSync(join(RAIZ, carpeta))) {
        if (!/\.(mjs|js|cjs)$/.test(f) || /\.test\./.test(f)) continue;
        for (const m of llamadasSinOcultar(readFileSync(join(RAIZ, carpeta, f), "utf8"))) malas.push(`${carpeta}/${f}:${m.linea} ${m.llamada}`);
      }
    }
    expect(malas, "Añade `windowsHide: true` a sus opciones: desde un hook o en segundo plano, Windows abre una ventana por cada proceso").toEqual([]);
  });

  describe("el escáner, visto fallar", () => {
    const IMPORT = 'import { execFileSync, spawn as lanzar } from "node:child_process";\n';
    it("señala una llamada sin la opción, también en varias líneas o con alias", () => {
      expect(llamadasSinOcultar(`${IMPORT}const a = execFileSync("git", ["x"], { encoding: "utf8" });`)).toHaveLength(1);
      expect(llamadasSinOcultar(`${IMPORT}execFileSync("git", [\n  "x",\n], {\n  encoding: "utf8",\n});`)).toHaveLength(1);
      expect(llamadasSinOcultar(`${IMPORT}lanzar(process.execPath, [], { detached: true });`)).toHaveLength(1);
      expect(llamadasSinOcultar(`${IMPORT}execFileSync("git", ["x"]);`)).toHaveLength(1);
      expect(llamadasSinOcultar(`${IMPORT}execFileSync("git", ["x"], { windowsHide: false });`)).toHaveLength(1);
    });

    it("acepta la opción en la llamada o en una constante del fichero que nombra", () => {
      expect(llamadasSinOcultar(`${IMPORT}execFileSync("git", ["x"], { windowsHide: true, encoding: "utf8" });`)).toEqual([]);
      expect(llamadasSinOcultar(`${IMPORT}const OPC = { encoding: "utf8", windowsHide: true };\nexecFileSync("git", ["x"], OPC);`)).toEqual([]);
      expect(llamadasSinOcultar(`${IMPORT}const OPC = { encoding: "utf8" };\nexecFileSync("git", ["x"], OPC);`)).toHaveLength(1);
    });

    it("no confunde el .exec de una expresión regular ni lo que no se importa", () => {
      expect(llamadasSinOcultar(`${IMPORT}const m = /a/.exec("a");`)).toEqual([]);
      const conExec = 'import { exec } from "node:child_process";\n';
      expect(llamadasSinOcultar(`${conExec}const m = /a/.exec("a"); const n = miexec("b");`)).toEqual([]);
      expect(llamadasSinOcultar(`${conExec}exec("git status");`)).toHaveLength(1);
      expect(llamadasSinOcultar('const m = execFileSync("git");')).toEqual([]);
      expect([...funcionesImportadas(IMPORT)]).toEqual(["execFileSync", "lanzar"]);
    });
  });
});
