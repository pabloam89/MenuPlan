/**
 * El webhook (api/bot/telegram.js) le pasa a api/_bot/chats.js lo que le pasa
 * al chat mismo (#958): el aviso de grupo a supergrupo y el de que echan o
 * bloquean a Lola. Por su entrada real: una petición de Telegram al handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ tablas: {}, enviados: [], trabajo: [] }));

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async () => []), update: vi.fn(async () => []), rpc: vi.fn(), eq: (x) => x,
}));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async (_chat, texto) => { t.enviados.push(texto); return { message_id: 1 }; }),
  enviarFotos: vi.fn(), editar: vi.fn(), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/chats.js", () => ({ migrarChat: vi.fn(async () => ({ movidas: {} })), alSalirDelChat: vi.fn(async () => null) }));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
vi.mock("../_bot/embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn() }));
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(), vaPorLaRapida: () => false, permitidoEn: () => true }));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(), eleccionDe: () => null, repiteLaPropuesta: () => false, aplicarEleccion: vi.fn(), contextoDe: vi.fn() }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(), contarUso: vi.fn() }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(), idiomaDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), drenar: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));

const { default: handler } = await import("./telegram.js");
const { migrarChat, alSalirDelChat } = await import("../_bot/chats.js");
const { enTurno } = await import("../_bot/turnos.js");

async function llega(body) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({ method: "POST", headers: { "x-telegram-bot-api-secret-token": "secreto" }, body: { update_id: Math.random(), ...body } }, res);
  await Promise.all(t.trabajo);
}

beforeEach(() => {
  t.tablas = {}; t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
});

describe("lo que le pasa al chat llega a chats.js (#958)", () => {
  it("el aviso en el grupo viejo: mueve del viejo al nuevo, sin contestar ni pasar por el turno", async () => {
    await llega({ message: { message_id: 1, chat: { id: -1, type: "group" }, migrate_to_chat_id: -100 } });
    expect(migrarChat).toHaveBeenCalledWith("-1", "-100");
    expect(enTurno).not.toHaveBeenCalled();
    expect(t.enviados).toEqual([]);
  });

  it("el aviso en el supergrupo nuevo: el mismo movimiento", async () => {
    await llega({ message: { message_id: 1, chat: { id: -100, type: "supergroup" }, migrate_from_chat_id: -1 } });
    expect(migrarChat).toHaveBeenCalledWith("-1", "-100");
  });

  it("la echan del grupo: alSalirDelChat, y nada que contestar", async () => {
    const cambio = { chat: { id: -1, type: "group" }, new_chat_member: { status: "kicked" } };
    await llega({ my_chat_member: cambio });
    expect(alSalirDelChat).toHaveBeenCalledWith(cambio);
    expect(t.enviados).toEqual([]);
  });

  it("si mover falla, no se le dice «algo ha fallado» al grupo: queda en el log", async () => {
    migrarChat.mockRejectedValueOnce(new Error("base caída"));
    await llega({ message: { message_id: 1, chat: { id: -1, type: "group" }, migrate_to_chat_id: -100 } });
    expect(t.enviados).toEqual([]);
  });
});
