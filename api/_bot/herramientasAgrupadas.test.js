/**
 * Herramientas de propósito claro y sin solapes (trozo 45 de #1037): dos herramientas que escriben no comparten
 * capacidad, y quién come dónde es una sola, con su plazo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS", ajustarHorario: vi.fn(async () => "horario"), ajustarCocina: vi.fn(async () => "cocina"), ajustarCompra: vi.fn(async () => "compra"), ajustarExtras: vi.fn(async () => "extras"), ajustarModoDespensa: vi.fn(async () => "despensa") }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), apuntarAusencia: vi.fn(async () => ({ texto: "ok", hayMenu: true, hecho: "ok", valores: [] })) }));
vi.mock("./despensa.js", async (original) => ({ ...(await original()), verDespensa: vi.fn(async () => "despensa") }));
vi.mock("./cole.js", async (original) => ({ ...(await original()), verMenuCole: vi.fn(async () => "cole") }));

const { FICHAS, PARTES_DE_CASA, SOLO_LECTURA, herramientas, pantallaDe } = await import("./agente.js");
const { ajustarCocina, ajustarCompra, ajustarExtras, ajustarHorario, ajustarModoDespensa } = await import("./ajustes.js");
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
  compra: ["owner", "editor", "viewer", "viewer-grupo", "ajeno", "sin-papel"],
  cole: ["owner", "editor", "viewer", "viewer-grupo", "ajeno", "sin-papel"],
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

describe("ajustar_casa, cuatro partes y una llamada por parte (trozo 47)", () => {
  const CHAT = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "c", resultados: [] };
  const GUARDAN = [ajustarCocina, ajustarCompra, ajustarExtras, ajustarModoDespensa];
  const herramientaCasa = async () => (await herramientas({ ...CHAT })).find((x) => x.name === "ajustar_casa");
  const ajustar = async (args) => (await herramientaCasa()).run(args, { toolUse: { id: `t-${Math.random()}` } });

  beforeEach(() => GUARDAN.forEach((g) => g.mockClear()));

  it("las cuatro viejas ya no están, y lo que protege o no se deshace igual sigue aparte", () => {
    for (const n of ["ajustar_cocina", "ajustar_compra", "ajustar_extras", "ajustar_uso_despensa"]) expect(FICHAS.has(n), n).toBe(false);
    for (const n of ["ajustar_alergias", "ajustar_salud", "quitar_comensal", "ajustar_trato", "ajustar_gustos", "ajustar_semana", "ajustar_persona", "ajustar_menu_peques"]) expect(FICHAS.has(n), n).toBe(true);
  });

  it("cada parámetro es de una sola parte, y ninguno se queda sin parte", async () => {
    const campos = Object.values(PARTES_DE_CASA).flatMap((p) => p.campos);
    expect(new Set(campos).size).toBe(campos.length);
    expect([...campos].sort()).toEqual(Object.keys((await herramientaCasa()).input_schema.properties).sort());
  });

  it("cada parte guarda con lo suyo, y con los argumentos tal cual", async () => {
    await ajustar({ trastosMas: ["Airfryer"] });
    expect(ajustarCocina.mock.calls[0]).toEqual(["casa", { trastosMas: ["Airfryer"] }]);
    await ajustar({ supermercadosMas: ["Lidl"] });
    expect(ajustarCompra.mock.calls[0]).toEqual(["casa", { supermercadosMas: ["Lidl"] }]);
    await ajustar({ desayuno: "off" });
    expect(ajustarExtras.mock.calls[0]).toEqual(["casa", { desayuno: "off" }]);
    await ajustar({ usoDespensa: "off" });
    expect(ajustarModoDespensa.mock.calls[0]).toEqual(["casa", { modo: "off" }]);
  });

  it("dos partes en una llamada no guardan nada: deshaz solo volvería atrás una", async () => {
    expect(await ajustar({ esfuerzo: "pro", presupuesto: 80 })).toMatch(/^NO GUARDADO/);
    for (const g of GUARDAN) expect(g).not.toHaveBeenCalled();
  });

  it("sin nada que cambiar tampoco guarda, y lo dice", async () => {
    expect(await ajustar({})).toMatch(/^NO GUARDADO/);
    for (const g of GUARDAN) expect(g).not.toHaveBeenCalled();
  });

  it("solo lo de la compra lleva a la pantalla de la compra", () => {
    expect(pantallaDe("ajustar_casa", { presupuesto: 80 })).toBe("compra");
    for (const args of [{ esfuerzo: "pro" }, { desayuno: "off" }, { usoDespensa: "off" }, {}]) expect(pantallaDe("ajustar_casa", args)).toBeNull();
  });
});
