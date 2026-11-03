import { describe, it, expect } from "vitest";
import { referenciasRotas, rotasDePreferencias, rotasDeTareas, TIPOS_ROTA, TIPO_ROTA, ACCIONES_ROTA, ACCION_DE_ROTA } from "./referenciasRotas.js";
import { EJES } from "../data/axisRegistry.js";

// Un eje de enum con vocabulario, uno sin vocabulario y uno booleano, del registro de verdad.
const conVocabulario = EJES.find((e) => Array.isArray(e.vocabulario) && e.vocabulario.length && e.tipo !== "booleano");
const sinVocabulario = EJES.find((e) => !e.vocabulario && e.tipo !== "booleano");
const booleano = EJES.find((e) => e.tipo === "booleano");
const fila = (id, eje, valor) => ({ id, eje, valor });

describe("cada clase de rota dice qué se hace con ella (nunca un fallo callado)", () => {
  it("todas las clases tienen su acción, y la acción es de la lista", () => {
    expect(Object.keys(ACCION_DE_ROTA).sort()).toEqual([...TIPOS_ROTA].sort());
    for (const a of Object.values(ACCION_DE_ROTA)) expect(ACCIONES_ROTA).toContain(a);
  });
});

describe("rotasDePreferencias: un valor que ya no está en el vocabulario de su eje", () => {
  it("hay ejes de los tres tipos para probar", () => {
    expect(conVocabulario && sinVocabulario && booleano).toBeTruthy();
  });

  it("el valor de fuera sale, con su eje y que se pregunta; el de dentro no", () => {
    const r = rotasDePreferencias([fila("p1", conVocabulario.id, conVocabulario.vocabulario[0]), fila("p2", conVocabulario.id, "no-existe-este-valor")]);
    expect(r).toEqual([{ donde: "preferencia", id: "p2", tipo: TIPO_ROTA.VALOR_FUERA_DEL_EJE, ref: `${conVocabulario.id}=no-existe-este-valor`, accion: "preguntar" }]);
  });

  it("un vocabulario de números («nova»: 1 a 4) se compara como texto: «1» es de dentro", () => {
    const nova = EJES.find((e) => e.id === "nova");
    expect(rotasDePreferencias([fila("n1", "nova", String(nova.vocabulario[0])), fila("n2", "nova", nova.vocabulario[0])])).toEqual([]);
    expect(rotasDePreferencias([fila("n3", "nova", "9")]).map((x) => x.id)).toEqual(["n3"]);
  });

  it("no cuentan: un eje sin vocabulario, un booleano, una regla con prefijo («grupo:carne») ni un valor vacío", () => {
    expect(rotasDePreferencias([
      fila("a", sinVocabulario.id, "lo-que-sea"),
      fila("b", booleano.id, true),
      fila("c", conVocabulario.id, "grupo:carne"),
      fila("d", conVocabulario.id, null),
      fila("e", "eje-que-no-existe", "x"),
    ])).toEqual([]);
  });
});

describe("rotasDeTareas: una persona que ya no es de la casa o un campo que ya no existe", () => {
  const personas = ["ana", "luis"];

  it("por «para», por encargado, por persona_id o por la clave: sale la persona que falta y se corrige", () => {
    const r = rotasDeTareas([
      { id: "t1", para_member: "marta" },
      { id: "t2", asignado_member: "pedro" },
      { id: "t3", persona_id: "eva" },
      { id: "t4", clave: "alergias:juan" },
    ], personas);
    expect(r.map((x) => [x.id, x.tipo, x.ref, x.accion])).toEqual([
      ["t1", "persona_ausente", "marta", "corregir"],
      ["t2", "persona_ausente", "pedro", "corregir"],
      ["t3", "persona_ausente", "eva", "corregir"],
      ["t4", "persona_ausente", "juan", "corregir"],
    ]);
  });

  it("una tarea de la casa, o de alguien que está, no sale", () => {
    expect(rotasDeTareas([{ id: "t1" }, { id: "t2", para_member: "ana", asignado_member: "luis" }, { id: "t3", clave: "alergias:ana" }], personas)).toEqual([]);
  });

  it("sin personas conocidas (null) no se mira la persona, pero el campo sí", () => {
    expect(rotasDeTareas([{ id: "t1", para_member: "marta", campo: "campoQueYaNoEsta" }, { id: "t2", para_member: "marta" }], null)
      .map((x) => [x.id, x.tipo])).toEqual([["t1", "campo_desconocido"]]);
  });

  it("un campo que ya no está en el registro sale; uno que está, no", () => {
    expect(rotasDeTareas([{ id: "t1", campo: "campoQueYaNoEsta" }, { id: "t2", campo: "alergias" }], personas))
      .toEqual([{ donde: "tarea", id: "t1", tipo: TIPO_ROTA.CAMPO_DESCONOCIDO, ref: "campoQueYaNoEsta", accion: "corregir" }]);
  });
});

describe("referenciasRotas: las de una casa, juntas", () => {
  it("preferencias y tareas, y sin nada no hay nada", () => {
    expect(referenciasRotas()).toEqual([]);
    const r = referenciasRotas({ preferencias: [fila("p", conVocabulario.id, "fuera")], tareas: [{ id: "t", para_member: "x" }], personas: ["ana"] });
    expect(r.map((x) => x.donde)).toEqual(["preferencia", "tarea"]);
  });
});
