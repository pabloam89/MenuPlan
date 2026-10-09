/**
 * Notas de voz y límites (api/bot/telegram.js): no se paga una transcripción
 * para un grupo sin casa ni para una casa que ya pasó su límite del mes. Y con
 * el límite agotado, el enrutador (un modelo) no se lanza. Todo lo de fuera,
 * de mentira.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.BOT_ROUTER = "on";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ tablas: {}, enviados: [], trabajo: [], limite: null }));

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async () => []), update: vi.fn(async () => [{}]), rpc: vi.fn(), eq: (x) => x,
}));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async (_chat, texto) => { t.enviados.push(texto); return { message_id: 1 }; }),
  enviarFotos: vi.fn(), editar: vi.fn(), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(async () => ({ texto: "respuesta de Lola", fotos: [] })), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
vi.mock("../_bot/embudo.js", () => ({ registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => "u1"), duenoDeEstricto: vi.fn(async () => "u1") }));
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(async () => ({ modo: "consulta", confianza: 0.95, datos: {}, ms: 1, uso: {} })), vaPorLaRapida: () => true, permitidoEn: () => true }));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(async () => ({ texto: "Hoy: tortilla" })), eleccionDe: () => null, aplicarEleccion: vi.fn(), contextoDe: vi.fn(async () => ({})) }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(async () => t.limite), contarUso: vi.fn(async () => 1) }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn() }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn(async () => ({ texto: "Lola, qué cenamos" })) }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "" }));
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(async () => null), recetaEnTexto: vi.fn(), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn(async () => []) }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(async () => ({})), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^inv_([0-9a-f]{32})$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-09", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { default: handler, turno } = await import("./telegram.js");
const { transcribir } = await import("../_bot/voz.js");
const { clasificar } = await import("../_bot/router.js");

const res = () => { const r = { status: () => r, json: () => r, end: () => r }; return r; };
const VOZ = { file_id: "f", duration: 4, mime_type: "audio/ogg" };

async function voz({ grupo = false } = {}) {
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { message: { message_id: 1, voice: VOZ, chat: { id: grupo ? -50 : 7, type: grupo ? "supergroup" : "private" }, from: { id: 7, first_name: "Ana" } } },
  }, res());
  await Promise.all(t.trabajo);
}

beforeEach(() => {
  t.tablas = {}; t.enviados.length = 0; t.trabajo.length = 0; t.limite = null;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("notas de voz: no se transcribe lo que no se va a contestar", () => {
  it("en un grupo sin casa vinculada, no se transcribe", async () => {
    await voz({ grupo: true });
    expect(transcribir).not.toHaveBeenCalled();
  });

  it("en un grupo con casa pasada de su límite del mes, no se transcribe", async () => {
    t.tablas.bot_chats = [{ household_id: "h1" }];
    t.limite = "Este mes ya hemos hablado 100 veces";
    await voz({ grupo: true });
    expect(transcribir).not.toHaveBeenCalled();
  });

  it("en un grupo con casa y dentro del límite, sí se escucha", async () => {
    t.tablas.bot_chats = [{ household_id: "h1" }];
    await voz({ grupo: true });
    expect(transcribir).toHaveBeenCalledTimes(1);
  });

  it("en privado, con la casa pasada de su límite, se contesta el aviso sin transcribir", async () => {
    t.tablas.bot_chats = [{ household_id: "h1" }];
    t.limite = "Este mes ya hemos hablado 100 veces";
    await voz();
    expect(transcribir).not.toHaveBeenCalled();
    expect(t.enviados).toContain("Este mes ya hemos hablado 100 veces");
  });

  it("en privado y dentro del límite, sí se escucha", async () => {
    t.tablas.bot_chats = [{ household_id: "h1" }];
    await voz();
    expect(transcribir).toHaveBeenCalledTimes(1);
  });
});

describe("el enrutador no corre con el límite del mes agotado", () => {
  it("contesta Lola (que da el aviso) y clasificar no se llama", async () => {
    t.limite = "Este mes ya hemos hablado 100 veces";
    await turno({ chatId: 7, householdId: "h1", esGrupo: false, base: "https://x", texto: "¿qué cenamos?", from: { id: 7, first_name: "Ana" }, responderA: 9 });
    expect(clasificar).not.toHaveBeenCalled();
  });

  it("dentro del límite, sí", async () => {
    await turno({ chatId: 7, householdId: "h1", esGrupo: false, base: "https://x", texto: "¿qué cenamos?", from: { id: 7, first_name: "Ana" }, responderA: 9 });
    expect(clasificar).toHaveBeenCalledTimes(1);
  });
});
