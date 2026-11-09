// La cuenta que nació en un Telegram, aunque su identidad ya apunte a la cuenta de la app (#1238): cuentaNacidaDe la
// encuentra, y hayVueltaALaNacida decide con esa misma búsqueda si /cuentadeantes la recuperaría.
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

const { cuentaNacidaDe, hayVueltaALaNacida } = await import("./cuentas.js");
const { update } = await import("./db.js");
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

describe("hayVueltaALaNacida", () => {
  it("la nacida que nunca abrió la app (perfil sin email): el servidor le escribe el email y entonces hay vuelta", async () => {
    t.perfiles = [{ user_id: "u-nacida", email: null }];
    await expect(hayVueltaALaNacida("777", "u-nacida")).resolves.toBe(true);
    expect(t.perfiles[0].email).toBe(SINTETICO);
    // Y la vuelta de verdad la encuentra con la misma búsqueda.
    await expect(cuentaNacidaDe("777")).resolves.toEqual({ id: "u-nacida", email: SINTETICO });
  });

  it("solo escribe el email si faltaba: no pisa el de nadie", async () => {
    await hayVueltaALaNacida("777", "u-nacida");
    expect(update).toHaveBeenCalledWith("user_profiles", "user_id=eq.u-nacida&email=is.null", { email: SINTETICO });
  });

  it("una cuenta que no nació en este Telegram no tiene vuelta, y no se le escribe nada", async () => {
    await expect(hayVueltaALaNacida("777", "u-falso")).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("si no hay forma de encontrarla después (sin fila de perfil), no hay vuelta: quien llama mantiene el freno", async () => {
    t.perfiles = [];
    await expect(hayVueltaALaNacida("777", "u-nacida")).resolves.toBe(false);
  });

  it("si Auth falla, lanza", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(hayVueltaALaNacida("777", "u-nacida")).rejects.toThrow(/500/);
  });
});
