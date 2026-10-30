import { describe, it, expect } from "vitest";
import { crearEsquema, esquemaDato, DEL_REGISTRO } from "./esquemaHerramienta.js";
import { datoDe } from "./registroFicha.js";
import { vocabulario, NIVEL_COCINA, APARATOS, DONDE_COME } from "./vocabularios.js";

// Un registro y unos vocabularios de prueba: lo que se mide es que el esquema sale de ellos.
const conVocabularios = (vocabs) => {
  const datos = {
    nivel: { tipo: "enum", vocabulario: "niveles" },
    trastos: { tipo: "lista_enum", vocabulario: "aparatos" },
    donde: { tipo: "mapa", vocabulario: "sitios" },
    edad: { tipo: "int", minimo: 0, maximo: 9 },
    peso: { tipo: "decimal", minimo: null, maximo: null },
    suelto: { tipo: "enum", vocabulario: null },
    ficha: { tipo: "objeto", vocabulario: null },
  };
  return crearEsquema({ datoDe: (c) => datos[c] ?? null, vocabulario: (n) => vocabs[n] ?? null });
};

describe("esquemaDato: el parámetro sale del dato del registro", () => {
  const vocabs = { niveles: ["a", "b"], aparatos: ["x", "y"], sitios: ["s"] };
  const esquema = conVocabularios(vocabs);

  it("un enum lleva el vocabulario de su dato, y cambiar el vocabulario cambia el esquema", () => {
    expect(esquema("nivel").enum).toEqual(vocabs.niveles);
    const otro = conVocabularios({ ...vocabs, niveles: [...vocabs.niveles, "c"] });
    expect(otro("nivel").enum).toEqual([...vocabs.niveles, "c"]);
    expect(otro("nivel").enum).not.toEqual(esquema("nivel").enum);
  });

  it("una lista de vocabulario es un array de ese enum", () => {
    const s = esquema("trastos");
    expect(s.type).toBe("array");
    expect(s.items.enum).toEqual(vocabs.aparatos);
  });

  it("un mapa con vocabulario da un valor suelto del mapa", () => {
    expect(esquema("donde")).toMatchObject({ type: "string", enum: vocabs.sitios });
  });

  it("un número lleva los límites del registro, y sin límites no inventa ninguno", () => {
    expect(esquema("edad")).toMatchObject({ type: "integer", minimum: 0, maximum: 9 });
    expect(Object.keys(esquema("peso"))).toEqual(["type"]);
  });

  it("la descripción es la del parámetro, a mano", () => {
    expect(esquema("nivel", { descripcion: "d" }).description).toBe("d");
    expect(esquema("nivel")).not.toHaveProperty("description");
  });

  it("falla en alto: clave que no existe, enum sin vocabulario o tipo que no cabe en un parámetro", () => {
    expect(() => esquema("no_existe")).toThrow(/no está en el registro/);
    expect(() => esquema("suelto")).toThrow(/no tiene vocabulario/);
    expect(() => esquema("ficha")).toThrow(/no cabe en un parámetro/);
  });

  it("el enum es una copia: tocarlo no toca el vocabulario", () => {
    esquema("nivel").enum.push("z");
    expect(esquema("nivel").enum).toEqual(vocabs.niveles);
  });
});

describe("con el registro de verdad", () => {
  it("cookLevel, kitchenTools y schedule salen de sus vocabularios", () => {
    expect(esquemaDato("cookLevel").enum).toEqual(vocabulario(datoDe("cookLevel").vocabulario));
    expect(esquemaDato("cookLevel").enum).toEqual(NIVEL_COCINA);
    expect(esquemaDato("kitchenTools").items.enum).toEqual(APARATOS);
    expect(esquemaDato("schedule").enum).toEqual(DONDE_COME);
  });

  it("la edad lleva los límites de su dato", () => {
    const d = datoDe("members.age");
    expect(esquemaDato("members.age")).toMatchObject({ type: "integer", minimum: d.minimo, maximum: d.maximo });
  });

  it("lleva la clave del dato bajo DEL_REGISTRO, que no viaja en el JSON", () => {
    const s = esquemaDato("cookLevel");
    expect(s[DEL_REGISTRO]).toBe("cookLevel");
    expect(JSON.parse(JSON.stringify(s))).toEqual({ type: s.type, enum: s.enum });
  });
});
