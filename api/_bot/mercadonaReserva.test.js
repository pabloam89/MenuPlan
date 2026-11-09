// Trozo 22 de #1407: tras la lista, el servidor guarda el pedido y las horas de entrega que trae el trabajador, y se las
// ofrece a la familia; lo que no se elige a tiempo, el barrido lo cierra (0134). Elegir y reservar, en el trozo 22b.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ encargo: [], cuenta: [], fallaUpdate: [], escrito: [] }));
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
  rpc: vi.fn(async () => []),
}));
vi.mock("./telegram.js", () => ({ enviar: vi.fn(async () => null) }));
vi.mock("./avisar.js", () => ({ avisarFallo: vi.fn() }));

const { enviar } = await import("./telegram.js");
const m = await import("./mercadonaEncargos.js");
const { TRAS_LA_LISTA } = await import("../../src/lib/mercadonaHoraEntrega.js");

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
  Object.assign(db, { encargo: [], cuenta: [{ sesion_cifrada: "sellada", estado: "conectada" }], fallaUpdate: [], escrito: [] });
});

describe("cambiosDeCierre: qué se escribe tras la lista", () => {
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

  it("un caducado no vuelve a abrirse para elegir: solo cierra la lista", () => {
    expect(m.cambiosDeCierre({ status: "fallido", fallo: "caducado" }, { ...LISTA, pedido: PEDIDO }, CUANDO).status).toBe("hecho");
  });
});

describe("cerrar", () => {
  it("guarda el pedido y sus horas, y lo dice por Telegram", async () => {
    db.encargo = [{ household_id: CASA, status: "rellenando", fallo: null, tomado_at: CUANDO }];
    expect(await m.cerrar(ID, { ...LISTA, pedido: PEDIDO }, AHORA)).toBe(true);
    expect(db.escrito.at(-1).cambios).toMatchObject({ status: "eligiendo", pedido_xid: "p9", horas_entrega: [F1, F2] });
    const [chat, texto] = enviar.mock.calls[0];
    expect(chat).toBe("9");
    expect(texto).toBe("Ya tienes la compra en tu carro de Mercadona, 64,10 €. ¿A qué hora te la llevan?");
  });

  it("de reservando aún no se cierra nada: eso llega con reservar (22b)", async () => {
    db.encargo = [{ household_id: CASA, status: "reservando", fallo: null, tomado_at: CUANDO }];
    expect(await m.cerrar(ID, { cambiable_hasta: "2026-11-11T18:59:00Z" }, AHORA)).toBe(false);
    expect(db.escrito).toEqual([]);
  });

  it("otro fallo de la base no se traga", async () => {
    db.encargo = [{ household_id: CASA, status: "rellenando", fallo: null, tomado_at: CUANDO }];
    db.fallaUpdate = [error("57014")];
    await expect(m.cerrar(ID, { ...LISTA, pedido: PEDIDO }, AHORA)).rejects.toThrow("x");
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

describe("el barrido de lo que no se elige", () => {
  it("una tanda más, la de eligiendo, que suelta sus horas_entrega", async () => {
    await m.barrerCaducados({ ahora: AHORA });
    const filtros = db.escrito.map((e) => e.filtro);
    expect(filtros.slice(2)).toEqual([expect.stringMatching(/^status=eq\.eligiendo&eligiendo_at=lt\./)]);
    expect(db.escrito[2].cambios).toMatchObject({ status: "fallido", fallo: "caducado", horas_entrega: null });
  });

  it("el plazo es el de la 0134", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0134_mercadona_hora_entrega.sql"), "utf8");
    expect(sql).toContain(`un \`eligiendo\` de más de ${m.CADUCA_ELIGIENDO_MIN} minutos`);
  });
});

describe("estadoDeCasa enseña lo de reservar", () => {
  it("las horas_entrega y la elegida", async () => {
    const { select } = await import("./db.js");
    await m.estadoDeCasa(CASA);
    expect(vi.mocked(select).mock.calls.find(([t]) => t === "mercadona_encargo")[2]).toContain("horas_entrega,hora_entrega,cambiable_hasta");
  });
});
