import { describe, it, expect } from "vitest";
import { esPregunta, tramitar, bloqueDe, marcasDe, vigentesSegun } from "./pendientes.js";

const PREGUNTA_COVA = "Antes de darte ideas para Cova, me falta un dato importante de seguridad: ¿tiene alguna alergia o intolerancia (ella o el resto de la familia)? Así te propongo platos que pueda comer sin riesgo. 😊";

describe("esPregunta: la pregunta de la captura cuenta aunque acabe en emoji", () => {
  it("una pregunta seguida de emoji sigue siendo pregunta", () => {
    expect(esPregunta(PREGUNTA_COVA)).toBe(true);
  });
  it("una respuesta sin pregunta no lo es", () => {
    expect(esPregunta("Listo, ya os tengo apuntado que nadie tiene alergias.")).toBe(false);
  });
  it("una marca de cierre no hace pasar una afirmación por pregunta", () => {
    expect(esPregunta("Te propongo tres platos. ⟪cerrar P1⟫")).toBe(false);
  });
  it("cuenta la pregunta del último párrafo, no una de hace dos párrafos", () => {
    expect(esPregunta("¿Qué tal?\n\nTe propongo pasta.")).toBe(false);
  });
});

describe("tramitar: crear, cerrar y caducar tareas", () => {
  it("una pregunta abre una tarea con el pedido de la persona", () => {
    const { visible, pendientes } = tramitar(PREGUNTA_COVA, [], "@homenuers_bot qué recomendarías para Cova, tiene 11 meses");
    expect(visible).toBe(PREGUNTA_COVA);
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({ id: "P1", vistas: 0 });
    expect(pendientes[0].pedido).toContain("Cova");
    expect(pendientes[0].falta).toContain("alergia");
  });

  it("una marca ⟪cerrar P1⟫ cierra la tarea y no sale en el texto", () => {
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0 }];
    const { visible, pendientes } = tramitar("Nada, ninguna. Para Cova: puré de calabaza con pollo. ⟪cerrar P1⟫", previas, "Nada, ninguna");
    expect(visible).not.toContain("⟪");
    expect(visible).toContain("puré");
    expect(pendientes).toEqual([]);
  });

  it("una tarea mostrada dos turnos sin cerrarse se descarta", () => {
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 1 }];
    const { pendientes } = tramitar("Vale, cuéntame más cuando quieras.", previas, "¿qué tal el tiempo?");
    expect(pendientes).toEqual([]);
  });

  it("una tarea no cerrada, sin pregunta nueva, se queda una vuelta más", () => {
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0 }];
    const { pendientes } = tramitar("Vale, lo miro.", previas, "¿qué tal el tiempo?");
    expect(pendientes).toEqual([{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 1 }]);
  });

  it("sin tareas abiertas, una pregunta nueva empieza en P1", () => {
    const { pendientes } = tramitar("¿Cuántos litros?", [], "apuntar leche");
    expect(pendientes.map((p) => p.id)).toEqual(["P1"]);
  });

  it("una nueva pregunta con la tarea aún abierta es otro dato de esa tarea, no una tarea nueva", () => {
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0 }];
    const { pendientes } = tramitar("✅ Apuntado: Cova, sin alergias.\n\n¿Cova ya come sólidos, o solo purés?", previas, "Nada, ninguna");
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({ id: "P1", pedido: "recomendar para Cova" });
    expect(pendientes[0].falta).toContain("sólidos");
  });

  it("no duplica una tarea con el mismo pedido", () => {
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0 }];
    const { pendientes } = tramitar(PREGUNTA_COVA, previas, "recomendar para Cova");
    expect(pendientes.filter((p) => p.pedido === "recomendar para Cova")).toHaveLength(1);
  });
});

describe("vigentesSegun: el estado de la casa manda sobre las tareas de seguridad", () => {
  const resueltaSi = (...claves) => (c) => claves.includes(c);
  it("una tarea ligada a un hueco ya resuelto se quita sola", () => {
    const abiertas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0, clave: "alergias:c1" }];
    expect(vigentesSegun(abiertas, resueltaSi("alergias:c1"))).toEqual([]);
  });
  it("una tarea ligada a un hueco aún sin resolver se queda", () => {
    const abiertas = [{ id: "P1", pedido: "recomendar para Cova", falta: "alergias", vistas: 0, clave: "alergias:c1" }];
    expect(vigentesSegun(abiertas, resueltaSi())).toHaveLength(1);
  });
  it("una tarea sin clave (no es de estado) no se toca aquí", () => {
    const abiertas = [{ id: "P1", pedido: "apuntar leche", falta: "cantidad", vistas: 0, clave: null }];
    expect(vigentesSegun(abiertas, resueltaSi("alergias:c1"))).toHaveLength(1);
  });
  it("la clave la pone el clasificador según la pregunta", () => {
    const claveDe = (f) => (/alergi/.test(f) ? "alergias:c1" : /come/.test(f) ? "etapa:c1" : null);
    const { pendientes } = tramitar(PREGUNTA_COVA, [], "recomendar para Cova", { claveDe });
    expect(pendientes[0].clave).toBe("alergias:c1");
  });
  it("Cova: guardadas las alergias, la tarea pasa a la etapa y no se pierde", () => {
    const claveDe = (f) => (/alergi/.test(f) ? "alergias:c1" : /come/.test(f) ? "etapa:c1" : null);
    const previas = [{ id: "P1", pedido: "recomendar para Cova", falta: "¿alguna alergia?", vistas: 0, clave: "alergias:c1" }];
    const { pendientes } = tramitar("✅ Apuntado: sin alergias.\n\n¿Cova ya come sólidos o sigue con purés?", previas, "Nada, ninguna", { claveDe });
    expect(pendientes[0]).toMatchObject({ id: "P1", pedido: "recomendar para Cova", clave: "etapa:c1" });
    // Al turno siguiente las alergias ya están revisadas, pero la tarea sigue viva.
    expect(vigentesSegun(pendientes, resueltaSi("alergias:c1"))).toHaveLength(1);
  });
});

describe("bloqueDe y marcasDe", () => {
  it("sin tareas no añade nada al mensaje", () => {
    expect(bloqueDe([])).toBe("");
  });
  it("con tareas las lista con su id y lo que falta", () => {
    const b = bloqueDe([{ id: "P1", pedido: "recomendar para Cova", falta: "alergias" }]);
    expect(b).toContain("P1: «recomendar para Cova» (falta: alergias)");
    expect(b).toContain("⟪cerrar P1⟫");
  });
  it("marcasDe devuelve los ids cerrados en mayúsculas", () => {
    expect(marcasDe("texto ⟪cerrar p2⟫ y ⟪cerrar P3⟫")).toEqual(["P2", "P3"]);
  });
});
