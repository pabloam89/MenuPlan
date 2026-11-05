/**
 * Al pulsar un botón de Lola queda a la vista lo elegido (#1277): el teclado del mensaje pasa a una fila «✓ …», y el
 * «✓» no hace nada. Todo lo de fuera, de mentira, como en casaDelTurnoWebhook.test.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.BOT_ROUTER = "on";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ tablas: {}, rotas: new Set(), enviados: [], trabajo: [] }));
const caida = () => Object.assign(new Error("GET /rest/v1/x → 503 PGRST002 Could not query the database"), { status: 503, codigo: "PGRST002" });

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => { if (t.rotas.has(tabla)) throw caida(); return t.tablas[tabla] ?? []; }),
  insert: vi.fn(async () => []), update: vi.fn(async () => [{}]), rpc: vi.fn(), eq: (x) => x,
}));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async (_chat, texto, opciones) => { t.enviados.push({ texto, opciones }); return { message_id: 1 }; }),
  enviarFotos: vi.fn(), editar: vi.fn(), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(async () => ({ texto: "respuesta de Lola", fotos: [] })), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
// duenoDeEstricto, la de verdad (con la base de mentira): con households rota tiene que lanzar.
vi.mock("../_bot/embudo.js", async (original) => {
  const real = await original();
  return { registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => "u1"), duenoDeEstricto: real.duenoDeEstricto };
});
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(async () => ({ modo: "consulta", confianza: 0.95, datos: {}, ms: 1, uso: {} })), vaPorLaRapida: () => true, permitidoEn: () => true }));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(async () => ({ texto: "Hoy: tortilla" })), eleccionDe: () => null, repiteLaPropuesta: () => false, aplicarEleccion: vi.fn(), contextoDe: vi.fn(async () => ({})) }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(async () => null), contarUso: vi.fn(async () => 1) }));
vi.mock("../_bot/papel.js", () => ({
  papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null),
  // Las de la casa del turno, sobre la base de mentira.
  casaActivaDe: vi.fn(async () => t.tablas.user_profiles?.[0]?.active_household_id ?? null),
  papelDeUsuario: vi.fn(async () => t.tablas.household_members?.[0]?.role ?? null),
}));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn() }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "", recordatorioDelBoton: vi.fn(async () => t.tablas.bot_tareas?.[0] ?? null) }));
// cuentasDeQuien, la de verdad (con la base de mentira): es la que lee al dueño.
vi.mock("../_bot/compartir.js", async (original) => {
  const real = await original();
  return { enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(async () => null), recetaEnTexto: vi.fn(() => "receta"), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn((...a) => real.cuentasDeQuien(...a)) };
});
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(async () => ({})), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^inv_([0-9a-f]{32})$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-08", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { default: handler } = await import("./telegram.js");
const { llamar } = await import("../_bot/telegram.js");
const { enTurno } = await import("../_bot/turnos.js");
const { BOTON_ELEGIDO } = await import("../_bot/botonElegido.js");

const res = () => { const r = { status: () => r, json: () => r, end: () => r }; return r; };
const TECLADO = { inline_keyboard: [[{ text: "Solo los días", callback_data: "t:Solo los días" }], [{ text: "A fondo", callback_data: "t:A fondo" }]] };

async function pulsa(dato, reply_markup = TECLADO) {
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { callback_query: { id: "q", data: dato, from: { id: 7, first_name: "Ana" }, message: { message_id: 2, chat: { id: 7, type: "private" }, reply_markup } } },
  }, res());
  await Promise.all(t.trabajo);
}
const teclados = () => llamar.mock.calls.filter(([m]) => m === "editMessageReplyMarkup").map(([, p]) => p.reply_markup);

beforeEach(() => {
  t.tablas = { bot_chats: [{ chat_id: "7", household_id: "casaA", kind: "private", linked_by: "u1" }], bot_identities: [{ user_id: "u1" }] };
  t.rotas = new Set(); t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lo elegido, a la vista (#1277)", () => {
  it("al pulsar, el mensaje se queda con una fila «✓ Solo los días» y el turno sigue", async () => {
    await pulsa("t:Solo los días");
    expect(teclados()).toEqual([{ inline_keyboard: [[{ text: "✓ Solo los días", callback_data: BOTON_ELEGIDO }]] }]);
    expect(enTurno).toHaveBeenCalledTimes(1);
  });

  it("pulsar el «✓» no hace nada: ni toca el mensaje ni entra en la cola", async () => {
    await pulsa(BOTON_ELEGIDO, { inline_keyboard: [[{ text: "✓ Solo los días", callback_data: BOTON_ELEGIDO }]] });
    expect(teclados()).toEqual([]);
    expect(enTurno).not.toHaveBeenCalled();
    expect(llamar).toHaveBeenCalledWith("answerCallbackQuery", { callback_query_id: "q" });
  });

  it("un mensaje sin el botón pulsado en su teclado (viejo) se queda sin botones, como antes", async () => {
    await pulsa("t:Solo los días", null);
    expect(teclados()).toEqual([{ inline_keyboard: [] }]);
  });
});
