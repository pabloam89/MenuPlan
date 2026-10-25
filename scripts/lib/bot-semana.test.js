import { describe, it, expect } from "vitest";
import { medir, semaforo, informe, huecosDeLola, contarHuecos, corregidos, pct, lugarDe, porLugar, medirPorLugar, herramientasMs, modeloMs, costeDeCancelada, PRECIOS, usd } from "./bot-semana.mjs";

const t = (min) => new Date(Date.UTC(2026, 9, 5, 10, min)).toISOString();
const ruta = (min, m) => ({ created_at: t(min), event: "bot_route", m: { chat: "1", ...m } });
const lola = (ms, extra = {}) => ({ modelo: "claude-sonnet-5", planB: false, vueltas: 2, ms, uso: { in: 1000, out: 200, cr: 5000, cw: 0 }, primera: { in: 1000, cr: 5000, cw: 0 }, herramientas: [], ...extra });

describe("tarifa de caché escrita (#909)", () => {
  const millon = { in: 0, out: 0, cr: 0, cw: 1e6 };
  it("a 1 h (Lola) cuesta 2× la entrada; a 5 min (enrutador), 1,25×", () => {
    for (const f of Object.values(PRECIOS)) {
      expect(usd(millon, f)).toBeCloseTo(2 * f.in, 10);
      expect(usd(millon, f, { ttl: "5m" })).toBeCloseTo(1.25 * f.in, 10);
    }
  });
  it("el coste de un turno de Lola cuenta la caché escrita a 1 h", () => {
    const m = { lola: { modelo: "claude-sonnet-5", uso: { in: 0, out: 0, cr: 0, cw: 1e6 } } };
    expect(costeDeCancelada(m, null).usd).toBeCloseTo(2 * PRECIOS.sonnet.in, 10);
  });
});

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

  it("separa lo que se corrigió solo de lo que no se guardó nunca", () => {
    const m = medir([
      { created_at: t(1), event: "bot_claimed_unsaved", m: { sigue: false } },
      { created_at: t(2), event: "bot_claimed_unsaved", m: { sigue: true } },
      { created_at: t(3), event: "bot_claimed_unsaved", m: {} },
    ]);
    expect(m.calidad.dijoQueGuardo).toBe(3);
    expect(m.calidad.sinGuardarFinal).toBe(1);
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

describe("medir: dónde se va el tiempo de Lola", () => {
  it("modelo = llamadas menos herramientas; resto = turno menos llamadas", () => {
    const turno = ruta(0, { rapida: false, ms: 12000, lola: lola(11000, {
      herramientas: [["generar_menu", 2000], ["ajustar_cocina", 1000]],
      llamadas: [[4000, 300, null], [7000, 500, 6500]],
    }) });
    const m = medir([turno]).latencia;
    expect(m.modeloP50Ms).toBe(8000);
    expect(m.herramientasP50Ms).toBe(3000);
    expect(m.restoP50Ms).toBe(1000);
    expect(m.tokensSalidaPorLlamadaP50).toBe(500);
    expect(m.primerTrozoP50Ms).toBe(6500);
  });

  it("sin llamadas apuntadas (turnos de antes del 3 oct), sin desglose", () => {
    expect(medir([ruta(0, { rapida: false, ms: 5000, lola: lola(4000) })]).latencia.modeloP50Ms).toBeNull();
  });
});

describe("medir: las herramientas, de reloj y no sumadas (#910)", () => {
  // Cinco escrituras de una casa en fila (desde ac4bdcc3): cada una lleva dentro la espera de las anteriores.
  const enFila = [["fuera_de_casa", 400], ["fuera_de_casa", 800], ["fuera_de_casa", 1200], ["fuera_de_casa", 1600], ["fuera_de_casa", 2000]];
  const llamadas = [[1500, 200, 900], [3500, 300, 3000]];

  it("con el reloj apuntado, las herramientas son lo que esperó el turno, no la suma", () => {
    const turno = ruta(0, { rapida: false, ms: 6000, lola: lola(5500, { herramientas: enFila, herramientas_reloj_ms: 2000, llamadas }) });
    const m = medir([turno]).latencia;
    expect(m.herramientasP50Ms).toBe(2000); // la suma daría 6000
    expect(m.modeloP50Ms).toBe(3000); // 5000 de llamadas menos 2000 de herramientas (con la suma, 0)
    expect(m.herramientasRelojN).toBe(1);
  });

  it("una fila anterior a #910 no trae el reloj: se usa la suma, y el informe dice cuántas son de reloj", () => {
    const vieja = ruta(0, { rapida: false, ms: 8000, lola: lola(7500, { herramientas: enFila, llamadas: [[2000, 200, 900], [6000, 300, 3000]] }) });
    const nueva = ruta(1, { rapida: false, ms: 6000, lola: lola(5500, { herramientas: enFila, herramientas_reloj_ms: 2000, llamadas }) });
    const m = medir([vieja, nueva]);
    expect(m.latencia.herramientasRelojN).toBe(1);
    expect(m.latencia.herramientasN).toBe(2);
    expect(herramientasMs(vieja.m.lola)).toBe(6000);
    expect(modeloMs(vieja.m.lola)).toBe(2000);
    const md = informe({ actual: m, anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/de reloj en 1 de 2 turnos con herramientas, el resto sumadas/);
  });

  it("si ningún turno llamó a herramientas, el informe no habla de reloj ni de sumas", () => {
    const sin = ruta(0, { rapida: false, ms: 3000, lola: lola(2500, { herramientas: [], llamadas: [[2500, 100, 800]] }) });
    const m = medir([sin]);
    expect(m.latencia.herramientasN).toBe(0);
    const md = informe({ actual: m, anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/Dónde se va el tiempo de Lola/);
    expect(md).not.toMatch(/de reloj|sumadas/);
  });

  it("un turno sin herramientas no cuenta como «sin reloj» si los demás sí lo traen", () => {
    const sin = ruta(0, { rapida: false, ms: 3000, lola: lola(2500, { herramientas: [], llamadas: [[2500, 100, 800]] }) });
    const con = ruta(1, { rapida: false, ms: 6000, lola: lola(5500, { herramientas: enFila, herramientas_reloj_ms: 2000, llamadas }) });
    const md = informe({ actual: medir([sin, con]), anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toContain("(de reloj)");
    expect(md).not.toMatch(/sumadas/);
  });

  it("nunca sale un tiempo de modelo negativo", () => {
    expect(modeloMs({ herramientas: [["a", 9000]], llamadas: [[1000, 1, null]] })).toBe(0);
  });
});

describe("medir: la Lola especulativa cancelada (#910)", () => {
  const acabada = ruta(0, { rapida: false, ms: 5000, lola_cancelada: false, lola: lola(4500) });
  const estimada = ruta(1, { rapida: true, ms: 900, primer_ms: 800, lola_cancelada: true });
  const medida = ruta(2, { rapida: true, ms: 900, primer_ms: 800, lola_cancelada: true, lola_cancelada_uso: { in: 14, out: 52, cr: 61000, cw: 120 } });

  it("cuenta cuántas son, cuáles con el uso medido al cortar y cuáles estimadas", () => {
    const c = medir([acabada, estimada, medida]).coste.canceladas;
    expect(c).toMatchObject({ n: 2, medidas: 1, estimadas: 1 });
    expect(c.usd).toBeGreaterThan(0);
    expect(medir([acabada, estimada, medida]).uso.canceladasPct).toBeCloseTo((100 * 2) / 3);
  });

  it("el uso medido se paga con la tarifa de Sonnet, y el estimado con la mediana de la primera llamada", () => {
    const med = costeDeCancelada(medida.m, { in: 1000, cr: 5000, cw: 0, out: 0 });
    expect(med.estimado).toBe(false);
    expect(med.usd).toBeCloseTo(usd({ in: 14, out: 52, cr: 61000, cw: 120 }, PRECIOS.sonnet), 10);
    const est = costeDeCancelada(estimada.m, { in: 1000, cr: 5000, cw: 0, out: 0 });
    expect(est.estimado).toBe(true);
    expect(est.usd).toBeCloseTo(usd({ in: 1000, cr: 5000, cw: 0, out: 0 }, PRECIOS.sonnet), 10);
  });

  it("si la cancelada llegó a acabar (trae lola.uso), cuenta ese uso y no es estimada", () => {
    const acabadaYCortada = ruta(3, { rapida: true, ms: 900, lola_cancelada: true, lola: lola(800) });
    expect(costeDeCancelada(acabadaYCortada.m, { in: 1, cr: 1, cw: 1, out: 0 }).estimado).toBe(false);
  });

  it("el coste total no cambia por el reparto: es la suma de lo de cada turno", () => {
    const solo = medir([acabada, medida]).coste;
    expect(solo.totalUsd).toBeCloseTo(usd(acabada.m.lola.uso, PRECIOS.sonnet) + solo.canceladas.usd, 10);
  });

  it("el informe lo cuenta, sin texto de nadie", () => {
    const md = informe({ actual: medir([acabada, estimada, medida]), anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/Lola especulativa cancelada.*1 con uso medido, 1 estimados/);
  });
});

describe("medir: el alta, las fotos y los PDF, la cola y el motor en frío (#910)", () => {
  const texto = ruta(0, { rapida: false, ms: 6000, primer_ms: 2000, lola_cancelada: false, lola: lola(5500) });
  const pdf = ruta(1, { rapida: false, ms: 23000, primer_ms: 22000, lola_cancelada: false, sin_enrutador: "pdf", espera_candado_ms: 4000, lola: lola(22000) });
  const foto = ruta(2, { rapida: false, ms: 9000, primer_ms: 8000, lola_cancelada: false, sin_enrutador: "foto", lola: lola(8000) });
  const alta = ruta(3, { rapida: false, ms: 15000, primer_ms: 5000, lola_cancelada: false, sin_enrutador: "alta", motor_frio: 1800, lola: lola(14000) });
  const detras = ruta(4, { rapida: false, ms: 7000, primer_ms: 2500, lola_cancelada: false, espera_cola_ms: 21000, lola: lola(6500) });
  const todos = [texto, pdf, foto, alta, detras];

  it("cuenta de dónde viene cada turno", () => {
    expect(medir(todos).uso.porOrigen).toEqual({ enrutador: 2, pdf: 1, foto: 1, alta: 1 });
    expect(medir(todos).uso.turnos).toBe(5);
  });

  it("un PDF de 23 s no sube el p95 de los turnos de texto: va aparte", () => {
    const m = medir(todos).latencia;
    expect(m.turnoLolaP95Ms).toBe(7000);
    expect(m.adjuntosYAltasP95Ms).toBe(23000);
    expect(m.adjuntosYAltasP50Ms).toBe(15000);
  });

  it("pero cuenta en el coste y en los corregidos: es un turno de Lola", () => {
    expect(medir(todos).coste.porTurnoUsd).toBeGreaterThan(0);
    const corregido = ruta(2, { corrige: true });
    expect(corregidos([pdf, corregido]).has(pdf)).toBe(true);
  });

  it("la espera en la cola (texto) y la del candado (foto y PDF) no se mezclan; y el motor en frío", () => {
    const m = medir(todos);
    expect(m.latencia.esperaColaP95Ms).toBe(21000);
    expect(m.latencia.esperaCandadoP95Ms).toBe(4000);
    expect(m.uso.motorFrioN).toBe(1);
    expect(m.latencia.motorFrioP50Ms).toBe(1800);
  });

  it("el informe avisa de que «corregidos» parte la serie en #910", () => {
    const md = informe({ actual: medir([texto]), anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/criterio estrecho.*filas anteriores.*criterio viejo.*la serie se parte/);
  });

  it("sin nada de esto, el informe no añade líneas", () => {
    const md = informe({ actual: medir([texto]), anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).not.toMatch(/sin pasar por el enrutador|Espera de|Motor en frío/);
  });

  it("con ello, el informe lo cuenta, y los PDF lentos no cuentan como «lentos»", () => {
    const md = informe({ actual: medir(todos), anterior: null, objetivos: {}, desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/Turnos sin pasar por el enrutador: pdf 1 · foto 1 · alta 1/);
    expect(md).toMatch(/Espera de los mensajes de texto en la cola del chat.*p95 21\.0 s/);
    expect(md).toMatch(/Espera de fotos y PDF por el candado.*p95 4\.0 s/);
    expect(md).toMatch(/Motor en frío.*1 turnos/);
    const huecos = huecosDeLola(todos.map((e) => ({ ...e, m: { ...e.m, texto: "x" } })), { turnoLolaP95Ms: 10000 });
    expect(huecos.some((h) => h.motivos.includes("lenta"))).toBe(false);
  });
});

describe("privado o grupo", () => {
  const eventos = [
    ruta(0, { chat: "p", esGrupo: false, rapida: false, ms: 4000, primer_ms: 1500, lola_cancelada: false, lola: lola(3500) }),
    ruta(1, { chat: "p", esGrupo: false, rapida: true, ms: 900, primer_ms: 800, lola_cancelada: true }),
    ruta(2, { chat: "g", esGrupo: true, variosAutores: true, rapida: false, ms: 9000, primer_ms: 7000, lola_cancelada: false, lola: lola(8500) }),
    ruta(3, { chat: "g", esGrupo: true, variosAutores: false, rapida: false, ms: 6000, primer_ms: 5000, lola_cancelada: false, lola: lola(5500) }),
    { created_at: t(4), event: "bot_tool_error", m: { herramienta: "x", esGrupo: true } },
    // De antes del 3 oct: no dice dónde fue.
    { created_at: t(5), event: "bot_route", m: { rapida: true, ms: 700, modo: "eleccion" } },
    { created_at: t(6), event: "bot_claimed_unsaved", m: {} },
  ];

  it("lugarDe no supone: sin el dato, null", () => {
    expect(lugarDe(eventos[0])).toBe("privado");
    expect(lugarDe(eventos[2])).toBe("grupo");
    expect(lugarDe(eventos[5])).toBeNull();
    expect(lugarDe({ m: { esGrupo: "true" } })).toBeNull();
  });

  it("reparte cada evento en su lugar, y lo que no lo dice, aparte", () => {
    const l = porLugar(eventos);
    expect([l.privado.length, l.grupo.length, l.sinDato.length]).toEqual([2, 3, 2]);
  });

  it("mide cada lugar por separado", () => {
    const l = medirPorLugar(eventos);
    expect(l.privado.uso.turnos).toBe(2);
    expect(l.privado.uso.rapidaPct).toBe(50);
    expect(l.privado.latencia.primerTextoLolaP50Ms).toBe(1500);
    expect(l.grupo.uso.turnos).toBe(2);
    expect(l.grupo.uso.rapidaPct).toBe(0);
    expect(l.grupo.latencia.primerTextoLolaP95Ms).toBe(7000);
    expect(l.grupo.calidad.fallosHerramienta).toBe(1);
    expect(l.grupo.uso.variosAutoresPct).toBe(50);
    expect(l.privado.calidad.fallosHerramienta).toBe(0);
    expect(l.sinDato).toBe(2);
  });

  it("el informe trae la tabla de privado frente a grupo", () => {
    const md = informe({ actual: medir(eventos), anterior: null, objetivos: {}, lugares: medirPorLugar(eventos), desde: "2026-10-05", hasta: "2026-10-11" });
    expect(md).toMatch(/Privado frente a grupo/);
    expect(md).toMatch(/| Turnos | 2 | 2 |/);
    expect(md).toMatch(/fuera de las dos columnas: 2./);
  });

  it("sin turnos con el dato, el informe no pinta la tabla", () => {
    const viejos = [eventos[5]];
    expect(informe({ actual: medir(viejos), anterior: null, objetivos: {}, lugares: medirPorLugar(viejos), desde: "a", hasta: "b" })).not.toMatch(/Privado frente a grupo/);
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
