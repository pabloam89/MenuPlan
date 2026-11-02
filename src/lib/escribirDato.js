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
 * Y el lado de la app, crearColaDeDatos (trozo 8, 3.ª parte): guarda lo pedido
 * en localStorage al momento, lo valida aquí antes de encolarlo, lo propone a
 * api/operacion.js en orden y lo reintenta al volver la red. Lo que espera más
 * de AVISO_PENDIENTE_MS se dice (pendientesViejos), no se tira. Si la base aún
 * no tiene la RPC (`rpc_ausente`), el dato espera en la cola y se dice: nunca
 * se escribe en el documento de la casa (sin convivencia). Su primer lector es
 * el trozo 12 (src/lib/casaDatos.js, con wantsPriceEstimates).
 *
 * Sin import.meta ni Supabase: el servidor lo importa tal cual.
 */
import {
  REF_OPERACION, CANAL_DATO, ESTADO_OPERACION, FALLO_DATO, FALLOS_DATO,
  VOCABULARIOS, paraEscribir, listaParaEscribir, FueraDeVocabulario, DIMENSIONES_AMBITO,
} from "./vocabularios.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { claveOperacion } from "./ids.js";
import { lunesDe } from "./reglas.js";

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
export const hay = (v) => typeof v === "string" && v.length > 0;

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
 * La clave de cada dimensión del ámbito (DIMENSIONES_AMBITO) en un dato de la operación y en el ámbito de
 * ficha_casa: la columna de sobre (0114). El grupo va por su id.
 */
export const CLAVE_DE_DIMENSION = Object.freeze(Object.fromEntries(DIMENSIONES_AMBITO.map((d) => [d, d === "grupo" ? "grupo_id" : d])));

/** El valor de cada dimensión, por su lista o su forma: el día de DIAS, la comida de COMIDAS, la semana por su lunes. */
const DE_LA_DIMENSION = Object.freeze({
  grupo: (v) => { if (!hay(v)) throw new DatoInvalido("el grupo del ámbito no es un id"); return v; },
  semana: (v) => {
    // La semana se nombra por su lunes (lunesDe): vale si es su propio lunes, en AAAA-MM-DD.
    if (typeof v !== "string" || lunesDe(v) !== v) throw new DatoInvalido(`la semana «${v}» no es un lunes (AAAA-MM-DD)`);
    return v;
  },
  dia: (v) => deLaLista("dias", v, "un día"),
  comida: (v) => deLaLista("comidas", v, "una comida"),
});

/**
 * Pura. Las claves de ámbito de un dato: exactamente las de su campo (registro_campo.ambito, 0114), cada una por
 * su lista; ninguna si el campo no tiene ámbito (y el dato sale igual que antes). Lanza DatoInvalido: el
 * disparador de la base lo rechazaría igual, y mejor no proponerlo.
 */
function ambitoDelDato(r, dato) {
  const ambito = {};
  for (const d of DIMENSIONES_AMBITO) {
    const clave = CLAVE_DE_DIMENSION[d];
    const v = dato[clave] ?? null;
    if (!r.ambito.includes(d)) {
      if (v != null) throw new DatoInvalido(`«${dato.campo}» no va por ${d} (su ámbito: ${r.ambito.join(", ") || "ninguno"})`);
      continue;
    }
    if (v == null) throw new DatoInvalido(`«${dato.campo}» va por ${r.ambito.join(", ")}: falta ${d}`);
    ambito[clave] = DE_LA_DIMENSION[d](v);
  }
  return ambito;
}

/**
 * Pura. El dato tal como va en `datos` de la operación, con su valor pasado por
 * su vocabulario (paraEscribir: un retirado va a su sucesor) y, si su campo tiene
 * ámbito, el de su hueco (ambitoDelDato). Lanza DatoInvalido.
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
  return { campo, persona_id: persona_id == null ? null : String(persona_id), ...ambitoDelDato(r, dato), valor: v, origen: o };
}

/**
 * Pura. La cabecera común a toda operación (la de un dato, 0106, y la de la familia, 0108): casa, clave, acción,
 * canal y referencia por su vocabulario, autor y `pedida_at` (cuándo lo pidió la familia; en la app, cuando
 * entró en la cola). Una sola receta para las dos: la usan operacionDeDato y operacionDePersonas (tuberia.js).
 * Lanza DatoInvalido.
 */
export function cabeceraDeOperacion({ casa, clave, accion, canal, ref, autor = {}, pedida_at = null }) {
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
  };
}

/**
 * Cuántos datos admite una operación: el tope de aplicar_operacion (`c_max_datos` en la 0115; el test lo compara).
 * Un horario entero de la casa más grande (8 × 7 × 5 = 280) cabe en una, y deshacer lo deshace entero.
 */
export const MAX_DATOS_OPERACION = 400;

// La clave entera de un dato en la operación: campo, persona y ámbito (la del sobre, 0114).
const claveDelDato = (d) => [d.campo, d.persona_id, ...DIMENSIONES_AMBITO.map((x) => d[CLAVE_DE_DIMENSION[x]])].map((v) => v ?? "").join("|");

/**
 * Pura. La operación de tipo dato que espera aplicar_operacion (0106: p_operacion), con un dato (`dato`) o con
 * varios que van juntos (`datos`: los huecos de un horario que cambia, rutina.js), que se aplican y se deshacen
 * juntos. Uno de los dos, nunca los dos. Lanza DatoInvalido: sin datos, con más de MAX_DATOS_OPERACION o con dos
 * del mismo hueco (la base los rechazaría igual).
 */
export function operacionDeDato({ dato, datos, ...pedido }) {
  if ((dato === undefined) === (datos === undefined)) throw new DatoInvalido("un dato o una lista de datos, uno de los dos");
  if (datos !== undefined && (!Array.isArray(datos) || datos.length === 0)) throw new DatoInvalido("datos: una lista con algún dato");
  const lista = (datos ?? [dato]).map(datoValido);
  if (lista.length > MAX_DATOS_OPERACION) throw new DatoInvalido(`datos: ${lista.length}, más de ${MAX_DATOS_OPERACION} en una operación`);
  const claves = lista.map(claveDelDato);
  const repetida = claves.find((k, i) => claves.indexOf(k) !== i);
  if (repetida) throw new DatoInvalido(`datos: el hueco «${repetida}» va dos veces`);
  return { ...cabeceraDeOperacion(pedido), datos: lista };
}

/** Pura. El campo de un pedido (el de su dato, o el de su primer dato), para el log. */
export const campoDelPedido = (p) => p?.dato?.campo ?? p?.datos?.[0]?.campo ?? null;

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

/**
 * Pura. El fallo de una respuesta del servidor: el que dice su cuerpo o, si no lo dice, el único de HTTP_DE_FALLO
 * con ese HTTP (la misma tabla con que contesta api/operacion.js). Un HTTP que comparten varios (el 503) o que no
 * está en la tabla es `servidor`, que espera en la cola.
 */
function falloDeRespuesta(status, cuerpo) {
  if (FALLOS_DATO.includes(cuerpo?.fallo)) return cuerpo.fallo;
  const deEseHttp = FALLOS_DATO.filter((f) => HTTP_DE_FALLO[f] === status);
  return deEseHttp.length === 1 ? deEseHttp[0] : FALLO_DATO.SERVIDOR;
}

/** Pura. Un texto como JSON, o null si no lo es (la página de un proxy, un despliegue a medias, una cola rota). */
export function jsonDeTexto(texto) {
  try {
    return JSON.parse(texto);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return null;
  }
}

/** Pura. null si el servidor contestó una operación (aplicada o rechazada); si no, su fallo. Un 200 sin `guardado` no cuenta como guardado. */
export function falloDeEnvio({ status, cuerpo }) {
  if (status === 200 && typeof cuerpo?.guardado === "boolean") return null;
  return falloDeRespuesta(status, cuerpo);
}

/**
 * El envío de la app a api/operacion.js, el único: lo usan esta cola y la familia (familiaCasa.js). POST con la
 * sesión de Supabase: `token()` da el access_token (o null); `url`, la de api/operacion.js (urlOperacion,
 * familiaCasa.js: aquí no se importa apiUrl, que es del navegador). Devuelve { status, cuerpo } (cuerpo null si
 * no es JSON; falloDeEnvio lo lee); si no llega, fetch lanza TypeError (sin_red).
 */
export function enviarAlServidor({ token, url, fetchFn = fetch }) {
  return async (item) => {
    const t = await token();
    if (!t) return { status: HTTP_DE_FALLO[FALLO_DATO.SIN_SESION], cuerpo: { fallo: FALLO_DATO.SIN_SESION } };
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return { status: res.status, cuerpo: jsonDeTexto(await res.text()) };
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
 * Cada intento que no guarda deja su línea `dato_sin_guardar` en el log.
 */
export function crearColaDeDatos({ almacen, enviar, ahora = () => Date.now(), nuevaClave = claveOperacion.nuevo }) {
  const leer = () => {
    const crudo = almacen.getItem(CLAVE_COLA);
    if (crudo == null) return [];
    const lista = jsonDeTexto(crudo);
    if (Array.isArray(lista)) return lista;
    // No se tira: se aparta con su nombre para poder rescatarlo, y se dice.
    almacen.setItem(`${CLAVE_COLA}.ilegible.${ahora()}`, crudo);
    almacen.setItem(CLAVE_COLA, "[]");
    console.error("[escribirDato] la cola guardada no es una lista; se aparta y se empieza otra");
    return [];
  };
  const guardar = (lista) => almacen.setItem(CLAVE_COLA, JSON.stringify(lista));
  let cadena = Promise.resolve();

  /** Un intento de cada uno, en orden. Devuelve { [clave]: resultado } de lo que se intentó. */
  async function vaciarYa() {
    const resultados = {};
    for (;;) {
      const [item] = leer();
      if (!item) break;
      let r = null;
      let fallo = null;
      try {
        r = await enviar(item);
        fallo = falloDeEnvio(r);
      } catch (e) {
        // Solo un fetch que no llega (TypeError) es la red; otro error sube a quien llamó, y el dato sigue en la cola.
        if (!(e instanceof TypeError)) throw e;
        fallo = FALLO_DATO.SIN_RED;
      }
      if (fallo) apuntarSinGuardar({ fallo, canal: CANAL_DATO.APP, campo: campoDelPedido(item) });
      if (fallo && FALLOS_QUE_ESPERAN.has(fallo)) {
        guardar(leer().map((x) => (x.clave === item.clave ? { ...x, fallo, intentos: (x.intentos ?? 0) + 1 } : x)));
        resultados[item.clave] = { guardado: false, pendiente: true, fallo };
        break;
      }
      guardar(leer().filter((x) => x.clave !== item.clave));
      // Con fallo, el servidor dice que no y repetirlo daría lo mismo: sale de la cola diciéndolo.
      resultados[item.clave] = fallo
        ? { guardado: false, pendiente: false, fallo }
        : { pendiente: false, ...resultadoDeOperacion(r.cuerpo) };
    }
    return resultados;
  }

  /** Reintenta lo pendiente (de uno en uno: dos llamadas a la vez no se pisan). */
  function vaciar() {
    const p = cadena.then(vaciarYa);
    // a propósito: el fallo lo recibe quien llamó (p); la cadena solo sigue para el siguiente.
    cadena = p.then(() => undefined, () => undefined);
    return p;
  }

  /**
   * Pide escribir un dato (`dato`) o varios que van juntos en una operación (`datos`, operacionDeDato). Lo guarda
   * en la cola al momento y lo intenta. Devuelve el resultado de esta operación: guardada, rechazada con su
   * sin_hacer, o pendiente con su fallo (y sigue en la cola). Un dato mal hecho lanza DatoInvalido y no entra.
   */
  async function escribir({ casa, accion, ref_id, dato, datos }) {
    const pedido = { clave: nuevaClave(), casa, accion, ref_id, pedida_at: new Date(ahora()).toISOString() };
    // La misma forma que comprobará el servidor (canal y ref los pone él); los datos, ya pasados por su vocabulario.
    const validos = operacionDeDato({ ...pedido, dato, datos, canal: CANAL_DATO.APP, ref: { tipo: REF_OPERACION.PANTALLA, id: ref_id } }).datos;
    const item = { ...pedido, ...(datos === undefined ? { dato: validos[0] } : { datos: validos }) };
    guardar([...leer(), item]);
    const resultados = await vaciar();
    // Uno anterior espera en la cola: este espera detrás, con el fallo de aquel.
    return resultados[item.clave] ?? { guardado: false, pendiente: true, fallo: leer()[0]?.fallo ?? null };
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
