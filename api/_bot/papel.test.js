import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

// Una base de mentira: identidades, miembros y chats.
let base;
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  insert: vi.fn(), update: vi.fn(), rpc: vi.fn(),
  select: vi.fn(async (tabla, filtro) => {
    const campo = (k) => filtro.match(new RegExp(`${k}=eq\.([^&]+)`))?.[1];
    if (tabla === "bot_identities") return base.identidades.filter((i) => i.external_id === campo("external_id"));
    if (tabla === "household_members") return base.miembros.filter((m) => m.household_id === campo("household_id") && m.user_id === campo("user_id"));
    if (tabla === "bot_chats") return base.chats.filter((c) => c.chat_id === campo("chat_id"));
    return [];
  }),
}));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { papelDeQuien, papelMasBajo } = await import("./papel.js");
const { herramientas, FICHAS } = await import("./agente.js");
const { permitidoEn, POLITICA } = await import("./router.js");

const H = "casa";
beforeEach(() => {
  base = {
    identidades: [
      { external_id: "1", user_id: "titular" },
      { external_id: "2", user_id: "pareja" },
      { external_id: "3", user_id: "asistenta" },
      { external_id: "9", user_id: "de-otra-casa" },
    ],
    miembros: [
      { household_id: H, user_id: "titular", role: "owner" },
      { household_id: H, user_id: "pareja", role: "editor" },
      { household_id: H, user_id: "asistenta", role: "viewer" },
    ],
    chats: [{ chat_id: "privado-viejo", household_id: H, kind: "private", linked_by: "pareja" }],
  };
});

describe("el papel de quien escribe", () => {
  const de = (desde, extra = {}) => papelDeQuien({ householdId: H, chatId: "c", esGrupo: true, desde, ...extra });

  it("cada uno el suyo", async () => {
    expect((await de(["1"])).papel).toBe("owner");
    expect((await de(["2"])).papel).toBe("editor");
    expect((await de(["3"])).papel).toBe("viewer");
  });

  it("varios a la vez: el más bajo", async () => {
    expect((await de(["1", "3"])).papel).toBe("viewer");
    expect(papelMasBajo(["owner", "editor"])).toBe("editor");
  });

  it("alguien sin cuenta, o de otra casa, o nadie: ajeno", async () => {
    expect((await de(["77"])).papel).toBe("ajeno");
    expect((await de(["9"])).papel).toBe("ajeno");
    expect((await de([])).papel).toBe("ajeno");
    expect((await de(["1", "77"])).papel).toBe("ajeno");
  });

  it("en privado sin identidad, quien enlazó el chat", async () => {
    expect((await de([], { esGrupo: false, chatId: "privado-viejo" })).papel).toBe("editor");
    // En un grupo no vale: quien enlazó el grupo no es quien escribe.
    expect((await de([], { esGrupo: true, chatId: "privado-viejo" })).papel).toBe("ajeno");
  });

  it("si le quitan de la casa, al mensaje siguiente ya no", async () => {
    base.miembros = base.miembros.filter((m) => m.user_id !== "asistenta");
    expect((await de(["3"])).papel).toBe("ajeno");
  });
});

// La lista de la propuesta (specs/roles-de-la-casa-propuesta.md, apartado 4).
const DEL_LECTOR = ["buscar_recetas", "marcar_compra", "proponer_platos", "ver_ajustes", "ver_casa", "ver_compra", "ver_despensa", "ver_menu", "ver_menu_cole", "ver_receta"];
const SOLO_EN_PRIVADO = ["aviso_vispera", "cancelar_recordatorio", "crear_recordatorio", "empezar_de_nuevo", "ver_recordatorios"];
const nombres = async (chat) => (await herramientas({ householdId: "x", chatId: "1", channel: "telegram", fotos: [], ...chat })).map((t) => t.name).sort();

describe("las herramientas de Lola según el papel", () => {
  it("titular y cotitular: todas", async () => {
    expect(await nombres({ papel: "owner" })).toHaveLength(FICHAS.size);
    expect(await nombres({ papel: "editor" })).toHaveLength(FICHAS.size);
  });

  it("lector en privado: consultar, tachar, y sus recordatorios", async () => {
    expect(await nombres({ papel: "viewer", esGrupo: false })).toEqual([...DEL_LECTOR, ...SOLO_EN_PRIVADO].sort());
  });

  it("lector en un grupo: sin lo del chat (es del grupo)", async () => {
    expect(await nombres({ papel: "viewer", esGrupo: true })).toEqual(DEL_LECTOR);
  });

  it("ni compartir ni deshacer para el lector", async () => {
    const n = await nombres({ papel: "viewer", esGrupo: false });
    for (const x of ["compartir", "deshacer", "anadir_compra", "cambiar_plato", "generar_menu", "ajustar_alergias", "ajustar_salud"]) expect(n).not.toContain(x);
  });

  it("alguien sin cuenta: solo el menú, las recetas y la compra (ni familia ni salud, ni tachar)", async () => {
    expect(await nombres({ papel: "ajeno", esGrupo: true })).toEqual(["buscar_recetas", "proponer_platos", "ver_compra", "ver_menu", "ver_menu_cole", "ver_receta"]);
  });

  it("sin papel: como alguien sin cuenta (falla cerrado)", async () => {
    expect(await nombres({ esGrupo: false })).toEqual(await nombres({ papel: "ajeno", esGrupo: false }));
  });

  it("una herramienta de escritura no se ejecuta aunque se cuele", async () => {
    const chatLector = { householdId: "x", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false };
    const tools = await herramientas(chatLector);
    const generar = tools.find((t) => t.name === "generar_menu");
    chatLector.papel = "viewer"; // le cambian el papel a mitad de turno
    expect(await generar.run({ semana: "esta" })).toMatch(/no lo puede cambiar/);
  });
});

describe("la vía rápida según el papel", () => {
  it("el lector solo lee y tacha", () => {
    const suyos = Object.keys(POLITICA).filter((m) => permitidoEn(m, { papel: "viewer" }));
    expect(suyos.sort()).toEqual(["calorias", "compra_marcar", "consulta", "despensa", "falta", "receta", "recomendar"]);
  });

  it("alguien sin cuenta, ni tacha", () => {
    expect(permitidoEn("compra_marcar", { papel: "ajeno", esGrupo: true })).toBe(false);
    expect(permitidoEn("consulta", { papel: "ajeno", esGrupo: true })).toBe(true);
    expect(permitidoEn("compra_anadir", { papel: "ajeno", esGrupo: true })).toBe(false);
  });

  it("titular y cotitular, como siempre", () => {
    expect(permitidoEn("generar", { papel: "editor" })).toBe(true);
    expect(permitidoEn("cambiar", { papel: "owner" })).toBe(true);
  });
});
