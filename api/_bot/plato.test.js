import { describe, it, expect } from "vitest";
import { comidasDelDia, comidaElegida, faltaPara, quiereApuntar, preguntaComida } from "./plato.js";
import { cuandoPorDefecto } from "./menu.js";
import { vaPorLaRapida } from "./router.js";

describe("comida o cena", () => {
  const plan = {
    g1: { "Vie-Comida": { recipeId: "a" }, "Vie-Cena": { recipeId: "b" }, "Sáb-Cena": { recipeId: "c" } },
    _warnings: {},
  };

  it("sabe qué comidas tiene el menú ese día", () => {
    expect(comidasDelDia(plan, "Vie")).toEqual(["Comida", "Cena"]);
    expect(comidasDelDia(plan, "Sáb")).toEqual(["Cena"]);
    expect(comidasDelDia(plan, "Lun")).toEqual([]);
  });

  it("la pregunta lleva Cena primero y la propuesta para el paso 0", () => {
    const r = preguntaComida("cambiar", { dia: "viernes", receta: "pizza casera" }, { dia: "Vie" });
    expect(r.texto.indexOf("[[Cena]]")).toBeLessThan(r.texto.indexOf("[[Comida]]"));
    expect(r.propuesta).toEqual({ tipo: "aclarar", modo: "cambiar", datos: { dia: "viernes", receta: "pizza casera" } });
  });

  it("entiende la respuesta, y no confunde otra cosa con ella", () => {
    for (const t of ["Cena", "la cena", "para la cena", "por la noche", "esta noche"]) expect(comidaElegida(t), t).toBe("Cena");
    for (const t of ["Comida", "a mediodía", "la comida", "almuerzo"]) expect(comidaElegida(t), t).toBe("Comida");
    for (const t of ["cambia la cena del jueves", "qué hay de cena", "no sé"]) expect(comidaElegida(t), t).toBe(null);
  });
});

describe("qué me falta", () => {
  const receta = { ingredients: [{ name: "Lentejas", ingredientId: "lentejas" }, { name: "Chorizo" }, { name: "Zanahoria" }, { name: "Aceite de oliva" }, { name: "Sal" }] };

  it("cruza por id y, si no, por nombre con frontera; lo básico no cuenta", () => {
    const despensa = [{ ingredientId: "lentejas", ingredientName: "Lentejas pardinas" }, { ingredientName: "chorizo picante" }];
    expect(faltaPara(receta, despensa)).toEqual({ tengo: ["Lentejas", "Chorizo"], falta: ["Zanahoria"] });
  });

  it("frontera de palabra: tener «pollo» no es tener «repollo»", () => {
    expect(faltaPara({ ingredients: [{ name: "Repollo" }] }, [{ ingredientName: "pollo" }]).falta).toEqual(["Repollo"]);
  });

  it("«Apúntalo» y un «sí» apuntan; otra cosa no", () => {
    for (const t of ["Apúntalo", "sí, apúntalo", "si", "vale"]) expect(quiereApuntar(t), t).toBe(true);
    for (const t of ["no", "qué es eso", "pon la cena del viernes"]) expect(quiereApuntar(t), t).toBe(false);
  });
});

describe("ideas sin decir comida o cena", () => {
  it("para otro día, cena; para hoy, la que toca por la hora", () => {
    expect(cuandoPorDefecto({ dia: "jueves" }, 11).franja).toBe("Cena");
    expect(cuandoPorDefecto({ dia: "mañana" }, 11).franja).toBe("Cena");
    expect(cuandoPorDefecto({ dia: "hoy" }, 11).franja).toBe("Comida");
    expect(cuandoPorDefecto({}, 18).franja).toBe("Cena");
  });
});

describe("política de las plantillas nuevas", () => {
  const d = (modo, datos, confianza = 0.95) => ({ modo, confianza, datos });
  it("cambiar con el día basta (la comida se pregunta); sin día, a Lola", () => {
    expect(vaPorLaRapida(d("cambiar", { dia: "viernes", receta: "pizza" }))).toBe(true);
    expect(vaPorLaRapida(d("cambiar", { receta: "pizza" }))).toBe(false);
  });
  it("receta, calorías y qué falta piden el plato o su día; la despensa, nada", () => {
    expect(vaPorLaRapida(d("receta", { plato: "tortilla" }))).toBe(true);
    expect(vaPorLaRapida(d("calorias", { dia: "hoy", comida: "Cena" }))).toBe(true);
    expect(vaPorLaRapida(d("falta", {}))).toBe(false);
    expect(vaPorLaRapida(d("despensa", {}))).toBe(true);
  });
  it("la ausencia escribe: pide 0,9; sin comida solo pregunta, y basta con 0,8", () => {
    expect(vaPorLaRapida(d("ausencia", { dia: "hoy", comida: "cena" }, 0.85))).toBe(false);
    expect(vaPorLaRapida(d("ausencia", { dia: "hoy", comida: "cena" }, 0.95))).toBe(true);
    expect(vaPorLaRapida(d("ausencia", { dia: "mañana" }, 0.85))).toBe(true);
    expect(vaPorLaRapida(d("ausencia", {}, 0.95))).toBe(false);
  });
});
