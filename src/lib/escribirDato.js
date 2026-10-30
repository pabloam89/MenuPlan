/**
 * escribirDato: una sola forma de escribir un dato de la ficha, para la app y
 * para Lola (plan fichas con estado, trozo 8; #1037).
 *
 * Un dato se escribe como una operación de tipo dato que solo aplica el
 * servidor (arquitectura objetivo, D1 y D3): la RPC aplicar_operacion (0106) es
 * solo de la service role, así que el navegador nunca la llama ni lee la tabla
 * `operacion` (lleva salud). Aquí vive lo común a los dos lados, puro: el dato
 * contra el registro (registroCampos.js) y sus vocabularios (vocabularios.js),
 * la operación que espera aplicar_operacion y lo que se devuelve de ella.
 *
 * Lo usa hoy el servidor (api/_bot/datos.js). El trozo 8 sigue en dos PR más:
 * la entrada de la app (api/operacion.js, que llama a api/_bot/datos.js) y la
 * cola de la app en localStorage, que valida aquí antes de encolar. Ningún dato
 * pasa todavía por aquí: los tramos 3-6 mueven sus escritores (el primero, el
 * trozo 10), y el trozo 26 pone delante la tubería y su puerta.
 *
 * Sin import.meta ni Supabase: el servidor lo importa tal cual.
 */
import {
  ESTADO_OPERACION, FALLO_DATO,
  VOCABULARIOS, paraEscribir, listaParaEscribir, FueraDeVocabulario,
} from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";


/** Un dato que no cuadra con el registro o con su vocabulario. */
export class DatoInvalido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "DatoInvalido";
    this.fallo = FALLO_DATO.INVALIDO;
  }
}

// Solo que esté: la forma y el largo de casa, clave, acción, ref_id y persona los dicen los CHECK y las FK de la
// 0105 y la 0097, y el tipo, el rango y el largo del valor el disparador sobre_valor_valido (0097), una sola
// vez; si no cuadran, la base contesta 22023/23514/23503 y vuelve como `invalido`.
const hay = (v) => typeof v === "string" && v.length > 0;

/** El valor de una columna de vocabulario por paraEscribir (un retirado va a su sucesor); lanza DatoInvalido si no es de la lista. */
function deLaLista(nombre, valor, que) {
  let v = null;
  try {
    v = valor == null ? null : paraEscribir(nombre, valor);
  } catch (e) {
    if (!(e instanceof FueraDeVocabulario)) throw e;
  }
  if (v == null) throw new DatoInvalido(`«${valor}» no es ${que} (${nombre})`);
  return v;
}

/**
 * Pura. El dato tal como va en `datos` de la operación, con su valor pasado por
 * su vocabulario (paraEscribir: un retirado va a su sucesor). Lanza DatoInvalido.
 * Lo que depende de la base (persona de la casa, si se supone, si lo escribe la
 * familia) lo decide aplicar_operacion y vuelve en `sin_hacer`.
 */
export function datoValido(dato) {
  if (!dato || typeof dato !== "object") throw new DatoInvalido("falta el dato");
  const { campo, persona_id = null, valor = null, origen } = dato;
  const r = Object.hasOwn(REGISTRO_CAMPOS, String(campo)) ? REGISTRO_CAMPOS[campo] : null;
  if (!r) throw new DatoInvalido(`el campo «${campo}» no está en el registro (registroCampos.js)`);
  const o = deLaLista("origen_dato", origen, "un origen de dato");
  if (persona_id != null && !hay(String(persona_id))) throw new DatoInvalido("persona_id vacío");
  let v = valor;
  if (v !== null && VOCABULARIOS[r.vocabulario]) {
    if (r.tipo === "lista_enum" && !Array.isArray(v)) throw new DatoInvalido(`«${campo}» es una lista`);
    try {
      v = r.tipo === "lista_enum" ? listaParaEscribir(r.vocabulario, v) : paraEscribir(r.vocabulario, v);
    } catch (e) {
      if (e instanceof FueraDeVocabulario) throw new DatoInvalido(`«${campo}»: ${e.message}`);
      throw e;
    }
  }
  return { campo, persona_id: persona_id == null ? null : String(persona_id), valor: v, origen: o };
}

/**
 * Pura. La operación de tipo dato que espera aplicar_operacion (0106: p_operacion).
 * `pedida_at` es cuándo lo pidió la familia (en la app, cuando entró en la cola).
 * Lanza DatoInvalido.
 */
export function operacionDeDato({ casa, clave, accion, canal, ref, autor = {}, pedida_at = null, dato }) {
  if (!hay(casa)) throw new DatoInvalido("falta la casa");
  if (!hay(clave)) throw new DatoInvalido("falta la clave de la operación");
  if (!hay(accion)) throw new DatoInvalido("falta la acción");
  const c = deLaLista("canales_dato", canal, "un canal de dato");
  const t = deLaLista("refs_operacion", ref?.tipo, "una referencia de operación");
  if (!hay(ref?.id)) throw new DatoInvalido("falta de qué mensaje o pantalla sale (ref.id)");
  if (pedida_at != null && Number.isNaN(Date.parse(pedida_at))) throw new DatoInvalido("pedida_at no es una fecha");
  return {
    casa, clave, accion, canal: c, ref_tipo: t, ref_id: ref.id,
    autor_user_id: autor.user_id ?? null, autor_persona_id: autor.persona_id ?? null,
    ...(pedida_at ? { pedida_at } : {}),
    datos: [datoValido(dato)],
  };
}

/** Lo que el servidor contesta de una operación aplicada: sin `pedido` ni `inversa` (llevan salud). */
export const CAMPOS_RESULTADO = ["operacion_id", "estado", "repetida", "hecho", "sin_hacer", "choques", "rev"];

/** Pura. El resultado de aplicar_operacion para quien pidió: solo CAMPOS_RESULTADO, y si quedó guardado. */
export function resultadoDeOperacion(r) {
  const out = Object.fromEntries(CAMPOS_RESULTADO.map((k) => [k, r?.[k] ?? null]));
  return { guardado: out.estado === ESTADO_OPERACION.HECHA, ...out };
}

/**
 * La línea de log de un dato que no se guardó, la misma en la app y en el servidor, para contarlas:
 * {"evento":"dato_sin_guardar","fallo":"rpc_ausente","motivo":"no_existe","canal":"telegram","campo":"sexo"}.
 * Sin el valor: puede ser salud.
 */
export function apuntarSinGuardar({ fallo, motivo = null, canal = null, campo = null }) {
  console.error(JSON.stringify({ evento: "dato_sin_guardar", fallo, motivo, canal, campo }));
}
