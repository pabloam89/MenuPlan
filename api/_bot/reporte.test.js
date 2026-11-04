// /fallo (api/_bot/reporte.js): quién puede, qué tipos valen y que la fila enlaza el mensaje con su turno. Sin red: `io`.
import { describe, it, expect, vi } from "vitest";
import {
  probadores, esProbador, comandoFallo, leerBoton, datoTipo, botonesTipo, turnoDelMensaje,
  abrirReporte, pulsarReporte, completarReporte, ADMIN_POR_DEFECTO, ETIQUETAS_REPORTE, EVENTO_REPORTE, PASO_REPORTE, ENLACE_REPORTE, SIN_LEER_REPORTE, APUNTADO,
} from "./reporte.js";
import { TIPOS_REPORTE } from "../../src/lib/vocabularios.js";

const PABLO = "491628449";
const ENTORNO = { BOT_PROBADORES: `${PABLO}, 222` };

/** Un `io` de prueba: select por tabla, y lo escrito y enviado apuntado. */
function io({ rutas = [], charla = [], reporte = null } = {}) {
  const hecho = { insertadas: [], cambios: [], enviados: [], editados: [] };
  return {
    hecho,
    select: vi.fn(async (tabla, filtro) => {
      if (tabla === "bot_messages") return charla;
      if (filtro.includes(`event=eq.${EVENTO_REPORTE}`)) return reporte ? [reporte] : [];
      return rutas;
    }),
    insert: vi.fn(async (_t, filas) => { hecho.insertadas.push(...filas); return filas.map((f) => ({ ...f, id: 77 })); }),
    update: vi.fn(async (_t, filtro, cambios) => { hecho.cambios.push({ filtro, ...cambios }); return [{}]; }),
    enviar: vi.fn(async (chat, texto, o) => { hecho.enviados.push({ chat, texto, ...o }); return { message_id: 900 }; }),
    editar: vi.fn(async (chat, mid, texto, o) => { hecho.editados.push({ mid, texto, ...o }); }),
    llamar: vi.fn(async () => true),
    transcribir: vi.fn(async () => ({ texto: "quería la pasta del martes" })),
    duenoDe: vi.fn(async () => "u-dueno"),
  };
}

// El mensaje malo de Lola, a las 18:40:00 UTC del 4 nov, y su turno: empezó 6 s antes y acabó 2 s después.
const FECHA_S = Date.parse("2026-11-04T18:40:00Z") / 1000;
const LOLA = { message_id: 555, date: FECHA_S, from: { id: 1, is_bot: true }, text: "He puesto lentejas el martes" };
const TURNO = { id: 4242, created_at: "2026-11-04T18:40:02Z", metadata: { chat: "7", ms: 8000, texto: "pon pasta el martes", lola: { herramientas: [["cambiar_plato", 300]] } } };
const OTRO = { id: 4243, created_at: "2026-11-04T18:45:00Z", metadata: { chat: "7", ms: 3000 } };

describe("quién prueba", () => {
  it("BOT_PROBADORES manda; sin ella, los de BOT_ADMINS; sin ninguna, Pablo", () => {
    expect(probadores(ENTORNO)).toEqual([PABLO, "222"]);
    expect(probadores({ BOT_ADMINS: "1,2" })).toEqual(["1", "2"]);
    expect(probadores({})).toEqual([ADMIN_POR_DEFECTO]);
    expect(esProbador(222, ENTORNO)).toBe(true);
    expect(esProbador(333, ENTORNO)).toBe(false);
  });
});

describe("el comando y los botones", () => {
  it("/fallo, con o sin destinatario y con texto detrás", () => {
    expect(comandoFallo("/fallo")).toEqual({ texto: null });
    expect(comandoFallo("/fallo@HoMenuBot quería la pasta")).toEqual({ texto: "quería la pasta" });
    expect(comandoFallo("/fallos")).toBe(null);
  });

  it("cada tipo tiene su etiqueta, y los botones llevan todos los tipos", () => {
    expect(Object.keys(ETIQUETAS_REPORTE)).toEqual(TIPOS_REPORTE);
    expect(botonesTipo(7).flat().map((b) => leerBoton(b.dato).tipo)).toEqual(TIPOS_REPORTE);
  });

  it("un tipo fuera de la lista no se lee", () => {
    expect(leerBoton(datoTipo("dato_mal", 7))).toEqual({ tipo: "dato_mal", id: "7" });
    expect(leerBoton(datoTipo("me_aburre", 7))).toEqual({ invalido: true });
    expect(leerBoton("fallo:dato_mal:x")).toEqual({ invalido: true });
    expect(leerBoton("t:hola")).toBe(null);
  });
});

describe("turnoDelMensaje: el turno que escribió el mensaje", () => {
  const fechaMs = FECHA_S * 1000;
  it("por el id que apuntó el turno (msg_lola), aunque la hora no case", () => {
    const conId = { ...OTRO, metadata: { ...OTRO.metadata, msg_lola: 555 } };
    expect(turnoDelMensaje([TURNO, conId], { id: 555, fechaMs })).toEqual({ fila: conId, enlace: ENLACE_REPORTE.MENSAJE });
  });
  it("sin id apuntado, el que empezó antes del mensaje y acabó después", () => {
    expect(turnoDelMensaje([OTRO, TURNO], { id: 555, fechaMs })).toEqual({ fila: TURNO, enlace: ENLACE_REPORTE.HORA });
  });
  it("ni el de sombra ni uno que empezó después", () => {
    expect(turnoDelMensaje([{ ...TURNO, metadata: { ...TURNO.metadata, sombra: true } }, OTRO], { id: 555, fechaMs })).toBe(null);
  });
});

describe("abrirReporte", () => {
  it("la fila enlaza el mensaje reportado, su turno y lo dicho, y pregunta el tipo sin escribir en la charla", async () => {
    const x = io({ rutas: [OTRO, TURNO], charla: [{ role: "user", content: { texto: "pon pasta el martes" } }, { role: "assistant", content: { texto: "He puesto lentejas" } }] });
    const msg = { message_id: 600, from: { id: 222, first_name: "Manu" }, reply_to_message: LOLA };
    await abrirReporte({ msg, chatId: 7, householdId: "h1", texto: "quería pasta" }, x);
    const [fila] = x.hecho.insertadas;
    expect(fila.event).toBe(EVENTO_REPORTE);
    expect(fila.user_id).toBe("u-dueno");
    expect(fila.metadata).toMatchObject({
      telegram_id: "222", quien: "Manu", chat: "7", paso: PASO_REPORTE.TIPO, msg_reportado: 555,
      ruta_id: 4242, ruta_enlace: ENLACE_REPORTE.HORA, ultima: LOLA.text, anterior: "pon pasta el martes", texto: "quería pasta",
    });
    expect(x.insert.mock.calls.map(([t]) => t)).toEqual(["user_events"]);
    expect(x.hecho.enviados[0]).toMatchObject({ texto: "¿Qué ha fallado?", responderA: 555 });
    expect(x.hecho.enviados[0].botones.flat()[0].dato).toBe(datoTipo(TIPOS_REPORTE[0], 77));
  });

  it("sin responder a nada: el último turno del chat y la última respuesta de la charla", async () => {
    const x = io({ rutas: [{ ...TURNO, metadata: { ...TURNO.metadata, msg_lola: 554 } }], charla: [{ role: "assistant", content: { texto: "Última de Lola" } }, { role: "user", content: { texto: "¿y el jueves?" } }] });
    await abrirReporte({ msg: { message_id: 601, from: { id: 222 } }, chatId: 7, householdId: "h1" }, x);
    expect(x.hecho.insertadas[0].metadata).toMatchObject({ msg_reportado: 554, ruta_id: 4242, ruta_enlace: ENLACE_REPORTE.ULTIMO, ultima: "Última de Lola" });
    expect(x.hecho.enviados[0].responderA).toBe(554);
  });

  it("si no se pueden leer los turnos o la charla, se apunta igual pero la fila dice qué falta y por qué (no «sin turno»)", async () => {
    const x = io({ rutas: [TURNO] });
    x.select.mockRejectedValue(new Error("base caída"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await abrirReporte({ msg: { message_id: 600, from: { id: 222 }, reply_to_message: LOLA }, chatId: 7, householdId: "h1" }, x);
    expect(x.hecho.insertadas[0].metadata).toMatchObject({ ruta_id: null, ruta_enlace: null, sin_leer: [SIN_LEER_REPORTE.RUTA, SIN_LEER_REPORTE.CHARLA] });
    const bien = io({ rutas: [TURNO], charla: [] });
    await abrirReporte({ msg: { message_id: 600, from: { id: 222 }, reply_to_message: LOLA }, chatId: 7, householdId: "h1" }, bien);
    expect(bien.hecho.insertadas[0].metadata.sin_leer).toBeUndefined();
  });

  it("si no se puede apuntar, lo dice y no saca botones", async () => {
    const x = io({ rutas: [TURNO] });
    x.insert.mockRejectedValueOnce(new Error("base caída"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await abrirReporte({ msg: { message_id: 600, from: { id: 222 }, reply_to_message: LOLA }, chatId: 7, householdId: "h1" }, x);
    expect(x.hecho.enviados[0].texto).toMatch(/No he podido apuntar/);
    expect(x.hecho.enviados[0].botones).toBeUndefined();
  });
});

describe("pulsarReporte", () => {
  const reporte = { id: 77, created_at: "2026-11-04T18:41:00Z", metadata: { telegram_id: "222", chat: "7", paso: PASO_REPORTE.TIPO, texto: null } };
  const cq = (data, from = 222) => ({ id: "cq", data, from: { id: from }, message: { message_id: 901, chat: { id: 7 } } });

  it("un tipo fuera de la lista no se apunta", async () => {
    const x = io({ reporte });
    const r = await pulsarReporte(cq("fallo:me_aburre:77"), x, ENTORNO);
    expect(r).toEqual({ apuntado: false, motivo: "fuera_de_lista" });
    expect(x.update).not.toHaveBeenCalled();
  });

  it("el botón de otra persona no cuenta", async () => {
    const x = io({ reporte });
    expect(await pulsarReporte(cq(datoTipo("dato_mal", 77), PABLO), x, ENTORNO)).toMatchObject({ apuntado: false, motivo: "de_otro" });
    expect(x.update).not.toHaveBeenCalled();
  });

  it("con el tipo y sin lo que esperaba, lo pregunta; con ello, «Apuntado»", async () => {
    const x = io({ reporte });
    expect(await pulsarReporte(cq(datoTipo("dato_mal", 77)), x, ENTORNO)).toEqual({ apuntado: true });
    expect(x.hecho.cambios[0].metadata).toMatchObject({ tipo: "dato_mal", paso: PASO_REPORTE.ESPERA, telegram_id: "222" });
    expect(x.hecho.editados[0].texto).toMatch(/¿Qué esperabas\?/);
    const y = io({ reporte: { ...reporte, metadata: { ...reporte.metadata, texto: "quería pasta" } } });
    await pulsarReporte(cq(datoTipo("lento", 77)), y, ENTORNO);
    expect(y.hecho.cambios[0].metadata).toMatchObject({ tipo: "lento", paso: PASO_REPORTE.HECHO });
    expect(y.hecho.editados.map((e) => e.texto)).toEqual([APUNTADO]);
  });

  it("«Nada más» cierra sin tocar el tipo", async () => {
    const x = io({ reporte: { ...reporte, metadata: { ...reporte.metadata, tipo: "lento", paso: PASO_REPORTE.ESPERA } } });
    await pulsarReporte(cq("fallo:nada:77"), x, ENTORNO);
    expect(x.hecho.cambios[0].metadata).toMatchObject({ tipo: "lento", paso: PASO_REPORTE.HECHO });
    expect(x.hecho.editados.map((e) => e.texto)).toEqual([APUNTADO]);
  });
});

describe("completarReporte", () => {
  const ahora = Date.parse("2026-11-04T18:42:00Z");
  const esperando = { id: 77, created_at: "2026-11-04T18:41:00Z", metadata: { telegram_id: "222", chat: "7", paso: PASO_REPORTE.ESPERA, tipo: "dato_mal" } };

  it("la línea siguiente es lo que esperaba, y contesta solo «Apuntado»", async () => {
    const x = io({ reporte: esperando });
    expect(await completarReporte({ msg: { from: { id: 222 }, text: "quería pasta" }, chatId: 7 }, x, ahora)).toBe(true);
    expect(x.hecho.cambios[0].metadata).toMatchObject({ texto: "quería pasta", paso: PASO_REPORTE.HECHO, tipo: "dato_mal" });
    expect(x.hecho.enviados.map((e) => e.texto)).toEqual([APUNTADO]);
  });

  it("un audio se transcribe", async () => {
    const x = io({ reporte: esperando });
    expect(await completarReporte({ msg: { from: { id: 222 }, voice: { file_id: "v" } }, chatId: 7, householdId: "h1" }, x, ahora)).toBe(true);
    expect(x.hecho.cambios[0].metadata.texto).toBe("quería la pasta del martes");
  });

  it("pasado su cuarto de hora, el mensaje sigue a Lola", async () => {
    const x = io({ reporte: esperando });
    expect(await completarReporte({ msg: { from: { id: 222 }, text: "¿qué cenamos?" }, chatId: 7 }, x, ahora + 20 * 60000)).toBe(false);
    expect(x.update).not.toHaveBeenCalled();
  });
});
