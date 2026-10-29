/**
 * Lo que el revisor vio en #965 (#958, C8 y C12): una sola lista de registros,
 * un solo esDuplicado y ningún contador sin lector en la operación.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { SOLO_REGISTRO, NO_ES_DE_LA_CASA, conOperacion, operacion } = await import("./operacion.js");

const AQUI = dirname(fileURLToPath(import.meta.url));
const ficheros = readdirSync(AQUI).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));

describe("un dato, un sitio", () => {
  it("lo que no es de la casa sale de SOLO_REGISTRO: todo registro está en las dos", () => {
    for (const t of SOLO_REGISTRO) expect(NO_ES_DE_LA_CASA.has(t), t).toBe(true);
  });

  it("db.js no lleva su propia lista de registros", () => {
    expect(readFileSync(join(AQUI, "db.js"), "utf8")).not.toMatch(/new Set\(\[\s*"bot_messages"/);
  });

  it("la expresión de «ya estaba» (esDuplicado) vive en un solo fichero, entradas.js", () => {
    // Por la expresión y no por el nombre: también cuenta una copia en línea.
    const definen = ficheros.filter((f) => readFileSync(join(AQUI, f), "utf8").includes("23505|duplicate key"));
    expect(definen).toEqual(["entradas.js"]);
  });

  it("la operación no lleva contadores sin lector", () => {
    conOperacion({ chat: 1 }, () => expect("fotos" in operacion()).toBe(false));
  });
});
