/**
 * borrarLoDelBot: lo que el bot guarda de una cuenta y no cae en cascada con
 * el usuario. Lo usa también «Eliminar cuenta» de la app (api/delete-account.js).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`,
  config: () => ({ url: "https://base", key: "k", headers: {} }),
  select: vi.fn(async (tabla) => {
    if (tabla === "households") return [{ id: "casa1" }];
    if (tabla === "bot_identities") return [{ external_id: "555" }];
    if (tabla === "bot_chats") return [{ chat_id: "-100777" }];
    return [];
  }),
}));
vi.mock("./telegram.js", () => ({ llamar: vi.fn() }));

const { borrarLoDelBot } = await import("./borrar.js");

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
