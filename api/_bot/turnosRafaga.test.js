/**
 * El turno de Lola ante una ráfaga (trozo 28 de #1037): un mensaje que llega
 * con el turno en marcha y sin nada escrito corta ese turno y lo rehace con
 * los dos; con algo escrito, va en la vuelta siguiente; y la espera del
 * principio solo sube de 1 a 3 s si el último mensaje parece a medias.
 *
 * La cola y el candado son de mentira (en memoria), con relojes falsos: el
 * segundo mensaje entra por enTurno como entraría por el webhook (otra
 * invocación que encola, no consigue el candado y se va).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let cola = [];
let ocupado = false;
vi.mock("./db.js", () => ({
  rpc: vi.fn(async (nombre) => {
    if (nombre === "bot_tomar_candado") { if (ocupado) return false; ocupado = true; return true; }
    if (nombre === "bot_soltar_candado") ocupado = false;
    return null;
  }),
  insert: vi.fn(async (_tabla, filas) => { for (const f of filas) cola.push({ id: cola.length + 1, item: f.item, tomado: false }); return []; }),
  update: vi.fn(async () => {
    const libres = cola.filter((f) => !f.tomado);
    for (const f of libres) f.tomado = true;
    return libres.map((f) => ({ id: f.id, item: f.item }));
  }),
  select: vi.fn(async () => cola.filter((f) => !f.tomado).slice(0, 1).map((f) => ({ id: f.id }))),
  eq: (v) => `eq.${v}`,
}));

const turnos = await import("./turnos.js");
const { enTurno } = turnos;
const { conPlazo } = await import("./plazo.js");

const msj = (texto) => ({ texto, enCola: Date.now() });
const textos = (items) => items.map((i) => i.texto);

/**
 * Un turno de mentira que tarda `ms` y, si `escribe`, ya ha escrito en la casa
 * al empezar (como una herramienta que guarda). Se deja cortar por la señal de
 * la ronda: cortado sin escribir, pide rehacer (lo que hace telegram.js turno).
 */
function turnoDeMentira({ ms = 10_000, escribe = false } = {}) {
  const vistos = [];
  const atender = vi.fn(async (items, ronda) => {
    vistos.push({ items: textos(items), ronda });
    if (ronda) ronda.operacion = { escrituras: escribe ? 1 : 0, escribiendo: escribe ? 1 : 0 };
    const cortado = await new Promise((r) => {
      const t = setTimeout(() => r(false), ms);
      ronda?.signal?.addEventListener("abort", () => { clearTimeout(t); r(true); });
    });
    return cortado ? { rehacer: true } : undefined;
  });
  return { atender, vistos };
}

describe("turnosRafaga: otro mensaje con el turno en marcha", () => {
  beforeEach(() => { cola = []; ocupado = false; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("sin escrituras: se corta el turno y se rehace con los dos mensajes", async () => {
    const { atender, vistos } = turnoDeMentira();
    const p = conPlazo(Date.now(), () => enTurno("c1", msj("quiero cambiar la cena del jueves"), atender));
    await vi.advanceTimersByTimeAsync(4_000); // 1 s de ráfaga y 3 s de turno
    const q = conPlazo(Date.now(), () => enTurno("c1", msj("mejor algo con pescado"), atender));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([p, q]);
    expect(vistos.map((v) => v.items)).toEqual([
      ["quiero cambiar la cena del jueves"],
      ["quiero cambiar la cena del jueves", "mejor algo con pescado"],
    ]);
    expect(vistos[0].ronda?.signal?.aborted).toBe(true);
  });

  it("con escrituras: el turno sigue y el nuevo va en la vuelta siguiente, medido; el primero no se pudo medir", async () => {
    const { atender, vistos } = turnoDeMentira({ escribe: true });
    const p = conPlazo(Date.now(), () => enTurno("c1", msj("apunta leche en la compra"), atender));
    await vi.advanceTimersByTimeAsync(4_000); // 1 s de ráfaga y 3 s de turno
    const q = conPlazo(Date.now(), () => enTurno("c1", msj("y pan"), atender));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([p, q]);
    expect(vistos.map((v) => v.items)).toEqual([["apunta leche en la compra"], ["y pan"]]);
    expect(vistos[0].ronda?.signal?.aborted ?? false).toBe(false);
    expect(vistos[0].ronda?.llegaron).toBeNull();
    // El segundo llegó a los 3 s del primer turno (medidaTurno.js llegadosDurante).
    expect(vistos[1].ronda?.llegaron).toEqual({ n: 1, ms: [3_000] });
  });
});

describe("turnosRafaga: la espera solo sube con un mensaje a medias", () => {
  beforeEach(() => { cola = []; ocupado = false; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function rafaga(primero) {
    const { atender, vistos } = turnoDeMentira({ ms: 100 });
    const p = conPlazo(Date.now(), () => enTurno("c1", msj(primero), atender));
    await vi.advanceTimersByTimeAsync(2_000); // el segundo, a los 2 s
    const q = conPlazo(Date.now(), () => enTurno("c1", msj("la del jueves"), atender));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([p, q]);
    return vistos.map((v) => v.items);
  }

  it("termina en «por la del»: espera y junta los dos en un turno", async () => {
    expect(await rafaga("cambia la cena por la del")).toEqual([["cambia la cena por la del", "la del jueves"]]);
  });

  it("completo: a los 2 s ya ha empezado su turno (la espera sigue siendo de 1 s)", async () => {
    expect(await rafaga("cambia la cena del miércoles")).toEqual([["cambia la cena del miércoles"], ["la del jueves"]]);
  });
});

describe("FINALES_INCOMPLETOS: lista cerrada de cómo acaba un mensaje a medias", () => {
  it("es una lista cerrada, sin repetidos y en minúsculas sin tildes (como la deja normal())", () => {
    const { FINALES_INCOMPLETOS } = turnos;
    expect(Object.isFrozen(FINALES_INCOMPLETOS)).toBe(true);
    expect(new Set(FINALES_INCOMPLETOS).size).toBe(FINALES_INCOMPLETOS.length);
    for (const f of FINALES_INCOMPLETOS) expect(f).toMatch(/^[a-z]+( [a-z]+)*$/);
  });

  it("los del plan («y», «que», «la del») y una coma colgando, a medias; lo cerrado, no", () => {
    const { pareceIncompleto } = turnos;
    for (const t of ["quiero pollo y", "dile que", "cambia la cena por la del", "la cena del jueves,", "Pon lentejas Y "]) expect(pareceIncompleto(t)).toBe(true);
    for (const t of ["quiero pollo", "¿y?", "cambia la del jueves.", "vale", "", null]) expect(pareceIncompleto(t)).toBe(false);
  });
});
