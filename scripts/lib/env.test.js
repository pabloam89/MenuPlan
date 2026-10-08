import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `op` de mentira: responde a `op inject` con «VALOR-de-<dirección>» y apunta
// cada llamada, para ver cuántas se hacen y con qué token.
const llamadas = [];
vi.mock("node:child_process", () => ({
  execFileSync: (cmd, args, opts) => {
    llamadas.push({ cmd, args, token: opts?.env?.OP_SERVICE_ACCOUNT_TOKEN });
    if (cmd !== "op") throw new Error(`no se esperaba ${cmd}`);
    if (globalThis.__sinOp) throw Object.assign(new Error("spawn op ENOENT"), { code: "ENOENT" });
    return opts.input.split("\n").map((l) => l.replace(/\{\{ (op:\/\/[^}]+) \}\}/, (_, ref) => `VALOR-de-${ref.trim()}`)).join("\n");
  },
}));

const { cargarEnv, esReferencia, leerEnv, leerFichero } = await import("./env.mjs");

const NOMBRES = ["PRUEBA_A", "PRUEBA_B", "PRUEBA_C", "PRUEBA_LLANA"];
beforeEach(() => {
  llamadas.length = 0;
  globalThis.__sinOp = false;
  process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_de_prueba";
});
afterEach(() => {
  for (const k of NOMBRES) delete process.env[k];
  delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
});

describe("leerFichero", () => {
  it("quita comillas, ignora comentarios y líneas sin valor", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const ruta = join(dir, ".env.local");
    writeFileSync(ruta, '# comentario\nA="con comillas"\nB=op://HoMenu/Item/B\r\nSOLO_NOMBRE\nVACIA=\nC=\'simples\'\n');
    expect(leerFichero(ruta)).toEqual({ A: "con comillas", B: "op://HoMenu/Item/B", C: "simples" });
  });

  it("sin fichero, vacío (el CI no tiene .env.local)", () => {
    expect(leerFichero(join(tmpdir(), "no-existe", ".env.local"))).toEqual({});
  });
});

describe("leerEnv", () => {
  it("un valor en claro del entorno sale tal cual, sin llamar a op", () => {
    process.env.PRUEBA_LLANA = "clave-en-claro";
    expect(leerEnv("PRUEBA_LLANA")).toBe("clave-en-claro");
    expect(llamadas).toEqual([]);
  });

  it("una dirección op:// se pide a 1Password con el token de la service account", () => {
    process.env.PRUEBA_A = "op://HoMenu/Uno/PRUEBA_A";
    expect(leerEnv("PRUEBA_A")).toBe("VALOR-de-op://HoMenu/Uno/PRUEBA_A");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].token).toBe("ops_de_prueba");
  });

  it("sin el comando op, el error lo dice en llano", () => {
    globalThis.__sinOp = true;
    process.env.PRUEBA_B = "op://HoMenu/Otro/PRUEBA_B";
    expect(() => leerEnv("PRUEBA_B")).toThrow(/no encuentro el comando `op`/);
  });

  it("obligatoria y ausente, lanza", () => {
    expect(() => leerEnv("PRUEBA_NO_EXISTE_NUNCA", { obligatoria: true })).toThrow(/Falta PRUEBA_NO_EXISTE_NUNCA/);
  });
});

describe("cargarEnv", () => {
  it("resuelve varias direcciones en UNA sola llamada y deja lo llano como está", () => {
    process.env.PRUEBA_A = "op://HoMenu/Varias/PRUEBA_A";
    process.env.PRUEBA_C = "op://HoMenu/Varias/PRUEBA_C";
    process.env.PRUEBA_LLANA = "llana";
    cargarEnv(["PRUEBA_A", "PRUEBA_C", "PRUEBA_LLANA"]);
    expect(llamadas).toHaveLength(1);
    expect(process.env.PRUEBA_A).toBe("VALOR-de-op://HoMenu/Varias/PRUEBA_A");
    expect(process.env.PRUEBA_C).toBe("VALOR-de-op://HoMenu/Varias/PRUEBA_C");
    expect(process.env.PRUEBA_LLANA).toBe("llana");
    expect(Object.values(process.env).some(esReferencia)).toBe(false);
  });
});
