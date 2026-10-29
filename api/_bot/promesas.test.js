/**
 * Lo que Lola promete existe en el código (#958, raíz 1).
 *
 * Las instrucciones (conocimiento.md) y las descripciones de las herramientas
 * nombran herramientas: aquí se contrasta lo nombrado con las herramientas de
 * verdad (FICHAS, agente.js) y con el mapa de capacidades
 * (src/lib/capacidades.js). Si conocimiento.md manda a Lola a una herramienta
 * que no existe, Lola la inventa o dice que lo ha hecho sin poder.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CAPACIDADES } from "../../src/lib/capacidades.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { herramientas, FICHAS } = await import("./agente.js");
const CONOCIMIENTO = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const tools = await herramientas({ householdId: "x", chatId: "1", channel: "telegram", fotos: [], papel: "owner" });
const DESCRIPCIONES = tools.map((t) => `${t.description}\n${JSON.stringify(t.input_schema ?? t.inputSchema ?? {})}`).join("\n");

// Lo que parece el nombre de una herramienta: uno de los verbos con que
// empiezan las de verdad (sacados de FICHAS, no copiados), «_» y más.
const VERBOS = [...new Set([...FICHAS.keys()].map((n) => n.split("_")[0]))];
const PARECE_HERRAMIENTA = new RegExp(`\\b((?:${VERBOS.join("|")})_[a-z_]+)\\b`, "g");
const nombradasEn = (texto) => [...new Set([...texto.matchAll(PARECE_HERRAMIENTA)].map((m) => m[1]))];

describe("lo que Lola promete existe (#958)", () => {
  it("toda herramienta nombrada en las instrucciones o en una descripción existe", () => {
    const nombradas = nombradasEn(`${CONOCIMIENTO}\n${DESCRIPCIONES}`);
    // Que la expresión encuentra algo: si no, el test pasaría sin mirar nada.
    expect(nombradas.length).toBeGreaterThan(10);
    expect(nombradas.filter((n) => !FICHAS.has(n))).toEqual([]);
  });

  it("cada herramienta nombrada en las instrucciones está en el mapa de capacidades", () => {
    const usadas = new Set(CAPACIDADES.flatMap((c) => c.lola));
    expect(nombradasEn(CONOCIMIENTO).filter((n) => !usadas.has(n))).toEqual([]);
  });
});
