/**
 * El eje 39. No cura nada: le pone nombre a lo que la app ya recoge.
 */
import { describe, it, expect } from "vitest";
import { contextoDe, admiteOcasion } from "./contextoPeticion.js";

describe("contexto de la petición", () => {
  it("traduce los minutos a prisa", () => {
    expect(contextoDe({ maxTime: 15 }).valor.prisa).toBe("mucha");
    expect(contextoDe({ maxTime: 30 }).valor.prisa).toBe("normal");
    expect(contextoDe({ maxTime: 60 }).valor.prisa).toBe("poca");
    expect(contextoDe({ maxTime: 120 }).valor.prisa).toBe("ninguna");
  });

  it("respeta los tres niveles que ya existen en vez de inventar otros", () => {
    expect(contextoDe({ cookLevel: "basic" }).valor.ganas).toBe("pocas");
    expect(contextoDe({ cookLevel: "pro" }).valor.ganas).toBe("muchas");
    expect(contextoDe({ cookLevel: "raro" }).valor.ganas).toBeNull();
  });

  /**
   * LO QUE FALTA SE DICE. Un contexto con `prisa: "normal"` por defecto es un
   * contexto que afirma algo que el usuario no contestó, y quien lo lea no
   * puede distinguirlo de una respuesta real.
   */
  it("declara sus huecos en vez de rellenarlos", () => {
    const vacio = contextoDe({});
    expect(vacio.valor.prisa).toBeNull();
    expect(vacio.valor.ganas).toBeNull();
    expect(vacio.duda).toMatch(/maxTime/);
    expect(vacio.duda).toMatch(/cookLevel/);
    const lleno = contextoDe({ maxTime: 30, cookLevel: "normal", eaters: 4, dia: "martes" });
    expect(lleno.duda).toBeNull();
  });

  it("el martes y el sábado no son el mismo contexto", () => {
    expect(contextoDe({ dia: "martes" }).valor.momento).toBe("entre_semana");
    expect(contextoDe({ dia: "sabado" }).valor.momento).toBe("finde");
  });

  /**
   * `validateMenu` ya castiga los platos de ocasión entre semana con la regla
   * `plato_ocasion_entre_semana`. Esa regla ES este eje escrito dentro del
   * validador; aquí se puede preguntar ANTES de armar el menú en vez de
   * reprocharlo después.
   */
  it("dice si cabe un plato de ocasión, y calla si no sabe qué día es", () => {
    expect(admiteOcasion(contextoDe({ dia: "sabado" }))).toBe(true);
    expect(admiteOcasion(contextoDe({ dia: "miercoles" }))).toBe(false);
    expect(admiteOcasion(contextoDe({}))).toBeNull();
  });

  it("no decide nada del catálogo: solo traduce", () => {
    const c = contextoDe({ maxTime: 20, eaters: 4, hasKids: true, kitchenTools: ["Horno"] });
    expect(Object.keys(c.valor).sort()).toEqual(
      ["comensales", "conNinos", "despensa", "esBebe", "ganas", "momento", "prisa", "trastos"].sort(),
    );
  });
});
