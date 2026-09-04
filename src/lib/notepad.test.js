import { describe, it, expect } from "vitest";
import {
  libretaVacia, estadoDe, anotar, delegar, bloquear, confirmar, olvidar,
  porQue, normalizar, sePuedePreguntar, NOTEPAD_VERSION,
} from "./notepad.js";
import { valorValido, rutaDe, ejemplosDelPanel, CAMPOS, FAMILIAS } from "./notepadFields.js";

const HOY = "2026-09-04";

describe("los cuatro estados", () => {
  // El estado NO es "relleno o vacío": el mismo 2 significa cuatro cosas, y de
  // cuál sea depende si la UI lo pinta, lo pregunta o lo respeta.
  it("sin anotación y sin valor es vacío", () => {
    expect(estadoDe(libretaVacia(), "freqs.pescado", null)).toBe("vacio");
  });

  it("sin anotación pero con valor es inferido, no fijado", () => {
    // Es un default. Hay algo que enseñar, pero como suposición: darlo por
    // dicho sería atribuirle al usuario una decisión que no tomó.
    expect(estadoDe(libretaVacia(), "freqs.pescado", 2)).toBe("inferido");
  });

  it("lo deducido del texto es inferido hasta que se confirma", () => {
    const n = anotar(libretaVacia(), "freqs.pescado", { origen: "texto", frase: "menos pescado", fecha: HOY });
    expect(estadoDe(n, "freqs.pescado", 1)).toBe("inferido");
    expect(estadoDe(confirmar(n, "freqs.pescado"), "freqs.pescado", 1)).toBe("fijado");
  });

  it("lo contestado en una pregunta es fijado desde el principio", () => {
    const n = anotar(libretaVacia(), "freqs.pescado", { origen: "pregunta", fecha: HOY });
    expect(estadoDe(n, "freqs.pescado", 1)).toBe("fijado");
  });

  it("delegado no es un hueco: es permiso", () => {
    const n = delegar(libretaVacia(), "freqs.verdura");
    expect(estadoDe(n, "freqs.verdura", null)).toBe("delegado");
    expect(sePuedePreguntar(n, "freqs.verdura")).toBe(false);
  });
});

describe("bloqueado", () => {
  it("un no-go no se vuelve a preguntar nunca", () => {
    const n = bloquear(libretaVacia(), "presupuesto");
    expect(sePuedePreguntar(n, "presupuesto")).toBe(false);
    expect(estadoDe(n, "presupuesto", null)).toBe("fijado");
  });

  // Escribir no desbloquea: si no, cualquier frase del panel reabriría un tema
  // que el usuario cerró a propósito.
  it("sobrevive a una escritura posterior", () => {
    let n = bloquear(libretaVacia(), "freqs.pescado");
    n = anotar(n, "freqs.pescado", { origen: "texto", frase: "menos pescado", fecha: HOY });
    expect(n.campos["freqs.pescado"].bloqueado).toBe(true);
  });
});

describe("procedencia y deshacer", () => {
  it("guarda la frase entera, sin tocarla", () => {
    const frase = "echo de menos más pasta, la verdad";
    const n = anotar(libretaVacia(), "freqs.pasta_arroz", { origen: "texto", frase, fecha: HOY });
    expect(n.campos["freqs.pasta_arroz"].procedencia.frase).toBe(frase);
    expect(porQue(n, "freqs.pasta_arroz")).toBe(`Porque dijiste «${frase}» el ${HOY}`);
  });

  it("no inventa un porqué donde no lo hay", () => {
    expect(porQue(libretaVacia(), "freqs.pescado")).toBeNull();
  });

  // El deshacer tiene que volver al PRINCIPIO, no al penúltimo valor: si no,
  // dos cambios seguidos dejan al usuario a medio camino sin saberlo.
  it("conserva el valor original tras varias escrituras", () => {
    let n = anotar(libretaVacia(), "freqs.pescado", { origen: "texto", anterior: 3, fecha: HOY });
    n = anotar(n, "freqs.pescado", { origen: "texto", anterior: 2, fecha: HOY });
    expect(n.campos["freqs.pescado"].anterior).toBe(3);
  });

  it("olvidar quita la anotación y devuelve el campo a su estado sin libreta", () => {
    const n = anotar(libretaVacia(), "freqs.pescado", { origen: "texto", fecha: HOY });
    const limpio = olvidar(n, "freqs.pescado");
    expect(limpio.campos["freqs.pescado"]).toBeUndefined();
    expect(estadoDe(limpio, "freqs.pescado", 2)).toBe("inferido");
  });
});

describe("inmutabilidad", () => {
  // Estas libretas vienen del estado de React: mutarlas se traga el re-render
  // y el usuario ve la pantalla vieja con el dato nuevo debajo.
  it("anotar no toca la libreta que recibe", () => {
    const original = libretaVacia();
    const copia = JSON.stringify(original);
    anotar(original, "freqs.pescado", { origen: "texto", fecha: HOY });
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
    const n = anotar(libretaVacia(), "freqs.pescado", { origen: "texto", frase: "menos pescado", fecha: HOY });
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
    expect(rutaDe("base", "pasta", "ninos", "cena")).toBe("base.pasta.@ninos.#cena");
  });

  it("los ejemplos del saludo salen de la tabla, no de una lista aparte", () => {
    const ejemplos = ejemplosDelPanel();
    expect(ejemplos.length).toBe(CAMPOS.filter((c) => c.ejemplo).length);
    expect(ejemplos).toContain("más platos con salsa");
  });

  // Ningún campo puede tocar alergias: van por su camino, con confirmación.
  // Un alérgeno que entra como preferencia es el fallo peligroso de todo esto.
  it("ningún campo del panel apunta a las alergias", () => {
    for (const c of CAMPOS) {
      expect(c.en).not.toMatch(/allerg/i);
      expect(c.id).not.toMatch(/alerg|allerg/i);
    }
  });
});
