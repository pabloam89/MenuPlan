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
    expect(p.porque).toBe("4 días esta semana. Pediste 2.");
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
    expect(horno.find((x) => x.id === "variar-horno").porque).toContain("6 platos al horno");
    const plancha = sugerenciasDelMenu({ tecnicas: { plancha: 6 }, huecos: 14 }, libretaVacia());
    expect(plancha.find((x) => x.id === "variar-plancha").porque).toContain("6 platos a la plancha");
  });

  it("propone cocina de fuera solo si no hay ninguna", () => {
    const sin = sugerenciasDelMenu({ cocinas: {}, huecos: 14 }, libretaVacia());
    expect(sin.some((x) => x.id.startsWith("probar-"))).toBe(true);
    const con = sugerenciasDelMenu({ cocinas: { italiana: 1 }, huecos: 14 }, libretaVacia());
    expect(con.some((x) => x.id.startsWith("probar-"))).toBe(false);
  });

  // "Prueba algo francesa" es lo que sale al concatenar sin pensar: los nombres
  // de cocina son adjetivos femeninos porque concuerdan con "cocina".
  it("la sugerencia de cocina esta bien escrita en castellano", () => {
    const c = sugerenciasDelMenu({ cocinas: {}, huecos: 14 }, libretaVacia())
      .find((x) => x.id.startsWith("probar-"));
    expect(c.texto).toMatch(/^Cocina /);
    expect(c.arte).toMatch(/^\/categories\/cut\/cocinas\/\w+\.png$/);
  });

  // Ya no existe "mediterranea": eran 20 recetas de hummus, falafel y tahini,
  // o sea cocina arabe. En España "mediterraneo" es aceite de oliva y verdura,
  // que es lo que ya es este catalogo por defecto.
  it("no queda rastro de la cocina mediterranea", () => {
    for (let d = 0; d < 8; d++) {
      const c = sugerenciasDelMenu({ cocinas: {}, huecos: 14 }, libretaVacia())
        .find((x) => x.id.startsWith("probar-"));
      expect(c.texto).not.toMatch(/mediterranea/i);
    }
  });

  // El panel no puede abrir vacío ni con un menú recién generado y perfecto.
  it("siempre devuelve algo, y nunca más de cuatro", () => {
    const perfecto = sugerenciasDelMenu({ familias: { pescado: 2 }, cocinas: { italiana: 2 }, huecos: 14 }, conObjetivos({ pescado: 2 }));
    expect(perfecto.length).toBeGreaterThan(0);
    const ruidoso = sugerenciasDelMenu(
      { familias: { pescado: 5, carne: 6, verdura: 7, legumbres: 4 }, tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 },
      conObjetivos({ pescado: 1, carne: 1, verdura: 1, legumbres: 1 }),
    );
    // Ya no se corta a cuatro: se devuelven todas y la UI coge las que caben,
    // porque la rotacion necesita reserva. Lo que si tiene que haber es de
    // sobra para rotar sin repetir.
    expect(ruidoso.length).toBeGreaterThan(MAX_SUGERENCIAS);
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
    expect(perfecto.length).toBeGreaterThanOrEqual(4);
    const horrible = sugerenciasDelMenu(
      { familias: { pescado: 5, carne: 6, verdura: 7 }, tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 },
      conObjetivos({ pescado: 1, carne: 1, verdura: 1 }),
    );
    expect(horrible.length).toBeGreaterThanOrEqual(4);
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

  // Solo /categories/cut tiene transparencia real (PNG color type 6). Una
  // imagen sin alfa dentro del circulo se ve como una foto cuadrada metida a
  // la fuerza, que es justo lo que se veia mal.
  it("todas las ilustraciones salen de cut/, la unica carpeta con alfa", () => {
    const casos = [
      [{ familias: { pescado: 4, carne: 4 }, tecnicas: { horno: 8 }, cocinas: {}, huecos: 14 },
       conObjetivos({ pescado: 1, carne: 1 })],
      [{}, libretaVacia()],
    ];
    for (const [r, n] of casos) for (const x of sugerenciasDelMenu(r, n)) {
      expect(x.arte, `fuera de cut/: ${x.arte}`).toMatch(/^\/categories\/cut\//);
    }
  });
});

// Las pills son FILAS a lo ancho del panel, no una rejilla de 2x2, asi que hay
// unos 320 px: caben un titulo de una linea y un subcopy de una o dos. Lo que
// no cabe es un parrafo, y lo que no sirve es un telegrama.
describe("los textos caben en la fila", () => {
  it("ningun titulo ni subcopy se pasa de largo", () => {
    const casos = [
      [{ familias: { pescado: 9, carne: 9, verdura: 9, legumbres: 9, pasta_arroz: 9, huevos: 9 }, huecos: 14 },
       conObjetivos({ pescado: 1, carne: 1, verdura: 1, legumbres: 1, pasta_arroz: 1, huevos: 1 })],
      [{ tecnicas: { plancha: 8 }, cocinas: {}, huecos: 14 }, libretaVacia()],
      [{}, libretaVacia()],
    ];
    for (const [r, n] of casos) for (const s of sugerenciasDelMenu(r, n)) {
      expect(s.texto.length, `titulo largo: ${s.texto}`).toBeLessThanOrEqual(22);
      // Corto y sobre TU problema, no sobre lo que voy a hacer yo. "Si quieres
      // la bajamos y te propongo por que cambiarla" habla de mi; "4 dias esta
      // semana" habla de tu semana, y es lo unico que hace que apetezca pulsar.
      expect(s.porque.length, `subcopy largo: ${s.porque}`).toBeLessThanOrEqual(46);
      // Y que sea una frase de verdad, no un telegrama: "6 al horno" no se
      // entiende fuera de contexto, que es lo que hacia parecer random la
      // rejilla entera.
      expect(s.porque.length, `subcopy corto: ${s.porque}`).toBeGreaterThanOrEqual(22);
      expect(s.porque, `sin punto: ${s.porque}`).toMatch(/.$/);
    }
  });
});
