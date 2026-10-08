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
    if (tabla === "households") return [{ name: "Casa Artiñano" }];
    return [];
  }),
}));
vi.mock("./cuentas.js", () => ({ crearCuentaTelegram: vi.fn(async ({ telegramId }) => { creadas.push(telegramId); return { userId: `nueva-${telegramId}`, householdId: "suya" }; }) }));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(), escaparHtml: (s) => s, TECLADO: {} }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {} }));

const { unirsePorInvitacion, ES_INVITACION } = await import("./invitacion.js");
const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  base = { bot_identities: [{ external_id: "10", user_id: "pareja" }], bot_chats: [], user_profiles: [] };
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
