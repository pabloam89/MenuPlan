/**
 * /start con un código de «Conectar Telegram» que, por azar, empieza como un
 * enlace de compartir (api/bot/telegram.js). Los códigos son 22 caracteres
 * base64url: uno de cada 4096 empieza por «m_», y el webhook miraba solo el
 * prefijo, así que esa persona recibía «Ese enlace ya no funciona» y no se
 * enlazaba. Cada clase de /start se reconoce ahora por su forma entera
 * (src/lib/ids.js, payloadStart).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ tablas: {}, enviados: [], trabajo: [] }));

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async () => []), update: vi.fn(async () => [{}]), rpc: vi.fn(), eq: (x) => x,
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
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(async () => null), recetaEnTexto: vi.fn(), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn(async () => []) }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(async () => ({})), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^inv_([0-9a-f]{32})$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-06", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { default: handler } = await import("./telegram.js");
const { enlazarChat } = await import("../_bot/enlace.js");
const { resolverInvitacion } = await import("../_bot/compartir.js");

async function escribe(texto, { chat = 7, from = 7 } = {}) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { message: { message_id: 1, text: texto, chat: { id: chat, type: "private" }, from: { id: from, first_name: "Ana" } } },
  }, res);
  await Promise.all(t.trabajo);
}

const codigoValido = (token) => ({
  bot_link_tokens: [{ token, user_id: "u1", household_id: "h1", expires_at: new Date(Date.now() + 600000).toISOString(), used_at: null }],
  household_members: [{ role: "owner" }],
});

beforeEach(() => {
  t.tablas = {}; t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
});

describe("/start: un código de enlace que empieza como un enlace de compartir", () => {
  // 22 caracteres base64url, como los de api/bot/link.js hasta hoy.
  for (const token of ["m_Q3xk9TzA1bVwPq7yRt2u", "ru_3xk9TzA1bVwPq7yRt2u", "rc_3XK9TzA1bVwPq7yRt2u"]) {
    it(`«${token.slice(0, 3)}…» enlaza el chat, no dice que el enlace no funciona`, async () => {
      expect(token).toHaveLength(22);
      t.tablas = codigoValido(token);
      await escribe(`/start ${token}`);
      expect(resolverInvitacion).not.toHaveBeenCalled();
      expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: "7", householdId: "h1", userId: "u1" }));
      expect(t.enviados.map((e) => e.texto).join(" ")).not.toContain("ya no funciona");
    });
  }
});

describe("/start: los enlaces de compartir de verdad siguen llegando a recibirCompartido", () => {
  const LLAVE = "0123456789abcdef0123456789abcdef";
  for (const p of [`m_${LLAVE}`, `ru_${LLAVE}`, "rc_carnes_012", "rc_pollo-al-ajillo"]) {
    it(p, async () => {
      await escribe(`/start ${p}`);
      expect(resolverInvitacion).toHaveBeenCalledWith(p, expect.anything());
      expect(enlazarChat).not.toHaveBeenCalled();
    });
  }
});
