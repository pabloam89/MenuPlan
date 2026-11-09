// Trozo 18 de #1407: Lola dice y cambia hasta dónde llega el bot en Mercadona, con el mismo dato que Ajustes
// (mercadona_cuenta.llega_hasta, 0133).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ cuenta: [], encargo: [], fallaSelect: null, fallaUpdate: null, escrito: [] }));
const CASA = "c1";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla, _f, columnas) => {
    if (tabla !== "mercadona_cuenta") return db.encargo;
    if (db.fallaSelect && String(columnas).includes("llega_hasta")) throw db.fallaSelect;
    return db.cuenta;
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async (tabla, _f, cambios) => {
    if (tabla === "mercadona_encargo") return [];
    if (db.fallaUpdate) throw db.fallaUpdate;
    db.escrito.push(cambios);
    return db.cuenta.length ? [{ household_id: CASA, ...cambios }] : [];
  }),
  borrar: vi.fn(async () => null),
  rpc: vi.fn(async () => [{ id: "e1", household_id: CASA, lista: { name: "Compra", products: [] } }]),
}));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(async () => null) }));
vi.mock("./avisar.js", () => ({ avisarFallo: vi.fn() }));

const { update } = await import("./db.js");
const m = await import("./mercadonaEncargos.js");
const lola = await import("./mercadonaLola.js");

const error = (codigo) => Object.assign(new Error("x"), { codigo });
const cuenta = (o = {}) => [{ estado: "conectada", sesion_cifrada: "sellada", llega_hasta: "lista", revisada_at: "2026-11-08T20:00:00Z", tiene_direccion: true, tiene_pago: true, telefono_sellado: "tel", ...o }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADONA_CASAS = CASA;
  Object.assign(db, { cuenta: cuenta(), encargo: [], fallaSelect: null, fallaUpdate: null, escrito: [] });
});

describe("cambiarLlegaHasta: lo comprueba el servidor, no Lola", () => {
  it("con dirección, teléfono y tarjeta, sube hasta pagar y lo escribe", async () => {
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "pagar" })).toEqual({ llega_hasta: "pagar" });
    expect(db.escrito).toEqual([{ llega_hasta: "pagar" }]);
  });

  it("sin lo que pide el paso no escribe nada y dice qué falta, en orden", async () => {
    db.cuenta = cuenta({ tiene_direccion: null, telefono_sellado: null, tiene_pago: false });
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "reservar" })).toEqual({ falta: ["direccion", "telefono"] });
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "pagar" })).toEqual({ falta: ["direccion", "telefono", "pago"] });
    expect(db.escrito).toEqual([]);
  });

  it("bajar siempre se puede, aunque falte todo", async () => {
    db.cuenta = cuenta({ llega_hasta: "pagar", tiene_direccion: false, telefono_sellado: null, tiene_pago: false });
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "lista" })).toEqual({ llega_hasta: "lista" });
  });

  it("sin cuenta, o sin servicio para la casa, no escribe", async () => {
    db.cuenta = [];
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "lista" })).toEqual({ fallo: "sin_cuenta" });
    process.env.MERCADONA_CASAS = "otra";
    expect(await m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "lista" })).toEqual({ fallo: "sin_servicio" });
    expect(update).not.toHaveBeenCalledWith("mercadona_cuenta", expect.anything(), expect.anything());
  });

  it("un valor fuera de la lista es un fallo de quien llama", async () => {
    await expect(m.cambiarLlegaHasta({ casa: CASA, llega_hasta: "todo" })).rejects.toThrow(m.PeticionMala);
  });
});

describe("tomar: el trabajador sabe hasta dónde llegar", () => {
  it("sin la 0133, solo la lista y sin teléfono", async () => {
    db.fallaSelect = Object.assign(error("42703"), { message: "column mercadona_cuenta.llega_hasta does not exist" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.cuenta = [{ sesion_cifrada: "sellada" }];
    expect(await m.tomar()).toMatchObject({ sesion_cifrada: "sellada", llega_hasta: "lista", telefono_sellado: null });
  });

  it("con lo que miró el trabajador: sin revisar, «sin mirar» (null), no false", async () => {
    expect(await m.tomar()).toMatchObject({ llega_hasta: "lista", tiene_direccion: true, tiene_pago: true, tiene_telefono: true, telefono_sellado: "tel" });
    db.cuenta = cuenta({ revisada_at: null, tiene_direccion: false, tiene_pago: false });
    expect(await m.tomar()).toMatchObject({ tiene_direccion: null, tiene_pago: null });
  });

  it("otro fallo no se traga", async () => {
    db.fallaSelect = error("XX000");
    await expect(m.tomar()).rejects.toThrow();
  });
});

describe("Lola: lo que dice", () => {
  it("hasta dónde llega y lo que falta para el paso siguiente", async () => {
    db.cuenta = cuenta({ tiene_direccion: false, telefono_sellado: null });
    expect(await lola.verMercadona({ householdId: CASA })).toBe(
      "Ahora puedo rellenar la lista en tu cuenta de Mercadona. Para reservarte también la hora de entrega, añade tu dirección en la app de Mercadona y dime un teléfono para el repartidor.",
    );
    db.cuenta = cuenta({ llega_hasta: "reservar" });
    expect(await lola.verMercadona({ householdId: CASA })).toMatch(/Si quieres, puedo pagar también\.$/);
    db.cuenta = cuenta({ llega_hasta: "pagar" });
    expect(await lola.verMercadona({ householdId: CASA })).not.toMatch(/Para|Si quieres/);
  });

  it("al cambiar: hecho, o qué falta", async () => {
    expect(await lola.cambiarMercadona({ householdId: CASA, llega_hasta: "reservar" })).toMatch(/^Hecho: .*reservarte la hora de entrega\.$/);
    db.cuenta = cuenta({ telefono_sellado: null });
    expect(await lola.cambiarMercadona({ householdId: CASA, llega_hasta: "reservar" })).toBe("Para eso, primero dime un teléfono para el repartidor. Cuando esté, vuelve a pedírmelo.");
  });

  it("cada cosa que puede faltar tiene su frase, y cada paso la suya", async () => {
    const { FALTAS_MERCADONA, LLEGA_HASTA_MERCADONA } = await import("../../src/lib/mercadonaLlegaHasta.js");
    expect(Object.keys(lola.TEXTO_FALTA).sort()).toEqual([...FALTAS_MERCADONA].sort());
    expect(Object.keys(lola.QUE_HACE).sort()).toEqual([...LLEGA_HASTA_MERCADONA].sort());
  });
});
