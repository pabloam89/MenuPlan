// El error de PostgREST que sale de db.js no lleva details ni hint: el DETAIL
// de Postgres puede traer la fila (un token de enlace) y acaba en los logs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { select, resumenDeError } from "./db.js";

const FALLO = {
  code: "23505",
  message: "duplicate key value violates unique constraint \"recipe_share_links_pkey\"",
  details: "Key (token)=(TOKEN-SECRETO-123) already exists.",
  hint: "pista con TOKEN-SECRETO-123",
};

describe("los errores de PostgREST", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(FALLO), { status: 409 })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("guardan code y message, y no details ni hint", async () => {
    const e = await select("recipe_share_links", "").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain("23505");
    expect(e.message).toContain("duplicate key");
    expect(e.message).not.toContain("TOKEN-SECRETO-123");
  });

  it("un cuerpo que no es JSON sale recortado", () => {
    expect(resumenDeError("x".repeat(500))).toHaveLength(300);
    expect(resumenDeError("")).toBe("");
  });
});
