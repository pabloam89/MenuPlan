// Lo que se aprende de las señales (trozo 15): qué casas mira cada pasada del cron y qué pide a la tubería.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({ filas: {}, consultas: [], leidas: [], escritas: [], respuestas: [] }));
// Lo que contesta la base a cada insert/update, en orden: un número de filas o un error.
const contestar = async (que) => {
  db.escritas.push(que);
  const r = db.respuestas.shift() ?? 1;
  if (r instanceof Error) throw r;
  return Array.from({ length: r }, () => ({}));
};
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  insert: vi.fn(async (tabla, filas) => contestar({ insert: tabla, filas })),
  update: vi.fn(async (tabla, filtro, cambio) => contestar({ update: tabla, filtro, cambio })),
  select: vi.fn(async (tabla, filtro, columnas) => {
    db.consultas.push({ tabla, filtro, columnas });
    if (columnas === "household_id") return db.filas.casas ?? [];
    if (columnas === "id,valor,peso,veces,ultima_at") return db.leidas.shift() ?? [];
    const casa = /household_id=eq\.([^&]+)/.exec(filtro)?.[1];
    return db.filas[casa] ?? [];
  }),
}));
const datos = vi.hoisted(() => ({ preferencias: {}, escritas: [], resultado: { guardado: true } }));
vi.mock("./datos.js", () => ({
  leerPreferencias: vi.fn(async (casa) => {
    if (datos.preferencias[casa] instanceof Error) throw datos.preferencias[casa];
    return { preferencias: datos.preferencias[casa] ?? [], planes: [] };
  }),
  escribirPreferencias: vi.fn(async (pedido, quien) => { datos.escritas.push({ pedido, quien }); return datos.resultado; }),
}));

const { aprenderDeSenales, sumarSenales, tocaRepaso, HORA_REPASO_UTC } = await import("./aprender.js");
const { ACCION_APRENDER, UMBRAL_APRENDIDO } = await import("../../src/lib/senales.js");

const CADA = 5 * 60000;
const DE_DIA = Date.parse("2026-11-02T10:02:00Z");
const EN_REPASO = Date.parse(`2026-11-02T0${HORA_REPASO_UTC}:01:30Z`);

beforeEach(() => {
  db.filas = {}; db.consultas = []; db.leidas = []; db.escritas = []; db.respuestas = [];
  datos.preferencias = {}; datos.escritas = []; datos.resultado = { guardado: true };
});
afterEach(() => vi.restoreAllMocks());

describe("aprender: qué casas mira cada pasada", () => {
  it("de día, solo las que han tenido una señal en las dos últimas pasadas; en el repaso, todas las que tienen alguna", async () => {
    await aprenderDeSenales({ ahoraMs: DE_DIA, cadaMs: CADA });
    expect(db.consultas[0]).toEqual({ tabla: "senal", columnas: "household_id", filtro: `user_id=is.null&ultima_at=gte.${new Date(DE_DIA - 2 * CADA).toISOString()}` });
    db.consultas = [];
    await aprenderDeSenales({ ahoraMs: EN_REPASO, cadaMs: CADA });
    expect(db.consultas[0]).toEqual({ tabla: "senal", columnas: "household_id", filtro: "user_id=is.null" });
  });

  it("el repaso es la primera pasada de su hora y va después del olvido de la noche (senal-decaer, 0109)", () => {
    expect(tocaRepaso(EN_REPASO, CADA)).toBe(true);
    expect(tocaRepaso(EN_REPASO + CADA, CADA)).toBe(false);
    expect(tocaRepaso(EN_REPASO - 2 * 60000, CADA)).toBe(false);
    const sql = readFileSync(new URL("../../supabase/migrations/0109_preferencia_senal_historial.sql", import.meta.url), "utf8");
    const [, min, hora] = /cron\.schedule\('senal-decaer', '(\d+) (\d+) \* \* \*'/.exec(sql);
    expect(Number(hora) * 60 + Number(min)).toBeLessThan(HORA_REPASO_UTC * 60);
  });
});

describe("aprender: lo que pide a la tubería", () => {
  it("lo que pasa el umbral, en una operación por casa, del sistema, por cron y sin autor", async () => {
    db.filas = { casas: [{ household_id: "c1" }, { household_id: "c1" }], c1: [{ eje: "tecnica", valor: "horno", peso: UMBRAL_APRENDIDO + 1 }] };
    expect(await aprenderDeSenales({ ahoraMs: DE_DIA, cadaMs: CADA })).toEqual({ casas: 1, escritas: 1, fallos: 0 });
    expect(datos.escritas).toEqual([{
      quien: { papel: null },
      pedido: {
        casa: "c1", clave: `${ACCION_APRENDER}:${new Date(DE_DIA).toISOString()}`, accion: ACCION_APRENDER, canal: "sistema",
        ref: { tipo: "cron", id: ACCION_APRENDER },
        preferencias: [expect.objectContaining({ eje: "tecnica", valor: "horno", operador: "mas", origen: "visto" })],
      },
    }]);
  });

  it("sin nada que cambiar no escribe", async () => {
    db.filas = { casas: [{ household_id: "c1" }], c1: [{ eje: "tecnica", valor: "horno", peso: 1 }] };
    expect(await aprenderDeSenales({ ahoraMs: DE_DIA, cadaMs: CADA })).toEqual({ casas: 1, escritas: 0, fallos: 0 });
    expect(datos.escritas).toEqual([]);
  });

  it("una casa que no se lee o no se guarda no para a las demás: cuenta como fallo y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fuerte = [{ eje: "cocina", valor: "china", peso: 9 }];
    db.filas = { casas: [{ household_id: "c1" }, { household_id: "c2" }, { household_id: "c3" }], c1: fuerte, c2: fuerte, c3: fuerte };
    datos.preferencias.c1 = new Error("preferencias sin leer: servidor");
    expect(await aprenderDeSenales({ ahoraMs: DE_DIA, cadaMs: CADA })).toEqual({ casas: 3, escritas: 2, fallos: 1 });
    expect(datos.escritas.map((e) => e.pedido.casa)).toEqual(["c2", "c3"]);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ evento: "senales_sin_aprender", motivo: "preferencias sin leer: servidor" });
    datos.resultado = { guardado: false, fallo: "rpc_ausente" };
    expect(await aprenderDeSenales({ ahoraMs: DE_DIA, cadaMs: CADA })).toEqual({ casas: 3, escritas: 0, fallos: 3 });
  });
});

describe("aprender: sumar las señales de la casa", () => {
  const FILA = { id: 7, valor: true, peso: "2.5", veces: 4, ultima_at: "2026-11-01T10:00:00.123+00:00" };
  const HORNO = { ...FILA, valor: "horno" };
  const choque = (codigo) => Object.assign(new Error(`POST senal → 409 ${codigo}`), { codigo });

  it("la que no está se crea con su delta; la que está se suma solo si nadie la tocó desde que se leyó", async () => {
    // La de la cocina india no está (está la china); la de la salsa, sí.
    db.leidas = [[{ ...FILA, id: 8, valor: "china" }], [FILA]];
    await sumarSenales("c1", [{ eje: "cocina", valor: "india", delta: -1 }, { eje: "llevaSalsa", valor: true, delta: 1 }]);
    expect(db.consultas.map((c) => c.filtro)).toEqual(["household_id=eq.c1&user_id=is.null&eje=eq.cocina", "household_id=eq.c1&user_id=is.null&eje=eq.llevaSalsa"]);
    expect(db.escritas[0]).toEqual({ insert: "senal", filas: [{ household_id: "c1", eje: "cocina", valor: "india", peso: -1, veces: 1 }] });
    expect(db.escritas[1]).toMatchObject({ update: "senal", filtro: `id=eq.7&veces=eq.4&ultima_at=eq.${FILA.ultima_at}`, cambio: { peso: 3.5, veces: 5 } });
  });

  it("si otra la cambió o la creó a la vez, la vuelve a leer y suma sobre la nueva", async () => {
    db.leidas = [[HORNO], [{ ...HORNO, veces: 5, peso: 3.5 }]];
    db.respuestas = [0, 1];
    await sumarSenales("c1", [{ eje: "tecnica", valor: "horno", delta: 1 }]);
    expect(db.escritas.map((e) => e.cambio)).toEqual([expect.objectContaining({ peso: 3.5, veces: 5 }), expect.objectContaining({ peso: 4.5, veces: 6 })]);
    db.leidas = [[], [HORNO]]; db.respuestas = [choque("23505"), 1]; db.escritas = [];
    await sumarSenales("c1", [{ eje: "tecnica", valor: "horno", delta: 1 }]);
    expect(db.escritas.map((e) => Object.keys(e)[0])).toEqual(["insert", "update"]);
  });

  it("falla en alto: otro error de la base, o tres choques seguidos, lanzan", async () => {
    db.leidas = [[]]; db.respuestas = [choque("42501")];
    await expect(sumarSenales("c1", [{ eje: "tecnica", valor: "horno", delta: 1 }])).rejects.toThrow(/42501/);
    db.leidas = [[HORNO], [HORNO], [HORNO]]; db.respuestas = [0, 0, 0];
    await expect(sumarSenales("c1", [{ eje: "tecnica", valor: "horno", delta: 1 }])).rejects.toThrow(/3 choques seguidos/);
  });
});
