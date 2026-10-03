/**
 * turno() por la vía rápida (api/bot/telegram.js): la plantilla sale sin
 * esperar a que Lola acabe de cancelarse, el límite del mes se sigue
 * respetando y quien eligió inglés va con Lola. Todo lo de fuera, de mentira.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { turno, avisoDelModo, AVISO_ESPERA } = await import("./telegram.js");
const { responder } = await import("../_bot/agente.js");
const { viaRapida } = await import("../_bot/turno.js");
const { editar, llamar } = await import("../_bot/telegram.js");
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

describe("lo que tarda por la vía rápida también avisa", () => {
  const AVISO = "Voy, te preparo el menú, dame unos segundos";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const pedirMenu = () => turno({ chatId: 1, householdId: "h", esGrupo: false, base: "https://x", texto: "Quiero generar un menú nuevo", from: { id: 7, first_name: "Ana" }, responderA: 9 });

  it("generar: el aviso sale al decidir el enrutador y el menú lo sustituye en el mismo mensaje", async () => {
    t.decision = { modo: "generar", confianza: 0.95 };
    viaRapida.mockImplementationOnce(async () => { await espera(60); t.orden.push("motor-acaba"); return { texto: "🎉 ¡Menú listo!" }; });
    await pedirMenu();
    const aviso = t.orden.findIndex((x) => x.startsWith("enviar:") && x.includes(AVISO));
    expect(aviso).toBeGreaterThanOrEqual(0);
    expect(aviso).toBeLessThan(t.orden.indexOf("motor-acaba"));
    // El menú no sale en un mensaje nuevo: se edita el del aviso.
    expect(t.orden.some((x) => x.startsWith("enviar:") && x.includes("Menú listo"))).toBe(false);
    expect(editar).toHaveBeenCalledWith(1, 1, expect.stringContaining("Menú listo"), expect.anything());
    const [ruta] = t.rutas;
    expect(ruta).toMatchObject({ rapida: true, modo: "generar", aviso: "generar_menu" });
    expect(ruta.primer_ms).toBeLessThan(60);
    expect(ruta.ms).toBeGreaterThanOrEqual(55);
  });

  it("una consulta no avisa: sale la plantilla, como siempre", async () => {
    await pedir();
    expect(t.orden.some((x) => x.includes(AVISO))).toBe(false);
    expect(t.rutas[0].aviso).toBeUndefined();
    expect(editar).not.toHaveBeenCalled();
  });

  it("si la vía rápida no saca plantilla, el aviso se borra y contesta Lola", async () => {
    t.decision = { modo: "generar", confianza: 0.95 };
    viaRapida.mockImplementationOnce(async () => { await espera(40); return null; });
    responder.mockImplementationOnce(async () => { await espera(80); return { texto: "¿Para cuántos días lo quieres?", fotos: [] }; });
    await pedirMenu();
    expect(llamar).toHaveBeenCalledWith("deleteMessage", { chat_id: 1, message_id: 1 });
    expect(t.orden.some((x) => x.startsWith("enviar:") && x.includes("¿Para cuántos días"))).toBe(true);
    expect(t.rutas[0].rapida).toBe(false);
    expect(t.rutas[0].aviso).toBeUndefined();
  });
});

describe("el aviso por tiempo: Lola tarda y no hay nada en pantalla", () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const pedirVarias = () => turno({ chatId: 1, householdId: "h", esGrupo: false, base: "https://x", texto: "La semana que viene como en casa. Dame solo la lista de la compra de ese menú.", from: { id: 7, first_name: "Ana" }, responderA: 9 });
  beforeEach(() => { process.env.BOT_AVISO_ESPERA_MS = "30"; t.rapida = false; t.decision = { modo: "lola", confianza: 0.6 }; });
  afterEach(() => { delete process.env.BOT_AVISO_ESPERA_MS; delete process.env.BOT_AVISO_LENTO; });

  it("sale la frase, la respuesta la sustituye y no cuenta como primer texto", async () => {
    responder.mockImplementationOnce(async () => { await espera(150); t.orden.push("lola-contesta"); return { texto: "Aquí tienes la lista.", fotos: [] }; });
    await pedirVarias();
    const aviso = t.orden.findIndex((x) => x.startsWith("enviar:") && x.includes(AVISO_ESPERA));
    expect(aviso).toBeGreaterThanOrEqual(0);
    expect(aviso).toBeLessThan(t.orden.indexOf("lola-contesta"));
    expect(editar).toHaveBeenCalledWith(1, 1, expect.stringContaining("Aquí tienes la lista."), expect.anything());
    const [ruta] = t.rutas;
    expect(ruta.espera_ms).toBeGreaterThanOrEqual(25);
    expect(ruta.espera_ms).toBeLessThan(150);
    expect(ruta.primer_ms).toBeGreaterThanOrEqual(145);
  });

  it("si Lola contesta antes, no sale", async () => {
    responder.mockImplementationOnce(async () => ({ texto: "Hola, ¿qué necesitas?", fotos: [] }));
    await pedirVarias();
    await espera(60);
    expect(t.orden.some((x) => x.includes(AVISO_ESPERA))).toBe(false);
    expect(t.rutas[0].espera_ms).toBeUndefined();
  });

  it("si Lola ya está escribiendo, no la pisa", async () => {
    responder.mockImplementationOnce(async ({ alEscribir }) => { alEscribir("Te cuento lo que he encontrado para esa semana"); await espera(100); return { texto: "Te cuento lo que he encontrado para esa semana.", fotos: [] }; });
    await pedirVarias();
    expect(t.orden.some((x) => x.includes(AVISO_ESPERA))).toBe(false);
    expect(t.rutas[0].espera_ms).toBeUndefined();
  });

  it("si ya salió el aviso del enrutador, no se cambia por el genérico", async () => {
    t.decision = { modo: "generar", confianza: 0.85 };
    responder.mockImplementationOnce(async () => { await espera(120); return { texto: "¡Menú listo!", fotos: [] }; });
    await pedirVarias();
    expect(t.orden.some((x) => x.includes("Voy, te preparo el menú"))).toBe(true);
    expect(t.orden.some((x) => x.includes(AVISO_ESPERA))).toBe(false);
  });

  it("en un turno de la vía rápida no sale, aunque Lola tarde en soltar", async () => {
    t.rapida = true;
    t.decision = { modo: "consulta", confianza: 0.95 };
    await pedir();
    await espera(60);
    expect(t.orden.some((x) => x.includes(AVISO_ESPERA))).toBe(false);
  });

  it("con BOT_AVISO_LENTO=off, no sale", async () => {
    process.env.BOT_AVISO_LENTO = "off";
    responder.mockImplementationOnce(async () => { await espera(100); return { texto: "Aquí tienes la lista.", fotos: [] }; });
    await pedirVarias();
    expect(t.orden.some((x) => x.includes(AVISO_ESPERA))).toBe(false);
  });
});
