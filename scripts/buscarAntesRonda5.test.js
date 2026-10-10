import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_BYTES_INDICE, leerIndice, textoDeAviso } from "./lib/buscarAntes.mjs";

/** Revisión de seguridad y del revisor (#384): la etiqueta de certeza va por ítem, y el índice solo se lee si es un fichero normal y pequeño. */
const res = (numero, titulo, parecido, claveCompartida) => ({
  ficha: { numero, titulo, estado: "abierto", clase: "issue", tipo: "caso" },
  parecido, claveCompartida, compartidos: claveCompartida ? 1 : 3,
});
const senal = { extracto: "un test falla", tipo: "test-rojo", consulta: "x" };
const lectura = { indice: { fichas: [] }, horas: 1 };

describe("textoDeAviso: la etiqueta va por ítem", () => {
  it("un parecido flojo junto a uno firme NO hereda «Coincide con lo apuntado»", () => {
    const t = textoDeAviso(senal, [res(1, "firme", 0.8, true), res(2, "flojo", 0.35, true)], lectura);
    const [antes, despues] = t.split("Posible parecido, sin confirmar");
    expect(antes).toContain("Coincide con lo apuntado");
    expect(antes).toContain("#1");
    expect(antes).not.toContain("#2");
    expect(despues).toContain("#2");
    expect(despues).not.toContain("Coincide con lo apuntado");
  });

  it("todos firmes o todos flojos: una sola etiqueta", () => {
    expect(textoDeAviso(senal, [res(1, "a", 0.8, true)], lectura)).not.toContain("Posible parecido");
    const flojo = textoDeAviso(senal, [res(2, "b", 0.35, true)], lectura);
    expect(flojo).toContain("Posible parecido, sin confirmar");
    expect(flojo).not.toContain("Coincide con lo apuntado");
  });
});

describe("leerIndice: solo un fichero normal y pequeño", () => {
  it("el tope es 1 MB", () => expect(MAX_BYTES_INDICE).toBe(1024 * 1024));

  it("algo que no es un fichero (una carpeta, como un FIFO) no se lee ni se cuelga", () => {
    const dir = mkdtempSync(join(tmpdir(), "indice-no-fichero-"));
    const ruta = join(dir, "indice.json");
    mkdirSync(ruta);
    expect(leerIndice(ruta).indice).toBeNull();
  });

  it("un índice de más de 1 MB se descarta", () => {
    const dir = mkdtempSync(join(tmpdir(), "indice-grande-"));
    const ruta = join(dir, "indice.json");
    writeFileSync(ruta, JSON.stringify({ version: 1, fichas: [], relleno: "x".repeat(MAX_BYTES_INDICE) }));
    expect(leerIndice(ruta)).toMatchObject({ indice: null, motivo: "grande" });
  });
});
