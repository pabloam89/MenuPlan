import { describe, it, expect } from "vitest";
import { CAMPOS_DE_AFINAR, PREGUNTA_DE_CAMPO, PREGUNTA_DE_PROFUNDIDAD, LIMITE, preguntasDeAfinar, siguientePregunta, lineaDeAfinar } from "./siguientePregunta.js";
import { estadosDeFichas } from "./estadoDeDato.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { PROFUNDIDADES_TRATO } from "./vocabularios.js";

// Un dato de la ficha Casa o Rutina de ficha_casa v2: de la casa, sin ámbito.
const dato = (campo, estado, extra = {}) => ({ campo, sujeto: { tipo: "casa", id: null }, ambito: null, estado, valor: null, ...extra });
const ficha = (...datos) => estadosDeFichas({ casa: datos });
const vacia = ficha(...CAMPOS_DE_AFINAR.map((c) => dato(c, REGISTRO_CAMPOS[c].defecto == null ? "vacio" : "por_defecto")));

describe("los campos de afinar salen del registro", () => {
  it("de la casa, con peso en el menú, sin seguridad, de más peso a menos", () => {
    expect(CAMPOS_DE_AFINAR).toEqual(["meals", "mealStructure", "cookLevel", "kitchenTools", "pantryMode"]);
    for (const c of CAMPOS_DE_AFINAR) expect(REGISTRO_CAMPOS[c].seguridad, c).toBe(false);
  });

  it("cada uno tiene su pregunta y la herramienta que guarda la respuesta; ninguna de seguridad", () => {
    expect(Object.keys(PREGUNTA_DE_CAMPO).sort()).toEqual([...CAMPOS_DE_AFINAR].sort());
    expect(PREGUNTA_DE_CAMPO.alergias).toBeUndefined();
    expect(PREGUNTA_DE_CAMPO.etapaBebe).toBeUndefined();
  });

  it("cada profundidad del trato tiene su límite", () => {
    expect(Object.keys(LIMITE).sort()).toEqual([...PROFUNDIDADES_TRATO].sort());
  });
});

describe("siguientePregunta: como mucho una, según el trato de quien escribe", () => {
  it("con la profundidad por defecto (preguntar) y todo por decir, primero si lo preparamos ya o lo afinamos", () => {
    expect(siguientePregunta(vacia, null)).toEqual({ campo: null, texto: PREGUNTA_DE_PROFUNDIDAD, guarda: "ajustar_trato" });
    expect(siguientePregunta(vacia, { ritmo: "guiado", profundidad: "preguntar" })?.campo).toBeNull();
  });

  it("«hazlo ya» (profundidad nada o ritmo directo): ninguna", () => {
    expect(siguientePregunta(vacia, { ritmo: "guiado", profundidad: "nada" })).toBeNull();
    expect(siguientePregunta(vacia, { ritmo: "directo", profundidad: "mucho" })).toBeNull();
    expect(preguntasDeAfinar(vacia, { ritmo: "directo", profundidad: "mucho" })).toEqual([]);
  });

  it("afinar poco: las tres de más peso; mucho: las cinco", () => {
    expect(preguntasDeAfinar(vacia, { profundidad: "poco" }).map((p) => p.campo)).toEqual(["meals", "mealStructure", "cookLevel"]);
    expect(preguntasDeAfinar(vacia, { profundidad: "mucho" }).map((p) => p.campo)).toEqual(CAMPOS_DE_AFINAR);
    expect(siguientePregunta(vacia, { profundidad: "mucho" })).toEqual({ campo: "meals", ...PREGUNTA_DE_CAMPO.meals });
  });

  it("lo dicho, supuesto o aprendido no se pregunta; lo caducado sí; contestadas las de su límite, no entra otra", () => {
    const dichas = ficha(
      dato("meals", "dicho", { origen: "dicho", valor: ["Cena"] }),
      dato("mealStructure", "supuesto", { origen: "supuesto", valor: "1_plato" }),
      // Caducado: ficha_casa ya no da su sobre, sino la base (por defecto) con la fecha en que caducó.
      dato("cookLevel", "por_defecto", { valor: "normal", caduca_at: "2026-01-01T00:00:00Z" }),
      dato("kitchenTools", "vacio"),
      dato("pantryMode", "por_defecto"),
    );
    // Las tres de «poco»: meals dicho, mealStructure supuesto y cookLevel caducado: solo vuelve cookLevel.
    expect(preguntasDeAfinar(dichas, { profundidad: "poco" }).map((p) => p.campo)).toEqual(["cookLevel"]);
    expect(preguntasDeAfinar(dichas, { profundidad: "mucho" }).map((p) => p.campo)).toEqual(["cookLevel", "kitchenTools", "pantryMode"]);
  });

  it("con todo dicho, ni siquiera se pregunta si afinar", () => {
    const todo = ficha(...CAMPOS_DE_AFINAR.map((c) => dato(c, "dicho", { origen: "dicho", valor: "x" })));
    expect(siguientePregunta(todo, null)).toBeNull();
  });

  it("un dato bloqueado (no quiere decirlo) no se vuelve a preguntar", () => {
    const bloqueado = ficha(dato("meals", "vacio", { bloqueado: true }), dato("mealStructure", "dicho", { origen: "dicho", valor: "1_plato" }), dato("cookLevel", "dicho", { origen: "dicho", valor: "basic" }));
    expect(preguntasDeAfinar(bloqueado, { profundidad: "poco" })).toEqual([]);
  });

  it("sin ficha (null), todo falta", () => {
    expect(siguientePregunta(null, { profundidad: "poco" })?.campo).toBe("meals");
  });
});

describe("lineaDeAfinar: lo que ve Lola", () => {
  it("afinando, la siguiente pregunta con su herramienta", () => {
    const l = lineaDeAfinar(vacia, { profundidad: "poco" });
    expect(l).toMatch(/^AFINANDO/);
    expect(l).toContain(PREGUNTA_DE_CAMPO.meals.texto);
    expect(l).toContain("ajustar_cocina");
  });

  it("sin afinar (por defecto, hazlo ya o nada que falte) o sin la ficha de la base, ninguna", () => {
    expect(lineaDeAfinar(vacia, null)).toBeNull();
    expect(lineaDeAfinar(vacia, { profundidad: "nada" })).toBeNull();
    expect(lineaDeAfinar(null, { profundidad: "mucho" })).toBeNull();
    const todo = ficha(...CAMPOS_DE_AFINAR.map((c) => dato(c, "dicho", { origen: "dicho", valor: "x" })));
    expect(lineaDeAfinar(todo, { profundidad: "mucho" })).toBeNull();
  });
});
