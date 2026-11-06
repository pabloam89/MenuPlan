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
import { erroresDeLista } from "../../scripts/lib/mercadonaLista.mjs";
import { CANAL, ESTADO_CUENTA_MERCADONA, ESTADO_ENCARGO_MERCADONA, FALLO_ENCARGO_MERCADONA, paraEscribir } from "../../src/lib/vocabularios.js";
import { enlaceDeLista } from "../../src/lib/mercadonaList.js";
import { NO_EXISTE } from "../../src/lib/postgrest.js";

const { PENDIENTE, RELLENANDO, HECHO, FALLIDO } = ESTADO_ENCARGO_MERCADONA;

/** Por qué no se ha encolado: lo que la app y Lola tienen que explicar. */
export const NO_ENCARGADO = Object.freeze({
  SIN_SERVICIO: "sin_servicio",
  SIN_CUENTA: FALLO_ENCARGO_MERCADONA.SIN_CUENTA,
  SESION_CADUCADA: FALLO_ENCARGO_MERCADONA.SESION_CADUCADA,
  EN_MARCHA: "en_marcha",
  TOPE: "tope",
});

/** Encargos de una casa al día: un uso normal son uno o dos; más, y la cuenta de la familia parece un robot. */
export const TOPE_DIARIO = 10;
/** Sin coger, nadie sigue esperando. El mismo plazo que tomar_encargo_mercadona en la 0131; un test los ata. */
export const CADUCA_PENDIENTE_MIN = 15;
/** Cogido y sin acabar: el trabajador murió. */
export const CADUCA_RELLENANDO_MIN = 10;
const DIA_MS = 24 * 60 * 60 * 1000;
/** La sesión sellada: unas decenas de KB como mucho. */
export const TOPE_SESION = 64 * 1024;

const VISIBLES = "id,status,entraron,faltan,fallo,lista_xid,created_at";

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

/** Lo que Lola le dice al chat al acabar, o null si se pidió desde la app. */
export function avisoDeCierre(fila) {
  if (!fila.chat_id) return null;
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
    return cerrados;
  } catch (e) {
    return conPlanB(0)(e); // a propósito: sin la 0131 no hay nada que barrer; otro fallo, conPlanB lo relanza
  }
}

/** Cómo está la casa: `{ disponible, cuenta, encargo }`; `cuenta` es su estado o null, nunca la sesión. */
export async function estadoDeCasa(casa, ahora = Date.now()) {
  const nada = { disponible: false, cuenta: null, encargo: null };
  if (!casaPermitida(casa)) return nada;
  try {
    await barrerCaducados({ casa, ahora });
    const [cuenta] = await select("mercadona_cuenta", `household_id=${eq(casa)}`, "estado");
    const [encargo] = await select("mercadona_encargo", `household_id=${eq(casa)}&order=created_at.desc&limit=1`, VISIBLES);
    return { disponible: true, cuenta: cuenta?.estado ?? null, encargo: encargo ?? null };
  } catch (e) {
    return conPlanB(nada)(e); // a propósito: sin la 0131, sin servicio; otro fallo, conPlanB lo relanza
  }
}

/**
 * Encola rellenar `lista`. Devuelve `{ encargo }` o `{ fallo }`, uno de NO_ENCARGADO.
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
    return { encargo: { id: encargo.id, status: encargo.status } };
  } catch (e) {
    // El índice único: dos toques a la vez. Gana el primero.
    if (e?.codigo === "23505") return { fallo: NO_ENCARGADO.EN_MARCHA };
    throw e;
  }
}

/** Un fallo nuestro en el endpoint: se cuenta, y hacia fuera sale sin detalle. */
export const contarFallo = (e) => avisarFallo("mercadona", e);

/** Solo un sello: nunca una sesión en claro, ni por un fallo de la app (sellar, src/lib/mercadonaSello.js). */
function esSello(texto) {
  if (typeof texto !== "string" || !texto || texto.length > TOPE_SESION) return false;
  try {
    const { v, k, iv, c, ...resto } = JSON.parse(texto);
    return Number.isInteger(v) && [k, iv, c].every((x) => typeof x === "string" && x) && Object.keys(resto).length === 0;
  } catch {
    return false; // a propósito: lo que no es JSON no es un sello, y conectar lo rechaza
  }
}

/** Guarda la sesión sellada de la casa, y con ella la cuenta vuelve a valer. */
export async function conectar({ casa, por, sesion_cifrada }) {
  if (!esSello(sesion_cifrada)) throw new PeticionMala("sesión no válida");
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
  return { encargo: { id: encargo.id, lista: encargo.lista }, sesion_cifrada: cuenta.sesion_cifrada };
}

/**
 * El trabajador acaba: `{ lista_xid, entraron, faltan }` o `{ fallo }`. Repetirlo no hace nada dos veces: un reintento
 * no pisa el resultado ni avisa otra vez, y por eso la cuenta se marca antes que el encargo: si eso falla, el reintento
 * lo completa. Un `hecho` tardío sí entra sobre un `caducado`: la lista existe y la familia tiene que saberlo.
 * @returns {Promise<boolean>} si lo ha cerrado esta llamada
 */
export async function cerrar(id, resultado, ahora = Date.now()) {
  const cuando = new Date(ahora).toISOString();
  const fallo = resultado.fallo ? paraEscribir("fallos_encargo_mercadona", resultado.fallo) : null;
  const [antes] = await select("mercadona_encargo", `id=${eq(id)}`, "household_id,status,fallo,tomado_at");
  if (!antes) throw new Error("encargo desconocido");
  const caducado = antes.status === FALLIDO && antes.fallo === FALLO_ENCARGO_MERCADONA.CADUCADO;
  if (antes.status !== RELLENANDO && !(caducado && !fallo)) return false;

  if (fallo === FALLO_ENCARGO_MERCADONA.SESION_CADUCADA) {
    // Solo la sesión con la que se intentó: si la familia ha reconectado después, la nueva vale.
    const previa = encodeURIComponent(antes.tomado_at);
    await update("mercadona_cuenta", `household_id=${eq(antes.household_id)}&updated_at=lt.${previa}`, {
      estado: paraEscribir("estados_cuenta_mercadona", ESTADO_CUENTA_MERCADONA.CADUCADA),
    });
  }
  const cambios = fallo
    ? { status: paraEscribir("estados_encargo_mercadona", FALLIDO), fallo: paraEscribir("fallos_encargo_mercadona", fallo), fallido_at: cuando }
    : {
        status: paraEscribir("estados_encargo_mercadona", HECHO),
        lista_xid: String(resultado.lista_xid),
        entraron: resultado.entraron,
        faltan: resultado.faltan,
        hecho_at: cuando,
        fallo: null,
        fallido_at: null,
      };
  const [fila] = await update("mercadona_encargo", `id=${eq(id)}&status=eq.${antes.status}`, cambios);
  if (!fila) return false;
  await avisar(fila);
  return true;
}
