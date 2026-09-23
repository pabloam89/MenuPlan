import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import alimentos from "./alimentos.json";
import { EJES, EJE_POR_ID, cobertura, puedeResponder, valorValido } from "./axisRegistry.js";
import { escalaPorTandas } from "./recipeSchema.js";
import { composicionDe } from "../lib/derive/composicion.js";
import { novaDe } from "../lib/derive/nova.js";
import {
  densidadDe, completitudDe, sinCerdoDe, aptoVigiliaDe, tiempoActivoDe,
  cargaDe, esfuerzoDe, recursoDe, llevaMasaDe,
  escalabilidadDe, robustezDe, perecibilidadDe, conLasManosDe,
} from "../lib/derive/ejesDePlato.js";

const RAIZ = fileURLToPath(new URL("./recipes", import.meta.url));
const recetas = readdirSync(RAIZ)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(RAIZ, f), "utf8")));

/**
 * CÓMO SE MIDE CADA EJE QUE YA VIVE EN ALGÚN CAMPO.
 *
 * Solo los que tienen `campo`. Los silenciosos sin campo valen 0 por
 * definición y no hay nada que contar.
 */
const MEDIDORES = {
  // El eje 1 no vive en ningún campo: se calcula. Así que su cobertura se mide
  // CORRIENDO el cálculo, que es lo único que la sostiene. Antes declaraba 1.0
  // sin campo y sin medidor — la afirmación más fuerte del registro y la única
  // que nadie comprobaba.
  composicion: () => recetas.filter((r) => composicionDe(r).masaTotal > 0).length / recetas.length,
  // Los cinco que salieron del catálogo sin pedir un dato nuevo. Se miden
  // CORRIENDO su operador, igual que el eje 1: no viven en ningún campo, así
  // que lo único que sostiene su cobertura es que la función conteste.
  densidadNutricional: () => recetas.filter((r) => densidadDe(r).valor !== null).length / recetas.length,
  completitud: () => recetas.filter((r) => completitudDe(r).valor !== null).length / recetas.length,
  restriccionReligiosa: () => recetas.filter((r) => sinCerdoDe(r).valor !== null).length / recetas.length,
  aptoVigilia: () => recetas.filter((r) => aptoVigiliaDe(r).valor !== null).length / recetas.length,
  tiempoActivo: () => recetas.filter((r) => tiempoActivoDe(r).valor !== null).length / recetas.length,
  carga: () => recetas.filter((r) => cargaDe(r).valor !== null).length / recetas.length,
  esfuerzoMental: () => recetas.filter((r) => esfuerzoDe(r).valor !== null).length / recetas.length,
  conflictoRecursos: () => recetas.filter((r) => recursoDe(r).valor !== null).length / recetas.length,
  llevaMasa: () => recetas.filter((r) => llevaMasaDe(r).valor !== null).length / recetas.length,
  escalabilidadReal: () => recetas.filter((r) => escalabilidadDe(r).valor !== null).length / recetas.length,
  robustez: () => recetas.filter((r) => robustezDe(r).valor !== null).length / recetas.length,
  perecibilidad: () => recetas.filter((r) => perecibilidadDe(r).valor !== null).length / recetas.length,
  conLasManos: () => recetas.filter((r) => conLasManosDe(r).valor !== null).length / recetas.length,
  parte: () => recetas.filter((r) => (r.stepsRich ?? []).some((s) => s.part != null)).length / recetas.length,
  // El eje 49 tampoco vive en un campo: se lee de los minutos de los pasos. Su
  // cobertura es «de cuántas recetas se puede AFIRMAR algo», que es tener
  // `stepsRich`; una receta sin pasos ricos no es que no necesite víspera, es
  // que no se sabe. Se mide corriendo la misma función que usa filterRecipes.
  antelacion: () => recetas.filter((r) => (r.stepsRich ?? []).length > 0).length / recetas.length,
  tecnica: () => recetas.filter((r) => r.tecnica).length / recetas.length,
  // El único eje de ALIMENTO que se mide corriendo su operador, y por eso su
  // denominador son las 396 fichas y no las recetas. Lo que no se puede
  // decidir es la frontera 3/4, que necesita la lista de ingredientes del
  // producto y el catálogo no la tiene.
  nova: () => alimentos.filter((a) => novaDe(a).valor != null).length / alimentos.length,
  cocina: () => recetas.filter((r) => r.cocina).length / recetas.length,
  equipamiento: () => recetas.filter((r) => r.requiredAppliance).length / recetas.length,
  transportabilidad: () => recetas.filter((r) => r.tupperFriendly != null).length / recetas.length,
  congelabilidad: () => recetas.filter((r) => r.freezable != null).length / recetas.length,
  curacionEditorial: () => recetas.filter((r) => r.estrella != null).length / recetas.length,
  fotogenia: () => recetas.filter((r) => r.apetecible != null).length / recetas.length,
  escalabilidadTanda: () => recetas.filter((r) => escalaPorTandas(r) !== null).length / recetas.length,
  contextoPeticion: () => 1,
  sabor: () => recetas.filter((r) => (r.healthFlags ?? []).length > 0).length / recetas.length,
  montaje: () => recetas.filter((r) => r.montaje != null).length / recetas.length,
  formato: () => recetas.filter((r) => r.formato).length / recetas.length,
  temperatura: () => recetas.filter((r) => r.temperatura).length / recetas.length,
  gruposSecundarios: () => recetas.filter((r) => (r.mainIngredients ?? []).length > 0).length / recetas.length,
  // Mide la ESPECIE, no la clase: la clase está al 100 % en todas las familias
  // por construcción, y medirla daba verde sobre un árbol cuya `variedad` está
  // en 0 de 396 mientras la nota del eje prometía «cinco niveles al 100 %».
  subtipoIngrediente: () => alimentos.filter((a) => a.taxonomia?.especie).length / alimentos.length,
  // El PEOR de los micros que el nombre del eje promete, no el mejor. Medir el
  // calcio (94,9 %) escondía que la B12 está en 89,6 %, y sobre todo que el
  // omega-3 no tiene campo: la cobertura decía 95 % para una pregunta que no
  // tiene ni un dato detrás.
  micronutrientes: () => Math.min(...["iron100g", "calcium100g", "vitaminB12100g", "folate100g"]
    .map((k) => alimentos.filter((a) => a.nutricion?.[k] != null).length / alimentos.length)),
};

describe("el registro de ejes", () => {
  it("están los 45 del documento, numerados sin huecos ni repetidos", () => {
    const ns = EJES.map((e) => e.n).sort((a, b) => a - b);
    // Los 45 del documento TIENEN que estar. Por encima puede haber más: del
    // 46 en adelante son los que salieron de medir, y se numeran a
    // continuación en vez de intercalarse, porque 1-45 son la referencia
    // cruzada con §6 y reordenarlos rompe toda discusión ya tenida sobre
    // «el eje 23».
    expect(new Set(ns).size, "dos ejes con el mismo número").toBe(ns.length);
    expect(ns[0]).toBe(1);
    expect(ns.filter((n) => n <= 45).length, "el documento define 45 ejes en §6").toBe(45);
    // Los números son la referencia cruzada con el documento: si aquí falta el
    // 26 y allí existe, una discusión sobre «el eje 26» apunta a dos cosas.
    const faltan = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !ns.includes(n));
    expect(faltan, "números del documento sin entrada en el registro").toEqual([]);
  });

  it("ningún id repetido: es la clave de consulta", () => {
    expect(EJE_POR_ID.size).toBe(EJES.length);
  });

  /**
   * LA REGLA QUE MATÓ A `mainBase`.
   *
   * Un eje `activo` que no tiene quien lo lea no está activo: está podrido y
   * todavía no se ha notado. `mainBase` tenía esquema, columna, sincronización
   * y 14 valores donde debían ser 8, y NINGUNA regla lo leía.
   */
  it("un eje activo tiene datos Y tiene quien los lea", () => {
    const mentirosos = EJES.filter((e) => e.estado === "activo")
      .filter((e) => e.cobertura === 0 || e.consumidores.length === 0)
      .map((e) => `${e.n} ${e.id}: cobertura ${e.cobertura}, ${e.consumidores.length} consumidores`);
    expect(
      mentirosos,
      "se declara activo y no lo está. Si tiene datos y nadie los lee, es SILENCIOSO "
      + "y hay que decirlo — ese es exactamente el estado en el que `mainBase` se pudrió "
      + "sin que nadie lo notara.",
    ).toEqual([]);
  });

  /**
   * LOS DOS FALLOS QUE PARECEN EL ESTADO SANO.
   *
   * `silencioso` es correcto: declarado a propósito, sin datos y sin lector.
   * Lo que NO puede esconderse ahí son las dos podredumbres, que son el mismo
   * fallo visto desde cada lado:
   *
   *   sin_lector  datos que nadie lee   (mainBase, mainIngredients)
   *   sin_datos   lector sin datos      (scalesWithEaters)
   *
   * Con dos estados los dos caían en `silencioso` y pasaban por sanos.
   */
  it("silencioso significa sin datos Y sin lector, no una de las dos", () => {
    const mal = EJES.filter((e) => e.estado === "silencioso")
      .filter((e) => e.cobertura > 0 || e.consumidores.length > 0)
      .map((e) => `${e.n} ${e.id}: cobertura ${e.cobertura}, ${e.consumidores.length} consumidores`);
    expect(
      mal,
      "se declara silencioso y tiene datos o tiene lector. Si tiene datos y nadie los lee "
      + "es `sin_lector`; si tiene lector y no hay datos es `sin_datos`. Los dos son "
      + "fallos, y llamarlos silenciosos los disfraza del estado sano.",
    ).toEqual([]);
  });

  it("sin_lector y sin_datos dicen la verdad sobre cuál de los dos les falta", () => {
    const mal = [];
    for (const e of EJES) {
      if (e.estado === "sin_lector" && (e.cobertura === 0 || e.consumidores.length > 0)) {
        mal.push(`${e.n} ${e.id}: dice sin_lector con cobertura ${e.cobertura} y ${e.consumidores.length} consumidores`);
      }
      if (e.estado === "sin_datos" && (e.cobertura > 0 || e.consumidores.length === 0)) {
        mal.push(`${e.n} ${e.id}: dice sin_datos con cobertura ${e.cobertura} y ${e.consumidores.length} consumidores`);
      }
    }
    expect(mal, "el estado y los números no cuadran").toEqual([]);
  });

  /**
   * EL QUE IMPIDE QUE EL REGISTRO ENVEJEZCA.
   *
   * Una cobertura escrita a mano es correcta el día que se escribe y mentira
   * dos semanas después. Aquí se vuelve a contar sobre el catálogo: si alguien
   * rellena `tecnica` en cien recetas más y no toca el registro, este test le
   * dice que el registro se ha quedado atrás.
   */
  it("las coberturas declaradas coinciden con el catálogo de hoy", () => {
    const desfasadas = [];
    for (const [id, medir] of Object.entries(MEDIDORES)) {
      const eje = EJE_POR_ID.get(id);
      if (!eje) { desfasadas.push(`${id}: hay medidor y no hay eje`); continue; }
      const real = medir();
      if (Math.abs(real - eje.cobertura) > 0.005) {
        desfasadas.push(`${eje.n} ${id}: declara ${(100 * eje.cobertura).toFixed(1)} % y el catálogo dice ${(100 * real).toFixed(1)} %`);
      }
    }
    expect(
      desfasadas,
      "el registro dice una cobertura y el catálogo otra. No es un fallo del catálogo: "
      + "es que el registro se ha quedado viejo, y un registro viejo miente igual que "
      + "un campo sin lector.",
    ).toEqual([]);
  });

  /**
   * EL QUE ME CAZÓ A MÍ, Y POR ESO ESTÁ AQUÍ.
   *
   * La primera versión de este registro declaraba `tecnica` leída por
   * `filterRecipes` y `solver`. Ninguno de los dos la menciona: cero
   * apariciones en los dos ficheros. Lo mismo con `freezable` en
   * `filterRecipes` y con `estrella` en `recipeCatalog`. Cuatro de cinco
   * consumidores comprobados eran falsos.
   *
   * Los escribí de memoria — en un fichero que existe precisamente para no
   * fiarse de la memoria. Un `consumidores` a mano se pudre igual que un campo
   * sin lector, y encima miente con más autoridad, porque parece verificado.
   *
   * Así que aquí se vuelve a buscar en el código. Es grep y es tosco, y por
   * eso solo comprueba en una dirección: que el módulo que se declara lector
   * NOMBRE el campo. Un módulo que lo nombre sin leerlo se cuela; uno que lo
   * lea sin nombrarlo no existe.
   */
  const FUENTES = (() => {
    // IGNORA los DATOS, no el directorio que los contiene. La primera versión
    // ponía "data" entero y con eso se saltaba `recipeSchema.js`, `model.js` y
    // el resto del código que vive en src/data: un consumidor declarado ahí
    // salía como mentira aunque leyera el campo en la línea de al lado. Lo que
    // había que evitar eran los JSON del catálogo, que son megas de recetas.
    const IGNORA = new Set(["node_modules", "dist", "recipes", "derived", "assets"]);
    const raiz = fileURLToPath(new URL("..", import.meta.url));
    const rec = (dir) => readdirSync(dir).flatMap((e) => {
      if (IGNORA.has(e)) return [];
      const p = join(dir, e);
      if (statSync(p).isDirectory()) return rec(p);
      return /\.(js|jsx)$/.test(e) && !/\.test\./.test(e) ? [p] : [];
    });
    return rec(raiz).map((p) => ({ ruta: p, texto: readFileSync(p, "utf8") }));
  })();

  /** El nombre del campo tal cual aparece en el código, por eje. */
  const CAMPO_EN_CODIGO = {
    tecnica: "tecnica", cocina: "cocina", equipamiento: "requiredAppliance",
    transportabilidad: "tupperFriendly", congelabilidad: "freezable",
    curacionEditorial: "estrella", fotogenia: "apetecible",
    escalabilidadTanda: "scalesWithEaters", sabor: "healthFlags",
    subtipoIngrediente: "taxonomia", parte: ".part", montaje: "montaje",
    gruposSecundarios: "mainIngredients", formato: "formato", temperatura: "temperatura",
  };

  it("cada consumidor declarado nombra de verdad el campo del eje", () => {
    const mentiras = [];
    for (const eje of EJES) {
      const campo = CAMPO_EN_CODIGO[eje.id];
      if (!campo) continue;
      for (const c of eje.consumidores) {
        const hay = FUENTES.some((f) => f.ruta.includes(c) && f.texto.includes(campo));
        if (!hay) mentiras.push(`${eje.n} ${eje.id}: declara «${c}» y ese módulo no nombra «${campo}»`);
      }
    }
    expect(
      mentiras,
      "un consumidor declarado que no lee el campo. Es el mismo fallo que el registro "
      + "persigue, cometido por el registro: una lista escrita de memoria que parece "
      + "verificada. Corrígela con lo que diga el código, no al revés.",
    ).toEqual([]);
  });

  /**
   * EL AGUJERO QUE DEJABA COLARSE LA AFIRMACIÓN MÁS FUERTE DEL REGISTRO.
   *
   * La primera versión solo exigía medidor `if (e.campo)`. Con eso, un eje con
   * `campo: null` podía declarar la cobertura que quisiera y nada la
   * comprobaba — y ya había uno explotándolo: el eje 1 `composicion`, campo
   * null y cobertura 1.0, que es lo más rotundo que dice este fichero.
   *
   * Ahora la regla es: o tienes campo, o tienes medidor, o tu cobertura es 0.
   */
  it("ninguna cobertura se declara sin nada que la compruebe", () => {
    const aire = EJES
      .filter((e) => e.cobertura > 0 && !e.campo && !MEDIDORES[e.id])
      .map((e) => `${e.n} ${e.id}: declara ${e.cobertura} sin campo y sin medidor`);
    expect(
      aire,
      "una cobertura en el aire. Si el eje no vive en un campo, necesita un medidor "
      + "que la calcule; si no puede tener ninguno de los dos, su cobertura es 0.",
    ).toEqual([]);
  });

  it("todo eje con campo declarado tiene medidor, o el registro no se puede comprobar", () => {
    const sinMedidor = EJES.filter((e) => e.campo && !MEDIDORES[e.id]).map((e) => `${e.n} ${e.id} (${e.campo})`);
    expect(
      sinMedidor,
      "declara vivir en un campo y nadie comprueba su cobertura. Añade el medidor arriba: "
      + "una cobertura que no se vuelve a medir es una cobertura que va a envejecer mal.",
    ).toEqual([]);
  });

  it("los vocabularios declarados son los que usa el catálogo", () => {
    const fuera = [];
    for (const r of recetas) {
      if (r.tecnica && valorValido("tecnica", r.tecnica) === false) fuera.push(`tecnica: «${r.tecnica}» en ${r.id}`);
      if (r.requiredAppliance && valorValido("equipamiento", r.requiredAppliance) === false) {
        fuera.push(`equipamiento: «${r.requiredAppliance}» en ${r.id}`);
      }
      for (const s of r.stepsRich ?? []) {
        if (s.part && valorValido("parte", s.part) === false) fuera.push(`parte: «${s.part}» en ${r.id}`);
      }
    }
    expect([...new Set(fuera)], "un valor que el vocabulario del registro no admite").toEqual([]);
  });

  describe("las consultas", () => {
    it("`cobertura` distingue el eje sin datos del eje que no existe", () => {
      // Son dos respuestas distintas y confundirlas es el error de fondo:
      // 0 = «declarado y vacío», null = «esa pregunta no está registrada».
      // Se usaba `formato` de ejemplo y dejó de servir al poblarlo: un test
      // que ilustra con un eje vivo caduca en cuanto ese eje avanza. `textura`
      // (eje 8) sigue declarada y vacía, que es lo que este caso necesita.
      expect(cobertura("textura")).toBe(0);
      expect(cobertura("un-eje-que-nadie-ha-declarado")).toBeNull();
    });

    it("`puedeResponder` dice por qué NO, que es lo que se le enseña al usuario", () => {
      expect(puedeResponder("tecnica").puede).toBe(true);
      const textura = puedeResponder("textura");
      expect(textura.puede).toBe(false);
      expect(textura.porque).toMatch(/sin datos/);
      // El caso «tener datos y que nadie los lea», que no es lo mismo que no
      // tenerlos. El ejemplo era `fotogenia` y era FALSO: `apetecible` sí lo
      // lee CatalogBrowserSheet, en la faceta que la UI llama «gourmet». Este
      // test lo tenía atornillado en verde, así que al corregir el registro se
      // puso rojo por decir la verdad — que es la peor clase de test.
      //
      // El ejemplo bueno es el eje 1: la composición por parte se calcula y en
      // producción no la lee nadie, porque derive/composicion.js solo lo
      // importa su propio test.
      const composicion = puedeResponder("composicion");
      expect(composicion.puede).toBe(false);
      expect(composicion.porque).toMatch(/nadie los lee/);
    });

    it("`valorValido` devuelve null cuando el eje aún no fija vocabulario", () => {
      // Distinto de `false`. Un vocabulario inventado a ojo es como `mainBase`
      // acabó con 14 valores donde debían ser 8.
      expect(valorValido("parte", "guarnicion")).toBe(true);
      expect(valorValido("parte", "postre")).toBe(false);
      // `temperatura` ya tiene vocabulario desde que se pobló; `carga` no.
      expect(valorValido("temperatura", "frio")).toBe(true);
      expect(valorValido("carga", "alta")).toBeNull();
    });
  });
});
