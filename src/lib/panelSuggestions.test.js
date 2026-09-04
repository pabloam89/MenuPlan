import { describe, it, expect } from "vitest";
import { sugerenciasDelMenu, contextoParaElModelo, MAX_SUGERENCIAS } from "./panelSuggestions.js";
import { existsSync } from "fs";
import { join } from "path";
import { libretaVacia, poner } from "./notepad.js";

const conObjetivos = (freqs) =>
  Object.entries(freqs).reduce((n, [k, v]) => poner(n, `freqs.${k}`, v, { origen: "pregunta" }), libretaVacia());

describe("sugerencias del menú", () => {
  // La sugerencia más accionable de todas: el usuario ya dijo cuánto quería.
  it("avisa de la familia que se pasa de lo pedido", () => {
    const s = sugerenciasDelMenu({ familias: { pescado: 4 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    const p = s.find((x) => x.id === "menos-pescado");
    expect(p.texto).toBe("Menos pescado");
    expect(p.porque).toBe("Hay 4, pediste 2");
    // Corto a proposito: todos los "porque" tienen que caber en UNA linea. Un
    // texto que envuelve en una tarjeta y no en la de al lado descuadra la
    // rejilla entera y se lee como un fallo de maquetacion.
    expect(p.porque.length).toBeLessThanOrEqual(22);
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
    expect(horno.find((x) => x.id === "variar-horno").porque).toBe("6 al horno");
    const plancha = sugerenciasDelMenu({ tecnicas: { plancha: 6 }, huecos: 14 }, libretaVacia());
    expect(plancha.find((x) => x.id === "variar-plancha").porque).toBe("6 a la plancha");
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

// La rejilla es de 2x2 y se rellena siempre: un hueco se lee como que algo ha
// fallado, no como que no habia nada que decir.
describe("la rejilla de cuatro", () => {
  it("devuelve siempre cuatro, con menu perfecto o con menu horrible", () => {
    const perfecto = sugerenciasDelMenu({ familias: { pescado: 2 }, cocinas: { italiana: 2 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    expect(perfecto).toHaveLength(4);
    const horrible = sugerenciasDelMenu(
      { familias: { pescado: 5, carne: 6, verdura: 7 }, tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 },
      conObjetivos({ pescado: 1, carne: 1, verdura: 1 }),
    );
    expect(horrible).toHaveLength(4);
  });

  it("no repite la misma sugerencia dos veces", () => {
    const s = sugerenciasDelMenu({}, libretaVacia());
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });

  // La ilustracion 3D del catalogo, no un icono de linea: es lo que separa
  // esto de cualquier otra app, y ya estaba pagado.
  it("cada una trae su ilustracion y su tono de color", () => {
    for (const s of sugerenciasDelMenu({ familias: { pescado: 4 }, huecos: 14 }, conObjetivos({ pescado: 2 }))) {
      expect(s.arte).toMatch(/^\/categories\/.+\.(png|webp)$/);
      // La tarjeta es BLANCA y el color vive en el título, en el círculo de la
      // ilustración y en la barra de abajo. Un fondo de color competía con los
      // colores del propio render 3D, y ganaba el fondo.
      expect(s.tono.tinta).toMatch(/^#/);
      expect(s.tono.suave).toMatch(/^#/);
      expect(s.tono.barra).toMatch(/^#/);
      expect(s.tono.fondo).toBeUndefined();
    }
  });

  // Una ruta mal escrita da un hueco mudo en la rejilla: la tarjeta se pinta,
  // la imagen no carga y nadie se entera hasta que lo ve un usuario.
  it("todas las ilustraciones que nombra existen en public/", () => {
    const rutas = new Set();
    const casos = [
      [{ familias: { pescado: 4, carne: 4, verdura: 4, legumbres: 4, pasta_arroz: 4, huevos: 4 }, huecos: 14 },
       conObjetivos({ pescado: 1, carne: 1, verdura: 1, legumbres: 1, pasta_arroz: 1, huevos: 1 })],
      [{ tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 }, libretaVacia()],
      [{}, libretaVacia()],
    ];
    for (const [r, n] of casos) for (const s of sugerenciasDelMenu(r, n)) rutas.add(s.arte);
    expect(rutas.size).toBeGreaterThan(5);
    for (const r of rutas) expect(existsSync(join("public", r.slice(1))), `falta ${r}`).toBe(true);
  });

  // Los colores van por POSICION, no por contenido: la rejilla tiene siempre
  // los mismos cuatro en el mismo sitio aunque el texto cambie cada semana.
  it("los tonos son estables por posicion", () => {
    const a = sugerenciasDelMenu({ familias: { pescado: 4 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    const b = sugerenciasDelMenu({ familias: { carne: 9 }, huecos: 14 }, conObjetivos({ carne: 1 }));
    expect(a.map((x) => x.tono.tinta)).toEqual(b.map((x) => x.tono.tinta));
  });

  // "Prueba algo francesa" es lo que sale al concatenar sin pensar.
  it("la sugerencia de cocina esta bien escrita en castellano", () => {
    const s = sugerenciasDelMenu({ cocinas: {}, huecos: 14 }, libretaVacia());
    const c = s.find((x) => x.id.startsWith("probar-"));
    expect(c.texto).not.toMatch(/algo (francesa|italiana|asiatica|mexicana)/);
    expect(c.texto).toMatch(/^Cocina /);
  });
});

// Todos los textos entran en una linea a 165px de ancho de tarjeta. Sin esto,
// una tarjeta de dos lineas y otra de una descuadran la rejilla de 2x2.
describe("todo cabe en una linea", () => {
  it("ningun titulo ni porque se pasa de largo", () => {
    const casos = [
      [{ familias: { pescado: 9, carne: 9, verdura: 9, legumbres: 9, pasta_arroz: 9, huevos: 9 }, huecos: 14 },
       conObjetivos({ pescado: 1, carne: 1, verdura: 1, legumbres: 1, pasta_arroz: 1, huevos: 1 })],
      [{ tecnicas: { plancha: 8 }, cocinas: {}, huecos: 14 }, libretaVacia()],
      [{}, libretaVacia()],
    ];
    for (const [r, n] of casos) for (const s of sugerenciasDelMenu(r, n)) {
      expect(s.texto.length, `titulo largo: ${s.texto}`).toBeLessThanOrEqual(18);
      expect(s.porque.length, `porque largo: ${s.porque}`).toBeLessThanOrEqual(22);
    }
  });
});
