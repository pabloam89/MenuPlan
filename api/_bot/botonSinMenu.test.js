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
vi.mock("./menu.js", async (original) => ({ ...(await original()), apuntarAusencia: vi.fn(), quitarCompra: vi.fn() }));
vi.mock("./casa.js", async (original) => ({ ...(await original()), cargarCasa: vi.fn(), conCasa: vi.fn() }));

const { herramientas } = await import("./agente.js");
const { apuntarAusencia, quitarCompra } = await import("./menu.js");
const { cargarCasa, conCasa } = await import("./casa.js");

const apuntar = async (devuelve) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "c", resultados: [] };
  apuntarAusencia.mockImplementationOnce(async () => devuelve);
  const t = (await herramientas(chat)).find((x) => x.name === "fuera_de_casa");
  await t.run({ dias: ["hoy"], comidas: ["Cena"] }, { toolUse: { id: `t-${Math.random()}` } });
  return chat;
};
const GUARDADA = { texto: "Isa fuera hoy.", pintar: null, hecho: "Isa fuera hoy", valores: [], aMedias: false };

/** Corre una herramienta de la compra de verdad y devuelve a qué pantalla llevaría. */
const irTras = async (nombre, args = {}) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "c", resultados: [] };
  const t = (await herramientas(chat)).find((x) => x.name === nombre);
  await t.run(args, { toolUse: { id: `t-${Math.random()}` } });
  return chat.ir ?? null;
};
const casaCon = (items) => ({ householdId: "casa", state: { data: {}, shopping: { items } }, menu: null, semanas: [], semana: null });

describe("la compra y el botón a la app (trozo 73)", () => {
  it("ver_compra con la lista vacía no lleva botón", async () => {
    cargarCasa.mockResolvedValueOnce(casaCon([]));
    expect(await irTras("ver_compra")).toBeNull();
  });

  it("ver_compra con algo, aunque esté todo comprado, lleva a la compra", async () => {
    cargarCasa.mockResolvedValueOnce(casaCon([{ name: "pan", have: true }]));
    expect(await irTras("ver_compra")).toBe("compra");
  });

  it("quitar lo último no lleva a una lista vacía; si queda algo, sí", async () => {
    quitarCompra.mockImplementationOnce(async (_c, _q, out) => { out.vacia = true; return "Quitado."; });
    expect(await irTras("quitar_compra", { productos: ["pan"] })).toBeNull();
    quitarCompra.mockImplementationOnce(async (_c, _q, out) => { out.vacia = false; return "Quitado."; });
    expect(await irTras("quitar_compra", { productos: ["pan"] })).toBe("compra");
  });
});

const { quitarCompra: deVerdad } = await vi.importActual("./menu.js");

describe("quitarCompra dice si la lista se ha quedado vacía (trozo 73)", () => {
  const quitar = async (items, productos) => {
    const out = {};
    conCasa.mockImplementationOnce(async (_h, cambiar) => { await cambiar(casaCon(items)); return { ok: true }; });
    await deVerdad("casa", { productos }, out);
    return out.vacia;
  };

  it("sin nada más, vacía; con algo más, no", async () => {
    expect(await quitar([{ name: "pan", manual: true }], ["pan"])).toBe(true);
    expect(await quitar([{ name: "pan", manual: true }, { name: "sal", manual: true }], ["pan"])).toBe(false);
  });
});

describe("fuera_de_casa y el botón a la app", () => {
  it("sin menú en esos días, guarda y no lleva botón", async () => {
    expect((await apuntar({ ...GUARDADA, hayMenu: false })).ir ?? null).toBeNull();
  });

  it("con menú en esos días, lleva a la semana", async () => {
    expect((await apuntar({ ...GUARDADA, hayMenu: true })).ir).toBe("semana");
  });
});
