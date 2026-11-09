/**
 * El trabajador de Comprar: coge un encargo, abre la sesión sellada en un navegador limpio, crea la lista y, si la casa
 * ha encendido «Reservar» o «Pagar» (`llega_hasta`, trozo 15 de #1407), la suma al carro, crea el pedido y ofrece las
 * horas de entrega libres; y cuenta qué pasó (0131, skill `mercadona`). Luego, con la hora elegida, la reserva (0134). Aquí la lógica; el navegador y la API se le pasan, para probarla sin ninguno de los
 * dos y para cambiar de navegador sin tocarla.
 *
 * Nunca se imprime la sesión, ni se guarda en disco: vive en memoria lo que dura un encargo.
 */
import { erroresDeLista } from "../../src/lib/mercadonaLista.js";
import { crearLista, entrarEnTienda, llenarCarro, revisarCuenta } from "./mercadonaPagina.mjs";
import { LLEGA_HASTA, llegaA } from "../../src/lib/mercadonaLlegaHasta.js";
import { FALLO_ENCARGO_MERCADONA as FALLO } from "../../src/lib/mercadonaFallos.js";
import { pedirHorasEntrega, reservarHoraEntrega } from "./mercadonaPedido.mjs";

/** Lo que se permite por encargo: pasado esto, lo da por fallido y sigue. Menor que CADUCA_RELLENANDO_MIN; un test los ata. */
export const TOPE_ENCARGO_MS = 5 * 60 * 1000;
const INTENTOS_CIERRE = 3;
const ENTRE_CIERRES_MS = 5000;

/** Lo que el trabajador le cuenta a la API por cada resultado del navegador. Ninguno se queda sin cerrar. */
export function resultadoDeEncargo(r) {
  if (r.resultado === "productos_completos" || r.resultado === "faltan_productos") {
    return { lista_xid: String(r.id), entraron: r.entraron, faltan: r.faltan };
  }
  // La lista está, pero no se pudo releer: decir «falló» haría que la familia pidiese otra.
  if (r.resultado === "lista_sin_releer") return { lista_xid: String(r.id), entraron: null, faltan: null };
  if (r.resultado === "bloqueado_portada") return { fallo: FALLO.BLOQUEADO };
  if (r.resultado === "sin_sesion" || r.resultado === "fallo_sesion") return { fallo: FALLO.SESION_CADUCADA };
  if (r.resultado === "fallo_crear") {
    if (r.status === 401) return { fallo: FALLO.SESION_CADUCADA };
    return { fallo: r.status === 403 || r.status === 429 ? FALLO.BLOQUEADO : FALLO.ERROR };
  }
  return { fallo: FALLO.ERROR };
}

/**
 * Cómo fue el carro: `{ lleno, total, faltan }` o `{ lleno: false, motivo }`, para el log. Un carro que falla no tumba la
 * lista, que ya está: el cierre lleva la lista y el fallo (falloDeCarro), y el servidor guarda las dos cosas (0134).
 */
export function resultadoDeCarro(c) {
  if (c.resultado === "carro_lleno") return { lleno: true, total: c.total, faltan: c.faltan };
  const motivo = c.resultado === "fallo_sesion" || c.status === 401 ? "sesion" : c.status === 403 || c.status === 429 ? "bloqueado" : "error";
  return { lleno: false, motivo };
}

/** Pura. El motivo de un carro que no se llenó, en el vocabulario de los fallos. */
const FALLO_DE_CARRO = Object.freeze({ sesion: FALLO.SESION_CADUCADA, bloqueado: FALLO.BLOQUEADO, error: FALLO.ERROR });
export const falloDeCarro = (c) => FALLO_DE_CARRO[c.motivo] ?? FALLO.ERROR;

/**
 * Ya dentro: mira la cuenta y rellena la lista. La revisión va con el cierre (`revision`) si se pudo mirar; si no, se
 * dice en el log y el encargo sigue: no saber si hay dirección no impide rellenar la lista (trozo 16).
 */
async function hastaLaLista(pagina, lista, log) {
  const portada = await entrarEnTienda(pagina);
  if (portada.resultado) return resultadoDeEncargo(portada);
  const revision = await revisarCuenta(pagina);
  if (revision.fallo) log(`revisión sin hacer: ${revision.fallo} ${revision.error ?? revision.status}`);
  const cierre = resultadoDeEncargo(await crearLista(pagina, lista));
  return revision.fallo ? cierre : { ...cierre, revision };
}

/**
 * El carro y, lleno, el pedido con sus horas libres (trozo 23), con lo que quede del tope del encargo (`quedaMs`): lista,
 * carro y pedido juntos nunca pasan de TOPE_ENCARGO_MS. Devuelve lo que se suma al cierre de la lista: `{ carro, pedido }`
 * o `{ carro, fallo }`. Lo que lance aquí, o se pase de tiempo, es un fallo con la lista: no llega a `unaVuelta`, que
 * cerraría el encargo como `error` y perdería el `lista_xid` de una lista que ya está.
 */
async function alCarro(pagina, lista, quedaMs, log) {
  let carro = { lleno: false, motivo: "error" };
  try {
    return await conTope(
      (async () => {
        const lleno = await llenarCarro(pagina, lista);
        carro = resultadoDeCarro(lleno);
        if (!carro.lleno) return { carro, fallo: falloDeCarro(carro) };
        return { carro, ...(await pedirHorasEntrega(pagina, lleno.carro)) };
      })(),
      quedaMs,
    );
  } catch (e) {
    log(`carro: ${e.name}`);
    return { carro, fallo: FALLO.ERROR };
  }
}

function conTope(promesa, ms) {
  let t;
  const tope = new Promise((_, rechazar) => {
    t = setTimeout(() => rechazar(new Error("tope del encargo")), ms);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(t));
}

/**
 * Atiende un encargo y devuelve lo que hay que cerrar.
 * @param {{ encargo: { id: string, lista: object }, sesion_cifrada: string, llega_hasta?: string }} siguiente  sin `llega_hasta`, solo la lista
 * @param {{ abrirSesion: (sello: string) => Promise<string>, abrirNavegador: (estado: object) => Promise<{ pagina: object, cerrar: () => Promise<void> }> }} d
 */
export async function atender({ encargo, sesion_cifrada, llega_hasta }, { abrirSesion, abrirNavegador, log = () => {}, topeMs = TOPE_ENCARGO_MS, ahora = Date.now }) {
  if (erroresDeLista(encargo.lista).length) return { fallo: FALLO.LISTA_NO_VALIDA };
  let estado;
  try {
    estado = JSON.parse(await abrirSesion(sesion_cifrada));
  } catch (e) {
    // Sellada con otra clave, o tocada: la familia tiene que volver a conectar. Y queda escrito: si salen muchos, la
    // clave del servidor está mal. Solo el nombre del error: el mensaje podría traer la sesión.
    log(`sesión sin abrir: ${e.name}`);
    return { fallo: FALLO.SESION_CADUCADA };
  }
  const { pagina, cerrar } = await abrirNavegador(estado);
  try {
    const fin = ahora() + topeMs;
    const hecho = await conTope(hastaLaLista(pagina, encargo.lista, log), topeMs);
    // Sin la lista no se toca el carro; y solo si la casa ha encendido «Reservar» o «Pagar».
    if (hecho.fallo || !llegaA(llega_hasta, LLEGA_HASTA.RESERVAR)) return hecho;
    return { ...hecho, ...(await alCarro(pagina, encargo.lista, Math.max(0, fin - ahora()), log)) };
  } finally {
    await cerrar();
  }
}

/**
 * Atiende una reserva (0134): la hora que eligió la persona, en el pedido que ya está a medias en Mercadona, y el
 * teléfono que pide el repartidor, abierto del sello con la misma clave que la sesión. `{ cambiable_hasta }` o `{ fallo }`.
 * @param {{ reserva: { id: string, pedido_xid: string, hora de entrega: object }, sesion_cifrada: string, telefono_sellado: string|null }} siguiente
 */
export async function atenderReserva({ reserva, sesion_cifrada, telefono_sellado }, { abrirSesion, abrirNavegador, log = () => {}, topeMs = TOPE_ENCARGO_MS }) {
  let estado;
  try {
    estado = JSON.parse(await abrirSesion(sesion_cifrada));
  } catch (e) {
    log(`sesión sin abrir: ${e.name}`); // solo el nombre: el mensaje podría traer la sesión
    return { fallo: FALLO.SESION_CADUCADA };
  }
  let telefono = null;
  if (telefono_sellado) {
    try {
      telefono = JSON.parse(await abrirSesion(telefono_sellado));
    } catch (e) {
      // Sin teléfono se reserva igual: Mercadona lo pide al pagar, y la persona lo pone allí.
      log(`teléfono sin abrir: ${e.name}`);
    }
  }
  const { pagina, cerrar } = await abrirNavegador(estado);
  try {
    return await conTope(
      (async () => {
        const portada = await entrarEnTienda(pagina);
        if (portada.resultado) return resultadoDeEncargo(portada);
        return reservarHoraEntrega(pagina, { pedido_xid: reserva.pedido_xid, hora_entrega: reserva.hora_entrega, telefono }, log);
      })(),
      topeMs,
    );
  } finally {
    await cerrar();
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera tras `fallos` seguidos contra la API: de `base` hasta `tope`, para no insistir contra un servicio caído. */
export const esperaTrasFallos = (fallos, base, tope) => Math.min(tope, base * 2 ** fallos);

/**
 * Una vuelta: toma, atiende y cierra. Devuelve true si había trabajo.
 * Lo que falle atendiendo se cierra como `error`: un encargo nunca se queda en marcha por un fallo nuestro.
 * @param {{ api: { tomar: () => Promise<object|null>, cerrar: (id: string, r: object) => Promise<void> }, log: (texto: string) => void }} d
 */
export async function unaVuelta({ api, log, dormir = esperar, entreCierresMs = ENTRE_CIERRES_MS, ...navegador }) {
  // Primero las reservas: la persona espera mirando el chat, y la hora elegida se puede ocupar.
  const reserva = api.tomarReserva ? await api.tomarReserva() : null;
  const siguiente = reserva ?? (await api.tomar());
  if (!siguiente) return false;
  const id = reserva ? reserva.reserva.id : siguiente.encargo.id;
  let resultado;
  try {
    resultado = reserva ? await atenderReserva(reserva, { ...navegador, log }) : await atender(siguiente, { ...navegador, log });
  } catch (e) {
    log(`encargo ${id}: ${e.name}`);
    resultado = { fallo: FALLO.ERROR };
  }
  // El carro aún no se guarda (la API lo ignora hasta el trozo 22): que al menos un carro que falla se vea en el log.
  const c = resultado.carro;
  const carro = !c ? "" : !c.lleno ? `, carro sin llenar: ${c.motivo}` : c.faltan?.length ? `, carro lleno salvo ${c.faltan.length}` : ", carro lleno";
  log(`encargo ${id}: ${resultado.fallo ?? "hecho"}${carro}`);
  // Una lista ya creada no se pierde por un corte: cerrar se puede repetir sin hacer nada dos veces.
  for (let intento = 1; ; intento++) {
    try {
      await api.cerrar(id, resultado);
      return true;
    } catch (e) {
      if (intento >= INTENTOS_CIERRE) throw e;
      await dormir(entreCierresMs);
    }
  }
}
