import { describe, it, expect } from "vitest";
import { MAX_POR_SEMANA, SIEMPRE_ENCENDIDAS, TOPE_POR_COCINA, esAnadido, topeDe } from "./cocinaTopes.js";
import { CAMPOS_POR_ID } from "./notepadFields.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

const FUERA_DEL_MENU = new Set(["desayunos", "meriendas", "postres"]);
const servibles = recipeCatalog.filter((r) => r?.estrella && !FUERA_DEL_MENU.has(r.category));

describe("italiana no es un añadido: es el bloque de pasta", () => {
  // La mayoría de sus platos servibles son pasta_arroces. Si se apagara por
  // defecto junto a peruana o india, la casa perdería el bloque de pasta el
  // primer día — y encima habría dos mandos sobre los mismos platos, porque la
  // pasta ya tiene su slider en el reparto.
  it("está fuera de la puerta de opt-in", () => {
    expect(esAnadido("italiana")).toBe(false);
    expect(SIEMPRE_ENCENDIDAS.has("italiana")).toBe(true);
  });

  it("y sin el tope de los añadidos", () => {
    expect(topeDe("italiana")).toBeGreaterThan(MAX_POR_SEMANA);
  });

  it("todas las demás sí son añadidos y sí tienen tope", () => {
    for (const c of CAMPOS_POR_ID.cocina.dominio.filter((x) => x !== "italiana")) {
      expect(esAnadido(c), c).toBe(true);
      expect(topeDe(c), c).toBeLessThanOrEqual(MAX_POR_SEMANA);
    }
  });
});

describe("los topes se MIDEN sobre el catálogo, no se escriben a mano", () => {
  // Esta es la prueba que faltaba. La tabla anterior era literal y llevaba un
  // comentario pidiendo remedirla al crecer el catálogo; nadie lo hizo, y en
  // septiembre de 2026 prometía 5 platos franceses cuando ya daban 8 y 2
  // peruanos cuando solo daba 1. Ahora, si el catálogo se mueve, el tope se
  // mueve con él o esto falla.
  it("cada tope es el número de proteínas distintas que la cocina puede servir", () => {
    for (const cocina of Object.keys(TOPE_POR_COCINA)) {
      const proteinas = new Set(
        servibles.filter((r) => r.cocina === cocina).map((r) => r.mainProtein ?? "none"),
      );
      const esperado = esAnadido(cocina)
        ? Math.min(proteinas.size, MAX_POR_SEMANA)
        : proteinas.size;
      expect(topeDe(cocina), `${cocina}: ${proteinas.size} proteínas distintas`).toBe(esperado);
    }
  });

  it("no cuenta postres ni desayunos: nunca ocupan un hueco de comida o cena", () => {
    // Un flan italiano no puede contar para "cuántos italianos caben en la
    // semana", porque el planner de comida/cena no lo coloca jamás.
    const conPostres = new Set(
      recipeCatalog
        .filter((r) => r?.estrella && r.cocina === "italiana")
        .map((r) => r.mainProtein ?? "none"),
    );
    const sinPostres = new Set(
      servibles.filter((r) => r.cocina === "italiana").map((r) => r.mainProtein ?? "none"),
    );
    expect(sinPostres.size).toBeLessThanOrEqual(conPostres.size);
    expect(topeDe("italiana")).toBe(sinPostres.size);
  });

  it("solo mide lo `estrella`: el fondo de armario no se sirve nunca", () => {
    // Las 24 recetas de cocinas que entraron en septiembre de 2026 son fondo de
    // armario (sin foto, ver la política del catálogo), así que NO deben subir
    // ningún tope. Si algún día se promueven, este test sube solo.
    const fondo = recipeCatalog.filter((r) => r?.cocina && !r.estrella);
    for (const r of fondo) {
      const proteinas = new Set(
        servibles.filter((x) => x.cocina === r.cocina).map((x) => x.mainProtein ?? "none"),
      );
      expect(topeDe(r.cocina)).toBeLessThanOrEqual(Math.max(proteinas.size, 0));
    }
  });
});

describe("lo que el control puede ofrecer", () => {
  it("una cocina que el catálogo no puede servir tiene tope cero", () => {
    // Mejor una barra que no se mueve que una que promete platos inexistentes.
    expect(topeDe("coreana")).toBe(0);
  });

  it("las que sí están en el dominio se pueden pedir al menos una vez", () => {
    // Si esto falla es que una cocina del vocabulario se quedó sin platos
    // servibles: el control la seguiría pintando y no daría nada.
    for (const c of CAMPOS_POR_ID.cocina.dominio) {
      expect(topeDe(c), `${c} no tiene platos servibles`).toBeGreaterThan(0);
    }
  });
});
