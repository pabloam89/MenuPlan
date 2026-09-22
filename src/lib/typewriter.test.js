import { describe, it, expect } from "vitest";
import { RITMO, tecleoInicial, pasoDeTecleo, textoDeTecleo, fraseMasLarga } from "./typewriter.js";

const FRASES = ["ab", "cde"];

/** Recorre N fotogramas y devuelve lo que se habría visto en cada uno. */
function correr(frases, n) {
  let estado = tecleoInicial();
  const visto = [];
  for (let i = 0; i < n; i++) {
    visto.push(textoDeTecleo(estado, frases));
    estado = pasoDeTecleo(estado, frases).estado;
  }
  return visto;
}

describe("escribe, se lee, borra y pasa a la siguiente", () => {
  it("escribe letra a letra y borra hacia atrás", () => {
    expect(correr(FRASES, 6)).toEqual(["", "A", "Ab", "Ab", "A", ""]);
  });

  it("al vaciarse salta a la frase siguiente", () => {
    // Fotograma 6 es ya la segunda frase empezando.
    expect(correr(FRASES, 10).slice(6)).toEqual(["", "C", "Cd", "Cde"]);
  });

  it("el bucle no se acaba: tras la última vuelve la primera", () => {
    const visto = correr(FRASES, 40);
    expect(visto.filter((t) => t === "Ab").length).toBeGreaterThan(1);
    expect(visto).toContain("Cde");
  });
});

describe("los tiempos son los que hacen que se lea", () => {
  it("borrar va más rápido que escribir: nadie lee al borrar", () => {
    expect(RITMO.borrar).toBeLessThan(RITMO.escribir);
  });

  it("al terminar la frase se para a que se lea", () => {
    let estado = tecleoInicial();
    // Hasta completar "ab" son dos pasos de escritura.
    estado = pasoDeTecleo(estado, FRASES).estado;
    const { estado: completo, espera } = pasoDeTecleo(estado, FRASES);
    expect(textoDeTecleo(completo, FRASES)).toBe("Ab");
    // El paso que sigue a completarla es el que espera.
    expect(pasoDeTecleo(completo, FRASES).espera).toBe(RITMO.leer);
    expect(espera).toBe(RITMO.escribir);
  });
});

describe("la primera letra va en mayúscula", () => {
  // Las frases del registro estan escritas para ir DENTRO de otra oracion
  // ("menos pescado"); aqui son la oracion entera.
  it("capitaliza aunque la frase venga en minuscula", () => {
    let estado = tecleoInicial();
    for (let i = 0; i < 5; i++) estado = pasoDeTecleo(estado, ["menos pescado"]).estado;
    expect(textoDeTecleo(estado, ["menos pescado"])).toBe("Menos");
  });

  it("con la caja vacia no inventa una letra", () => {
    expect(textoDeTecleo(tecleoInicial(), ["menos pescado"])).toBe("");
  });
});

describe("bordes", () => {
  it("sin frases no revienta ni entra en bucle apretado", () => {
    const { estado, espera } = pasoDeTecleo(tecleoInicial(), []);
    expect(textoDeTecleo(estado, [])).toBe("");
    expect(espera).toBe(RITMO.leer);
    expect(pasoDeTecleo(tecleoInicial(), undefined).espera).toBe(RITMO.leer);
  });

  it("una sola frase también hace bucle", () => {
    const visto = correr(["hola"], 20);
    expect(visto.filter((t) => t === "Hola").length).toBeGreaterThan(1);
  });

  it("la caja se dimensiona con la frase más larga, para no dar saltos", () => {
    expect(fraseMasLarga(FRASES)).toBe(3);
    expect(fraseMasLarga([])).toBe(0);
    expect(fraseMasLarga(undefined)).toBe(0);
  });
});
