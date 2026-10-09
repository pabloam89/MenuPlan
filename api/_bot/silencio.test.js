/**
 * Alergias «por silencio» (#229). Lola pregunta avisando («Si no me dices
 * nada, entiendo que ninguna.») y el mensaje siguiente no contesta a eso. Lo
 * decide el código, pero DESPUÉS de que Lola lea el mensaje: solo si en el
 * turno no llamó a ninguna herramienta de salud o gustos y el mensaje no trae
 * ninguna señal. Ante la duda, no se marca: el lado seguro es seguir sin
 * revisar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./casa.js", () => ({ conCasa: vi.fn() }));
vi.mock("./tareas.js", () => ({ cerrarPorEstado: vi.fn(async () => 0) }));

const { conCasa } = await import("./casa.js");
const { cerrarPorEstado } = await import("./tareas.js");
const {
  AVISO_SILENCIO, preguntoConAviso, haySenal, destinatarios, decidirSilencio, apuntarSilencio, conRecordatorio, RECORDATORIO_SILENCIO,
  HERRAMIENTAS_QUE_CONTESTAN,
} = await import("./silencio.js");
const { alergiasParaMenu } = await import("../../src/lib/alergias.js");

const PREGUNTA = `¿Alguien en casa tiene alguna alergia o intolerancia? ${AVISO_SILENCIO}`;
const casa = () => ({
  householdId: "h1",
  state: {
    data: {
      members: [
        { id: "a", name: "Ana", allergies: [], alergiasRevisadas: false },
        { id: "b", name: "Pablo", allergies: [], alergiasRevisadas: false },
        { id: "l", name: "Lucas", allergies: [], alergiasRevisadas: false },
      ],
    },
  },
});
const NOMBRES = ["Ana", "Pablo", "Lucas", "Leo"];

let guardado;
let logs;
beforeEach(() => {
  vi.clearAllMocks();
  guardado = null;
  conCasa.mockImplementation(async (_h, cambiar) => {
    const c = casa();
    const r = await cambiar(c);
    if (!r) return { ok: true, casa: c, sinCambios: true };
    guardado = r;
    return { ok: true, casa: c };
  });
  logs = [];
  vi.spyOn(console, "info").mockImplementation((l) => logs.push(l));
});
afterEach(() => vi.restoreAllMocks());

describe("¿preguntó con aviso? Solo si el aviso es la frase final y el mensaje habla de alergias", () => {
  it("sí", () => {
    expect(preguntoConAviso(PREGUNTA)).toBe(true);
    expect(preguntoConAviso("¿Alguno de los dos tiene alguna alergia? Si no me decís nada, entiendo que ninguna.")).toBe(true);
    expect(preguntoConAviso(`¿Leo tiene alguna alergia? ${AVISO_SILENCIO}\n[[Nadie tiene alergias]]`)).toBe(true);
    expect(preguntoConAviso("<b>¿Alergias?</b> Si no me contáis nada, entiendo que ninguna 😊")).toBe(true);
    expect(preguntoConAviso("Any allergies at home? If you don't tell me anything, I'll assume none.")).toBe(true);
  });

  it("no", () => {
    expect(preguntoConAviso("¿Alguien tiene alguna alergia o intolerancia?")).toBe(false);
    // No es la cola del aviso, aunque empiece igual.
    expect(preguntoConAviso("¿Alguna alergia? Si no me dices nada, lo dejo así.")).toBe(false);
    // El aviso no es lo último: después pregunta otra cosa.
    expect(preguntoConAviso(`¿Alergias? ${AVISO_SILENCIO} ¿Y a qué hora coméis?`)).toBe(false);
    // Sin hablar de alergias.
    expect(preguntoConAviso("¿Te cambio el jueves? Si no me dices nada, entiendo que ninguna.")).toBe(false);
    expect(preguntoConAviso("")).toBe(false);
    expect(preguntoConAviso(null)).toBe(false);
  });

  it("conocimiento.md pide justo la cola que el código reconoce, también en el alta (si cambia una, falla)", async () => {
    const fs = await import("node:fs");
    const c = fs.readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(c).toContain(`«${AVISO_SILENCIO}»`);
    const alta = c.match(/«¿Quiénes coméis en casa\?[^»]*»/)?.[0]?.slice(1, -1);
    expect(preguntoConAviso(alta)).toBe(true);
  });
});

// La clase entera, no los casos: todo lo que los jueces encontraron que la
// primera versión daba por silencio. Ninguno se marca.
const CON_SENAL = [
  // en inglés
  "Leo is allergic to shrimp", "can't have almonds", "she cannot eat eggs", "nuts are a problem",
  // en castellano, sin la palabra «alergia»
  "no toma queso ni yogures", "APLV", "cebada", "camarones", "guevo", "ajonjolí", "mahonesa",
  "no tolera el tomate", "urticaria con el melón", "se pone malo con el pimiento", "le sienta fatal la leche",
  "Leo es celíaco", "Ana, el huevo", "frutos secos", "yo soy intolerante a la lactosa", "el marisco le sienta mal",
  "tiene dermatitis con el kiwi", "histamina", "le da reacción el melocotón", "se le hincha la boca con la piña",
  // afirmaciones
  "Sí", "si", "Lucas sí", "tenemos alguna", "yes", "una", "Lucas", "Ana y Lucas",
  // aplazamientos
  "espera", "un momento", "pregunto a mi mujer", "lo consulto", "no sé, ahora miro", "te lo digo luego",
  "ahora te digo", "prefiero no decirlo", "déjame que lo mire", "luego te lo digo", "wait", "let me check",
  // un no: lo guarda Lola con ajustar_alergias, por persona (ajustes.js)
  "no", "nada", "ninguna", "nadie tiene", "no tenemos", "Ana no", "[nota de voz] no, nada",
  // tercera ronda de los jueces
  "le salen ronchas", "lleva siempre el epipen", "le pusieron adrenalina", "lupino", "es celi", "she's gf",
  "el atún", "salmón no", "merluza", "gambones", "crevettes", "arachidi", "Erdnüsse", "noci", "ahora te digo algo",
  "Leo, güebo",
  // cuarta ronda: un sí o «<alguien de la casa> tiene…» en un mensaje largo
  "sí, una, la de Leo, ya la verás en la app, hazme el menú", "yes Leo has one, make the menu",
  "Sí, Leo tiene una cosa con los frutos rojos, pero hazme el menú ya",
  "tenemos un tema con Leo y el chocolate, prepárame el menú", "Leo tiene sus cosas con la comida, hazme el menú ya",
  "si puedes, hazme el menú", "DF", "pan",
];
const SIN_SENAL = [
  "Hazme el menú de la semana que viene", "¿qué cenamos hoy?", "prepárame ya el menú", "vale, gracias",
  "perfecto", "genial, ¿y para mañana?", "somos dos", "Pablo 36 y Marta 34, prepárame ya el menú",
  // el alta: «una», «uno», «tenemos» en un mensaje largo no son un sí
  "Pablo 36, Marta 34 y una niña de 2", "tenemos un hijo de 4", "somos una familia de cuatro",
];

describe("haySenal: ante la duda, no es silencio", () => {
  it.each(CON_SENAL)("«%s» → señal (no se marca)", (t) => {
    expect(haySenal(t, { nombres: NOMBRES })).toBe(true);
    expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: t, nombres: NOMBRES })).toBe(null);
  });
  it.each(SIN_SENAL)("«%s» tras el aviso, sin herramientas de salud → por_silencio", (t) => {
    expect(haySenal(t, { nombres: NOMBRES })).toBe(false);
    expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: t, nombres: NOMBRES })).toBe("por_silencio");
  });
});

describe("decidirSilencio", () => {
  it("sin aviso previo, nunca", () => {
    expect(decidirSilencio({ ultimaDeLola: "¿Alguien tiene alguna alergia?", texto: "hazme el menú" })).toBe(null);
    expect(decidirSilencio({ ultimaDeLola: null, texto: "hazme el menú" })).toBe(null);
  });
  it("(c) si en el turno Lola llamó a una herramienta que contesta, no se marca", () => {
    for (const h of HERRAMIENTAS_QUE_CONTESTAN) {
      expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: "hazme el menú", llamadas: ["ver_menu", h] }), h).toBe(null);
    }
  });
  it("con ajustar_gustos en el turno («Ana, aguacate y cítricos», «Ana, cebolla»), no se marca", () => {
    for (const texto of ["Ana, aguacate y cítricos", "Ana, cebolla"]) {
      expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto, nombres: NOMBRES, llamadas: ["ajustar_gustos"] }), texto).toBe(null);
    }
  });
  it("Lola aclara sin herramienta («¿Quieres decir que Leo es alérgico al huevo?»): no se marca", () => {
    const base = { ultimaDeLola: PREGUNTA, texto: "hazme el menú", nombres: NOMBRES };
    expect(decidirSilencio({ ...base, respuestaDeLola: "¿Quieres decir que Leo es alérgico al huevo?" })).toBe(null);
    // Habla del tema sin preguntar.
    expect(decidirSilencio({ ...base, respuestaDeLola: "Vale. Lo de las intolerancias lo vemos luego." })).toBe(null);
    // Acaba en pregunta (con botones detrás).
    expect(decidirSilencio({ ...base, respuestaDeLola: "Te lo preparo. ¿Para esta semana o la que viene?\n[[Esta]] [[La que viene]]" })).toBe(null);
    // Ha vuelto a preguntar con aviso: el que cuenta es el nuevo, en el turno siguiente.
    expect(decidirSilencio({ ...base, respuestaDeLola: `¿Y alguna alergia? ${AVISO_SILENCIO}` })).toBe(null);
    // Contesta a lo suyo: silencio.
    expect(decidirSilencio({ ...base, respuestaDeLola: "🎉 ¡Menú listo! Te lo dejo abajo." })).toBe("por_silencio");
  });
  it("las herramientas que contestan incluyen alergias, salud y gustos", () => {
    expect(HERRAMIENTAS_QUE_CONTESTAN).toEqual(expect.arrayContaining(["ajustar_alergias", "ajustar_salud", "ajustar_gustos"]));
  });
});

describe("destinatarios: solo por quien se preguntó", () => {
  const data = casa().state.data;
  it("pregunta general: todos los que faltan", () => {
    expect(destinatarios(PREGUNTA, data)).toEqual(["a", "b", "l"]);
  });
  it("pregunta por alguien: solo esa persona", () => {
    expect(destinatarios(`¿Lucas tiene alguna alergia o intolerancia? ${AVISO_SILENCIO}`, data)).toEqual(["l"]);
    expect(destinatarios(`¿Y Ana y Pablo, alguna alergia? ${AVISO_SILENCIO}`, data)).toEqual(["a", "b"]);
  });
  it("a quien ya estaba revisado no se le toca", () => {
    const d = { members: [{ id: "a", name: "Ana", alergiasRevisadas: true, allergies: [] }, { id: "b", name: "Pablo", alergiasRevisadas: false }] };
    expect(destinatarios(PREGUNTA, d)).toEqual(["b"]);
    // Nombra solo a quien ya estaba: la pregunta va por los que faltan.
    expect(destinatarios(`¿Ana tiene alguna alergia? ${AVISO_SILENCIO}`, d)).toEqual(["b"]);
  });
  it("«Lucas ya está… ¿Alguien más…?»: los que faltan, no []", () => {
    const d = { members: [{ id: "a", name: "Ana", alergiasRevisadas: false }, { id: "l", name: "Lucas", alergiasRevisadas: true, allergies: ["Huevos"] }] };
    expect(destinatarios(`Lucas ya está apuntado. ¿Alguien más tiene alguna alergia? ${AVISO_SILENCIO}`, d)).toEqual(["a"]);
  });
});

describe("apuntarSilencio", () => {
  it("marca por_silencio a los preguntados y el menú deja de esquivar los 14", async () => {
    const r = await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner" });
    expect(r).toEqual({ origen: "por_silencio", personas: 3 });
    const data = guardado.state.data;
    expect(data.members.map((m) => m.alergiasOrigen)).toEqual(["por_silencio", "por_silencio", "por_silencio"]);
    expect(alergiasParaMenu(data, data.members[0])).toEqual([]);
    expect(guardado.sinDeshacer).toBe(true);
    expect(cerrarPorEstado).toHaveBeenCalledWith("h1", data, { userId: null });
  });

  it("(d) la pregunta era por Lucas: Ana y Pablo siguen sin revisar", async () => {
    await apuntarSilencio({ householdId: "h1", ultimaDeLola: `¿Lucas tiene alguna alergia? ${AVISO_SILENCIO}`, texto: "hazme el menú", papel: "owner" });
    expect(guardado.state.data.members.map((m) => [m.id, m.alergiasRevisadas, m.alergiasOrigen ?? null]))
      .toEqual([["a", false, null], ["b", false, null], ["l", true, "por_silencio"]]);
  });

  it("deja una línea bot_alergias con el valor del vocabulario, sin datos de la familia", async () => {
    await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner", canal: "telegram" });
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0])).toEqual({ evento: "bot_alergias", accion: "apuntada", origen: "por_silencio", personas: 3, canal: "telegram" });
    expect(logs[0]).not.toMatch(/Ana|Pablo|Lucas|h1/);
  });

  it("con señal, sin aviso o con una herramienta de salud en el turno, ni lee ni escribe", async () => {
    for (const x of [
      { ultimaDeLola: PREGUNTA, texto: "no tolera el tomate" },
      { ultimaDeLola: "¿Alguna alergia?", texto: "hazme el menú" },
      { ultimaDeLola: PREGUNTA, texto: "hazme el menú", llamadas: ["ajustar_alergias"] },
    ]) expect(await apuntarSilencio({ householdId: "h1", papel: "owner", ...x })).toBe(null);
    expect(conCasa).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("un lector o alguien de fuera no cambia las alergias de la casa", async () => {
    for (const papel of ["viewer", "ajeno", undefined]) {
      expect(await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel })).toBe(null);
    }
    expect(conCasa).not.toHaveBeenCalled();
  });

  it("si ya no queda nadie sin revisar, no escribe ni deja línea", async () => {
    conCasa.mockImplementation(async (_h, cambiar) => {
      const c = casa();
      c.state.data.members.forEach((m) => { m.alergiasRevisadas = true; });
      const r = await cambiar(c);
      return r ? { ok: true } : { ok: true, sinCambios: true };
    });
    expect(await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner" })).toBe(null);
    expect(logs).toEqual([]);
  });

  it("si la base falla, sigue el turno (null) y no revienta", async () => {
    conCasa.mockRejectedValue(new Error("caída"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner" })).toBe(null);
  });
});

describe("el recordatorio del primer menú", () => {
  it("se añade al final del texto, en su idioma", () => {
    expect(conRecordatorio("🎉 Menú listo.", true)).toBe(`🎉 Menú listo.\n\n${RECORDATORIO_SILENCIO.es}`);
    expect(conRecordatorio("Menu ready.", true, "en")).toBe(`Menu ready.\n\n${RECORDATORIO_SILENCIO.en}`);
    expect(conRecordatorio("🎉 Menú listo.", false)).toBe("🎉 Menú listo.");
  });
});
