import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { rowsFromBody, descartesFromBody } from "./track.js";

const NOW = Date.parse("2026-09-11T10:00:00Z");
const anonId = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";

describe("rowsFromBody", () => {
  it("rejects a missing or malformed anonId", () => {
    expect(rowsFromBody({ events: [{ event: "dish_viewed" }] }, NOW)).toBeNull();
    expect(rowsFromBody({ anonId: "x'; drop", events: [{ event: "dish_viewed" }] }, NOW)).toBeNull();
  });

  it("rejects empty or oversized batches", () => {
    expect(rowsFromBody({ anonId, events: [] }, NOW)).toBeNull();
    const many = Array.from({ length: 21 }, () => ({ event: "dish_viewed" }));
    expect(rowsFromBody({ anonId, events: many }, NOW)).toBeNull();
  });

  it("never sets a user id, tags anon_id and drops events with a bad name", () => {
    const rows = rowsFromBody(
      {
        anonId,
        events: [
          { event: "generation_failed", screen: "menu", metadata: { error: "x", user_id: "someone" }, created_at: "2026-09-11T09:59:55Z" },
          { event: "Bad Name!" },
        ],
      },
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: null,
      event: "generation_failed",
      screen: "menu",
      created_at: "2026-09-11T09:59:55.000Z",
    });
    expect(rows[0].metadata).toMatchObject({ error: "x", anon_id: anonId });
  });

  it("replaces oversized metadata and implausible timestamps", () => {
    const [row] = rowsFromBody(
      { anonId, events: [{ event: "menu_generated", metadata: { blob: "a".repeat(5000) }, created_at: "1999-01-01T00:00:00Z" }] },
      NOW,
    );
    expect(row.metadata).toEqual({ truncated: true, anon_id: anonId });
    expect(row.created_at).toBe(new Date(NOW).toISOString());
  });
});

describe("track handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /**
   * El entorno de Supabase, con la MISMA precedencia que lee el handler.
   *
   * Hace falta simular los cuatro nombres, no solo dos. El handler prefiere
   * `VITE_SUPABASE_URL` sobre `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
   * sobre `SUPABASE_SECRET_KEY`, y esta prueba solo pisaba los de menor
   * prioridad. En integracion continua daba igual, porque alli no hay ninguno
   * definido y ganaban los simulados; en el portatil de cualquiera que tenga
   * un `.env.local` de verdad —que define `VITE_SUPABASE_URL`— el handler se
   * iba al proyecto REAL y la prueba fallaba siempre.
   *
   * Vivio meses en rojo por eso, y una prueba que siempre falla deja de
   * mirarse: es peor que no tenerla.
   */
  function stubSupabaseEnv() {
    vi.stubEnv("VITE_SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_abc");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_abc");
  }

  function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    res.end = () => res;
    res.setHeader = () => {};
    return res;
  }

  it("inserts with the secret key only in apikey when it is not a JWT", async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const res = mockRes();
    await handler({ method: "POST", headers: {}, body: { anonId, events: [{ event: "dish_viewed" }] } }, res);

    expect(res.statusCode).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://db.example.co/rest/v1/user_events");
    expect(init.headers.apikey).toBe("sb_secret_abc");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)[0].user_id).toBeNull();
  });

  it("returns 400 for an invalid batch without touching the database", async () => {
    stubSupabaseEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mockRes();
    await handler({ method: "POST", headers: {}, body: { events: [] } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("descartes de invitados", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function entorno() {
    vi.stubEnv("VITE_SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_abc");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_abc");
  }
  function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    res.end = () => res;
    res.setHeader = () => {};
    return res;
  }

  it("descartesFromBody: sin anonId válido, sin lista o por encima del tope no hay ninguno", () => {
    expect(descartesFromBody({ descartes: [{ receta_id: "carnes_146", alcance: "plato" }] })).toEqual([]);
    expect(descartesFromBody({ anonId: "x'; drop", descartes: [{ receta_id: "carnes_146", alcance: "plato" }] })).toEqual([]);
    expect(descartesFromBody({ anonId, descartes: [] })).toEqual([]);
    const muchos = Array.from({ length: 61 }, (_, i) => ({ receta_id: `r_${i}`, alcance: "menu" }));
    expect(descartesFromBody({ anonId, descartes: muchos })).toEqual([]);
  });

  it("descartesFromBody: la fila sale de lo validado (sin usuario ni casa) y salta lo raro", () => {
    const rows = descartesFromBody({
      anonId,
      descartes: [
        { receta_id: "carnes_146", alcance: "dia", user_id: "alguien", household_id: "otra-casa" },
        { receta_id: "con espacios", alcance: "dia" },
        { receta_id: "pescados_7", alcance: "semana" },
        { receta_id: 42, alcance: "plato" },
        null,
      ],
    });
    expect(rows).toEqual([
      { user_id: null, household_id: null, anon_id: anonId, receta_id: "carnes_146", alcance: "dia" },
    ]);
  });

  it("guarda los descartes de un invitado en receta_descartes sin tocar user_events", async () => {
    entorno();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler({ method: "POST", headers: {}, body: { anonId, descartes: [{ receta_id: "carnes_146", alcance: "plato" }] } }, res);
    expect(res.statusCode).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://db.example.co/rest/v1/receta_descartes");
    expect(JSON.parse(init.body)).toEqual([
      { user_id: null, household_id: null, anon_id: anonId, receta_id: "carnes_146", alcance: "plato" },
    ]);
  });

  it("plan B: si la tabla de descartes no existe, no falla la petición del invitado", async () => {
    entorno();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "relation does not exist" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();
    await handler({ method: "POST", headers: {}, body: { anonId, descartes: [{ receta_id: "carnes_146", alcance: "menu" }] } }, res);
    expect(res.statusCode).toBe(204);
  });

  it("eventos y descartes en la misma petición van cada uno a su tabla", async () => {
    entorno();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      { method: "POST", headers: {}, body: { anonId, events: [{ event: "dish_viewed" }], descartes: [{ receta_id: "carnes_146", alcance: "dia" }] } },
      res,
    );
    expect(res.statusCode).toBe(204);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://db.example.co/rest/v1/user_events",
      "https://db.example.co/rest/v1/receta_descartes",
    ]);
  });
});
