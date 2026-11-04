/**
 * Lo que caduca tiene dueño (#958, raíz 4): una lista cerrada, y cada cosa de
 * barrido con su función.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));
// La casa entera la lee casa.js (cargarCasa): aquí, la que diga cada test.
const casa = vi.hoisted(() => ({ cargarCasa: vi.fn() }));
vi.mock("./casa.js", () => casa);
// Lo que apunta cada cierre (embudo.js) no se mira aquí.
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), EVENTO: new Proxy({}, { get: (_, k) => String(k) }) }));

const {
  COSAS_QUE_CADUCAN, CADUCA, EFECTOS, QUIENES, BARRIDOS, vigente, estadosVencidos, casasDeEstados, avisoDeCola, claveDeEstadoVencido,
  barridosQueFaltan, PATRON_VENCIDO, barrer: barrerReal, claveDeRota, textoDeRota, TOPE_CORRECCIONES_POR_CASA, VIDA_PREGUNTA_MS,
} = await import("./caducidades.js");
const { EJES } = await import("../../src/data/axisRegistry.js");
const { ESTADO_TAREA } = await import("../../src/lib/vocabularios.js");

const H = 3600000;
// La cadencia del cron, de su único sitio (la misma que pasa api/bot/recordatorios.js).
const { CADA_MS, HORARIO_CRON, CADA_MINUTOS } = await import("./cadencia.js");
const barrer = (o) => barrerReal({ cadaMs: CADA_MS, ...o });

/** Lo que avisarFallo escribe por consola, como objetos. */
function avisos(fn) {
  const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    fn();
    return espia.mock.calls.map(([l]) => JSON.parse(l));
  } finally {
    espia.mockRestore();
  }
}

describe("la lista de lo que caduca", () => {
  it("es cerrada: cada cosa con quién la caduca y qué pasa", () => {
    expect(Object.values(CADUCA).sort()).toEqual(Object.keys(COSAS_QUE_CADUCAN).sort());
    for (const def of Object.values(COSAS_QUE_CADUCAN)) {
      expect(QUIENES).toContain(def.quien);
      expect(EFECTOS).toContain(def.efecto);
    }
  });

  it("lo de barrido tiene su función, y solo eso", () => {
    expect(barridosQueFaltan()).toEqual({ faltan: [], sobran: [] });
  });

  it("la cadencia vive en un sitio: quien la usa la lee de cadencia.js y nadie la copia (#974, C8/C14)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const raiz = new URL("../../", import.meta.url);
    const leer = (f) => readFileSync(new URL(f, raiz), "utf8");
    expect(HORARIO_CRON).toBe(`*/${CADA_MINUTOS} * * * *`);
    // Los que la usan: el script que programa el job, el endpoint y la simulación del cron.
    const usan = ["scripts/bot-cron.mjs", "api/bot/recordatorios.js", "api/_bot/recordatoriosHora.test.js"];
    for (const f of usan) {
      const texto = leer(f);
      expect(texto, f).toMatch(/from "\.\.?\/(_bot\/|api\/_bot\/)?cadencia\.js"|import\("\.\/cadencia\.js"\)/);
      expect(texto, f).not.toMatch(/\d+ \* 60000/);
    }
    // Y en todo el bot (y el script del job), ni la expresión de pg_cron ni «cada N min» a mano.
    const delBot = ["api/_bot", "api/bot"].flatMap((d) => readdirSync(new URL(`${d}/`, raiz)).filter((n) => /\.m?js$/.test(n)).map((n) => `${d}/${n}`));
    const copias = [...delBot, "scripts/bot-cron.mjs"]
      .filter((f) => f !== "api/_bot/cadencia.js")
      .filter((f) => /\*\/\d+ \* \* \* \*|cada \d+ min/i.test(leer(f)));
    expect(copias).toEqual([]);
  });

  it("los papeles para personas no copian la cadencia del cron: apuntan a cadencia.js (#958)", async () => {
    const { readFileSync } = await import("node:fs");
    const leer = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    // Los que hablan del job bot-recordatorios. Un párrafo (o una línea de
    // los casos.json) que lo nombra no puede llevar «cada N min» a mano.
    const papeles = [".claude/skills/supabase/SKILL.md", "supabase/ESTADO.md", "ops/INVENTARIO.md", ".claude/skills/vercel/casos.json", ".claude/skills/telegram/casos.json"];
    const copias = papeles.flatMap((f) => leer(f).split(/\n\s*\n|\n(?=\s*")/)
      .filter((p) => /recordatorios/i.test(p) && /cada \d+ min/i.test(p))
      .map((p) => `${f}: ${p.trim().slice(0, 80)}`));
    expect(copias).toEqual([]);
    // Y los que describen el job dicen dónde vive la cifra.
    for (const f of [".claude/skills/supabase/SKILL.md", "supabase/ESTADO.md", "ops/INVENTARIO.md"]) expect(leer(f), f).toContain("api/_bot/cadencia.js");
  });

  it("y la comprobación salta con una lista mala (#964, C17)", () => {
    // Una cosa nueva de barrido sin función (lo que pasaría al añadir la dieta
    // blanda olvidando su barrido), y una función de algo que no es de barrido.
    const cosas = { ...COSAS_QUE_CADUCAN, dieta_nueva: { quien: "barrido", efecto: "preguntar", que: "prueba" } };
    const barridos = { ...BARRIDOS, [CADUCA.PROPUESTA]: async () => ({}) };
    expect(barridosQueFaltan(cosas, barridos)).toEqual({ faltan: ["dieta_nueva"], sobran: [CADUCA.PROPUESTA] });
  });

  it("el cron no se barre sin decir su cadencia", async () => {
    await expect(barrerReal({ ahoraMs: Date.parse("2026-11-05T09:01:00Z") })).rejects.toThrow(/cadaMs/);
  });

  it("una cosa que no está en la lista no se caduca a ojo", () => {
    expect(() => vigente("dieta_inventada", new Date().toISOString())).toThrow();
  });
});

describe("vigente", () => {
  const ahora = Date.parse("2026-10-29T12:00:00Z");
  it("«¿comida o cena?» vale un rato, no al día siguiente", () => {
    expect(vigente(CADUCA.PROPUESTA, new Date(ahora - 10 * 60000).toISOString(), ahora)).toBe(true);
    expect(vigente(CADUCA.PROPUESTA, new Date(ahora - 24 * H).toISOString(), ahora)).toBe(false);
  });
  it("sin fecha, como antes", () => {
    expect(vigente(CADUCA.TAREAS_DEL_MENSAJE, null, ahora)).toBe(true);
  });
  it("una fecha ilegible lanza: ni vigente ni caducada por defecto (#974, C5)", () => {
    expect(() => vigente(CADUCA.PROPUESTA, "ayer por la tarde", ahora)).toThrow(/fecha ilegible/);
  });
});

describe("estados de salud con fecha pasada", () => {
  const members = [
    { id: "p1", name: "Ana", dietaryStates: ["pregnancy"], dietaryStatesMeta: { pregnancy: { hasta: "2026-09-30" } } },
    { id: "p2", name: "Bea", dietaryStates: ["lactation"], dietaryStatesMeta: { lactation: { hasta: "2026-12-01" } } },
    // Quitado ya el estado: lo que quede en meta no cuenta.
    { id: "p3", name: "Cris", dietaryStates: [], dietaryStatesMeta: { pregnancy: { hasta: "2026-01-01" } } },
  ];
  // Lo mismo en filas de persona_estado (trozo 10: la familia vive en sus filas): Cris ya no tiene fila.
  const ESTADOS = [
    { household_id: "h1", persona_id: "p1", estado: "pregnancy", hasta: "2026-09-30", persona: { nombre: "Ana" } },
    { household_id: "h1", persona_id: "p2", estado: "lactation", hasta: "2026-12-01", persona: { nombre: "Bea" } },
  ];
  it("solo los vencidos y aún puestos, con una pregunta (no se borran)", () => {
    const v = estadosVencidos(members, "2026-11-05");
    expect(v.map((x) => [x.personaId, x.estado])).toEqual([["p1", "pregnancy"]]);
    expect(v[0].clave).toBe(claveDeEstadoVencido("p1", "pregnancy", "2026-09-30"));
    expect(v[0].texto).toMatch(/2026-09-30/);
  });

  it("una lista de personas que no es una lista se avisa, no se da por vacía (#964, C5)", () => {
    let v;
    const dichos = avisos(() => { v = estadosVencidos({ p1: members[0] }, "2026-11-05"); });
    // null, no []: «no he podido leerla» no es «no hay nadie».
    expect(v).toBeNull();
    expect(dichos).toMatchObject([{ donde: "caducidades_personas_ilegibles" }]);
    // Sin personas (null) no es un fallo.
    expect(avisos(() => estadosVencidos(null, "2026-11-05"))).toEqual([]);
  });

  it("el patrón de las claves sale de la misma función que las claves (#964, C8)", () => {
    const como = new RegExp(`^${PATRON_VENCIDO.split("*").map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    expect(claveDeEstadoVencido("p1", "pregnancy", "2026-09-30")).toMatch(como);
  });

  it("el barrido abre la pregunta una sola vez y en el privado", async () => {
    db.select.mockReset(); db.insert.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "persona_estado") return ESTADOS;
      if (tabla === "bot_chats") return [{ channel: "telegram", chat_id: "-100", kind: "group" }, { channel: "telegram", chat_id: "7", kind: "private" }];
      if (tabla === "bot_tareas" && filtro.includes("clave=eq.")) return [];
      return [];
    });
    db.insert.mockResolvedValue([{}]);
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:01:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 1, cerradas: 0, sinLeer: 0 });
    const [tabla, [fila]] = db.insert.mock.calls[0];
    expect(tabla).toBe("bot_tareas");
    expect(fila).toMatchObject({ chat_id: "7", kind: "pregunta", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") });
    // Lo que ya se preguntó no se repite.
    db.insert.mockClear();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "persona_estado") return ESTADOS;
      if (tabla === "bot_chats") return [{ channel: "telegram", chat_id: "7", kind: "private" }];
      if (tabla === "bot_tareas" && filtro.includes("clave=eq.")) return [{ id: "t1" }];
      return [];
    });
    await barrer({ ahoraMs: Date.parse("2026-11-05T10:02:00Z") });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("si le dieron fecha nueva, la pregunta abierta se cierra", async () => {
    db.select.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "persona_estado") return [];
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") }];
      return [];
    });
    db.update.mockResolvedValue([{}]);
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 0, cerradas: 1, sinLeer: 0 });
    expect(db.update.mock.calls[0][2]).toMatchObject({ status: "hecha" });
  });

  it("los estados salen de sus filas, no del documento (trozo 10)", async () => {
    expect(casasDeEstados(ESTADOS)).toEqual([{ household_id: "h1", members: [
      { id: "p1", name: "Ana", dietaryStates: ["pregnancy"], dietaryStatesMeta: { pregnancy: { hasta: "2026-09-30" } } },
      { id: "p2", name: "Bea", dietaryStates: ["lactation"], dietaryStatesMeta: { lactation: { hasta: "2026-12-01" } } },
    ] }]);
    db.select.mockReset();
    db.select.mockResolvedValue([]);
    await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    const tablas = db.select.mock.calls.map(([t]) => t);
    expect(tablas).toContain("persona_estado");
    expect(tablas).not.toContain("household_state");
  });

  it("si los estados no se pueden leer, el barrido falla en alto y no cierra nada (#974, C5)", async () => {
    db.select.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "persona_estado") throw new Error("caída");
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") }];
      return [];
    });
    await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") }).catch(() => null);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("una casa sin chat no abre nada, pero tampoco cierra lo que ya estaba abierto (#974)", async () => {
    db.select.mockReset(); db.insert.mockReset(); db.update.mockReset();
    db.select.mockImplementation(async (tabla, filtro) => {
      if (tabla === "persona_estado") return ESTADOS;
      if (tabla === "bot_chats") return [];
      if (tabla === "bot_tareas" && filtro.includes("like")) return [{ id: "t9", household_id: "h1", clave: claveDeEstadoVencido("p1", "pregnancy", "2026-09-30") }];
      return [];
    });
    const r = await barrer({ ahoraMs: Date.parse("2026-11-05T09:00:00Z") });
    expect(r[CADUCA.ESTADO_SALUD]).toEqual({ abiertas: 0, cerradas: 0, sinLeer: 0 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("la cola sin dueño", () => {
  beforeEach(() => { db.select.mockReset(); db.update.mockReset(); });

  it("lo que nadie tomó se toma y se avisa al chat, una vez", async () => {
    const ahoraMs = Date.parse("2026-11-05T09:33:00Z");
    const viejo = new Date(ahoraMs - 20 * 60000).toISOString();
    db.select.mockImplementation(async (tabla) => (tabla === "bot_cola" ? [{ id: 1 }, { id: 2 }] : []));
    db.update.mockResolvedValue([
      { id: 1, channel: "telegram", chat_id: "7", created_at: viejo, item: { texto: "cambia la cena" } },
      { id: 2, channel: "telegram", chat_id: "7", created_at: viejo, item: { texto: "la del jueves" } },
    ]);
    const enviar = vi.fn(async () => ({}));
    const r = await barrer({ ahoraMs, enviar });
    expect(r[CADUCA.COLA]).toEqual({ tomados: 2, avisados: 1 });
    expect(db.update.mock.calls[0][1]).toMatch(/tomado_at=is\.null/);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][1]).toMatch(/la del jueves/);
    // El de salud no corre fuera de su hora.
    expect(r[CADUCA.ESTADO_SALUD]).toBeUndefined();
  });

  it("lo de hace más de un día se toma sin avisar", async () => {
    const ahoraMs = Date.parse("2026-11-05T09:33:00Z");
    db.select.mockResolvedValue([{ id: 1 }]);
    db.update.mockResolvedValue([{ id: 1, channel: "telegram", chat_id: "7", created_at: new Date(ahoraMs - 3 * 24 * H).toISOString(), item: { texto: "hola" } }]);
    const enviar = vi.fn();
    expect((await barrer({ ahoraMs, enviar }))[CADUCA.COLA]).toEqual({ tomados: 1, avisados: 0 });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("el aviso sin texto no se manda", () => {
    expect(avisoDeCola([{ texto: "" }])).toBeNull();
  });
});

describe("referencias rotas: lo obvio se corrige solo y lo dudoso se pregunta (Pablo, 4 nov 2026)", () => {
  // En punto: la primera pasada de la hora, cuando corre este barrido.
  const ahoraMs = Date.parse("2026-11-05T09:00:00Z");
  const eje = EJES.find((e) => Array.isArray(e.vocabulario) && e.vocabulario.length && e.tipo !== "booleano");
  const CHAT = { household_id: "h1", channel: "telegram", chat_id: "7", kind: "private" };
  const casaDe = ({ members = [{ id: "ana", name: "Ana" }], preferencias = [] } = {}) => ({ state: { members }, preferencias });
  let tareas;
  beforeEach(() => {
    db.select.mockReset(); db.update.mockReset(); db.insert.mockReset(); casa.cargarCasa.mockReset();
    db.update.mockResolvedValue([{}]);
    db.insert.mockResolvedValue([{}]);
    tareas = [];
    db.select.mockImplementation(async (tabla, q) => {
      if (tabla === "bot_chats") return [CHAT];
      // Las vivas de la casa; la búsqueda por clave (¿ya se preguntó?) y la de estados vencidos, vacías.
      if (tabla === "bot_tareas") return /clave=/.test(q) ? [] : tareas;
      return [];
    });
  });
  const updates = () => db.update.mock.calls.filter(([t]) => t === "bot_tareas");
  const inserts = () => db.insert.mock.calls.filter(([t]) => t === "bot_tareas");

  it("descarta la tarea de quien ya no está, quita el encargado que falta y pregunta por el valor que ya no existe", async () => {
    tareas = [
      { id: "t1", para_member: "marta" },
      { id: "t2", para_member: "ana", asignado_member: "pedro" },
      { id: "t3", para_member: "ana" },
    ];
    casa.cargarCasa.mockResolvedValue(casaDe({ preferencias: [{ id: "p1", eje: eje.id, valor: "ya-no-existe", persona_id: "ana" }] }));
    const r = await barrer({ ahoraMs });
    expect(r[CADUCA.REFERENCIA_ROTA]).toEqual({ casas: 1, sinLeer: 0, descartadas: 1, sinEncargado: 1, preguntas: 1, frenadas: 0 });
    const [descarte, encargado] = updates();
    expect(descarte[1]).toMatch(/id=eq\.t1/);
    expect(descarte[2]).toMatchObject({ status: ESTADO_TAREA.DESCARTADA });
    expect(encargado[1]).toMatch(/id=in\.\(t2\)/);
    expect(encargado[2]).toMatchObject({ asignado_member: null });
    expect(updates().some(([, q]) => /t3/.test(q))).toBe(false);
    const [[, [fila]]] = inserts();
    expect(fila).toMatchObject({ household_id: "h1", chat_id: "7", kind: "pregunta", clave: claveDeRota({ personaId: "ana", eje: eje.id, valor: "ya-no-existe" }) });
    expect(Date.parse(fila.caduca_at) - ahoraMs).toBe(VIDA_PREGUNTA_MS);
    expect(fila.texto).toMatch(/ya-no-existe/);
    expect(fila.texto).toMatch(/Ana/);
  });

  it("la pregunta ya hecha no se repite", async () => {
    casa.cargarCasa.mockResolvedValue(casaDe({ preferencias: [{ id: "p1", eje: eje.id, valor: "ya-no-existe", persona_id: "ana" }] }));
    db.select.mockImplementation(async (tabla, q) => (tabla === "bot_chats" ? [CHAT] : tabla === "bot_tareas" && /clave=/.test(q) ? [{ id: "vieja" }] : []));
    expect((await barrer({ ahoraMs }))[CADUCA.REFERENCIA_ROTA].preguntas).toBe(0);
    expect(inserts()).toEqual([]);
  });

  it("con más correcciones que el tope en una casa no toca nada: avisa y la deja", async () => {
    tareas = Array.from({ length: TOPE_CORRECCIONES_POR_CASA + 1 }, (_, i) => ({ id: `t${i}`, para_member: "marta" }));
    casa.cargarCasa.mockResolvedValue(casaDe());
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await barrer({ ahoraMs }))[CADUCA.REFERENCIA_ROTA]).toMatchObject({ frenadas: 1, descartadas: 0 });
    } finally {
      espia.mockRestore();
    }
    expect(updates()).toEqual([]);
  });

  it("una casa que no se puede leer no se corrige; sin nadie en la familia no se mira la persona", async () => {
    tareas = [{ id: "t1", para_member: "marta" }];
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    casa.cargarCasa.mockRejectedValue(new Error("FamiliaSinLeer"));
    try {
      expect((await barrer({ ahoraMs }))[CADUCA.REFERENCIA_ROTA]).toMatchObject({ sinLeer: 1, descartadas: 0 });
    } finally {
      espia.mockRestore();
    }
    casa.cargarCasa.mockResolvedValue(casaDe({ members: [] }));
    expect((await barrer({ ahoraMs }))[CADUCA.REFERENCIA_ROTA]).toMatchObject({ casas: 1, descartadas: 0 });
    expect(updates()).toEqual([]);
  });

  it("una vez por hora: en otra pasada de la hora no corre", async () => {
    casa.cargarCasa.mockResolvedValue(casaDe());
    expect((await barrer({ ahoraMs: Date.parse("2026-11-05T09:33:00Z") }))[CADUCA.REFERENCIA_ROTA]).toBeUndefined();
    expect(casa.cargarCasa).not.toHaveBeenCalled();
  });

  it("el texto de la pregunta dice el valor, el eje y de quién es", () => {
    const t = textoDeRota({ eje: eje.id, valor: "raro", personaId: "ana" }, [{ id: "ana", name: "Ana" }]);
    expect(t).toMatch(/«raro»/);
    expect(t).toContain(eje.nombre);
    expect(t).toMatch(/de Ana/);
  });
});
