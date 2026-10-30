/**
 * El esquema JSON de un parámetro de herramienta de Lola que es un dato del
 * registro (src/lib/registroFicha.js): tipo, `enum` del vocabulario
 * (src/lib/vocabularios.js) y límites, sacados de ahí y no copiados en cada
 * herramienta (plan de fichas, trozo 25; specs/arquitectura-objetivo.md §[1],
 * «Lo que se genera»).
 *
 * Solo el parámetro: el texto de para qué sirve la herramienta, y el matiz de
 * cada parámetro («la lista ENTERA: sustituye»), siguen a mano en
 * api/_bot/agente.js, porque el registro no lleva descripción. No genera
 * pantallas ni flujos.
 *
 * El esquema lleva, bajo la clave Symbol DEL_REGISTRO, la clave del dato del
 * que sale. Un Symbol no viaja en el JSON hacia la API (lo que ve el modelo no
 * cambia por llevarla); agente.js la lee para comprobar que la ficha de la
 * herramienta declara ese dato en `lee` o `escribe`, y fichas.test.js para
 * exigir que ningún `enum` repita a mano el vocabulario de un dato del registro.
 */
import { datoDe } from "./registroFicha.js";
import { vocabulario } from "./vocabularios.js";

/** La clave Symbol con la clave del dato del registro del que sale un esquema. */
export const DEL_REGISTRO = Symbol("delRegistro");

/** El tipo JSON de cada tipo del registro que cabe en un parámetro (TIPOS_CAMPO de registroFicha.js). */
const TIPO_JSON = Object.freeze({
  enum: "string", lista_enum: "array", int: "integer", decimal: "number",
  bool: "boolean", fecha: "string", texto: "string", ref: "string",
});

/**
 * Las piezas para probarlo con un registro y unos vocabularios de prueba
 * (esquemaHerramienta.test.js); en producción, esquemaDato.
 */
export function crearEsquema({ datoDe: dato, vocabulario: lista }) {
  const valores = (clave, d) => {
    const v = d.vocabulario ? lista(d.vocabulario) : null;
    if (!v) throw new Error(`esquemaDato: «${clave}» no tiene vocabulario en vocabularios.js`);
    return [...v];
  };
  /**
   * El esquema de un parámetro que es el dato `clave` («members.x» es de la
   * persona). Un `mapa` con vocabulario («quién come dónde») da un valor suelto
   * del mapa: la herramienta pone una entrada. `descripcion` es el matiz del
   * parámetro, a mano. Falla en alto si la clave no existe o su tipo no cabe en
   * un parámetro: un esquema a medias haría que Lola mandara cualquier cosa.
   */
  return function esquemaDato(clave, { descripcion } = {}) {
    const d = dato(clave);
    if (!d) throw new Error(`esquemaDato: «${clave}» no está en el registro`);
    const conVocabulario = d.tipo === "mapa" && d.vocabulario;
    const tipo = conVocabulario ? "string" : TIPO_JSON[d.tipo];
    if (!tipo) throw new Error(`esquemaDato: «${clave}» es de tipo ${d.tipo}, que no cabe en un parámetro`);
    let esquema;
    if (d.tipo === "lista_enum") esquema = { type: tipo, items: { type: TIPO_JSON.enum, enum: valores(clave, d) } };
    else if (d.tipo === "enum" || conVocabulario) esquema = { type: tipo, enum: valores(clave, d) };
    else esquema = { type: tipo, ...(d.minimo != null ? { minimum: d.minimo } : {}), ...(d.maximo != null ? { maximum: d.maximo } : {}) };
    if (descripcion) esquema.description = descripcion;
    return Object.assign(esquema, { [DEL_REGISTRO]: clave });
  };
}

export const esquemaDato = crearEsquema({ datoDe, vocabulario });
