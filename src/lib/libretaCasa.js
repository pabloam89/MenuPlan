/**
 * La libreta de la casa en la app (trozo 14 de #1037): se lee de sus filas de preferencia (preferencias_de_casa,
 * 0109) y lo que cambia se guarda por api/operacion.js (escribir_preferencias, la misma tubería y puerta que Lola),
 * no en household_state. Ni la libreta ni lo que proyecta al motor (CLAVES_DE_LA_LIBRETA) van al documento.
 *
 * Plan B mientras la 0109 no esté aplicada (la rama se despliega antes): si la base no tiene preferencias_de_casa,
 * la libreta sigue en el documento como hasta ahora. Se decide en cada carga de la casa; nunca en los dos sitios.
 */
import { supabase } from "./supabase.js";
import { esSinFuncion } from "./postgrest.js";
import { guardarConVersion } from "./versionCasa.js";
import { enviarOperacion, colaEnOrden, conVersionDeFamilia, MODO_FAMILIA } from "./familiaCasa.js";
import { conLibretaDeFilas, sinLibreta } from "./libretaEnData.js";
import { cambiosDeLibreta, PreferenciaInvalida } from "./preferencias.js";
import { RPC_LEER_PREFERENCIAS } from "./operaciones/tuberia.js";

/** De dónde sale la libreta en esta carga: de sus filas, o del documento (base sin la 0109). Los mismos modos que la familia. */
export const MODO_LIBRETA = MODO_FAMILIA;

/** La pantalla de la que sale un cambio de la libreta (la `ref` de la operación). */
export const REF_LIBRETA = "libreta";

/** La acción de la operación de un cambio de la libreta desde la app. */
export const ACCION_LIBRETA = "guardar_libreta";

/**
 * Las preferencias de una casa. `{ modo: FILAS, filas }`; `{ modo: DOCUMENTO }` si la base aún no tiene la RPC; o
 * `{ error: true }` si no se pudieron leer (sin red, o sin la forma v1): no es una casa sin preferencias.
 * @param {string} casa
 */
export async function leerLibretaDeCasa(casa, cliente = supabase) {
  if (!cliente) return { error: true };
  const { data, error } = await cliente.rpc(RPC_LEER_PREFERENCIAS, { p_casa: casa });
  if (esSinFuncion(error)) return { modo: MODO_LIBRETA.DOCUMENTO };
  if (error || data?.v !== 1 || !Array.isArray(data.preferencias)) {
    console.warn("[libretaCasa] lectura", error?.code ?? "sin el contrato v1");
    return { error: true };
  }
  return { modo: MODO_LIBRETA.FILAS, filas: data.preferencias };
}

/** Pura. Los datos de la casa con la libreta de sus filas (y su proyección) en vez de la del documento. */
export function conLibretaLeida(data, carga) {
  if (carga?.modo !== MODO_LIBRETA.FILAS || !data) return data;
  return conLibretaDeFilas(data, carga.filas);
}

/** Pura. Lo que va al documento: sin la libreta ni su proyección cuando viven en sus filas. */
export function sinLibretaLeida(datos, carga) {
  return carga?.modo === MODO_LIBRETA.FILAS ? sinLibreta(datos) : datos;
}

/** Un cambio de la libreta a api/operacion.js (enviarOperacion, el mismo envío que la familia). */
export const enviarPreferencias = ({ casa, preferencias }, opciones) => enviarOperacion(
  { casa, accion: ACCION_LIBRETA, ref_id: REF_LIBRETA, preferencias }, { etiqueta: "libretaCasa", ...opciones });

/**
 * La libreta de una casa tal como la conoce la app: la leída (`libreta`, la de conLibretaLeida) y, tras cada
 * guardado que entra, la guardada, con sus filas (`carga.filas`; de ellas, el id de lo que cambia). `guardar(datos)` manda lo que cambió (cambiosDeLibreta), uno tras
 * otro; tras un guardado que entra, vuelve a leer las filas (`releer`) para tener el id de lo recién creado (si no
 * puede, `conflict`: App.jsx recarga la casa en vez de seguir con filas viejas). Un
 * apunte que no cabe en una fila (PreferenciaInvalida) no se manda y vuelve como `{ ok: false, error }`.
 */
export function libretaDeCasa({ casa, carga, libreta, enviar = enviarPreferencias, releer = leerLibretaDeCasa }) {
  let filas = carga.filas;
  let conocida = libreta;
  const encolar = colaEnOrden();
  const guardar = (datos) => encolar(async () => {
    const nueva = datos?.notepad;
    if (nueva === undefined) return { ok: true, enviado: false };
    let preferencias;
    try {
      preferencias = cambiosDeLibreta(conocida, nueva, filas, { grupos: datos?.groups ?? [] });
    } catch (e) {
      if (!(e instanceof PreferenciaInvalida)) throw e;
      return { ok: false, enviado: false, error: e.message };
    }
    if (!preferencias.length) return { ok: true, enviado: false };
    const r = await enviar({ casa, preferencias });
    if (!r.ok) return { ...r, enviado: true };
    conocida = nueva;
    const leida = await releer(casa);
    // Sin poder releerlas, las filas de aquí ya no valen (no tienen el id de lo recién creado): a recargar la casa.
    if (leida?.modo !== MODO_LIBRETA.FILAS) return { ...r, enviado: true, conflict: true };
    filas = leida.filas;
    return { ...r, enviado: true };
  });
  return { casa, guardar };
}

/**
 * El guardado de la libreta como tarea de la cola de la casa (guardarConVersion), detrás de la familia: un apunte
 * de un grupo nuevo necesita su fila. escribir_preferencias sube bot_rev: si deja la siguiente a la conocida se
 * apunta; si no, otro escribió entretanto y `conflict`, para recargar (conVersionDeFamilia). Sin filas, nada.
 */
export function guardarLibretaEnCola({ version, libreta, datos, enCola = guardarConVersion }) {
  if (!libreta?.guardada) return Promise.resolve({ ok: true, enviado: false });
  return enCola(version, conVersionDeFamilia(() => libreta.guardada.guardar(datos)));
}
