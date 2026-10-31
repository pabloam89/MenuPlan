/**
 * El turno de Lola ante una ráfaga (trozo 28 de #1037). Primero se mide: un
 * mensaje que llega con el turno en marcha queda apuntado en el turno que lo
 * atiende, con su distancia al inicio del anterior (medidaTurno.js).
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

  it("con escrituras: el turno sigue y el nuevo va en la vuelta siguiente, medido", async () => {
    const { atender, vistos } = turnoDeMentira({ escribe: true });
    const p = conPlazo(Date.now(), () => enTurno("c1", msj("apunta leche en la compra"), atender));
    await vi.advanceTimersByTimeAsync(4_000); // 1 s de ráfaga y 3 s de turno
    const q = conPlazo(Date.now(), () => enTurno("c1", msj("y pan"), atender));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([p, q]);
    expect(vistos.map((v) => v.items)).toEqual([["apunta leche en la compra"], ["y pan"]]);
    expect(vistos[0].ronda?.signal?.aborted ?? false).toBe(false);
    // El segundo llegó a los 3 s del primer turno (medidaTurno.js llegadosDurante).
    expect(vistos[1].ronda?.llegaron).toEqual({ n: 1, ms: [3_000] });
  });
});
