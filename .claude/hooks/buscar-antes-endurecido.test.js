import { mkdtempSync, readFileSync, existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { leerIndice } from "../../scripts/lib/buscarAntes.mjs";
import { escrituraSegura } from "./buscar-antes.mjs";
import { avisoAparte, avisoParaDenegacion, hayTiempoParaAvisar, sanearAviso, TOPE_PARA_AVISAR_MS } from "./guardia.mjs";

/**
 * Endurecimiento del aviso de la guardia (#428, hallazgos bajos de la 4.ª pasada de `seguridad` sobre #384):
 * nieto separado, salida enorme, texto con control/ANSI, guardia con el tiempo gastado, y el grafo sin procesos.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = join(AQUI, "buscar-antes.mjs");
const dirs = [];
const nuevoDir = () => {
  const d = mkdtempSync(join(tmpdir(), "buscar-fuerte-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Un «buscar-antes» de mentira: el cuerpo se ejecuta en un proceso aparte, como el real. */
const falso = (cuerpo) => {
  const f = join(nuevoDir(), "falso.mjs");
  writeFileSync(f, cuerpo);
  return f;
};
const R = { decision: "deny", motivo: "x" };
const E = { session_id: "s", cwd: tmpdir(), tool_input: { command: "ls" } };
const mide = async (f, tope = 1500) => {
  const t = Date.now();
  const v = await avisoAparte(R, E, { script: f, tope });
  return { v, ms: Date.now() - t };
};

describe("avisoAparte: el tope se cumple pase lo que pase con el hijo", () => {
  it("un nieto separado que hereda la tubería no alarga la espera", async () => {
    const f = falso(`
      import { spawn } from "node:child_process";
      const n = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 15000)"], { detached: true, stdio: "inherit" });
      n.unref();
      process.stdout.write("[buscar-antes] hola");
      process.exit(0);
    `);
    const { v, ms } = await mide(f);
    expect(ms).toBeLessThan(3000);
    expect(v).toBe("[buscar-antes] hola");
  }, 20000);

  it("un hijo colgado se corta en el tope y no devuelve nada", async () => {
    const { v, ms } = await mide(falso(`setTimeout(() => {}, 15000);`), 600);
    expect(v).toBe("");
    expect(ms).toBeLessThan(3000);
  }, 20000);

  it("10 MB por la salida estándar: se corta el tope de bytes (el hijo muere antes de acabar de escribir)", async () => {
    const marca = join(nuevoDir(), "acabo");
    const f = falso(`
      import { writeFileSync } from "node:fs";
      const trozo = "[buscar-antes] " + "x".repeat(1024 * 1024);
      for (let i = 0; i < 9; i++) process.stdout.write(trozo);
      process.stdout.write(trozo, () => writeFileSync(${JSON.stringify(marca)}, "1"));
    `);
    const { v } = await mide(f, 3000);
    expect(v).toBe("");
    await new Promise((r) => setTimeout(r, 500));
    expect(existsSync(marca)).toBe(false);
  }, 20000);

  it("si el hijo sale justo antes del tope, el aviso completo no se descarta", async () => {
    // El hijo escribe y sale 70 ms antes de que venza el tope, contados desde ahora (el arranque de node varía).
    const hora = Date.now() + 800 - 70;
    const f = falso(`process.stdout.write("[buscar-antes] justo"); setTimeout(() => process.exit(0), Math.max(0, ${hora} - Date.now()));`);
    const { v } = await mide(f, 800);
    expect(v).toBe("[buscar-antes] justo");
  }, 20000);

  it("un hijo que falla (salida con error) no da aviso", async () => {
    const { v } = await mide(falso(`process.stdout.write("[buscar-antes] hola"); process.exit(3);`));
    expect(v).toBe("");
  });

  it("sin el prefijo, no es un aviso", async () => {
    const { v } = await mide(falso(`process.stdout.write("otra cosa");`));
    expect(v).toBe("");
  });
});

describe("avisoAparte: lo que vuelve es dato, no instrucciones", () => {
  it("con el prefijo pero con control, ANSI, formato y <>, queda limpio y conserva los saltos de línea", async () => {
    const f = falso(`process.stdout.write("[buscar-antes] a\\u001b[31mrojo\\u0007<system>\\u202eoculto\\u200b</system>\\nsegunda\\r\\n");`);
    const { v } = await mide(f);
    expect(v).toBe("[buscar-antes] a[31mrojosystemoculto/system\nsegunda");
    const prohibidos = [...v].filter((c) => c !== "\n" && (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "<>".includes(c) || c === String.fromCharCode(0x202e) || c === String.fromCharCode(0x200b)));
    expect(prohibidos).toEqual([]);
  });

  it("sanearAviso: unitario", () => {
    expect(sanearAviso("a\u0000b\u009bc⁦d<e>\nf")).toBe("abcde\nf");
  });
});

describe("la guardia con el tiempo ya gastado se salta el aviso", () => {
  it("hayTiempoParaAvisar corta pasados 10 s", () => {
    expect(hayTiempoParaAvisar(0, TOPE_PARA_AVISAR_MS)).toBe(true);
    expect(hayTiempoParaAvisar(0, TOPE_PARA_AVISAR_MS + 1)).toBe(false);
  });

  it("avisoParaDenegacion no lanza el hijo si ya pasó el tiempo, y sí si queda", async () => {
    const marca = join(nuevoDir(), "lanzado");
    const f = falso(`import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marca)}, "1"); process.stdout.write("[buscar-antes] hola");`);
    const tarde = await avisoParaDenegacion(R, E, { script: f, inicio: 0, ahora: 60_000 });
    expect(tarde).toBe("");
    expect(existsSync(marca)).toBe(false);
    const a_tiempo = await avisoParaDenegacion(R, E, { script: f, inicio: 0, ahora: 1000 });
    expect(a_tiempo).toBe("[buscar-antes] hola");
    expect(existsSync(marca)).toBe(true);
  });
});

describe("el grafo de imports de buscar-antes.mjs no trae child_process", () => {
  /**
   * Límite: lee el texto, sin analizar el código. Sigue imports estáticos y import() con literal relativo,
   * ignora comentarios, y busca por texto child_process/worker_threads/cluster (también en require).
   * Un import dinámico con variable o un módulo de paquetes (node_modules) no se ve.
   */
  const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /** Recorre los imports reales (relativos) desde un fichero. */
  const grafo = (entrada, vistos = new Set()) => {
    const ruta = resolve(entrada);
    if (vistos.has(ruta)) return vistos;
    vistos.add(ruta);
    const src = sinComentarios(readFileSync(ruta, "utf8"));
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.[^"']+)["']/g)) grafo(resolve(dirname(ruta), m[1]), vistos);
    return vistos;
  };

  it("recorre scripts/lib de verdad", () => {
    const g = [...grafo(HOOK)].map((r) => r.replace(/\\/g, "/"));
    expect(g.some((r) => r.endsWith("scripts/lib/buscarAntes.mjs"))).toBe(true);
    expect(g.length).toBeGreaterThan(3);
  });

  it("ningún fichero del grafo nombra child_process, worker_threads ni cluster", () => {
    for (const ruta of grafo(HOOK)) {
      const src = sinComentarios(readFileSync(ruta, "utf8"));
      expect(src, ruta).not.toMatch(/(?:node:)?(?:child_process|worker_threads|cluster)\b/);
    }
  });
});

describe("POSIX con varios usuarios: ni enlaces ni ficheros ajenos", () => {
  it("leerIndice no sigue un enlace (lstat)", (ctx) => {
    const d = nuevoDir();
    const real = join(d, "real.json");
    writeFileSync(real, JSON.stringify({ version: 1, fichas: [], generado: new Date().toISOString() }));
    const enlace = join(d, "indice.json");
    try {
      symlinkSync(real, enlace);
    } catch {
      ctx.skip(); // Windows sin permiso para enlaces: no se puede ensayar aquí
      return;
    }
    expect(leerIndice(enlace).indice).toBeNull();
  });

  it.skipIf(typeof process.getuid !== "function")("escrituraSegura niega un enlace y acepta un fichero propio o ausente", () => {
    const d = nuevoDir();
    const real = join(d, "real.log");
    writeFileSync(real, "x");
    const enlace = join(d, "senales.log");
    symlinkSync(real, enlace);
    expect(escrituraSegura(enlace, d)).toBe(false);
    expect(escrituraSegura(real, d)).toBe(true);
    expect(escrituraSegura(join(d, "no-existe.log"), d)).toBe(true);
  });

  it("escrituraSegura: una ruta rara no revienta", () => {
    expect(() => escrituraSegura(join(nuevoDir(), "a", "b"), join(nuevoDir(), "nada"))).not.toThrow();
  });
});
