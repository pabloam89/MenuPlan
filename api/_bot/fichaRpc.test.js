/**
 * La ficha y las tareas de Lola por la RPC ficha_casa (0097), detrás de
 * BOT_FICHA_RPC. Producción y staging comparten base y la 0097 aún no está
 * aplicada: con el interruptor apagado, lo que lee el modelo tiene que ser byte
 * a byte lo de antes. Eso lo fija la foto (snapshot) de los bloques que llegan
 * al modelo en un turno entero de responder(), sacada del código de antes de
 * tocar nada.
 *
 * La base es de mentira: bot_tareas, un array en memoria que imita los filtros
 * de PostgREST que usa tareas.js; el modelo, uno que apunta lo que le llega y
 * contesta «Vale.».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const CASA = "11111111-1111-1111-1111-111111111111";
const YO = "22222222-2222-2222-2222-222222222222";
const OTRO = "33333333-3333-3333-3333-333333333333";
const HOY = new Date("2026-10-08T10:00:00Z");

// La casa tal como la guarda la app (household_state.state.data).
const DATA = {
  allergiesReviewed: false,
  members: [
    { id: "p", name: "Pablo", age: 39, allergies: [], alergiasRevisadas: true, homeRole: "Papá" },
    { id: "m", name: "Marta", age: 37, allergies: [], alergiasRevisadas: true, homeRole: "Mamá", dietaryStates: ["lactancia"], dietaryStatesMeta: { lactancia: { hasta: "2026-12-31" } } },
    { id: "l", name: "Lucas", age: 7, allergies: ["frutos_cascara"], dislikes: ["champiñón"], homeRole: "Hijo/a", intolerances: ["fructosa"] },
    { id: "v", name: "Vega", age: 1, homeRole: "Bebé" },
    { id: "leo", name: "Leo", age: 40, homeRole: "Adulto" },
  ],
  groups: [{ id: "g", label: "Mayores", memberIds: ["p", "m", "l", "leo"] }, { id: "b", label: "Vega", memberIds: ["v"] }],
  etapaBebe: "solidos",
  schedule: { "l|Lun|Comida": "cole", "l|Mar|Comida": "cole", "l|Mié|Comida": "cole", "l|Jue|Comida": "cole", "l|Vie|Comida": "cole" },
  mealStructure: "primero_segundo",
};

// Las filas de bot_tareas (con las columnas v2 de la 0080).
const TAREAS = () => [
  { id: "a1b2c3d4-0000-0000-0000-000000000001", household_id: CASA, kind: "pregunta", scope: "casa", owner_user_id: null, texto: "¿Vega tiene alguna alergia?", falta: null, clave: "alergias:v", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-07T09:00:00Z", status: "abierta", tipo: "falta_saber", campo: "alergias", persona_id: "v", vuelve_at: null },
  { id: "b1b2c3d4-0000-0000-0000-000000000002", household_id: CASA, kind: "seguimiento", scope: "casa", owner_user_id: null, texto: "Comprar pan sin gluten para el sábado", falta: null, clave: "seguimiento:l:gluten-pan-sabado", chat_id: "200", para_member: "l", asignado_member: "m", vence: "2026-10-10", caduca_at: "2026-10-11T23:59:59Z", created_at: "2026-10-06T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: "l", vuelve_at: null },
  { id: "c1b2c3d4-0000-0000-0000-000000000003", household_id: CASA, kind: "seguimiento", scope: "personal", owner_user_id: YO, texto: "Pedir el cordero al carnicero", falta: null, clave: "seguimiento:casa:carnicero-cordero-pedir", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-05T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: null, vuelve_at: null },
  { id: "d1b2c3d4-0000-0000-0000-000000000004", household_id: CASA, kind: "seguimiento", scope: "personal", owner_user_id: OTRO, texto: "Regalo sorpresa de Marta", falta: null, clave: "seguimiento:casa:marta-regalo-sorpresa", chat_id: "300", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-04T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: null, vuelve_at: null },
  // Leo no quiso decirlo ayer: no se le vuelve a preguntar.
  { id: "e1b2c3d4-0000-0000-0000-000000000005", household_id: CASA, kind: "pregunta", scope: "casa", owner_user_id: null, texto: "¿Leo tiene alguna alergia?", falta: null, clave: "alergias:leo", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-03T09:00:00Z", closed_at: "2026-10-07T20:00:00Z", status: "rechazada", tipo: "falta_saber", campo: "alergias", persona_id: "leo", vuelve_at: null },
];

// Las personas como las devuelve ficha_casa: de las tablas persona, persona_alergia,
// persona_intolerancia, persona_estado y grupo_persona (0079), en orden de id.
const PERSONAS = () => [
  { id: "l", nombre: "Lucas", edad: 7, fecha_nacimiento: null, usa_fecha_nacimiento: false, no_es_bebe: false, rol_hogar: "Hijo/a", alergias_revisadas: false, alergias: ["frutos_cascara"], intolerancias: ["fructosa"], estados: [], grupos: ["g"] },
  { id: "leo", nombre: "Leo", edad: 40, fecha_nacimiento: null, usa_fecha_nacimiento: false, no_es_bebe: false, rol_hogar: "Adulto", alergias_revisadas: false, alergias: [], intolerancias: [], estados: [], grupos: ["g"] },
  { id: "m", nombre: "Marta", edad: 37, fecha_nacimiento: null, usa_fecha_nacimiento: false, no_es_bebe: false, rol_hogar: "Mamá", alergias_revisadas: true, alergias: [], intolerancias: [], estados: [{ valor: "lactancia", hasta: "2026-12-31" }], grupos: ["g"] },
  { id: "p", nombre: "Pablo", edad: 39, fecha_nacimiento: null, usa_fecha_nacimiento: false, no_es_bebe: false, rol_hogar: "Papá", alergias_revisadas: true, alergias: [], intolerancias: [], estados: [], grupos: ["g"] },
  { id: "v", nombre: "Vega", edad: 1, fecha_nacimiento: null, usa_fecha_nacimiento: false, no_es_bebe: false, rol_hogar: "Bebé", alergias_revisadas: false, alergias: [], intolerancias: [], estados: [], grupos: ["b"] },
];

/**
 * ficha_casa (0097) de mentira, con su misma lógica sobre `filas`: tareas
 * abiertas (y aplazadas a las que les toca volver) de la casa o personales de
 * p_usuario; de seguridad todas, del resto p_max_tareas; «faltan» sin mirar la
 * etapa (aplica va en bruto) ni si ya tiene alergias; «callados», lo rechazado
 * o descartado en 24 h y lo aplazado a futuro.
 */
function fichaCasa0097({ p_casa, p_usuario = null, p_canal = null, p_max_tareas = 8 }, personas = PERSONAS()) {
  const ahora = Date.now();
  const seguridad = (t) => t.campo === "alergias" || t.campo === "etapaBebe";
  const visibles = filas.filter((t) => t.household_id === p_casa
    && (t.status === "abierta" || (t.status === "aplazada" && (!t.vuelve_at || Date.parse(t.vuelve_at) <= ahora)))
    && (t.scope === "casa" || t.owner_user_id === p_usuario));
  const orden = (a, b) => (Number(seguridad(b)) - Number(seguridad(a))) || String(a.vence ?? "9999").localeCompare(String(b.vence ?? "9999")) || a.created_at.localeCompare(b.created_at);
  const ordenadas = visibles.sort(orden);
  const tareas = [...ordenadas.filter(seguridad), ...ordenadas.filter((t) => !seguridad(t)).slice(0, p_max_tareas)].map((t) => ({
    id: t.id, tipo: t.tipo, campo: t.campo, persona_id: t.persona_id ?? t.para_member, texto: t.texto, falta: t.falta, status: t.status,
    scope: t.scope, owner_user_id: t.owner_user_id, encargado: t.asignado_member, vence: t.vence, vuelve_at: t.vuelve_at,
    caduca_at: t.caduca_at, created_at: t.created_at, seguridad: seguridad(t),
  }));
  const callados = filas.filter((t) => t.household_id === p_casa && (t.campo || t.clave)
    && (t.scope === "casa" || t.owner_user_id === p_usuario)
    && ((["descartada", "rechazada"].includes(t.status) && Date.parse(t.closed_at) > ahora - 86400000)
      || (t.status === "aplazada" && Date.parse(t.vuelve_at) > ahora)))
    .map((t) => ({ campo: t.campo, clave: t.clave, persona_id: t.persona_id ?? t.para_member, hasta: t.status === "aplazada" ? t.vuelve_at : new Date(Date.parse(t.closed_at) + 86400000).toISOString() }));
  const faltan = ["alergias", "etapaBebe"].flatMap((campo) => personas
    .filter((p) => !(campo === "alergias" && p.alergias_revisadas))
    .map((p) => ({ campo, sujeto: { tipo: "persona", id: p.id }, politica: campo === "alergias" ? "una_vez" : "antes_de_usarlo", aplica: campo === "alergias" ? "todos" : "bebe", seguridad: true })));
  return {
    v: 1, generado_at: new Date(ahora).toISOString(), canal: p_canal,
    casa: { id: p_casa, rev: 41 },
    personas,
    grupos: [{ id: "g", nombre: "Mayores", miembros: ["l", "leo", "m", "p"] }, { id: "b", nombre: "Vega", miembros: ["v"] }],
    datos: [],
    faltan,
    tareas,
    callados,
  };
}

let filas = [];
let llamadas = [];
let peticiones = [];
let rpcFicha = null;

const vivas = (t) => t.status === "abierta" || t.status === "aplazada";
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  config: () => ({}),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
  borrar: vi.fn(async () => []),
  rpc: vi.fn(async (funcion, args) => {
    llamadas.push(["rpc", funcion, args]);
    if (funcion === "ficha_casa") return rpcFicha(args);
    return null;
  }),
  select: vi.fn(async (tabla, filtro = "") => {
    llamadas.push(["select", tabla, filtro]);
    if (tabla !== "bot_tareas") return [];
    if (/rechazada/.test(filtro)) return filas.filter((t) => t.status === "rechazada");
    return filas.filter((t) => vivas(t) && (t.scope === "casa" || filtro.includes(`owner_user_id.eq.${t.owner_user_id}`)));
  }),
  insert: vi.fn(async (tabla, nuevas) => { llamadas.push(["insert", tabla]); return nuevas; }),
  update: vi.fn(async (tabla) => (tabla === "bot_tareas" ? [{}] : [])),
}));
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  cargarCasa: vi.fn(async () => ({ householdId: CASA, botRev: 41, state: { data: structuredClone(DATA) }, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null })),
}));
vi.mock("./papel.js", () => ({
  papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: YO })),
  idiomaDe: vi.fn(async () => null),
}));
// Sin el build (core.mjs, dominiosGustos.json): las descripciones de las herramientas no cuentan aquí.
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "favoritos (Lo que os gusta)" }));
vi.mock("./uso.js",() => ({ fueraDeLimite: async () => null, contarUso: async () => 0, avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      this.beta = { messages: { toolRunner: (p) => {
        peticiones.push(p);
        return (async function* () { yield { content: [{ type: "text", text: "Vale." }], usage: {} }; })();
      } } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");

/** Lo que llega al modelo en el turno: los bloques de la ficha y la entrada (con las tareas). */
async function turno({ esGrupo = false, chatId = "100" } = {}) {
  peticiones = [];
  const r = await responder({ channel: "telegram", chatId, householdId: CASA, texto: "¿qué cenamos?", autor: "Pablo", esGrupo, desde: ["9"] });
  await r.guardado;
  const p = peticiones[0];
  return {
    ficha: p.system.slice(1, -1).map((b) => b.text),
    entrada: p.messages.at(-1).content[0].text,
  };
}

let entorno;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
  filas = TAREAS();
  llamadas = [];
  rpcFicha = () => { throw new Error("POST /rest/v1/rpc/ficha_casa → 404 PGRST202"); };
  entorno = { BOT_FICHA_RPC: process.env.BOT_FICHA_RPC, BOT_TAREAS_V2: process.env.BOT_TAREAS_V2 };
});
afterEach(() => {
  vi.useRealTimers();
  for (const [k, v] of Object.entries(entorno)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("con BOT_FICHA_RPC apagado, lo que lee Lola es lo de antes", () => {
  for (const v2 of ["", "1"]) {
    it(`privado${v2 ? " (con BOT_TAREAS_V2)" : ""}: la ficha y las tareas, byte a byte`, async () => {
      delete process.env.BOT_FICHA_RPC;
      process.env.BOT_TAREAS_V2 = v2;
      const t = await turno();
      expect(t).toMatchSnapshot();
      expect(llamadas.some(([, f]) => f === "ficha_casa")).toBe(false);
    });

    it(`grupo${v2 ? " (con BOT_TAREAS_V2)" : ""}: la ficha y las tareas, byte a byte`, async () => {
      delete process.env.BOT_FICHA_RPC;
      process.env.BOT_TAREAS_V2 = v2;
      const t = await turno({ esGrupo: true, chatId: "200" });
      expect(t).toMatchSnapshot();
      expect(llamadas.some(([, f]) => f === "ficha_casa")).toBe(false);
    });
  }
});

describe("con BOT_FICHA_RPC encendido, ficha y tareas de ficha_casa en una ida", () => {
  let fichaRpc;
  const encender = () => { process.env.BOT_FICHA_RPC = "1"; process.env.BOT_TAREAS_V2 = "1"; };
  const apagado = async (opciones) => {
    delete process.env.BOT_FICHA_RPC;
    process.env.BOT_TAREAS_V2 = "1";
    const t = await turno(opciones);
    llamadas = [];
    return t;
  };
  const selectsDeTareas = () => llamadas.filter(([q, tabla]) => q === "select" && tabla === "bot_tareas");
  const llamadasRpc = () => llamadas.filter(([q, f]) => q === "rpc" && f === "ficha_casa");
  let errores;
  beforeEach(async () => {
    fichaRpc = await import("./fichaRpc.js").catch(() => null);
    fichaRpc?.olvidarFicha(CASA);
    rpcFicha = (args) => fichaCasa0097(args);
    errores = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errores.mockRestore());
  const logDe = (re) => errores.mock.calls.some((a) => re.test(a.join(" ")));

  it("en privado: una sola ida, con p_usuario; la ficha, igual que del JSON", async () => {
    const antes = await apagado();
    encender();
    const t = await turno();
    expect(llamadasRpc()).toEqual([["rpc", "ficha_casa", { p_casa: CASA, p_usuario: YO, p_canal: "telegram", p_max_tareas: 8 }]]);
    // Ni las tareas ni lo callado se leen aparte.
    expect(selectsDeTareas()).toEqual([]);
    expect(t.ficha).toEqual(antes.ficha);
    // Lo único que cambia: la RPC no trae chat_id, así que no sabe si se pidió en otro chat.
    expect(t.entrada).toBe(antes.entrada.replace("; se pidió en otro chat", ""));
    expect(t.entrada).toMatch(/\[c1b2c3d4\] Seguimiento: Pedir el cordero al carnicero \(personal\)/);
    expect(t.entrada).not.toMatch(/Regalo sorpresa/);
  });

  it("en grupo: pasa p_usuario, pero lo personal no sale aunque la RPC lo traiga", async () => {
    encender();
    const t = await turno({ esGrupo: true, chatId: "200" });
    expect(llamadasRpc()[0][2]).toMatchObject({ p_usuario: YO });
    expect(t.entrada).toMatch(/\[a1b2c3d4\] Falta saber/);
    expect(t.entrada).not.toMatch(/cordero|Regalo sorpresa/);
  });

  it("lo que falta saber sale de «faltan»: quien ya tiene alergias o lo rechazó ayer no se pregunta", async () => {
    encender();
    const t = await turno();
    // Lucas está en «faltan» (alergias_revisadas false) pero tiene una; Leo dijo que no ayer (callados).
    expect(t.ficha[1]).toMatch(/PENDIENTE\n- ¿Vega tiene alguna alergia o intolerancia\?$/);
  });

  it("sin la RPC (0097 sin aplicar): se lee del JSON como siempre, y queda en el log", async () => {
    const antes = await apagado();
    encender();
    rpcFicha = () => { throw new Error('POST /rest/v1/rpc/ficha_casa → 404 {"code":"PGRST202","message":"Could not find the function public.ficha_casa"}'); };
    const t = await turno();
    expect(t).toEqual(antes);
    expect(selectsDeTareas().length).toBeGreaterThan(0);
    expect(logDe(/\[fichaRpc\].*PGRST202/)).toBe(true);
  });

  it("con otra versión del contrato (v=2): del JSON, y queda en el log", async () => {
    const antes = await apagado();
    encender();
    rpcFicha = (args) => ({ ...fichaCasa0097(args), v: 2 });
    const t = await turno();
    expect(t).toEqual(antes);
    expect(logDe(/\[fichaRpc\].*v=2/)).toBe(true);
  });

  it("si las tablas no dicen lo mismo que el JSON en lo de seguridad, manda el JSON (lo que filtra el motor)", async () => {
    const antes = await apagado();
    encender();
    // La copia a persona va por detrás: a Lucas aún no le consta la alergia.
    rpcFicha = (args) => fichaCasa0097(args, PERSONAS().map((p) => (p.id === "l" ? { ...p, alergias: [] } : p)));
    const t = await turno();
    expect(t.ficha).toEqual(antes.ficha);
    expect(t.ficha[0]).toMatch(/Lucas: alergia a frutos de cáscara/);
    expect(logDe(/\[fichaRpc\] desfase/)).toBe(true);
  });

  it("una ida por turno; el turno siguiente vuelve a leer aunque la casa siga en la misma versión", async () => {
    encender();
    await turno();
    expect(llamadasRpc()).toHaveLength(1);
    // El turno acaba olvidando lo leído: puede haber cerrado o anotado tareas sin tocar bot_rev.
    await turno();
    expect(llamadasRpc()).toHaveLength(2);
  });
});

describe("leerFichaCasa y su adaptación (puras)", () => {
  let fichaRpc;
  beforeEach(async () => {
    fichaRpc = await import("./fichaRpc.js");
    fichaRpc.olvidarFicha(CASA);
    rpcFicha = (args) => fichaCasa0097(args);
  });

  it("guarda lo leído por (casa, usuario, versión): con la misma versión no vuelve a ir; con otra, sí", async () => {
    const ctx = { householdId: CASA, userId: YO, canal: "telegram" };
    await fichaRpc.leerFichaCasa(ctx);
    await fichaRpc.leerFichaCasa(ctx);
    expect(llamadas.filter(([, f]) => f === "ficha_casa")).toHaveLength(1);
    // Otro usuario: sus tareas personales son otras.
    await fichaRpc.leerFichaCasa({ ...ctx, userId: OTRO });
    expect(llamadas.filter(([, f]) => f === "ficha_casa")).toHaveLength(2);
    // Leída con bot_rev 40 y la casa ya va por la 41: lo guardado no vale, se vuelve a ir cada vez.
    rpcFicha = (args) => ({ ...fichaCasa0097(args), casa: { id: CASA, rev: 40 } });
    fichaRpc.olvidarFicha(CASA);
    await fichaRpc.leerFichaCasa(ctx);
    await fichaRpc.leerFichaCasa(ctx);
    expect(llamadas.filter(([, f]) => f === "ficha_casa")).toHaveLength(4);
  });

  it("la etapa del bebé solo falta para quien es bebé (etapaDe) y si la casa aún no la sabe", () => {
    const ficha = fichaCasa0097({ p_casa: CASA, p_usuario: YO });
    const sinEtapa = { ...structuredClone(DATA), etapaBebe: null };
    const faltan = fichaRpc.faltanDeFicha(ficha, sinEtapa, new Set());
    expect(faltan.filter((f) => f.campo === "etapaBebe").map((f) => f.personaId)).toEqual(["v"]);
    expect(fichaRpc.faltanDeFicha(ficha, structuredClone(DATA), new Set()).filter((f) => f.campo === "etapaBebe")).toEqual([]);
    // «Ya come como un niño» (no_es_bebe) la saca.
    const crecida = { ...ficha, personas: ficha.personas.map((p) => (p.id === "v" ? { ...p, no_es_bebe: true } : p)) };
    expect(fichaRpc.faltanDeFicha(crecida, sinEtapa, new Set()).filter((f) => f.campo === "etapaBebe")).toEqual([]);
  });

  it("una tarea de la RPC queda con la forma que leen tareas.js y la ficha", () => {
    const ficha = fichaCasa0097({ p_casa: CASA, p_usuario: YO });
    const tareas = fichaRpc.tareasDeFicha(ficha, { userId: YO, privado: true });
    const vega = tareas.find((t) => t.campo === "alergias");
    expect(vega).toMatchObject({ kind: "pregunta", tipo: "falta_saber", clave: "alergias:v", persona_id: "v", para_member: null, chat_id: null });
    const pan = tareas.find((t) => t.texto.startsWith("Comprar pan"));
    expect(pan).toMatchObject({ kind: "seguimiento", para_member: "l", asignado_member: "m", vence: "2026-10-10", clave: null });
    expect(fichaRpc.calladasDeFicha(ficha)).toEqual(new Set(["alergias:leo"]));
  });

  it("cerrar una tarea que vino de la RPC (sin chat_id) no dice que se pidió en otro chat", async () => {
    const { cerrarTarea } = await import("./tareas.js");
    const tareas = fichaRpc.tareasDeFicha(fichaCasa0097({ p_casa: CASA, p_usuario: YO }), { userId: YO, privado: true });
    const pan = tareas.find((t) => t.texto.startsWith("Comprar pan"));
    const r = await cerrarTarea({ householdId: CASA, chatId: "100", userId: YO }, tareas, pan.id.slice(0, 8));
    expect(r).toBe("Cerrada: Comprar pan sin gluten para el sábado.");
  });
});
