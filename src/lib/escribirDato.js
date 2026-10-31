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
 * Lo usan el servidor (api/_bot/datos.js) y la entrada de la app
 * (api/operacion.js, con HTTP_DE_FALLO).
 *
 * Y el lado de la app, crearColaDeDatos: guarda lo pedido en localStorage al
 * momento, lo valida aquí antes de encolarlo, lo propone a api/operacion.js en
 * orden y lo reintenta al volver la red. Lo que espera más de
 * AVISO_PENDIENTE_MS se dice (pendientesViejos), no se tira. Si la base aún no
 * tiene la RPC (`rpc_ausente`), el dato espera en la cola y se dice: nunca se
 * escribe en el documento de la casa (sin convivencia, plan «Cómo se escribe»).
 * Quien crea la cola en la app le pasa la sesión y la URL (apiUrl). Ningún dato
 * pasa todavía por aquí: los tramos 3-6 mueven sus escritores (el primero, el
 * trozo 10), y el trozo 26 pone delante la tubería y su puerta.
 *
 * Sin import.meta ni Supabase: el servidor lo importa tal cual.
 */
import {
  REF_OPERACION, CANAL_DATO, ESTADO_OPERACION, FALLO_DATO, FALLOS_DATO,
  VOCABULARIOS, paraEscribir, listaParaEscribir, FueraDeVocabulario,
} from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { claveOperacion } from "./ids.js";

/** El punto del servidor al que la app propone sus operaciones (api/operacion.js). */
export const RUTA_OPERACION = "/api/operacion";
/** Dónde guarda la app lo que aún no ha llegado a la base. */
export const CLAVE_COLA = "menuplan.colaDatos.v1";
/** A partir de cuánto lo pendiente se dice (plan, trozo 8: 24 h). */
export const AVISO_PENDIENTE_MS = 24 * 60 * 60 * 1000;
/** Con estos fallos (FALLOS_DATO) el dato se queda en la cola de la app y se reintenta; con el resto sale de ella diciéndolo. */
export const FALLOS_QUE_ESPERAN = Object.freeze(new Set([FALLO_DATO.RPC_AUSENTE, FALLO_DATO.SIN_SESION, FALLO_DATO.SIN_RED, FALLO_DATO.SERVIDOR]));

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

/** El código HTTP con que api/operacion.js contesta cada fallo (FALLOS_DATO). */
export const HTTP_DE_FALLO = Object.freeze({
  [FALLO_DATO.RPC_AUSENTE]: 503, [FALLO_DATO.INVALIDO]: 400, [FALLO_DATO.SIN_PERMISO]: 403,
  [FALLO_DATO.SIN_SESION]: 401, [FALLO_DATO.SIN_RED]: 503, [FALLO_DATO.SERVIDOR]: 503,
});

/** Pura. El fallo de una respuesta del servidor: el que dice su cuerpo o, si no lo dice, el de su HTTP. */
export function falloDeRespuesta(status, cuerpo) {
  if (FALLOS_DATO.includes(cuerpo?.fallo)) return cuerpo.fallo;
  if (status === 401) return FALLO_DATO.SIN_SESION;
  if (status === 403) return FALLO_DATO.SIN_PERMISO;
  if (status === 400 || status === 422) return FALLO_DATO.INVALIDO;
  return FALLO_DATO.SERVIDOR;
}

/**
 * El envío de la app: POST a api/operacion.js con la sesión de Supabase.
 * `token()` da el access_token (o null); `url` es apiUrl(RUTA_OPERACION).
 * Devuelve { status, cuerpo }; un fallo de red lanza (la cola lo cuenta como sin_red).
 */
export function enviarAlServidor({ token, url = RUTA_OPERACION, fetchFn = fetch }) {
  return async (item) => {
    const t = await token();
    if (!t) return { status: 401, cuerpo: { fallo: FALLO_DATO.SIN_SESION } };
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    let cuerpo = null;
    try { cuerpo = await res.json(); } catch (e) {
      // El cuerpo no es JSON: el fallo sale del HTTP (falloDeRespuesta), y queda en el log.
      console.warn("[escribirDato] respuesta sin JSON", res.status, String(e?.message ?? e).slice(0, 120));
    }
    return { status: res.status, cuerpo };
  };
}

/**
 * La cola de la app. `almacen`: localStorage (o uno de prueba con getItem y
 * setItem); `enviar(item)` → { status, cuerpo } (enviarAlServidor); `ahora()`
 * en ms; `nuevaClave()` da la clave de idempotencia (la misma en cada
 * reintento: si la base ya lo aplicó, contesta `repetida` y no escribe dos veces).
 *
 * Se envía en orden y de uno en uno, y la cola se para en el primero que tiene
 * que esperar: un cambio posterior del mismo dato no adelanta al anterior.
 */
export function crearColaDeDatos({ almacen, enviar, ahora = () => Date.now(), nuevaClave = claveOperacion.nuevo }) {
  const leer = () => {
    const crudo = almacen.getItem(CLAVE_COLA);
    if (crudo == null) return [];
    try {
      const lista = JSON.parse(crudo);
      if (Array.isArray(lista)) return lista;
      throw new Error("no es una lista");
    } catch (e) {
      // No se tira: se aparta con su nombre para poder rescatarlo, y se dice.
      almacen.setItem(`${CLAVE_COLA}.ilegible.${ahora()}`, crudo);
      almacen.setItem(CLAVE_COLA, "[]");
      console.error("[escribirDato] la cola guardada no se puede leer; se aparta y se empieza otra:", String(e?.message ?? e));
      return [];
    }
  };
  const guardar = (lista) => almacen.setItem(CLAVE_COLA, JSON.stringify(lista));
  let cadena = Promise.resolve();

  /** Un intento de cada uno, en orden. Devuelve { [clave]: resultado } de lo que se intentó. */
  async function vaciarYa() {
    const resultados = {};
    for (;;) {
      const [item] = leer();
      if (!item) break;
      let fallo = null;
      let r = null;
      try {
        r = await enviar(item);
        // Un 200 sin estado no es una operación aplicada: se trata como fallo del servidor.
        if (r.status !== 200 || !r.cuerpo?.estado) fallo = falloDeRespuesta(r.status, r.cuerpo);
      } catch (e) {
        console.warn("[escribirDato] no llega al servidor:", String(e?.message ?? e).slice(0, 120));
        fallo = FALLO_DATO.SIN_RED;
      }
      if (fallo && FALLOS_QUE_ESPERAN.has(fallo)) {
        guardar(leer().map((x) => (x.clave === item.clave ? { ...x, fallo, intentos: (x.intentos ?? 0) + 1 } : x)));
        resultados[item.clave] = { guardado: false, pendiente: true, fallo };
        break;
      }
      guardar(leer().filter((x) => x.clave !== item.clave));
      if (fallo) {
        // El servidor dice que no, y repetirlo daría lo mismo: sale de la cola diciéndolo.
        apuntarSinGuardar({ fallo, canal: CANAL_DATO.APP, campo: item.dato?.campo ?? null });
        resultados[item.clave] = { guardado: false, pendiente: false, fallo };
      } else {
        resultados[item.clave] = { pendiente: false, ...resultadoDeOperacion(r.cuerpo) };
      }
    }
    return resultados;
  }

  /** Reintenta lo pendiente (de uno en uno: dos llamadas a la vez no se pisan). */
  function vaciar() {
    const p = cadena.then(vaciarYa);
    // a propósito: el fallo lo recibe quien llamó (p); la cadena solo sigue para el siguiente.
    cadena = p.catch(() => undefined);
    return p;
  }

  /**
   * Pide escribir un dato. Lo guarda en la cola al momento y lo intenta.
   * Devuelve el resultado de este dato: guardado, rechazado con su sin_hacer,
   * o pendiente con su fallo (y sigue en la cola). Un dato mal hecho lanza
   * DatoInvalido y no entra.
   */
  async function escribir({ casa, accion, ref_id, dato }) {
    const pedido = { clave: nuevaClave(), casa, accion, ref_id, pedida_at: new Date(ahora()).toISOString() };
    // La misma forma que comprobará el servidor (canal y ref los pone él); el dato, ya pasado por su vocabulario.
    const [valido] = operacionDeDato({ ...pedido, dato, canal: CANAL_DATO.APP, ref: { tipo: REF_OPERACION.PANTALLA, id: ref_id } }).datos;
    const item = { ...pedido, dato: valido };
    guardar([...leer(), item]);
    const resultados = await vaciar();
    return resultados[item.clave] ?? { guardado: false, pendiente: true, fallo: leer().find((x) => x.clave === item.clave)?.fallo ?? null };
  }

  /** Lo que sigue sin llegar a la base, con su último fallo. */
  const pendientes = () => leer();

  /** Lo que lleva más de AVISO_PENDIENTE_MS sin llegar: se dice, no se tira. */
  const pendientesViejos = () => leer().filter((x) => ahora() - Date.parse(x.pedida_at) > AVISO_PENDIENTE_MS);

  /** Reintenta al volver la red. Devuelve cómo dejar de escuchar. */
  function escucharRed(ventana) {
    const alVolver = () => vaciar().catch((e) => console.error("[escribirDato] reintento al volver la red:", String(e?.message ?? e)));
    ventana.addEventListener("online", alVolver);
    return () => ventana.removeEventListener("online", alVolver);
  }

  return { escribir, vaciar, pendientes, pendientesViejos, escucharRed };
}
