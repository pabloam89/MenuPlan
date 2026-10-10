/**
 * Las dos escalas del proceso, declaradas UNA vez (#515, fondo #488). Antes cada una
 * vivía en varios sitios con nombres distintos y alguna con la lista copiada a mano.
 *
 *  1. La escala de veredicto (`VEREDICTOS`): cómo de dura es una regla hoy, de dura a
 *     rota. La usan las normas (`veredicto`), las obligaciones del flujo
 *     (`veredicto`; antes `dureza`) y los mecanismos (`veredicto`, el más alto que
 *     pueden dar; antes `veredicto_max`). Un solo nombre de campo.
 *  2. La escalera de durabilidad (`ESCALERA`): con qué se hace cumplir un arreglo, del
 *     más al menos duradero. Eran cuatro vocabularios para lo mismo: el `escalon` de
 *     ops/mecanismos.json, la `barrera` de la ficha del fondo, la lista `escalera` de
 *     ops/flujo.json y la etiqueta `arreglo:` de GitHub. Los tres primeros comparten los
 *     ids de aquí; la etiqueta de GitHub es la columna `etiqueta`, y no se renombra
 *     (una etiqueta de GitHub se cambia con Pablo).
 *
 * Nadie más escribe estas listas: las importa. `ops/escalas.test.js` falla si
 * aparecen a mano en otro fichero.
 *
 * El repo es público (#300): esto dice QUÉ escalones hay, nunca cómo se salta uno.
 */

/** Cómo de dura es una regla hoy. El orden es el de la escala: de más a menos dura. */
export const VEREDICTOS = {
  dura: "Ejecutor del sistema, para todos, falla cerrado y con un test que lo vigila",
  semidura: "Tiene ejecutor, pero no alcanza a todos, falla abierto o no hay test",
  blanda: "Solo texto o una persona que se acuerda",
  rota: "Se dice que hay ejecutor y hoy no funciona",
};

/** Los veredictos, de más a menos duro (la peor es `rota`). */
export const ORDEN_VEREDICTO = Object.keys(VEREDICTOS);

/** El más débil de una lista de veredictos (una cadena vale lo que su eslabón más flojo), o null si no hay. */
export function masDebil(veredictos) {
  const posiciones = veredictos.map((v) => ORDEN_VEREDICTO.indexOf(v));
  return posiciones.length ? ORDEN_VEREDICTO[Math.max(...posiciones)] : null;
}

/**
 * La escalera de durabilidad, del escalón más al menos duradero:
 *   id         el nombre del escalón (el `escalon` de un mecanismo, la `barrera` de la ficha)
 *   que        qué es
 *   etiqueta   la etiqueta `arreglo:` de GitHub que le corresponde (scripts/lib/issues.mjs)
 *   automatico se cumple sin que nadie se acuerde (lo usa el plan de un fondo)
 */
export const ESCALERA = [
  { id: "bloqueo", que: "Un permiso, un hook, una regla de GitHub o una restricción de la base impide hacerlo", etiqueta: "guardia", automatico: true },
  { id: "test_ci", que: "Un test o un eval en el CI falla si vuelve", etiqueta: "test", automatico: true },
  { id: "script", que: "Un script lo comprueba, si alguien lo lanza", etiqueta: "script", automatico: false },
  { id: "skill", que: "Un runbook lo explica a quien lo abre", etiqueta: "skill", automatico: false },
  { id: "texto", que: "Una línea en CLAUDE.md o en una regla", etiqueta: "regla", automatico: false },
];

/** Los escalones, del más al menos duradero. */
export const ESCALONES = ESCALERA.map((e) => e.id);

/** Los escalones que se cumplen sin que nadie se acuerde. */
export const ESCALONES_AUTOMATICOS = ESCALERA.filter((e) => e.automatico).map((e) => e.id);

/** La etiqueta `arreglo:` de GitHub que no corresponde a ningún escalón («no hace falta arreglo»). */
export const ETIQUETA_SIN_ESCALON = "ninguno";

/** Las etiquetas `arreglo:` que salen de la escalera, en orden. */
export const ETIQUETAS_DE_ESCALERA = ESCALERA.map((e) => e.etiqueta);

/** La etiqueta `arreglo:` de un escalón, o null si el escalón no existe. */
export function etiquetaDeEscalon(escalon) {
  return ESCALERA.find((e) => e.id === escalon)?.etiqueta ?? null;
}

/** Cuántos caracteres como mucho caben entre el primero y el último de los tres valores de una escala para contarla como copia. */
export const VENTANA_COPIA = 80;
/** Cuántos valores distintos de la misma escala, juntos, hacen una copia. */
export const MIN_VALORES_COPIA = 3;

/**
 * Valores que casi solo existen como parte de su escala: «dura», «blanda», «rota», «script», «skill» y
 * «texto» son palabras corrientes, y tres de ellas juntas en una frase no son una copia. Hace falta, además,
 * una de estas anclas dentro de la ventana.
 */
export const ANCLAS_ESCALA = ["semidura"];
export const ANCLAS_ESCALERA = ["bloqueo", "test_ci"];

/**
 * ¿Escribe este texto, a mano, la escala de veredicto o la escalera de durabilidad? Basta con que
 * aparezcan `MIN_VALORES_COPIA` valores distintos de la misma escala, como palabras enteras y uno de ellos
 * un ancla, dentro de una ventana corta (`VENTANA_COPIA` caracteres): da igual el separador (coma, dos puntos, barra, comillas
 * o espacios) y el orden. Devuelve cuáles ve: `[]`, `["escala"]`, `["escalera"]` o los dos. Lo usa
 * `ops/escalas.test.js` para que ningún fichero las vuelva a declarar.
 */
export function copiasDeEscalas(texto) {
  const hay = (ids, anclas) => {
    const palabras = new RegExp(`(?<![\w-])(${ids.join("|")})(?![\w-])`, "g");
    const vistos = [...texto.matchAll(palabras)].map((m) => [m.index, m[1]]);
    return vistos.some(([desde], i) => {
      const dentro = vistos.slice(i).filter(([pos]) => pos - desde <= VENTANA_COPIA).map(([, id]) => id);
      return new Set(dentro).size >= MIN_VALORES_COPIA && dentro.some((id) => anclas.includes(id));
    });
  };
  const copias = [];
  if (hay(ORDEN_VEREDICTO, ANCLAS_ESCALA)) copias.push("escala");
  if (hay(ESCALONES, ANCLAS_ESCALERA)) copias.push("escalera");
  return copias;
}
