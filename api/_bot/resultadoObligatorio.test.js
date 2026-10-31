/**
 * Resultado obligatorio (trozo 27 de #1037): toda herramienta de Lola que
 * escribe datos de la ficha (`escribe` no vacío en su ficha) devuelve un
 * RESULTADO (resultado.js). Lo que devuelva otra cosa, la puerta de
 * ejecutarUna (agente.js) lo rechaza: no cuenta como guardado aunque
 * escribiera, el modelo lee que no consta como hecho y queda un
 * bot_tool_error. Las que aún devuelven texto están en una lista cerrada que
 * solo baja.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({
  ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []),
  // Toda herramienta de esta prueba «escribe»: así se ve que escribir sin resultado no basta.
  contandoEscrituras: vi.fn(async (correr) => ({ r: await correr(), escribio: true })),
}));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./embudo.js", async (original) => ({ ...(await original()), registrar: vi.fn(async () => {}), duenoDe: vi.fn(async () => "u1") }));
vi.mock("./casa.js", async (original) => ({ ...(await original()), apuntarOperacion: vi.fn(async () => {}) }));
vi.mock("./menu.js", async (original) => ({ ...(await original()), cambiarPlato: vi.fn(), anadirCompra: vi.fn() }));
vi.mock("./generar.js", async (original) => ({ ...(await original()), generarMenu: vi.fn() }));
vi.mock("./silencio.js", async (original) => ({ ...(await original()), silencioDelTurno: vi.fn(async () => {}) }));

const { herramientas, FICHAS, SIN_RESULTADO_TODAVIA, sinResultado } = await import("./agente.js");
const { cambiarPlato, anadirCompra } = await import("./menu.js");
const generar = await import("./generar.js");
const { registrar } = await import("./embudo.js");
const { resultado, exigeResultado, ESTADO } = await import("./resultado.js");

// Las que escribían datos de la ficha sin devolver resultado al empezar el
// trozo 27 (31 oct 2026). La lista solo baja: una herramienta nueva que
// escribe nace con su resultado.
const LINEA_BASE = 19;

const charla = (mas = {}) => ({ householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "venga", resultados: [], ...mas });
const correr = async (chat, nombre, args) => {
  const t = (await herramientas(chat)).find((x) => x.name === nombre);
  return t.run(args, { toolUse: { id: `t-${Math.random()}` } });
};
const leido = (texto) => JSON.parse(String(texto).split("\n")[0].slice("RESULTADO ".length));

beforeEach(() => vi.clearAllMocks());

describe("qué herramientas tienen que devolver un resultado", () => {
  const escriben = [...FICHAS].filter(([, f]) => exigeResultado(f)).map(([n]) => n);

  it("todas las que escriben datos de la ficha, y ninguna de solo lectura", () => {
    expect(escriben).toEqual(expect.arrayContaining(["cambiar_plato", "generar_menu", "ajustar_alergias"]));
    for (const [n, f] of FICHAS) if (f.soloLectura) expect(escriben).not.toContain(n);
  });

  it("la lista de pendientes solo nombra herramientas que existen y escriben, y solo baja", () => {
    for (const n of SIN_RESULTADO_TODAVIA) expect(escriben).toContain(n);
    expect(SIN_RESULTADO_TODAVIA.size).toBeLessThanOrEqual(LINEA_BASE);
  });

  it("cambiar plato y generar ya no están en la lista: la puerta las vigila", () => {
    expect(SIN_RESULTADO_TODAVIA.has("cambiar_plato")).toBe(false);
    expect(SIN_RESULTADO_TODAVIA.has("generar_menu")).toBe(false);
  });

  it("toda la que escribe y no está en la lista: con texto, rechazada; con resultado, no", () => {
    const vigiladas = escriben.filter((n) => !SIN_RESULTADO_TODAVIA.has(n));
    expect(vigiladas.length).toBeGreaterThan(0);
    for (const name of vigiladas) {
      expect(sinResultado({ name }, "Guardado.")).toBe(true);
      expect(sinResultado({ name }, resultado({ accion: "plato", hecho: ["x"] }))).toBe(false);
    }
  });
});

describe("la puerta, con las herramientas de verdad", () => {
  it("una que escribe y devuelve texto: no cuenta como guardado, el modelo lee que no consta y queda el fallo", async () => {
    // generar_menu sin su resultado: como si resultadoDeGenerar no existiera.
    const spy = vi.spyOn(generar, "resultadoDeGenerar").mockImplementation((_out, texto) => texto);
    generar.generarMenu.mockResolvedValue("Menú nuevo generado y activado.");
    const chat = charla();
    const r = await correr(chat, "generar_menu", { semana: "esta" });
    spy.mockRestore();
    expect(r).toMatch(/generado y activado/);
    expect(r).toMatch(/no consta como hecho/);
    expect(chat.guardados ?? 0).toBe(0);
    expect(chat.resultados).toEqual([]);
    expect(registrar).toHaveBeenCalledWith("bot_tool_error", expect.objectContaining({ extra: expect.objectContaining({ herramienta: "generar_menu", error: "sin_resultado", escribio: true }) }));
  });

  it("generar devuelve su resultado: el modelo lee «RESULTADO», cuenta como guardado y va al recibo", async () => {
    generar.generarMenu.mockImplementation(async (_h, _s, _f, out) => { Object.assign(out, { ok: true, desde: "2026-11-02", hasta: "2026-11-08", platos: 14 }); return "Menú nuevo generado y activado."; });
    const chat = charla();
    const r = await correr(chat, "generar_menu", { semana: "siguiente" });
    expect(leido(r)).toMatchObject({ accion: "menu", estado: ESTADO.HECHO });
    expect(chat.guardados).toBe(1);
    expect(chat.resultados).toHaveLength(1);
    expect(registrar).not.toHaveBeenCalledWith("bot_tool_error", expect.anything());
  });

  it("cambiar un plato que no se cambió: resultado sin nada hecho, que no cuenta como guardado", async () => {
    cambiarPlato.mockImplementation(async (_h, _x, _f, out) => { Object.assign(out, { cambiado: false, motivo: "no hay otro plato que encaje" }); return "No he encontrado otro plato."; });
    const chat = charla();
    const r = await correr(chat, "cambiar_plato", { dia: "jueves", comida: "Cena" });
    expect(leido(r)).toMatchObject({ accion: "plato", estado: ESTADO.NADA, hecho: [] });
    expect(chat.guardados ?? 0).toBe(0);
  });

  it("añadir a la compra devuelve su resultado con lo que queda pedido", async () => {
    anadirCompra.mockImplementation(async (_h, _p, out) => { Object.assign(out, { ok: true, nuevos: ["leche"], devueltos: [], yaEstaban: [] }); return "Añadido a la compra: leche."; });
    const chat = charla();
    const r = await correr(chat, "anadir_compra", { productos: ["leche"] });
    expect(leido(r)).toMatchObject({ accion: "compra_anadir", estado: ESTADO.HECHO, hecho: ["leche"] });
    expect(chat.resultados).toHaveLength(1);
  });
});
