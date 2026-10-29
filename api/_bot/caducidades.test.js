/**
 * Lo que caduca tiene dueño (#958, raíz 4): una lista cerrada, y cada cosa de
 * barrido con su función.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));

const {
  COSAS_QUE_CADUCAN, CADUCA, EFECTOS, QUIENES, BARRIDOS, vigente, estadosVencidos, avisoDeCola, claveDeEstadoVencido,
  barridosQueFaltan, PATRON_VENCIDO, barrer: barrerReal,
} = await import("./caducidades.js");

const H = 3600000;
// La cadencia del cron, de su único sitio (la misma que pasa api/bot/recordatorios.js).
const { CADA_MS, HORARIO_CRON, CADA_MINUTOS } = await import("./cadencia.js");
const barrer = (o) => barrerReal({ cadaMs: CADA_MS, ...o });

/** Lo que avisarFallo escribe por consola, como objetos. */
function avisos(fn) {
  const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    fn();
    return espia.mock.calls.map(([l]) => JSON.parse(l));
  } finally {
    espia.mockRestore();
  }
}

describe("la lista de lo que caduca", () => {
  it("es cerrada: cada cosa con quién la caduca y qué pasa", () => {
    expect(Object.values(CADUCA).sort()).toEqual(Object.keys(COSAS_QUE_CADUCAN).sort());
    for (const def of Object.values(COSAS_QUE_CADUCAN)) {
      expect(QUIENES).toContain(def.quien);
      expect(EFECTOS).toContain(def.efecto);
    }
  });

  it("lo de barrido tiene su función, y solo eso", () => {
    expect(barridosQueFaltan()).toEqual({ faltan: [], sobran: [] });
  });

  it("la cadencia vive en un sitio: quien la usa la lee de cadencia.js y nadie la copia (#974, C8/C14)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const raiz = new URL("../../", import.meta.url);
    const leer = (f) => readFileSync(new URL(f, raiz), "utf8");
    expect(HORARIO_CRON).toBe(`*/${CADA_MINUTOS} * * * *`);
    // Los que la usan: el script que programa el job, el endpoint y la simulación del cron.
    const usan = ["scripts/bot-cron.mjs", "api/bot/recordatorios.js", "api/_bot/recordatoriosHora.test.js"];
    for (const f of usan) {
      const texto = leer(f);
      expect(texto, f).toMatch(/from "\.\.?\/(_bot\/|api\/_bot\/)?cadencia\.js"|import\("\.\/cadencia\.js"\)/);
      expect(texto, f).not.toMatch(/\d+ \* 60000/);
    }
    // Y en todo el bot (y el script del job), ni la expresión de pg_cron ni «cada N min» a mano.
    const delBot = ["api/_bot", "api/bot"].flatMap((d) => readdirSync(new URL(`${d}/`, raiz)).filter((n) => /\.m?js$/.test(n)).map((n) => `${d}/${n}`));
    const copias = [...delBot, "scripts/bot-cron.mjs"]
      .filter((f) => f !== "api/_bot/cadencia.js")
      .filter((f) => /\*\/\d+ \* \* \* \*|cada \d+ min/i.test(leer(f)));
    expect(copias).toEqual([]);
  });

  it("y la comprobación salta con una lista mala (#964, C17)", () => {
    // Una cosa nueva de barrido sin función (lo que pasaría al añadir la dieta
    // blanda olvidando su barrido), y una función de algo que no es de barrido.
    const cosas = { ...COSAS_QUE_CADUCAN, dieta_nueva: { quien: "barrido", efecto: "preguntar", que: "prueba" } };
    const barridos = { ...BARRIDOS, [CADUCA.PROPUESTA]: async () => ({}) };
    expect(barridosQueFaltan(cosas, barridos)).toEqual({ faltan: ["dieta_nueva"], sobran: [CADUCA.PROPUESTA] });
  });

  it("el cron no se barre sin decir su cadencia", async () => {
    await expect(barrerReal({ ahoraMs: Date.parse("2026-11-05T09:01:00Z") })).rejects.toThrow(/cadaMs/);
  });

  it("una cosa que no está en la lista no se caduca a ojo", () => {
    expect(() => vigente("dieta_inventada", new Date().toISOString())).toThrow();
  });
});

describe("vigente", () => {
  const ahora = Date.parse("2026-10-29T12:00:00Z");
  it("«¿comida o cena?» vale un rato, no al día siguiente", () => {
    expect(vigente(CADUCA.PROPUESTA, new Date(ahora - 10 * 60000).toISOString(), ahora)).toBe(true);
    expect(vigente(CADUCA.PROPUESTA, new Date(ahora - 24 * H).toISOString(), ahora)).toBe(false);
  });
  it("sin fecha, como antes", () => {
    expect(vigente(CADUCA.TAREAS_DEL_MENSAJE, null, ahora)).toBe(true);
  });
  it("una fecha ilegible vale como antes, pero se avisa (#964, C5)", () => {
    let r;
    const dichos = avisos(() => { r = vigente(CADUCA.PROPUESTA, "ayer por la tarde", ahora); });
    expect(r).toBe(true);
    expect(dichos).toMatchObject([{ evento: "bot_fallo", donde: "caducidades_fecha_ilegible", grave: false }]);
  });
});

describe("estados de salud con fecha pasada", () => {
  const members = [
    { id: "p1", name: "Ana", dietaryStates: ["pregnancy"], dietaryStatesMeta: { pregnancy: { hasta: "2026-09-30" } } },
    { id: "p2", name: "Bea", dietaryStates: ["lactation"], dietaryStatesMeta: { lactation: { hasta: "2026-12-01" } } },
    // Quitado ya el estado: lo que quede en meta no cuenta.
    { id: "p3", name: "Cris", dietaryStates: [], dietaryStatesMeta: { pregnancy: { hasta: "2026-01-01" } } },
  ];
  it("solo los vencidos y aún puestos, con una pregunta (no se borran)", () => {
    const v = estadosVencidos(members, "2026-11-05");
    expect(v.map((x) => [x.personaId, x.estado])).toEqual([["p1", "pregnancy"]]);
    expect(v[0].clave).toBe(claveDeEstadoVencido("p1", "pregnancy", "2026-09-30"));
    expect(v[0].texto).toMatch(/2026-09-30/);
  });

  it("una lista de personas que no es una lista se avisa, no se da por vacía (#964, C5)", () => {
    let v;
    const dichos = avisos(() => { v = estadosVencidos({ p1: members[0] }, "2026-11-05"); });
    // null, no []: «no he podido leerla» no es «no hay nadie».
    expect(v).toBeNull();
    expect(dichos).toMatchObject([{ donde: "caducidades_personas_ilegibles" }]);
    // Sin personas (null) no es un fallo.
    expect(avisos(() => estadosVencidos(null, "2026-11-05"))).toEqual([]);
  });

  it("el patrón de las claves sale de la misma función que las claves (#964, C8)", () => {
    const como = new RegExp(`^${PATRON_VENCIDO.split("*").map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    expect(claveDeEstadoVencido("p1", "pregnancy", "2026-09-30")).toMatch(como);
  });

  it("el barrido abre la pregunta una sola vez y en el privado", async () => {
    db.select.mockReset(); db.insert.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "household_state") return [{ household_id: "h1", members }];
      if (tabla === "bot_chats") return [{ channel: "telegram", chat_id: "-100", kind: "group" }, { channel: "telegram", chat_id: "7", kind: "private" }];
      if (tabla === "bot_tareas" && filtro.includes("clave=eq.")) return [];
      return [];
    });
    db.insert.mockResolvedValue([{}]);
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:01:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 1, cerradas: 0, sinLeer: 0 });
    const [tabla, [fila]] = db.insert.mock.calls[0];
    expect(tabla).toBe("bot_tareas");
    expect(fila).toMatchObject({ chat_id: "7", kind: "pregunta", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") });
    // Lo que ya se preguntó no se repite.
    db.insert.mockClear();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "household_state") return [{ household_id: "h1", members }];
      if (tabla === "bot_chats") return [{ channel: "telegram", chat_id: "7", kind: "private" }];
      if (tabla === "bot_tareas" && filtro.includes("clave=eq.")) return [{ id: "t1" }];
      return [];
    });
    await barrer({ ahoraMs: Date.parse("2026-11-05T10:02:00Z") });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("si le dieron fecha nueva, la pregunta abierta se cierra", async () => {
    db.select.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "household_state") return [{ household_id: "h1", members: [] }];
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") }];
      return [];
    });
    db.update.mockResolvedValue([{}]);
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 0, cerradas: 1, sinLeer: 0 });
    expect(db.update.mock.calls[0][2]).toMatchObject({ status: "hecha" });
  });

  it("si la casa no se puede leer, sus preguntas abiertas no se cierran (#974, C5)", async () => {
    db.select.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "household_state") return [{ household_id: "h1", members: { roto: true } }];
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") }];
      return [];
    });
    let r;
    // El aviso de la casa ilegible se mira en el test de estadosVencidos; aquí, callado.
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    } finally {
      espia.mockRestore();
    }
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 0, cerradas: 0, sinLeer: 1 });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("la cola sin dueño", () => {
  beforeEach(() => { db.select.mockReset(); db.update.mockReset(); });

  it("lo que nadie tomó se toma y se avisa al chat, una vez", async () => {
    const ahoraMs = Date.parse("2026-11-05T09:33:00Z");
    const viejo = new Date(ahoraMs - 20 * 60000).toISOString();
    db.select.mockImplementation(async (tabla) => (tabla === "bot_cola" ? [{ id: 1 }, { id: 2 }] : []));
    db.update.mockResolvedValue([
      { id: 1, channel: "telegram", chat_id: "7", created_at: viejo, item: { texto: "cambia la cena" } },
      { id: 2, channel: "telegram", chat_id: "7", created_at: viejo, item: { texto: "la del jueves" } },
    ]);
    const enviar = vi.fn(async () => ({}));
    const r = await barrer({ ahoraMs, enviar });
    expect(r[CADUCA.COLA]).toEqual({ tomados: 2, avisados: 1 });
    expect(db.update.mock.calls[0][1]).toMatch(/tomado_at=is\.null/);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][1]).toMatch(/la del jueves/);
    // El de salud no corre fuera de su hora.
    expect(r[CADUCA.ESTADO_SALUD]).toBeUndefined();
  });

  it("lo de hace más de un día se toma sin avisar", async () => {
    const ahoraMs = Date.parse("2026-11-05T09:33:00Z");
    db.select.mockResolvedValue([{ id: 1 }]);
    db.update.mockResolvedValue([{ id: 1, channel: "telegram", chat_id: "7", created_at: new Date(ahoraMs - 3 * 24 * H).toISOString(), item: { texto: "hola" } }]);
    const enviar = vi.fn();
    expect((await barrer({ ahoraMs, enviar }))[CADUCA.COLA]).toEqual({ tomados: 1, avisados: 0 });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("el aviso sin texto no se manda", () => {
    expect(avisoDeCola([{ texto: "" }])).toBeNull();
  });
});
