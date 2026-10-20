/**
 * api/bot/link.js con `{ aviso: "alta" }`: al acabar el alta en la app, Lola
 * lo dice en el privado de quien la hizo y lo apunta en su memoria.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ tablas: {}, enviados: [] }));

vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async () => []),
  usuarioDeToken: vi.fn(async (tok) => (tok === "bueno" ? { id: "u1" } : null)),
  eq: (x) => x,
}));
vi.mock("../_bot/telegram.js", () => ({
  nombreDelBot: async () => "lola",
  enviar: vi.fn(async (chat, texto, opciones) => { t.enviados.push({ chat, texto, opciones }); }),
}));
vi.mock("../_bot/rapido.js", () => ({ recordar: vi.fn(async () => {}) }));

const { default: handler, AVISO_ALTA, BOTON_ALTA } = await import("./link.js");
const { recordar } = await import("../_bot/rapido.js");

function llama(body, token = "bueno") {
  const res = { code: 0, json: (j) => { res.cuerpo = j; return res; }, status: (c) => { res.code = c; return res; } };
  return handler({ method: "POST", headers: { authorization: `Bearer ${token}` }, body }, res).then(() => res);
}

beforeEach(() => {
  t.enviados.length = 0;
  t.tablas = { user_profiles: [{ active_household_id: "h1" }], household_members: [{ role: "owner" }] };
  vi.clearAllMocks();
});

describe("aviso de alta hecha en la app", () => {
  it("con su privado enlazado: Lola lo dice allí y lo recuerda", async () => {
    t.tablas.bot_chats = [{ chat_id: "7" }];
    const res = await llama({ aviso: "alta" });
    expect(res.cuerpo).toEqual({ avisados: 1 });
    expect(t.enviados).toEqual([{ chat: "7", texto: AVISO_ALTA, opciones: { botones: [[BOTON_ALTA]] } }]);
    // El menú se ofrece, no se promete: el botón se lo pide a Lola como si lo escribiera.
    expect(AVISO_ALTA).toContain("¿Os preparo el menú");
    expect(BOTON_ALTA.dato.startsWith("t:")).toBe(true);
    expect(recordar).toHaveBeenCalledWith(expect.objectContaining({ chatId: "7", householdId: "h1", respuesta: AVISO_ALTA }));
  });

  it("sin chat con Lola: nada", async () => {
    const res = await llama({ aviso: "alta" });
    expect(res.cuerpo).toEqual({ avisados: 0 });
    expect(t.enviados).toHaveLength(0);
  });

  it("sin sesión válida: 401 y nada", async () => {
    const res = await llama({ aviso: "alta" }, "malo");
    expect(res.code).toBe(401);
    expect(t.enviados).toHaveLength(0);
  });
});

// La app iOS (Capacitor) sirve la web desde capacitor://localhost: sus llamadas a /api son
// cross-origin. Sin cors() el POST/GET nunca sale (el preflight OPTIONS no se contesta).
describe("enlace desde la app nativa (CORS)", () => {
  function conOrigen(method, origin, authorization = "Bearer bueno") {
    const cabeceras = {};
    const res = {
      code: 0, terminado: false, cabeceras,
      setHeader: (k, v) => { cabeceras[k] = v; },
      status: (c) => { res.code = c; return res; },
      end: () => { res.terminado = true; return res; },
      json: (j) => { res.cuerpo = j; return res; },
    };
    return handler({ method, headers: { origin, authorization }, body: {} }, res).then(() => res);
  }

  it("el preflight OPTIONS desde capacitor://localhost se contesta 204 sin mirar la sesión", async () => {
    const res = await conOrigen("OPTIONS", "capacitor://localhost", "");
    expect(res.code).toBe(204);
    expect(res.terminado).toBe(true);
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.cuerpo).toBeUndefined();
  });

  it("el GET de «¿estoy conectado?» lleva el Allow-Origin de la app", async () => {
    const res = await conOrigen("GET", "capacitor://localhost");
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.cuerpo).toEqual({ conectado: false });
  });

  it("desde otro origen no se añade ninguna cabecera", async () => {
    const res = await conOrigen("GET", "https://evil.example");
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
