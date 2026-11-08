// La cuenta que nació en un Telegram, aunque su identidad ya apunte a la cuenta de la app (#1238): cuentaNacidaDe la
// encuentra.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const t = vi.hoisted(() => ({ perfiles: [], auth: {} }));
vi.mock("./db.js", () => ({
  config: () => ({ url: "https://base", key: "k", headers: {} }),
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla, filtro) => (tabla === "user_profiles" ? t.perfiles.filter((p) => filtro === `email=eq.${p.email}`) : [])),
  // Como el PATCH de PostgREST: solo las filas de ese usuario con el email vacío.
  update: vi.fn(async (tabla, filtro, cambios) => {
    const id = filtro.match(/user_id=eq\.([^&]+)&email=is\.null/)?.[1];
    const filas = t.perfiles.filter((p) => p.user_id === id && p.email == null);
    for (const p of filas) Object.assign(p, cambios);
    return filas;
  }),
  insert: vi.fn(),
}));

const { cuentaNacidaDe } = await import("./cuentas.js");
const SINTETICO = "tg777@usuarios.menuplanai.com";

beforeEach(() => {
  t.perfiles = [{ user_id: "u-nacida", email: SINTETICO }];
  t.auth = { "u-nacida": { id: "u-nacida", email: SINTETICO }, "u-falso": { id: "u-falso", email: "malo@gmail.com" } };
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = t.auth[url.split("/").pop()];
    return u ? { ok: true, json: async () => u } : { ok: false, status: 404 };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("cuentaNacidaDe", () => {
  it("la encuentra por su email sintético, sin mirar a quién apunta la identidad", async () => {
    await expect(cuentaNacidaDe("777")).resolves.toEqual({ id: "u-nacida", email: SINTETICO });
  });

  it("sin perfil con ese email, null: este Telegram no tiene cuenta propia", async () => {
    t.perfiles = [];
    await expect(cuentaNacidaDe("777")).resolves.toBeNull();
  });

  it("un perfil ajeno con el mismo email (cada uno escribe el suyo) no tapa a la buena", async () => {
    t.perfiles = [{ user_id: "u-falso", email: SINTETICO }, { user_id: "u-nacida", email: SINTETICO }];
    await expect(cuentaNacidaDe("777")).resolves.toEqual({ id: "u-nacida", email: SINTETICO });
  });

  it("si Auth dice otro email, null: el perfil no basta como prueba", async () => {
    t.perfiles = [{ user_id: "u-falso", email: SINTETICO }];
    await expect(cuentaNacidaDe("777")).resolves.toBeNull();
  });

  it("si Auth falla, lanza: no se decide a ciegas", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(cuentaNacidaDe("777")).rejects.toThrow(/500/);
  });
});
