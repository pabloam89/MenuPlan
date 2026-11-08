// ¿Pasar este Telegram a otra cuenta deja una casa con gente sin entrada? (#1302)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const t = vi.hoisted(() => ({ tablas: {} }));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(), escaparHtml: (x) => x, TECLADO: {} }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {} }));
vi.mock("./db.js", () => ({
  insert: vi.fn(),
  update: vi.fn(),
  config: () => ({ url: "https://base", key: "k", headers: {} }),
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla) => {
    if (t.tablas[tabla] instanceof Error) throw t.tablas[tabla];
    return t.tablas[tabla] ?? [];
  }),
}));

const { dejariaCasaSinEntrada } = await import("./enlace.js");

const SINTETICA = { email: "tg7@usuarios.menuplanai.com", identities: [{ provider: "email" }] };
const casaConGente = { households: [{ id: "c1" }], persona: [{ household_id: "c1" }], household_members: [{ household_id: "c1", user_id: "u1" }] };

describe("dejariaCasaSinEntrada", () => {
  beforeEach(() => {
    t.tablas = { ...casaConGente };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => SINTETICA })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("una cuenta que solo se abre con Telegram, sola en una casa con gente: sí", async () => {
    await expect(dejariaCasaSinEntrada("u1")).resolves.toBe(true);
  });

  it("con otra llave, no: la cuenta se sigue pudiendo abrir", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...SINTETICA, identities: [{ provider: "google" }] }) });
    await expect(dejariaCasaSinEntrada("u1")).resolves.toBe(false);
  });

  it("con otro miembro en la casa, no: alguien puede entrar", async () => {
    t.tablas.household_members = [{ household_id: "c1", user_id: "u1" }, { household_id: "c1", user_id: "u2" }];
    await expect(dejariaCasaSinEntrada("u1")).resolves.toBe(false);
  });

  it("con la casa vacía o sin casa, no: no se pierde nada", async () => {
    t.tablas.persona = [];
    await expect(dejariaCasaSinEntrada("u1")).resolves.toBe(false);
    t.tablas.households = [];
    await expect(dejariaCasaSinEntrada("u1")).resolves.toBe(false);
  });

  it("si la base o Auth fallan, lanza: no se decide a ciegas", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(dejariaCasaSinEntrada("u1")).rejects.toThrow(/500/);
    t.tablas.persona = new Error("base caída");
    await expect(dejariaCasaSinEntrada("u1")).rejects.toThrow(/base caída/);
  });
});
