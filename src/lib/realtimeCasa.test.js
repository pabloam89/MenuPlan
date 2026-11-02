import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escucharCasa, vigilarCasa, temaDeCasa, EVENTO_REV, ESTADO_SENAL } from "./realtimeCasa.js";

const CASA = "11111111-2222-3333-4444-555555555555";

// Un cliente de supabase-js de juguete: guarda el tema, el oyente y el callback de subscribe para dispararlos a mano.
function clienteDePrueba({ authFalla = false } = {}) {
  const c = { quitados: 0, tema: null, opciones: null, oyente: null, evento: null, alSuscribir: null };
  const canal = {
    on: (tipo, filtro, fn) => { c.tipo = tipo; c.evento = filtro.event; c.oyente = fn; return canal; },
    subscribe: (fn) => { c.alSuscribir = fn; return canal; },
  };
  c.channel = (tema, opciones) => { c.tema = tema; c.opciones = opciones; return canal; };
  c.removeChannel = () => { c.quitados += 1; };
  c.realtime = { setAuth: () => (authFalla ? Promise.reject(new Error("sin token")) : Promise.resolve()) };
  c.estado = (e, err) => c.alSuscribir(e, err);
  c.senal = (payload) => c.oyente({ payload });
  return c;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("la señal de la casa (trozo 20)", () => {
  it("escucha el tema privado de su casa y el evento que manda la 0121", async () => {
    const c = clienteDePrueba();
    const alCambiar = vi.fn();
    escucharCasa(c, CASA, { alCambiar, alEstado: () => {} });
    await tick();
    expect(c.tema).toBe(`casa:${CASA}`);
    expect(c.opciones).toEqual({ config: { private: true } });
    expect([c.tipo, c.evento]).toEqual(["broadcast", EVENTO_REV]);
    c.senal({ rev: 7 });
    c.senal({ rev: "no" });
    expect(alCambiar.mock.calls).toEqual([[7]]);
  });

  it("el tema es el mismo texto que monta la migración", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../supabase/migrations/0121_senal_de_casa.sql", import.meta.url), "utf8");
    expect(temaDeCasa(CASA).startsWith("casa:")).toBe(true);
    expect(sql).toContain(`realtime.send(jsonb_build_object('rev', new.bot_rev), '${EVENTO_REV}', 'casa:' || new.household_id::text, true)`);
  });

  it("si no puede poner el token, lo dice como error y no se suscribe", async () => {
    const c = clienteDePrueba({ authFalla: true });
    const alEstado = vi.fn();
    escucharCasa(c, CASA, { alCambiar: () => {}, alEstado });
    await tick();
    expect(alEstado).toHaveBeenCalledWith(false, ESTADO_SENAL.ERROR, "sin token");
    expect(c.alSuscribir).toBeNull();
  });

  describe("vigilarCasa", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("sondea mientras no hay señal; suscrita, deja de sondear y mira una vez; si se cae, vuelve a sondear", async () => {
      const c = clienteDePrueba();
      const mirar = vi.fn();
      const anotar = vi.fn();
      const dejar = vigilarCasa(CASA, { mirar, cadaMs: 1000, anotar }, c);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mirar).toHaveBeenCalledTimes(1);

      c.estado(ESTADO_SENAL.SUSCRITA);
      expect(mirar).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mirar).toHaveBeenCalledTimes(2);
      c.senal({ rev: 3 });
      expect(mirar).toHaveBeenCalledTimes(3);

      c.estado(ESTADO_SENAL.ERROR, new Error("caído"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(mirar).toHaveBeenCalledTimes(4);
      expect(anotar.mock.calls).toEqual([[ESTADO_SENAL.SUSCRITA, undefined], [ESTADO_SENAL.ERROR, "caído"]]);

      dejar();
      await vi.advanceTimersByTimeAsync(5000);
      expect(mirar).toHaveBeenCalledTimes(4);
      expect(c.quitados).toBe(1);
    });

    it("sin cliente (sin Supabase) sondea como siempre y lo anota", async () => {
      const mirar = vi.fn();
      const anotar = vi.fn();
      vigilarCasa(CASA, { mirar, cadaMs: 1000, anotar }, null);
      await vi.advanceTimersByTimeAsync(3000);
      expect(mirar).toHaveBeenCalledTimes(3);
      expect(anotar).toHaveBeenCalledWith(ESTADO_SENAL.CERRADA, "sin cliente o sin casa");
    });
  });
});
