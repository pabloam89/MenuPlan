/**
 * borrarLoDelBot: lo que el bot guarda de una cuenta y no cae en cascada con
 * el usuario. Lo usa también «Eliminar cuenta» de la app (api/delete-account.js).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Quién más hay en la casa, para las pruebas de borrarCuenta.
const miembros = { lista: [] };
// Identidad de quien pulsa y el chat donde lo pulsa, para borrarCuenta.
const ids = { lista: [{ external_id: "555", user_id: "u1" }] };
const chats = { lista: [{ chat_id: "-100777" }] };
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`,
  config: () => ({ url: "https://base", key: "k", headers: {} }),
  select: vi.fn(async (tabla) => {
    if (tabla === "households") return [{ id: "casa1" }];
    if (tabla === "bot_identities") return ids.lista;
    if (tabla === "bot_chats") return chats.lista;
    if (tabla === "household_members") return miembros.lista;
    return [];
  }),
}));
vi.mock("./telegram.js", () => ({ llamar: vi.fn() }));

const { borrarLoDelBot, borrarCuenta } = await import("./borrar.js");

describe("borrarLoDelBot", () => {
  const borrados = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
    if (opts?.method === "DELETE") borrados.push(decodeURIComponent(String(url).replace("https://base/rest/v1/", "")));
    return new Response(null, { status: 204 });
  }));
  afterEach(() => { borrados.length = 0; });

  it("el chat privado (por su identidad), los grupos de su casa, y lo de la casa y el usuario", async () => {
    const r = await borrarLoDelBot("u1");
    expect(r.casas).toBe(1);
    const tabla = (t) => borrados.filter((b) => b.startsWith(`${t}?`));
    // Los chats: el privado (mismo id que su Telegram) y el grupo enlazado a su casa.
    for (const t of ["bot_messages", "bot_cola", "bot_candados", "bot_reminders", "bot_chats"]) {
      expect(tabla(t).some((b) => b.includes('"555"') && b.includes('"-100777"'))).toBe(true);
    }
    expect(tabla("bot_identities").some((b) => b.includes("user_id=eq.u1"))).toBe(true);
    expect(tabla("bot_deshacer")[0]).toContain('"casa1"');
    expect(tabla("bot_usage")[0]).toContain('"casa1"');
    expect(tabla("user_events")[0]).toContain("user_id=eq.u1");
  });

  it("sin usuario (cuenta que ya no existe), solo lo del chat dado", async () => {
    const r = await borrarLoDelBot(null, { chatIds: ["42"] });
    expect(r.casas).toBe(0);
    expect(borrados.some((b) => b.startsWith("bot_messages?") && b.includes('"42"'))).toBe(true);
    expect(borrados.some((b) => b.startsWith("user_events?"))).toBe(false);
  });
});

describe("borrarCuenta y los roles de la casa", () => {
  it("un coeditor frena el borrado; no se borra nada", async () => {
    miembros.lista = [{ user_id: "u2", role: "editor" }];
    const r = await borrarCuenta({ chatId: "555", telegramId: 555 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/lleva contigo/);
  });

  it("los lectores no frenan: se borra y se dice cuántos pierden el acceso", async () => {
    miembros.lista = [{ user_id: "u3", role: "viewer" }, { user_id: "u4", role: "viewer" }];
    const r = await borrarCuenta({ chatId: "555", telegramId: 555 });
    expect(r).toEqual({ ok: true, casas: 1, lectores: 2 });
  });
});

describe("borrarCuenta: solo la cuenta de quien pulsa", () => {
  const borradosAuth = [];
  let fetchAntes;
  beforeEach(() => {
    fetchAntes = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      if (opts?.method === "DELETE" && String(url).includes("/auth/v1/admin/users/")) borradosAuth.push(String(url).split("/").pop());
      return new Response(null, { status: 204 });
    }));
  });
  afterEach(() => {
    vi.stubGlobal("fetch", fetchAntes); borradosAuth.length = 0; ids.lista = [{ external_id: "555", user_id: "u1" }]; chats.lista = [{ chat_id: "-100777" }]; miembros.lista = []; });

  it("sin identidad, en un chat que no es su privado: no se borra a nadie (y menos al dueño de la casa)", async () => {
    ids.lista = [];
    chats.lista = [{ chat_id: "-100777", household_id: "casa1", kind: "group", linked_by: "dueno" }];
    const r = await borrarCuenta({ chatId: "-100777", telegramId: 555 });
    expect(r.sinCuenta).toBe(true);
    expect(borradosAuth).toEqual([]);
  });

  it("sin identidad pero en su privado: la cuenta que enlazó ese privado", async () => {
    ids.lista = [];
    chats.lista = [{ chat_id: "555", household_id: "casa1", kind: "private", linked_by: "u9" }];
    const r = await borrarCuenta({ chatId: "555", telegramId: 555 });
    expect(r.ok).toBe(true);
    expect(borradosAuth).toEqual(["u9"]);
  });
});
