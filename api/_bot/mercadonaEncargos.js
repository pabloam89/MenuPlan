/**
 * Comprar: la casa pide rellenar una lista en su cuenta de Mercadona y un trabajador con navegador real lo hace por
 * detrás (0131, skill `mercadona`). Aquí vive todo lo que toca sus dos tablas, que son solo del servidor: la app y el
 * trabajador llegan por api/mercadona.js, y el cron por barrerCaducados. Quien llame mira antes el papel.
 *
 * Solo lista: nada de carrito ni de pago. La sesión llega sellada y aquí nadie la puede abrir.
 * Sin la 0131 no se rompe nada: `sin_servicio`, y el botón sigue abriendo la lista con sus fichas.
 *
 * Solo para las casas de MERCADONA_CASAS (uuids separados por comas): quien dio su consentimiento, hasta tener el
 * visto bueno de Mercadona o de un abogado. Sin esa variable, para nadie.
 */
import { select, insert, update, borrar, rpc, eq } from "./db.js";
import { enviar } from "./telegram.js";
import { avisarFallo } from "./avisar.js";
import { erroresDeLista } from "../../src/lib/mercadonaLista.js";
import { CANAL, ESTADO_CUENTA_MERCADONA, ESTADO_ENCARGO_MERCADONA, FALLO_ENCARGO_MERCADONA, NO_ENCARGADO, paraEscribir } from "../../src/lib/vocabularios.js";
import { enlaceDeLista } from "../../src/lib/mercadonaList.js";
import { NO_EXISTE, PG_SIN_COLUMNA } from "../../src/lib/postgrest.js";
import { LLEGA_HASTA, LLEGA_HASTA_MERCADONA, deUnaCuenta, faltaPara } from "../../src/lib/mercadonaLlegaHasta.js";
import { esSello } from "../../src/lib/mercadonaSello.js";
import { TRAS_LA_LISTA, TRAS_LA_LISTA_OTRO } from "../../src/lib/mercadonaHoraEntrega.js";

const { PENDIENTE, RELLENANDO, ELIGIENDO, HECHO, FALLIDO } = ESTADO_ENCARGO_MERCADONA;

/** Encargos de una casa al día: un uso normal son uno o dos; más, y la cuenta de la familia parece un robot. */
export const TOPE_DIARIO = 10;
/** Sin coger, nadie sigue esperando. El mismo plazo que tomar_encargo_mercadona en la 0131; un test los ata. */
export const CADUCA_PENDIENTE_MIN = 15;
/** Cogido y sin acabar: el trabajador murió. Mayor que su tope por encargo (TOPE_ENCARGO_MS); un test los ata. */
export const CADUCA_RELLENANDO_MIN = 10;
/** Reservar la hora (0134, cabecera): sin elegir, las horas de entrega ya no valen. */
export const CADUCA_ELIGIENDO_MIN = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
/** La sesión sellada: unas decenas de KB como mucho. */
export const TOPE_SESION = 64 * 1024;

const VISIBLES = "id,status,entraron,faltan,fallo,lista_xid,created_at";
/** Lo de reservar que enseñan la app y Lola (0134). El id del pedido en Mercadona, no: es del trabajador. */
const VISIBLES_RESERVA = `${VISIBLES},total,horas_entrega,hora_entrega,cambiable_hasta`;

/** Lo que quien llama ha mandado mal: 400, sin aviso. El resto es fallo nuestro. */
export class PeticionMala extends Error {}

/** La tabla o la función aún no existen: PostgREST o Postgres. Otro fallo, lanza. */
const sinMigracion = (e) => NO_EXISTE.has(e?.codigo);
const conPlanB = (valor) => (e) => {
  if (!sinMigracion(e)) throw e;
  return valor;
};

export function casaPermitida(casa, entorno = process.env.MERCADONA_CASAS) {
  return String(entorno ?? "").split(",").map((c) => c.trim()).includes(casa);
}

const euros = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

/** Lo que Lola le dice al chat al acabar, o null si se pidió desde la app. */
export function avisoDeCierre(fila) {
  if (!fila.chat_id) return null;
  if (fila.status === ELIGIENDO) {
    const total = fila.total == null ? "" : `, ${euros(fila.total)}`;
    return `Ya tienes la compra en tu carro de Mercadona${total}. ¿A qué hora te la llevan?`;
  }
  if (fila.status === FALLIDO && fila.lista_xid) {
    return `Ya tienes la lista en Mercadona, pero ${TRAS_LA_LISTA[fila.fallo] ?? TRAS_LA_LISTA_OTRO}\n${enlaceDeLista(fila.lista_xid)}`;
  }
  if (fila.status === HECHO) {
    const enlace = enlaceDeLista(fila.lista_xid);
    if (fila.entraron === null) return `Ya tienes la lista en Mercadona, pero no he podido comprobar que estén todos.\n${enlace}`;
    const faltan = fila.faltan?.length ?? 0;
    const resto = faltan ? ` ${faltan} no ${faltan === 1 ? "ha entrado" : "han entrado"}: míralo al comprar.` : "";
    return `Ya tienes la lista en Mercadona: ${fila.entraron} productos.${resto}\n${enlace}`;
  }
  if (fila.fallo === FALLO_ENCARGO_MERCADONA.SESION_CADUCADA) {
    return "Mercadona ha cerrado tu sesión. Vuelve a conectar la cuenta desde Compra, en la app, y lo intento otra vez.";
  }
  return "No he podido rellenar la lista en Mercadona. Tienes la compra en la app, con cada producto.";
}

/** El encargo ya está cerrado: que no se entere el chat no lo deshace, pero se cuenta. */
async function avisar(fila) {
  const texto = avisoDeCierre(fila);
  // Solo Telegram por ahora: `enviar` no sabe de otro canal.
  if (!texto || fila.canal !== CANAL.TELEGRAM) return;
  await enviar(fila.chat_id, texto).catch((e) => avisarFallo("mercadona_aviso", e, { grave: false }));
}

/**
 * Cierra lo que lleva demasiado, de una casa o de todas, y avisa: si el trabajador cayó, la casa no se queda sin poder
 * pedir otro ni quien lo pidió por Lola sin saberlo. Devuelve cuántos cerró; sin la 0131, ninguno.
 */
export async function barrerCaducados({ casa = null, ahora = Date.now() } = {}) {
  const cierre = {
    status: paraEscribir("estados_encargo_mercadona", FALLIDO),
    fallo: paraEscribir("fallos_encargo_mercadona", FALLO_ENCARGO_MERCADONA.CADUCADO),
    fallido_at: new Date(ahora).toISOString(),
  };
  const antes = (min) => encodeURIComponent(new Date(ahora - min * 60 * 1000).toISOString());
  const deCasa = casa ? `household_id=${eq(casa)}&` : "";
  try {
    let cerrados = 0;
    // Se avisa tras cada tanda: lo ya cerrado el siguiente barrido no lo ve.
    for (const filtro of [`status=eq.${PENDIENTE}&created_at=lt.${antes(CADUCA_PENDIENTE_MIN)}`, `status=eq.${RELLENANDO}&tomado_at=lt.${antes(CADUCA_RELLENANDO_MIN)}`]) {
      const filas = (await update("mercadona_encargo", `${deCasa}${filtro}`, cierre)) ?? [];
      await Promise.all(filas.map(avisar));
      cerrados += filas.length;
    }
    return cerrados + (await barrerEligiendo(deCasa, cierre, antes));
  } catch (e) {
    return conPlanB(0)(e); // a propósito: sin la 0131 no hay nada que barrer; otro fallo, conPlanB lo relanza
  }
}

/** Sin elegir a tiempo (0134, cabecera): se cierra y suelta sus horas de entrega en el mismo cambio, o la base lo rechaza. */
async function barrerEligiendo(deCasa, cierre, antes) {
  const filas = (await update("mercadona_encargo", `${deCasa}status=eq.${ELIGIENDO}&eligiendo_at=lt.${antes(CADUCA_ELIGIENDO_MIN)}`, { ...cierre, horas_entrega: null })) ?? [];
  await Promise.all(filas.map(avisar));
  return filas.length;
}

/** Las columnas de la 0133 en `mercadona_cuenta`. */
const DE_LA_0133 = ["llega_hasta", "revisada_at", "tiene_direccion", "tiene_pago", "telefono_sellado"];
/** Lo de la cuenta que se enseña (0133): sin la sesión ni el teléfono, solo si lo hay. */
const DE_LA_CUENTA = ["estado", ...DE_LA_0133].join(",");
/** Falta una columna de la 0133 (aún sin aplicar): PostgREST (PGRST204) o Postgres (42703) la nombran. Otra, no. */
const sinLa0133 = (e) => [PG_SIN_COLUMNA, "PGRST204"].includes(e?.codigo) && DE_LA_0133.some((c) => String(e?.message ?? "").includes(c));

/**
 * La cuenta de la casa, o undefined. Sin las columnas de la 0133 (42703 que nombra una de ellas), solo `estado`, y lo
 * registra: el resto sale como una fila de antes, `lista` y sin mirar. Otro fallo, también otra columna que falte, lanza.
 */
async function leerCuenta(casa) {
  try {
    const [cuenta] = await select("mercadona_cuenta", `household_id=${eq(casa)}`, DE_LA_CUENTA);
    return cuenta;
  } catch (e) {
    if (!sinLa0133(e)) throw e;
    console.warn("mercadona: sin la 0133, la cuenta se lee como antes (lista y sin mirar):", e.message);
    const [cuenta] = await select("mercadona_cuenta", `household_id=${eq(casa)}`, "estado"); // a propósito: plan B de la 0133
    return cuenta;
  }
}

/**
 * Cómo está la casa: `{ disponible, cuenta, encargo, llega_hasta, tiene_direccion, tiene_pago, tiene_telefono }`. `cuenta`
 * es su estado o null, nunca la sesión; del teléfono, solo si está.
 */
export async function estadoDeCasa(casa, ahora = Date.now()) {
  const nada = { disponible: false, cuenta: null, encargo: null, ...deUnaCuenta(undefined) };
  if (!casaPermitida(casa)) return nada;
  try {
    await barrerCaducados({ casa, ahora });
    const cuenta = await leerCuenta(casa);
    const [encargo] = await select("mercadona_encargo", `household_id=${eq(casa)}&order=created_at.desc&limit=1`, VISIBLES_RESERVA);
    return { disponible: true, cuenta: cuenta?.estado ?? null, encargo: encargo ?? null, ...deUnaCuenta(cuenta) };
  } catch (e) {
    return conPlanB(nada)(e); // a propósito: sin la 0131, sin servicio; otro fallo, conPlanB lo relanza
  }
}

/**
 * Encola rellenar `lista`. Devuelve `{ encargo, llega_hasta }` (hasta dónde llegará el trabajador) o `{ fallo }`, uno de NO_ENCARGADO.
 * Una lista mal formada lanza: es un fallo de quien llama, no de la familia. De ella solo se guarda lo que se usa.
 */
export async function encargar({ casa, por, canal, chat_id = null, lista }, ahora = Date.now()) {
  const errores = erroresDeLista(lista);
  if (errores.length) throw new PeticionMala(`lista no válida: ${errores.join("; ")}`);
  const estado = await estadoDeCasa(casa, ahora);
  if (!estado.disponible) return { fallo: NO_ENCARGADO.SIN_SERVICIO };
  if (!estado.cuenta) return { fallo: NO_ENCARGADO.SIN_CUENTA };
  if (estado.cuenta === ESTADO_CUENTA_MERCADONA.CADUCADA) return { fallo: NO_ENCARGADO.SESION_CADUCADA };
  const desde = encodeURIComponent(new Date(ahora - DIA_MS).toISOString());
  const hoy = await select("mercadona_encargo", `household_id=${eq(casa)}&created_at=gte.${desde}&limit=${TOPE_DIARIO}`, "id");
  if (hoy.length >= TOPE_DIARIO) return { fallo: NO_ENCARGADO.TOPE };
  const limpia = {
    name: lista.name,
    products: lista.products.map(({ merca_code, quantity }) => ({ merca_code: String(merca_code), quantity })),
  };
  try {
    const [encargo] = await insert("mercadona_encargo", [
      { household_id: casa, created_by: por, canal: paraEscribir("canales_encargo", canal), chat_id, lista: limpia },
    ]);
    return { encargo: { id: encargo.id, status: encargo.status }, llega_hasta: estado.llega_hasta ?? LLEGA_HASTA.LISTA };
  } catch (e) {
    // El índice único: dos toques a la vez. Gana el primero.
    if (e?.codigo === "23505") return { fallo: NO_ENCARGADO.EN_MARCHA };
    throw e;
  }
}

/** Un fallo nuestro en el endpoint: se cuenta, y hacia fuera sale sin detalle. */
export const contarFallo = (e) => avisarFallo("mercadona", e);

/** Guarda la sesión sellada de la casa, y con ella la cuenta vuelve a valer. */
export async function conectar({ casa, por, sesion_cifrada }) {
  const valida = typeof sesion_cifrada === "string" && sesion_cifrada.length <= TOPE_SESION && esSello(sesion_cifrada);
  if (!valida) throw new PeticionMala("sesión no válida");
  await insert("mercadona_cuenta", [{ household_id: casa, conectada_por: por, sesion_cifrada, estado: paraEscribir("estados_cuenta_mercadona", ESTADO_CUENTA_MERCADONA.CONECTADA) }], { upsert: true });
  return { conectada: true };
}

/** Borra la única copia de la sesión. */
export async function desconectar(casa) {
  await borrar("mercadona_cuenta", `household_id=${eq(casa)}`);
  return { conectada: false };
}

/** El trabajador coge el siguiente: `{ encargo, sesion_cifrada }`, o null si no hay nada. */
export async function tomar() {
  const filas = await rpc("tomar_encargo_mercadona", {}).catch(conPlanB([]));
  const encargo = filas?.[0];
  if (!encargo) return null;
  const [cuenta] = await select("mercadona_cuenta", `household_id=${eq(encargo.household_id)}`, "sesion_cifrada");
  if (!cuenta) {
    await cerrar(encargo.id, { fallo: FALLO_ENCARGO_MERCADONA.SIN_CUENTA });
    return null;
  }
  return { encargo: { id: encargo.id, lista: encargo.lista }, sesion_cifrada: cuenta.sesion_cifrada, ...(await hastaDondeDe(encargo.household_id)) };
}

/**
 * Para el trabajador: hasta dónde llega y qué tiene la cuenta (0133), leído como estadoDeCasa. El teléfono sellado no:
 * solo hace falta al reservar.
 */
async function hastaDondeDe(casa) {
  return deUnaCuenta(await leerCuenta(casa));
}

/**
 * Apunta lo que el trabajador vio en la cuenta (0133): `tiene_direccion`, `tiene_pago` y cuándo. Solo la cuenta que
 * sigue conectada: si se ha caducado o la han quitado, no hay nada que apuntar. La 0133 ya está aplicada (9 nov 2026):
 * sin plan B, un fallo lanza.
 */
export async function apuntarRevision(casa, { tiene_direccion, tiene_pago }, cuando) {
  await update("mercadona_cuenta", `household_id=${eq(casa)}&estado=eq.${ESTADO_CUENTA_MERCADONA.CONECTADA}`, { tiene_direccion, tiene_pago, revisada_at: cuando });
}

/**
 * Pura. Lo que se escribe al cerrar de `rellenando` (o un caducado), según lo que trae el trabajador: `{ fallo }` sin
 * lista → fallido; `{ lista_xid, entraron, faltan }` → hecho; con `pedido` (`{ pedido_xid, total, horas_entrega }`) →
 * eligiendo, a elegir la hora; con lista y `fallo` → fallido con la lista (0134).
 */
export function cambiosDeCierre(antes, resultado, cuando) {
  const fallo = Boolean(resultado.fallo);
  const fallido = () => ({
    status: paraEscribir("estados_encargo_mercadona", FALLIDO),
    fallo: paraEscribir("fallos_encargo_mercadona", resultado.fallo),
    fallido_at: cuando,
  });
  if (fallo && !resultado.lista_xid) return fallido();
  const lista = { lista_xid: String(resultado.lista_xid), entraron: resultado.entraron, faltan: resultado.faltan };
  const hecho = { status: paraEscribir("estados_encargo_mercadona", HECHO), ...lista, hecho_at: cuando, fallo: null, fallido_at: null };
  if (fallo) return { ...fallido(), ...lista };
  // Un caducado no vuelve a abrirse para elegir: el hecho tardío solo cierra la lista (0134, trigger).
  if (resultado.pedido && antes.status === RELLENANDO) {
    const { pedido_xid, total, horas_entrega } = resultado.pedido;
    return { status: paraEscribir("estados_encargo_mercadona", ELIGIENDO), ...lista, pedido_xid: String(pedido_xid), total, horas_entrega, eligiendo_at: cuando };
  }
  return hecho;
}

/**
 * El trabajador acaba de rellenar (cambiosDeCierre). Repetirlo no hace nada dos veces: un reintento no
 * pisa el resultado ni avisa otra vez, y por eso la cuenta se marca antes que el encargo: si eso falla, el reintento lo
 * completa. Un `hecho` tardío sí entra sobre un `caducado`: la lista existe y la familia tiene que saberlo.
 * @returns {Promise<boolean>} si lo ha cerrado esta llamada
 */
export async function cerrar(id, resultado, ahora = Date.now()) {
  const cuando = new Date(ahora).toISOString();
  const fallo = resultado.fallo ? paraEscribir("fallos_encargo_mercadona", resultado.fallo) : null;
  const [antes] = await select("mercadona_encargo", `id=${eq(id)}`, "household_id,status,fallo,tomado_at");
  if (!antes) throw new Error("encargo desconocido");
  const caducado = antes.status === FALLIDO && antes.fallo === FALLO_ENCARGO_MERCADONA.CADUCADO;
  if (antes.status !== RELLENANDO && !(caducado && !fallo)) return false;
  if (resultado.revision) await apuntarRevision(antes.household_id, resultado.revision, cuando);

  if (fallo === FALLO_ENCARGO_MERCADONA.SESION_CADUCADA) {
    // Solo la sesión con la que se intentó: si la familia ha reconectado después, la nueva vale.
    const previa = encodeURIComponent(antes.tomado_at);
    await update("mercadona_cuenta", `household_id=${eq(antes.household_id)}&updated_at=lt.${previa}`, {
      estado: paraEscribir("estados_cuenta_mercadona", ESTADO_CUENTA_MERCADONA.CADUCADA),
    });
  }
  const [fila] = await update("mercadona_encargo", `id=${eq(id)}&status=eq.${antes.status}`, cambiosDeCierre(antes, resultado, cuando));
  if (!fila) return false;
  await avisar(fila);
  return true;
}

/**
 * Cambia hasta dónde llega el bot (0133), el mismo dato para la app (api/mercadona.js) y Lola. Bajar siempre se puede;
 * subir, solo si la cuenta tiene lo que pide el paso (faltaPara). Devuelve `{ llega_hasta }`, `{ falta }` (FALTAS_MERCADONA)
 * o `{ fallo }` (NO_ENCARGADO).
 */
export async function cambiarLlegaHasta({ casa, llega_hasta }, ahora = Date.now()) {
  if (!LLEGA_HASTA_MERCADONA.includes(llega_hasta)) throw new PeticionMala(`llega_hasta no válido: ${llega_hasta}`);
  const estado = await estadoDeCasa(casa, ahora);
  if (!estado.disponible) return { fallo: NO_ENCARGADO.SIN_SERVICIO };
  if (!estado.cuenta) return { fallo: NO_ENCARGADO.SIN_CUENTA };
  const falta = faltaPara(estado, llega_hasta);
  if (falta.length) return { falta };
  const filas = await update("mercadona_cuenta", `household_id=${eq(casa)}`, { llega_hasta: paraEscribir("llega_hasta_mercadona", llega_hasta) });
  if (!filas?.length) return { fallo: NO_ENCARGADO.SIN_CUENTA }; // se desconectó entre medias
  return { llega_hasta };
}

/**
 * Guarda el teléfono del pedido, ya sellado (src/lib/mercadonaTelefono.js): aquí nunca llega en claro. Devuelve
 * `{ guardado: true }` o `{ fallo }` (NO_ENCARGADO).
 */
export async function guardarTelefono({ casa, telefono_sellado }) {
  const valido = typeof telefono_sellado === "string" && telefono_sellado.length <= TOPE_SESION && esSello(telefono_sellado);
  if (!valido) throw new PeticionMala("teléfono no sellado");
  if (!casaPermitida(casa)) return { fallo: NO_ENCARGADO.SIN_SERVICIO };
  const filas = await update("mercadona_cuenta", `household_id=${eq(casa)}`, { telefono_sellado });
  return filas?.length ? { guardado: true } : { fallo: NO_ENCARGADO.SIN_CUENTA };
}
