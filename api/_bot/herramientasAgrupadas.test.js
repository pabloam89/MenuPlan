/**
 * Herramientas de propósito claro y sin solapes (trozo 45 de #1037): dos herramientas que escriben no comparten
 * capacidad, y quién come dónde es una sola, con su alcance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS", ajustarHorario: vi.fn(async () => "horario") }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), apuntarAusencia: vi.fn(async () => ({ texto: "ok", hayMenu: true, hecho: "ok", valores: [] })) }));

const { FICHAS, herramientas } = await import("./agente.js");
const { ajustarHorario } = await import("./ajustes.js");
const { apuntarAusencia } = await import("./menu.js");

// Una capacidad con varios verbos (crear, cerrar, editar): no hacen lo mismo. Ninguna más se apunta aquí sin motivo.
const COMPARTIDAS = new Set(["recordatorios", "tareas", "crear_receta"]);

const correr = async (args) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "c", resultados: [] };
  const t = (await herramientas(chat)).find((x) => x.name === "donde_come");
  return { r: await t.run(args, { toolUse: { id: `t-${Math.random()}` } }), chat };
};

beforeEach(() => {
  ajustarHorario.mockClear();
  apuntarAusencia.mockClear();
});

describe("sin solapes", () => {
  it("dos herramientas que escriben no hacen lo mismo", () => {
    const dueno = new Map();
    const solapes = [];
    for (const [nombre, ficha] of FICHAS) {
      if (ficha.soloLectura) continue;
      for (const c of ficha.capacidades) {
        if (dueno.has(c) && !COMPARTIDAS.has(c)) solapes.push(`${c}: ${dueno.get(c)} y ${nombre}`);
        dueno.set(c, nombre);
      }
    }
    expect(solapes).toEqual([]);
  });

  it("las dos viejas ya no están", () => {
    expect(FICHAS.has("fuera_de_casa")).toBe(false);
    expect(FICHAS.has("ajustar_horario")).toBe(false);
  });
});

describe("donde_come, con su alcance", () => {
  it("dias apunta la ausencia, y no el horario", async () => {
    await correr({ alcance: "dias", dias: ["jueves"], comidas: ["Comida"], quienes: ["Leo"] });
    expect(apuntarAusencia.mock.calls[0][1]).toMatchObject({ dias: ["jueves"], comidas: ["Comida"], quienes: ["Leo"], deNuevo: false });
    expect(ajustarHorario).not.toHaveBeenCalled();
  });

  it("siempre cambia el horario, y no apunta ausencias ni lleva botón", async () => {
    const { r, chat } = await correr({ alcance: "siempre", quienes: ["Leo"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(r).toMatch(/^horario/);
    expect(ajustarHorario.mock.calls[0][1]).toEqual({ personas: ["Leo"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(apuntarAusencia).not.toHaveBeenCalled();
    expect(chat.nadaQueVer).toBe(true);
  });

  it("sin lo obligatorio de cada alcance, no guarda nada y lo dice", async () => {
    expect((await correr({ alcance: "siempre", quienes: ["Leo"] })).r).toMatch(/^NO GUARDADO/);
    expect((await correr({ alcance: "dias", dias: ["jueves"] })).r).toMatch(/^NO GUARDADO/);
    expect(ajustarHorario).not.toHaveBeenCalled();
    expect(apuntarAusencia).not.toHaveBeenCalled();
  });
});
