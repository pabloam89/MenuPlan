import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { dentroDe, dentroDeUnRepo } from "./fabrica.mjs";
import {
  HUECO_ACTIVO_MIN, MIN_ENCARGOS_CELDA, MIN_ENCARGOS_INFORME, MIN_FONDOS_CELDA, PRECIOS, RATIO_PROPUESTA,
  agregarPorIssue, aguantoDe, cobertura, contarEventos, costeDeMensaje, extraer, leerLineas, listarTranscripciones, mediana, precioDe,
  recalibrar, resumirPartes, resumirSesion, textoInforme, tipoDeAgente, unirConGithub,
} from "./lib/fabrica.mjs";
import { CATALOGO, RANGOS, problemas } from "./lib/presupuestos.mjs";

/**
 * La observabilidad de la fábrica (#340, fase F). Todo con transcripciones
 * SINTÉTICAS: ningún test lee ~/.claude ni usa la red ni el reloj. Cada
 * transcripción lleva un marcador secreto en lo que es privado (mensajes,
 * prompts, resultados de herramientas, título, carpeta) y se comprueba que no
 * sale por ninguna vía: el repo es público y el informe puede acabar en un panel.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const SECRETO = "MARCADOR-SECRETO-no-debe-salir-9f3a";

const minuto = (m) => new Date(Date.UTC(2026, 9, 10, 8, 0, 0) + m * 60_000).toISOString();

/** Una línea de transcripción como las de Claude Code, con lo privado sembrado. */
function linea(tipo, m, rama, extra = {}) {
  const base = { type: tipo, timestamp: minuto(m), sessionId: "sesion-sintetica-1", gitBranch: rama, cwd: `C:\\Users\\${SECRETO}\\proyecto`, uuid: `u-${tipo}-${m}-${rama}-${JSON.stringify(extra).length}` };
  if (tipo === "user") return { ...base, message: { role: "user", content: `${SECRETO} dime cosas privadas` } };
  return base;
}
function respuesta(m, rama, { id, modelo = "claude-sonnet-5-5", entrada = 100, salida = 50, lectura = 1000, e5 = 200, e1 = 0, agente } = {}) {
  const content = [{ type: "text", text: `${SECRETO} respuesta privada` }];
  if (agente !== undefined) content.push({ type: "tool_use", name: "Agent", input: { subagent_type: agente, description: SECRETO, prompt: `${SECRETO} haz esto` } });
  content.push({ type: "tool_use", name: "Bash", input: { command: `echo ${SECRETO}` } });
  return {
    type: "assistant", timestamp: minuto(m), sessionId: "sesion-sintetica-1", gitBranch: rama, cwd: `C:\\Users\\${SECRETO}`, uuid: `a-${id}-${m}`,
    message: {
      id, model: modelo, role: "assistant", content,
      usage: { input_tokens: entrada, output_tokens: salida, cache_read_input_tokens: lectura, cache_creation: { ephemeral_5m_input_tokens: e5, ephemeral_1h_input_tokens: e1 } },
    },
  };
}
const ruido = [
  { type: "tool-result-ruido", timestamp: minuto(1), toolUseResult: { stdout: SECRETO } },
  { type: "ai-title", aiTitle: SECRETO },
  { type: "last-prompt", lastPrompt: SECRETO },
];

describe("leer una transcripción: solo estructura", () => {
  it("una línea cortada o rota se salta, no tumba la sesión", () => {
    expect(leerLineas('{"a":1}\n{roto\n\n[1]\n"x"\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(leerLineas(undefined)).toEqual([]);
  });

  it("Claude Code repite un mensaje por bloque: se cuenta una vez, con el mayor de cada cifra", () => {
    const lineas = [
      linea("user", 0, "ops/340-x"),
      respuesta(1, "ops/340-x", { id: "msg_1", salida: 10 }),
      respuesta(1.1, "ops/340-x", { id: "msg_1", salida: 80 }),
      respuesta(2, "ops/340-x", { id: "msg_2", salida: 5 }),
    ];
    const { mensajes } = extraer(lineas);
    expect(mensajes.size).toBe(2);
    expect(mensajes.get("msg_1").salida).toBe(80);
  });

  it("separa la caché de 5 min de la de 1 h, y sin desglose cuenta la escritura como de 5 min", () => {
    const a = respuesta(1, "x", { id: "m1", e5: 7, e1: 9 });
    const b = respuesta(2, "x", { id: "m2" });
    delete b.message.usage.cache_creation;
    b.message.usage.cache_creation_input_tokens = 33;
    const { mensajes } = extraer([a, b]);
    expect([mensajes.get("m1").escritura_5m, mensajes.get("m1").escritura_1h]).toEqual([7, 9]);
    expect([mensajes.get("m2").escritura_5m, mensajes.get("m2").escritura_1h]).toEqual([33, 0]);
  });

  it("ignora lo sintético y lo que no es usuario ni asistente, y no guarda ni un texto", () => {
    const lineas = [linea("user", 0, "x"), ...ruido, respuesta(1, "x", { id: "m1", modelo: "<synthetic>" }), respuesta(2, "x", { id: "m2" })];
    const r = extraer(lineas);
    expect(r.mensajes.size).toBe(1);
    expect(r.eventos).toHaveLength(3); // user + dos del asistente (el sintético cuenta como turno, sin tokens)
    expect(JSON.stringify([r.eventos, [...r.mensajes], r.agentes, r.sesion])).not.toContain(SECRETO);
  });

  it("los agentes lanzados salen con su tipo si es de la lista, «otro» si no y «sin-tipo» si falta", () => {
    expect(tipoDeAgente("revisor")).toBe("revisor");
    expect(tipoDeAgente("general-purpose")).toBe("general-purpose");
    expect(tipoDeAgente(SECRETO)).toBe("otro");
    expect(tipoDeAgente(undefined)).toBe("sin-tipo");
    const r = extraer([respuesta(1, "x", { id: "m1", agente: "gobierno" }), respuesta(2, "x", { id: "m2", agente: SECRETO })]);
    expect(r.agentes.map((a) => a.tipo)).toEqual(["gobierno", "otro"]);
  });

  it("`desde` descarta lo anterior", () => {
    const lineas = [linea("user", 0, "x"), respuesta(5, "x", { id: "m1" }), respuesta(50, "x", { id: "m2" })];
    expect(extraer(lineas, { desde: Date.parse(minuto(10)) }).mensajes.size).toBe(1);
  });
});

describe("minutos activos, rama → issue y agentes por sesión", () => {
  it("suma los huecos de menos de HUECO_ACTIVO_MIN y no los largos (la comida, la noche)", () => {
    const rama = "ops/340-x";
    const lineas = [linea("user", 0, rama), respuesta(3, rama, { id: "m1" }), respuesta(5, rama, { id: "m2" }), respuesta(5 + HUECO_ACTIVO_MIN, rama, { id: "m3" }), respuesta(5 + HUECO_ACTIVO_MIN + 2, rama, { id: "m4" })];
    // huecos: 3 + 2 + (HUECO: no cuenta) + 2
    expect(resumirSesion([lineas]).porIssue.get(340).minutos).toBeCloseTo(7, 5);
  });

  it("una sesión que cambia de rama reparte tiempo y tokens entre los issues de sus ramas", () => {
    const lineas = [
      linea("user", 0, "staging"), respuesta(2, "staging", { id: "m1", salida: 10 }),
      linea("user", 4, "ops/340-x"), respuesta(6, "ops/340-x", { id: "m2", salida: 20 }),
      linea("user", 8, "ops/341-y"), respuesta(10, "ops/341-y", { id: "m3", salida: 30 }),
    ];
    const { porIssue } = resumirSesion([lineas]);
    expect([...porIssue.keys()].sort()).toEqual([340, 341, null].sort());
    expect(porIssue.get(null).tokens.salida).toBe(10);
    expect(porIssue.get(340).tokens.salida).toBe(20);
    expect(porIssue.get(341).tokens.salida).toBe(30);
    expect(porIssue.get(340).minutos).toBeCloseTo(4, 5); // 2 min del hueco 2→4 y 2 del 4→6; el 2→4 es del evento de las 4, que ya es de la rama 340
  });

  it("los minutos son el reloj de la sesión entera: un subagente que corre a la vez no los duplica", () => {
    const rama = "ops/340-x";
    const principal = [linea("user", 0, rama), respuesta(4, rama, { id: "p1" })];
    const sub = [respuesta(1, rama, { id: "s1" }), respuesta(2, rama, { id: "s2" }), respuesta(3, rama, { id: "s3" })];
    expect(resumirSesion([principal, sub]).porIssue.get(340).minutos).toBeCloseTo(4, 5);
  });

  it("cuenta los agentes lanzados por tipo y los tokens de los subagentes en el issue de su rama", () => {
    const rama = "ops/340-x";
    const principal = [linea("user", 0, rama), respuesta(1, rama, { id: "p1", agente: "revisor", salida: 10 }), respuesta(2, rama, { id: "p2", agente: "revisor", salida: 10 })];
    const sub = [respuesta(1.5, rama, { id: "s1", salida: 500 })];
    const c = resumirSesion([principal, sub]).porIssue.get(340);
    expect(c.agentes).toEqual({ revisor: 2 });
    expect(c.subagentes).toBe(2);
    expect(c.tokens.salida).toBe(520);
  });

  it("el historial que Claude Code copia a una sesión bifurcada no se cuenta dos veces", () => {
    const rama = "ops/340-x";
    const original = [linea("user", 0, rama), respuesta(1, rama, { id: "m1", salida: 100 }), respuesta(2, rama, { id: "m2", salida: 100 })];
    const bifurcada = [...original, respuesta(30, rama, { id: "m3", salida: 7 })];
    const vistos = new Set();
    const a = resumirPartes([extraer(original)], { vistos });
    const b = resumirPartes([extraer(bifurcada)], { vistos });
    const total = agregarPorIssue([a, b]).get(340);
    expect(total.tokens.salida).toBe(207);
    expect(total.mensajes).toBe(3);
  });
});

describe("coste estimado: de una tabla con fecha, nunca inventado", () => {
  const m = (extra = {}) => ({ modelo: "claude-sonnet-5-5", entrada: 1_000_000, salida: 1_000_000, lectura: 1_000_000, escritura_5m: 1_000_000, escritura_1h: 1_000_000, ...extra });

  it("tokens × precio por millón, con la caché de lectura y las dos escrituras a su precio", () => {
    // Sonnet 5.5: 2 + 10 + 0,10 + 2,50 + 4
    expect(costeDeMensaje(m())).toBeCloseTo(18.6, 6);
  });

  it("un modelo sin precio da null (no se inventa) y uno con sufijo de fecha usa el de su familia", () => {
    expect(precioDe("claude-modelo-del-futuro-9")).toBeNull();
    expect(costeDeMensaje(m({ modelo: "claude-modelo-del-futuro-9" }))).toBeNull();
    expect(precioDe("claude-haiku-4-5-20251001")).toBe(PRECIOS.modelos["claude-haiku-4-5"]);
  });

  it("Haiku 5.5 con el prompt de más de 100.000 tokens usa su tarifa larga", () => {
    const corto = costeDeMensaje({ modelo: "claude-haiku-5-5", entrada: 90_000, salida: 1000, lectura: 0, escritura_5m: 0, escritura_1h: 0 });
    const largo = costeDeMensaje({ modelo: "claude-haiku-5-5", entrada: 110_000, salida: 1000, lectura: 0, escritura_5m: 0, escritura_1h: 0 });
    expect(corto).toBeCloseTo((90_000 * 0.1 + 1000 * 0.5) / 1e6, 9);
    expect(largo).toBeCloseTo((110_000 * 0.5 + 1000 * 2.5) / 1e6, 9);
  });

  it("un modelo sin precio deja los tokens y marca los mensajes sin precio; el coste solo suma lo que tiene precio", () => {
    const rama = "ops/340-x";
    const lineas = [linea("user", 0, rama), respuesta(1, rama, { id: "m1", modelo: "claude-modelo-del-futuro-9", salida: 10 }), respuesta(2, rama, { id: "m2", salida: 20 })];
    const c = resumirSesion([lineas]).porIssue.get(340);
    expect([c.sin_precio, c.tokens.salida]).toEqual([1, 30]);
    expect(c.coste_usd).toBeGreaterThan(0);
  });

  it("la tabla de precios está marcada como estimación, con fecha y fuente, y es coherente", () => {
    expect(PRECIOS.estimacion).toBe(true);
    expect(PRECIOS.comprobado_el).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRECIOS.fuente).toMatch(/^https:\/\/(platform|docs)\.claude\.com\//);
    expect(Object.keys(PRECIOS.modelos).length).toBeGreaterThan(5);
    for (const [id, p] of Object.entries(PRECIOS.modelos)) {
      for (const k of ["entrada", "escritura_5m", "escritura_1h", "lectura", "salida"]) expect(p[k], `${id}.${k}`).toBeGreaterThan(0);
      expect(p.lectura, id).toBeLessThan(p.entrada); // leer de la caché siempre sale más barato que entrar
      expect(p.escritura_5m, id).toBeGreaterThan(p.entrada);
      expect(p.salida, id).toBeGreaterThan(p.entrada);
    }
  });
});

// ── GitHub: issues sintéticos ─────────────────────────────────────────────────
const etiquetas = (...n) => n.map((name) => ({ name }));
const ficha = (campos) => `Texto del fondo\n\n\`\`\`fondo\n${Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\`\`\`\n`;
function fondo(number, campos, extra = {}) {
  return { number, title: "fondo sintético", state: "OPEN", reaperturas: 0, body: ficha(campos), labels: etiquetas("tipo:fondo", `causa:${campos.tipo_causa ?? "codigo"}`, "area:ops"), hijos: [], prs: [], padre: null, ...extra };
}
const encargo = (number, padre) => ({ number, title: "encargo", state: "CLOSED", reaperturas: 0, body: "", labels: etiquetas("tipo:encargo", "area:ops"), hijos: [], prs: [], padre: padre ? { number: padre } : null });

describe("unir lo medido con los issues", () => {
  /** Un mundo: fondo 10 (transversal·codigo) con encargos 11 y 12; un encargo suelto 13; un caso 14; una rama con un número que no es issue (999). */
  function mundo() {
    const sesiones = [
      resumirSesion([[linea("user", 0, "ops/11-a"), respuesta(5, "ops/11-a", { id: "a1", salida: 100, agente: "gobierno" })]]),
      resumirSesion([[linea("user", 100, "ops/11-a"), respuesta(103, "ops/11-a", { id: "a2", salida: 50 })]]),
      resumirSesion([[linea("user", 200, "ops/12-b"), respuesta(209, "ops/12-b", { id: "b1", salida: 200 })]]),
      resumirSesion([[linea("user", 300, "ops/13-c"), respuesta(302, "ops/13-c", { id: "c1" })]]),
      resumirSesion([[linea("user", 400, "ops/14-d"), respuesta(401, "ops/14-d", { id: "d1" })]]),
      resumirSesion([[linea("user", 500, "ops/999-z"), respuesta(501, "ops/999-z", { id: "z1" })]]),
      resumirSesion([[linea("user", 600, "staging"), respuesta(601, "staging", { id: "s1" })]]),
    ];
    const issues = [
      fondo(10, { alcance: "transversal", tipo_causa: "codigo", estado: "cerrado-eficaz", rondas: 1 }, { state: "CLOSED" }),
      encargo(11, 10), encargo(12, 10), encargo(13, null),
      { number: 14, title: "caso", state: "OPEN", body: "", labels: etiquetas("tipo:caso", "area:ops"), hijos: [], prs: [], padre: null },
    ];
    return { sesiones, issues, union: unirConGithub(agregarPorIssue(sesiones), issues) };
  }

  it("cuelga cada encargo de su fondo, suma sus medidas y deja aparte lo que no es ni encargo ni fondo", () => {
    const { union } = mundo();
    expect(union.fondos.map((f) => [f.issue, f.encargos])).toEqual([[10, [11, 12]]]);
    const f = union.fondos[0];
    expect([f.alcance, f.tipo_causa, f.rondas, f.aguanto]).toEqual(["transversal", "codigo", 1, "si"]);
    expect(f.tokens.salida).toBe(350);
    expect(f.sesiones).toBe(3);
    expect(f.agentes).toEqual({ gobierno: 1 });
    expect(union.encargos.map((e) => [e.issue, e.fondo, e.rondas, e.aguanto])).toEqual([[11, 10, 1, "si"], [12, 10, 1, "si"], [13, null, null, null]]);
    expect(union.otros).toEqual([14]);
    expect(union.sinLocalizar).toEqual([999]);
    expect(union.sinIssue.minutos).toBeGreaterThan(0);
  });

  it("lo que cuesta cada encargo sale de sus propias sesiones (11 tiene dos)", () => {
    const e = mundo().union.encargos.find((x) => x.issue === 11);
    expect(e.sesiones).toBe(2);
    expect(e.tokens.salida).toBe(150);
  });

  it("aguantó: solo «cerrado-eficaz» es sí; reabierto o con un «no aguantó» es no; cerrado sin ficha es solo un indicio", () => {
    const f = (campos, extra) => fondo(1, campos, extra);
    const ficha_ = (x) => ({ estado: x.estado });
    expect(aguantoDe(f({ estado: "cerrado-eficaz" }), ficha_({ estado: "cerrado-eficaz" }))).toBe("si");
    expect(aguantoDe(f({ estado: "reabierto" }), ficha_({ estado: "reabierto" }))).toBe("no");
    expect(aguantoDe(f({}, { state: "CLOSED", reaperturas: 1 }), ficha_({}))).toBe("no");
    expect(aguantoDe(f({}, { hijos: [{ labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto") }] }), ficha_({}))).toBe("no");
    expect(aguantoDe(f({}, { state: "CLOSED" }), ficha_({}))).toBe("sin-reapertura");
    expect(aguantoDe(f({ estado: "en-observacion" }), ficha_({ estado: "en-observacion" }))).toBe("en-curso");
  });
});

// ── Recalibración ─────────────────────────────────────────────────────────────

/** Un fondo ya unido, para alimentar recalibrar() directamente. */
function fila(issue, alcance, causa, { minutos, rondas = null, aguanto = "si", encargos = [issue * 100, issue * 100 + 1] }) {
  return { issue, alcance, tipo_causa: causa, estado: null, rondas, aguanto, encargos, propio: false, minutos, tokens: { total: 1 }, coste_usd: null, agentes: {}, sesiones: 1 };
}
const celda = (r, alcance, causa) => r.filas.find((f) => f.alcance === alcance && f.causa === causa);
const campo = (c, nombre) => c.campos.find((x) => x.campo === nombre);

describe("recalibrar: presupuestado frente a real, por tipo de causa × alcance", () => {
  it("con menos datos que el mínimo dice «datos insuficientes» celda a celda y no propone nada", () => {
    const r = recalibrar([fila(1, "local", "codigo", { minutos: 500 }), fila(2, "modulo", "entorno", { minutos: 500 }), fila(3, "modulo", "entorno", { minutos: 500, encargos: [] })]);
    expect(r.filas).toHaveLength(2);
    for (const f of r.filas) for (const c of f.campos) {
      expect(c.decision).toBe("datos-insuficientes");
      expect(c.propuesto).toBeUndefined();
    }
  });

  it("el mínimo son MIN_ENCARGOS_CELDA encargos y MIN_FONDOS_CELDA fondos: con un fondo de muchos encargos tampoco propone", () => {
    const r = recalibrar([fila(1, "local", "codigo", { minutos: 300, encargos: [1, 2, 3, 4, 5, 6] })]);
    expect(campo(celda(r, "local", "codigo"), "minutos_orientativos").decision).toBe("datos-insuficientes");
    expect(MIN_FONDOS_CELDA).toBeGreaterThanOrEqual(2);
  });

  it("si lo real pasa de una vez y media lo presupuestado, propone SUBIR, de 5 en 5, dónde se cambia y que es aplicable", () => {
    const fs = [fila(1, "transversal", "codigo", { minutos: 100 }), fila(2, "transversal", "codigo", { minutos: 112 })];
    const c = campo(celda(recalibrar(fs), "transversal", "codigo"), "minutos_orientativos");
    expect(c).toMatchObject({ presupuestado: 60, decision: "subir", propuesto: 105, donde: "por_alcance.transversal.minutos_orientativos", aplicable: true });
    expect(c.real).toMatchObject({ mediana: 106, maximo: 112, fondos: 2 });
  });

  it("subir un alcance por encima del siguiente rompería el catálogo (monotonía): sale NO aplicable en vez de proponerlo a ciegas", () => {
    const fs = [fila(1, "local", "codigo", { minutos: 40 }), fila(2, "local", "codigo", { minutos: 47 })];
    const c = campo(celda(recalibrar(fs), "local", "codigo"), "minutos_orientativos");
    expect(c).toMatchObject({ decision: "subir", propuesto: 45, aplicable: false });
    expect(c.nota).toMatch(/inválido \(monotonia/);
  });

  it("si lo real está dentro del margen, «en rango»: la diferencia es ruido de un presupuesto a ojo", () => {
    const fs = [fila(1, "local", "codigo", { minutos: 14 }), fila(2, "local", "codigo", { minutos: 20 })];
    expect(campo(celda(recalibrar(fs), "local", "codigo"), "minutos_orientativos").decision).toBe("en-rango");
    expect(RATIO_PROPUESTA).toBeGreaterThan(1);
  });

  it("solo propone BAJAR si todos los fondos de la celda aguantaron; si alguno no, se queda y lo dice", () => {
    const aguantan = [fila(1, "transversal", "codigo", { minutos: 33 }), fila(2, "transversal", "codigo", { minutos: 37 })];
    const c = campo(celda(recalibrar(aguantan), "transversal", "codigo"), "minutos_orientativos");
    expect(c).toMatchObject({ decision: "bajar", propuesto: 35, aplicable: true }); // mediana 35, por encima de 'modulo' (30)
    const noTodos = [fila(1, "transversal", "codigo", { minutos: 33 }), fila(2, "transversal", "codigo", { minutos: 37, aguanto: "no" })];
    const d = campo(celda(recalibrar(noTodos), "transversal", "codigo"), "minutos_orientativos");
    expect(d.decision).toBe("en-rango");
    expect(d.nota).toMatch(/no se baja/);
    const indicio = [fila(1, "transversal", "codigo", { minutos: 33, aguanto: "sin-reapertura" }), fila(2, "transversal", "codigo", { minutos: 37, aguanto: "si" })];
    expect(campo(celda(recalibrar(indicio), "transversal", "codigo"), "minutos_orientativos").decision).toBe("en-rango");
  });

  it("una propuesta que dejaría el catálogo inválido (un alcance mayor por debajo de uno menor) sale como NO aplicable", () => {
    const fs = [fila(1, "transversal", "codigo", { minutos: 10 }), fila(2, "transversal", "codigo", { minutos: 10 })];
    const c = campo(celda(recalibrar(fs), "transversal", "codigo"), "minutos_orientativos");
    expect(c.decision).toBe("bajar");
    expect(c.propuesto).toBe(10);
    expect(c.aplicable).toBe(false);
    expect(c.nota).toMatch(/inválido/);
  });

  it("dos celdas que piden valores distintos para el mismo dato del catálogo: ninguna es aplicable, decide una persona", () => {
    const fs = [
      fila(1, "local", "codigo", { minutos: 40 }), fila(2, "local", "codigo", { minutos: 40 }),
      fila(3, "local", "dos-fuentes", { minutos: 60 }), fila(4, "local", "dos-fuentes", { minutos: 60 }),
    ];
    const r = recalibrar(fs);
    const a = campo(celda(r, "local", "codigo"), "minutos_orientativos");
    const b = campo(celda(r, "local", "dos-fuentes"), "minutos_orientativos");
    expect([a.propuesto, b.propuesto]).toEqual([40, 60]);
    expect([a.aplicable, b.aplicable]).toEqual([false, false]);
    expect(a.nota).toMatch(/decide una persona/);
  });

  it("las rondas: llegar al tope duro no se propone subir; con todas las rondas en 1 y todos aguantando, baja a 1", () => {
    const altas = [fila(1, "modulo", "codigo", { minutos: 30, rondas: 2 }), fila(2, "modulo", "codigo", { minutos: 30, rondas: 1 })];
    const c = campo(celda(recalibrar(altas), "modulo", "codigo"), "rondas_max");
    expect(c.decision).toBe("al-tope");
    expect(c.propuesto).toBeUndefined();
    const bajas = [fila(1, "modulo", "codigo", { minutos: 30, rondas: 1 }), fila(2, "modulo", "codigo", { minutos: 30, rondas: 1 })];
    expect(campo(celda(recalibrar(bajas), "modulo", "codigo"), "rondas_max")).toMatchObject({ decision: "bajar", propuesto: 1, donde: "por_alcance.modulo.rondas_max", aplicable: true });
    const sinRondas = [fila(1, "modulo", "codigo", { minutos: 30 }), fila(2, "modulo", "codigo", { minutos: 30 })];
    expect(campo(celda(recalibrar(sinRondas), "modulo", "codigo"), "rondas_max").decision).toBe("sin-medida");
  });

  it("las rondas también suben: si lo real supera lo presupuestado sin llegar al tope, propone subir una (y nunca pasa del tope)", () => {
    const catalogo = JSON.parse(JSON.stringify(CATALOGO));
    for (const a of Object.keys(catalogo.por_alcance)) catalogo.por_alcance[a].rondas_max = 1;
    for (const c of Object.values(catalogo.por_causa ?? {})) delete c.rondas_max;
    const dos = [fila(1, "modulo", "codigo", { minutos: 30, rondas: 2 }), fila(2, "modulo", "codigo", { minutos: 30, rondas: 1 })];
    const c = campo(celda(recalibrar(dos, catalogo), "modulo", "codigo"), "rondas_max");
    expect(c).toMatchObject({ presupuestado: 1, decision: "subir", propuesto: 2, donde: "por_alcance.modulo.rondas_max" });
    const unas = [fila(1, "modulo", "codigo", { minutos: 30, rondas: 1 }), fila(2, "modulo", "codigo", { minutos: 30, rondas: 1 })];
    expect(campo(celda(recalibrar(unas, catalogo), "modulo", "codigo"), "rondas_max").decision).toBe("en-rango");
  });

  it("una propuesta de bajar minutos avisa de que puede estar incompleta si los encargos medidos no cubren los hijos del fondo", () => {
    const sub = (hijos) => [{ ...fila(1, "transversal", "codigo", { minutos: 33 }), encargos_total: hijos }, fila(2, "transversal", "codigo", { minutos: 37 })];
    const incompleta = campo(celda(recalibrar(sub(5)), "transversal", "codigo"), "minutos_orientativos");
    expect(incompleta).toMatchObject({ decision: "bajar", propuesto: 35 });
    expect(incompleta.nota).toMatch(/incompleta/);
    const completa = campo(celda(recalibrar(sub(2)), "transversal", "codigo"), "minutos_orientativos");
    expect(completa.decision).toBe("bajar");
    expect(completa.nota ?? "").not.toMatch(/incompleta/);
  });

  it("jamás propone pasar los rangos del catálogo ni el tope de rondas", () => {
    const enorme = [fila(1, "transversal", "codigo", { minutos: 9000, rondas: 2 }), fila(2, "transversal", "codigo", { minutos: 9000, rondas: 2 })];
    const c = campo(celda(recalibrar(enorme), "transversal", "codigo"), "minutos_orientativos");
    expect(c.propuesto).toBe(RANGOS.minutos_orientativos[1]);
  });

  it("los fondos sin alcance o sin causa no entran en ninguna celda, pero se cuentan", () => {
    const r = recalibrar([fila(1, null, "codigo", { minutos: 1 }), fila(2, "local", null, { minutos: 1 })]);
    expect(r.filas).toEqual([]);
    expect(r.sinCelda).toBe(2);
  });

  it("nunca toca el catálogo: ni el objeto ni el fichero", () => {
    const antes = JSON.stringify(CATALOGO);
    const hash = createHash("sha256").update(readFileSync(join(RAIZ, "ops/presupuestos.json"))).digest("hex");
    recalibrar([fila(1, "local", "codigo", { minutos: 40 }), fila(2, "local", "codigo", { minutos: 47 })]);
    expect(JSON.stringify(CATALOGO)).toBe(antes);
    expect(createHash("sha256").update(readFileSync(join(RAIZ, "ops/presupuestos.json"))).digest("hex")).toBe(hash);
  });

  it("la mediana de un número par de valores es la media de los dos del medio", () => {
    expect(mediana([3, 1, 2, 10])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("las constantes tienen sentido junto al criterio de #340", () => {
  it("el mínimo por celda cabe en el criterio total de 10 encargos y no es 1", () => {
    expect(MIN_ENCARGOS_INFORME).toBe(10);
    expect(MIN_ENCARGOS_CELDA).toBeGreaterThanOrEqual(3);
    expect(MIN_ENCARGOS_CELDA).toBeLessThan(MIN_ENCARGOS_INFORME);
    expect(HUECO_ACTIVO_MIN).toBeGreaterThanOrEqual(5);
    expect(HUECO_ACTIVO_MIN).toBeLessThanOrEqual(15);
  });
});

describe("el informe: solo agregados y números de issue", () => {
  function informeCompleto() {
    const rama = "ops/11-a";
    const principal = [linea("user", 0, rama), ...ruido, respuesta(5, rama, { id: "a1", salida: 100, agente: "gobierno" })];
    const sesion = resumirSesion([principal]);
    const issues = [fondo(10, { alcance: "local", tipo_causa: "codigo", estado: "abierto" }), encargo(11, 10)];
    issues[0].title = `${SECRETO} título`;
    issues[1].title = `${SECRETO} título`;
    const union = unirConGithub(agregarPorIssue([sesion]), issues);
    const recal = recalibrar(union.fondos);
    const cob = cobertura({ sesiones: 1, union, recal });
    return { sesion, union, recal, cob, texto: textoInforme({ cobertura: cob, union, recal, recalibracion: true }) };
  }

  it("ninguna salida (objetos, texto, JSON) contiene el marcador, la ruta del usuario ni el id de la sesión", () => {
    const { sesion, union, recal, cob, texto } = informeCompleto();
    const todo = JSON.stringify({ sesion: [...sesion.porIssue], union, recal, cob }) + texto;
    for (const privado of [SECRETO, "C:\\\\Users", "C:\\Users", "sesion-sintetica-1", "dime cosas privadas", "respuesta privada", "echo "]) {
      expect(todo, privado).not.toContain(privado);
    }
    expect(texto).toContain("#10");
    expect(texto).toContain("#11");
  });

  it("dice que el criterio de 10 encargos no se alcanza si no se alcanza, y que los costes son una estimación", () => {
    const { texto, cob } = informeCompleto();
    expect(cob.criterio_alcanzado).toBe(false);
    expect(texto).toMatch(/NO alcanzado todavía/);
    expect(texto).toMatch(/estimación/);
    expect(texto).toMatch(/datos insuficientes/);
  });

  it("sin --recalibrar no saca la sección de propuestas", () => {
    const { union, recal, cob } = informeCompleto();
    expect(textoInforme({ cobertura: cob, union, recal })).not.toMatch(/Recalibración/);
  });
});

// ── El script, de punta a punta con una carpeta de proyectos sintética ────────
describe("npm run fabrica con transcripciones sintéticas", () => {
  function proyectos() {
    const base = mkdtempSync(join(tmpdir(), "fabrica-proyectos-"));
    const carpeta = join(base, "C--dev-MenuPlan-algo");
    const ajena = join(base, "C--otro-proyecto");
    const sesion = "11111111-2222-3333-4444-555555555555";
    mkdirSync(join(carpeta, sesion, "subagents"), { recursive: true });
    mkdirSync(ajena, { recursive: true });
    const jl = (ls) => `${ls.map((l) => JSON.stringify(l)).join("\n")}\n`;
    writeFileSync(join(carpeta, `${sesion}.jsonl`), jl([linea("user", 0, "ops/11-a"), ...ruido, respuesta(4, "ops/11-a", { id: "p1", agente: "revisor", salida: 100 })]));
    writeFileSync(join(carpeta, sesion, "subagents", "agent-1.jsonl"), jl([respuesta(2, "ops/11-a", { id: "s1", salida: 900 })]));
    writeFileSync(join(ajena, "22222222-2222-3333-4444-555555555555.jsonl"), jl([linea("user", 0, "ops/12-b"), respuesta(1, "ops/12-b", { id: "x1", salida: 5 })]));
    return { base, sesion };
  }
  const corre = (args) => spawnSync(process.execPath, [join(AQUI, "fabrica.mjs"), ...args], { encoding: "utf8", timeout: 30000 });

  it("lista solo las carpetas que cumplen el prefijo, con los subagentes de cada sesión", () => {
    const { base } = proyectos();
    const t = listarTranscripciones(base, /MenuPlan/i);
    expect(t).toHaveLength(1);
    expect(t[0].subagentes).toHaveLength(1);
    expect(listarTranscripciones(base, /nada/i)).toEqual([]);
    expect(listarTranscripciones(join(base, "no-existe"))).toEqual([]);
  });

  it("mide la sesión (tokens de los subagentes incluidos) y no imprime nada privado", () => {
    const { base } = proyectos();
    const r = corre(["--proyectos", base, "--sin-github", "--json"]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(SECRETO);
    expect(r.stdout).not.toContain("Users");
    expect(r.stdout).not.toContain(base);
    const j = JSON.parse(r.stdout);
    expect(j.cobertura.sesiones).toBe(1); // la carpeta ajena no cuenta
    // sin GitHub no se puede localizar ningún issue: la rama 11 sale como «sin localizar»
    expect(j.sinLocalizar).toEqual([11]);
  });

  it("--escribir no escribe dentro del repo (el informe lleva datos de uso)", () => {
    const { base } = proyectos();
    const dentro = join(RAIZ, "informe-que-no-debe-existir.txt");
    const r = corre(["--proyectos", base, "--sin-github", "--escribir", "--salida", dentro]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no se escribe dentro del repo/);
    const escrito = existsSync(dentro);
    rmSync(dentro, { force: true }); // por si la regla falla: que el test no ensucie el repo
    expect(escrito).toBe(false);
  });

  it("--escribir fuera del repo escribe el informe y no lo imprime", () => {
    const { base } = proyectos();
    const fuera = join(mkdtempSync(join(tmpdir(), "fabrica-salida-")), "informe.txt");
    const r = corre(["--proyectos", base, "--sin-github", "--escribir", "--salida", fuera, "--recalibrar"]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/Informe de la fábrica/);
    expect(readFileSync(fuera, "utf8")).toMatch(/Informe de la fábrica/);
    expect(readFileSync(fuera, "utf8")).not.toContain(SECRETO);
  });

  it("rechaza un --desde que no es una fecha", () => {
    const r = corre(["--proyectos", proyectos().base, "--sin-github", "--desde", "ayer"]);
    expect(r.status).toBe(1);
  });

  it("--escribir rechaza un destino dentro de CUALQUIER repo git (no solo este), también por una carpeta que aún no existe", () => {
    const { base } = proyectos();
    const otroRepo = mkdtempSync(join(tmpdir(), "fabrica-otro-repo-"));
    spawnSync("git", ["init", "-q", otroRepo]);
    const destino = join(otroRepo, "nueva", "informe.txt");
    expect(dentroDeUnRepo(destino)).toBe(true);
    expect(dentroDeUnRepo(join(mkdtempSync(join(tmpdir(), "fabrica-sin-repo-")), "x.txt"))).toBe(false);
    const r = corre(["--proyectos", base, "--sin-github", "--escribir", "--salida", destino]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ningún otro repo git/);
    expect(existsSync(destino)).toBe(false);
  });

  it("el informe cuenta los eventos de los hooks por evento y nombre, leyendo solo de MENUPLAN_FABRICA_DIR, y tolera ausente o corrupto", () => {
    const { base } = proyectos();
    const dir = mkdtempSync(join(tmpdir(), "fabrica-eventos-"));
    const l = (evento, nombre) => JSON.stringify({ ts: "2026-10-10T08:00:00.000Z", sesion: null, rama: null, issue: null, evento, nombre });
    writeFileSync(join(dir, "eventos.jsonl"), [l("skill_cargada", "github"), l("skill_cargada", "github"), l("bloqueo_guardia", "push-a-main"), "{esto no es json", "", '{"evento":3}'].join("\n"));
    const run = (extra, env) => spawnSync(process.execPath, [join(AQUI, "fabrica.mjs"), "--proyectos", base, "--sin-github", ...extra], { encoding: "utf8", timeout: 30000, env: { ...process.env, ...env } });
    const j = JSON.parse(run(["--json"], { MENUPLAN_FABRICA_DIR: dir }).stdout);
    expect(j.eventos).toMatchObject({ total: 3, descartadas: 2, por_evento: { skill_cargada: { total: 2, nombres: { github: 2 } }, bloqueo_guardia: { total: 1, nombres: { "push-a-main": 1 } } } });
    expect(run([], { MENUPLAN_FABRICA_DIR: dir }).stdout).toMatch(/skill_cargada: 2/);
    const vacio = JSON.parse(run(["--json"], { MENUPLAN_FABRICA_DIR: join(dir, "no-existe") }).stdout);
    expect(vacio.eventos).toMatchObject({ total: 0, descartadas: 0, por_evento: {} });
    expect(contarEventos(undefined).total).toBe(0);
    expect(contarEventos("\u0000\n[1]\nnull").total).toBe(0);
  });

  it("dentroDe distingue lo que está dentro del repo de lo que está fuera", () => {
    expect(dentroDe(join(RAIZ, "x", "y.txt"), RAIZ)).toBe(true);
    expect(dentroDe(RAIZ, RAIZ)).toBe(true);
    expect(dentroDe(join(RAIZ, "..", "fuera.txt"), RAIZ)).toBe(false);
    expect(dentroDe(join(tmpdir(), "x.txt"), RAIZ)).toBe(false);
  });
});

// ── Las normas que ata esta fase ──────────────────────────────────────────────
describe("el procedimiento queda escrito donde se aplica", () => {
  const leer = (r) => readFileSync(join(RAIZ, r), "utf8");

  it("/revision-issues corre el informe y deja la aplicación a una persona", () => {
    const md = leer(".claude/commands/revision-issues.md");
    expect(md).toContain("npm run fabrica -- --recalibrar");
    expect(md).toMatch(/ops\/presupuestos\.json/);
  });

  it("el bloque `recalibracion` del catálogo dice cómo se aplica y qué cambia", () => {
    const c = JSON.parse(leer("ops/presupuestos.json"));
    expect(c.recalibracion.fase).toBe("#340");
    expect(c.recalibracion.como).toContain("npm run fabrica -- --recalibrar");
    expect(c.recalibracion.como).toContain("valores_iniciales");
    expect(c.recalibracion.como).toContain("calibrado_el");
  });

  it("al aplicar una recalibración (valores_iniciales false y fecha), el catálogo sigue siendo válido", () => {
    const aplicado = JSON.parse(JSON.stringify(CATALOGO));
    aplicado.valores_iniciales = false;
    aplicado.calibrado_el = "2026-10-17";
    aplicado.por_alcance.local.minutos_orientativos = 25;
    expect(problemas(aplicado)).toEqual([]);
    // y un calibrado sin fecha, o con valores iniciales y fecha, sigue siendo un error
    expect(problemas({ ...aplicado, calibrado_el: null })).not.toEqual([]);
    expect(problemas({ ...aplicado, valores_iniciales: true })).not.toEqual([]);
  });

  it("el script está en package.json y no es un fichero que el informe versione", () => {
    expect(JSON.parse(leer("package.json")).scripts.fabrica).toBe("node scripts/fabrica.mjs");
    expect(readdirSync(join(RAIZ, "ops")).filter((f) => /informe|fabrica-/i.test(f))).toEqual([]);
  });
});
