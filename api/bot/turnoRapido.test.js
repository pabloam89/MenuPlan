/**
 * turno() por la vía rápida (api/bot/telegram.js): la plantilla sale sin
 * esperar a que Lola acabe de cancelarse, el límite del mes se sigue
 * respetando y quien eligió inglés va con Lola. Todo lo de fuera, de mentira.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.BOT_ROUTER = "on";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const t = vi.hoisted(() => ({ orden: [], rutas: [], limite: null, idioma: "es", cancelarTardaMs: 80, rapida: true, decision: { modo: "consulta", confianza: 0.95 } }));

vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));
vi.mock("../_bot/db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => []), update: vi.fn(async () => []), rpc: vi.fn(), eq: (x) => x }));
vi.mock("../_bot/telegram.js", () => ({
  enviar: vi.fn(async (_chat, texto) => { t.orden.push(`enviar:${texto}`); return { message_id: 1 }; }),
  enviarFotos: vi.fn(async () => {}), editar: vi.fn(async () => {}), llamar: vi.fn(async () => ({})),
  escaparHtml: (s) => s, nombreDelBot: async () => "lola", TECLADO: {},
}));
vi.mock("../_bot/agente.js", () => ({
  // Lola arranca a la vez; al cancelarla tarda un rato en soltar (como si
  // estuviera a mitad de una lectura que no se puede cortar).
  responder: vi.fn(({ signal }) => new Promise((_ok, ko) => {
    signal?.addEventListener("abort", () => setTimeout(() => { t.orden.push("lola-cancelada"); ko(new Error("turno cortado")); }, t.cancelarTardaMs));
  })),
  cortarCharla: vi.fn(), esCaida: () => false,
  AVISO_LENTO: { generar_menu: "Voy, te preparo el menú, dame unos segundos", buscar_recetas: () => "Un momento" },
}));
vi.mock("../_bot/embudo.js", () => ({
  registrar: vi.fn(async (ev, { extra } = {}) => { if (ev === "bot_route") t.rutas.push(extra); }),
  rastro: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(async () => "u"),
}));
vi.mock("../_bot/router.js", () => ({
  clasificar: vi.fn(async () => ({ datos: {}, ms: 5, uso: {}, ...t.decision })),
  vaPorLaRapida: () => t.rapida, permitidoEn: () => true,
}));
vi.mock("../_bot/turno.js", () => ({
  viaRapida: vi.fn(async () => ({ texto: "Hoy: tortilla" })), eleccionDe: () => null, aplicarEleccion: vi.fn(), contextoDe: vi.fn(async () => ({})),
}));
vi.mock("../_bot/uso.js", () => ({ fueraDeLimite: vi.fn(async () => t.limite), contarUso: vi.fn(async () => 1) }));
vi.mock("../_bot/papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "titular", userId: "u" })), idiomaDe: vi.fn(async () => t.idioma) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: vi.fn(), respuestaSemana: vi.fn(), respuestaCompra: vi.fn(), recordar: vi.fn(async () => { t.orden.push("recordar"); }) }));
vi.mock("../_bot/pintar.js", () => ({ pintarMenuEntero: vi.fn() }));
vi.mock("../_bot/voz.js", () => ({ transcribir: vi.fn() }));
vi.mock("../_bot/adjuntos.js", () => ({ adjuntoDe: vi.fn() }));
vi.mock("../_bot/turnos.js", () => ({ enTurno: vi.fn(), aSolas: vi.fn(), juntar: vi.fn() }));
vi.mock("../_bot/plato.js", () => ({ comidaElegida: () => null, quiereApuntar: () => false }));
vi.mock("../_bot/recordatorios.js", () => ({ ahoraEnMadrid: () => "viernes, 2 de octubre de 2026, 13:00" }));
vi.mock("../_bot/compartir.js", () => ({ enlacesReceta: vi.fn(), enlacesSemana: vi.fn(), botonesCompartir: vi.fn(), resolverInvitacion: vi.fn(), recetaEnTexto: vi.fn(), semanaEnTexto: vi.fn(), copiarReceta: vi.fn() }));
vi.mock("../_bot/menu.js", () => ({ motor: vi.fn() }));
vi.mock("../_bot/ajustes.js", () => ({ sembrarCasa: vi.fn() }));
vi.mock("../_bot/enlace.js", () => ({ enlazarChat: vi.fn(), crearCodigo: vi.fn(), gastarCodigo: vi.fn(), baseDe: () => "https://x", confirmarEnlace: vi.fn(), casaPropia: vi.fn(), idDePersona: (f) => String(f?.id ?? ""), codigoDeGrupo: vi.fn(), esCodigoDeGrupo: () => false }));
vi.mock("../_bot/invitacion.js", () => ({ unirsePorInvitacion: vi.fn(), ES_INVITACION: /^$/ }));
vi.mock("../_bot/traducir.js", () => ({ traducir: vi.fn(async (xs) => xs) }));
vi.mock("../_bot/casa.js", () => ({ hoyISO: () => "2026-10-02", cargarCasa: vi.fn(async () => null) }));
vi.mock("../_bot/borrar.js", () => ({ puedeBorrar: vi.fn(), borrarCuenta: vi.fn(), limpiarPantalla: vi.fn() }));
vi.mock("../_bot/cuentas.js", () => ({ enviarAcceso: vi.fn(), verificarCodigoEmail: vi.fn(), crearCuentaTelegram: vi.fn(), cuentaNacidaAqui: vi.fn() }));

const { turno, avisoDelModo } = await import("./telegram.js");
const { responder } = await import("../_bot/agente.js");
const pedir = () => turno({ chatId: 1, householdId: "h", esGrupo: false, base: "https://x", texto: "¿qué cenamos?", from: { id: 7, first_name: "Ana" }, responderA: 9 });

beforeEach(() => { t.orden.length = 0; t.rutas.length = 0; t.limite = null; t.idioma = "es"; t.rapida = true; t.decision = { modo: "consulta", confianza: 0.95 }; vi.clearAllMocks(); });

describe("turno por la vía rápida", () => {
  it("la plantilla sale antes de que Lola acabe de cancelarse", async () => {
    await pedir();
    const enviada = t.orden.findIndex((x) => x.startsWith("enviar:") && x.includes("Hoy: tortilla"));
    expect(enviada).toBeGreaterThanOrEqual(0);
    expect(enviada).toBeLessThan(t.orden.indexOf("lola-cancelada"));
    // El primer texto no carga con lo que tarda Lola en soltar; el turno entero sí la espera.
    const [ruta] = t.rutas;
    expect(ruta.rapida).toBe(true);
    expect(ruta.primer_ms).toBeLessThan(t.cancelarTardaMs);
    expect(ruta.ms).toBeGreaterThanOrEqual(t.cancelarTardaMs - 5);
    expect(ruta.contexto_ms).toBeGreaterThanOrEqual(0);
    expect(ruta.lola_cancelada).toBe(true);
    expect(ruta).toMatchObject({ esGrupo: false, variosAutores: false, chat: "1" });
  });

  it("en un grupo, el turno se apunta como de grupo", async () => {
    t.rapida = false;
    responder.mockImplementationOnce(async () => ({ texto: "Hoy hay tortilla", fotos: [] }));
    await turno({ chatId: -55, householdId: "h", esGrupo: true, variosAutores: true, base: "https://x", texto: "@lola ¿qué cenamos?", from: { id: 7, first_name: "Ana" }, responderA: 9 });
    expect(t.rutas[0]).toMatchObject({ esGrupo: true, variosAutores: true, chat: "-55" });
  });

  it("con el límite del mes agotado no hay vía rápida: contesta Lola", async () => {
    t.limite = "Este mes ya hemos hablado…";
    responder.mockImplementationOnce(async () => ({ texto: "Límite", fotos: [] }));
    await pedir();
    expect(t.orden.some((x) => x.includes("Hoy: tortilla"))).toBe(false);
    expect(t.rutas[0].rapida).toBe(false);
  });

  it("quien eligió inglés va con Lola, sin enrutador", async () => {
    t.idioma = "en";
    responder.mockImplementationOnce(async () => ({ texto: "Tonight: omelette", fotos: [] }));
    await pedir();
    // Sin enrutador, pero el turno se apunta igual, con dónde ocurre.
    expect(t.rutas).toHaveLength(1);
    expect(t.rutas[0]).toMatchObject({ sin_enrutador: "idioma", rapida: false, modo: "lola", esGrupo: false, chat: "1" });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(responder.mock.calls[0][0].puerta ?? null).toBeNull();
  });
});

describe("el aviso sale en cuanto el enrutador sabe qué se pide", () => {
  const AVISO = "Voy, te preparo el menú, dame unos segundos";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const pedirMenu = () => turno({ chatId: 1, householdId: "h", esGrupo: false, base: "https://x", texto: "prepárame el menú de la semana que viene", from: { id: 7, first_name: "Ana" }, responderA: 9 });

  it("avisoDelModo: solo para lo que tarda, y solo si el enrutador lo tiene claro", () => {
    expect(avisoDelModo({ modo: "generar", confianza: 0.85 })).toBe(AVISO);
    expect(avisoDelModo({ modo: "generar", confianza: 0.5 })).toBeNull();
    expect(avisoDelModo({ modo: "consulta", confianza: 0.95 })).toBeNull();
    expect(avisoDelModo({ modo: "lola", confianza: 0.95 })).toBeNull();
    expect(avisoDelModo(null)).toBeNull();
  });

  it("«prepárame el menú»: el aviso se ve antes de que Lola conteste", async () => {
    t.rapida = false;
    t.decision = { modo: "generar", confianza: 0.85 };
    responder.mockImplementationOnce(async () => { await espera(120); t.orden.push("lola-contesta"); return { texto: "¡Menú listo!", fotos: [] }; });
    await pedirMenu();
    const aviso = t.orden.findIndex((x) => x.startsWith("enviar:") && x.includes(AVISO));
    expect(aviso).toBeGreaterThanOrEqual(0);
    expect(aviso).toBeLessThan(t.orden.indexOf("lola-contesta"));
    expect(t.rutas[0].rapida).toBe(false);
    expect(t.rutas[0].primer_ms).toBeLessThan(120);
  });

  it("si Lola ya ha escrito algo suyo, el aviso no lo pisa", async () => {
    t.rapida = false;
    t.decision = { modo: "generar", confianza: 0.85 };
    responder.mockImplementationOnce(async ({ alEscribir }) => { alEscribir("¿Para esta semana o para la que viene?"); await espera(40); return { texto: "¿Para esta semana o para la que viene?", fotos: [] }; });
    await pedirMenu();
    expect(t.orden.some((x) => x.includes(AVISO))).toBe(false);
  });

  it("con el enrutador dudando, sin aviso", async () => {
    t.rapida = false;
    t.decision = { modo: "generar", confianza: 0.5 };
    responder.mockImplementationOnce(async () => { await espera(40); return { texto: "¿Qué necesitas?", fotos: [] }; });
    await pedirMenu();
    expect(t.orden.some((x) => x.includes(AVISO))).toBe(false);
  });
});
