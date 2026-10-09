/**
 * Alergias «por silencio» (#229): si Lola preguntó AVISANDO («si no me dices
 * nada, entiendo que ninguna») y el mensaje siguiente no dice ninguna alergia,
 * el código —no el modelo— apunta «ninguna» a los que faltaban, marcado como
 * por silencio, y deja una línea de log que se puede contar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./casa.js", () => ({ conCasa: vi.fn() }));
vi.mock("./tareas.js", () => ({ cerrarPorEstado: vi.fn(async () => 0) }));

const { conCasa } = await import("./casa.js");
const { cerrarPorEstado } = await import("./tareas.js");
const {
  AVISO_SILENCIO, preguntoConAviso, respuestaAlAviso, decidirSilencio, apuntarSilencio, conRecordatorio, RECORDATORIO_SILENCIO,
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
      ],
    },
  },
});

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

describe("¿preguntó con aviso?", () => {
  it("reconoce la frase del aviso junto a la pregunta de alergias", () => {
    expect(preguntoConAviso(PREGUNTA)).toBe(true);
    expect(preguntoConAviso("¿Quiénes coméis en casa? Nombres, edades y si alguien tiene alguna alergia. Si no me decís nada, entiendo que ninguna.")).toBe(true);
    // La del alta, tal como la pide conocimiento.md.
    expect(preguntoConAviso("¿Quiénes coméis en casa? Nombres, edades (así ajusto las cantidades) y si alguien tiene alguna alergia (si no me dices nada, entiendo que ninguna). Si te es más fácil, mándamelo en un audio.")).toBe(true);
    expect(preguntoConAviso("Any allergies or intolerances at home? If you don't tell me anything, I'll assume none.")).toBe(true);
  });

  it("conocimiento.md pide justo la frase que el código reconoce (si cambia una, falla)", async () => {
    const fs = await import("node:fs");
    const c = fs.readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(c).toContain(`«${AVISO_SILENCIO}»`);
    const alta = c.match(/«¿Quiénes coméis en casa\?[^»]*»/)?.[0];
    expect(preguntoConAviso(alta)).toBe(true);
  });

  it("sin el aviso, no", () => {
    expect(preguntoConAviso("¿Alguien tiene alguna alergia o intolerancia?")).toBe(false);
    expect(preguntoConAviso("Si no me dices nada, te lo cambio el jueves.")).toBe(false);
    expect(preguntoConAviso("")).toBe(false);
    expect(preguntoConAviso(null)).toBe(false);
  });
});

describe("qué contestaron", () => {
  it("una alergia o un alérgeno: no es silencio", () => {
    for (const t of ["Leo es celíaco", "Ana, el huevo", "frutos secos", "yo soy intolerante a la lactosa", "el marisco le sienta mal"]) {
      expect(respuestaAlAviso(t), t).toBe("alergia");
    }
  });
  it("aplazar o no querer decirlo: no es silencio", () => {
    for (const t of ["ahora te digo", "luego te lo digo", "prefiero no decirlo", "déjame que lo mire"]) {
      expect(respuestaAlAviso(t), t).toBe("aplaza");
    }
  });
  it("un no a secas es la respuesta dicha", () => {
    for (const t of ["no", "Nada", "ninguna", "nadie", "no, ninguna", "Nada, tranquila", "[nota de voz] no, nada"]) {
      expect(respuestaAlAviso(t), t).toBe("no");
    }
  });
  it("otra cosa es silencio", () => {
    for (const t of ["Hazme el menú de esta semana", "somos dos", "¿qué cenamos hoy?"]) {
      expect(respuestaAlAviso(t), t).toBe("otra");
    }
  });
});

describe("decidirSilencio", () => {
  it("(a) tras la pregunta con aviso, otra cosa → por_silencio", () => {
    expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: "hazme el menú" })).toBe("por_silencio");
  });
  it("tras la pregunta con aviso, un no → dicha", () => {
    expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: "no" })).toBe("dicha");
  });
  it("(b) sin aviso previo no se marca nada", () => {
    expect(decidirSilencio({ ultimaDeLola: "¿Alguien tiene alguna alergia?", texto: "hazme el menú" })).toBe(null);
    expect(decidirSilencio({ ultimaDeLola: null, texto: "hazme el menú" })).toBe(null);
  });
  it("(c) si dicen una alergia, la apunta Lola como siempre: aquí nada", () => {
    expect(decidirSilencio({ ultimaDeLola: PREGUNTA, texto: "Leo es alérgico al huevo" })).toBe(null);
  });
});

describe("apuntarSilencio", () => {
  it("(a) marca por_silencio a los sin revisar y el menú deja de esquivar los 14", async () => {
    const r = await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner" });
    expect(r).toEqual({ origen: "por_silencio", personas: 2 });
    const data = guardado.state.data;
    expect(data.members.map((m) => m.alergiasOrigen)).toEqual(["por_silencio", "por_silencio"]);
    expect(alergiasParaMenu(data, data.members[0])).toEqual([]);
    expect(guardado.sinDeshacer).toBe(true);
    expect(cerrarPorEstado).toHaveBeenCalledWith("h1", data, { userId: null });
  });

  it("(e) deja una línea bot_alergias con el valor del vocabulario, sin datos de la familia", async () => {
    await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner", canal: "telegram" });
    expect(logs).toHaveLength(1);
    const linea = JSON.parse(logs[0]);
    expect(linea).toEqual({ evento: "bot_alergias", accion: "apuntada", origen: "por_silencio", personas: 2, canal: "telegram" });
    expect(logs[0]).not.toMatch(/Ana|Pablo|h1/);
  });

  it("un no a secas se apunta como dicho, sin marca", async () => {
    const r = await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "nada", papel: "editor" });
    expect(r.origen).toBe("dicha");
    expect(guardado.state.data.members.map((m) => m.alergiasOrigen)).toEqual([undefined, undefined]);
    expect(guardado.state.data.allergiesReviewed).toBe(true);
  });

  it("(b) sin aviso previo no lee ni escribe la casa", async () => {
    const r = await apuntarSilencio({ householdId: "h1", ultimaDeLola: "¿Alguna alergia?", texto: "hazme el menú", papel: "owner" });
    expect(r).toBe(null);
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await apuntarSilencio({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner" })).toBe(null);
  });
});

describe("(d) el recordatorio del primer menú", () => {
  it("se añade al final del texto, en su idioma", () => {
    expect(conRecordatorio("🎉 Menú listo.", true)).toBe(`🎉 Menú listo.\n\n${RECORDATORIO_SILENCIO.es}`);
    expect(conRecordatorio("Menu ready.", true, "en")).toBe(`Menu ready.\n\n${RECORDATORIO_SILENCIO.en}`);
    expect(conRecordatorio("🎉 Menú listo.", false)).toBe("🎉 Menú listo.");
  });
});
