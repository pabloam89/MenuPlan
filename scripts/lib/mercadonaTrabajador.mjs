/**
 * El trabajador de Comprar: coge un encargo, abre la sesión sellada en un navegador limpio, crea la lista y cuenta qué
 * pasó (0131, skill `mercadona`). Aquí la lógica; el navegador y la API se le pasan, para probarla sin ninguno de los
 * dos y para cambiar de navegador sin tocarla.
 *
 * Nunca se imprime la sesión, ni se guarda en disco: vive en memoria lo que dura un encargo.
 */
import { erroresDeLista } from "./mercadonaLista.mjs";
import { crearLista, entrarEnTienda } from "./mercadonaPagina.mjs";
import { FALLO_ENCARGO_MERCADONA as FALLO } from "../../src/lib/mercadonaFallos.js";

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

async function trabajar(pagina, lista) {
  const portada = await entrarEnTienda(pagina);
  if (portada.resultado) return resultadoDeEncargo(portada);
  return resultadoDeEncargo(await crearLista(pagina, lista));
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
 * @param {{ encargo: { id: string, lista: object }, sesion_cifrada: string }} siguiente
 * @param {{ abrirSesion: (sello: string) => Promise<string>, abrirNavegador: (estado: object) => Promise<{ pagina: object, cerrar: () => Promise<void> }> }} d
 */
export async function atender({ encargo, sesion_cifrada }, { abrirSesion, abrirNavegador, log = () => {}, topeMs = TOPE_ENCARGO_MS }) {
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
    return await conTope(trabajar(pagina, encargo.lista), topeMs);
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
  const siguiente = await api.tomar();
  if (!siguiente) return false;
  const { id } = siguiente.encargo;
  let resultado;
  try {
    resultado = await atender(siguiente, { ...navegador, log });
  } catch (e) {
    log(`encargo ${id}: ${e.name}`);
    resultado = { fallo: FALLO.ERROR };
  }
  log(`encargo ${id}: ${resultado.fallo ?? "hecho"}`);
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
