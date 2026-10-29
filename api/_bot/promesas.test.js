/**
 * Lo que Lola promete existe en el código (#958, raíz 1).
 *
 * Las instrucciones (conocimiento.md) y las descripciones de las herramientas
 * prometían cosas que no estaban: calorías en ver_menu, un presupuesto que
 * nadie leía, recetas «que salen en Gente» con Gente apagada, invitados que
 * «se suman a la compra» ya hecha, quitar de la compra sin herramienta. Aquí
 * se contrasta lo dicho con el mapa de capacidades (src/lib/capacidades.js) y
 * con las herramientas de verdad.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CAPACIDADES, estadoDe } from "../../src/lib/capacidades.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { herramientas, FICHAS } = await import("./agente.js");
const CONOCIMIENTO = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const tools = await herramientas({ householdId: "x", chatId: "1", channel: "telegram", fotos: [], papel: "owner" });
const DESCRIPCIONES = tools.map((t) => `${t.description}\n${JSON.stringify(t.input_schema ?? t.inputSchema ?? {})}`).join("\n");
const TODO = `${CONOCIMIENTO}\n${DESCRIPCIONES}`;

// Cómo empieza el nombre de una herramienta: con lo que hace.
const PARECE_HERRAMIENTA = /\b((?:ver|ajustar|anadir|quitar|marcar|generar|cambiar|proponer|buscar|preparar|guardar|apartar|anotar|cerrar|editar|crear|cancelar|descartar|pedir|empezar|borrar|vaciar|mover)_[a-z_]+)\b/g;

/**
 * Las promesas que se contrastan, en vocabulario cerrado: si el texto dice
 * `dice`, la capacidad `capacidad` tiene que poder hacerse en Lola; con
 * capacidad null, no se puede decir (no existe o está apagado).
 */
const PROMESAS = [
  { id: "presupuesto", dice: /presupuest/i, capacidad: "presupuesto" },
  { id: "gente", dice: /\bGente\b|\bpublica\b/, capacidad: null },
  { id: "quitar_compra", dice: /quitar_compra|quita[rn]? .{0,25}de la lista/i, capacidad: "quitar_compra" },
  { id: "invitado_en_la_compra_hecha", dice: /se suma a las raciones y a la compra/i, capacidad: null },
  { id: "kcal_en_ver_menu", dice: /ver_menu[^.\n]{0,40}kcal/i, capacidad: null },
];

const enLola = (id) => {
  const c = CAPACIDADES.find((x) => x.id === id);
  return Boolean(c) && ["los_dos", "solo_lola"].includes(estadoDe(c));
};

describe("lo que Lola promete existe (#958)", () => {
  it("toda herramienta nombrada en las instrucciones o en una descripción existe", () => {
    const nombradas = [...new Set([...TODO.matchAll(PARECE_HERRAMIENTA)].map((m) => m[1]))];
    expect(nombradas.length).toBeGreaterThan(10);
    expect(nombradas.filter((n) => !FICHAS.has(n))).toEqual([]);
  });

  it("cada herramienta nombrada en las instrucciones está en el mapa de capacidades", () => {
    const usadas = new Set(CAPACIDADES.flatMap((c) => c.lola));
    const nombradas = [...new Set([...CONOCIMIENTO.matchAll(PARECE_HERRAMIENTA)].map((m) => m[1]))];
    expect(nombradas.filter((n) => !usadas.has(n))).toEqual([]);
  });

  for (const p of PROMESAS) {
    it(`promesa «${p.id}»: solo se dice si se puede hacer en Lola`, () => {
      if (!p.dice.test(TODO)) return;
      expect(p.capacidad, `«${p.id}» se promete y no existe`).not.toBeNull();
      expect(enLola(p.capacidad), `«${p.id}» se promete y Lola no lo hace (capacidades.js)`).toBe(true);
    });
  }

  it("las promesas del recibo: toda acción de resultado.js tiene etiqueta", async () => {
    const { ACCIONES, resultado } = await import("./resultado.js");
    for (const a of Object.keys(ACCIONES)) expect(resultado({ accion: a, hecho: ["x"] }).estado).toBe("hecho");
    expect(() => resultado({ accion: "inventada" })).toThrow();
  });
});
