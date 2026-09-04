import { describe, it, expect } from "vitest";
import { sugerenciasDelMenu, contextoParaElModelo, MAX_SUGERENCIAS } from "./panelSuggestions.js";
import { libretaVacia, poner } from "./notepad.js";

const conObjetivos = (freqs) =>
  Object.entries(freqs).reduce((n, [k, v]) => poner(n, `freqs.${k}`, v, { origen: "pregunta" }), libretaVacia());

describe("sugerencias del menú", () => {
  // La sugerencia más accionable de todas: el usuario ya dijo cuánto quería.
  it("avisa de la familia que se pasa de lo pedido", () => {
    const s = sugerenciasDelMenu({ familias: { pescado: 4 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    const p = s.find((x) => x.id === "menos-pescado");
    expect(p.texto).toBe("Menos pescado");
    expect(p.porque).toBe("Hay 4 veces y pediste 2");
  });

  // "Menos pescado" cuando no hay pescado es ruido, y el ruido enseña al
  // usuario a ignorar el panel entero.
  it("no sugiere bajar algo que ya está en su sitio", () => {
    const s = sugerenciasDelMenu({ familias: { pescado: 2 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    expect(s.find((x) => x.id === "menos-pescado")).toBeUndefined();
  });

  it("no sugiere nada sobre una familia de la que no se pidió cantidad", () => {
    const s = sugerenciasDelMenu({ familias: { pescado: 5 }, huecos: 14 }, libretaVacia());
    expect(s.find((x) => x.id === "menos-pescado")).toBeUndefined();
  });

  // Por debajo de un tercio de los huecos no es monotonía, es casualidad.
  it("avisa de una técnica que domina la semana, pero no de una coincidencia", () => {
    const domina = sugerenciasDelMenu({ tecnicas: { horno: 6 }, huecos: 14 }, libretaVacia());
    expect(domina.find((x) => x.id === "variar-horno")).toBeDefined();
    const casualidad = sugerenciasDelMenu({ tecnicas: { horno: 3 }, huecos: 14 }, libretaVacia());
    expect(casualidad.find((x) => x.id === "variar-horno")).toBeUndefined();
  });

  it("una semana corta no dispara la alerta de monotonía", () => {
    const s = sugerenciasDelMenu({ tecnicas: { horno: 2 }, huecos: 4 }, libretaVacia());
    expect(s.find((x) => x.id?.startsWith("variar-"))).toBeUndefined();
  });

  // "al horno" pero "a la plancha": una preposición mal puesta delata que lo
  // escribió una máquina.
  it("construye bien la preposición de cada técnica", () => {
    const horno = sugerenciasDelMenu({ tecnicas: { horno: 6 }, huecos: 14 }, libretaVacia());
    expect(horno.find((x) => x.id === "variar-horno").porque).toBe("6 platos al horno");
    const plancha = sugerenciasDelMenu({ tecnicas: { plancha: 6 }, huecos: 14 }, libretaVacia());
    expect(plancha.find((x) => x.id === "variar-plancha").porque).toBe("6 platos a la plancha");
  });

  it("propone cocina de fuera solo si no hay ninguna", () => {
    const sin = sugerenciasDelMenu({ cocinas: {}, huecos: 14 }, libretaVacia());
    expect(sin.some((x) => x.id.startsWith("probar-"))).toBe(true);
    const con = sugerenciasDelMenu({ cocinas: { italiana: 1 }, huecos: 14 }, libretaVacia());
    expect(con.some((x) => x.id.startsWith("probar-"))).toBe(false);
  });

  // El panel no puede abrir vacío ni con un menú recién generado y perfecto.
  it("siempre devuelve algo, y nunca más de cuatro", () => {
    const perfecto = sugerenciasDelMenu({ familias: { pescado: 2 }, cocinas: { italiana: 2 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    expect(perfecto.length).toBeGreaterThan(0);
    const ruidoso = sugerenciasDelMenu(
      { familias: { pescado: 5, carne: 6, verdura: 7, legumbres: 4 }, tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 },
      conObjetivos({ pescado: 1, carne: 1, verdura: 1, legumbres: 1 }),
    );
    expect(ruidoso.length).toBeLessThanOrEqual(MAX_SUGERENCIAS);
  });

  it("aguanta un menú vacío sin reventar", () => {
    expect(sugerenciasDelMenu(undefined, undefined).length).toBeGreaterThan(0);
    expect(sugerenciasDelMenu({}, libretaVacia()).length).toBeGreaterThan(0);
  });

  // La sugerencia rellena el input; no ejecuta. Un solo camino que mantener.
  it("cada sugerencia trae la frase que se escribiría", () => {
    for (const s of sugerenciasDelMenu({ familias: { pescado: 4 }, huecos: 14 }, conObjetivos({ pescado: 2 }))) {
      expect(typeof s.frase).toBe("string");
      expect(s.frase.length).toBeGreaterThan(3);
    }
  });
});

describe("contexto para el modelo", () => {
  it("le dice de dónde parte, para que pueda contestar «ahora hay dos»", () => {
    const ctx = contextoParaElModelo(
      { familias: { pescado: 4, verdura: 3 }, cocinas: { italiana: 2 }, huecos: 14 },
      conObjetivos({ pescado: 2 }),
    );
    expect(ctx).toContain("pescado: 4 esta semana (pediste 2)");
    expect(ctx).toContain("Huecos de la semana: 14");
    expect(ctx).toContain("italiana");
  });

  it("dice explícitamente cuando no hay cocina de fuera", () => {
    expect(contextoParaElModelo({ cocinas: {}, huecos: 14 }, libretaVacia()))
      .toContain("No hay ningún plato de cocina de fuera");
  });

  // Números, nunca nombres: mandar el menú entero sería enviar datos de casa a
  // un tercero sin que haga falta para nada.
  it("no lleva nombres de platos ni de personas", () => {
    const ctx = contextoParaElModelo({ familias: { pescado: 4 }, huecos: 14 }, libretaVacia());
    expect(ctx).not.toMatch(/receta|recipe|_00\d|id:/i);
    expect(ctx.length).toBeLessThan(600);
  });
});
