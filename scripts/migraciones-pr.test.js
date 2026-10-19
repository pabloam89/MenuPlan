import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { aplicadasTocadas, choquesDeNumero, migracionesDeOtrosPr, migracionesDelDiff, sinAplicar } from "./migraciones-pr.mjs";

const SCRIPT = fileURLToPath(new URL("./migraciones-pr.mjs", import.meta.url));
// Nombres inventados: el test no depende de las migraciones reales.
const ESTADO = "| Qué | Cuántas |\n|---|---|\n| **Sin aplicar** | **2** — `0500_ejemplo_libre` y `0501_otra_libre`; el 8 oct se aplicó la 0499 |\n";

describe("migraciones-pr: lo que daba la guardia, en el CI (#878)", () => {
  it("lee la línea «Sin aplicar» del ESTADO.md de la base", () => {
    expect([...sinAplicar(ESTADO)]).toEqual(["0500_ejemplo_libre", "0501_otra_libre"]);
    expect(sinAplicar("sin tabla")).toBe(null);
  });

  it("separa las que el PR añade de las que ya existían y cambia", () => {
    const diff = [
      "A\tsupabase/migrations/0502_nueva.sql",
      "M\tsupabase/migrations/0499_aplicada.sql",
      "D\tsupabase/migrations/0498_borrada.sql",
      "R100\tsupabase/migrations/0500_ejemplo_libre.sql\tsupabase/migrations/0503_renombrada.sql",
      "M\tsupabase/ESTADO.md",
      "A\tsrc/App.jsx",
      "A\tsupabase/migrations/README.md",
    ].join("\n");
    expect(migracionesDelDiff(diff)).toEqual({ nuevas: ["0502_nueva", "0503_renombrada"], tocadas: ["0499_aplicada", "0498_borrada", "0500_ejemplo_libre"] });
  });

  it("una aplicada tocada falla; una sin aplicar se puede editar", () => {
    expect(aplicadasTocadas(["0499_aplicada", "0500_ejemplo_libre"], ESTADO)).toEqual(["0499_aplicada"]);
  });

  it("lee el supabase/ESTADO.md de verdad: su fila «Sin aplicar» casa y cada migración que nombra existe", () => {
    // Si cambia el formato de ESTADO.md, sinAplicar da null y el CI falla cerrado con rojos falsos: mejor verlo aquí.
    const raiz = fileURLToPath(new URL("..", import.meta.url));
    const real = sinAplicar(readFileSync(join(raiz, "supabase", "ESTADO.md"), "utf8"));
    expect(real).not.toBe(null);
    const ficheros = new Set(readdirSync(join(raiz, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, -4)));
    for (const n of real) expect(ficheros.has(n), n).toBe(true);
  });

  it("sin la línea «Sin aplicar», toda tocada cuenta como aplicada (falla cerrado)", () => {
    expect(aplicadasTocadas(["0500_ejemplo_libre"], "")).toEqual(["0500_ejemplo_libre"]);
  });

  it("el mismo número con otro nombre en otro PR abierto choca; el mismo fichero, no", () => {
    const otros = [{ numero: 41, migraciones: ["0502_de_otro"] }, { numero: 42, migraciones: ["0502_nueva"] }];
    expect(choquesDeNumero(["0502_nueva"], otros)).toEqual([{ mia: "0502_nueva", suya: "0502_de_otro", pr: 41 }]);
    expect(choquesDeNumero(["0503_x"], otros)).toEqual([]);
  });

  it("recorre los PR abiertos a la base, salta el propio y pagina los ficheros", async () => {
    const pedidas = [];
    const pedir = async (ruta) => {
      pedidas.push(ruta);
      if (ruta.startsWith("repos/o/r/pulls?")) return [{ number: 7 }, { number: 8 }];
      if (ruta.includes("pulls/8/files") && ruta.endsWith("page=1")) {
        return [
          ...Array.from({ length: 99 }, (_, i) => ({ filename: `src/f${i}.js`, status: "modified" })),
          { filename: "supabase/migrations/0502_de_otro.sql", status: "added" },
        ];
      }
      if (ruta.includes("pulls/8/files") && ruta.endsWith("page=2")) return [{ filename: "supabase/migrations/0499_aplicada.sql", status: "modified" }];
      throw new Error(`inesperada ${ruta}`);
    };
    const otros = await migracionesDeOtrosPr({ repo: "o/r", base: "staging", propio: 7, token: "t", pedir });
    expect(otros).toEqual([{ numero: 8, migraciones: ["0502_de_otro"] }]);
    expect(pedidas.some((r) => r.includes("pulls/7/files"))).toBe(false);
    expect(pedidas[0]).toContain("base=staging");
  });

  it("la línea de comandos: aplicada tocada sale con 1; nada de migraciones, con 0 y sin red", () => {
    const dir = mkdtempSync(join(tmpdir(), "migraciones-pr-"));
    const estado = join(dir, "estado.md");
    writeFileSync(estado, ESTADO);
    const corre = (diff) => {
      const f = join(dir, "diff.txt");
      writeFileSync(f, diff);
      // Sin token: si intentara ir a la red, fallaría por eso y no por la regla.
      return spawnSync(process.execPath, [SCRIPT, f, estado], { encoding: "utf8", env: { ...process.env, GITHUB_TOKEN: "", GITHUB_REPOSITORY: "" } });
    };
    const mal = corre("M\tsupabase/migrations/0499_aplicada.sql\n");
    expect(mal.status).toBe(1);
    expect(mal.stdout).toContain("migraciones-pr resultado: falla");
    expect(mal.stdout).toContain("0499_aplicada está aplicada");
    const bien = corre("M\tsupabase/migrations/0500_ejemplo_libre.sql\nM\tsrc/App.jsx\n");
    expect(bien.status).toBe(0);
    expect(bien.stdout).toContain("migraciones-pr resultado: ok");
    // Una nueva sin poder preguntar a GitHub: falla con la causa, no pasa en silencio.
    const sinRed = corre("A\tsupabase/migrations/0502_nueva.sql\n");
    expect(sinRed.status).toBe(1);
    expect(sinRed.stdout).toContain("No he podido listar los PR abiertos");
  });
});
