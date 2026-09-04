import { describe, it, expect } from "vitest";
import {
  libretaVacia, valorDe, estadoDe, poner, delegar, bloquear, confirmar,
  deshacer, olvidar, porQue, normalizar, sePuedePreguntar, proyectar,
  importarDeData, NOTEPAD_VERSION,
} from "./notepad.js";
import { valorValido, rutaDe, ejemplosDelPanel, CAMPOS, FAMILIAS } from "./notepadFields.js";

const HOY = "2026-09-04";

describe("los cuatro estados", () => {
  // El estado NO es "relleno o vacío": el mismo 2 significa cuatro cosas, y de
  // cuál sea depende si la UI lo pinta, lo pregunta o lo respeta.
  it("lo que la libreta no conoce está vacío", () => {
    expect(estadoDe(libretaVacia(), "freqs.pescado")).toBe("vacio");
    expect(valorDe(libretaVacia(), "freqs.pescado", 2)).toBe(2);
  });

  it("lo deducido del texto es inferido hasta que se confirma", () => {
    const n = poner(libretaVacia(), "freqs.pescado", 1, { origen: "texto", frase: "menos pescado", fecha: HOY });
    expect(estadoDe(n, "freqs.pescado")).toBe("inferido");
    expect(estadoDe(confirmar(n, "freqs.pescado"), "freqs.pescado")).toBe("fijado");
  });

  it("lo contestado en una pregunta es fijado desde el principio", () => {
    const n = poner(libretaVacia(), "freqs.pescado", 1, { origen: "pregunta" });
    expect(estadoDe(n, "freqs.pescado")).toBe("fijado");
  });

  it("un default es inferido: hay algo que enseñar, pero como suposición", () => {
    const n = poner(libretaVacia(), "freqs.pescado", 2, { origen: "default" });
    expect(estadoDe(n, "freqs.pescado")).toBe("inferido");
  });

  it("delegado no es un hueco: es permiso", () => {
    const n = delegar(libretaVacia(), "freqs.verdura");
    expect(estadoDe(n, "freqs.verdura")).toBe("delegado");
    expect(sePuedePreguntar(n, "freqs.verdura")).toBe(false);
  });
});

describe("bloqueado", () => {
  it("un no-go no se vuelve a preguntar nunca", () => {
    const n = bloquear(libretaVacia(), "esfuerzo.facil");
    expect(sePuedePreguntar(n, "esfuerzo.facil")).toBe(false);
    expect(estadoDe(n, "esfuerzo.facil")).toBe("fijado");
  });

  it("sobrevive a una escritura posterior", () => {
    let n = bloquear(libretaVacia(), "freqs.pescado");
    n = poner(n, "freqs.pescado", 1, { origen: "texto", frase: "menos pescado", fecha: HOY });
    expect(n.campos["freqs.pescado"].bloqueado).toBe(true);
  });
});

describe("procedencia y deshacer", () => {
  it("guarda la frase entera, sin tocarla", () => {
    const frase = "echo de menos más pasta, la verdad";
    const n = poner(libretaVacia(), "freqs.pasta_arroz", 3, { origen: "texto", frase, fecha: HOY });
    expect(porQue(n, "freqs.pasta_arroz")).toBe(`Porque dijiste «${frase}» el ${HOY}`);
  });

  it("no inventa un porqué donde no lo hay", () => {
    expect(porQue(libretaVacia(), "freqs.pescado")).toBeNull();
  });

  // El deshacer tiene que volver al PRINCIPIO, no al penúltimo valor: si no,
  // dos cambios seguidos dejan al usuario a medio camino sin saberlo.
  it("vuelve al valor original tras varias escrituras", () => {
    let n = poner(libretaVacia(), "freqs.pescado", 3, { origen: "pregunta" });
    n = poner(n, "freqs.pescado", 2, { origen: "texto", frase: "menos pescado", fecha: HOY });
    n = poner(n, "freqs.pescado", 1, { origen: "texto", frase: "aún menos", fecha: HOY });
    expect(n.campos["freqs.pescado"].anterior).toBe(3);
    expect(valorDe(deshacer(n, "freqs.pescado"), "freqs.pescado")).toBe(3);
  });

  it("deshacer un campo que nació del panel lo borra entero", () => {
    const n = poner(libretaVacia(), "cocina.mexicana", 1, { origen: "texto", frase: "más mexicana", fecha: HOY });
    expect(deshacer(n, "cocina.mexicana").campos["cocina.mexicana"]).toBeUndefined();
  });

  it("olvidar quita la anotación sin reponer nada", () => {
    const n = poner(libretaVacia(), "freqs.pescado", 1, { origen: "texto" });
    expect(olvidar(n, "freqs.pescado").campos["freqs.pescado"]).toBeUndefined();
  });
});

describe("proyectar: la vista que leen los consumidores de siempre", () => {
  it("reconstruye freqs y freqsByGroup tal y como los espera el planner", () => {
    let n = poner(libretaVacia(), "freqs.pescado", 2, { origen: "pregunta" });
    n = poner(n, "freqs.verdura", 4, { origen: "pregunta" });
    n = poner(n, "freqs.pescado.@ninos", 1, { origen: "texto", frase: "a los niños menos pescado", fecha: HOY });
    const v = proyectar(n);
    expect(v.freqs).toEqual({ pescado: 2, verdura: 4 });
    expect(v.freqsByGroup).toEqual({ ninos: { pescado: 1 } });
  });

  // "Lo que tú veas" es permiso para que decida el planner, no un número que
  // imponerle: proyectarlo sería convertir una delegación en una orden.
  it("lo delegado no se proyecta", () => {
    const n = delegar(poner(libretaVacia(), "freqs.verdura", 4, { origen: "pregunta" }), "freqs.verdura");
    expect(proyectar(n).freqs.verdura).toBeUndefined();
  });

  it("separa los ejes de sesgo y los excluidos", () => {
    let n = poner(libretaVacia(), "cocina.mexicana", 1, { origen: "texto" });
    n = poner(n, "tecnica.horno", 1, { origen: "texto" });
    n = poner(n, "excluidos.cilantro", true, { origen: "texto" });
    const v = proyectar(n);
    expect(v.sesgos).toEqual({ cocina: { mexicana: 1 }, tecnica: { horno: 1 } });
    expect(v.excluidos).toEqual(["cilantro"]);
  });
});

describe("importarDeData", () => {
  // Lo que el usuario contestó en el wizard antes de que la libreta existiera
  // entra como `pregunta`, porque eso es literalmente lo que pasó.
  it("mete lo que ya había sin cambiar ningún valor", () => {
    const data = { freqs: { pescado: 2, verdura: 4 }, freqsByGroup: { ninos: { pescado: 1 } } };
    const n = importarDeData(data);
    expect(proyectar(n).freqs).toEqual(data.freqs);
    expect(proyectar(n).freqsByGroup).toEqual(data.freqsByGroup);
    expect(estadoDe(n, "freqs.pescado")).toBe("fijado");
  });

  it("la libreta manda: no pisa lo que ya estaba escrito", () => {
    const previa = poner(libretaVacia(), "freqs.pescado", 1, { origen: "texto", frase: "menos pescado", fecha: HOY });
    const n = importarDeData({ freqs: { pescado: 2 } }, previa);
    expect(valorDe(n, "freqs.pescado")).toBe(1);
  });
});

describe("inmutabilidad", () => {
  // Estas libretas vienen del estado de React: mutarlas se traga el re-render
  // y el usuario ve la pantalla vieja con el dato nuevo debajo.
  it("poner no toca la libreta que recibe", () => {
    const original = libretaVacia();
    const copia = JSON.stringify(original);
    poner(original, "freqs.pescado", 1, { origen: "texto" });
    expect(JSON.stringify(original)).toBe(copia);
  });
});

describe("normalizar", () => {
  it("una libreta ausente o corrupta se convierte en una vacía", () => {
    expect(normalizar(null)).toEqual(libretaVacia());
    expect(normalizar({ v: 99, campos: {} })).toEqual(libretaVacia());
    expect(normalizar({ campos: { x: { origen: "inventado" } } })).toEqual(libretaVacia());
  });

  it("una libreta buena sobrevive intacta", () => {
    const n = poner(libretaVacia(), "freqs.pescado", 1, { origen: "texto", frase: "menos pescado", fecha: HOY });
    expect(normalizar(n).campos["freqs.pescado"].procedencia.frase).toBe("menos pescado");
  });

  it("la versión es explícita, para poder migrar mañana", () => {
    expect(libretaVacia().v).toBe(NOTEPAD_VERSION);
  });
});

describe("el registro de campos", () => {
  // Es la puerta que impide que una alucinación del modelo llegue a la
  // pantalla: puede DECIR lo que quiera, solo puede HACER lo que pase por aquí.
  it("rechaza un valor que no está en el dominio", () => {
    expect(valorValido("cocina", "mexicana")).toBe(true);
    expect(valorValido("cocina", "marciana")).toBe(false);
    expect(valorValido("campo_inventado", "loquesea")).toBe(false);
  });

  it("el campo de lista acepta texto libre, que se resuelve luego", () => {
    expect(valorValido("excluidos", "cilantro")).toBe(true);
    expect(valorValido("excluidos", "")).toBe(false);
  });

  // Las familias tienen que coincidir con DEFAULT_FREQS de aiPlanner.js, o el
  // campo se escribe y no lo lee nadie.
  it("las familias son las que el planner conoce", () => {
    expect(FAMILIAS).toEqual(["carne", "pescado", "legumbres", "pasta_arroz", "huevos", "verdura"]);
  });

  it("la ruta distingue ámbito y servicio, y omite los que son por defecto", () => {
    expect(rutaDe("freqs", "pescado")).toBe("freqs.pescado");
    expect(rutaDe("freqs", "pescado", "ninos")).toBe("freqs.pescado.@ninos");
    expect(rutaDe("base", "pasta", "todos", "cena")).toBe("base.pasta.#cena");
  });

  it("los ejemplos del saludo salen de la tabla, no de una lista aparte", () => {
    expect(ejemplosDelPanel()).toContain("más platos con salsa");
  });

  // Ningún campo puede tocar alergias: van por su camino, con confirmación.
  // Un alérgeno que entra como preferencia es el fallo peligroso de todo esto.
  it("ningún campo del panel apunta a las alergias", () => {
    for (const c of CAMPOS) {
      expect(c.id).not.toMatch(/alerg|allerg/i);
      expect(JSON.stringify(c)).not.toMatch(/allergies/i);
    }
  });
});

// La tabla y la proyección tienen que decir lo mismo: si una fila declara que
// cae en `sesgos` y proyectar la manda a `excluidos`, el panel escribe en un
// sitio y el planner lee de otro, en silencio.
describe("la tabla y proyectar no se contradicen", () => {
  it("cada campo cae donde su fila dice", () => {
    const valores = { freqs: 2, base: 1, cocina: 1, tecnica: 1, salsa: 1, esfuerzo: 1, excluidos: true };
    for (const c of CAMPOS) {
      const valor = c.dominio ? c.dominio[0] : "cilantro";
      const n = poner(libretaVacia(), rutaDe(c.id, valor), valores[c.id], { origen: "texto" });
      const v = proyectar(n);
      if (c.proyecta === "freqs") expect(v.freqs[valor]).toBeDefined();
      else if (c.proyecta === "excluidos") expect(v.excluidos).toContain(valor);
      else expect(v.sesgos[c.id]?.[valor]).toBeDefined();
    }
  });
});
