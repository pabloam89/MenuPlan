import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));

const { variadas, segunEstilo, cuandoPorDefecto, grupoPara, quienesDe } = await import("./menu.js");

describe("cuandoPorDefecto", () => {
  it("sin día ni comida: la próxima que toca por la hora", () => {
    expect(cuandoPorDefecto({}, 11)).toEqual({ dia: "hoy", franja: "Comida" });
    expect(cuandoPorDefecto({}, 18)).toEqual({ dia: "hoy", franja: "Cena" });
    expect(cuandoPorDefecto({}, 23)).toEqual({ dia: "mañana", franja: "Cena" });
  });
  it("una comida que ya pasó hoy es la de mañana; lo dicho manda", () => {
    expect(cuandoPorDefecto({ franja: "Comida" }, 17)).toEqual({ dia: "mañana", franja: "Comida" });
    expect(cuandoPorDefecto({ dia: "jueves", franja: "Cena" }, 23)).toEqual({ dia: "jueves", franja: "Cena" });
  });
});

describe("grupoPara", () => {
  const members = [
    { id: "p", age: 38, homeRole: "Papá" }, { id: "m", age: null, homeRole: "Mamá" },
    { id: "n", age: 7, homeRole: "Hijo/a" }, { id: "b", age: 1, homeRole: "Bebé" },
  ];
  const gs = [{ id: "g1", label: "Familia", memberIds: ["p", "m", "n"] }, { id: "g2", label: "Bebé", memberIds: ["b"] }];
  it("«con mi mujer» son los mayores, nunca el grupo del bebé", () => {
    expect(grupoPara(gs, members, "mayores").id).toBe("g1");
    expect(grupoPara(gs, members, "bebe").id).toBe("g2");
  });
  it("sin miembros a la vista, por el nombre; y null si no hay ese grupo", () => {
    expect(grupoPara([{ id: "x", label: "los mayores" }, { id: "y", label: "el bebé" }], [], "bebe").id).toBe("y");
    // Sin grupo propio de niños, el niño come en «Familia»: su menú es ese.
    expect(grupoPara(gs, members, "ninos").id).toBe("g1");
    // Y si en la casa no hay ningún niño, ninguno.
    expect(grupoPara(gs, members.filter((m) => m.id !== "n"), "ninos")).toBe(null);
  });
  it("una persona por su nombre: el grupo en el que come", () => {
    const conNombre = members.map((p, i) => ({ ...p, name: ["Pablo", "Isa", "Leo", "Cova"][i] }));
    expect(grupoPara(gs, conNombre, "Cova").id).toBe("g2");
    expect(grupoPara(gs, conNombre, "leo").id).toBe("g1");
    expect(grupoPara(gs, conNombre, "Isa García").id).toBe("g1");
    expect(grupoPara(gs, conNombre, "Marta")).toBe(null);
  });
});

describe("segunEstilo", () => {
  const recetas = [
    { id: "a", kcal: 650, time: 15 },
    { id: "b", kcal: 320, time: 40 },
    { id: "c", time: 10 },
    { id: "d", kcal: 480, time: 25 },
  ];
  it("ligero: de menos a más kcal, y las que no las traen al final", () => {
    expect(segunEstilo(recetas, "ligero").map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });
  it("rápido: de menos a más tiempo", () => {
    expect(segunEstilo(recetas, "rapido").map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
  it("sin estilo, el orden del motor", () => {
    expect(segunEstilo(recetas, null)).toBe(recetas);
  });
});

const r = (id, mainProtein, category) => ({ id, mainProtein, category });

describe("variadas", () => {
  it("no da tres veces la misma idea: salta lo que repite proteína o categoría", () => {
    const lista = [
      r("g1", "legumbre", "legumbres"), r("g2", "legumbre", "legumbres"), r("g3", "legumbre", "ensaladas_verduras"),
      r("p1", "pollo", "carnes"), r("a1", "pescado_azul", "platos_unicos"),
    ];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["g1", "p1", "a1"]);
  });

  it("si no hay tanta variedad, completa sin repetir la misma combinación antes que repetir", () => {
    const lista = [r("b1", "pavo", "bebes"), r("b2", "pavo", "bebes"), r("b3", "merluza", "bebes"), r("b4", "ternera", "bebes")];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["b1", "b3", "b4"]);
  });

  it("con pocas, devuelve las que hay en su orden", () => {
    const lista = [r("x", "pollo", "carnes"), r("y", "pollo", "carnes")];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["x", "y"]);
  });
});

describe("quienesDe: los grupos dichos con personas", () => {
  const members = [
    { id: "p", name: "Pablo", age: 38 }, { id: "i", name: "Isa", age: 36 },
    { id: "l", name: "Leo", age: 6 }, { id: "c", name: "Cova", age: 1 },
  ];
  it("con sus nombres, nunca «Niños» ni «Bebé»", () => {
    expect(quienesDe({ label: "Niños", memberIds: ["l"] }, members)).toBe("Leo");
    expect(quienesDe({ label: "Adultos", memberIds: ["p", "i"] }, members)).toBe("Pablo y Isa");
    expect(quienesDe({ label: "Familia", memberIds: ["p", "i", "l"] }, members)).toBe("Pablo, Isa y Leo");
  });
  it("muchos o sin nombres: «los mayores», «los peques», «el bebé»", () => {
    const muchos = [...members, { id: "a", name: "Ana", age: 40 }];
    expect(quienesDe({ label: "Adultos", memberIds: ["p", "i", "a", "c"].slice(0, 3).concat("x") }, muchos)).toBe("Pablo, Isa y Ana");
    expect(quienesDe({ label: "Bebé", memberIds: [] }, members)).toBe("el bebé");
    expect(quienesDe({ label: "Niños", memberIds: [] }, members)).toBe("los peques");
  });
});
