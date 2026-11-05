/**
 * El botón a la app solo sale si esa pantalla tiene algo que enseñar: apuntar una ausencia en una casa sin menú
 * guarda la regla, pero «Ver la semana» abriría «Aún no tienes menú» (Pablo, 5 nov 2026). Con las herramientas de
 * verdad (herramientas() de agente.js) y la ausencia de mentira.
 */
import { describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({
  ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: true }),
}));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), apuntarAusencia: vi.fn() }));

const { herramientas } = await import("./agente.js");
const { apuntarAusencia } = await import("./menu.js");

const apuntar = async (devuelve) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "c", resultados: [] };
  apuntarAusencia.mockImplementationOnce(async () => devuelve);
  const t = (await herramientas(chat)).find((x) => x.name === "fuera_de_casa");
  await t.run({ dias: ["hoy"], comidas: ["Cena"] }, { toolUse: { id: `t-${Math.random()}` } });
  return chat;
};
const GUARDADA = { texto: "Isa fuera hoy.", pintar: null, hecho: "Isa fuera hoy", valores: [], aMedias: false };

describe("fuera_de_casa y el botón a la app", () => {
  it("sin menú en esos días, guarda y no lleva botón", async () => {
    expect((await apuntar({ ...GUARDADA, hayMenu: false })).ir ?? null).toBeNull();
  });

  it("con menú en esos días, lleva a la semana", async () => {
    expect((await apuntar({ ...GUARDADA, hayMenu: true })).ir).toBe("semana");
  });
});
