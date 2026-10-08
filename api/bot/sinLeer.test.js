/**
 * Si la base no contesta, Lola lo dice en vez de contestar algo falso (#208):
 * en el webhook (api/bot/telegram.js), reconocer a quien vuelve, el papel de
 * quien escribe y los enlaces de receta compartida. Todo lo de fuera, de
 * mentira; la base falla con un 503 como el de PostgREST.
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
vi.mock("../_bot/embudo.js", () => ({ registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => "u1") }));
vi.mock("../_bot/router.js", () => ({ clasificar: vi.fn(async () => ({ modo: "consulta", confianza: 0.95, datos: {}, ms: 1, uso: {} })), vaPorLaRapida: () => true, permitidoEn: () => true }));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(async () => ({ texto: "Hoy: tortilla" })), eleccionDe: () => null, aplicarEleccion: vi.fn(), contextoDe: vi.fn(async () => ({})) }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(async () => null), contarUso: vi.fn(async () => 1) }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn() }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "" }));
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(async () => null), recetaEnTexto: vi.fn(() => "receta"), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn(async () => ["u1"]) }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(async () => ({})), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^inv_([0-9a-f]{32})$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-08", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { default: handler, turno } = await import("./telegram.js");
const { enlazarChat } = await import("../_bot/enlace.js");
const { crearCuentaTelegram } = await import("../_bot/cuentas.js");
const { papelDeQuien } = await import("../_bot/papel.js");
const { viaRapida } = await import("../_bot/turno.js");
const { responder } = await import("../_bot/agente.js");
const { cuentasDeQuien, resolverInvitacion } = await import("../_bot/compartir.js");

const NO_PUDE = /^No he podido .* ahora mismo; vuelve a intentarlo en un minuto/;
const res = () => { const r = { status: () => r, json: () => r, end: () => r }; return r; };

async function escribe(texto, { chat = 7, from = 7 } = {}) {
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { message: { message_id: 1, text: texto, chat: { id: chat, type: "private" }, from: { id: from, first_name: "Ana" } } },
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
const LLAVE = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  t.tablas = {}; t.rotas = new Set(); t.enviados.length = 0; t.trabajo.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("reconocer: sin saber si ya es una cuenta, ni bienvenida ni alta", () => {
  it("la base cae al mirar su identidad: lo dice y no crea otra cuenta", async () => {
    t.rotas.add("bot_identities");
    await escribe("somos cuatro, dos niños");
    expect(textos()).toEqual([expect.stringMatching(NO_PUDE)]);
    expect(textos()[0]).toContain("si ya tienes cuenta");
    expect(crearCuentaTelegram).not.toHaveBeenCalled();
    expect(enlazarChat).not.toHaveBeenCalled();
  });

  it("y sin fallo, quien no es nadie sigue al alta como siempre", async () => {
    await escribe("/start");
    expect(textos().join(" ")).not.toMatch(NO_PUDE);
  });
});

describe("papelDeQuien: sin saber su papel, no se le trata como de fuera", () => {
  const pedir = () => turno({ chatId: 7, householdId: "h1", esGrupo: false, base: "https://x", texto: "¿qué cenamos?", from: { id: 7, first_name: "Ana" }, responderA: 9 });

  it("la base cae: lo dice, y ni vía rápida ni Lola", async () => {
    papelDeQuien.mockRejectedValueOnce(caida());
    await pedir();
    expect(textos()).toEqual([expect.stringMatching(NO_PUDE)]);
    expect(textos()[0]).toContain("quién eres en esta casa");
    expect(viaRapida).not.toHaveBeenCalled();
    expect(responder).not.toHaveBeenCalled();
  });

  it("y sin fallo, contesta la vía rápida", async () => {
    await pedir();
    expect(viaRapida).toHaveBeenCalled();
    expect(textos().join(" ")).not.toMatch(NO_PUDE);
  });
});

describe("enlace de receta compartida: sin poder comprobar el bloqueo, ni se enseña ni se dice que no vale", () => {
  it("al abrirlo, si no se sabe quién lo abre", async () => {
    cuentasDeQuien.mockRejectedValueOnce(caida());
    await escribe(`/start ru_${LLAVE}`);
    expect(resolverInvitacion).not.toHaveBeenCalled();
    expect(textos()).toEqual([expect.stringMatching(NO_PUDE)]);
    expect(textos()[0]).toContain("ese enlace");
  });

  it("al abrirlo, si cae al leer la receta o el bloqueo", async () => {
    resolverInvitacion.mockRejectedValueOnce(caida());
    await escribe(`/start ru_${LLAVE}`);
    expect(textos()).toEqual([expect.stringMatching(NO_PUDE)]);
    expect(textos().join(" ")).not.toContain("ya no funciona");
  });

  it("al pulsar «Ponerla en mi menú», igual", async () => {
    t.tablas.bot_chats = [{ household_id: "h1" }];
    cuentasDeQuien.mockRejectedValueOnce(caida());
    await pulsa(`comp:m:ru_${LLAVE}`);
    expect(resolverInvitacion).not.toHaveBeenCalled();
    expect(textos()).toEqual([expect.stringMatching(NO_PUDE)]);
  });

  it("y un enlace que de verdad no vale sigue diciendo que ya no funciona", async () => {
    await escribe(`/start ru_${LLAVE}`);
    expect(textos()).toEqual([expect.stringContaining("ya no funciona")]);
  });
});
