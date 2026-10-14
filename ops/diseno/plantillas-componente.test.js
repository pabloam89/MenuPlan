import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerBibliotecas, leerBloques } from "../../scripts/lib/bibliotecasDiseno.mjs";
import { CLAVES_DE_VIDA, DE_BLOQUES, NO_APLICA, SIN_COMPROBAR, VOCABULARIOS_DE_PLANTILLAS, cifrasDePlantillas, clavesDeVocabulario, leerPlantillas, problemasDePlantillas, textosDePlantillas, valoresDeAtributo } from "../../scripts/lib/plantillasComponente.mjs";
import { leerTaxonomia } from "../../scripts/lib/taxonomiaDiseno.mjs";
import { VOCABULARIOS, leerRegistro } from "../../scripts/lib/vocabulariosVida.mjs";

/**
 * Las plantillas de componente (#842, programa #774): ops/diseno/plantillas-componente.json contra la taxonomía, los bloques
 * y el pool de diseño. Test booleano, sin lista de excepciones:
 *
 *  1. hay una plantilla por cada uno de los 50 elementos de la taxonomía, ni más ni menos, y ninguna es copia de otra
 *     (partes y atributos distintos);
 *  2. cada parte, atributo, valor, propiedad visual, paso, estado, rol ARIA, nombre accesible, tecla y sistema sale de un
 *     vocabulario cerrado con definición; los reutilizados (estados, categorías, variantes, tamaños, densidades, tipos de
 *     token) vienen de ops/diseno/bloques.json y las marcas, del pool, sin copiarse;
 *  3. lo visual apunta a un paso de una escala por su rol, sobre una parte de su anatomía: nunca a un número;
 *  4. un interactivo tiene los estados de la norma design-complete-states (y hover si hay puntero), objetivo táctil y parada
 *     de foco; un estático no tiene estados de interacción, objetivo táctil ni parada de foco;
 *  5. cada fuente lleva sistema, URL marcada [F] o [S] bajo la raíz del sistema y su comprobación (fecha o unverified);
 *  6. ningún vocabulario ni valor propio sin lector, y los vocabularios están en el ciclo de vida.
 *
 * Abajo, un autotest: cada regla falla con un dato roto a propósito. Sin red.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATOS = leerPlantillas(RAIZ);
const TAXONOMIA = leerTaxonomia(RAIZ);
const BLOQUES = leerBloques(RAIZ);
const POOL = leerBibliotecas(RAIZ);
const copia = (x) => JSON.parse(JSON.stringify(x));
const problemas = (d, b = BLOQUES, pool = POOL) => problemasDePlantillas(d, TAXONOMIA, b, pool);
const plantilla = (d, id) => d.plantillas.find((t) => t.elemento === id);

describe("las plantillas de hoy", () => {
  it("no tienen ningún problema contra la taxonomía, los bloques y el pool", () => {
    expect(problemas(DATOS), "Corrige ops/diseno/plantillas-componente.json").toEqual([]);
  });

  it("hay una por cada elemento de la taxonomía (los 50: control 18, view 18, overlay 9, imagery 5)", () => {
    const ids = TAXONOMIA.elemento.map((e) => e.id).sort();
    expect(ids).toHaveLength(50);
    expect(DATOS.plantillas.map((t) => t.elemento).sort()).toEqual(ids);
  });

  it("ninguna es copia de otra, y los atributos son de verdad distintos por tipo", () => {
    const c = cifrasDePlantillas(DATOS, TAXONOMIA);
    expect(c.firmas_distintas).toBe(c.plantillas);
    // Una tarjeta no es un botón: no comparten partes y atributos, y el botón tiene variante y la tarjeta no.
    const atributos = (id) => plantilla(DATOS, id).forma.map((f) => f.atributo);
    expect(atributos("button")).toContain("variant");
    expect(atributos("card")).not.toContain("variant");
    expect(plantilla(DATOS, "card").anatomia.map((a) => a.parte)).toContain("media");
    expect(plantilla(DATOS, "button").anatomia.map((a) => a.parte)).not.toContain("media");
  });

  it("las cifras cuadran con el fichero", () => {
    const c = cifrasDePlantillas(DATOS, TAXONOMIA);
    const suma = (o) => Object.values(o).reduce((a, n) => a + n, 0);
    expect(c.plantillas).toBe(c.elementos);
    expect(suma(c.por_interaccion)).toBe(c.plantillas);
    expect(suma(c.por_categoria)).toBe(c.plantillas);
    expect(c.fuentes_comprobadas + c.fuentes_sin_comprobar).toBe(c.fuentes);
    expect(suma(c.fuentes_por_sistema)).toBe(c.fuentes);
    expect(suma(c.fuentes_por_alcance)).toBe(c.fuentes);
  });

  it("lo que no se ha leído consta como unverified: la primera versión se escribió sin leer las páginas", () => {
    const c = cifrasDePlantillas(DATOS, TAXONOMIA);
    expect(c.fuentes_comprobadas).toBe(DATOS.plantillas.flatMap((t) => t.fuentes).filter((f) => f.comprobada !== SIN_COMPROBAR).length);
    expect(DATOS.lectura.base).toMatch(/unverified/);
  });

  it("reutiliza los vocabularios de bloques.json y las marcas del pool, sin copiarlos", () => {
    for (const nombre of Object.values(DE_BLOQUES)) expect(Object.keys(DATOS.vocabularios), nombre).not.toContain(nombre);
    expect(DATOS.vocabularios).not.toHaveProperty("marca");
    expect(DATOS.vocabularios).not.toHaveProperty("estados");
    expect(valoresDeAtributo(DATOS, BLOQUES, "variant")).toEqual(BLOQUES.vocabularios.variantes);
    expect(valoresDeAtributo(DATOS, BLOQUES, "density")).toEqual(BLOQUES.vocabularios.densidades);
  });

  it("los vocabularios del fichero son los que lee el código, y el ciclo de vida los registra y los ancla", () => {
    expect([...clavesDeVocabulario(DATOS)].sort()).toEqual([...VOCABULARIOS_DE_PLANTILLAS].sort());
    const anclados = Object.keys(leerRegistro(RAIZ).anclados);
    for (const k of CLAVES_DE_VIDA) {
      expect(Object.keys(VOCABULARIOS), k).toContain(`diseno.plantilla_${k}`);
      expect(anclados, k).toContain(`diseno.plantilla_${k}`);
      expect(Object.keys(textosDePlantillas(DATOS, k)).length, k).toBeGreaterThan(0);
    }
  });
});

describe("autotest: cada regla falla con un dato roto a propósito", () => {
  const rompe = (cambia, esperado, b, pool) => {
    const d = copia(DATOS);
    cambia(d);
    const p = problemas(d, b, pool);
    expect(p.length, "debería haber problema").toBeGreaterThan(0);
    expect(p.join("\n")).toContain(esperado);
  };
  it("falta la plantilla de un elemento", () => rompe((d) => { d.plantillas = d.plantillas.filter((t) => t.elemento !== "toast"); }, "falta la del elemento «toast»"));
  it("una plantilla de un elemento que no existe", () => rompe((d) => { plantilla(d, "toast").elemento = "boton-magico"; }, "no es un elemento"));
  it("una plantilla repetida", () => rompe((d) => { d.plantillas.push(copia(plantilla(d, "button"))); }, "repetida"));
  it("una plantilla copiada de otra con otro elemento", () => rompe((d) => { const c = copia(plantilla(d, "button")); const s = plantilla(d, "switch"); s.anatomia = c.anatomia; s.forma = c.forma; s.visual = c.visual; }, "es una plantilla copiada"));
  it("un campo desconocido", () => rompe((d) => { plantilla(d, "button").color = "verde"; }, "campo desconocido"));
  it("un campo que falta", () => rompe((d) => { delete plantilla(d, "button").estados; }, "falta estados"));
  it("una categoría que no está en bloques.json", () => rompe((d) => { plantilla(d, "button").categoria = "botonera"; }, "categoria «botonera»"));
  it("una parte fuera del vocabulario", () => rompe((d) => { plantilla(d, "button").anatomia.push({ parte: "brillo", obligacion: "optional" }); }, "parte «brillo»"));
  it("una parte repetida", () => rompe((d) => { const t = plantilla(d, "button"); t.anatomia.push(copia(t.anatomia[0])); }, "repetida"));
  it("sin ninguna parte obligatoria", () => rompe((d) => { for (const a of plantilla(d, "card").anatomia) a.obligacion = "optional"; }, "ninguna parte obligatoria"));
  it("un atributo que no está en el catálogo", () => rompe((d) => { plantilla(d, "button").forma.push({ atributo: "brillo", valores: ["a", "b"], por_defecto: "a" }); }, "no es un atributo"));
  it("un valor fuera de los del atributo", () => rompe((d) => { plantilla(d, "button").forma.find((f) => f.atributo === "variant").valores.push("dorado"); }, "valor «dorado»"));
  it("un atributo con un solo valor", () => rompe((d) => { const f = plantilla(d, "button").forma.find((x) => x.atributo === "variant"); f.valores = [f.por_defecto]; }, "al menos dos valores"));
  it("un por defecto fuera de los valores", () => rompe((d) => { plantilla(d, "button").forma.find((f) => f.atributo === "variant").por_defecto = "dorado"; }, "por_defecto «dorado»"));
  it("un atributo con valores propios y reutilizados a la vez", () => rompe((d) => { d.atributos_de_forma.variant.valores = { a: "Uno cualquiera", b: "Otro cualquiera" }; }, "uno de los dos"));
  it("un atributo que reutiliza lo que no existe", () => rompe((d) => { d.atributos_de_forma.variant.valores_de = "colores"; }, "valores_de «colores»"));
  it("un valor de atributo sin lector", () => rompe((d) => { Object.values(d.atributos_de_forma).find((a) => a.valores).valores.nunca = "Un valor que nadie usa"; }, "nunca: ninguna plantilla lo usa"));
  it("un atributo sin lector", () => rompe((d) => { d.atributos_de_forma.brillo = { que: "Un atributo que nadie usa", valores: { a: "Uno cualquiera", b: "Otro cualquiera" } }; }, "atributos_de_forma.brillo: ninguna plantilla lo usa"));
  it("un valor visual con número", () => rompe((d) => { plantilla(d, "button").visual[0].paso = "12px"; }, "paso «12px»"));
  it("un valor visual sobre una parte que no tiene", () => rompe((d) => { plantilla(d, "button").visual[0].parte = "media"; }, "la parte no está en su anatomía"));
  it("una propiedad visual que no existe", () => rompe((d) => { plantilla(d, "button").visual[0].propiedad = "brillo"; }, "no es una propiedad"));
  it("una propiedad visual con un tipo de token que no es de bloques.json", () => rompe((d) => { Object.values(d.propiedades_visuales)[0].tipo_de_token = "pixel"; }, "tipo_de_token «pixel»"));
  it("una escala sin propiedad que la use", () => rompe((d) => { d.escalas.brillo = { que: "Una escala que nadie usa", pasos: { a: "Uno cualquiera", b: "Otro cualquiera" } }; }, "escalas.brillo: ninguna propiedad"));
  it("un estado que no está en bloques.json", () => rompe((d) => { plantilla(d, "button").estados.push("brillante"); }, "estado «brillante»"));
  it("un interactivo sin foco", () => rompe((d) => { const t = plantilla(d, "button"); t.estados = t.estados.filter((e) => e !== "foco"); }, "le falta el estado foco"));
  it("un interactivo con puntero sin hover", () => rompe((d) => { const t = plantilla(d, "button"); t.estados = t.estados.filter((e) => e !== "hover"); }, "le falta el estado hover"));
  it("un interactivo sin objetivo táctil", () => rompe((d) => { plantilla(d, "button").accesibilidad.objetivo_tactil = NO_APLICA; }, "objetivo_tactil es required"));
  it("un interactivo que no es parada del foco", () => rompe((d) => { plantilla(d, "button").accesibilidad.teclado = ["enter-activates"]; }, "su teclado incluye tab-stop"));
  it("un estático con estado de interacción", () => rompe((d) => { plantilla(d, "divider").estados.push("pulsado"); }, "es estático y no puede tener el estado pulsado"));
  it("un estático con objetivo táctil", () => rompe((d) => { plantilla(d, "divider").accesibilidad.objetivo_tactil = "required"; }, "es estático y su objetivo_tactil"));
  it("un contenedor sin objetivo táctil", () => rompe((d) => { plantilla(d, "dialog").accesibilidad.objetivo_tactil = NO_APLICA; }, "un contenedor tiene objetivo_tactil"));
  it("un rol ARIA fuera del vocabulario", () => rompe((d) => { plantilla(d, "button").accesibilidad.rol_aria = ["boton"]; }, "rol_aria «boton»"));
  it("una tecla fuera del vocabulario", () => rompe((d) => { plantilla(d, "button").accesibilidad.teclado.push("f13"); }, "teclado «f13»"));
  it("una fuente sin marca de la forja", () => rompe((d) => { const f = plantilla(d, "button").fuentes[0]; f.fuente = f.fuente.slice(4); }, "fuente es «[F] https://…»"));
  it("una fuente con la marca [I], que es de la casa", () => rompe((d) => { const f = plantilla(d, "button").fuentes[0]; f.fuente = `[I]${f.fuente.slice(3)}`; }, "fuente es «[F] https://…»"));
  it("una fuente fuera de la raíz de su sistema", () => rompe((d) => { plantilla(d, "button").fuentes[0].fuente = "[F] https://x.test/a"; }, "no cuelga de la raíz"));
  it("una fuente de página que es la raíz", () => rompe((d) => { const f = plantilla(d, "button").fuentes[0]; f.fuente = `[F] ${d.raiz_de_sistema[f.sistema]}`; f.alcance_url = "page"; }, "alcance page es una página"));
  it("una fuente de sistema que es una página", () => rompe((d) => { plantilla(d, "button").fuentes.find((f) => f.alcance_url === "page").alcance_url = "system"; }, "alcance system es la raíz"));
  it("una comprobación que no es fecha ni unverified", () => rompe((d) => { plantilla(d, "button").fuentes[0].comprobada = "ayer"; }, "comprobada es unverified"));
  it("un sistema repetido en una plantilla", () => rompe((d) => { const t = plantilla(d, "button"); t.fuentes.push(copia(t.fuentes[0])); }, "repetido"));
  it("un vocabulario que el código no lee", () => rompe((d) => { d.vocabularios.color = { rojo: "Un color cualquiera" }; }, "VOCABULARIOS_DE_PLANTILLAS"));
  it("un vocabulario que el código lee y falta", () => rompe((d) => { delete d.vocabularios.teclado; }, "vocabularios.teclado: falta"));
  it("un valor de vocabulario sin lector", () => rompe((d) => { d.vocabularios.rol_aria.marquee = "Un rol que ninguna plantilla usa"; }, "rol_aria.marquee: ninguna plantilla lo usa"));
  it("una marca copiada en un vocabulario propio", () => rompe((d) => { d.vocabularios.objetivo_tactil[NO_APLICA] = "No tiene objetivo táctil"; }, "es una marca"));
  it("un vocabulario de bloques.json que desaparece", () => {
    const b = copia(BLOQUES);
    delete b.vocabularios.estados;
    rompe(() => {}, "falta el vocabulario «estados»", b);
  });
  it("un pool que pierde sus marcas", () => {
    const pool = copia(POOL);
    delete pool.vocabularios.marca;
    rompe(() => {}, "vocabulario marca de ops/diseno/bibliotecas.json", BLOQUES, pool);
  });
});
