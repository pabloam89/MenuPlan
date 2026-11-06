/**
 * Herramientas de propósito claro y sin solapes (trozo 45 de #1037): dos herramientas que escriben no comparten
 * capacidad, y quién come dónde es una sola, con su plazo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS", ajustarHorario: vi.fn(async () => "horario") }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), apuntarAusencia: vi.fn(async () => ({ texto: "ok", hayMenu: true, hecho: "ok", valores: [] })) }));
vi.mock("./despensa.js", async (original) => ({ ...(await original()), verDespensa: vi.fn(async () => "despensa") }));
vi.mock("./cole.js", async (original) => ({ ...(await original()), verMenuCole: vi.fn(async () => "cole") }));

const { FICHAS, SOLO_LECTURA, herramientas, pantallaDe } = await import("./agente.js");
const { ajustarHorario } = await import("./ajustes.js");
const { apuntarAusencia } = await import("./menu.js");
const { QUE_CONSULTAS } = await import("../../src/lib/vocabularios.js");

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

describe("donde_come, con su plazo", () => {
  it("dias apunta la ausencia, y no el horario", async () => {
    await correr({ plazo: "dias", dias: ["jueves"], comidas: ["Comida"], quienes: ["Leo"] });
    expect(apuntarAusencia.mock.calls[0][1]).toMatchObject({ dias: ["jueves"], comidas: ["Comida"], quienes: ["Leo"], deNuevo: false });
    expect(ajustarHorario).not.toHaveBeenCalled();
  });

  it("siempre cambia el horario, y no apunta ausencias ni lleva botón", async () => {
    const { r, chat } = await correr({ plazo: "siempre", quienes: ["Leo"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(r).toMatch(/^horario/);
    expect(ajustarHorario.mock.calls[0][1]).toEqual({ personas: ["Leo"], dias: ["lunes"], comidas: ["Comida"], donde: "cole" });
    expect(apuntarAusencia).not.toHaveBeenCalled();
    expect(chat.nadaQueVer).toBe(true);
  });

  it("sin lo obligatorio de cada plazo, no guarda nada y lo dice", async () => {
    expect((await correr({ plazo: "siempre", quienes: ["Leo"] })).r).toMatch(/^NO GUARDADO/);
    expect((await correr({ plazo: "dias", dias: ["jueves"] })).r).toMatch(/^NO GUARDADO/);
    expect(ajustarHorario).not.toHaveBeenCalled();
    expect(apuntarAusencia).not.toHaveBeenCalled();
  });
});

// Quién podía ver cada consulta cuando eran herramientas sueltas. La casa y los
// ajustes son la familia (salud, alergias): un ajeno no los ve.
const PODIAN = {
  casa: ["owner", "editor", "viewer", "viewer-grupo"],
  ajustes: ["owner", "editor", "viewer", "viewer-grupo"],
  despensa: ["owner", "editor", "viewer", "viewer-grupo"],
  compra: ["owner", "editor", "viewer", "viewer-grupo", "ajeno"],
  cole: ["owner", "editor", "viewer", "viewer-grupo", "ajeno"],
  recordatorios: ["owner", "editor", "viewer"],
};
const QUIENES = { owner: { papel: "owner" }, editor: { papel: "editor" }, viewer: { papel: "viewer" }, "viewer-grupo": { papel: "viewer", esGrupo: true }, ajeno: { papel: "ajeno", esGrupo: true }, "sin-papel": {} };

describe("consultar, una sola para lo que no lleva campos (trozo 46)", () => {
  const consultar = async (que, quien = { papel: "owner" }) => {
    const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], esGrupo: false, texto: "c", resultados: [], ...quien };
    const t = (await herramientas(chat)).find((x) => x.name === "consultar");
    return { r: await t.run({ que }, { toolUse: { id: `t-${Math.random()}` } }), chat };
  };

  it("su lista de consultas es la del vocabulario", async () => {
    const t = (await herramientas({ householdId: "casa", chatId: "1", papel: "owner", fotos: [], resultados: [] })).find((x) => x.name === "consultar");
    expect(t.input_schema.properties.que.enum).toEqual(QUE_CONSULTAS);
    expect(Object.keys(PODIAN).sort()).toEqual([...QUE_CONSULTAS].sort());
  });

  it("no queda ninguna ver_ sin campos", async () => {
    const todas = await herramientas({ householdId: "casa", chatId: "1", papel: "owner", fotos: [], resultados: [] });
    const sinCampos = todas.filter((t) => t.name.startsWith("ver_") && !Object.keys(t.input_schema.properties ?? {}).length).map((t) => t.name);
    expect(sinCampos).toEqual([]);
  });

  it("solo lee: es una lectura para la puerta de pista.js y no escribe nada", () => {
    expect(SOLO_LECTURA.has("consultar")).toBe(true);
    expect(FICHAS.get("consultar").escribe).toEqual([]);
  });

  it("cada papel ve lo mismo que veía con las herramientas sueltas", async () => {
    const visto = {};
    for (const que of QUE_CONSULTAS) {
      visto[que] = [];
      for (const [nombre, quien] of Object.entries(QUIENES)) {
        const { r, chat } = await consultar(que, quien);
        if (/^NO PERMITIDO/.test(r)) expect(chat.nadaQueVer, `${que} ${nombre}`).toBe(true);
        else visto[que].push(nombre);
      }
    }
    expect(visto).toEqual(PODIAN);
  });

  it("lo que no está en la lista no se lee, ni con nombres de objeto", async () => {
    for (const que of ["otra", "constructor", undefined]) expect((await consultar(que)).r).toMatch(/^NO PERMITIDO/);
  });

  it("solo la compra lleva a una pantalla", () => {
    expect(QUE_CONSULTAS.filter((que) => pantallaDe("consultar", { que }))).toEqual(["compra"]);
    expect(pantallaDe("consultar", {})).toBeNull();
    expect(pantallaDe("consultar")).toBeNull();
  });
});
