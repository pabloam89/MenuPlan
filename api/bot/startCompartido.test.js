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

const t = vi.hoisted(() => ({ deAntes: null, deGrupo: false, vuelta: false, nacida: null, tablas: {}, enviados: [], trabajo: [] }));

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
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(), eleccionDe: () => null, repiteLaPropuesta: () => false, aplicarEleccion: vi.fn(), contextoDe: vi.fn() }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(), contarUso: vi.fn() }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(), idiomaDe: vi.fn(), casaActivaDe: vi.fn(async () => "hAntes"), papelDeUsuario: vi.fn(async () => "owner") }));
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
// Las piezas puras del cambio de cuenta, las de verdad; la cuenta de este Telegram, la que diga t.deAntes.
vi.mock("../_bot/enlace.js", async (original) => ({
  ...(({ pideCambioDeCuenta, avisoDeCambioDeCuenta, VOLVER_A_LA_DE_ANTES, NO_SE_PASA_LA_LLAVE, CAMBIO }) => ({ pideCambioDeCuenta, avisoDeCambioDeCuenta, VOLVER_A_LA_DE_ANTES, NO_SE_PASA_LA_LLAVE, CAMBIO }))(await original()),
  cuentaDeTelegram: vi.fn(async () => t.deAntes),
  casaQueLeNacio: vi.fn(async () => (t.tablas.households ?? [])[0] ?? null),
  dejariaCasaSinEntrada: vi.fn(async () => t.atrapa),
  enlazarChat: vi.fn(async () => ({ ok: true })), apuntarEnlace: vi.fn(async () => {}), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(async () => ({})), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => t.deGrupo }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^inv_([0-9a-f]{32})$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-06", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn(), cuentaNacidaDe: vi.fn(async () => t.nacida), hayVueltaALaNacida: vi.fn(async () => t.vuelta), emailDeCuenta: vi.fn(async () => (t.tablas.user_profiles ?? [])[0]?.email ?? null) }));

const { default: handler } = await import("./telegram.js");
const { enlazarChat, apuntarEnlace } = await import("../_bot/enlace.js");
const { update } = await import("../_bot/db.js");
const { enTurno } = await import("../_bot/turnos.js");
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
  t.tablas = {}; t.atrapa = false; t.deAntes = null; t.deGrupo = false; t.vuelta = false; t.nacida = null; t.enviados.length = 0; t.trabajo.length = 0;
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

async function pulsa(dato, { chat = 7, from = 7 } = {}) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { callback_query: { id: "q", data: dato, from: { id: from, first_name: "Ana" }, message: { message_id: 2, chat: { id: chat, type: "private" } } } },
  }, res);
  await Promise.all(t.trabajo);
}

// Este Telegram ya es otra cuenta y entra con «Conectar Telegram» de la cuenta de la app (#1238, recorrido 4): manda
// la de la app, sin preguntar, y Lola dice con cuál habla y cómo volver.
describe("/start: cambiar de cuenta, solo y sin preguntar (#1238)", () => {
  const TOKEN = "Q3xk9TzA1bVwPq7yRt2uAb";
  const conCodigo = () => ({ ...codigoValido(TOKEN), user_profiles: [{ email: "ana@gmail.com" }] });

  it("pasa a la cuenta de la app con la prueba del cambio, gasta el enlace y lo dice en un solo mensaje, sin botones", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    await escribe(`/start ${TOKEN}`);
    expect(update).toHaveBeenCalledWith("bot_link_tokens", expect.anything(), expect.anything());
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", householdId: "h1", identidad: "cambio" }));
    // Un solo mensaje, la cuenta y ya: sin el «¡Listo!» de después (Álvaro, 8 nov 2026).
    expect(t.enviados.map((e) => e.texto)).toEqual(["✅ Cuenta: <b>ana@gmail.com</b>"]);
    expect(t.enviados[0].opciones?.botones).toBeUndefined();
    const { confirmarEnlace } = await import("../_bot/enlace.js");
    expect(confirmarEnlace).not.toHaveBeenCalled();
  });

  it("con algo pedido desde la app: cambia y lo atiende ya en la casa nueva, con un solo aviso", async () => {
    // El chat, ya en la casa de la app (como queda tras enlazarChat); la charla de antes, en la otra.
    t.tablas = { ...conCodigo(), bot_chats: [{ household_id: "h1", kind: "private", linked_by: "u1" }], bot_messages: [{ household_id: "hViejo" }] };
    t.deAntes = "u-antes";
    await escribe(`/start ${TOKEN}-g`);
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ identidad: "cambio" }));
    const textos = t.enviados.map((e) => e.texto).join(" ");
    expect(textos).toMatch(/✅ Cuenta:/);
    expect(textos).not.toMatch(/pídemelo otra vez|Ahora estoy con/);
    expect(enTurno).toHaveBeenCalled();
  });

  it("si la de antes nació en este Telegram, cambia aunque su casa tenga gente, y dice cómo volver (#1302)", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    t.vuelta = true;
    t.atrapa = true;
    await escribe(`/start ${TOKEN}`);
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ identidad: "cambio" }));
    expect(t.enviados.find((e) => /✅ Cuenta:/.test(e.texto)).texto).toContain("/cuentadeantes");
  });

  it("si la de antes no nació aquí, el aviso es solo la cuenta: se vuelve a ella entrando en la app con ella", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    await escribe(`/start ${TOKEN}`);
    expect(t.enviados.find((e) => /✅ Cuenta:/.test(e.texto)).texto).not.toContain("/cuentadeantes");
  });

  it("si dejaría una casa con gente sin entrada y sin vuelta, no se mueve (#1302)", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    t.atrapa = true;
    await escribe(`/start ${TOKEN}`);
    expect(t.enviados.at(-1).texto).toMatch(/es la única forma de entrar en tu casa/);
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("si no se puede saber si hay vuelta, se mira el freno: con gente y sin otra entrada, no se mueve", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    t.atrapa = true;
    const { hayVueltaALaNacida } = await import("../_bot/cuentas.js");
    hayVueltaALaNacida.mockRejectedValueOnce(new Error("auth caída"));
    await escribe(`/start ${TOKEN}`);
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(t.enviados.at(-1).texto).toMatch(/es la única forma de entrar en tu casa/);
  });

  it("sin poder comprobarlo, tampoco se mueve (#1302)", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    const { dejariaCasaSinEntrada } = await import("../_bot/enlace.js");
    dejariaCasaSinEntrada.mockRejectedValueOnce(new Error("base caída"));
    await escribe(`/start ${TOKEN}`);
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(t.enviados.at(-1).texto).toMatch(/No he podido comprobar/);
  });

  it("un «sí» de la pregunta de antes (mensajes viejos) sigue el camino de hoy; el «no», nada", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u-antes";
    await pulsa(`cc:${TOKEN}`);
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ identidad: "cambio" }));
    vi.clearAllMocks();
    await pulsa("cc:no");
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(t.enviados.at(-1).texto).toMatch(/lo dejo como estaba/);
  });

  it("el «sí» pulsado por otra persona (en un chat que no es el suyo) no hace nada", async () => {
    t.tablas = conCodigo();
    await pulsa(`cc:${TOKEN}`, { chat: 7, from: 8 });
    expect(enlazarChat).not.toHaveBeenCalled();
  });

  it("si el Telegram ya es de esta misma cuenta, no hay cambio ni aviso", async () => {
    t.tablas = conCodigo();
    t.deAntes = "u1";
    await escribe(`/start ${TOKEN}`);
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ identidad: "ajustes" }));
    expect(t.enviados.map((e) => e.texto).join(" ")).not.toMatch(/✅ Cuenta/);
  });
});

// /cuentadeantes (#1238): lo que hace que cambiar sin preguntar no deje una casa sin entrada.
describe("/cuentadeantes: volver a la cuenta nacida en este Telegram", () => {
  const enlazado = (extra = {}) => ({ bot_chats: [{ household_id: "h1", kind: "private", linked_by: "u1" }], ...extra });

  it("con una cuenta nacida aquí y la identidad en otra, vuelve a ella y a su casa", async () => {
    t.tablas = enlazado({ households: [{ id: "hN" }] });
    t.deAntes = "u1";
    t.nacida = { id: "uN" };
    await escribe("/cuentadeantes");
    expect(enlazarChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: "7", kind: "private", userId: "uN", householdId: "hN", identidad: "nacida" }));
    expect(t.enviados.at(-1).texto).toMatch(/vuelvo a tu cuenta de antes/);
  });

  it("sin cuenta nacida aquí, o ya en ella, no toca nada", async () => {
    t.tablas = enlazado();
    t.deAntes = "uN";
    await escribe("/cuentadeantes");
    t.nacida = { id: "uN" };
    await escribe("/cuentadeantes");
    expect(enlazarChat).not.toHaveBeenCalled();
    expect(t.enviados.at(-1).texto).toMatch(/no hay otra de antes/);
  });
});

// Los rechazos del enlace desde la app también se apuntan en bot_enlaces (#1238). Callado (un botón de la app con algo
// pedido), un código gastado no se apunta: el chat ya estaba enlazado.
describe("/start: los rechazos del enlace se apuntan (#1238)", () => {
  const CODIGO = "a".repeat(22);
  const conCodigo = (fila, { miembro = true } = {}) => {
    const t0 = codigoValido(CODIGO);
    t.tablas = { bot_link_tokens: [{ ...t0.bot_link_tokens[0], ...fila }], household_members: miembro ? t0.household_members : [] };
  };
  const apuntados = () => apuntarEnlace.mock.calls.map(([a]) => `${a.camino}:${a.resultado}`);

  it("un código caducado: app, caducado", async () => {
    conCodigo({ expires_at: "2000-01-01T00:00:00Z" });
    await escribe(`/start ${CODIGO}`);
    expect(apuntados()).toEqual(["app:caducado"]);
  });

  it("un código de grupo usado en un privado: grupo, codigo_de_grupo", async () => {
    t.deGrupo = true;
    conCodigo({});
    await escribe(`/start ${CODIGO}`);
    expect(apuntados()).toEqual(["grupo:codigo_de_grupo"]);
  });

  it("quien lo firmó ya no es de la casa: app, no_miembro", async () => {
    conCodigo({}, { miembro: false });
    await escribe(`/start ${CODIGO}`);
    expect(apuntados()).toEqual(["app:no_miembro"]);
  });

  it("callado, con algo pedido, un código gastado no se apunta; un no miembro, sí", async () => {
    conCodigo({ used_at: "2026-11-01T00:00:00Z" });
    await escribe(`/start ${CODIGO}-g`);
    expect(apuntados()).toEqual([]);
    conCodigo({}, { miembro: false });
    await escribe(`/start ${CODIGO}-g`);
    expect(apuntados()).toEqual(["app:no_miembro"]);
  });
});
