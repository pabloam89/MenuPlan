import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { resolverDia, masParecida, diaDe, huecoDe, resultadoDeCambio, resultadoDeAnadir, SIN_CAMBIAR } from "./menu.js";
import { ESTADO, recibo } from "./resultado.js";

// Menú con esta semana (empezada el miércoles) y la que viene, como queda
// tras pedir «el menú de la semana que viene» con uno de esta ya activo.
const semana = (weekStart, weekEnd) => ({ menuId: "m", weekStart, weekEnd, plan: {}, shopping: {} });
const casa = { semanas: [semana("2026-09-28", "2026-10-04"), semana("2026-10-05", "2026-10-11")] };

describe("resolverDia", () => {
  // Miércoles 30 de septiembre de 2026, a las 23:30 en España (21:30 UTC):
  // sigue siendo miércoles aunque en UTC falte poco para el jueves.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T21:30:00Z")); });
  afterAll(() => vi.useRealTimers());

  it("«hoy» es la fecha de hoy y cae en la semana que la tiene, no en la activa más nueva", () => {
    const r = resolverDia(casa, "hoy");
    expect(r.fecha).toBe("2026-09-30");
    expect(r.dia).toBe("Mié");
    expect(r.casa.semana.weekStart).toBe("2026-09-28");
  });

  it("sin menú para hoy, error en vez de cambiar el miércoles de otra semana", () => {
    const soloLaQueViene = { semanas: [casa.semanas[1]] };
    expect(resolverDia(soloLaQueViene, "hoy").error).toMatch(/No hay menú/);
  });

  it("un día que ya pasó esta semana es el de la que viene", () => {
    expect(resolverDia(casa, "lunes").fecha).toBe("2026-10-05");
    expect(resolverDia(casa, "lunes", "esta").fecha).toBe("2026-09-28");
    expect(resolverDia(casa, "viernes").fecha).toBe("2026-10-02");
    expect(resolverDia(casa, "viernes", "siguiente").fecha).toBe("2026-10-09");
  });
});

describe("masParecida", () => {
  const r = (name, ingredientes = []) => ({ name, ingredients: ingredientes.map((n) => ({ name: n })) });
  const candidatas = [
    r("Ensalada de lentejas templadas con feta", ["Lentejas", "Queso feta"]),
    r("Salmón al horno con limón y eneldo", ["Salmón", "Limón"]),
    r("Ensalada thai de pollo con cacahuete", ["Pollo", "Cacahuete"]),
    r("Muslos de pollo al horno con patatas y romero", ["Muslo de pollo", "Patata"]),
    r("Tortilla francesa rellena de jamón y queso", ["Huevo", "Jamón"]),
  ];

  it("manda lo que es el plato, no una palabra suelta del acompañamiento", () => {
    expect(masParecida(candidatas, "salmón al horno con ensalada de mango y aguacate").name).toBe("Salmón al horno con limón y eneldo");
    expect(masParecida(candidatas, "pollo al horno con patatas").name).toBe("Muslos de pollo al horno con patatas y romero");
  });

  it("plurales y palabras enteras: «tortillas francesas» es tortilla; «pollo» no es «repollo»", () => {
    expect(masParecida(candidatas, "tortillas francesas").name).toMatch(/^Tortilla francesa/);
    expect(masParecida([r("Repollo salteado")], "pollo")).toBeNull();
  });

  it("si no está lo principal, nada (y se ofrecen opciones)", () => {
    expect(masParecida(candidatas, "merluza en salsa verde")).toBeNull();
  });
});

describe("diaDe", () => {
  it("el nombre o la abreviatura, con o sin artículo, tilde o punto", () => {
    expect(diaDe("martes")).toBe("Mar");
    expect(diaDe("el Miércoles")).toBe("Mié");
    expect(diaDe("mie.")).toBe("Mié");
    expect(diaDe("sábado 3")).toBe("Sáb");
    expect(diaDe("dom")).toBe("Dom");
  });

  it("lo que solo empieza igual no es un día: «marzo» no es martes", () => {
    expect(diaDe("marzo")).toBe(null);
    expect(diaDe("juez")).toBe(null);
    expect(diaDe("domingos")).toBe(null);
    expect(diaDe("viernesito")).toBe(null);
  });
});

describe("huecoDe: un entrante se añade, nunca sustituye al principal", () => {
  // Lo de staging (2 oct 2026): «un entrante para la cena» → «Vamos con lomo»
  // cambió la cena entera porque la cena no tenía primero.
  const conPlan = (hueco, franja = "Cena") => ({
    semana: { plan: { g1: { [`Vie-${franja}`]: hueco } } },
    state: { data: { groups: [{ id: "g1", label: "Familia", memberIds: ["a"] }], members: [{ id: "a", name: "Ana" }] } },
  });

  it("cena sin primero: el primero se añade y el principal no se toca", () => {
    const h = huecoDe(conPlan({ recipeId: "tortilla" }), { dia: "Vie", franja: "Cena", cual: "primero" });
    expect(h.course).toBe("first");
    expect(h.anadir).toBe(true);
  });

  it("cena con primero: se cambia el primero", () => {
    const h = huecoDe(conPlan({ recipeId: "tortilla", firstRecipeId: "crema" }), { dia: "Vie", franja: "Cena", cual: "primero" });
    expect(h.course).toBe("first");
    expect(h.anadir).toBe(false);
  });

  it("el principal, como siempre", () => {
    const h = huecoDe(conPlan({ recipeId: "tortilla" }), { dia: "Vie", franja: "Cena", cual: "principal" });
    expect(h.course).toBe("main");
    expect(h.anadir).toBe(false);
  });

  it("una comida sin primero (desayuno) no cae al principal: error", () => {
    const h = huecoDe(conPlan({ recipeId: "tostadas" }, "Desayuno"), { dia: "Vie", franja: "Desayuno", cual: "primero" });
    expect(h.error).toMatch(/no lleva primero/);
  });
});

// Trozo 27 de #1037: cambiar plato y añadir a la compra devuelven un RESULTADO
// de lo que dejan en `out`; lo que no se guardó nunca sale con «✅».
describe("el resultado de cambiar un plato", () => {
  const cambiado = { cambiado: true, fecha: "2026-10-08", franja: "Cena", antes: "Tortilla", despues: "Merluza", sinCambiar: [] };
  it("cambiado: el día, la comida y el plato nuevo, en lo hecho", () => {
    const r = resultadoDeCambio(cambiado, "Cambiado (...)", { dia: "jueves", franja: "Cena" });
    expect(r.estado).toBe(ESTADO.HECHO);
    expect(r.hecho).toEqual(["jueves 8, cena: Merluza (antes Tortilla)"]);
    expect(r.nota).toBe("Cambiado (...)");
  });
  it("quien se queda con lo suyo va a «sin hacer»: parcial", () => {
    const r = resultadoDeCambio({ ...cambiado, sinCambiar: ["Leo"] }, "", { dia: "jueves", franja: "Cena" });
    expect(r.estado).toBe(ESTADO.PARCIAL);
    expect(r.sinHacer[0].que).toBe("jueves 8, cena para Leo");
  });
  it("sin cambiar: nada hecho, el hueco pedido y su motivo; el recibo no dice «✅»", () => {
    const r = resultadoDeCambio({ cambiado: false, motivo: SIN_CAMBIAR.SEGURIDAD }, "NO CAMBIADO, por seguridad", { dia: "jueves", franja: "Cena" });
    expect(r.estado).toBe(ESTADO.NADA);
    expect(r.sinHacer).toEqual([{ que: "cena del jueves", motivo: SIN_CAMBIAR.SEGURIDAD }]);
    expect(recibo([r])).not.toMatch(/✅/);
  });
});

describe("el resultado de añadir a la compra", () => {
  it("lo nuevo, lo devuelto y lo que ya estaba quedan pedidos: hecho", () => {
    const r = resultadoDeAnadir({ ok: true, nuevos: ["leche"], devueltos: ["pan"], yaEstaban: ["huevos"] }, ["leche", "pan", "huevos"]);
    expect(r.estado).toBe(ESTADO.HECHO);
    expect(r.hecho).toEqual(["leche", "pan (estaba tachado)", "huevos (ya estaba)"]);
  });
  it("si la lista no se guardó, todo lo pedido sin hacer", () => {
    const r = resultadoDeAnadir({ ok: false }, ["leche"], "No he podido guardar la lista: x.");
    expect(r.estado).toBe(ESTADO.NADA);
    expect(r.sinHacer).toEqual([{ que: "leche", motivo: "no se ha podido guardar la lista" }]);
  });
});
