import { describe, it, expect, vi, beforeEach } from "vitest";

// Una base de mentira por tablas, con filtros por chat_id, tipo, status y external_id.
const t = vi.hoisted(() => ({ base: {} }));
const valor = (filtro, k) => decodeURIComponent(filtro.split("&").find((p) => p.startsWith(`${k}=eq.`))?.slice(k.length + 4) ?? "");
const casa = (filtro) => (f) => ["chat_id", "tipo", "status", "external_id"].every((k) => !filtro.includes(`${k}=`) || String(f[k]) === valor(filtro, k));
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`,
  select: vi.fn(async (tabla, filtro) => (t.base[tabla] ?? []).filter(casa(filtro))),
  update: vi.fn(async (tabla, filtro, cambios) => {
    const filas = (t.base[tabla] ?? []).filter(casa(filtro));
    for (const f of filas) Object.assign(f, cambios);
    return filas;
  }),
  borrar: vi.fn(async (tabla, filtro) => { t.base[tabla] = (t.base[tabla] ?? []).filter((f) => !casa(filtro)(f)); }),
}));

const { migrarChat, alSalirDelChat, TABLAS_DEL_CHAT } = await import("./chats.js");

beforeEach(() => {
  t.base = {
    bot_chats: [{ chat_id: "-1", household_id: "h1", kind: "group" }],
    bot_messages: [{ chat_id: "-1" }],
    // Los recordatorios son tareas de tipo recordatorio (0122): uno abierto y uno ya mandado en el grupo, uno en el
    // privado, y una tarea que no es recordatorio (no se toca al salir).
    bot_tareas: [
      { chat_id: "-1", tipo: "recordatorio", status: "abierta" }, { chat_id: "-1", tipo: "recordatorio", status: "hecha" },
      { chat_id: "7", tipo: "recordatorio", status: "abierta" }, { chat_id: "-1", tipo: "espera", status: "abierta" },
    ],
    bot_identities: [{ external_id: "7", user_id: "u7" }],
  };
});

describe("un grupo que pasa a supergrupo (migrate_to_chat_id, #958)", () => {
  it("el enlace, los recordatorios, la charla y las tareas pasan al id nuevo", async () => {
    const { movidas } = await migrarChat("-1", "-100");
    for (const tabla of TABLAS_DEL_CHAT) expect(t.base[tabla].every((f) => f.chat_id !== "-1"), tabla).toBe(true);
    expect(movidas).toEqual({ bot_chats: 1, bot_messages: 1, bot_tareas: 3 });
  });

  it("los dos avisos (el del viejo y el del nuevo) no rompen nada: la segunda vez no hay nada que mover", async () => {
    await migrarChat("-1", "-100");
    const { movidas } = await migrarChat("-1", "-100");
    expect(Object.values(movidas).every((n) => n === 0)).toBe(true);
    expect(t.base.bot_chats).toEqual([{ chat_id: "-100", household_id: "h1", kind: "group" }]);
  });

  it("si el nuevo ya estaba enlazado, ese enlace no se pisa", async () => {
    t.base.bot_chats.push({ chat_id: "-100", household_id: "h2", kind: "group" });
    await migrarChat("-1", "-100");
    expect(t.base.bot_chats.find((c) => c.chat_id === "-100").household_id).toBe("h2");
  });
});

describe("echan a Lola o la bloquean (my_chat_member, #958)", () => {
  it("de un grupo: se cancelan sus recordatorios pendientes y se quita el enlace", async () => {
    const r = await alSalirDelChat({ chat: { id: -1, type: "group" }, new_chat_member: { status: "kicked" } });
    expect(r).toEqual({ cancelados: 1, desenlazado: true });
    const delGrupo = t.base.bot_tareas.filter((x) => x.chat_id === "-1");
    expect(delGrupo.filter((x) => x.tipo === "recordatorio").map((x) => x.status).sort()).toEqual(["descartada", "hecha"]);
    expect(delGrupo.find((x) => x.tipo === "espera").status).toBe("abierta");
    expect(delGrupo.find((x) => x.status === "descartada").closed_at).toBeTruthy();
    expect(t.base.bot_chats).toEqual([]);
  });

  it("bloqueada en privado por alguien con identidad: recordatorios fuera y enlace quitado (volverá solo al escribir)", async () => {
    t.base.bot_chats.push({ chat_id: "7", household_id: "h1", kind: "private" });
    const r = await alSalirDelChat({ chat: { id: 7, type: "private" }, new_chat_member: { status: "kicked" } });
    expect(r).toEqual({ cancelados: 1, desenlazado: true });
    expect(t.base.bot_chats.some((c) => c.chat_id === "7")).toBe(false);
  });

  it("en privado sin identidad, el enlace se queda (si no, al volver iría al alta)", async () => {
    t.base.bot_identities = [];
    t.base.bot_chats.push({ chat_id: "7", household_id: "h1", kind: "private" });
    const r = await alSalirDelChat({ chat: { id: 7, type: "private" }, new_chat_member: { status: "kicked" } });
    expect(r.desenlazado).toBe(false);
    expect(t.base.bot_chats.some((c) => c.chat_id === "7")).toBe(true);
  });

  it("si vuelve a entrar o le cambian el papel, nada", async () => {
    expect(await alSalirDelChat({ chat: { id: -1, type: "group" }, new_chat_member: { status: "member" } })).toBeNull();
    expect(t.base.bot_chats).toHaveLength(1);
  });
});
