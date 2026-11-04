import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esquemaFinal } from "../../scripts/lib/migraciones.mjs";
import { armarExportacion, columnaDeCasa, COLUMNAS_SECRETAS, COLUMNAS_QUE_NO_SON_SECRETO, PARECE_SECRETO, TABLAS_EXPORTADAS, TABLAS_NO_EXPORTADAS, LIMITE_FILAS, VERSION_EXPORTAR } from "./exportarCasa.js";

const MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
// La tabla de la 0010 que no se creó nunca, a propósito (supabase/ESTADO.md, fila 0010).
const NO_CREADAS = new Set(["user_recipe_discards"]);
// Las tablas con una columna de casa (columnaDeCasa): household_id, y la propia tabla de casas por su id.
const deLaCasa = () => [...esquemaFinal(MIGRACIONES)].filter(([t, x]) => x.columnas.has(columnaDeCasa(t)) && (t === "households" || x.columnas.has("household_id")) && !NO_CREADAS.has(t)).map(([t]) => t).sort();

describe("exportar una casa: cada tabla de la casa, exportada o fuera con su porqué", () => {
  it("toda tabla con household_id está en una de las dos listas, y solo en una", () => {
    const tablas = deLaCasa();
    // Suelo: si la lectura de las migraciones no viera nada, el test pasaría vacío. El 4 nov 2026 eran 33 (32 con household_id y households).
    expect(tablas.length).toBeGreaterThanOrEqual(30);
    const clasificadas = [...TABLAS_EXPORTADAS, ...TABLAS_NO_EXPORTADAS.keys()];
    expect(tablas.filter((t) => !clasificadas.includes(t)), "Tabla nueva de la casa: ponla en TABLAS_EXPORTADAS o en TABLAS_NO_EXPORTADAS con su porqué").toEqual([]);
    expect(TABLAS_EXPORTADAS.filter((t) => TABLAS_NO_EXPORTADAS.has(t))).toEqual([]);
  });

  it("ninguna de las listas nombra una tabla que no existe o no es de la casa", () => {
    const tablas = new Set(deLaCasa());
    expect([...TABLAS_EXPORTADAS, ...TABLAS_NO_EXPORTADAS.keys()].filter((t) => !tablas.has(t))).toEqual([]);
  });

  it("toda columna con nombre de secreto de una tabla exportada está clasificada: secreta (se quita) o no", () => {
    const esquema = esquemaFinal(MIGRACIONES);
    const conNombre = TABLAS_EXPORTADAS.flatMap((t) => [...(esquema.get(t)?.columnas ?? [])].filter((c) => PARECE_SECRETO.test(c)).map((c) => `${t}.${c}`));
    // Suelo: el 4 nov 2026 eran 9, invite_token de households entre ellas.
    expect(conNombre).toContain("households.invite_token");
    expect(conNombre.filter((k) => !COLUMNAS_SECRETAS.has(k) && !COLUMNAS_QUE_NO_SON_SECRETO.has(k)), "Columna con nombre de secreto: ponla en COLUMNAS_SECRETAS (se quita) o en COLUMNAS_QUE_NO_SON_SECRETO con su porqué").toEqual([]);
    expect([...COLUMNAS_SECRETAS.keys(), ...COLUMNAS_QUE_NO_SON_SECRETO.keys()].filter((k) => !conNombre.includes(k))).toEqual([]);
  });

  it("los secretos no se exportan", () => {
    for (const t of ["bot_link_tokens", "household_invites"]) {
      expect(TABLAS_EXPORTADAS).not.toContain(t);
      expect(TABLAS_NO_EXPORTADAS.get(t)).toMatch(/^secreto:/);
    }
  });
});

describe("armarExportacion", () => {
  const todas = (filas = []) => Object.fromEntries(TABLAS_EXPORTADAS.map((t) => [t, filas]));
  const QUIEN = { userId: "u1", propios: ["111"] };

  it("da cada tabla con sus filas, la casa, la fecha y el formato", () => {
    const ahora = new Date("2026-11-04T10:00:00Z");
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), persona: [{ id: "ana" }] }, quien: QUIEN, ahora });
    expect(r).toMatchObject({ formato: VERSION_EXPORTAR, casa: "c1", exportado_at: "2026-11-04T10:00:00.000Z" });
    expect(Object.keys(r.tablas)).toEqual([...TABLAS_EXPORTADAS]);
    expect(r.tablas.persona).toEqual({ filas: [{ id: "ana" }], cortada: false });
  });

  it("las columnas secretas se quitan de cada fila (el enlace de la casa no sale)", () => {
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), households: [{ id: "c1", name: "Casa", invite_token: "abc" }] }, quien: QUIEN });
    expect(r.tablas.households.filas).toEqual([{ id: "c1", name: "Casa" }]);
  });

  it("con más filas que el límite, corta y lo dice", () => {
    // Mensajes del grupo de la casa: los ve todo el mundo, así que el corte es lo único que los quita.
    const muchas = Array.from({ length: LIMITE_FILAS + 1 }, (_, i) => ({ id: i, channel: "telegram", chat_id: "-900" }));
    const grupo = [{ channel: "telegram", chat_id: "-900", kind: "group" }];
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), bot_chats: grupo, bot_messages: muchas }, quien: QUIEN });
    expect(r.tablas.bot_messages.cortada).toBe(true);
    expect(r.tablas.bot_messages.filas).toHaveLength(LIMITE_FILAS);
    expect(r.tablas.persona.cortada).toBe(false);
  });

  it("cortada se mira en lo leído: aunque lo privado de otros se quite, una tabla cortada lo dice", () => {
    const deOtra = Array.from({ length: LIMITE_FILAS + 1 }, (_, i) => ({ id: i, channel: "telegram", chat_id: "222" }));
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), bot_messages: deOtra }, quien: QUIEN });
    expect(r.tablas.bot_messages).toEqual({ filas: [], cortada: true });
  });

  it("una tabla sin leer lanza: no hay exportación a medias", () => {
    const { persona: _fuera, ...sinPersona } = todas();
    expect(() => armarExportacion({ casa: "c1", leidas: sinPersona, quien: QUIEN })).toThrow(/persona/);
    expect(() => armarExportacion({ leidas: todas(), quien: QUIEN })).toThrow(/casa/);
    expect(() => armarExportacion({ casa: "c1", leidas: todas() })).toThrow(/quién/);
  });

  it("lo privado de otra persona no sale: su chat a solas con Lola, sus mensajes y sus tareas personales", () => {
    const chats = [
      { channel: "telegram", chat_id: "111", kind: "private" },
      { channel: "telegram", chat_id: "222", kind: "private" },
      { channel: "telegram", chat_id: "-900", kind: "group" },
    ];
    const mensajes = [
      { channel: "telegram", chat_id: "111", content: "mío" },
      { channel: "telegram", chat_id: "222", content: "de otra" },
      { channel: "telegram", chat_id: "-900", content: "del grupo" },
      { channel: "telegram", chat_id: "333", content: "de un chat que ya no está" },
    ];
    const tareas = [
      { id: "t1", scope: "casa" },
      { id: "t2", scope: "personal", owner_user_id: "u1" },
      { id: "t3", scope: "personal", owner_user_id: "u2" },
    ];
    const r = armarExportacion({ casa: "c1", leidas: { ...todas(), bot_chats: chats, bot_messages: mensajes, bot_tareas: tareas }, quien: QUIEN });
    expect(r.tablas.bot_chats.filas.map((c) => c.chat_id)).toEqual(["111", "-900"]);
    expect(r.tablas.bot_messages.filas.map((m) => m.content)).toEqual(["mío", "del grupo"]);
    expect(r.tablas.bot_tareas.filas.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});
