import { describe, it, expect } from "vitest";
import { medir, semaforo, informe, huecosDeLola, contarHuecos, corregidos, pct } from "./bot-semana.mjs";

const t = (min) => new Date(Date.UTC(2026, 9, 5, 10, min)).toISOString();
const ruta = (min, m) => ({ created_at: t(min), event: "bot_route", m: { chat: "1", ...m } });
const lola = (ms, extra = {}) => ({ modelo: "claude-sonnet-5", planB: false, vueltas: 2, ms, uso: { in: 1000, out: 200, cr: 5000, cw: 0 }, primera: { in: 1000, cr: 5000, cw: 0 }, herramientas: [], ...extra });

describe("pct", () => {
  it("ignora lo que no es número", () => {
    expect(pct([3, null, 1, 2, undefined], 50)).toBe(2);
    expect(pct([], 95)).toBe(null);
  });
});

describe("corregidos", () => {
  it("el turno seguido de una corrección en el mismo chat y en < 3 min", () => {
    const a = ruta(0, { texto: "algo de cuchara", rapida: false, lola: lola(4000) });
    const b = ruta(1, { texto: "no, algo caliente", ultima: "Te propongo una ensalada." });
    const c = ruta(10, { texto: "no", ultima: "Hecho." }); // demasiado tarde para corregir a b
    expect([...corregidos([a, b, c])]).toEqual([a]);
  });

  it("usa `corrige` si viene apuntado (sin texto)", () => {
    const a = ruta(0, { rapida: false });
    const b = ruta(1, { corrige: true });
    expect(corregidos([a, b]).has(a)).toBe(true);
  });

  it("otro chat no cuenta", () => {
    const a = ruta(0, { rapida: false });
    const b = { ...ruta(1, { corrige: true }), m: { chat: "2", corrige: true } };
    expect(corregidos([a, b]).size).toBe(0);
  });
});

describe("medir", () => {
  const eventos = [
    ruta(0, { rapida: true, ms: 900, primer_ms: 800, router_ms: 400, lola_cancelada: true, router_uso: { in: 500, out: 20 } }),
    ruta(5, { rapida: false, ms: 9000, primer_ms: 3000, router_ms: 450, lola_cancelada: false, lola: lola(8000) }),
    ruta(6, { rapida: false, ms: 12000, primer_ms: 4000, router_ms: 500, lola_cancelada: false, lola: lola(11000, { planB: true }), corrige: true }),
    ruta(30, { sombra: true, rapida: false, ms: 99999 }),
    { created_at: t(7), event: "bot_not_understood", m: {} },
    { created_at: t(8), event: "bot_busqueda", m: { via: "vectores", parecido: 0.31, n: 6 } },
    { created_at: t(9), event: "bot_busqueda", m: { via: "palabras", n: 0 } },
  ];

  it("cuenta turnos sin los de sombra, latencias y calidad", () => {
    const m = medir(eventos, { busquedaParecidoMinimo: 0.4 });
    expect(m.uso.turnos).toBe(3);
    expect(m.latencia.primerTextoRapidaP95Ms).toBe(800);
    expect(m.latencia.primerTextoLolaP95Ms).toBe(4000);
    expect(m.calidad.corregidasPct).toBeCloseTo(100 / 3);
    expect(m.calidad.noEntiendePct).toBe(50);
    expect(m.calidad.planBPct).toBe(50);
    expect(m.busqueda.vaciasPct).toBe(50);
    expect(m.busqueda.flojasPct).toBe(100);
    expect(m.coste.porTurnoUsd).toBeGreaterThan(0);
  });

  it("sin umbral de parecido, solo las vacías son flojas", () => {
    expect(medir(eventos).busqueda.flojasPct).toBe(50);
  });

  it("semáforo: ok null sin objetivo, y compara con el límite", () => {
    const s = semaforo(medir(eventos), { primerTextoLolaP95Ms: 3500, planBMaxPct: 60 });
    expect(s.find((x) => x.clave === "primerTextoLolaP95Ms").ok).toBe(false);
    expect(s.find((x) => x.clave === "planBMaxPct").ok).toBe(true);
    expect(s.find((x) => x.clave === "corregidasMaxPct").ok).toBe(null);
  });

  it("el informe no lleva texto de nadie", () => {
    const conTexto = eventos.map((e) => ({ ...e, m: { ...e.m, texto: "SECRETO de la familia", ultima: "SECRETO" } }));
    const md = informe({ actual: medir(conTexto), anterior: null, objetivos: {}, huecos: contarHuecos(huecosDeLola(conTexto)), desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).not.toMatch(/SECRETO/);
    expect(md).toMatch(/3 turnos/);
  });
});

describe("huecosDeLola", () => {
  it("junta motivos del mismo texto y salta lo que no tiene texto", () => {
    const eventos = [
      ruta(0, { texto: "algo de cuchara", rapida: false, ms: 30000, lola: lola(29000) }),
      ruta(1, { texto: "no, caliente", ultima: "Ensalada." }),
      { created_at: t(2), event: "bot_busqueda", m: { texto: "Algo de cuchara", via: "vectores", parecido: 0.2, n: 5 } },
      { created_at: t(3), event: "bot_supervisor", m: { herramienta: "ajustar_alergias" } },
    ];
    const h = huecosDeLola(eventos, { turnoLolaP95Ms: 20000, busquedaParecidoMinimo: 0.4 });
    expect(h).toHaveLength(1);
    expect(h[0].motivos.sort()).toEqual(["búsqueda floja", "corregida", "lenta"]);
    expect(contarHuecos(huecosDeLola(eventos, {}, { sinTexto: true }))).toMatchObject({ supervisor: 1, corregida: 1 });
  });
});
