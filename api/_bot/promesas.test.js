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
import { CAPACIDADES, estadoDe } from "../../src/lib/capacidades.js";

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
const TODO = `${CONOCIMIENTO}\n${DESCRIPCIONES}`;

/**
 * Las promesas que ya se rompieron una vez (#958, raíz 1), en vocabulario
 * cerrado: si el texto dice `dice`, la capacidad `capacidad` tiene que poder
 * hacerse en Lola (capacidades.js); con capacidad null, no se puede decir.
 * Cada fila es un caso arreglado: que no vuelva por otro texto.
 */
const PROMESAS = [
  // Gente está apagada (GENTE_ACTIVA): las recetas de Lola son de la casa.
  { id: "receta_en_gente", dice: /\bGente\b|"publica"/, capacidad: null },
  // La regla del invitado cuenta al generar; la compra hecha no cambia sola.
  { id: "invitado_en_la_compra_hecha", dice: /se suma a las raciones y a la compra/i, capacidad: null },
  // ver_menu no trae kcal (las trae ver_receta).
  { id: "kcal_en_ver_menu", dice: /ver_menu[^.\n;]{0,40}traen? kcal/i, capacidad: null },
  // Quitar de la lista sin marcarlo comprado es quitar_compra.
  { id: "quitar_de_la_lista", dice: /quitar_compra/, capacidad: "quitar_compra" },
];
const enLola = (id) => {
  const c = CAPACIDADES.find((x) => x.id === id);
  return Boolean(c) && ["los_dos", "solo_lola"].includes(estadoDe(c));
};

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

  for (const p of PROMESAS) {
    it(`promesa «${p.id}»: solo se dice si Lola lo hace`, () => {
      if (!p.dice.test(TODO)) return;
      expect(p.capacidad, `«${p.id}» se promete y no existe`).not.toBeNull();
      expect(enLola(p.capacidad), `«${p.id}» se promete y Lola no lo hace (capacidades.js)`).toBe(true);
    });
  }

  // Que cada fila mira algo de verdad: con el texto de antes, salta.
  it("cada promesa de la tabla reconoce el texto que la rompió", () => {
    const ROTOS = {
      receta_en_gente: "visibilidad: privada (solo la casa) o publica (sale en Gente).",
      invitado_en_la_compra_hecha: "Alguien de fuera viene a comer (se suma a las raciones y a la compra de esa semana).",
      kcal_en_ver_menu: "(ver_receta, ver_menu, proponer_platos traen kcal y lo que haya)",
      quitar_de_la_lista: "eso es quitar_compra, no marcarlo como comprado",
    };
    for (const p of PROMESAS) expect(p.dice.test(ROTOS[p.id]), p.id).toBe(true);
  });
});
