/**
 * La 0085 cierra el vocabulario de las tablas del bot, y el código tiene que
 * decir lo mismo. En CI no hay Postgres: se lee el texto SQL, como en
 * src/lib/registroTareasV2.test.js.
 *
 * Y lo que el bot deja de escribir (nombres de Telegram sin lector) se mira
 * con lo que de verdad manda a la base, no con el JSON de la migración.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("./db.js", () => ({ select: vi.fn(async () => []), insert: vi.fn(async () => []), update: vi.fn(async () => []), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), hoyISO: () => "2026-10-06" }));
vi.mock("./menu.js", () => ({ describirCompra: vi.fn() }));
vi.mock("./pintar.js", () => ({ pintarMenuEntero: vi.fn() }));

const { select, insert, update } = await import("./db.js");
const { crearRecordatorio } = await import("./recordatorios.js");
// Los avisos de hoy (bot_tareas.aviso, 0122) son los tipos que la 0085 cerró en bot_reminders: la misma lista.
const { AVISOS_RECORDATORIO: TIPOS_RECORDATORIO, TIPO_TAREA, ESTADO_TAREA } = await import("../../src/lib/vocabularios.js");
const { TIPO_VISPERA, VISPERA, avisoVispera } = await import("./vispera.js");
const { recordar } = await import("./rapido.js");

const leer = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
// Sin comentarios: los SELECT de comprobación y la limpieza aplazada no son esquema.
const sinComentarios = (sql) => sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const sql = sinComentarios(leer("0085_bot_vocabulario_cerrado.sql"));
const valores = (lista) => [...lista.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();

/** Los valores del CHECK de channel de una tabla, o null. */
const canalesDe = (texto, tabla) => {
  const m = texto.match(new RegExp(`alter table public\\.${tabla} add constraint ${tabla}_channel_check\\s+check \\(channel in \\(([^)]*)\\)\\)([^;]*);`, "i"));
  return m ? { valores: valores(m[1]), resto: m[2] } : null;
};

describe("0085: channel con los mismos valores en todas las tablas del bot", () => {
  // Las que ya lo tenían, en línea en su create table (0057, 0058).
  const enLinea = sinComentarios(leer("0057_bot_cimientos.sql") + leer("0058_bot_codigos.sql"))
    .match(/channel\s+text not null check \(channel in \(([^)]*)\)\)/gi);
  const deAntes = [...new Set((enLinea ?? []).map((c) => valores(c).join(",")))];

  it("bot_identities, bot_chats y bot_codigos ya lo llevan, con un único juego de valores", () => {
    expect(enLinea).toHaveLength(3);
    expect(deAntes).toHaveLength(1);
  });

  for (const tabla of ["bot_messages", "bot_reminders", "bot_tareas", "bot_cola"]) {
    it(`${tabla}: el mismo CHECK, NOT VALID y reaplicable`, () => {
      const c = canalesDe(sql, tabla);
      expect(c, `no encuentro el CHECK de channel en ${tabla}`).toBeTruthy();
      expect(c.valores.join(",")).toBe(deAntes[0]);
      expect(c.resto).toMatch(/not valid/i);
      expect(sql).toMatch(new RegExp(`alter table public\\.${tabla} drop constraint if exists ${tabla}_channel_check;`, "i"));
    });
  }
});

describe("0085: bot_reminders.tipo = TIPOS_RECORDATORIO", () => {
  it("el CHECK tiene los valores del código, y es NOT VALID", () => {
    const m = sql.match(/check \(tipo in \(([^)]*)\)\)\s*not valid;/i);
    expect(m, "no encuentro el CHECK de tipo NOT VALID").toBeTruthy();
    expect(valores(m[1])).toEqual([...TIPOS_RECORDATORIO].sort());
  });

  it("el default es «libre» (lo que cae de un bot que no conoce la columna)", () => {
    expect(sql).toMatch(/add column if not exists tipo text not null default 'libre'/i);
    expect(TIPOS_RECORDATORIO).toContain("libre");
  });

  it("el tipo de la víspera es uno de ellos, y el disparador y el backfill usan el texto del código", () => {
    expect(TIPOS_RECORDATORIO).toContain(TIPO_VISPERA);
    expect(sql).toContain(`new.text = '${VISPERA}'`);
    expect(sql).toContain(`new.tipo := '${TIPO_VISPERA}'`);
    expect(sql).toMatch(new RegExp(`set tipo = '${TIPO_VISPERA}'\\s+where text = '${VISPERA}'`, "i"));
  });

  it("la función del disparador no la puede llamar nadie de fuera", () => {
    expect(sql).toMatch(/revoke all on function public\.bot_reminders_tipo_vispera\(\) from public, anon, authenticated;/i);
  });
});

describe("0085 solo añade (salvo bot_deshacer.descripcion)", () => {
  it("no quita más columnas que esa", () => {
    const quitadas = [...sql.matchAll(/alter table public\.(\w+)\s+drop column(?: if exists)? (\w+)/gi)].map((m) => `${m[1]}.${m[2]}`);
    expect(quitadas).toEqual(["bot_deshacer.descripcion"]);
  });

  it("ningún CHECK nuevo se valida al aplicar", () => {
    const nuevos = [...sql.matchAll(/add constraint \w+\s+check[\s\S]*?;/gi)].map((m) => m[0]);
    expect(nuevos.length).toBeGreaterThan(0);
    for (const c of nuevos) expect(c).toMatch(/not valid;$/i);
  });

  it("ni tablas ni disparadores que se borren fuera de los suyos", () => {
    expect(sql).not.toMatch(/drop table/i);
    expect([...sql.matchAll(/drop trigger if exists (\w+)/gi)].map((m) => m[1])).toEqual(["bot_reminders_tipo_vispera"]);
  });
});

describe("el código usa el aviso, no el texto (recordatorios en bot_tareas, 0122)", () => {
  beforeEach(() => vi.clearAllMocks());
  const chat = { channel: "telegram", chatId: "c1", householdId: "h1", autor: "Ana" };

  it("avisoVispera busca, descarta y crea el aviso por su aviso, en bot_tareas", async () => {
    select.mockResolvedValueOnce([{ id: "u-7" }]).mockResolvedValueOnce([]);
    await avisoVispera(chat, { activar: true, hora: "20:30" });
    expect(select.mock.calls[0][0]).toBe("bot_tareas");
    expect(select.mock.calls[0][1]).toContain(`aviso=eq.${TIPO_VISPERA}`);
    expect(select.mock.calls[0][1]).toContain(`tipo=eq.${TIPO_TAREA.RECORDATORIO}`);
    expect(select.mock.calls[0][1]).not.toContain("texto=eq.");
    const [tablaU, filtroU, cambio] = update.mock.calls[0];
    expect(tablaU).toBe("bot_tareas");
    expect(filtroU).toContain(`aviso=eq.${TIPO_VISPERA}`);
    expect(cambio).toMatchObject({ status: ESTADO_TAREA.DESCARTADA });
    expect(cambio.closed_at).toBeTruthy();
    const [tabla, [fila]] = insert.mock.calls[0];
    expect(tabla).toBe("bot_tareas");
    expect(fila).toMatchObject({ tipo: TIPO_TAREA.RECORDATORIO, aviso: TIPO_VISPERA, texto: VISPERA, repite: "diario" });
  });

  it("un recordatorio normal es «libre», con su hora y su caducidad, y sin el nombre de quien lo pidió", async () => {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    expect(await crearRecordatorio(chat, { texto: "Sacar el pollo", cuando: manana })).toMatch(/^Recordatorio creado/);
    const [tabla, [fila]] = insert.mock.calls.at(-1);
    expect(tabla).toBe("bot_tareas");
    expect(fila).toMatchObject({ tipo: TIPO_TAREA.RECORDATORIO, aviso: "libre", texto: "Sacar el pollo", repite: null });
    // El CHECK de la 0122: caduca después de su hora.
    expect(Date.parse(fila.caduca_at)).toBeGreaterThan(Date.parse(fila.ejecutar_at));
    expect(fila).not.toHaveProperty("created_by");
    expect(JSON.stringify(fila)).not.toContain("Ana");
  });

  it("un aviso que no está en la lista no llega a la base", async () => {
    await expect(crearRecordatorio(chat, { texto: "x", cuando: "2099-01-01T10:00", aviso: "otro" })).rejects.toThrow(/aviso/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("sin casa no hay dónde guardarlo: lo dice y no escribe", async () => {
    expect(await crearRecordatorio({ ...chat, householdId: null }, { texto: "x", cuando: "2099-01-01T10:00" })).toMatch(/conecta/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("la memoria de la vía rápida no guarda el nombre de Telegram", async () => {
    await recordar({ chatId: "c1", householdId: "h1", pregunta: "¿qué hay hoy?", respuesta: "Lentejas", autor: "Ana" });
    const [tabla, filas] = insert.mock.calls[0];
    expect(tabla).toBe("bot_messages");
    expect(filas.map((f) => f.author_id)).toEqual([null, null]);
  });
});
