/**
 * Una llamada de herramienta repetida no escribe dos veces (BOT_TAREAS_V2), y
 * sin el interruptor nada nuevo se toca. La base es un par de arrays en memoria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let tareas = [];
let idem = [];
const llamadas = { idem: 0 };
const deFiltro = (filtro) => Object.fromEntries(String(filtro).split("&").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async (tabla, filtro) => {
    const f = deFiltro(filtro);
    if (tabla === "bot_idempotencia") {
      llamadas.idem++;
      return idem.filter((r) => `eq.${r.household_id}` === f.household_id && `eq.${r.clave}` === f.clave);
    }
    if (tabla === "bot_tareas") return tareas.filter((t) => `eq.${t.household_id}` === f.household_id && t.status === "abierta");
    return [];
  }),
  insert: vi.fn(async (tabla, nuevas) => {
    if (tabla === "bot_idempotencia") {
      llamadas.idem++;
      for (const n of nuevas) {
        if (idem.some((r) => r.household_id === n.household_id && r.clave === n.clave)) throw new Error("POST /rest/v1/bot_idempotencia → 409 duplicate key");
        idem.push({ ...n, resultado: null });
      }
      return nuevas;
    }
    for (const n of nuevas) tareas.push({ id: `t${tareas.length + 1}aaaaaaaa`, status: "abierta", ...n });
    return nuevas;
  }),
  update: vi.fn(async (tabla, filtro, parche) => {
    const f = deFiltro(filtro);
    if (tabla === "bot_idempotencia") {
      llamadas.idem++;
      const hits = idem.filter((r) => `eq.${r.household_id}` === f.household_id && `eq.${r.clave}` === f.clave);
      for (const r of hits) Object.assign(r, parche);
      return hits;
    }
    const hits = tareas.filter((t) => `eq.${t.id}` === f.id && t.status === "abierta");
    for (const t of hits) Object.assign(t, parche);
    return hits;
  }),
  borrar: vi.fn(async (tabla, filtro) => {
    llamadas.idem++;
    const f = deFiltro(filtro);
    idem = idem.filter((r) => !(`eq.${r.household_id}` === f.household_id && `eq.${r.clave}` === f.clave));
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}) }));
vi.mock("./recordatorios.js", () => ({ crearRecordatorio: vi.fn(async () => "puesto") }));

const { unaVez, YA_HECHO } = await import("./idempotencia.js");
const { anotarTarea, cerrarTarea } = await import("./tareas.js");

const seguimiento = { texto: "comprar pan para el sábado", kind: "seguimiento", confirmado: true };
const ctx = (casa, idemClave) => ({ householdId: casa, channel: "telegram", chatId: "1", userId: "u1", privado: true, idem: idemClave });

beforeEach(() => { tareas = []; idem = []; llamadas.idem = 0; });
afterEach(() => { delete process.env.BOT_TAREAS_V2; });

describe("con BOT_TAREAS_V2 apagado", () => {
  it("todo como antes: no se toca bot_idempotencia aunque llegue clave", async () => {
    const r1 = await anotarTarea(ctx("casaA", "toolu_1"), seguimiento);
    const r2 = await anotarTarea(ctx("casaA", "toolu_1"), { ...seguimiento, texto: "comprar leche" });
    expect(r1).toBe("Apuntado.");
    expect(r2).toBe("Apuntado.");
    expect(tareas).toHaveLength(2);
    expect(llamadas.idem).toBe(0);
  });
});

describe("con BOT_TAREAS_V2 encendido", () => {
  beforeEach(() => { process.env.BOT_TAREAS_V2 = "1"; });

  it("la misma llamada dos veces: una escritura y la misma respuesta", async () => {
    const r1 = await anotarTarea(ctx("casaA", "toolu_1"), seguimiento);
    const r2 = await anotarTarea(ctx("casaA", "toolu_1"), seguimiento);
    expect(tareas).toHaveLength(1);
    expect(r2).toBe(r1);
  });

  it("la misma clave en otra casa sí se escribe (la clave es por casa)", async () => {
    await anotarTarea(ctx("casaA", "toolu_1"), seguimiento);
    await anotarTarea(ctx("casaB", "toolu_1"), seguimiento);
    expect(tareas.map((t) => t.household_id).sort()).toEqual(["casaA", "casaB"]);
  });

  it("cerrar repetido no cierra dos veces ni cambia la respuesta", async () => {
    await anotarTarea(ctx("casaA", "toolu_1"), seguimiento);
    const abiertas = [...tareas];
    const r1 = await cerrarTarea(ctx("casaA", "toolu_2"), abiertas, tareas[0].id.slice(0, 8));
    const r2 = await cerrarTarea(ctx("casaA", "toolu_2"), abiertas, tareas[0].id.slice(0, 8));
    expect(r1).toMatch(/^Cerrada/);
    expect(r2).toBe(r1);
  });

  it("sin clave (vía rápida, plantillas) se ejecuta sin más", async () => {
    await anotarTarea(ctx("casaA", null), seguimiento);
    await anotarTarea(ctx("casaA", null), { ...seguimiento, texto: "comprar leche" });
    expect(tareas).toHaveLength(2);
    expect(llamadas.idem).toBe(0);
  });

  it("si la primera falla, suelta la reserva y el reintento de verdad se ejecuta", async () => {
    const orden = { householdId: "casaA", clave: "toolu_9", rpc: "prueba" };
    await expect(unaVez(orden, async () => { throw new Error("red caída"); })).rejects.toThrow("red caída");
    expect(idem).toHaveLength(0);
    expect(await unaVez(orden, async () => "hecho")).toBe("hecho");
  });

  it("si la primera aún no guardó su respuesta, la repetida no escribe y lo dice", async () => {
    idem.push({ household_id: "casaA", clave: "toolu_7", rpc: "anotar_tarea", resultado: null });
    const r = await anotarTarea(ctx("casaA", "toolu_7"), seguimiento);
    expect(r).toBe(YA_HECHO);
    expect(tareas).toHaveLength(0);
  });
});
