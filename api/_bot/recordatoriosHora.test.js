/**
 * Los recordatorios que se repiten, a la misma hora de España también en los
 * cambios de hora, y un envío que falla no se pierde (#958).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));

const { siguienteVez, madridAUtc, enviarPendientes } = await import("./recordatorios.js");
const { CADA_MS } = await import("./cadencia.js");

const madrid = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(d);

/** Simula el cron (cada CADA_MS, cadencia.js) durante `horas` y cuenta los envíos. */
function simular(dueLocal, repite, desdeUtc, horas) {
  let due = madridAUtc(dueLocal).toISOString();
  const envios = [];
  for (let t = Date.parse(desdeUtc); t < Date.parse(desdeUtc) + horas * 3600000; t += CADA_MS) {
    if (Date.parse(due) <= t) {
      envios.push(madrid(new Date(due)));
      due = siguienteVez(due, repite, t).toISOString();
    }
  }
  return envios;
}

describe("siguienteVez", () => {
  it("octubre (25-oct-2026): uno de las 00:30 sale una vez por noche, no en cada pasada del cron", () => {
    const envios = simular("2026-10-24T00:30", "diario", "2026-10-23T20:00:00Z", 72);
    expect(envios).toEqual(["2026-10-24 00:30", "2026-10-25 00:30", "2026-10-26 00:30"]);
  });

  it("marzo (28-mar-2027): uno de las 23:30 no se salta el día", () => {
    const envios = simular("2027-03-27T23:30", "diario", "2027-03-27T12:00:00Z", 60);
    expect(envios).toEqual(["2027-03-27 23:30", "2027-03-28 23:30", "2027-03-29 23:30"]);
  });

  it("semanal, la misma hora a través del cambio", () => {
    const s = siguienteVez(madridAUtc("2026-10-20T19:00").toISOString(), "semanal", Date.parse("2026-10-20T18:00:00Z"));
    expect(madrid(s)).toBe("2026-10-27 19:00");
  });

  // La hora de pared no se guarda (solo due_at): la que no existió se queda en
  // la siguiente que existe. Raro (un recordatorio a las 2 y pico) y nunca repetido.
  it("una hora que no existe (02:30 del cambio de marzo) sigue hacia delante", () => {
    const due = madridAUtc("2027-03-27T02:30").toISOString();
    const s = siguienteVez(due, "diario", Date.parse(due));
    expect(s.getTime()).toBeGreaterThan(Date.parse(due));
    expect(madrid(siguienteVez(s.toISOString(), "diario", s.getTime()))).toBe("2027-03-29 03:30");
  });

  it("parado unos días: no se manda una vez por cada vuelta perdida", () => {
    const due = madridAUtc("2026-11-01T09:00").toISOString();
    expect(madrid(siguienteVez(due, "diario", Date.parse("2026-11-05T12:00:00Z")))).toBe("2026-11-06 09:00");
  });

  it("uno que no se repite no tiene siguiente", () => {
    expect(siguienteVez("2026-11-01T09:00:00Z", null)).toBeNull();
  });
});

describe("enviarPendientes cuando falla el envío", () => {
  beforeEach(() => { db.select.mockReset(); db.update.mockReset(); });
  const ahoraMs = Date.parse("2026-11-05T09:01:00Z");
  const r = { id: 5, due_at: "2026-11-05T09:00:00.000Z", repite: null, sent_at: null };

  it("un fallo pasajero lo devuelve a pendiente, condicionado al reclamo", async () => {
    db.select.mockResolvedValue([r]);
    db.update.mockResolvedValue([{ id: 5 }]);
    const n = await enviarPendientes(async () => { throw Object.assign(new Error("red"), { status: 502 }); }, ahoraMs);
    expect(n).toBe(0);
    expect(db.update).toHaveBeenCalledTimes(2);
    const [, filtro, cambios] = db.update.mock.calls[1];
    expect(filtro).toMatch(/status=eq\.sent&sent_at=eq\./);
    expect(cambios).toEqual({ status: "pending", due_at: r.due_at, sent_at: null });
  });

  it("si Telegram dice que no tiene arreglo (bot bloqueado), no se reintenta", async () => {
    db.select.mockResolvedValue([r]);
    db.update.mockResolvedValue([{ id: 5 }]);
    await enviarPendientes(async () => { throw Object.assign(new Error("Forbidden"), { status: 403 }); }, ahoraMs);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("uno que se repite vuelve a su due_at si falla", async () => {
    db.select.mockResolvedValue([{ ...r, repite: "diario" }]);
    db.update.mockResolvedValue([{ id: 5 }]);
    await enviarPendientes(async () => { throw new Error("red"); }, ahoraMs);
    const [, filtro, cambios] = db.update.mock.calls[1];
    expect(filtro).toMatch(/status=eq\.pending&due_at=eq\.2026-11-06/);
    expect(cambios.due_at).toBe(r.due_at);
  });

  it("si sale bien, una sola escritura", async () => {
    db.select.mockResolvedValue([r]);
    db.update.mockResolvedValue([{ id: 5 }]);
    expect(await enviarPendientes(async () => {}, ahoraMs)).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
