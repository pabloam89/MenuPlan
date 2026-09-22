import { describe, expect, it } from "vitest";

import alimentos from "./alimentos.json";
import alimentoPorIngrediente from "./alimentoPorIngrediente.json";
import proyeccion from "./derived/alimentosApp.json";
import { createHash } from "node:crypto";
import ingredientes from "./ingredients.json";
const ingredients = ingredientes;
import familiaLabels from "./familiaLabels.json";
import bedcaChoices from "./bedcaChoices.json";
import ciqualChoices from "./ciqualChoices.json";
import ciqualQueries from "./ciqualQueries.json";
import fraccionComestible from "./fraccionComestible.json";
import densidad from "./densidad.json";
import { computeRecipeNutrition } from "../lib/ingredients.js";
import { gramsForRecipeQuantity } from "../lib/kitchenUnits.js";
import { FAMILIAS } from "../lib/notepadFields.js";
import { FRAGMENTOS } from "../../scripts/lib/bedcaDimensiones.mjs";
import { deriveFamilia } from "../../scripts/lib/familia.mjs";
import {
  CAMPOS_CONTABLES,
  DIMENSIONES,
  FAMILIAS_ALIMENTO,
  FAMILIA_DIMENSIONES,
  GRUPO_POR_FAMILIA,
  validateAlimentos,
} from "./alimentoSchema.js";

/**
 * Lo que estos tests protegen NO es que la tabla esté llena — está casi vacía a
 * propósito, porque A1 solo ingiere lo ingerible. Protegen que lo que dice sea
 * verdad: que el libro de cuentas no contradiga a la fila, que la FK cierre por
 * los dos lados, y que las cuatro tablas de vocabulario no se desincronicen
 * entre sí, que es como se descuadran las taxonomías copiadas.
 */
describe("la tabla de alimentos", () => {
  it("valida entera", () => {
    expect(validateAlimentos(alimentos)).toEqual([]);
  });

  it("hay exactamente un alimento por ingrediente", () => {
    // La primera versión fusionaba las filas que caían en la misma ficha de
    // BEDCA, y así juntó «Azúcar» con «Azúcar moreno», «Judías blancas» con
    // «Judías negras» y «Requesón» con «Ricotta». Que la fuente no distinga
    // dos alimentos no los convierte en uno.
    expect(alimentos).toHaveLength(ingredientes.length);
    expect(new Set(Object.values(alimentoPorIngrediente)).size).toBe(ingredientes.length);
  });

  it("la composición vive en UN solo sitio", () => {
    // Este test sustituye al del espejo, y el cambio es el punto.
    //
    // Los 32 nutrientes estuvieron a la vez en `ingredients.json` y en
    // `alimentos.json`, idénticos campo a campo y vigilados por un test que
    // comparaba las dos copias. Dos copias del mismo número no son redundancia
    // barata: la que la app leía de verdad era la que NO llevaba procedencia,
    // así que el número y su porqué vivían separados y el trace-back se rompía
    // justo en ese salto.
    //
    // Ahora `alimentos.json` es la tabla maestra —composición y procedencia
    // juntas— y el catálogo se queda con lo suyo. Lo que antes se comparaba,
    // ahora no puede existir.
    const conNumeros = ingredientes.filter((i) => "nutrition" in i).map((i) => i.id);
    expect(
      conNumeros,
      "vuelve a haber nutrición en ingredients.json. La composición es de la tabla maestra "
      + "(src/data/alimentos.json), que es la única que lleva `fuente`, `via` y `motivo` al "
      + "lado de cada número. Un ingrediente apunta a su alimento por alimentoPorIngrediente.",
    ).toEqual([]);
  });

  it("la proyección que baja al cliente no se queda vieja", () => {
    // `derived/alimentosApp.json` es la maestra transformada para el transporte
    // —sin la auditoría, que nadie lee en el navegador— y lleva el hash de la
    // maestra de la que salió. Si alguien regenera una y no la otra, esto cae.
    const esperado = createHash("sha256").update(JSON.stringify(alimentos)).digest("hex").slice(0, 16);
    expect(
      proyeccion._.hash_maestra,
      "la proyección del cliente salió de otra versión de alimentos.json. "
      + "Corre `node scripts/build-alimentos.mjs`.",
    ).toBe(esperado);
    expect(proyeccion.filas.length).toBe(alimentos.length);
  });

  it("la FK cierra por los dos lados", () => {
    const ids = new Set(alimentos.map((a) => a.id));
    const sinMapa = ingredientes.filter((i) => !alimentoPorIngrediente[i.id]).map((i) => i.id);
    expect(sinMapa).toEqual([]);

    const apuntanANada = Object.entries(alimentoPorIngrediente)
      .filter(([, alimentoId]) => !ids.has(alimentoId))
      .map(([ingId]) => ingId);
    expect(apuntanANada).toEqual([]);

    // Y ninguna fila huérfana: un alimento que no apunta ningún ingrediente es
    // una fila que nadie va a leer nunca.
    const apuntados = new Set(Object.values(alimentoPorIngrediente));
    expect(alimentos.filter((a) => !apuntados.has(a.id)).map((a) => a.id)).toEqual([]);
  });

  it("un número sin procedencia se declara heredado, nunca trazado", () => {
    // El defecto que esta tabla existe para cerrar es exactamente este: que un
    // valor parezca respaldado cuando no lo está.
    const mintiendo = alimentos.filter(
      (a) => a.nutricion && !a.fuenteId && a.fuente !== "heredado",
    );
    expect(mintiendo.map((a) => a.id)).toEqual([]);

    const heredadosSinAnotar = alimentos.filter(
      (a) => a.fuente === "heredado" && a.huecos.procedencia === "relleno",
    );
    expect(heredadosSinAnotar.map((a) => a.id)).toEqual([]);
  });

  it("el libro de cuentas habla de todos los campos y de ninguno más", () => {
    for (const a of alimentos) {
      expect(Object.keys(a.huecos).sort()).toEqual([...CAMPOS_CONTABLES].sort());
    }
  });
});

describe("los vocabularios no se desincronizan", () => {
  it("cada familia de alimento pliega sobre el vocabulario de familias que ya existe", () => {
    const sinGrupo = FAMILIAS_ALIMENTO.filter((f) => !(f in GRUPO_POR_FAMILIA));
    expect(sinGrupo).toEqual([]);

    // `null` es legítimo (el aceite no es una "vez por semana"); lo que no vale
    // es inventarse un destino que el resto del repo no conoce.
    const destinosInventados = Object.entries(GRUPO_POR_FAMILIA)
      .filter(([, grupo]) => grupo !== null && !FAMILIAS.includes(grupo))
      .map(([familia, grupo]) => `${familia} → ${grupo}`);
    expect(destinosInventados).toEqual([]);

    const sobran = Object.keys(GRUPO_POR_FAMILIA).filter((f) => !FAMILIAS_ALIMENTO.includes(f));
    expect(sobran).toEqual([]);
  });

  it("cada familia declara qué dimensiones le aplican", () => {
    const sinDeclarar = FAMILIAS_ALIMENTO.filter((f) => !FAMILIA_DIMENSIONES[f]);
    expect(sinDeclarar).toEqual([]);

    const dimsValidas = new Set(Object.keys(DIMENSIONES));
    const inventadas = Object.entries(FAMILIA_DIMENSIONES).flatMap(([f, dims]) =>
      dims.filter((d) => !dimsValidas.has(d)).map((d) => `${f}: ${d}`),
    );
    expect(inventadas).toEqual([]);
  });

  it("todo alimento tiene familia y rol, y no pueden dejar de tenerlos", () => {
    // Trinquete: una clave de agrupación al 61 % no agrupa nada. Este test
    // existe para que la cobertura no pueda bajar sin que alguien lo decida.
    expect(alimentos.filter((a) => !a.familia).map((a) => a.id)).toEqual([]);
    expect(alimentos.filter((a) => !a.rol).map((a) => a.id)).toEqual([]);
  });

  it("ningún ingrediente discrepa de la familia de la fila que apunta", () => {
    // Esta es la garantía estructural de que los dos planos están bien
    // separados. Cuando `familia` mezclaba identidad y función, este test
    // fallaba con un caso: `Tomate triturado` comparte ficha de BEDCA con
    // `Tomate` —son el mismo alimento— pero su derivación pedía `salsa`
    // mientras la fila decía `verdura_fruto`. Las dos tenían razón sobre
    // planos distintos, y por eso el choque no se podía arreglar sin separar
    // los campos. Si alguien vuelve a meter un valor de uso dentro de
    // `familia`, este test lo caza: los ingredientes que comparten alimento
    // comparten identidad por definición, pero no tienen por qué compartir
    // papel.
    const porId = new Map(alimentos.map((a) => [a.id, a]));
    const choca = [];
    for (const ing of ingredientes) {
      const fila = porId.get(alimentoPorIngrediente[ing.id]);
      const propia = deriveFamilia(ing, familiaLabels).familia;
      if (fila && propia !== fila.familia) {
        choca.push(`${ing.name}: sería ${propia}, la fila ${fila.id} dice ${fila.familia}`);
      }
    }
    expect(choca).toEqual([]);
  });

  it("ninguna familia animal se cuela en algo marcado vegetariano", () => {
    // La comprobación es independiente de la derivación: compara el resultado
    // contra `isVegetarian`, que se rellenó por otro camino y en otro momento.
    // Es la que encontró que el pez espada y las navajas estaban marcados
    // aptos para vegetarianos.
    const ANIMAL = new Set([
      "carne_ave", "carne_roja", "carne_cerdo", "carne_caza", "casqueria",
      "embutido", "pescado_blanco", "pescado_azul", "marisco", "cefalopodo",
    ]);
    const malos = [];
    for (const ing of ingredientes) {
      const familia = alimentos.find((a) => a.id === alimentoPorIngrediente[ing.id])?.familia;
      if (familia && ANIMAL.has(familia) && ing.isVegetarian) {
        malos.push(`${ing.name} → ${familia}`);
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("los juicios de familia", () => {
  const claves = Object.keys(familiaLabels).filter((k) => k !== "_");

  it("apuntan a ingredientes que existen", () => {
    // La trampa que este test cierra: una clave mal escrita no falla, se
    // ignora. Pasó al escribirlo — "hojas-de-gelatina" en vez de
    // "hoja-de-gelatina" — y la gelatina se quedó clasificada como verdura de
    // hoja sin que nada se quejara.
    const ids = new Set(ingredientes.map((i) => i.id));
    expect(claves.filter((k) => !ids.has(k))).toEqual([]);
  });

  it("explican por qué, y no solo qué", () => {
    const sinMotivo = claves.filter((k) => !familiaLabels[k].motivo?.trim());
    expect(sinMotivo).toEqual([]);
  });

  it("cambian algo: un juicio que repite a la derivación sobra", () => {
    // Si el léxico mejora y acaba dando la misma respuesta, este test falla y
    // avisa de que la excepción ya se puede borrar. Fallar aquí es una buena
    // noticia, no un problema — y ya pasó: al separar familia de rol, el
    // juicio de `salsa-soja` dejó de hacer falta y se borró.
    const redundantes = [];
    for (const k of claves) {
      const ing = ingredientes.find((i) => i.id === k);
      const sinJuicio = deriveFamilia(ing, {});
      if (sinJuicio.familia === familiaLabels[k].familia) redundantes.push(k);
    }
    expect(redundantes).toEqual([]);
  });
});

describe("las decisiones de ficha de BEDCA", () => {
  const claves = Object.keys(bedcaChoices).filter((k) => k !== "_");

  it("apuntan a ingredientes que existen", () => {
    const ids = new Set(ingredientes.map((i) => i.id));
    expect(claves.filter((k) => !ids.has(k))).toEqual([]);
  });

  it("explican por qué, incluidas las que dicen que ninguna ficha vale", () => {
    // `foodId: null` es una decisión, no un hueco: alguien miró los
    // candidatos y dijo que ninguno servía. Sin motivo, esa decisión no se
    // puede revisar ni revertir con criterio.
    expect(claves.filter((k) => !bedcaChoices[k].motivo?.trim())).toEqual([]);
  });

  it("están en el repo y no solo en la máquina donde se corrió el pipeline", () => {
    // El test es el fichero: si este import funciona, las 219 decisiones
    // viajan con el código. Vivían en output/, que está en .gitignore, y son
    // la parte cara de la ingesta — el emparejamiento, no los números.
    expect(claves.length).toBeGreaterThanOrEqual(219);
  });
});

describe("la fracción comestible", () => {
  const claves = Object.keys(fraccionComestible).filter((k) => k !== "_");

  it("apunta a ingredientes que existen y explica cada valor", () => {
    const ids = new Set(ingredientes.map((i) => i.id));
    expect(claves.filter((k) => !ids.has(k))).toEqual([]);
    expect(claves.filter((k) => !fraccionComestible[k].motivo?.trim())).toEqual([]);
  });

  /**
   * El 1 explícito ahora SÍ cuenta, y este test decía lo contrario.
   *
   * Decía: «un ingrediente con fracción 1 no pinta nada aquí: la ausencia YA
   * significa no se tira nada». Era razonable y llevaba meses en pie, pero
   * hacía el fichero incapaz de distinguir dos silencios muy distintos:
   *
   *   «Gambas peladas»  → nadie ha escrito nada porque no hay nada que tirar
   *   «Rape»            → nadie ha escrito nada porque nadie lo ha mirado
   *
   * Los dos eran ausencia y los dos se leían como «se come entero». El
   * segundo es falso: una cola de rape lleva la espina central, y son 2 kg de
   * catálogo contados como carne.
   *
   * Es el mismo arreglo que se le hizo a la nutrición con `via`: un `fuenteId`
   * sin `via` parecía trazado y no lo estaba. La cura no fue adivinar mejor,
   * fue obligar al dato a decir de dónde venía. Aquí igual: el que se come
   * entero lo declara con un 1 y su motivo, y a partir de ahí la ausencia
   * significa una sola cosa — que está sin mirar.
   */
  it("acepta el 1 explícito, y nada por encima", () => {
    const imposibles = claves.filter((k) => !(fraccionComestible[k].valor >= 0 && fraccionComestible[k].valor <= 1));
    expect(imposibles, "una fracción comestible vive entre 0 y 1").toEqual([]);
  });

  it("el que se come entero dice POR QUÉ lo sabemos", () => {
    // Un 1 sin motivo es peor que la ausencia: parece verificado y no lo está.
    // El motivo tiene que decir la prueba —el nombre canónico, la ficha— no
    // repetir el número.
    const mudos = claves
      .filter((k) => fraccionComestible[k].valor === 1)
      .filter((k) => (fraccionComestible[k].motivo ?? "").trim().length < 25);
    expect(mudos, "fracción 1 sin motivo: indistinguible de un relleno").toEqual([]);
  });

  it("lo que no se come no suma nutrición", () => {
    // La prueba de que el campo está CABLEADO y no solo declarado. El hueso
    // de ternera entra a 400 g en un consomé y no alimenta a nadie: antes de
    // esto contaba como 400 g de comida en un plato de cuatro raciones.
    const conHueso = { ingredients: [{ name: "Hueso de ternera", amount: 400, unit: "g" }] };
    expect(computeRecipeNutrition(conHueso, 4)).toBeNull();

    // Y la dorada entera aporta, pero solo su parte comestible.
    const entera = computeRecipeNutrition({ ingredients: [{ name: "Dorada", amount: 1000, unit: "g" }] }, 1);
    const fileteada = computeRecipeNutrition({ ingredients: [{ name: "Merluza en lomos", amount: 1000, unit: "g" }] }, 1);
    expect(entera).not.toBeNull();
    expect(fileteada).not.toBeNull();
    // 55 % de 1 kg de dorada son 550 g de pescado; la merluza en lomos va
    // entera. Con energías parecidas, la dorada tiene que quedar por debajo.
    expect(entera.kcal).toBeLessThan(fileteada.kcal * 1.2);
  });
});

describe("la densidad", () => {
  const claves = Object.keys(densidad).filter((k) => k !== "_");

  it("apunta a ingredientes que existen y explica cada valor", () => {
    const ids = new Set(ingredientes.map((i) => i.id));
    expect(claves.filter((k) => !ids.has(k))).toEqual([]);
    expect(claves.filter((k) => !densidad[k].motivo?.trim())).toEqual([]);
  });

  it("solo lista lo que NO pesa como el agua", () => {
    // Declarar una densidad de 1 sería ruido: la ausencia ya significa eso, y
    // listarla daría a entender que las demás están sin verificar. El umbral
    // es el 2 %, por debajo del cual la diferencia no mueve ningún número que
    // el usuario vea.
    const inutiles = claves.filter((k) => Math.abs(densidad[k].valor - 1) < 0.02);
    expect(inutiles).toEqual([]);
    // Y ninguna fuera de lo físicamente razonable para un ingrediente de cocina.
    const absurdas = claves.filter((k) => !(densidad[k].valor > 0.5 && densidad[k].valor < 2));
    expect(absurdas).toEqual([]);
  });

  it("un litro de aceite pesa 918 g, no 1.000", () => {
    // La prueba de que está CABLEADO. El aceite es 28.120 ml del catálogo —el
    // mayor volumen con diferencia— y es el primer aportador de grasa, que es
    // el macro que peor cuadra en la auditoría de macros.
    expect(gramsForRecipeQuantity("Aceite de oliva", 1000, "ml")).toBeCloseTo(918, 0);
    expect(gramsForRecipeQuantity("Aceite de oliva", 1, "l")).toBeCloseTo(918, 0);
    // Y lo que no declara densidad sigue pesando como el agua, que es correcto.
    expect(gramsForRecipeQuantity("Caldo de verduras", 1000, "ml")).toBe(1000);
  });
});

describe("la segunda fuente (CIQUAL)", () => {
  const ids = new Set(ingredientes.map((i) => i.id));
  const claves = (o) => Object.keys(o).filter((k) => k !== "_");

  it("sus decisiones y sus términos apuntan a ingredientes que existen", () => {
    expect(claves(ciqualChoices).filter((k) => !ids.has(k))).toEqual([]);
    expect(claves(ciqualQueries).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("cada decisión explica por qué", () => {
    expect(claves(ciqualChoices).filter((k) => !ciqualChoices[k].motivo?.trim())).toEqual([]);
  });

  it("ningún ingrediente tiene ficha en las dos tablas a la vez", () => {
    // Dos fichas para el mismo alimento son dos números distintos esperando a
    // que alguien elija por orden de lectura. CIQUAL solo se usa donde BEDCA
    // no llegaba, y esto lo mantiene así.
    const enLasDos = claves(ciqualChoices).filter(
      (k) => ciqualChoices[k].foodId != null && bedcaChoices[k]?.foodId != null,
    );
    expect(enLasDos).toEqual([]);
  });

  it("la tabla dice de qué fuente viene cada número", () => {
    // El coste de mezclar dos tablas de composición es pequeño pero real, y
    // solo es discutible si se puede ver. Una fila con nutrición y sin fuente
    // declarada es un número sin apellido.
    // `heredado` ya no está en la lista: significaba «hay número y no hay
    // ficha», y el trinquete de arriba prohíbe que vuelva a haberlo.
    const sinDecir = alimentos.filter(
      (a) => a.nutricion && !["bedca", "ciqual", "usda", "etiqueta", "manual"].includes(a.fuente),
    );
    expect(sinDecir.map((a) => a.id)).toEqual([]);
  });
});

describe("los vocabularios no se desincronizan (2)", () => {
  it("el parser solo produce valores que el schema acepta", () => {
    // Este es el test que de verdad importa de los tres: la tabla de 109
    // fragmentos y los seis enums viven en ficheros distintos, y si alguien
    // añade "en salmuera" al parser sin añadir "salmuera" a MEDIOS, el
    // constructor escribiría una fila que no valida — pero solo si ese
    // fragmento aparece en algún nombre real. Aquí salta siempre.
    const malos = [];
    for (const [fragmento, valor] of Object.entries(FRAGMENTOS)) {
      for (const item of Array.isArray(valor) ? valor : [valor]) {
        if (item.tipo !== "dimension") continue;
        if (!DIMENSIONES[item.dim]) { malos.push(`${fragmento}: dimensión "${item.dim}"`); continue; }
        if (!DIMENSIONES[item.dim].includes(item.valor)) {
          malos.push(`${fragmento}: ${item.dim} = "${item.valor}"`);
        }
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("ningun numero en uso se queda sin ficha", () => {
  // El trinquete. `heredado` significa «este número está en uso y nadie puede
  // decir de dónde sale», y durante mucho tiempo pareció el hueco menos urgente
  // porque el número estaba puesto y parecía razonable.
  //
  // Era el peor. Un número sin ficha tampoco tiene la convención de unidades de
  // esa ficha, y así el catálogo acabó con el sodio en gramos en unas filas y en
  // miligramos en el resto: cebolla 0,004 junto a cebolla roja 2,5, que son el
  // mismo alimento con mil veces de diferencia. El caso caro era el caldo de
  // carne, 250 mg por 100 ml contando como 0,25, en guisos de medio litro.
  //
  // Mientras no haya heredados el fallo no puede volver, porque una ficha real
  // trae su unidad con ella.
  it("ningun alimento tiene fuente heredada", () => {
    const sinFicha = alimentos.filter((a) => a.fuente === "heredado").map((a) => a.nombre);
    expect(sinFicha).toEqual([]);
  });

  it("cada fila con nutricion declara de donde sale", () => {
    const mudas = alimentos
      .filter((a) => a.nutricion && a.huecos?.procedencia !== "relleno")
      .map((a) => `${a.nombre} (${a.huecos?.procedencia})`);
    expect(mudas).toEqual([]);
  });

  // Las dos tablas dan el sodio en mg/100 g. Un valor por debajo de 1 mg es casi
  // siempre el mismo número escrito en gramos: el melocotón, con 0,555 mg
  // medidos, es hoy el único legítimo por debajo de ese umbral.
  it("el sodio esta en miligramos en todas las filas", () => {
    const sospechosos = alimentos
      .filter((a) => {
        const na = a.nutricion?.sodium100g;
        return na != null && na > 0 && na < 0.5;
      })
      .map((a) => `${a.nombre}: ${a.nutricion.sodium100g}`);
    expect(sospechosos).toEqual([]);
  });
});

describe("fraccionComestible no pierde decisiones por el camino", () => {
  // Una clave que no casa ningun ingrediente es una decision escrita que NO SE
  // APLICA A NADA, y no falla: simplemente no hace nada. Asi se perdio el pato
  // —se escribio «magret-de-pato» y el id es «pato»— y solo se vio cuando un
  // ragu de pato dio 68 g de proteina por racion.
  it("todas sus claves son ingredientes reales", () => {
    const ids = new Set(ingredients.map((i) => i.id));
    const huerfanas = Object.keys(fraccionComestible).filter((k) => !k.startsWith("_") && !ids.has(k));
    expect(huerfanas).toEqual([]);
  });

  it("los valores estan entre 0 y 1", () => {
    const malos = Object.entries(fraccionComestible)
      .filter(([k]) => !k.startsWith("_"))
      .filter(([, v]) => !(v.valor >= 0 && v.valor <= 1))
      .map(([k]) => k);
    expect(malos).toEqual([]);
  });

  // Cada una es un juicio sobre cuanta comida se tira. Sin motivo, nadie sabe
  // si el 0,55 de la dorada sale de una tabla o de una tarde floja.
  it("cada decision trae su motivo y su confianza", () => {
    for (const [k, v] of Object.entries(fraccionComestible)) {
      if (k.startsWith("_")) continue;
      expect(typeof v.motivo === "string" && v.motivo.length > 20, k).toBe(true);
      expect(typeof v.confianza === "number", k).toBe(true);
    }
  });
});
