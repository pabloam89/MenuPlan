/**
 * Las herramientas de Lola con el intérprete (#958, raíz 3): cada caso de la
 * auditoría con su prueba. Sin base ni modelo.
 */
import { describe, it, expect, vi } from "vitest";
import { montarFicha } from "./ficha.js";

// El reloj, fijo: «hoy» es el jueves 29 de octubre de 2026 en Madrid.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));

let guardada = null;
let base = null;
const MIEMBROS = [
  { id: "a", name: "Natalia", age: 40, homeRole: "Mamá" },
  { id: "b", name: "Natxo", age: 42, homeRole: "Papá" },
  { id: "c", name: "Leo", age: 6, homeRole: "Hijo/a" },
  { id: "d", name: "Vera", homeRole: "Hijo/a" },
];
const casa = () => ({ state: { data: { schedule: {}, members: MIEMBROS, kitchenTools: ["Horno", "Thermomix"], supermarkets: ["Mercadona"], accountMemberIdByUser: { u1: "b" }, ...(base ?? {}) } } });
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  hoyISO: () => "2026-10-29",
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? casa());
    if (r) guardada = r;
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false, rastro: vi.fn() }));
vi.mock("./tareas.js", () => ({ cerrarPorEstado: vi.fn(async () => {}), abrirPreguntaDeEstado: vi.fn(async () => {}) }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({
    SLOT_VALUES: ["casa", "tupper", "fuera", "cole", "off"],
    slotKey: (id, d, c) => `${id}|${d}|${c}`,
    suggestHomeRole: (e) => (e < 18 ? "Hijo/a" : "Adulto"),
    migrateGroupsForBabies: (_m, g) => g,
    reconcileGroupsWithMembers: (_m, g) => g,
    PREGUNTAS_POR_ID: { trastos: { lee: (d) => d.kitchenTools ?? null, escribe: (d, v) => ({ ...d, kitchenTools: v }) } },
    replaceSchoolWeeks: (sm, x) => ({ ...(sm ?? {}), ultimo: x }),
    reglaDeInvitado: (x) => ({ ...x }),
    podarReglasVencidas: (reglas) => ({ reglas }),
    describirRegla: (r) => `${r.nombre ?? "invitado"} el ${r.dia}`,
  }),
}));

const { ajustarHorario, ajustarCocina, aplicarCompra, aplicarModoDespensa, ajustarPersona, anadirInvitado, listaAjustada } = await import("./ajustes.js");
const { guardarMenuCole, diasSinClase } = await import("./cole.js");
const { apuntarAusencia } = await import("./menu.js");
const datos = () => guardada?.state?.data ?? {};
const limpio = (extra = null) => { guardada = null; base = extra; };

describe("ajustar_horario", () => {
  it("«los niños comen en el cole de lunes a jueves»: solo la comida, no la cena (#958)", async () => {
    limpio();
    await ajustarHorario("h", { personas: ["los peques"], dias: ["de lunes a jueves"], donde: "cole" });
    const s = datos().schedule;
    expect(s["c|Lun|Comida"]).toBe("cole");
    expect(s["c|Jue|Comida"]).toBe("cole");
    expect(s["c|Vie|Comida"]).toBeUndefined();
    expect(Object.keys(s).some((k) => k.endsWith("|Cena"))).toBe(false);
  });
  it("«Nat» con Natalia y Natxo pregunta y no toca nada", async () => {
    limpio();
    const t = await ajustarHorario("h", { personas: ["Nat"], donde: "fuera" });
    expect(t).toMatch(/Natalia o a Natxo/);
    expect(guardada).toBe(null);
  });
  it("«yo» es la persona de la cuenta, no el nombre de Telegram", async () => {
    limpio();
    await ajustarHorario("h", { personas: ["yo"], dias: ["lunes"], comidas: ["Comida"], donde: "tupper" }, { userId: "u1", autor: "Natalia" });
    expect(datos().schedule["b|Lun|Comida"]).toBe("tupper");
    expect(datos().schedule["a|Lun|Comida"]).toBeUndefined();
  });
});

describe("trastos y súper: sumar y quitar, no sustituir (#958)", () => {
  it("«tenemos airfryer» no borra el horno ni la Thermomix", async () => {
    limpio();
    await ajustarCocina("h", { trastosMas: ["Airfryer"] });
    expect(datos().kitchenTools).toEqual(["Horno", "Thermomix", "Airfryer"]);
    await ajustarCocina("h", { trastosMenos: ["Horno"] });
    expect(datos().kitchenTools).toEqual(["Thermomix", "Airfryer"]);
    await ajustarCocina("h", { trastos: ["Microondas"] });
    expect(datos().kitchenTools).toEqual(["Microondas"]);
  });
  it("«también compramos en Lidl» no pierde Mercadona", () => {
    const r = aplicarCompra({ supermarkets: ["Mercadona"] }, { supermercadosMas: ["lidl"] });
    expect(r.data.supermarkets).toEqual(["Mercadona", "Lidl"]);
    expect(aplicarCompra({ supermarkets: ["Mercadona", "Lidl"] }, { supermercadosMenos: ["Mercadona"] }).data.supermarkets).toEqual(["Lidl"]);
    expect(listaAjustada(["a"], {})).toBeNull();
  });
});

describe("ajustar_uso_despensa: los cuatro modos (#958)", () => {
  it("«deja de usar lo de casa» es off, y useHomeStock va a la par", () => {
    expect(aplicarModoDespensa({}, "off").data).toMatchObject({ pantryMode: "off", pantryModeSet: true, useHomeStock: false });
    expect(aplicarModoDespensa({}, "prefer").data).toMatchObject({ pantryMode: "prefer", useHomeStock: true });
    expect(aplicarModoDespensa({}, "nada").data).toBeUndefined();
  });
});

describe("ajustar_persona: la edad (#958)", () => {
  it("quien entró sin edad puede tenerla después", async () => {
    limpio();
    const t = await ajustarPersona("h", { nombre: "Vera", edad: 3 });
    expect(t).toMatch(/Vera tiene 3 años/);
    expect(datos().members.find((p) => p.id === "d").age).toBe(3);
  });
});

describe("anadir_invitado: la fecha y su semana", () => {
  it("«el viernes de la semana que viene» cae en la semana siguiente; «el 15», en el día 15", async () => {
    limpio();
    await anadirInvitado("h", { dia: "el viernes", comida: "Cena", semana: "siguiente", nombre: "Ana" });
    const r = datos().reglas.at(-1);
    expect(r.dia).toBe("Vie");
    expect(r.semanaISO).toBe("2026-11-02");
  });
  // #958: la herramienta prometía «se suma a la compra de esa semana» con el
  // menú ya hecho, y la regla solo cuenta al generar.
  it("el recibo dice lo apuntado y que un menú ya hecho no cambia solo", async () => {
    limpio();
    const r = await anadirInvitado("h", { dia: "el viernes", comida: "Cena", semana: "siguiente", nombre: "Ana" });
    expect(r.estado).toBe("hecho");
    expect(r.hecho).toEqual(["Ana el Vie (2026-11-06)"]);
    expect(r.nota).toMatch(/ya tiene menú, ese plato y la compra no cambian hasta rehacerlo/);
  });
  it("«el 15» es el domingo 15 de noviembre, en su semana", async () => {
    limpio();
    await anadirInvitado("h", { dia: "el 15", comida: "Comida" });
    const r = datos().reglas.at(-1);
    expect(r.dia).toBe("Dom");
    expect(r.semanaISO).toBe("2026-11-09");
  });
});

describe("guardar_menu_cole (#958)", () => {
  const sem = (sinMie) => ({ dias: { lunes: { primero: "Sopa", segundo: "Pollo" }, miercoles: sinMie ? { sinClase: true } : { primero: "Arroz" } } });
  it("«los peques» es para todos, no una persona", async () => {
    limpio();
    const t = await guardarMenuCole("h", { semanas: [sem(false)], para: "los peques" });
    expect(t).toMatch(/para todos los que comen en el cole/);
  });
  it("un día que nunca tiene cole se enseña al horario; uno suelto se pregunta", async () => {
    limpio({ schedule: { "c|Mié|Comida": "cole", "c|Lun|Comida": "cole" } });
    const t = await guardarMenuCole("h", { semanas: [sem(true), sem(true)], para: "todos" });
    expect(datos().schedule["c|Mié|Comida"]).toBeUndefined();
    expect(datos().schedule["c|Lun|Comida"]).toBe("cole");
    expect(t).toMatch(/miércoles no hay cole/);
    expect(diasSinClase([sem(true), sem(false)])).toEqual({ siempre: [], aVeces: ["Mié"] });
  });
});

describe("fuera_de_casa (#958)", () => {
  it("«el 15» se entiende, y «Nat» con dos candidatas se pregunta", async () => {
    limpio();
    const r = await apuntarAusencia("h", { dias: ["el 15"], comidas: ["Comida"], quienes: ["Nat"] });
    // Ya no es «No entiendo el día»: lo que falta es a quién.
    expect(r.error).toBe("quien");
    expect(r.texto).toMatch(/Natalia o a Natxo/);
  });
  it("un día que no se entiende es una pregunta", async () => {
    const r = await apuntarAusencia("h", { dias: ["cuando pueda"], comidas: ["Comida"] });
    expect(r.error).toBe("dia");
  });
});

describe("la ficha no pierde el menú de hoy al recortar (#958)", () => {
  it("con una casa enorme, «Hoy» sigue y lo de cocina se recorta antes", () => {
    const muchos = Array.from({ length: 24 }, (_, i) => ({ id: `x${i}`, name: `Persona${i}`, age: 30 + i, allergies: [], alergiasRevisadas: true, dislikes: ["coliflor", "hígado", "brócoli", "berenjena"] }));
    const plan = { g: { "Jue-Comida": { recipeId: "r1" } } };
    const semana = { weekStart: "2026-09-28", weekEnd: "2026-10-04", plan };
    const schedule = Object.fromEntries(muchos.flatMap((m) => ["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => [`${m.id}|${d}|Comida`, "fuera"])));
    const data = { members: muchos, schedule, groups: [{ id: "g", label: "Todos", memberIds: muchos.map((m) => m.id) }], kitchenTools: ["Horno"] };
    const f = montarFicha({ state: { data, aiRecipes: [{ id: "r1", name: "Lentejas" }] }, semana, semanas: [semana] }, {}, "2026-10-01");
    expect(f.delDia).toMatch(/- Hoy: comida Lentejas\./);
  });
});
