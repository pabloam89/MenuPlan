// Trozo 20 de #1407: reservar la hora de entrega. El trabajador ofrece las horas de entrega, la persona elige una (app o botón
// de Telegram) y el trabajador la reserva; lo que se queda a medias, el barrido lo cierra (0134).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ encargo: [], cuenta: [], reserva: [], fallaUpdate: [], escrito: [] }));
const CASA = "c1";
const ID = "0b1c2d3e-4f50-4172-8394-a5b6c7d8e9f0";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla) => (tabla === "mercadona_cuenta" ? db.cuenta : db.encargo)),
  insert: vi.fn(async () => []),
  update: vi.fn(async (tabla, filtro, cambios) => {
    const fallo = db.fallaUpdate.shift();
    if (fallo) throw fallo;
    db.escrito.push({ tabla, filtro, cambios });
    if (tabla !== "mercadona_encargo") return [];
    return filtro.startsWith("id=") ? [{ id: ID, household_id: CASA, canal: "telegram", chat_id: "9", ...cambios }] : [];
  }),
  borrar: vi.fn(async () => null),
  rpc: vi.fn(async (nombre) => (nombre === "tomar_reserva_mercadona" ? db.reserva : [])),
}));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(async () => null) }));
vi.mock("./avisar.js", () => ({ avisarFallo: vi.fn() }));

const { enviar } = await import("./telegram.js");
const { avisarFallo } = await import("./avisar.js");
const m = await import("./mercadonaEncargos.js");
const { TRAS_LA_LISTA } = await import("../../src/lib/mercadonaHoraEntrega.js");
const lola = await import("./mercadonaLola.js");

const error = (codigo) => Object.assign(new Error("x"), { codigo });
// Dos horas de entrega como las de pedido.md, «Horas de entrega», con datos inventados: el 12 nov de 2026 Madrid va en UTC+1.
const F1 = { id: "f1", start: "2026-11-12T14:00:00Z", end: "2026-11-12T15:00:00Z", price: "7.21", available: true, open: true, timezone: "Europe/Madrid" };
const F2 = { id: "f2", start: "2026-11-12T16:00:00Z", end: "2026-11-12T17:00:00Z", price: "0", available: true, open: true, timezone: "Europe/Madrid" };
const LISTA = { lista_xid: "77", entraron: 3, faltan: [] };
const PEDIDO = { pedido_xid: "p9", total: 64.1, horas_entrega: [F1, F2] };
const AHORA = Date.parse("2026-11-09T10:00:00Z");
const CUANDO = new Date(AHORA).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADONA_CASAS = CASA;
  Object.assign(db, { encargo: [], cuenta: [{ sesion_cifrada: "sellada", estado: "conectada" }], reserva: [], fallaUpdate: [], escrito: [] });
});

describe("cambiosDeCierre: qué se escribe según de dónde viene", () => {
  const rellenando = { status: "rellenando" };
  it("con el pedido y sus horas_entrega, a elegir", () => {
    expect(m.cambiosDeCierre(rellenando, { ...LISTA, pedido: PEDIDO }, CUANDO)).toEqual({
      status: "eligiendo", ...LISTA, pedido_xid: "p9", total: 64.1, horas_entrega: [F1, F2], eligiendo_at: CUANDO,
    });
  });

  it("un fallo después de la lista guarda la lista", () => {
    expect(m.cambiosDeCierre(rellenando, { ...LISTA, fallo: "bajo_minimo" }, CUANDO)).toEqual({
      status: "fallido", fallo: "bajo_minimo", fallido_at: CUANDO, ...LISTA,
    });
  });

  it("sin la 0134, la lista va a un hecho, como antes", () => {
    expect(m.cambiosDeCierre(rellenando, { ...LISTA, fallo: "sin_horas" }, CUANDO, { sinReservar: true })).toMatchObject({ status: "hecho", lista_xid: "77" });
    expect(m.cambiosDeCierre(rellenando, { ...LISTA, pedido: PEDIDO }, CUANDO, { sinReservar: true })).not.toHaveProperty("horas_entrega");
  });

  it("un caducado no vuelve a abrirse para elegir: solo cierra la lista", () => {
    expect(m.cambiosDeCierre({ status: "fallido", fallo: "caducado" }, { ...LISTA, pedido: PEDIDO }, CUANDO).status).toBe("hecho");
  });

  it("de reservando: hecho con hasta cuándo se cambia, o fallido sin tocar la lista", () => {
    expect(m.cambiosDeCierre({ status: "reservando" }, { cambiable_hasta: "2026-11-11T18:59:00Z" }, CUANDO)).toEqual({
      status: "hecho", hecho_at: CUANDO, cambiable_hasta: "2026-11-11T18:59:00Z",
    });
    expect(m.cambiosDeCierre({ status: "reservando" }, { fallo: "hora_ocupada" }, CUANDO)).toEqual({ status: "fallido", fallo: "hora_ocupada", fallido_at: CUANDO });
  });
});

describe("cerrar", () => {
  it("ofrece las horas por Telegram, con un botón por hora_entrega", async () => {
    db.encargo = [{ household_id: CASA, status: "rellenando", fallo: null, tomado_at: CUANDO }];
    expect(await m.cerrar(ID, { ...LISTA, pedido: PEDIDO }, AHORA)).toBe(true);
    const [chat, texto, { botones }] = enviar.mock.calls[0];
    expect(chat).toBe("9");
    expect(texto).toBe("Ya tienes la compra en tu carro de Mercadona, 64,10 €. ¿A qué hora te la llevan?");
    expect(botones).toEqual([
      [{ texto: "jueves 12 nov, 15:00–16:00 · 7,21 €", dato: `mhe:${ID}:0` }],
      [{ texto: "jueves 12 nov, 17:00–18:00 · gratis", dato: `mhe:${ID}:1` }],
    ]);
  });

  it("sin la 0134 (42703) guarda la lista como hecho, y lo cuenta", async () => {
    db.encargo = [{ household_id: CASA, status: "rellenando", fallo: null, tomado_at: CUANDO }];
    db.fallaUpdate = [error("42703")];
    expect(await m.cerrar(ID, { ...LISTA, pedido: PEDIDO }, AHORA)).toBe(true);
    expect(db.escrito.at(-1).cambios).toMatchObject({ status: "hecho", lista_xid: "77" });
    expect(avisarFallo).toHaveBeenCalledWith("mercadona_cierre_sin_reservar", expect.anything(), { grave: false });
  });

  it("otro fallo de la base no se traga", async () => {
    db.encargo = [{ household_id: CASA, status: "rellenando", fallo: null, tomado_at: CUANDO }];
    db.fallaUpdate = [error("57014")];
    await expect(m.cerrar(ID, { ...LISTA, pedido: PEDIDO }, AHORA)).rejects.toThrow("x");
  });

  it("al reservar, dice cuándo llega y hasta cuándo se cambia, en la hora de Madrid", async () => {
    db.encargo = [{ household_id: CASA, status: "reservando", fallo: null, tomado_at: CUANDO }];
    vi.mocked((await import("./db.js")).update).mockImplementationOnce(async (_t, _f, cambios) => [{ id: ID, canal: "telegram", chat_id: "9", hora_entrega: F1, ...cambios }]);
    expect(await m.cerrar(ID, { cambiable_hasta: "2026-11-11T18:59:00Z" }, AHORA)).toBe(true);
    expect(enviar.mock.calls[0][1]).toBe("Hecho: te lo llevan el jueves 12 nov, 15:00–16:00 · 7,21 €. Puedes cambiar el pedido hasta el miércoles 11 a las 19:59. Pagar lo haces tú, en la app de Mercadona.");
  });
});

describe("avisoDeCierre tras la lista", () => {
  it.each(["bajo_minimo", "sin_direccion", "sin_horas", "hora_ocupada", "caducado"])("%s: la lista está, y lo que pasó", (fallo) => {
    const t = m.avisoDeCierre({ chat_id: "9", status: "fallido", fallo, lista_xid: "77" });
    expect(t).toMatch(/^Ya tienes la lista en Mercadona, pero /);
    expect(t).toContain(TRAS_LA_LISTA[fallo]);
  });

  it("los fallos de reservar tienen su frase", async () => {
    const { FALLOS_ENCARGO_MERCADONA } = await import("../../src/lib/mercadonaFallos.js");
    expect(FALLOS_ENCARGO_MERCADONA).toEqual(expect.arrayContaining(Object.keys(TRAS_LA_LISTA)));
  });
});

describe("elegir la hora", () => {
  it("una de las ofrecidas: pasa a reservando con ella entera y suelta las demás", async () => {
    db.encargo = [{ id: ID, horas_entrega: [F1, F2] }];
    expect(await m.elegirHoraEntrega({ casa: CASA, encargo: ID, hora_id: "f2" }, AHORA)).toEqual({ encargo: { id: ID, status: "reservando", hora_entrega: F2 } });
    expect(db.escrito[0]).toEqual({
      tabla: "mercadona_encargo", filtro: `id=eq.${ID}&status=eq.eligiendo`,
      cambios: { status: "reservando", hora_entrega: F2, horas_entrega: null, reservando_at: CUANDO },
    });
  });

  it("por la posición del botón, igual", async () => {
    db.encargo = [{ id: ID, horas_entrega: [F1, F2] }];
    expect((await m.elegirHoraEntrega({ casa: CASA, encargo: ID, posicion: 0 })).encargo.hora_entrega).toEqual(F1);
  });

  it("una que no se ofreció, o sin nada que elegir, no escribe", async () => {
    db.encargo = [{ id: ID, horas_entrega: [F1] }];
    expect(await m.elegirHoraEntrega({ casa: CASA, encargo: ID, hora_id: "otra" })).toEqual({ fallo: "no_ofrecida" });
    db.encargo = [];
    expect(await m.elegirHoraEntrega({ casa: CASA, encargo: ID, hora_id: "f1" })).toEqual({ fallo: "sin_elegir" });
    db.encargo = [{ id: ID, horas_entrega: null }];
    expect(await m.elegirHoraEntrega({ casa: CASA, encargo: ID, posicion: 0 })).toEqual({ fallo: "sin_elegir" });
    expect(db.escrito).toEqual([]);
  });

  it("un id que no es de encargo es un fallo de quien llama", async () => {
    await expect(m.elegirHoraEntrega({ casa: CASA, encargo: "x", hora_id: "f1" })).rejects.toThrow(m.PeticionMala);
  });

  it("el botón de Telegram lleva el encargo y la posición, y nada más", () => {
    expect(m.leerBotonHora(`mhe:${ID}:3`)).toEqual({ encargo: ID, posicion: 3 });
    for (const dato of ["mhe:x:1", `mhe:${ID}:10`, `t:${ID}`, undefined]) expect(m.leerBotonHora(dato)).toBeNull();
    expect(Buffer.byteLength(`mhe:${ID}:3`)).toBeLessThanOrEqual(64);
  });

  it("Lola, al pulsar: lo que reserva, o por qué no", async () => {
    db.encargo = [{ id: ID, horas_entrega: [F1] }];
    expect(await lola.elegirHoraConBoton({ householdId: CASA, encargo: ID, posicion: 0 })).toBe("Reservando el jueves 12 nov, 15:00–16:00 · 7,21 €. Te aviso aquí en un momento.");
    db.encargo = [];
    expect(await lola.elegirHoraConBoton({ householdId: CASA, encargo: ID, posicion: 0 })).toBe(lola.TEXTO_NO_ELEGIDA.sin_elegir);
  });
});

describe("tomarReserva", () => {
  it("da el pedido, la hora_entrega, la sesión y el teléfono sellado", async () => {
    db.reserva = [{ id: ID, household_id: CASA, pedido_xid: "p9", hora_entrega: F1, lista: {} }];
    db.cuenta = [{ sesion_cifrada: "sellada", estado: "conectada", telefono_sellado: "tel" }];
    expect(await m.tomarReserva()).toEqual({ reserva: { id: ID, pedido_xid: "p9", hora_entrega: F1 }, sesion_cifrada: "sellada", telefono_sellado: "tel" });
  });

  it("sin reservas, o sin la 0134, null", async () => {
    expect(await m.tomarReserva()).toBeNull();
    const { rpc } = await import("./db.js");
    vi.mocked(rpc).mockRejectedValueOnce(error("PGRST202"));
    expect(await m.tomarReserva()).toBeNull();
  });
});

describe("el barrido de lo de reservar", () => {
  it("tres tandas más, y la de eligiendo suelta sus horas_entrega", async () => {
    await m.barrerCaducados({ ahora: AHORA });
    const filtros = db.escrito.map((e) => e.filtro);
    expect(filtros.slice(2)).toEqual([
      expect.stringMatching(/^status=eq\.eligiendo&eligiendo_at=lt\./),
      expect.stringMatching(/^status=eq\.reservando&reserva_tomada_at=is\.null&reservando_at=lt\./),
      expect.stringMatching(/^status=eq\.reservando&reserva_tomada_at=lt\./),
    ]);
    expect(db.escrito[2].cambios).toMatchObject({ status: "fallido", fallo: "caducado", horas_entrega: null });
    expect(db.escrito[3].cambios).not.toHaveProperty("horas_entrega");
  });

  it("sin la 0134, las dos de antes y nada más", async () => {
    db.fallaUpdate = [undefined, undefined, error("42703")];
    expect(await m.barrerCaducados({ ahora: AHORA })).toBe(0);
  });

  it("los plazos son los de la 0134", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0134_mercadona_hora_entrega.sql"), "utf8");
    expect(sql).toContain(`reservando_at > now() - interval '${m.CADUCA_RESERVA_SIN_COGER_MIN} minutes'`);
    expect(sql).toContain(`un \`eligiendo\` de más de ${m.CADUCA_ELIGIENDO_MIN} minutos`);
    expect(sql).toContain(`un \`reservando\` cogido de más de ${m.CADUCA_RESERVANDO_MIN} minutos`);
  });
});

describe("estadoDeCasa enseña lo de reservar", () => {
  it("con la 0134, las horas_entrega y la elegida; sin ella, lo de antes", async () => {
    const { select } = await import("./db.js");
    await m.estadoDeCasa(CASA);
    expect(vi.mocked(select).mock.calls.find(([t]) => t === "mercadona_encargo")[2]).toContain("horas_entrega,hora_entrega,cambiable_hasta");
    vi.mocked(select).mockImplementation(async (tabla, _f, columnas) => {
      if (tabla === "mercadona_encargo" && columnas.includes("horas_entrega")) throw error("42703");
      return tabla === "mercadona_cuenta" ? db.cuenta : [{ id: ID, status: "hecho" }];
    });
    expect((await m.estadoDeCasa(CASA)).encargo).toEqual({ id: ID, status: "hecho" });
    vi.mocked(select).mockReset();
  });
});
