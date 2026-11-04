// /fallo en el webhook (api/_bot/reporte.js): el de un probador no llega a Lola (ni modelo ni cola); el de los demás, sí.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
process.env.BOT_PROBADORES = "7";

const t = vi.hoisted(() => ({ tablas: {}, enviados: [], insertadas: [], trabajo: [], update: 0 }));

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async (tabla, filas) => { t.insertadas.push(...filas.map((f) => ({ tabla, ...f }))); return filas.map((f, i) => ({ ...f, id: 100 + i })); }),
  update: vi.fn(async () => [{}]), rpc: vi.fn(), eq: (x) => `eq.${x}`,
}));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async (_chat, texto, opciones) => { t.enviados.push({ texto, opciones }); return { message_id: 1 }; }),
  enviarFotos: vi.fn(), editar: vi.fn(), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
vi.mock("../_bot/embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(async () => "u1") }));
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(), vaPorLaRapida: () => false, permitidoEn: () => true }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(), idiomaDe: vi.fn(), casaActivaDe: vi.fn(async () => null) }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));

const { default: handler } = await import("./telegram.js");
const { responder } = await import("../_bot/agente.js");
const { enTurno } = await import("../_bot/turnos.js");
const { update } = await import("../_bot/db.js");

const LOLA = { message_id: 555, date: 1793817600, from: { id: 1, is_bot: true, username: "lola" }, text: "He puesto lentejas" };

async function llega(body) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({ method: "POST", headers: { "x-telegram-bot-api-secret-token": "secreto" }, body: { update_id: ++t.update, ...body } }, res);
  await Promise.all(t.trabajo);
}
const escribe = (de, texto, extra = {}) => llega({ message: { message_id: 600, text: texto, chat: { id: de, type: "private" }, from: { id: de, first_name: "Ana" }, ...extra } });

beforeEach(() => {
  t.tablas = { bot_chats: [{ household_id: "h1", kind: "private" }], bot_entradas: [] };
  t.enviados.length = 0; t.insertadas.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
});

describe("/fallo en el webhook", () => {
  it("un probador: se apunta y se preguntan los tipos, sin Lola ni la cola", async () => {
    await escribe(7, "/fallo quería pasta", { reply_to_message: LOLA });
    const fila = t.insertadas.find((f) => f.event === "bot_reporte");
    expect(fila?.metadata).toMatchObject({ telegram_id: "7", msg_reportado: 555, texto: "quería pasta" });
    expect(t.enviados.at(-1)).toMatchObject({ texto: "¿Qué ha fallado?", opciones: { responderA: 555 } });
    expect(responder).not.toHaveBeenCalled();
    expect(enTurno).not.toHaveBeenCalled();
  });

  it("quien no prueba: /fallo va a Lola como cualquier texto y no se apunta nada", async () => {
    await escribe(8, "/fallo quería pasta", { reply_to_message: LOLA });
    expect(t.insertadas.filter((f) => f.event === "bot_reporte")).toEqual([]);
    expect(enTurno).toHaveBeenCalledTimes(1);
    expect(enTurno.mock.calls[0][1].texto).toBe("/fallo quería pasta");
  });

  it("el botón del tipo no llega a Lola", async () => {
    t.tablas.user_events = [{ id: 100, created_at: "2026-11-04T18:41:00Z", metadata: { telegram_id: "7", chat: "7", paso: "tipo" } }];
    await llega({ callback_query: { id: "cq", data: "fallo:dato_mal:100", from: { id: 7 }, message: { message_id: 901, chat: { id: 7, type: "private" } } } });
    expect(update.mock.calls[0][2].metadata).toMatchObject({ tipo: "dato_mal" });
    expect(responder).not.toHaveBeenCalled();
    expect(enTurno).not.toHaveBeenCalled();
  });
});

