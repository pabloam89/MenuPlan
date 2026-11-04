/**
 * Un ver_menu que Lola hace solo para encontrar un hueco no se pinta debajo
 * (callarConsultas, agente.js). Pasó el 4 nov 2026: «¿me cambias el shakshuka?
 * ¿eso qué es?» → ver_menu y proponer_platos, y debajo de las tres opciones
 * salió la semana entera. Se prueban las herramientas de verdad (herramientas()
 * de agente.js), con la casa, lo pintado y las opciones de mentira.
 */
import { describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./casa.js", async (original) => ({ ...(await original()), cargarCasa: vi.fn(async () => ({ householdId: "casa", semanas: [], state: { data: {} } })) }));
vi.mock("./pintar.js", async (original) => ({
  ...(await original()),
  pintarMenuEntero: vi.fn(async () => ({ texto: "<b>Jueves</b>\n🍽️ Shakshuka", fotos: [{ url: "foto-del-dia", pie: "Shakshuka" }], conMenu: 1, noPlanificadas: [] })),
}));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  proponerPlatos: vi.fn(async (_h, _hueco, fotos) => { fotos?.push({ url: "foto-opcion", pie: "1. Merluza" }); return "Opciones para la cena."; }),
  porQuePlato: vi.fn(async () => "Lo puso el menú automático."),
  describirReceta: vi.fn(async () => "Shakshuka (25 min)"),
}));

const { herramientas, USAN_UN_HUECO, FICHAS } = await import("./agente.js");

/** Un turno: las herramientas, en orden, sobre el mismo chat. */
async function turno(...pasos) {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], pintar: null, pintados: [], papel: "owner", esGrupo: false, texto: "", llamadas: [], resultados: [] };
  const tools = await herramientas(chat);
  for (const [nombre, args] of pasos) await tools.find((t) => t.name === nombre).run(args, { toolUse: { id: `t-${nombre}` } });
  return chat;
}

describe("un ver_menu para buscar no se pinta", () => {
  it("ver_menu solo: sale pintado, con la foto del día", async () => {
    const chat = await turno(["ver_menu", { cuando: "dia", dia: "jueves" }]);
    expect(chat.pintar?.dias).toHaveLength(1);
    expect(chat.fotos.map((f) => f.url)).toEqual(["foto-del-dia"]);
  });

  it("ver_menu y luego proponer_platos: nada de ver_menu debajo, ni su foto; las opciones sí", async () => {
    const chat = await turno(["ver_menu", {}], ["proponer_platos", { plato: "shakshuka" }]);
    expect(chat.pintar).toBeNull();
    expect(chat.fotos.map((f) => f.url)).toEqual(["foto-opcion"]);
  });

  it("también antes de por_que_plato, y la foto de un día mirado se quita", async () => {
    const chat = await turno(["ver_menu", { cuando: "dia", dia: "jueves" }], ["por_que_plato", { dia: "jueves", comida: "Cena" }]);
    expect(chat.pintar).toBeNull();
    expect(chat.fotos).toEqual([]);
  });

  it("ver_menu DESPUÉS de proponer_platos sí se pinta: es lo que pidieron ver", async () => {
    const chat = await turno(["proponer_platos", { plato: "shakshuka" }], ["ver_menu", {}]);
    expect(chat.pintar?.dias?.length).toBeGreaterThan(0);
  });

  it("ver_menu y ver_receta: se pinta (ver_receta no busca un hueco)", async () => {
    const chat = await turno(["ver_menu", {}], ["ver_receta", { nombre: "shakshuka" }]);
    expect(chat.pintar?.dias?.length).toBeGreaterThan(0);
  });

  it("USAN_UN_HUECO nombra herramientas que existen", () => {
    expect([...USAN_UN_HUECO].filter((n) => !FICHAS.has(n))).toEqual([]);
  });
});
