/**
 * /start en un privado sin enlazar (api/bot/telegram.js): a un Telegram que ya
 * es una cuenta se le reengancha a su casa sin preguntarle si es su primera
 * vez; a uno que no conocemos, el saludo de alta con «Ya uso HoMenu».
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
  enviar: vi.fn(async (_chat, texto, opciones) => { t.enviados.push({ texto, opciones }); return { message_id: 1 }; }),
  enviarFotos: vi.fn(), editar: vi.fn(), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
vi.mock("../_bot/embudo.js", () => ({ registrar: vi.fn(), rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn() }));
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(), vaPorLaRapida: () => false, permitidoEn: () => true }));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(), eleccionDe: () => null, aplicarEleccion: vi.fn(), contextoDe: vi.fn() }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(), contarUso: vi.fn() }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(), idiomaDe: vi.fn() }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn() }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "" }));
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(), recetaEnTexto: vi.fn(), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn() }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-06", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { default: handler } = await import("./telegram.js");
const { enlazarChat } = await import("../_bot/enlace.js");
const { crearCuentaTelegram } = await import("../_bot/cuentas.js");

async function escribe(texto, { chat = 7, from = 7 } = {}) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { message: { message_id: 1, text: texto, chat: { id: chat, type: "private" }, from: { id: from, first_name: "Ana" } } },
  }, res);
  await Promise.all(t.trabajo);
}

beforeEach(() => {
  t.tablas = {}; t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
});

describe("/start en un privado sin enlazar", () => {
  it("un Telegram que no conocemos: el alta, sin preguntar por cuentas", async () => {
    await escribe("/start");
    expect(t.enviados).toHaveLength(1);
    expect(t.enviados[0].texto).toContain("quiénes coméis en casa");
    expect(t.enviados[0].opciones?.botones).toBeUndefined();
    expect(enlazarChat).not.toHaveBeenCalled();
  });

  it("un Telegram que ya es una cuenta: se reengancha a su casa y no se le pregunta nada", async () => {
    t.tablas = {
      bot_identities: [{ user_id: "u1" }],
      household_members: [{ household_id: "h1" }],
      households: [{ name: "Casa Ana" }],
    };
    await escribe("/start");
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: "7", kind: "private", householdId: "h1", userId: "u1", identidad: null }));
    expect(t.enviados).toHaveLength(1);
    expect(t.enviados[0].texto).toContain("Hola de nuevo");
    expect(t.enviados[0].texto).toContain("Casa Ana");
    expect(t.enviados[0].opciones.botones).toBeUndefined();
  });

  it("si escribe el alta en vez de /start, no se le crea otra cuenta", async () => {
    t.tablas = { bot_identities: [{ user_id: "u1" }], household_members: [{ household_id: "h1" }] };
    await escribe("somos cuatro");
    expect(enlazarChat).toHaveBeenCalledTimes(1);
    expect(crearCuentaTelegram).not.toHaveBeenCalled();
  });

  it("con varias casas no elige por él: le manda a la app", async () => {
    t.tablas = { bot_identities: [{ user_id: "u1" }], household_members: [{ household_id: "h1" }, { household_id: "h2" }] };
    await escribe("/start");
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(t.enviados[0].texto).toContain("más de una casa");
  });

  it("solo en su propio privado: un chat que no es el suyo no se reengancha", async () => {
    t.tablas = { bot_identities: [{ user_id: "u1" }], household_members: [{ household_id: "h1" }] };
    await escribe("/start", { chat: 99, from: 7 });
    expect(enlazarChat).not.toHaveBeenCalled();
  });
});
