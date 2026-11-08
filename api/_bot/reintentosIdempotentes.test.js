/**
 * Reintentos y escrituras dobles (#958, raíz 4): un error después de escribir
 * se marca «a medias» (no se ofrece repetir), el botón [[Reintentar]] lleva su
 * mensaje y su autor, y la despensa no suma dos veces ni mezcla unidades.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { ejecutar } = await import("./agente.js");
const { planDespensa } = await import("./despensa.js");
const { datoReintentar, leerReintentar } = await import("../bot/telegram.js");

const uso = { input_tokens: 1, output_tokens: 1 };

describe("un error del modelo después de escribir", () => {
  it("que no es caída también queda «a medias»: [[Reintentar]] lo repetiría", async () => {
    const apuntar = { name: "anadir_compra", run: async () => "Añadido." };
    const vuelta = async (x) => {
      await x.tools.find((t) => t.name === "anadir_compra").run({});
      throw Object.assign(new Error("400 la petición está mal"), { status: 400 });
    };
    const err = await ejecutar({ entrada: "apunta leche", tools: [apuntar], vuelta, modelos: ["a"] }).catch((e) => e);
    expect(err.aMedias).toBe(true);
  });

  it("sin escribir nada, el error sigue como estaba", async () => {
    const vuelta = async () => { throw Object.assign(new Error("400"), { status: 400 }); };
    const err = await ejecutar({ entrada: "hola", tools: [], vuelta, modelos: ["a"] }).catch((e) => e);
    expect(err.aMedias).toBeUndefined();
  });

  it("y la vuelta normal no cambia", async () => {
    const r = await ejecutar({ entrada: "hola", tools: [], vuelta: async () => ({ dicho: "Hola", uso }), modelos: ["a"] });
    expect(r.dicho).toBe("Hola");
  });
});

describe("el botón [[Reintentar]]", () => {
  it("lleva el mensaje y quién lo escribió, y se lee igual", () => {
    const d = datoReintentar("apunta leche", { mid: 12345, persona: 987654321 });
    expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
    expect(leerReintentar(d)).toEqual({ mid: "12345", persona: "987654321", texto: "apunta leche" });
  });

  it("con varias personas en el turno no hay botón: el texto lleva lo de otros", () => {
    expect(datoReintentar("[Ana]: leche\n[Luis]: pan", { mid: 1, persona: null, variosAutores: true })).toBe(null);
  });

  it("si no cabe en los 64 bytes de Telegram, tampoco", () => {
    expect(datoReintentar("x".repeat(60), { mid: 1, persona: 1 })).toBe(null);
  });

  it("un botón que no es de reintento no se confunde", () => {
    expect(leerReintentar("t:Sí")).toBe(null);
    expect(leerReintentar("re::")).toBe(null);
  });
});

describe("la despensa suma con unidades", () => {
  const conv = (q, de, a) => (de === "g" && a === "ud" ? null : de === "ud" && a === "g" ? null : null);
  const e = (normalized, qty, unit, nombre = normalized) => ({ nombre, normalized, frozen: false, qty, unit });

  it("1 kg y 2 ud de lo mismo en una foto no dan 1002 g: lo que no se convierte se dice", () => {
    const p = planDespensa([e("patata", 1000, "g"), e("patata", 2, "ud")], [], conv);
    expect(p.nuevas).toEqual([e("patata", 1000, "g")]);
    expect(p.sinSumar.map((s) => [s.nombre, s.tiene, s.viene])).toEqual([["patata", "g", "ud"]]);
  });

  it("si se puede convertir, se suma convertido", () => {
    const p = planDespensa([e("patata", 1000, "g"), e("patata", 2, "ud")], [], (q, de, a) => (de === "ud" && a === "g" ? q * 200 : null));
    expect(p.nuevas[0].qty).toBe(1400);
    expect(p.sinSumar).toEqual([]);
  });

  it("con la fila de la base en otra unidad, no se salta en silencio", () => {
    const p = planDespensa([e("leche", 1000, "ml")], [{ id: 1, ingredient_normalized: "leche", qty: "500", unit: "g", frozen: false }], conv);
    expect(p.sumadas).toEqual([]);
    expect(p.nuevas).toEqual([]);
    expect(p.sinSumar).toHaveLength(1);
  });

  it("en la misma unidad suma, y guarda la cantidad leída para no pisar otra escritura", () => {
    const p = planDespensa([e("arroz", 500, "g")], [{ id: 1, ingredient_normalized: "arroz", qty: "1000", unit: "g", frozen: false }], conv);
    expect(p.sumadas).toHaveLength(1);
    expect(p.sumadas[0].qty).toBe(1500);
    expect(p.sumadas[0].leida).toBe("1000");
  });
});
