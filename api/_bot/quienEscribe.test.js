import { describe, it, expect, vi, beforeEach } from "vitest";

// conCasa de mentira: aplica el cambio sobre `casaEnBase` y apunta lo guardado.
let casaEnBase;
let guardados;
vi.mock("./casa.js", () => ({
  conCasa: vi.fn(async (_casa, cambiar) => {
    const cambios = await cambiar(structuredClone(casaEnBase));
    if (cambios) guardados.push(cambios);
    return { ok: true };
  }),
}));

const { personaQueEscribe, lineaDeQuienEscribe, seUneSola, unirCuenta } = await import("./quienEscribe.js");
const { buscarPersona } = await import("./interprete.js");

const MIEMBROS = [
  { id: "p", name: "Pablo", homeRole: "Papá" },
  { id: "i", name: "Isa", homeRole: "Mamá" },
  { id: "c", name: "Cova", homeRole: "Hijo/a" },
  { id: "n", name: "Nat", homeRole: "Hijo/a" },
];
const casa = (extra = {}) => ({ members: MIEMBROS, accountMemberIdByUser: {}, ...extra });

describe("personaQueEscribe: la persona de la casa de quien escribe", () => {
  it("manda lo que la cuenta marcó en la app, aunque su nombre de Telegram sea otro", () => {
    const r = personaQueEscribe(casa({ accountMemberIdByUser: { u1: "i" } }), { userId: "u1", autor: "Pablo", papel: "editor" });
    expect(r).toEqual({ persona: MIEMBROS[1], deducida: false });
  });

  it("sin marcar, la única persona con su primer nombre, y deducida (el caso de Pablo, 4 nov)", () => {
    const r = personaQueEscribe(casa(), { userId: "u1", autor: "Pablo Artiñano", papel: "owner" });
    expect(r).toEqual({ persona: MIEMBROS[0], deducida: true });
  });

  it("sin marcar y sin una sola coincidencia, nadie", () => {
    expect(personaQueEscribe(casa(), { userId: "u1", autor: "Manu", papel: "owner" }).persona).toBe(null);
    const dosPablos = { members: [...MIEMBROS, { id: "p2", name: "Pablo hijo" }], accountMemberIdByUser: {} };
    expect(personaQueEscribe(dosPablos, { userId: "u1", autor: "Pablo", papel: "owner" }).persona).toBe(null);
    expect(personaQueEscribe(casa(), { userId: "u1", autor: null, papel: "owner" }).persona).toBe(null);
  });

  it("si la cuenta desmarcó en la app («no soy ninguno»), no se adivina por encima", () => {
    const r = personaQueEscribe(casa({ accountMemberIdByUser: { u1: null } }), { userId: "u1", autor: "Pablo", papel: "owner" });
    expect(r).toEqual({ persona: null, deducida: false });
  });
});

describe("lineaDeQuienEscribe: lo que lee Lola en la ficha del turno", () => {
  it("con persona, su nombre y su papel en la casa, y que no pregunte", () => {
    expect(lineaDeQuienEscribe({ persona: MIEMBROS[0], deducida: false })).toMatch(/^TE ESCRIBE: Pablo \(Papá\)\. .*no le preguntes quién es\.$/);
  });
  it("deducida, lo dice", () => {
    expect(lineaDeQuienEscribe({ persona: MIEMBROS[0], deducida: true })).toMatch(/Lo deduzco por su nombre de Telegram/);
  });
  it("sin persona, que lo pregunte una vez", () => {
    expect(lineaDeQuienEscribe({ persona: null, deducida: false })).toMatch(/^TE ESCRIBE: no sé quién de la casa es.*pregúntaselo una vez/);
  });
});

describe("seUneSola: solo lo deducido y solo quien gestiona la casa", () => {
  it.each([
    [true, "owner", true], [true, "editor", true], [true, "viewer", false], [false, "owner", false],
  ])("deducida %s, papel %s → %s", (deducida, papel, esperado) => {
    expect(seUneSola({ deducida, papel })).toBe(esperado);
  });
});

describe("unirCuenta: guarda la unión deducida sin pisar lo marcado", () => {
  beforeEach(() => { guardados = []; });

  it("escribe accountMemberIdByUser de esa cuenta, sin foto para «deshaz»", async () => {
    casaEnBase = { state: { data: casa({ accountMemberIdByUser: { u2: "i" } }) } };
    await unirCuenta("casa", "u1", "p");
    expect(guardados).toHaveLength(1);
    expect(guardados[0].sinDeshacer).toBe(true);
    expect(guardados[0].state.data.accountMemberIdByUser).toEqual({ u1: "p", u2: "i" });
    expect(guardados[0].state.data.accountMemberId).toBeUndefined();
  });

  it("si entretanto la cuenta marcó algo (o se quitó a la persona), no escribe", async () => {
    casaEnBase = { state: { data: casa({ accountMemberIdByUser: { u1: "i" } }) } };
    await unirCuenta("casa", "u1", "p");
    casaEnBase = { state: { data: casa() } };
    await unirCuenta("casa", "u1", "zz");
    expect(guardados).toEqual([]);
  });

  it("sin cuenta no escribe (sería el accountMemberId compartido)", async () => {
    casaEnBase = { state: { data: casa() } };
    expect(await unirCuenta("casa", null, "p")).toEqual({ ok: false, error: "sin cuenta" });
    expect(guardados).toEqual([]);
  });
});

describe("el «yo» de las herramientas (buscarPersona) sigue la misma regla que la ficha", () => {
  const casos = [
    ["marcada", casa({ accountMemberIdByUser: { u1: "i" } }), "Pablo", "editor"],
    ["deducida", casa(), "Pablo Artiñano", "owner"],
    ["deducida, lector (no se guarda, pero es él)", casa(), "Pablo", "viewer"],
    ["desmarcada", casa({ accountMemberIdByUser: { u1: null } }), "Pablo", "owner"],
    ["nadie", casa(), "Manu", "owner"],
  ];
  it.each(casos)("%s", (_, data, autor, papel) => {
    const quien = { userId: "u1", autor, papel };
    expect(buscarPersona(data, "yo", quien).persona).toBe(personaQueEscribe(data, quien).persona);
  });
});
