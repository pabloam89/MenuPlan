import { beforeEach, describe, expect, it, vi } from "vitest";

let base, rpcR, creadas;
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  update: vi.fn(),
  insert: vi.fn(async (tabla, filas) => { base[tabla] = [...(base[tabla] ?? []), ...filas]; }),
  rpc: vi.fn(async (f, args) => rpcR(f, args)),
  select: vi.fn(async (tabla, filtro) => {
    const v = (k) => filtro.match(new RegExp(`${k}=eq\.([^&]+)`))?.[1];
    if (tabla === "bot_identities") return (base.bot_identities ?? []).filter((i) => i.external_id === v("external_id"));
    if (tabla === "bot_chats") return (base.bot_chats ?? []).filter((c) => c.chat_id === v("chat_id"));
    if (tabla === "user_profiles") return (base.user_profiles ?? []).filter((p) => p.user_id === v("user_id"));
    if (tabla === "household_invites") return (base.household_invites ?? []).filter((i) => i.token === v("token"));
    if (tabla === "households") return filtro.startsWith("invite_token") ? [] : [{ name: "Casa Artiñano" }];
    return [];
  }),
}));
vi.mock("./cuentas.js", () => ({ crearCuentaTelegram: vi.fn(async ({ telegramId }) => { creadas.push(telegramId); return { userId: `nueva-${telegramId}`, householdId: "suya" }; }) }));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(), escaparHtml: (s) => s, TECLADO: {} }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {} }));

const { unirsePorInvitacion, ES_INVITACION } = await import("./invitacion.js");
const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  base = {
    bot_identities: [{ external_id: "10", user_id: "pareja" }], bot_chats: [], user_profiles: [],
    household_invites: [{ token: TOKEN, household_id: "casa", uses: 0, max_uses: 1, expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null }],
  };
  creadas = [];
  rpcR = (f, { p_user_id }) => ({ householdId: "casa", role: "viewer", lang: null, user: p_user_id });
});

describe("entrar con una invitación desde Telegram", () => {
  it("el enlace se reconoce, y nada más", () => {
    expect(ES_INVITACION.test(`inv_${TOKEN}`)).toBe(true);
    expect(ES_INVITACION.test("inv_hola")).toBe(false);
  });

  it("si ese Telegram ya es una cuenta, entra con ella y no se crea otra", async () => {
    let quien = null;
    rpcR = (f, { p_user_id }) => { quien = p_user_id; return { householdId: "casa", role: "editor" }; };
    const r = await unirsePorInvitacion({ from: { id: 10 }, chatId: "c10", token: TOKEN });
    expect(quien).toBe("pareja");
    expect(creadas).toEqual([]);
    expect(r.texto).toMatch(/cotitular de <b>Casa Artiñano/);
    // Su identidad no se toca (ya la tenía).
    expect(base.bot_identities).toHaveLength(1);
  });

  it("si no, nace una cuenta aquí, con su identidad", async () => {
    const r = await unirsePorInvitacion({ from: { id: 77 }, chatId: "c77", token: TOKEN });
    expect(creadas).toEqual([77]);
    expect(base.bot_identities.some((i) => i.external_id === "77" && i.user_id === "nueva-77")).toBe(true);
    expect(base.bot_chats.some((c) => c.chat_id === "c77" && c.household_id === "casa")).toBe(true);
    expect(r.householdId).toBe("casa");
  });

  it("la invitación en inglés saluda en inglés", async () => {
    rpcR = () => ({ householdId: "casa", role: "viewer", lang: "en" });
    const r = await unirsePorInvitacion({ from: { id: 77, language_code: "es" }, chatId: "c77", token: TOKEN });
    expect(r.lang).toBe("en");
    expect(r.texto).toMatch(/^Hi! I'm/);
  });

  it("caducada o usada: lo dice, en el idioma de su Telegram", async () => {
    rpcR = () => { throw new Error("POST /rest/v1/rpc/bot_unirse_por_invitacion → 400 Invite expired"); };
    expect((await unirsePorInvitacion({ from: { id: 77, language_code: "en-GB" }, chatId: "c", token: TOKEN })).texto).toMatch(/no longer valid/);
    expect((await unirsePorInvitacion({ from: { id: 77 }, chatId: "c", token: TOKEN })).texto).toMatch(/ya no vale/);
  });

  it("si la base no contesta, no dice que está caducada: dice que no ha podido (#208)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpcR = () => { throw Object.assign(new Error("POST /rest/v1/rpc/bot_unirse_por_invitacion → 503 PGRST002 Could not query the database"), { status: 503, codigo: "PGRST002" }); };
    const r = await unirsePorInvitacion({ from: { id: 77 }, chatId: "c", token: TOKEN });
    expect(r.texto).toMatch(/^No he podido abrir tu invitación ahora mismo; vuelve a intentarlo en un minuto/);
    expect(r.householdId).toBe(null);
    rpcR = () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }); };
    expect((await unirsePorInvitacion({ from: { id: 77, language_code: "en" }, chatId: "c", token: TOKEN })).texto).toMatch(/^I couldn't open your invitation/);
    // La línea de log lleva el sitio y el motivo, no el token.
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ evento: "bot_fallo", donde: "invitacion_unirse", motivo: "servidor" });
    expect(warn.mock.calls.join(" ")).not.toContain(TOKEN);
    warn.mockRestore();
  });

  it("y el tope de casas, que sí es una respuesta de la base, se sigue diciendo", async () => {
    rpcR = () => { throw Object.assign(new Error("POST /rest/v1/rpc/bot_unirse_por_invitacion → 400 P0001 Member limit reached (max 3)"), { status: 400, codigo: "P0001" }); };
    expect((await unirsePorInvitacion({ from: { id: 77 }, chatId: "c", token: TOKEN })).texto).toMatch(/máximo de casas/);
  });

  it("un bot o un admin anónimo no entra", async () => {
    const r = await unirsePorInvitacion({ from: { id: 1087968824, is_bot: true }, chatId: "g", token: TOKEN });
    expect(r.householdId).toBe(null);
    expect(creadas).toEqual([]);
  });
});

// invitacionVigente copia en JS la regla de `_unirse` (SQL). Si la última
// migración que la define cambia la regla, este test falla y avisa de que
// la copia de invitacion.js hay que cambiarla también.
describe("la regla de invitación vigente es la de la base", () => {
  it("la última definición de _unirse rechaza por revocada, sin usos o caducada, y acepta el enlace fijo", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const conUnirse = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
      .filter((f) => /function public\._unirse\b/.test(readFileSync(new URL(f, dir), "utf8")));
    const sql = readFileSync(new URL(conUnirse.at(-1), dir), "utf8");
    expect(sql).toMatch(/v_inv\.revoked_at is not null or v_inv\.uses >= v_inv\.max_uses or v_inv\.expires_at <= now\(\)/);
    expect(sql).toMatch(/from public\.households where invite_token = trim\(p_token\)/);
  });
});

describe("lo que se mira ANTES de crear o gastar nada (#958)", () => {
  it("una invitación inventada no crea ninguna cuenta (antes quedaba un usuario de auth huérfano)", async () => {
    const llamadas = [];
    rpcR = (f) => { llamadas.push(f); return null; };
    const r = await unirsePorInvitacion({ from: { id: 77 }, chatId: "77", token: "f".repeat(32) });
    expect(r.texto).toMatch(/ya no vale/);
    expect(creadas).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  it("caducada en household_invites: tampoco crea nada", async () => {
    base.household_invites[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const r = await unirsePorInvitacion({ from: { id: 77 }, chatId: "77", token: TOKEN });
    expect(r.texto).toMatch(/ya no vale/);
    expect(creadas).toEqual([]);
  });

  it("con su chat enlazado a otra casa por otra cuenta: no entra ni gasta la invitación (antes entraba y el chat no se enlazaba)", async () => {
    base.bot_chats = [{ chat_id: "10", household_id: "otra", linked_by: "otro" }];
    const llamadas = [];
    rpcR = (f) => { llamadas.push(f); return { householdId: "casa", role: "viewer" }; };
    const r = await unirsePorInvitacion({ from: { id: 10 }, chatId: "10", token: TOKEN });
    expect(r.texto).toMatch(/ya está conectado a otra casa/);
    expect(llamadas).toEqual([]);
  });

  it("un privado enlazado antes de las identidades entra con esa cuenta, no con una nueva", async () => {
    base.bot_identities = [];
    base.bot_chats = [{ chat_id: "55", household_id: "suya", linked_by: "vieja" }];
    let quien = null;
    rpcR = (f, { p_user_id }) => { quien = p_user_id; return { householdId: "casa", role: "viewer" }; };
    await unirsePorInvitacion({ from: { id: 55 }, chatId: "55", token: TOKEN });
    expect(quien).toBe("vieja");
    expect(creadas).toEqual([]);
  });
});
