/**
 * Lo que el revisor vio en #965 (#958): ningún fallo se cambia en silencio por
 * «no visto», una sola lista de registros y un solo esDuplicado.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("./db.js", () => ({
  select: vi.fn(async () => { throw Object.assign(new Error("GET /rest/v1/bot_entradas → 503"), { status: 503 }); }),
  insert: vi.fn(async () => []),
  eq: (x) => `eq.${x}`,
}));

const { yaVista } = await import("./entradas.js");
const { SIN_LEER } = await import("./avisar.js");
const { SOLO_REGISTRO, NO_ES_DE_LA_CASA, conOperacion, operacion } = await import("./operacion.js");

const AQUI = dirname(fileURLToPath(import.meta.url));
const ficheros = readdirSync(AQUI).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));

describe("sin fallos tragados", () => {
  it("si no se puede mirar, yaVista dice SIN_LEER, no «no visto»", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await yaVista("telegram", "escritura:1:2:x:y")).toBe(SIN_LEER);
  });
});

describe("un dato, un sitio", () => {
  it("lo que no es de la casa sale de SOLO_REGISTRO: todo registro está en las dos", () => {
    for (const t of SOLO_REGISTRO) expect(NO_ES_DE_LA_CASA.has(t), t).toBe(true);
  });

  it("db.js no lleva su propia lista de registros", () => {
    expect(readFileSync(join(AQUI, "db.js"), "utf8")).not.toMatch(/new Set\(\[\s*"bot_messages"/);
  });

  it("esDuplicado se define una vez, en entradas.js", () => {
    const definen = ficheros.filter((f) => /const esDuplicado\s*=/.test(readFileSync(join(AQUI, f), "utf8")));
    expect(definen).toEqual(["entradas.js"]);
  });

  it("la operación no lleva contadores sin lector", () => {
    conOperacion({ chat: 1 }, () => expect("fotos" in operacion()).toBe(false));
  });
});
