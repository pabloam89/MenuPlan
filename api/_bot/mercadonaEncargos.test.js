import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOPE_ENCARGO_MS } from "../../scripts/lib/mercadonaTrabajador.mjs";

const db = vi.hoisted(() => ({ cuenta: [], encargo: [], insertar: null, tomado: [] }));
const CASA = "c1";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla) => (tabla === "mercadona_cuenta" ? db.cuenta : db.encargo)),
  insert: vi.fn(async (_t, filas) => {
    if (db.insertar) throw db.insertar;
    return [{ id: "e1", status: "pendiente", ...filas[0] }];
  }),
  update: vi.fn(async (_t, _f, cambios) => [{ id: "e1", household_id: "c1", canal: "telegram", chat_id: null, ...cambios }]),
  borrar: vi.fn(async () => null),
  rpc: vi.fn(async () => db.tomado),
}));

vi.mock("./telegram.js", () => ({ enviar: vi.fn(async () => null) }));
vi.mock("./avisar.js", () => ({ avisarFallo: vi.fn() }));

const { select, insert, update, borrar, rpc } = await import("./db.js");
const { enviar } = await import("./telegram.js");
const m = await import("./mercadonaEncargos.js");
const lista = { name: "Compra", products: [{ merca_code: "1", quantity: 2 }] };
const pedido = { casa: "c1", por: "u1", canal: "app", lista };
const error = (codigo) => Object.assign(new Error("x"), { codigo });
const EN_MARCHA = { household_id: "c1", status: "rellenando", fallo: null, tomado_at: "2026-11-06T11:58:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADONA_CASAS = `otra, ${CASA}`;
  Object.assign(db, { cuenta: [{ estado: "conectada", sesion_cifrada: "sellada" }], encargo: [], insertar: null, tomado: [] });
});

describe("encargar", () => {
  it("encola la lista con quién y por dónde", async () => {
    expect(await m.encargar(pedido)).toEqual({ encargo: { id: "e1", status: "pendiente" } });
    expect(insert.mock.calls[0][1][0]).toMatchObject({ household_id: "c1", created_by: "u1", canal: "app", lista });
  });

  it("sin cuenta no encola", async () => {
    db.cuenta = [];
    expect(await m.encargar(pedido)).toEqual({ fallo: "sin_cuenta" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("con la sesión caducada no gasta un intento", async () => {
    db.cuenta = [{ estado: "caducada" }];
    expect(await m.encargar(pedido)).toEqual({ fallo: "sesion_caducada" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("dos toques a la vez: gana el primero", async () => {
    db.insertar = error("23505");
    expect(await m.encargar(pedido)).toEqual({ fallo: "en_marcha" });
  });

  it("otro fallo de la base lanza", async () => {
    db.insertar = error("57014");
    await expect(m.encargar(pedido)).rejects.toThrow("x");
  });

  it("pasado el tope del día no encola", async () => {
    db.encargo = Array.from({ length: m.TOPE_DIARIO }, (_, i) => ({ id: String(i) }));
    expect(await m.encargar(pedido)).toEqual({ fallo: "tope" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("una lista mal formada lanza", async () => {
    await expect(m.encargar({ ...pedido, lista: { name: "x", products: [] } })).rejects.toBeInstanceOf(m.PeticionMala);
  });

  it("un canal fuera de vocabulario no se escribe", async () => {
    await expect(m.encargar({ ...pedido, canal: "fax" })).rejects.toThrow();
  });

  it("una casa fuera de la lista no encola", async () => {
    process.env.MERCADONA_CASAS = "otra";
    expect(await m.encargar(pedido)).toEqual({ fallo: "sin_servicio" });
    delete process.env.MERCADONA_CASAS;
    expect(await m.encargar(pedido)).toEqual({ fallo: "sin_servicio" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("de la lista solo guarda lo que se usa", async () => {
    await m.encargar({ ...pedido, lista: { name: "C", extra: "x", products: [{ merca_code: 1, quantity: 2, nota: "y" }] } });
    expect(insert.mock.calls[0][1][0].lista).toEqual({ name: "C", products: [{ merca_code: "1", quantity: 2 }] });
  });

  it("sin la 0131 contesta sin_servicio", async () => {
    select.mockRejectedValueOnce(error("PGRST205"));
    expect(await m.encargar(pedido)).toEqual({ fallo: "sin_servicio" });
  });
});

describe("estadoDeCasa", () => {
  it("nunca da la sesión, y del teléfono solo si está", async () => {
    db.cuenta = [{ estado: "conectada", llega_hasta: "reservar", tiene_direccion: true, tiene_pago: false, telefono_sellado: "sellado" }];
    const r = await m.estadoDeCasa("c1");
    expect(select.mock.calls.find((c) => c[0] === "mercadona_cuenta")[2]).not.toContain("sesion_cifrada");
    expect(r).toMatchObject({ cuenta: "conectada", llega_hasta: "reservar", tiene_direccion: true, tiene_pago: false, tiene_telefono: true });
    expect(JSON.stringify(r)).not.toContain("sellado");
  });

  it("sin las columnas de la 0133 (42703) lee solo el estado: llega hasta la lista y nada mirado", async () => {
    select.mockRejectedValueOnce(error("42703"));
    const r = await m.estadoDeCasa("c1");
    expect(select.mock.calls.filter((c) => c[0] === "mercadona_cuenta").map((c) => c[2])).toEqual([expect.stringContaining("llega_hasta"), "estado"]);
    expect(r).toMatchObject({ disponible: true, cuenta: "conectada", llega_hasta: "lista", tiene_direccion: null, tiene_pago: null, tiene_telefono: false });
  });

  it("sin cuenta, nada que decir de ella", async () => {
    db.cuenta = [];
    expect(await m.estadoDeCasa("c1")).toMatchObject({ cuenta: null, llega_hasta: "lista", tiene_direccion: null, tiene_pago: null, tiene_telefono: null });
  });

  it("cierra lo que lleva demasiado: lo cogido, por cuándo se cogió", async () => {
    await m.estadoDeCasa("c1", Date.parse("2026-11-06T12:00:00Z"));
    const [pendiente, rellenando] = update.mock.calls.map((c) => decodeURIComponent(c[1]));
    expect(pendiente).toContain("status=eq.pendiente&created_at=lt.2026-11-06T11:45:00.000Z");
    expect(rellenando).toContain("status=eq.rellenando&tomado_at=lt.2026-11-06T11:50:00.000Z");
    expect(update.mock.calls[0][2]).toMatchObject({ status: "fallido", fallo: "caducado" });
  });

  it("si la segunda tanda falla, la primera ya ha avisado", async () => {
    update.mockResolvedValueOnce([{ canal: "telegram", chat_id: "9", status: "fallido", fallo: "caducado" }]).mockRejectedValueOnce(error("57014"));
    await expect(m.barrerCaducados()).rejects.toThrow("x");
    expect(enviar).toHaveBeenCalledOnce();
  });

  it("el barrido del cron avisa a quien lo pidió por Lola", async () => {
    update.mockResolvedValueOnce([{ id: "e1", canal: "telegram", chat_id: "9", status: "fallido", fallo: "caducado" }]).mockResolvedValueOnce([]);
    expect(await m.barrerCaducados()).toBe(1);
    expect(enviar.mock.calls[0][0]).toBe("9");
    expect(update.mock.calls[0][1]).not.toContain("household_id");
  });

  it("otro fallo de la base lanza", async () => {
    update.mockRejectedValueOnce(error("57014"));
    await expect(m.estadoDeCasa("c1")).rejects.toThrow("x");
  });
});

describe("conectar y desconectar", () => {
  const SELLO = JSON.stringify({ v: 1, k: "a", iv: "b", c: "d" });

  it("guarda la sesión y deja la cuenta como conectada", async () => {
    await m.conectar({ casa: "c1", por: "u1", sesion_cifrada: SELLO });
    expect(insert.mock.calls[0][1][0]).toMatchObject({ sesion_cifrada: SELLO, estado: "conectada" });
    expect(insert.mock.calls[0][2]).toEqual({ upsert: true });
  });

  it.each([
    [""],
    ["x".repeat(m.TOPE_SESION + 1)],
    [{}],
    ["sin sellar"],
    [JSON.stringify({ cookies: [], origins: [] })],
    [JSON.stringify({ v: 1, k: "a", iv: "b", c: "d", mo: "en claro" })],
  ])("rechaza lo que no es un sello %#", async (s) => {
    await expect(m.conectar({ casa: "c1", por: "u1", sesion_cifrada: s })).rejects.toBeInstanceOf(m.PeticionMala);
  });

  it("desconectar borra la única copia", async () => {
    await m.desconectar("c1");
    expect(borrar.mock.calls[0]).toEqual(["mercadona_cuenta", "household_id=eq.c1"]);
  });
});

describe("tomar y cerrar", () => {
  it("sin nada en cola, null", async () => {
    expect(await m.tomar()).toBeNull();
  });

  it("da solo el id, la lista y la sesión sellada", async () => {
    db.tomado = [{ id: "e1", household_id: "c1", lista, created_by: "u1", chat_id: "9" }];
    expect(await m.tomar()).toEqual({ encargo: { id: "e1", lista }, sesion_cifrada: "sellada" });
  });

  it("si la cuenta ya no está, lo cierra como sin_cuenta", async () => {
    db.tomado = [{ id: "e1", household_id: "c1", lista }];
    db.cuenta = [];
    db.encargo = [EN_MARCHA];
    expect(await m.tomar()).toBeNull();
    expect(update.mock.calls[0][2]).toMatchObject({ status: "fallido", fallo: "sin_cuenta" });
  });

  it("sin la función de la 0131 no hay trabajo, y otro fallo lanza", async () => {
    rpc.mockRejectedValueOnce(error("PGRST202"));
    expect(await m.tomar()).toBeNull();
    rpc.mockRejectedValueOnce(error("57014"));
    await expect(m.tomar()).rejects.toThrow("x");
  });

  it("cierra bien, con lo que entró", async () => {
    db.encargo = [EN_MARCHA];
    expect(await m.cerrar("e1", { lista_xid: 77, entraron: 3, faltan: ["9"] })).toBe(true);
    expect(update.mock.calls[0][1]).toContain("status=eq.rellenando");
    expect(update.mock.calls[0][2]).toMatchObject({ status: "hecho", lista_xid: "77", entraron: 3, faltan: ["9"], fallo: null });
  });

  it("repetir el cierre no pisa nada ni avisa otra vez", async () => {
    db.encargo = [{ ...EN_MARCHA, status: "hecho" }];
    expect(await m.cerrar("e1", { lista_xid: 78, entraron: 1, faltan: [] })).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("dos cierres a la vez: solo uno cuenta", async () => {
    db.encargo = [EN_MARCHA];
    update.mockResolvedValueOnce([]);
    expect(await m.cerrar("e1", { fallo: "error" })).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un hecho tardío entra sobre un caducado; un fallo tardío, no", async () => {
    db.encargo = [{ ...EN_MARCHA, status: "fallido", fallo: "caducado" }];
    expect(await m.cerrar("e1", { fallo: "error" })).toBe(false);
    expect(await m.cerrar("e1", { lista_xid: 1, entraron: 1, faltan: [] })).toBe(true);
    expect(update.mock.calls[0][2]).toMatchObject({ status: "hecho", fallo: null, fallido_at: null });
  });

  it("avisa al chat de Telegram, y si Telegram falla sigue cerrado", async () => {
    db.encargo = [EN_MARCHA];
    update.mockResolvedValueOnce([{ canal: "telegram", chat_id: "9", status: "fallido", fallo: "error" }]);
    enviar.mockRejectedValueOnce(new Error("telegram"));
    expect(await m.cerrar("e1", { fallo: "error" })).toBe(true);
    expect(enviar.mock.calls[0][0]).toBe("9");
  });

  it("no manda por Telegram lo pedido por otro canal", async () => {
    db.encargo = [EN_MARCHA];
    update.mockResolvedValueOnce([{ canal: "whatsapp", chat_id: "9", status: "fallido", fallo: "error" }]);
    await m.cerrar("e1", { fallo: "error" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si la sesión caducó, marca la cuenta antes, y solo si no se reconectó después", async () => {
    db.encargo = [EN_MARCHA];
    await m.cerrar("e1", { fallo: "sesion_caducada" });
    expect(update.mock.calls[0][0]).toBe("mercadona_cuenta");
    expect(decodeURIComponent(update.mock.calls[0][1])).toContain(`updated_at=lt.${EN_MARCHA.tomado_at}`);
    expect(update.mock.calls[0][2]).toEqual({ estado: "caducada" });
  });

  it("un bloqueo no toca la cuenta", async () => {
    db.encargo = [EN_MARCHA];
    await m.cerrar("e1", { fallo: "bloqueado" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("un fallo fuera de vocabulario no se escribe", async () => {
    db.encargo = [EN_MARCHA];
    await expect(m.cerrar("e1", { fallo: "raro" })).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("un id que no existe lanza", async () => {
    await expect(m.cerrar("e9", { fallo: "error" })).rejects.toThrow("encargo desconocido");
  });
});

describe("los plazos", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0131_mercadona_encargos.sql"), "utf8");

  it("el de sin coger es el de tomar_encargo_mercadona", () => {
    expect(sql).toContain(`interval '${m.CADUCA_PENDIENTE_MIN} minutes'`);
  });

  it("el de en marcha pasa de lo que el trabajador se permite por encargo", () => {
    expect(m.CADUCA_RELLENANDO_MIN * 60 * 1000).toBeGreaterThan(TOPE_ENCARGO_MS);
  });
});

describe("avisoDeCierre", () => {
  it("desde la app no hay chat al que avisar", () => {
    expect(m.avisoDeCierre({ chat_id: null, status: "hecho" })).toBeNull();
  });

  it("da el enlace y lo que no entró", () => {
    const t = m.avisoDeCierre({ chat_id: "9", status: "hecho", entraron: 3, faltan: ["1"], lista_xid: "77" });
    expect(t).toContain("shopping-lists/77");
    expect(t).toContain("1 no ha entrado");
  });

  it("sin releer la lista, lo dice", () => {
    const t = m.avisoDeCierre({ chat_id: "9", status: "hecho", entraron: null, faltan: null, lista_xid: "77" });
    expect(t).toContain("no he podido comprobar");
    expect(t).toContain("shopping-lists/77");
  });

  it("si caducó, pide volver a conectar", () => {
    expect(m.avisoDeCierre({ chat_id: "9", status: "fallido", fallo: "sesion_caducada" })).toContain("conectar");
  });

  it("nunca calla un fallo", () => {
    expect(m.avisoDeCierre({ chat_id: "9", status: "fallido", fallo: "bloqueado" })).toContain("No he podido");
  });
});
