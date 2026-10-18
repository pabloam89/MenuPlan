import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { rememberAppleRefreshToken } from "./appleTokens.js";

// El upsert es lo único que este módulo hace, así que el doble solo necesita
// registrar con qué se le llamó.
let upserts;
beforeEach(() => {
  upserts = [];
  supabase.from = (table) => ({
    upsert: (row, opts) => {
      upserts.push({ table, row, opts });
      return Promise.resolve({ error: null });
    },
  });
});

const session = (overrides = {}) => ({
  provider_refresh_token: "rt_123",
  user: { id: "u1", app_metadata: { provider: "apple" } },
  ...overrides,
});

describe("rememberAppleRefreshToken", () => {
  it("guarda el token de una sesión de Apple", async () => {
    await rememberAppleRefreshToken(session());
    expect(upserts).toEqual([
      {
        table: "apple_auth_tokens",
        row: { user_id: "u1", refresh_token: "rt_123" },
        opts: { onConflict: "user_id" },
      },
    ]);
  });

  it("ignora las sesiones que no son de Apple", async () => {
    await rememberAppleRefreshToken(
      session({ user: { id: "u1", app_metadata: { provider: "google" } } }),
    );
    expect(upserts).toEqual([]);
  });

  // La razón de ser del guard: Apple solo manda refresh token en la primera
  // autorización. Si los logins siguientes escribieran, borrarían la única
  // credencial que permite revocar el acceso al borrar la cuenta.
  it("no escribe cuando la sesión viene sin refresh token", async () => {
    await rememberAppleRefreshToken(session({ provider_refresh_token: undefined }));
    expect(upserts).toEqual([]);
  });

  it("no explota sin sesión", async () => {
    await rememberAppleRefreshToken(null);
    expect(upserts).toEqual([]);
  });
});
