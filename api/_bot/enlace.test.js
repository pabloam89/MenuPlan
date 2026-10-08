import { beforeEach, describe, expect, it, vi } from "vitest";

// Una base de mentira con lo justo: bot_chats y bot_identities.
let filas;
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  update: vi.fn(),
  select: vi.fn(async (tabla, filtro) => {
    const id = filtro.match(/(?:chat_id|external_id)=eq\.([^&]+)/)?.[1];
    const t = filas[tabla] ?? [];
    return t.filter((f) => String(f.chat_id ?? f.external_id) === id);
  }),
  insert: vi.fn(async (tabla, nuevas) => {
    filas[tabla] = filas[tabla] ?? [];
    for (const n of nuevas) {
      const clave = n.chat_id ?? n.external_id;
      filas[tabla] = filas[tabla].filter((f) => (f.chat_id ?? f.external_id) !== clave).concat(n);
    }
  }),
}));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(), escaparHtml: (s) => s, TECLADO: {} }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {} }));

const { enlazarChat, idDePersona, codigoDeGrupo, codigoNuevo, esCodigoDeGrupo } = await import("./enlace.js");

const TITULAR = "u-titular";
const ASISTENTA = "u-asistenta";
const identidadDe = (tg) => filas.bot_identities?.find((f) => f.external_id === String(tg))?.user_id ?? null;
const enlazar = (args) => enlazarChat({ chatId: "c1", householdId: "h1", nombre: "x", ...args });

beforeEach(() => {
  filas = {};
});

describe("C-3: un Telegram es una cuenta solo con prueba", () => {
  it("meter a Lola en un grupo no hace a quien pulsa titular", async () => {
    // /grupo firma el enlace con el titular, pero lo pulsa otro.
    await enlazar({ chatId: "g1", kind: "group", userId: TITULAR, externalId: "555", identidad: null });
    expect(identidadDe("555")).toBe(null);
    expect(filas.bot_chats).toHaveLength(1);
  });

  it("el idioma de Telegram no se guarda en bot_chats (no lo lee nadie)", async () => {
    await enlazar({ chatId: "p1", kind: "private", userId: TITULAR, externalId: "555", identidad: null, lang: "en" });
    expect(filas.bot_chats[0]).not.toHaveProperty("lang");
  });

  it("aunque alguien pase una prueba en un grupo, en un grupo no se apunta", async () => {
    await enlazar({ chatId: "g1", kind: "group", userId: TITULAR, externalId: "555", identidad: "ajustes" });
    expect(identidadDe("555")).toBe(null);
  });

  it("una identidad de otra cuenta no se cambia por pulsar un enlace", async () => {
    filas.bot_identities = [{ channel: "telegram", external_id: "777", user_id: ASISTENTA }];
    const r = await enlazar({ kind: "private", userId: TITULAR, externalId: "777", identidad: "ajustes" });
    expect(r.identidad).toBe("de-otra");
    expect(identidadDe("777")).toBe(ASISTENTA);
  });

  it("ni con el código del correo", async () => {
    filas.bot_identities = [{ channel: "telegram", external_id: "777", user_id: ASISTENTA }];
    await enlazar({ kind: "private", userId: TITULAR, externalId: "777", identidad: "email" });
    expect(identidadDe("777")).toBe(ASISTENTA);
  });

  it("la cuenta nacida en este Telegram sí la corrige", async () => {
    filas.bot_identities = [{ channel: "telegram", external_id: "777", user_id: ASISTENTA }];
    await enlazar({ kind: "private", userId: "u-nacida", externalId: "777", identidad: "nacida" });
    expect(identidadDe("777")).toBe("u-nacida");
  });

  it("en privado y con prueba, se apunta", async () => {
    const r = await enlazar({ kind: "private", userId: TITULAR, externalId: "111", identidad: "ajustes" });
    expect(r.identidad).toBe("nueva");
    expect(identidadDe("111")).toBe(TITULAR);
  });

  it("el admin anónimo de un grupo nunca es nadie", async () => {
    await enlazar({ kind: "private", userId: TITULAR, externalId: "1087968824", identidad: "ajustes" });
    expect(identidadDe("1087968824")).toBe(null);
    expect(idDePersona({ id: 1087968824, is_bot: true })).toBe(null);
    expect(idDePersona({ id: 42, is_bot: true })).toBe(null);
    expect(idDePersona({ id: 42 })).toBe("42");
  });
});

describe("códigos de /grupo", () => {
  it("se distinguen de los de la app, siempre", () => {
    for (let i = 0; i < 500; i++) {
      expect(esCodigoDeGrupo(codigoDeGrupo())).toBe(true);
      expect(esCodigoDeGrupo(codigoNuevo())).toBe(false);
    }
  });

  // Un código de 22 caracteres base64url empieza por «m_» una vez de cada
  // 4096: con 40 000 (y otros tantos de grupo) sale ~10 veces si el generador
  // no lo evita. Y entonces el /start lo confundía con una semana compartida.
  it("nunca empiezan como otra clase de /start (rc_, ru_, m_, inv_, p-)", () => {
    const malos = [];
    for (let i = 0; i < 40000; i++) {
      for (const c of [codigoNuevo(), codigoDeGrupo()]) {
        if (/^(rc_|ru_|m_|inv_|p-|grupo)/.test(c)) malos.push(c);
      }
    }
    expect(malos).toEqual([]);
  });
});
