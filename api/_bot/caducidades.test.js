/**
 * Lo que caduca tiene dueño (#958, raíz 4): una lista cerrada, y cada cosa de
 * barrido con su función.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));

const {
  COSAS_QUE_CADUCAN, CADUCA, EFECTOS, QUIENES, BARRIDOS, vigente, estadosVencidos, avisoDeCola, barrer, claveDeEstadoVencido,
} = await import("./caducidades.js");

const H = 3600000;

describe("la lista de lo que caduca", () => {
  it("es cerrada: cada cosa con quién la caduca y qué pasa", () => {
    expect(Object.values(CADUCA).sort()).toEqual(Object.keys(COSAS_QUE_CADUCAN).sort());
    for (const def of Object.values(COSAS_QUE_CADUCAN)) {
      expect(QUIENES).toContain(def.quien);
      expect(EFECTOS).toContain(def.efecto);
    }
  });

  it("lo de barrido tiene su función, y solo eso", () => {
    const deBarrido = Object.entries(COSAS_QUE_CADUCAN).filter(([, d]) => d.quien === "barrido").map(([k]) => k).sort();
    expect(Object.keys(BARRIDOS).sort()).toEqual(deBarrido);
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
    expect(v[0].texto).toMatch(/30\/09/);
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
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 1, cerradas: 0 });
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
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: "pregunta:p1:caduca-pregnancy-2026-09-30" }];
      return [];
    });
    db.update.mockResolvedValue([{}]);
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 0, cerradas: 1 });
    expect(db.update.mock.calls[0][2]).toMatchObject({ status: "hecha" });
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
