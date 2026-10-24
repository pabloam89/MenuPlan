/**
 * Lo que deja bot_route cada tipo de turno de Lola (api/bot/telegram.js, #910):
 * el alta, una foto y un PDF antes no dejaban rastro; ahora sí, con su origen en
 * `sin_enrutador`. Y los campos de medida nuevos: espera_cola_ms, motor_frio,
 * herramientas_reloj_ms y lola_cancelada_uso. Todo lo de fuera, de mentira; los
 * tiempos se miden por relaciones o con cotas de lo que el test fija.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.TELEGRAM_WEBHOOK_SECRET = "secreto";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ tablas: {}, rutas: [], trabajo: [], esperaCola: 4321 }));

vi.mock("@vercel/functions", () => ({ waitUntil: (p) => t.trabajo.push(p) }));
vi.mock("../_bot/db.js", () => ({
  select: vi.fn(async (tabla) => t.tablas[tabla] ?? []),
  insert: vi.fn(async () => []), update: vi.fn(async () => []), rpc: vi.fn(), eq: (x) => x,
}));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async () => ({ message_id: 1 })),
  enviarFotos: vi.fn(async () => {}), editar: vi.fn(async () => {}), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({ responder: vi.fn(async () => ({ texto: "Hecho", fotos: [] })), cortarCharla: vi.fn(), esCaida: () => false, AVISO_LENTO: {} }));
vi.mock("../_bot/embudo.js", () => ({
  registrar: vi.fn(async (ev, { extra } = {}) => { if (ev === "bot_route") t.rutas.push(extra); }),
  rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(async () => "u"),
}));
vi.mock("../_bot/router.js", () => ({
  clasificar: vi.fn(async () => ({ modo: "consulta", confianza: 0.95, datos: {}, ms: 5, uso: {} })),
  vaPorLaRapida: () => true, permitidoEn: () => true,
}));
vi.mock("../_bot/turno.js", () => ({ viaRapida: vi.fn(async () => ({ texto: "Hoy: tortilla" })), eleccionDe: () => null, aplicarEleccion: vi.fn(), contextoDe: vi.fn(async () => ({})) }));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(async () => null), contarUso: vi.fn(async () => 1) }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "titular", userId: "u" })), idiomaDe: vi.fn(async () => "es") }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn(async () => {}) }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
// La cola de verdad (juntar) con las dos puertas de entrada de mentira: sin base de datos, atienden al momento.
vi.mock("../_bot/turnos.js", async (original) => ({
  ...(await original()),
  // El mensaje llevaba 5 s en la cola cuando le tocó.
  enTurno: vi.fn(async (_chat, item, atender) => atender([{ ...item, enCola: item.enCola - 5000 }])),
  aSolas: vi.fn(async (_chat, atender) => atender({ esperaMs: t.esperaCola })),
}));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "" }));
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(), recetaEnTexto: vi.fn(), semanaEnTexto: vi.fn(), copiarReceta: vi.fn(), cuentasDeQuien: vi.fn() }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(async () => ({ ok: true })), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(), casaPropia: vi.fn(), idDePersona: (f) => (f?.id ? String(f.id) : null), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-24", cargarCasa: vi.fn() }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: () => false, borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(async () => ({ userId: "n1", householdId: "hn" })), cuentaNacidaAqui: vi.fn(async () => null) }));

const { default: handler } = await import("./telegram.js");
const { responder } = await import("../_bot/agente.js");
const { adjuntoDe } = await import("../_bot/adjuntos.js");
const { cargaMedida, olvidarCargaDelMotor } = await import("../_bot/medidaTurno.js");

async function manda(message) {
  const res = { status: () => res, json: () => res, end: () => res };
  await handler({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secreto" },
    body: { update_id: Math.random(), message: { message_id: 1, chat: { id: 7, type: "private" }, from: { id: 7, first_name: "Ana" }, ...message } },
  }, res);
  await Promise.all(t.trabajo);
}

beforeEach(() => {
  t.tablas = {}; t.rutas.length = 0; t.trabajo.length = 0; t.esperaCola = 4321;
  vi.clearAllMocks();
  olvidarCargaDelMotor();
  delete process.env.BOT_ROUTER;
});
afterEach(() => { delete process.env.BOT_ROUTER; });

const conCasa = () => { t.tablas = { bot_chats: [{ household_id: "h" }] }; };

describe("cada tipo de turno de Lola deja su bot_route", () => {
  it("el alta (el primer mensaje de una casa nueva)", async () => {
    await manda({ text: "somos cuatro, dos niños" });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0]).toMatchObject({ sin_enrutador: "alta", modo: "lola", rapida: false, esGrupo: false, chat: "7" });
    expect(t.rutas[0].ms).toBeGreaterThanOrEqual(0);
    // Ni el texto de la familia ni nada suyo en el evento.
    expect(JSON.stringify(t.rutas[0])).not.toContain("somos cuatro");
  });

  it("una foto, con lo que esperó a que el chat quedara libre", async () => {
    conCasa();
    adjuntoDe.mockResolvedValueOnce({ tipo: "image", mediaType: "image/jpeg", base64: "x" });
    await manda({ photo: [{ file_id: "f" }] });
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0]).toMatchObject({ sin_enrutador: "foto", modo: "lola", rapida: false, chat: "7", espera_cola_ms: 4321 });
  });

  it("un PDF", async () => {
    conCasa();
    adjuntoDe.mockResolvedValueOnce({ tipo: "document", mediaType: "application/pdf", base64: "x" });
    await manda({ document: { file_id: "d", mime_type: "application/pdf" } });
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0]).toMatchObject({ sin_enrutador: "pdf", espera_cola_ms: 4321 });
  });

  it("la foto que no se pudo abrir no es un turno de Lola: no hay bot_route", async () => {
    conCasa();
    adjuntoDe.mockResolvedValueOnce({ error: "tipo" });
    await manda({ document: { file_id: "d" } });
    expect(responder).not.toHaveBeenCalled();
    expect(t.rutas).toHaveLength(0);
  });
});

describe("espera_cola_ms, motor_frio y herramientas de reloj", () => {
  it("un mensaje que llevaba 5 s en la cola lo dice", async () => {
    conCasa();
    await manda({ text: "¿qué cenamos?" });
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0].espera_cola_ms).toBeGreaterThanOrEqual(5000);
  });

  it("el import en frío del motor, si cayó dentro del turno", async () => {
    conCasa();
    responder.mockImplementationOnce(async () => {
      await cargaMedida(() => new Promise((r) => setTimeout(r, 30)));
      return { texto: "Hecho", fotos: [] };
    });
    await manda({ text: "¿qué cenamos?" });
    expect(t.rutas[0].motor_frio).toBeGreaterThanOrEqual(25);
    expect(t.rutas[0].motor_frio).toBeLessThanOrEqual(t.rutas[0].ms); // tiempo: relación — el import cabe en el turno
  });

  it("sin import en el turno, el campo no sale", async () => {
    conCasa();
    await manda({ text: "¿qué cenamos?" });
    expect(t.rutas[0]).not.toHaveProperty("motor_frio");
  });

  it("las herramientas se apuntan de reloj: cinco en fila no suman lo que cada una lleva dentro", async () => {
    conCasa();
    // Cinco escrituras que arrancan a la vez y la fila deja acabar de a una: 400, 800, … 2000 ms.
    const herramientas = [1, 2, 3, 4, 5].map((i) => ({ n: "fuera_de_casa", ms: 400 * i, t0: 9000 }));
    responder.mockImplementationOnce(async () => ({ texto: "Hecho", fotos: [], medida: { modelo: "claude-sonnet-5", vueltas: 2, ms: 3000, herramientas, llamadas: [[900, 40, 300], [2500, 60, 200]] } }));
    await manda({ text: "Nat no come el finde" });
    const { lola } = t.rutas[0];
    expect(lola.herramientas.reduce((a, [, ms]) => a + ms, 0)).toBe(6000);
    expect(lola.herramientas_reloj_ms).toBe(2000);
  });
});

describe("la llamada de Lola que se cancela", () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  it("guarda lo que ya había pagado (lola_cancelada_uso)", async () => {
    process.env.BOT_ROUTER = "on";
    conCasa();
    const uso = { in: 14, out: 52, cr: 61000, cw: 120 };
    responder.mockImplementationOnce(({ signal }) => new Promise((_ok, ko) => {
      signal?.addEventListener("abort", () => setTimeout(() => ko(Object.assign(new Error("turno cortado"), { usoParcial: uso })), 10));
    }));
    await manda({ text: "¿qué cenamos?" });
    await espera(30);
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0]).toMatchObject({ rapida: true, lola_cancelada: true, lola_cancelada_uso: uso });
  });

  it("si se cortó antes de pagar nada, no inventa uso", async () => {
    process.env.BOT_ROUTER = "on";
    conCasa();
    responder.mockImplementationOnce(({ signal }) => new Promise((_ok, ko) => {
      signal?.addEventListener("abort", () => setTimeout(() => ko(new Error("turno cortado")), 10));
    }));
    await manda({ text: "¿qué cenamos?" });
    expect(t.rutas[0]).toMatchObject({ lola_cancelada: true });
    expect(t.rutas[0]).not.toHaveProperty("lola_cancelada_uso");
  });
});
