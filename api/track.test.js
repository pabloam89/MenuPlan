import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { rowsFromBody } from "./track.js";

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

  function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    res.end = () => res;
    res.setHeader = () => {};
    return res;
  }

  it("inserts with the secret key only in apikey when it is not a JWT", async () => {
    vi.stubEnv("SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_abc");
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
    vi.stubEnv("SUPABASE_URL", "https://db.example.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_abc");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mockRes();
    await handler({ method: "POST", headers: {}, body: { events: [] } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
