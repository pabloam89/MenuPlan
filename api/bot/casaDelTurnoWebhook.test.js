/**
 * El webhook trabaja en la casa que la persona tiene abierta en la app y lo dice cuando cambia (#1238,
 * casaDelTurno). Todo lo de fuera, de mentira, como en sinLeer.test.js; casaDelTurno, la de verdad.
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
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn() }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "" }));
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

const res = () => { const r = { status: () => r, json: () => r, end: () => r }; return r; };

async function escribe(texto, { chat = 7, from = 7, lang } = {}) {
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { message: { message_id: 1, text: texto, chat: { id: chat, type: "private" }, from: { id: from, first_name: "Ana", ...(lang ? { language_code: lang } : {}) } } },
  }, res());
  await Promise.all(t.trabajo);
}

async function pulsa(dato, { chat = 7, from = 7 } = {}) {
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { callback_query: { id: "q", data: dato, from: { id: from, first_name: "Ana" }, message: { message_id: 2, chat: { id: chat, type: "private" } } } },
  }, res());
  await Promise.all(t.trabajo);
}

const textos = () => t.enviados.map((e) => e.texto);

beforeEach(() => {
  t.tablas = {}; t.rotas = new Set(); t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const CAMBIO = /^🏠 Ahora estoy con <b>Casa B<.b>/;
const conCasas = ({ activa, ultima }) => {
  t.tablas = {
    bot_chats: [{ chat_id: "7", household_id: "casaA", kind: "private", linked_by: "u1" }],
    bot_identities: [{ user_id: "u1" }],
    user_profiles: [{ active_household_id: activa }],
    household_members: [{ role: "editor" }],
    bot_messages: ultima ? [{ household_id: ultima }] : [],
    households: [{ name: "Casa B" }],
  };
};

describe("Lola sigue la casa activa de la app y lo dice (#1238)", () => {
  it("la casa activa es otra que la del último mensaje: lo dice antes de contestar", async () => {
    conCasas({ activa: "casaB", ultima: "casaA" });
    await escribe("¿qué cenamos hoy?");
    expect(textos()[0]).toMatch(CAMBIO);
  });

  it("misma casa que el último mensaje: no dice nada de casas", async () => {
    conCasas({ activa: "casaB", ultima: "casaB" });
    await escribe("¿qué cenamos hoy?");
    expect(textos().some((x) => CAMBIO.test(x))).toBe(false);
  });

  it("un botón pulsado tras cambiar de casa también lo dice", async () => {
    conCasas({ activa: "casaB", ultima: "casaA" });
    await pulsa("t:¿qué cenamos?");
    expect(textos()[0]).toMatch(CAMBIO);
  });
});
