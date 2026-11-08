/**
 * Tareas v2 (fase T2) detrás de BOT_TAREAS_V2. Producción y staging comparten
 * base y la 0080 puede no estar aplicada: con el interruptor apagado, lo que se
 * escribe y se lee tiene que ser byte a byte lo de antes. Eso lo fija la foto
 * (snapshot) de todas las llamadas a la base de un recorrido completo; con el
 * interruptor encendido, las mismas filas llevan además tipo, campo y persona_id.
 *
 * La base es un array en memoria que apunta cada llamada (tabla, filtro,
 * columnas, cuerpo) y los eventos de embudo, que también son escrituras.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let filas = [];
let llamadas = [];
let fkPersona = false;
const deFiltro = (filtro) => Object.fromEntries(String(filtro).split("&").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));
const vivas = (t) => t.status === "abierta" || t.status === "aplazada";

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  rpc: vi.fn(),
  borrar: vi.fn(async () => []),
  select: vi.fn(async (tabla, filtro, columnas) => {
    llamadas.push(["select", tabla, filtro, columnas ?? null]);
    if (tabla !== "bot_tareas") return [];
    const f = deFiltro(filtro);
    if (f.status === "eq.rechazada") return filas.filter((t) => t.status === "rechazada");
    return filas.filter((t) => `eq.${t.household_id}` === f.household_id && vivas(t));
  }),
  insert: vi.fn(async (tabla, nuevas) => {
    llamadas.push(["insert", tabla, JSON.parse(JSON.stringify(nuevas))]);
    for (const n of nuevas) {
      if (fkPersona && n.persona_id) throw new Error('insert or update on table "bot_tareas" violates foreign key constraint "bot_tareas_persona_fk" (23503)');
      if (filas.some((t) => t.household_id === n.household_id && vivas(t) && t.clave && t.clave === n.clave)) throw new Error("409 duplicate key");
      filas.push({ id: `t${filas.length + 1}aaaaaaaa`, status: "abierta", ...n });
    }
    return nuevas;
  }),
  update: vi.fn(async (tabla, filtro, parche) => {
    llamadas.push(["update", tabla, filtro, JSON.parse(JSON.stringify(parche))]);
    const f = deFiltro(filtro);
    const hits = filas.filter((t) => `eq.${t.id}` === f.id && vivas(t));
    for (const t of hits) Object.assign(t, parche);
    return hits;
  }),
}));
vi.mock("./embudo.js", () => ({
  registrar: vi.fn(async (evento, datos) => { llamadas.push(["evento", evento, JSON.parse(JSON.stringify(datos ?? null))]); }),
  EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false,
}));
vi.mock("./recordatorios.js", () => ({ crearRecordatorio: vi.fn(async () => "te aviso el viernes.") }));

const tareas = await import("./tareas.js");

const CASA = "11111111-1111-1111-1111-111111111111";
const YO = "22222222-2222-2222-2222-222222222222";
const AHORA = new Date("2026-10-08T10:00:00Z");
const data = { members: [
  { id: "nat", name: "Nat", age: 35, allergies: [] },
  { id: "isa", name: "Isa", age: 34, allergies: [] },
  { id: "cova", name: "Cova", age: 0 },
] };
const ctx = { householdId: CASA, channel: "telegram", chatId: "c1", userId: YO, privado: true, autor: "Isa", papel: "owner", idem: null };

/** Un recorrido por todo lo que escribe y lee el módulo de tareas. */
async function recorrido() {
  await tareas.anotarTarea(ctx, { kind: "seguimiento", texto: "comprar pan para el sábado", confirmado: true, para: "Isa", vence: "2026-10-10", cuando: "2026-10-09T18:00" }, data);
  await tareas.anotarTarea(ctx, { kind: "pregunta", texto: "si tiene alguna alergia", sobre: "alergias", para: "Nat" }, data);
  await tareas.anotarTarea(ctx, { kind: "pregunta", texto: "cómo come", sobre: "etapa_bebe", para: "Cova" }, data);
  await tareas.anotarTarea(ctx, { kind: "pregunta", texto: "qué día viene la abuela a comer" }, data);
  await tareas.anotarTarea(ctx, { kind: "pregunta", texto: "si Isa tiene alguna intolerancia" }, data);
  // Repetida: el índice único la para.
  await tareas.anotarTarea(ctx, { kind: "pregunta", texto: "si tiene alguna alergia", sobre: "alergias", para: "Nat" }, data);
  await tareas.abrirPreguntaDeEstado(ctx, { campo: "alergias", personaId: "leo", texto: "¿Leo tiene alguna alergia?" }, AHORA);
  await tareas.promoverPreguntas(ctx, [
    { id: "P1", pedido: "qué le doy a @cova", falta: "¿Cova come purés o trozos?", clave: "etapa:cova" },
    { id: "P2", pedido: "la cena del jueves", falta: "¿comida o cena?", clave: null },
  ], AHORA);
  const abiertas = await tareas.tareasAbiertas(CASA, { userId: YO, privado: true, ahora: AHORA });
  await tareas.clavesCalladas(CASA);
  const ref = (pred) => String(abiertas.find(pred)?.id ?? "").slice(0, 8);
  await tareas.editarTarea(ctx, abiertas, ref((t) => t.kind === "seguimiento"), { texto: "pan y leche para el sábado", para: "Nat" }, data, AHORA);
  await tareas.cerrarTarea(ctx, abiertas, ref((t) => /abuela/.test(t.texto)), "rechazada");
  await tareas.cerrarTarea(ctx, abiertas, ref((t) => t.kind === "seguimiento"), "hecha");
  const resuelta = { ...data, etapaBebe: "solidos", members: data.members.map((m) => (m.id === "nat" ? { ...m, alergiasRevisadas: true } : m)) };
  await tareas.cerrarPorEstado(CASA, resuelta, { userId: YO });
  return abiertas;
}

beforeEach(() => {
  filas = []; llamadas = []; fkPersona = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterEach(() => { vi.useRealTimers(); delete process.env.BOT_TAREAS_V2; });

describe("sin BOT_TAREAS_V2: lo de siempre, byte a byte", () => {
  it("las mismas llamadas a la base, con los mismos cuerpos", async () => {
    await recorrido();
    expect(llamadas).toMatchSnapshot();
  });
});

const V2 = ["tipo", "campo", "persona_id"];
const sinV2 = (fila) => Object.fromEntries(Object.entries(fila).filter(([k]) => !V2.includes(k)));
const insertsDeTareas = () => llamadas.filter((l) => l[0] === "insert" && l[1] === "bot_tareas").map((l) => l[2][0]);
const encender = () => { process.env.BOT_TAREAS_V2 = "1"; };

describe("con BOT_TAREAS_V2: tipo, campo y persona_id en cada fila", () => {
  it("las mismas filas de siempre, más las tres columnas v2", async () => {
    await recorrido();
    const antes = insertsDeTareas();
    filas = []; llamadas = [];
    encender();
    await recorrido();
    const ahora = insertsDeTareas();
    expect(ahora.map(sinV2)).toEqual(antes);
    expect(ahora.map((f) => [f.clave, f.tipo, f.campo, f.persona_id])).toEqual([
      ["seguimiento:isa:pan-sabado", "seguimiento", null, "isa"],
      ["alergias:nat", "falta_saber", "alergias", "nat"],
      ["etapa:cova", "falta_saber", "etapaBebe", "cova"],
      ["pregunta:casa:abuela-comer-dia-viene", "falta_saber", null, null],
      ["alergias:isa", "falta_saber", "alergias", "isa"],
      ["alergias:nat", "falta_saber", "alergias", "nat"],
      ["alergias:leo", "falta_saber", "alergias", "leo"],
      ["etapa:cova", "falta_saber", "etapaBebe", "cova"],
    ]);
  });

  it("la clave sale de (tipo, campo, persona, palabras), con una sola función", async () => {
    const { claveDeTarea } = await import("../../src/lib/registroTareas.js");
    const { palabrasDe } = await import("./estadoCasa.js");
    encender();
    await recorrido();
    for (const f of insertsDeTareas()) {
      expect(f.clave).toBe(claveDeTarea({ tipo: f.tipo, campo: f.campo, personaId: f.persona_id, palabras: palabrasDe(f.texto) }));
    }
  });

  it("lee las columnas v2 y lo aplazado; los cierres dejan vuelve_at a null", async () => {
    encender();
    await recorrido();
    const selects = llamadas.filter((l) => l[0] === "select" && l[1] === "bot_tareas");
    const lectura = selects.find((l) => l[2].includes("limit="));
    expect(lectura[2]).toContain("status=in.(abierta,aplazada)");
    expect(lectura[3]).toMatch(/,tipo,campo,persona_id,status,vuelve_at$/);
    expect(selects.find((l) => l[2].includes("kind.eq.seguimiento"))[2]).toContain("or=(tipo.eq.seguimiento,and(tipo.is.null,kind.eq.seguimiento))");
    expect(selects.find((l) => l[2].includes("clave.like"))[2]).toContain("campo.not.is.null");
    expect(selects.find((l) => l[3] === "clave")[2]).toMatch(/or=\(status\.eq\.rechazada,and\(status\.eq\.aplazada,vuelve_at\.gt\./);
    const cierres = llamadas.filter((l) => l[0] === "update" && l[3].closed_at);
    expect(cierres.length).toBeGreaterThan(0);
    for (const c of cierres) {
      expect(c[3]).toHaveProperty("vuelve_at", null);
      expect(c[2]).toContain("status=in.(abierta,aplazada)");
    }
  });

  it("editar el «para» de una tarea libre mueve también su persona_id", async () => {
    encender();
    await recorrido();
    const edicion = llamadas.find((l) => l[0] === "update" && l[3].texto);
    expect(edicion[3]).toMatchObject({ para_member: "nat", persona_id: "nat", clave: "seguimiento:nat:leche-pan-sabado" });
  });

  it("los eventos dicen el campo, no el tema", async () => {
    encender();
    await recorrido();
    const creadas = llamadas.filter((l) => l[0] === "evento" && l[1] === "bot_task_created").map((l) => l[2].extra);
    expect(creadas.every((e) => !("tema" in e))).toBe(true);
    expect(creadas.map((e) => e.campo)).toContain("etapaBebe");
  });

  it("si la persona aún no está copiada en `persona` (FK de 0083), la tarea se escribe igual, sin persona_id", async () => {
    encender();
    fkPersona = true;
    const ok = await tareas.abrirPreguntaDeEstado(ctx, { campo: "alergias", personaId: "nat", texto: "¿Nat tiene alguna alergia?" }, AHORA);
    expect(ok).toBe(true);
    expect(insertsDeTareas().map((f) => f.persona_id)).toEqual(["nat", null]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ clave: "alergias:nat", campo: "alergias", persona_id: null });
  });
});

describe("la lectura prefiere las columnas v2 y cae a kind/clave en las filas viejas", () => {
  const nueva = { id: "n1aaaaaaaa", tipo: "falta_saber", kind: null, campo: "etapaBebe", persona_id: "cova", clave: null, texto: "cómo come Cova", created_at: "2026-10-08" };
  const vieja = { id: "v1aaaaaaaa", kind: "pregunta", clave: "etapa:cova", texto: "cómo come Cova", created_at: "2026-10-07" };
  const resuelta = { ...data, etapaBebe: "solidos" };
  it("se cierra por su campo y su persona, sin mirar la clave", () => {
    expect(tareas.separarPorEstado([nueva, vieja], resuelta).resueltas.map((t) => t.id)).toEqual(["n1aaaaaaaa", "v1aaaaaaaa"]);
    expect(tareas.separarPorEstado([nueva, vieja], data).siguen).toHaveLength(2);
  });
  it("de seguridad por su campo: entra aunque haya 8 más", () => {
    const resto = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}aaaaaaaa`, tipo: "seguimiento", texto: `s${i}`, created_at: "2026-10-09" }));
    expect(tareas.elegirParaLeer([...resto, nueva], AHORA).map((t) => t.id)).toContain("n1aaaaaaaa");
  });
  it("en el bloque, una falta_saber sin kind sale como «Falta saber»", () => {
    expect(tareas.bloqueDeTareas([nueva], { data })).toMatch(/Falta saber: cómo come Cova/);
  });
});

describe("aplazada («ahora te digo»)", () => {
  const pregunta = { id: "p1aaaaaaaa", household_id: CASA, kind: "pregunta", tipo: "falta_saber", campo: "alergias", persona_id: "nat", clave: "alergias:nat", status: "abierta", texto: "alergias de Nat", chat_id: "c1" };
  const seguimiento = { id: "s1aaaaaaaa", household_id: CASA, kind: "seguimiento", status: "abierta", texto: "pan", chat_id: "c1" };

  it("con v2, una pregunta se aplaza hasta mañana, sin cerrarse", async () => {
    encender();
    filas = [{ ...pregunta }];
    const r = await tareas.cerrarTarea(ctx, filas, "p1aaaaaa", "aplazada", AHORA);
    expect(r).toMatch(/Aplazada hasta mañana/);
    const [, , filtro, parche] = llamadas.find((l) => l[0] === "update");
    expect(filtro).toContain("status=in.(abierta,aplazada)");
    expect(parche).toEqual({ status: "aplazada", vuelve_at: "2026-10-09T10:00:00.000Z", updated_at: AHORA.toISOString() });
    expect(parche).not.toHaveProperty("closed_at");
  });

  it("un seguimiento no se aplaza", async () => {
    encender();
    filas = [{ ...seguimiento }];
    expect(await tareas.cerrarTarea(ctx, filas, "s1aaaaaa", "aplazada", AHORA)).toMatch(/Solo se aplaza una pregunta/);
    expect(llamadas.filter((l) => l[0] === "update")).toEqual([]);
  });

  it("sin v2 no se escribe «aplazada»", async () => {
    filas = [{ ...pregunta }];
    expect(await tareas.cerrarTarea(ctx, filas, "p1aaaaaa", "aplazada", AHORA)).toMatch(/no vale/);
    expect(llamadas.filter((l) => l[0] === "update")).toEqual([]);
  });

  it("Lola no la ve hasta su vuelve_at, y luego sí", () => {
    const aplazada = { ...pregunta, status: "aplazada", vuelve_at: "2026-10-09T10:00:00.000Z" };
    expect(tareas.elegirParaLeer([aplazada], AHORA)).toEqual([]);
    expect(tareas.elegirParaLeer([aplazada], new Date("2026-10-09T10:00:01Z"))).toHaveLength(1);
  });
});
