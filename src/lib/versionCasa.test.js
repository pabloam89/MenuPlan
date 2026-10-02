import { describe, expect, it } from "vitest";

import { guardarConVersion, guardandoCasa, guardadosDeCasa } from "./versionCasa.js";

// Una base de mentira que hace lo mismo que save_household_state y
// save_menu_week desde la 0068: acepta si la versión coincide y la sube.
function base(rev = 0) {
  const b = {
    rev,
    async guardar(conRev) {
      await new Promise((r) => setTimeout(r, 5));
      if (conRev !== b.rev) return { ok: false, conflict: true, botRev: b.rev };
      b.rev += 1;
      return { ok: true, botRev: b.rev };
    },
  };
  return b;
}

function dispositivo(b) {
  const d = { rev: b.rev, carga: 0 };
  d.version = (carga = d.carga) => ({
    leer: () => d.rev,
    apuntar: (r) => { d.rev = r; },
    vigente: () => d.carga === carga,
  });
  return d;
}

describe("guardarConVersion", () => {
  it("la casa y la semana seguidas no chocan entre sí", async () => {
    const b = base(4);
    const d = dispositivo(b);
    const [casa, semana] = await Promise.all([
      guardarConVersion(d.version(), b.guardar),
      guardarConVersion(d.version(), b.guardar),
    ]);
    expect(casa.ok).toBe(true);
    expect(semana.ok).toBe(true);
    expect(d.rev).toBe(6);
  });

  it("otro dispositivo con la versión vieja choca, y no pisa", async () => {
    const b = base(0);
    const movil = dispositivo(b);
    const portatil = dispositivo(b);
    await guardarConVersion(movil.version(), b.guardar);
    const r = await guardarConVersion(portatil.version(), b.guardar);
    expect(r).toEqual({ ok: false, conflict: true, botRev: 1 });
    expect(portatil.rev).toBe(0);
  });

  it("si la nube se recargó entretanto, lo programado antes no sale", async () => {
    const b = base(0);
    const d = dispositivo(b);
    const viejo = d.version();
    d.carga += 1;
    const r = await guardarConVersion(viejo, b.guardar);
    expect(r.descartado).toBe(true);
    expect(b.rev).toBe(0);
  });

  it("el sondeo sabe que hay un guardado propio en marcha", async () => {
    const b = base(0);
    const d = dispositivo(b);
    const antes = guardadosDeCasa();
    const p = guardarConVersion(d.version(), b.guardar);
    expect(guardandoCasa()).toBe(true);
    expect(guardadosDeCasa()).toBe(antes + 1);
    await p;
    expect(guardandoCasa()).toBe(false);
  });

  it("un guardado que revienta no atasca la cola", async () => {
    const b = base(0);
    const d = dispositivo(b);
    await expect(guardarConVersion(d.version(), async () => { throw new Error("red"); })).rejects.toThrow("red");
    const r = await guardarConVersion(d.version(), b.guardar);
    expect(r.ok).toBe(true);
  });
});
