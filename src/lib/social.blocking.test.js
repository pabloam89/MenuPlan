import { describe, it, expect, vi, beforeEach } from "vitest";

// social.js hace no-op en todo si `supabase` es falsy (mismo patrón que el
// resto de módulos de sync), que es lo único que se ejerce en la suite normal
// (sin VITE_SUPABASE_URL configurada). Esto mockea el cliente para probar de
// verdad qué tabla, qué RPC y qué argumentos manda cada función de bloqueo y
// reporte — sin tocar un proyecto real.
vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import {
  blockUser, unblockUser, loadBlockedIds, reportContent, loadFeed, loadWeeklyMenus,
} from "./social.js";

function makeQuery(result, log, table) {
  const q = {
    select: (...a) => (log.push({ table, op: "select", args: a }), q),
    insert: (...a) => (log.push({ table, op: "insert", args: a }), q),
    eq: (...a) => (log.push({ table, op: "eq", args: a }), q),
    neq: (...a) => (log.push({ table, op: "neq", args: a }), q),
    order: (...a) => (log.push({ table, op: "order", args: a }), q),
    limit: (...a) => (log.push({ table, op: "limit", args: a }), q),
    lt: (...a) => (log.push({ table, op: "lt", args: a }), q),
    in: (...a) => (log.push({ table, op: "in", args: a }), q),
    not: (...a) => (log.push({ table, op: "not", args: a }), q),
    lte: (...a) => (log.push({ table, op: "lte", args: a }), q),
    gte: (...a) => (log.push({ table, op: "gte", args: a }), q),
    // loadWeeklyMenus filtra el rango con .or() para dejar pasar tambien los
    // menus sin fechas (ver el comentario alli): sin esto en el mock, el test
    // fallaba por el doble de la mock y no por el codigo.
    or: (...a) => (log.push({ table, op: "or", args: a }), q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function mockClient({ tables = {}, rpc = {} } = {}) {
  const log = [];
  const remaining = { ...tables };
  const from = (table) => {
    const queue = remaining[table];
    const result = Array.isArray(queue) && queue.length ? queue.shift() : { data: null, error: null };
    return makeQuery(result, log, table);
  };
  const rpcFn = vi.fn((name, args) => {
    log.push({ rpc: name, args });
    const result = rpc[name] ?? { data: null, error: null };
    return Promise.resolve(result);
  });
  return { from, rpc: rpcFn, log };
}

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

describe("bloquear", () => {
  it("blockUser llama a la RPC block_user con el objetivo", async () => {
    const client = mockClient({ rpc: { block_user: { data: null, error: null } } });
    Object.assign(supabase, client);
    const ok = await blockUser("me", "them");
    expect(ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("block_user", { p_target: "them" });
  });

  it("unblockUser llama a la RPC unblock_user", async () => {
    const client = mockClient({ rpc: { unblock_user: { data: null, error: null } } });
    Object.assign(supabase, client);
    const ok = await unblockUser("me", "them");
    expect(ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("unblock_user", { p_target: "them" });
  });

  it("un error de red en blockUser devuelve false sin reventar", async () => {
    const client = mockClient({ rpc: { block_user: { data: null, error: { message: "network" } } } });
    Object.assign(supabase, client);
    expect(await blockUser("me", "them")).toBe(false);
  });

  it("loadBlockedIds lee blocked_users filtrado por blocker_id", async () => {
    const client = mockClient({
      tables: { blocked_users: [{ data: [{ blocked_id: "a" }, { blocked_id: "b" }], error: null }] },
    });
    Object.assign(supabase, client);
    expect(await loadBlockedIds("me")).toEqual(["a", "b"]);
    expect(client.log.some((l) => l.table === "blocked_users" && l.op === "select")).toBe(true);
  });

  it("loadFeed no enseña recetas ni menús de gente bloqueada", async () => {
    const client = mockClient({
      tables: {
        blocked_users: [{ data: [{ blocked_id: "villano" }], error: null }],
        user_recipes: [{
          data: [
            { id: "r1", owner_id: "villano", created_at: "2026-01-02" },
            { id: "r2", owner_id: "amigo", created_at: "2026-01-01" },
          ],
          error: null,
        }],
        shared_menus: [{
          data: [
            { id: "m1", owner_id: "villano", created_at: "2026-01-03" },
            { id: "m2", owner_id: "amigo", created_at: "2026-01-01" },
          ],
          error: null,
        }],
      },
    });
    Object.assign(supabase, client);
    const { items } = await loadFeed({ viewerId: "me" });
    expect(items.map((i) => i.ownerId)).not.toContain("villano");
    // Solo recetas: los menus viven en el carrusel, no en el rio.
    expect(items.map((i) => i.id)).toEqual(["r2"]);
  });

  it("sin viewerId (sin sesión) no filtra por bloqueo — pero tampoco lo pide", async () => {
    const client = mockClient({
      tables: {
        user_recipes: [{ data: [{ id: "r1", owner_id: "x", created_at: "2026-01-01" }], error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    const { items } = await loadFeed();
    expect(items).toHaveLength(1);
    expect(client.log.some((l) => l.table === "blocked_users")).toBe(false);
  });
});

describe("reportar", () => {
  it("reportContent inserta con el tipo, el motivo y la nota recortada", async () => {
    const client = mockClient({ tables: { content_reports: [{ data: null, error: null }] } });
    Object.assign(supabase, client);
    const ok = await reportContent("me", {
      targetType: "recipe", targetId: "r1", reason: "spam", note: "  " + "x".repeat(600),
    });
    expect(ok).toBe(true);
    const insert = client.log.find((l) => l.table === "content_reports" && l.op === "insert");
    expect(insert.args[0]).toMatchObject({ reporter_id: "me", target_type: "recipe", target_id: "r1", reason: "spam" });
    expect(insert.args[0].note.length).toBe(500);
  });

  it("nota vacía se guarda como null, no como cadena vacía", async () => {
    const client = mockClient({ tables: { content_reports: [{ data: null, error: null }] } });
    Object.assign(supabase, client);
    await reportContent("me", { targetType: "menu", targetId: "m1", reason: "other", note: "   " });
    const insert = client.log.find((l) => l.table === "content_reports");
    expect(insert.args[0].note).toBeNull();
  });

  it("sin motivo no llega a mandar nada", async () => {
    const client = mockClient();
    Object.assign(supabase, client);
    expect(await reportContent("me", { targetType: "recipe", targetId: "r1", reason: null })).toBe(false);
    expect(client.log).toHaveLength(0);
  });
});

// ── Corriente del feed y paginacion ─────────────────────────────────────────
//
// Las dos reglas que mas facil se rompen al tocar aqui: que "Siguiendo" NO
// caiga en silencio a lo publico (si no, seguir a alguien deja de significar
// nada) y que la paginacion vaya por fecha y no por posicion.

describe("loadFeed: siguiendo y paginacion", () => {
  it("sin seguir a nadie, Siguiendo devuelve vacio en vez de caer a lo publico", async () => {
    const client = mockClient({ tables: {} });
    Object.assign(supabase, client);
    const res = await loadFeed({ viewerId: "me", scope: "following", followingIds: [] });
    expect(res.items).toEqual([]);
    expect(res.empty).toBe("following");
    // Y ni siquiera pregunta por contenido: no hay a quien.
    expect(client.log.some((l) => l.table === "user_recipes")).toBe(false);
  });

  it("Siguiendo acota a los autores que sigues", async () => {
    const client = mockClient({
      tables: {
        user_recipes: [{ data: [{ id: "r1", owner_id: "amigo", created_at: "2026-01-02" }], error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    await loadFeed({ viewerId: "me", scope: "following", followingIds: ["amigo"] });
    const inCall = client.log.find((l) => l.op === "in");
    expect(inCall.args[0]).toBe("owner_id");
    expect(inCall.args[1]).toEqual(["amigo"]);
  });

  it("con cursor pide lo ANTERIOR a esa fecha, no un salto por posicion", async () => {
    const client = mockClient({
      tables: {
        user_recipes: [{ data: [], error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    await loadFeed({ viewerId: null, cursor: "2026-01-05" });
    const lt = client.log.filter((l) => l.op === "lt");
    expect(lt).toHaveLength(1);
    expect(lt[0].args).toEqual(["created_at", "2026-01-05"]);
  });

  it("devuelve como cursor la fecha del ultimo entregado", async () => {
    const many = (n, pref, day) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${pref}${i}`, owner_id: "x",
        created_at: `2026-01-${String(day - i).padStart(2, "0")}`,
      }));
    const client = mockClient({
      tables: {
        user_recipes: [{ data: many(20, "r", 20), error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    const res = await loadFeed({ viewerId: null });
    expect(res.items).toHaveLength(20);
    expect(res.cursor).toBe(res.items[res.items.length - 1].createdAt);
    expect(res.done).toBe(false);
  });
});

describe("loadFeed: Descubrir", () => {
  it("excluye a quien ya sigues y a ti mismo — si no, las dos pestañas dirian lo mismo", async () => {
    const client = mockClient({
      tables: {
        user_recipes: [{ data: [], error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    await loadFeed({ viewerId: "yo", scope: "all", followingIds: ["amigo"] });
    const not = client.log.find((l) => l.op === "not");
    expect(not.args[0]).toBe("owner_id");
    expect(not.args[1]).toBe("in");
    expect(not.args[2]).toContain("amigo");
    expect(not.args[2]).toContain("yo");
  });

  it("sin sesion no excluye a nadie: no hay a quien seguir ni quien seas", async () => {
    const client = mockClient({
      tables: {
        user_recipes: [{ data: [], error: null }],
        shared_menus: [{ data: [], error: null }],
      },
    });
    Object.assign(supabase, client);
    await loadFeed({ scope: "all" });
    expect(client.log.some((l) => l.op === "not")).toBe(false);
  });
});

describe("loadWeeklyMenus: la fila de arriba obedece la pestaña", () => {
  it("en Siguiendo solo trae menus de tus seguidos", async () => {
    const client = mockClient({ tables: { shared_menus: [{ data: [], error: null }] } });
    Object.assign(supabase, client);
    await loadWeeklyMenus({ viewerId: "yo", scope: "following", followingIds: ["amigo"] });
    const inCall = client.log.find((l) => l.op === "in");
    expect(inCall.args).toEqual(["owner_id", ["amigo"]]);
  });

  it("en Siguiendo sin seguidos no pregunta nada", async () => {
    const client = mockClient({ tables: { shared_menus: [{ data: [], error: null }] } });
    Object.assign(supabase, client);
    const rows = await loadWeeklyMenus({ viewerId: "yo", scope: "following", followingIds: [] });
    expect(rows).toEqual([]);
    expect(client.log.some((l) => l.table === "shared_menus")).toBe(false);
  });

  it("en Descubrir no acota por seguidos", async () => {
    const client = mockClient({ tables: { shared_menus: [{ data: [], error: null }] } });
    Object.assign(supabase, client);
    await loadWeeklyMenus({ viewerId: "yo", scope: "all" });
    expect(client.log.some((l) => l.op === "in")).toBe(false);
  });
});
