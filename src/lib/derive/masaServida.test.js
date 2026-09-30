import { describe, expect, it } from "vitest";

import alimentos from "../../data/alimentos.json";
import fraccionComestibleJson from "../../data/fraccionComestible.json";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import {
  fraccionServida, factorHidratacion, factorDeClase,
  factorAceite, seFrie, ACEITE_ABSORBIDO, ES_ACEITE_DE_FREIR,
} from "./masaServida.js";

const porId = new Map(alimentos.map((a) => [a.id, a]));

describe("fracciónServida · la merma es de la línea, no del ingrediente", () => {
  // Los casos que motivaron el módulo, tal cual están en el catálogo.
  it.each([
    ["Mejillones (sin concha)", "mejillones", 1, "lo dice la línea"],
    ["Pollo asado desmenuzado", "pollo", 1, "desmenuzado no lleva hueso"],
    ["Contramuslos de pollo deshuesados", "contramuslos-de-pollo", 1, "deshuesado"],
    ["Rosada en lomos", "merluza", 1, "en lomos"],
    ["Zumo de lima", "lima", 1, "a un zumo no se le quita la cáscara"],
  ])("«%s» no vuelve a perder lo que ya perdió", (nombre, id, esperado) => {
    expect(fraccionServida(nombre, id).factor).toBe(esperado);
  });

  it("«entero» gana a «limpio»: una lubina entera conserva cabeza y espina", () => {
    // Su 0,55 está curado para ESE nombre — lo dice el motivo del propio
    // fichero. Cancelarlo doblaría la ración.
    const lubina = fraccionComestibleJson.lubina.valor;
    expect(fraccionServida("Lubina entera limpia", "lubina").factor).toBe(lubina);
    expect(fraccionServida("Dorada (limpia, entera)", "dorada").factor)
      .toBe(fraccionComestibleJson.dorada.valor);
  });

  it("«limpio» es literal en el cefalópodo y dudoso en el pescado", () => {
    // Un calamar limpio no tiene pluma ni vísceras, que es toda su merma.
    expect(fraccionServida("Chipirones limpios", "calamar").factor).toBe(1);
    // Un salmonete «limpio» puede seguir teniendo cabeza: no se decide.
    const dudoso = fraccionServida("Salmonetes limpios", "salmonete");
    expect(dudoso.factor).toBe(fraccionComestibleJson.salmonete.valor);
    expect(dudoso.via).toBe("SIN DECIDIR");
    expect(dudoso.duda).toBeTruthy();
  });

  it("un ingrediente sin merma declarada no la inventa", () => {
    expect(fraccionServida("Harina", "harina").factor).toBe(1);
    expect(fraccionServida("cualquier cosa", undefined).factor).toBe(1);
  });
});

describe("factorHidratación · el estado lo dice la línea, y si no, la ficha", () => {
  const alimento = (id) => porId.get(id);

  it("la línea manda sobre todo lo demás", () => {
    expect(factorHidratacion("Garbanzos cocidos", alimento("garbanzos")).factor).toBe(1);
    expect(factorHidratacion("Lentejas", alimento("lentejas")).factor).toBe(factorDeClase(alimento("lentejas").taxonomia));
  });

  it("el estado declarado salva al edamame, que se compra desvainado", () => {
    // Recibía el factor de la soja SECA y con 240 g fantasma le ganaba el eje
    // de la proteína a 200 g de salmón en el poke bowl.
    const e = alimento("edamame");
    expect(e.dimensiones.estado).toBe("fresco");
    expect(factorHidratacion("Edamame desvainado", e).factor).toBe(1);
  });

  it("la ficha decide cuando la línea calla, y las kcal la comprueban", () => {
    // `garbanzos` tiene ficha de garbanzo COCIDO: su peso ya trae el agua.
    const g = alimento("garbanzos");
    expect(g.fuenteNombre).toMatch(/cooked|boiled/i);
    expect(factorHidratacion("Garbanzos", g).factor).toBe(1);
    // `lentejas` tiene ficha SECA: su peso la absorbe.
    expect(factorHidratacion("Lentejas", alimento("lentejas")).factor).toBeGreaterThan(1);
  });

  it("lo que no absorbe agua no recibe factor aunque cuelgue de una legumbre", () => {
    // La salsa de soja cuelga de `legumbre/legumbre/soja` en el árbol —lo es—
    // y recibía ×2,4 en 42 líneas.
    const salsa = alimento("salsa-soja");
    expect(salsa.taxonomia.clase).toBe("legumbre");
    expect(factorHidratacion("Salsa de soja", salsa).factor).toBe(1);
  });

  it("cuando el nombre y el número se contradicen, NO decide", () => {
    const inventado = {
      taxonomia: { clase: "legumbre", especie: "alubia" },
      fuenteNombre: "Judías blancas, cocidas",
      nutricion: { kcal100g: 322.9 },
      dimensiones: {},
    };
    const r = factorHidratacion("Judías blancas", inventado);
    expect(r.via).toBe("SIN DECIDIR");
    expect(r.duda).toMatch(/cocido.*seco|seco.*cocido/);
  });
});

describe("el invariante: el peso pedido y la ficha hablan del mismo estado", () => {
  // `computeRecipeNutrition` multiplica la ficha por los gramos pedidos. Si la
  // línea pide peso COCIDO y la ficha es de SECO, el error es de 2 a 3 veces y
  // no lo ve nadie. Pasó con `lentejas` (ficha seca, cuatro líneas «cocidas»,
  // +253 kcal por ración) y con `garbanzos` (ficha cocida, líneas «secos»).
  //
  // El arreglo no es un factor: es que un id no puede servir dos alimentos.
  const LINEA_COCIDA = /\bcocid[oa]s?\b|\bde bote\b|\ben conserva\b/;
  const LINEA_SECA = /\bsec[oa]s?\b|\bcrud[oa]s?\b|\ben remojo\b/;

  it("ninguna línea del catálogo pide un estado y cobra el otro", () => {
    const malas = [];
    for (const r of recipeCatalog) {
      for (const l of r.ingredients ?? []) {
        const al = porId.get(l.ingredientId);
        if (!al?.nutricion?.kcal100g || factorDeClase(al.taxonomia) === 1) continue;
        const n = String(l.name).toLowerCase();
        const dice = LINEA_COCIDA.test(n) ? "cocido" : LINEA_SECA.test(n) ? "seco" : null;
        if (!dice) continue;
        const kcal = al.nutricion.kcal100g;
        const es = kcal >= 250 ? "seco" : kcal <= 150 ? "cocido" : null;
        if (es && es !== dice) {
          malas.push(`${r.name}: «${l.name}» pide ${dice} y ${l.ingredientId} cobra ${es} (${Math.round(kcal)} kcal)`);
        }
      }
    }
    expect(malas, "un id no puede servir el alimento seco y el cocido: párte lo").toEqual([]);
  });
});

describe("el orden de las palabras no puede cambiar el resultado", () => {
  /**
   * El catálogo escribe el mismo despiece de dos maneras y el regex solo
   * conocía una: `\ben lomos\b` casaba «Merluza EN LOMOS» y no «LOMOS DE
   * merluza». Nueve líneas de pescado ya fileteado volvían a perder la cabeza
   * y la espina, entre 16 y 77 kcal por ración.
   *
   * Es la SEGUNDA vez que se arregla. El parche del 22 sep cerró 18 líneas y
   * dejó estas nueve abiertas porque cerró los nombres, no la idea. Por eso
   * este bloque prueba las dos formas de cada palabra: si alguien vuelve a
   * escribir el regex pegado a una construcción, cae aquí.
   */
  it.each([
    ["Merluza en lomos", "merluza"],
    ["Lomos de merluza", "merluza"],
    ["Lomo de lubina fresca", "lubina"],
    ["Rodaballo (filetes)", "rodaballo"],
    ["Filetes de lenguado", "lenguado"],
    ["Lomos de rodaballo", "rodaballo"],
    ["Kokotxas de merluza", "merluza"],
    ["Calamar en anillas", "calamar"],
    ["Carne de txangurro", "carne-de-txangurro"],
    // El paréntesis es la tercera forma de decirlo, y también se escapaba:
    // «Zumo de lima» acertaba y «Lima (zumo)» no, por un «de». Y un arilo ya
    // ES la parte comestible de la granada — se le tiraba el 44 % otra vez.
    ["Lima (zumo)", "lima"],
    ["Granada (arilos)", "granada"],
  ])("«%s» ya viene despiezado y no paga la merma", (nombre, id) => {
    expect(fraccionServida(nombre, id, porId.get(id)).factor).toBe(1);
  });

  /**
   * Y la excepción, que es la que hace falsa la regla fácil «si nombra un
   * corte, está limpio»: un medallón de rape se corta ATRAVESANDO la cola,
   * con la espina central dentro. Es un corte, no un despiece.
   */
  it.each([
    ["Medallones de rape", "monkfish"],
    ["Rape (cola, en medallones)", "monkfish"],
    ["Rodajas de emperador", "rodajas-de-emperador"],
    ["Merluza en rodajas", "merluza"],
  ])("«%s» nombra un corte que SÍ lleva hueso, y sigue pagando", (nombre, id) => {
    const al = porId.get(id);
    const fc = fraccionComestibleJson[id]?.valor;
    expect(fc, `este test no dice nada si ${id} no declara fracción`).toBeLessThan(1);
    expect(fraccionServida(nombre, id, al).factor).toBe(fc);
  });

  /**
   * El invariante, y se mide contra algo que el regex NO lee: el TÍTULO de la
   * receta. Si un plato se llama «Filetes de lenguado a la plancha», su
   * pescado no puede perder la cabeza — el nombre del plato es evidencia
   * independiente de lo que se compró.
   */
  it("ningún plato que se llame por su despiece paga merma de pieza entera", () => {
    const TITULO_DESPIEZADO = /\b(filetes?|lomos?|tacos|dados|kokotxas?)\s+de\b/i;
    const malas = [];
    for (const r of recipeCatalog) {
      if (!TITULO_DESPIEZADO.test(r.name ?? "")) continue;
      for (const l of r.ingredients ?? []) {
        const al = porId.get(l.ingredientId);
        if (!["pez", "marisco", "cefalopodo"].includes(al?.taxonomia?.clase)) continue;
        const f = fraccionServida(l.name, l.ingredientId, al).factor;
        if (f < 1) malas.push(`«${r.name}» → «${l.name}» ×${f}`);
      }
    }
    expect(
      malas,
      "el título del plato dice que se compró despiezado y la línea está pagando "
      + "la merma del animal entero. Es la doble resta, otra vez.",
    ).toEqual([]);
  });
});

describe("el aceite de freír tiene un solo 0,06 y es de la receta", () => {
  it("el tope se reparte entre TODAS las líneas de aceite, no una por una", () => {
    // «Chuletón a la parrilla» lleva 300 ml de girasol para freír y 150 de
    // oliva para el alioli. Aplicado por línea, el sólido absorbía el 12 % de
    // su peso. Son 19 recetas con más de un aceite y 11 cambiaron de número;
    // el chuletón, 256 kcal por ración.
    const solido = 1000;
    const dosLineas = 276 + 138;
    expect(factorAceite(dosLineas, solido, true) * dosLineas).toBeCloseTo(ACEITE_ABSORBIDO * solido, 6);
  });

  /**
   * EL TOPE SOLO VALE SI EL ACEITE SE QUEDA EN LA SARTÉN.
   *
   * El 6 % describe lo que se absorbe de un baño que después se tira. Aplicado
   * sin preguntar, borraba el ingrediente principal de todo plato donde el
   * aceite ES el plato: un alioli con 138 g de aceite publicaba 6 kcal por
   * ración, una mayonesa 31 y unos puerros confitados ESTRELLA 75 frente a las
   * 355 declaradas. Y en silencio, porque el aceite desaparecía del numerador
   * y del denominador a la vez: `coverage` daba 1,00 y Atwater cuadraba.
   */
  it("sin fritura el aceite se cuenta entero: es aliño, emulsión o confitado", () => {
    // Un alioli: 138 g de aceite sobre 17 g de sólido. Con tope, ×0,007.
    expect(factorAceite(138, 17, false)).toBe(1);
    expect(factorAceite(138, 17, true)).toBeCloseTo(0.0074, 3);
  });

  it("`seFrie` lee la receta, no el ingrediente", () => {
    expect(seFrie({ name: "Alioli", steps: ["Emulsionar el aceite con el ajo poco a poco."] })).toBe(false);
    expect(seFrie({ name: "Patatas fritas", steps: ["Freír en aceite abundante."] })).toBe(true);
    expect(seFrie({ name: "Croquetas", stepsRich: [{ text: "Freír hasta que estén doradas." }] })).toBe(true);
    // Un confitado NO es una fritura: se come con su aceite y absorbe mucho
    // más del 6 %. Tratarlo como fritura era la mitad del daño en estrella.
    expect(seFrie({ name: "Puerros confitados", steps: ["Confitar a fuego muy suave 40 min."] })).toBe(false);
  });

  it("un chorro para sofreír pasa entero: el tope es un mínimo, no un recorte", () => {
    expect(factorAceite(18, 300, true)).toBe(1);
  });

  it("sin aceite no hay factor que aplicar", () => {
    expect(factorAceite(0, 500)).toBe(1);
  });

  it("los aceites se reconocen por id y nunca por el nombre de la línea", () => {
    // «Anchoas en aceite» y «Atún en aceite» son conservas de pescado: si el
    // reconocimiento fuera por texto, el modo «aceite fuera» les borraba la
    // proteína.
    expect(ES_ACEITE_DE_FREIR.test("aceite-oliva")).toBe(true);
    expect(ES_ACEITE_DE_FREIR.test("anchoa-en-aceite")).toBe(false);
    expect(ES_ACEITE_DE_FREIR.test("atun")).toBe(false);
  });
});

describe("la ausencia y el uno declarado no significan lo mismo", () => {
  /**
   * Durante meses significaban lo mismo, y por eso «Gambas peladas» y «Rape»
   * estaban igual de vacíos: el primero porque no hay nada que tirar y el
   * segundo porque nadie lo había mirado. Son 2 kg de cola de rape contados
   * como carne.
   *
   * Es el mismo arreglo que `via` en la nutrición: la cura no fue adivinar
   * mejor, fue obligar al dato a decir de dónde viene.
   */
  it("un 1 declarado dice que alguien lo miró", () => {
    const r = fraccionServida("Gambas peladas", "langostinos", porId.get("langostinos"));
    expect(r.factor).toBe(1);
    expect(r.via).toBe("no se tira nada");
    expect(r.duda).toBeNull();
  });

  it("la ausencia en un pez o un marisco se marca, y no se inventa número", () => {
    const r = fraccionServida("Caballa", "caballa", porId.get("caballa"));
    expect(r.factor, "no se inventa: sigue contando entero").toBe(1);
    expect(r.via).toBe("SIN DECIDIR");
    expect(r.duda).toMatch(/nadie ha declarado/);
  });

  it("la ausencia en una harina o un aceite NO se marca: ahí el silencio es correcto", () => {
    // Avisar de los 391 alimentos mataría el aviso, que es la forma habitual
    // de matar un aviso.
    expect(fraccionServida("Harina de trigo", "harina", porId.get("harina")).via).not.toBe("SIN DECIDIR");
    expect(fraccionServida("Pechuga de pollo", "pechuga-de-pollo", porId.get("pechuga-de-pollo")).via)
      .not.toBe("SIN DECIDIR");
  });
});
