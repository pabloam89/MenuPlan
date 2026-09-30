/**
 * Los cinco ejes que salieron del catálogo sin pedir un dato nuevo.
 *
 * Lo que se comprueba no es solo que devuelvan algo: es que devuelvan algo
 * DISTINTO para platos distintos. Un eje que contesta lo mismo a todo tiene
 * cobertura 100 % y valor cero, y ese es el fallo que un test de cobertura a
 * secas deja pasar.
 */

import { describe, it, expect } from "vitest";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import {
  tiempoActivoDe, aptoVigiliaDe, sinCerdoDe, completitudDe, densidadDe,
  cargaDe, esfuerzoDe, recursoDe, llevaMasaDe, seEstorban, aforoExcedido,
  escalabilidadDe, robustezDe, perecibilidadDe, conLasManosDe,
} from "./ejesDePlato.js";

const cobertura = (f) => recipeCatalog.filter((r) => f(r).valor !== null).length / recipeCatalog.length;

describe("eje 24 · tiempo activo", () => {
  it("cubre el catálogo salvo lo que no tiene pasos ricos", () => {
    expect(cobertura(tiempoActivoDe)).toBeGreaterThanOrEqual(0.96);
  });

  /**
   * ESTE EJE SUMA TRABAJO, NO MIDE RELOJ, y la diferencia importa porque en 87
   * recetas la suma supera el `time` declarado.
   *
   * No es un fallo del operador ni necesariamente del dato: una receta SOLAPA.
   * Mientras se fríe la berenjena se escurre la patata, y los dos pasos cuentan
   * sus minutos por separado aunque ocurran a la vez. El «Tumbet mallorquín»
   * declara 40 minutos y sus pasos de manos suman 48 por eso.
   *
   * Así que lo que este eje contesta es «cuánto trabajo hay aquí», que es la
   * pregunta útil para comparar dos platos, y NO «cuántos minutos estarás de
   * pie». Para lo segundo haría falta saber qué se solapa con qué, y el
   * catálogo no lo dice: `paralelo` marca simultaneidad, pero también lo llevan
   * los precalentados de horno, que no son trabajo de nadie.
   *
   * El test clava el número para que no crezca, y prohíbe que se dispare: pasar
   * del doble ya no se explica por solapamiento.
   */
  it("suma trabajo: supera el reloj solo donde la receta solapa", () => {
    const rotas = recipeCatalog
      .filter((r) => r.time > 0)
      .map((r) => ({ r, t: tiempoActivoDe(r).valor }))
      .filter(({ r, t }) => t != null && t > r.time);
    expect(rotas.length).toBeLessThanOrEqual(90);
    const disparadas = rotas.filter(({ r, t }) => t > r.time * 2).map(({ r }) => r.id);
    expect(disparadas).toEqual([]);
  });

  /**
   * Y separa de verdad: un guiso largo tiene poco tiempo activo y mucho reloj.
   * Medido, la mediana del activo son 20 min contra 30 de `time`.
   */
  it("distingue el guiso de la plancha", () => {
    const conAmbos = recipeCatalog
      .filter((r) => r.time > 0 && tiempoActivoDe(r).valor != null)
      .map((r) => tiempoActivoDe(r).valor / r.time);
    const media = conAmbos.reduce((a, v) => a + v, 0) / conAmbos.length;
    expect(media).toBeLessThan(0.9);
    expect(new Set(recipeCatalog.map((r) => tiempoActivoDe(r).valor)).size).toBeGreaterThan(30);
  });

  it("se abstiene en vez de suponer cero cuando faltan minutos", () => {
    expect(tiempoActivoDe({ name: "X", stepsRich: [] }).valor).toBeNull();
    expect(tiempoActivoDe({ name: "X", stepsRich: [{ kind: "activo" }, { kind: "activo" }] }).valor).toBeNull();
  });
});

describe("eje 20 · apto vigilia", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(aptoVigiliaDe)).toBe(1);
  });

  /**
   * El matiz que lo hace un eje y no un sinónimo de vegetariano: el pescado
   * vale en vigilia. Si esto se rompiera, el eje sobraría.
   */
  it("el pescado es vigilia y la carne no", () => {
    const merluza = recipeCatalog.find((r) => r.mainProtein === "pescado_blanco");
    const ternera = recipeCatalog.find((r) => r.mainProtein === "ternera");
    expect(aptoVigiliaDe(merluza).valor).toBe(true);
    expect(aptoVigiliaDe(ternera).valor).toBe(false);
  });

  it("y las vísceras cuentan como carne", () => {
    const callos = recipeCatalog.find((r) => /callos/i.test(r.name));
    if (callos) expect(aptoVigiliaDe(callos).valor).toBe(false);
  });
});

describe("eje 19 · sin cerdo", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(sinCerdoDe)).toBe(1);
  });

  it("pilla el cerdo aunque venga de embutido", () => {
    const conChorizo = recipeCatalog.find((r) =>
      (r.ingredients ?? []).some((l) => /chorizo|panceta|bacon|jamon serrano/i.test(l.name)));
    expect(sinCerdoDe(conChorizo).valor).toBe(false);
  });

  /**
   * HALAL Y KOSHER NO SE DERIVAN, y el módulo no los ofrece. No es un olvido:
   * son cómo se sacrificó el animal y cómo se separó la vajilla, y eso no está
   * en este repo. Dar por halal lo que solo es «sin cerdo» sería faltar al
   * respeto a quien confía en la respuesta.
   */
  it("no promete halal ni kosher", async () => {
    const mod = await import("./ejesDePlato.js");
    expect(Object.keys(mod).some((k) => /halal|kosher/i.test(k))).toBe(false);
  });
});

describe("eje 11 · completitud", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(completitudDe)).toBe(1);
  });

  /**
   * Discrimina: 261 de 947. Si diera «completo» a casi todo sería un eje que
   * no sirve para elegir cena, que es justo para lo que existe.
   */
  it("no dice que sí a todo", () => {
    const completos = recipeCatalog.filter((r) => completitudDe(r).valor).length;
    expect(completos / recipeCatalog.length).toBeGreaterThan(0.15);
    expect(completos / recipeCatalog.length).toBeLessThan(0.6);
  });

  it("una guarnición sola nunca es comida entera", () => {
    const guarnicion = recipeCatalog.find((r) => (r.mealRole ?? []).includes("guarnicion"));
    if (guarnicion) expect(completitudDe(guarnicion).valor).toBe(false);
  });
});

describe("eje 3 · densidad nutricional", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(densidadDe)).toBe(1);
  });

  /**
   * Los extremos son la prueba de que el número significa algo: una ensalada
   * ronda las 50 kcal/100 g y un guiso graso las 210. Fuera de [20, 500] ya no
   * es un plato servido, es un error de masa o de `baseServings`.
   */
  it("da valores de comida, no de laboratorio", () => {
    const fuera = recipeCatalog
      .map((r) => ({ r, d: densidadDe(r).valor }))
      .filter(({ d }) => d && (d.kcal100g < 20 || d.kcal100g > 500))
      .map(({ r, d }) => `${r.id} ${r.name}: ${d.kcal100g} kcal/100 g`);
    expect(fuera.length).toBeLessThan(25);
  });
});

describe("eje 10 · carga / saciedad", () => {
  it("cubre donde hay proteína y fibra declaradas", () => {
    expect(cobertura(cargaDe)).toBeGreaterThanOrEqual(0.85);
  });

  /**
   * NO devuelve un índice de saciedad, y es a propósito: hay media docena
   * publicadas y ninguna es consenso. Devuelve los gramos y quien pregunte
   * decide. Inventar aquí una fórmula sería fabricarse autoridad.
   */
  it("da gramos, no un índice inventado", () => {
    const v = recipeCatalog.map((r) => cargaDe(r).valor).find(Boolean);
    expect(Object.keys(v).sort()).toEqual(
      ["fibra_g", "fibraPor100kcal", "gramos", "proteina_g", "proteinaPor100kcal"].sort(),
    );
  });

  it("separa el plato que llena del que no", () => {
    const ps = recipeCatalog
      .map((r) => cargaDe(r).valor?.proteinaPor100kcal)
      .filter((x) => x != null);
    expect(Math.max(...ps) / Math.min(...ps.filter((x) => x > 0))).toBeGreaterThan(5);
  });
});

describe("eje 25 · esfuerzo mental", () => {
  it("cubre lo que tiene pasos e ingredientes", () => {
    expect(cobertura(esfuerzoDe)).toBeGreaterThanOrEqual(0.96);
  });

  /**
   * `componentes` es null y no 0 cuando la receta no tiene `part`. Es la misma
   * distinción que el catálogo pagó cara en recipeParts, contando 442 recetas
   * juzgadas monocomponente como si nadie las hubiera mirado.
   */
  it("distingue «un componente» de «no se sabe»", () => {
    const sinPart = recipeCatalog.find((r) => !(r.stepsRich ?? []).some((s) => s.part));
    expect(esfuerzoDe(sinPart).valor.componentes).toBeNull();
    expect(esfuerzoDe(sinPart).duda).toMatch(/no tiene `part`/);
  });
});

describe("eje 26 · conflicto de recursos", () => {
  it("cubre lo que declara técnica", () => {
    expect(cobertura(recursoDe)).toBeGreaterThanOrEqual(0.95);
  });

  /**
   * El conflicto es de un PAR, no de una receta. Dos al horno se estorban; algo
   * crudo no estorba a nada.
   */
  it("dos hornos pelean, un crudo no estorba", () => {
    const h = recipeCatalog.filter((r) => recursoDe(r).valor === "horno");
    const crudo = recipeCatalog.find((r) => recursoDe(r).valor === "ninguno");
    expect(seEstorban(h[0], h[1])).toBe(true);
    expect(seEstorban(h[0], crudo)).toBe(false);
    expect(seEstorban(h[0], { name: "sin técnica" })).toBeNull();
  });

  /**
   * EL CASO QUE ESTE BLOQUE NO PROBABA, y por eso el eje llevaba meses
   * diciendo una cosa falsa sin que nada saltara: probaba horno+horno y
   * horno+crudo, los dos correctos, y nunca OLLA+SARTÉN.
   *
   * Con el modelo viejo —«mismo recurso, luego conflicto»— una olla y una
   * sartén se estorbaban, y eso hacía que el 49,8 % de los pares del recetario
   * salieran en conflicto: en una cocina hay cuatro fuegos y eso no es un
   * conflicto, es una comida normal. Con la capacidad puesta son el 2,7 %.
   */
  it("una olla y una sartén NO se estorban: hay cuatro fuegos", () => {
    const olla = { name: "Lentejas", tecnica: "olla" };
    const sarten = { name: "Filete", tecnica: "sarten" };
    const plancha = { name: "Merluza", tecnica: "plancha" };
    expect(seEstorban(olla, sarten)).toBe(false);
    expect(seEstorban(olla, plancha)).toBe(false);
    expect(seEstorban(sarten, plancha)).toBe(false);
  });

  it("y el horno sigue siendo uno", () => {
    expect(seEstorban({ name: "a", tecnica: "horno" }, { name: "b", tecnica: "horno" })).toBe(true);
  });

  /**
   * El par no es el caso general: una comida puede llevar primero, segundo y
   * guarnición, y tres cosas al horno son tres turnos aunque ningún PAR de
   * ellas diga nada distinto de lo que dicen dos.
   */
  it("el aforo ve lo que el par no puede: tres al horno", () => {
    const h = (n) => ({ name: n, tecnica: "horno" });
    expect(aforoExcedido([h("a"), h("b"), h("c")])).toEqual([
      { recurso: "horno", cuantos: 3, capacidad: 1 },
    ]);
  });

  it("pero tres fuegos caben, y lo crudo no ocupa sitio", () => {
    expect(aforoExcedido([
      { name: "a", tecnica: "olla" },
      { name: "b", tecnica: "sarten" },
      { name: "c", tecnica: "plancha" },
      { name: "d", tecnica: "crudo" },
    ])).toEqual([]);
  });

  it("y cinco fuegos ya no caben", () => {
    const f = (n) => ({ name: n, tecnica: "sarten" });
    expect(aforoExcedido([f("a"), f("b"), f("c"), f("d"), f("e")])).toEqual([
      { recurso: "fuego", cuantos: 5, capacidad: 4 },
    ]);
  });

  /**
   * EL TRINQUETE. Con el modelo viejo esto valía 0,498 y el eje era inservible
   * para lo único que existe: decidir si dos platos caben en la misma comida.
   * Se fija un techo, no el número.
   */
  it("los pares en conflicto son pocos, que es lo que hace útil el eje", () => {
    const pool = recipeCatalog.filter((r) => r.estrella);
    const primeros = pool.filter((r) => (r.mealRole ?? []).includes("primero"));
    const segundos = pool.filter((r) => (r.mealRole ?? []).includes("segundo"));
    let chocan = 0;
    let total = 0;
    for (let i = 0; i < 4000; i++) {
      const e = seEstorban(primeros[(i * 7919) % primeros.length], segundos[(i * 6271) % segundos.length]);
      if (e === null) continue;
      total++;
      if (e) chocan++;
    }
    expect(chocan / total).toBeLessThan(0.1);
  });
});

describe("eje 47 · lleva masa", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(llevaMasaDe)).toBe(1);
  });

  /**
   * Los dos lados del filo. Un empanado NO lleva masa —el pan rallado va por
   * fuera— y una pizza casera SÍ, aunque no compre la masa hecha.
   */
  it("el rebozado no es masa y el amasado sí", () => {
    const empanado = recipeCatalog.find((r) => /empanad[oa]s/i.test(r.name));
    const pizza = recipeCatalog.find((r) => /pizza casera/i.test(r.name));
    if (empanado) expect(llevaMasaDe(empanado).valor).toBe(false);
    if (pizza) expect(llevaMasaDe(pizza).valor).toBe(true);
  });

  it("y no dice que sí a media carta", () => {
    const con = recipeCatalog.filter((r) => llevaMasaDe(r).valor).length;
    expect(con).toBeGreaterThan(15);
    expect(con / recipeCatalog.length).toBeLessThan(0.1);
  });
});

describe("eje 42 · escalabilidad real", () => {
  it("cubre lo que declara técnica", () => {
    expect(cobertura(escalabilidadDe)).toBeGreaterThanOrEqual(0.95);
  });

  it("la olla escala y la plancha va por tandas", () => {
    expect(escalabilidadDe({ tecnica: "olla" }).valor).toBe("escala");
    expect(escalabilidadDe({ tecnica: "horno" }).valor).toBe("escala");
    expect(escalabilidadDe({ tecnica: "plancha" }).valor).toBe("por_tandas");
    expect(escalabilidadDe({ tecnica: "sarten" }).valor).toBe("por_tandas");
  });
});

describe("eje 43 · robustez ante el descuido", () => {
  it("cubre lo que tiene pasos ricos", () => {
    expect(cobertura(robustezDe)).toBeGreaterThanOrEqual(0.96);
  });

  /**
   * EL CASO QUE OBLIGÓ A CONTAR MINUTOS Y NO PASOS.
   *
   * Midiendo la racha en número de pasos, las «Lentejas con verduras» salían
   * FRÁGILES: un guiso encadena seis pasos activos —picar, sofreír, añadir,
   * rehogar— que son doce minutos y luego hora y media de olla sola. Seis pasos
   * suena a mucho; doce minutos, a nada. El número de pasos mide cómo escribió
   * la receta quien la escribió, no cuánto te ata a la cocina.
   */
  it("un guiso no es frágil y un risotto sí", () => {
    const lentejas = recipeCatalog.find((r) => r.name.startsWith("Lentejas con verduras"));
    const risotto = recipeCatalog.find((r) => /^Risotto/.test(r.name));
    if (lentejas) expect(robustezDe(lentejas).valor).not.toBe("fragil");
    if (risotto) expect(robustezDe(risotto).valor).toBe("fragil");
  });

  it("y la mayoría del catálogo se cocina sola", () => {
    const robustas = recipeCatalog.filter((r) => robustezDe(r).valor === "robusto").length;
    const fragiles = recipeCatalog.filter((r) => robustezDe(r).valor === "fragil").length;
    expect(robustas).toBeGreaterThan(fragiles * 3);
  });
});

describe("eje 40 · perecibilidad", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura(perecibilidadDe)).toBe(1);
  });

  /**
   * NO descarta, COLOCA. El pescado fresco comprado el lunes no se cocina el
   * viernes, y eso no quita la receta del menú: la mueve al principio.
   */
  it("el pescado fresco manda dos días y la conserva no manda nada", () => {
    const fresco = { ingredients: [{ name: "Lomo de merluza", ingredientId: "merluza" }] };
    const lata = { ingredients: [{ name: "Atún en conserva", ingredientId: "atun" }] };
    expect(perecibilidadDe(fresco).valor.dias).toBe(2);
    expect(perecibilidadDe(lata).valor.estable).toBe(true);
  });

  it("manda el ingrediente más delicado del plato", () => {
    const mixto = {
      ingredients: [
        { name: "Pollo", ingredientId: "pollo" },
        { name: "Gambas", ingredientId: "gambas" },
      ],
    };
    expect(perecibilidadDe(mixto).valor.dias).toBe(2);
  });
});

describe("eje 31 · se come con las manos", () => {
  it("contesta a todo el catálogo", () => {
    expect(cobertura((r) => conLasManosDe(r))).toBe(1);
  });

  /**
   * SOLO LA CABEZA DEL NOMBRE. Unas «Alubias pintas con costillas» salían de
   * manos porque la palabra aparece, pero ahí la costilla va dentro del guiso y
   * se come con cuchara. Lo que se come con las manos es lo que el plato ES.
   */
  it("una costilla es de manos; unas alubias con costilla, no", () => {
    expect(conLasManosDe({ name: "Costillas BBQ al horno" }).valor).toBe(true);
    expect(conLasManosDe({ name: "Alubias pintas con costillas" }).valor).toBe(false);
  });

  it("y el formato cierra la puerta que abre el nombre", () => {
    expect(conLasManosDe({ name: "Croquetas de jamón" }, null).valor).toBe(true);
    expect(conLasManosDe({ name: "Croquetas de jamón" }, "sopa").valor).toBe(false);
  });
});
