/**
 * generar_menu con el pedido en curso (trozo 67 de #1037): lo ya dicho no se vuelve a pedir aunque la charla cambie de
 * tema, generar cierra el pedido y un generar fallido lo deja abierto. Se prueba la herramienta de verdad
 * (herramientas() de agente.js), con generarMenu y la base de mentira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const estado = vi.hoisted(() => ({ abierto: null, ejes: null, ok: true }));

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./casa.js", async (original) => { const real = await original(); return { ...real, cargarCasa: vi.fn(real.cargarCasa) }; });
vi.mock("./silencio.js", async (original) => ({ ...(await original()), apuntarSilencio: vi.fn(async () => null) }));
vi.mock("./generar.js", async (original) => ({
  ...(await original()),
  generarMenu: vi.fn(async (_h, _cual, _fijos, out) => { Object.assign(out, { ok: estado.ok, desde: "2026-11-02", hasta: "2026-11-08" }); return "Menú nuevo generado."; }),
}));
vi.mock("./pedidoMenu.js", async (original) => ({
  ...(await original()),
  pedidoEnCurso: vi.fn(async () => estado.abierto),
  guardarPedido: vi.fn(async (_q, p) => p),
  cerrarPedido: vi.fn(async () => []),
  ejesDelPedido: vi.fn(async () => estado.ejes),
}));

const { herramientas } = await import("./agente.js");
const { generarMenu } = await import("./generar.js");
const { cargarCasa } = await import("./casa.js");
const { cerrarPedido, guardarPedido } = await import("./pedidoMenu.js");

const llamar = async (texto, args, trato = null) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto, trato };
  const generar = (await herramientas(chat)).find((t) => t.name === "generar_menu");
  return generar.run({ semana: "siguiente", ...args }, { toolUse: { id: `t-${Math.random()}` } });
};
const sabe = (extra = {}) => ({ schedule: { estado: "sabido" }, ...extra });

beforeEach(() => {
  Object.assign(estado, { abierto: null, ejes: null, ok: true });
  generarMenu.mockClear();
  guardarPedido.mockClear();
  cerrarPedido.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T10:00:00Z")); // sábado
});
afterEach(() => vi.useRealTimers());

describe("rehacer sin sustos (trozo 72)", () => {
  const semana = { id: "menu" };
  const conMenu = () => cargarCasa.mockImplementation(async () => ({ householdId: "casa", state: { data: {} }, menu: semana, semanas: [{ weekStart: "2026-10-19", weekEnd: "2026-10-25", plan: { g1: { "Lun-comida": {}, "Dom-comida": {} } } }] }));
  afterEach(() => cargarCasa.mockReset());

  it("avisa una vez antes de pisar, y a la segunda rehace", async () => {
    conMenu();
    const r = await llamar("rehazla", { semana: "esta", camino: "basico", desde: "2026-10-19", rehacer: true, forzado: false });
    expect(generarMenu).not.toHaveBeenCalled();
    expect(r).toContain("se pierde");
    expect(guardarPedido.mock.calls.at(-1)[1].avisado).toBe(true);
    estado.abierto = { ...guardarPedido.mock.calls.at(-1)[1] };
    await llamar("sí", { semana: "esta", desde: "2026-10-19", rehacer: true });
    expect(generarMenu).toHaveBeenCalledTimes(1);
  });

  it("con «sigue tú» no para, pero lo dice al acabar", async () => {
    conMenu();
    const r = await llamar("sigue tú", { semana: "esta", camino: "basico", desde: "2026-10-19", rehacer: true, forzado: true });
    expect(generarMenu).toHaveBeenCalledTimes(1);
    expect(r).toContain("se pierde");
  });
});

describe("generar_menu con el pedido en curso (trozo 67)", () => {
  it("lo ya dicho sigue: sin camino ni fecha en la llamada, genera con los del pedido", async () => {
    estado.abierto = { camino: "basico", desde: "2026-11-02", forzado: false, preguntado: true };
    await llamar("vale, dale", {});
    expect(generarMenu).toHaveBeenCalledTimes(1);
    expect(generarMenu.mock.calls[0][4].desde).toBe("2026-11-02");
  });

  it("sin todo lo que hace falta apunta lo dicho, marcando las preguntas ya hechas si hay camino", async () => {
    await llamar("Unas preguntas", { camino: "medio" });
    expect(generarMenu).not.toHaveBeenCalled();
    expect(guardarPedido.mock.calls[0][1]).toMatchObject({ camino: "medio", preguntado: true });
  });

  it("sin camino, las preguntas siguen por hacer", async () => {
    await llamar("hazme el menú", { desde: "2026-11-02" });
    expect(guardarPedido.mock.calls[0][1]).toMatchObject({ desde: "2026-11-02", preguntado: false });
  });

  it("con ejes pregunta lo que falta una vez; a la siguiente, genera con lo que haya", async () => {
    estado.ejes = sabe({ mealStructure: { estado: "falta" } });
    const r = await llamar("con 1 plato", { camino: "medio", desde: "2026-11-02" });
    expect(generarMenu).not.toHaveBeenCalled();
    expect(r).toMatch(/¿Cuántos platos por comida\?/);
    estado.abierto = { camino: "medio", desde: "2026-11-02", forzado: false, preguntado: true };
    await llamar("sigo", {});
    expect(generarMenu).toHaveBeenCalledTimes(1);
  });

  it("forzado genera sin camino ni fecha", async () => {
    await llamar("sigue tú", { forzado: true });
    expect(generarMenu).toHaveBeenCalledTimes(1);
  });

  it("ritmo directo en el trato es un pedido forzado (trozo 68)", async () => {
    await llamar("hazme el menú", {}, { ritmo: "directo" });
    expect(generarMenu).toHaveBeenCalledTimes(1);
  });

  it("forzado no se salta lo que bloquea", async () => {
    estado.ejes = sabe({ etapaBebe: { estado: "falta" } });
    const r = await llamar("sigue tú", { forzado: true });
    expect(generarMenu).not.toHaveBeenCalled();
    expect(r).toMatch(/etapaBebe/);
  });

  it("generado, cierra el pedido y avisa de lo que da por supuesto", async () => {
    estado.abierto = { camino: "medio", desde: "2026-11-02", forzado: false, preguntado: true };
    estado.ejes = sabe({ mealStructure: { estado: "supuesto" } });
    const r = await llamar("dale", {});
    expect(cerrarPedido).toHaveBeenCalledTimes(1);
    expect(r).toMatch(/Has dado por supuesto lo de: ¿Cuántos platos por comida\?/);
  });

  it("lo que se quedó sin contestar también se dice, aunque dijeran «sigue tú»", async () => {
    estado.abierto = { camino: "medio", desde: "2026-11-02", forzado: true, preguntado: true };
    estado.ejes = sabe({ mealStructure: { estado: "falta" } });
    const r = await llamar("dale", {});
    expect(generarMenu).toHaveBeenCalledTimes(1);
    expect(r).toMatch(/Has dado por supuesto lo de: ¿Cuántos platos por comida\?/);
  });

  it("lo dicho para este menú va al motor, no a la ficha, y no se pregunta (trozo 69)", async () => {
    estado.abierto = { camino: "medio", desde: "2026-11-02", forzado: false, preguntado: false, estructura: null, estructuraCena: null };
    estado.ejes = sabe({ mealStructure: { estado: "falta" }, mealStructureCena: { estado: "sabido" } });
    const r = await llamar("esta semana, un plato", { estructura: "1_plato" });
    expect(generarMenu).toHaveBeenCalledTimes(1);
    expect(generarMenu.mock.calls[0][4].soloEste).toEqual({ estructura: "1_plato", estructuraCena: null });
    expect(r).not.toMatch(/Has dado por supuesto/);
  });

  it("un generar fallido deja el pedido abierto, con lo dicho", async () => {
    estado.ok = false;
    await llamar("dale", { camino: "basico", desde: "2026-11-02" });
    expect(cerrarPedido).not.toHaveBeenCalled();
    expect(guardarPedido.mock.calls.at(-1)[1]).toMatchObject({ camino: "basico", desde: "2026-11-02" });
  });
});
