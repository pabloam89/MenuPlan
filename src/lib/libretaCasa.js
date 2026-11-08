/**
 * La libreta de la casa en la app (trozo 14 de #1037): se lee de sus filas de preferencia (preferencias_de_casa,
 * 0109) y lo que cambia se guarda por api/operacion.js (escribir_preferencias, la misma tubería y puerta que Lola),
 * no en household_state. Ni la libreta ni lo que proyecta al motor (CLAVES_DE_LA_LIBRETA) van al documento.
 *
 * Con la 0109 aplicada (2 nov 2026), las preferencias se leen siempre de sus filas: si la base no tiene
 * preferencias_de_casa, o no se pueden leer, la casa no se carga (cargaSinSeguir), en vez de seguir sin ellas.
 */
import { supabase } from "./supabase.js";
import { esSinFuncion } from "./postgrest.js";
import { guardarConVersion } from "./versionCasa.js";
import { enviarOperacion, colaEnOrden, conVersionDeFamilia, MODO_FAMILIA } from "./familiaCasa.js";
import { conLibretaDeFilas, sinLibreta, cambiosDePreferencias, CLAVES_EN_PREFERENCIAS } from "./libretaEnData.js";
import { PreferenciaInvalida } from "./preferencias.js";
import { RPC_LEER_PREFERENCIAS } from "./operaciones/tuberia.js";

/** De dónde sale la libreta en esta carga: siempre de sus filas (FILAS). Los mismos modos que la familia. */
export const MODO_LIBRETA = MODO_FAMILIA;

/** La pantalla (la `ref` de la operación) y la acción de un cambio de la libreta desde la app. */
export const REF_LIBRETA = "libreta";
export const ACCION_LIBRETA = "guardar_libreta";

/**
 * Las preferencias de una casa. `{ modo: FILAS, filas }`, o `{ error: true }` si no se pudieron leer (sin red, sin
 * la RPC o sin la forma v1): no es una casa sin preferencias.
 */
export async function leerLibretaDeCasa(casa, cliente = supabase) {
  if (!cliente) return { error: true };
  const { data, error } = await cliente.rpc(RPC_LEER_PREFERENCIAS, { p_casa: casa });
  if (error || data?.v !== 1 || !Array.isArray(data.preferencias)) {
    console.warn("[libretaCasa] lectura", esSinFuncion(error) ? "sin preferencias_de_casa (0109)" : error?.code ?? "sin el contrato v1");
    return { error: true };
  }
  return { modo: MODO_LIBRETA.FILAS, filas: data.preferencias };
}

/** Pura. Los datos de la casa con la libreta de sus filas (y su proyección) en vez de la del documento; sin casa (`carga` null), tal cual. */
export function conLibretaLeida(data, carga) {
  if (!carga || !data) return data;
  if (carga.modo !== MODO_LIBRETA.FILAS) throw new Error("conLibretaLeida: una carga sin filas no sigue (cargaSinSeguir)");
  return conLibretaDeFilas(data, carga.filas);
}

/** Pura. Lo que va al documento: sin la libreta ni su proyección, que viven en sus filas; sin casa (`carga` null), tal cual. */
export function sinLibretaLeida(datos, carga) {
  if (!carga) return datos;
  if (carga.modo !== MODO_LIBRETA.FILAS) throw new Error("sinLibretaLeida: una carga sin filas no se guarda (cargaSinSeguir)");
  return sinLibreta(datos);
}

/** Un cambio de la libreta a api/operacion.js (enviarOperacion, el mismo envío que la familia). */
export const enviarPreferencias = ({ casa, preferencias }, opciones) => enviarOperacion(
  { casa, accion: ACCION_LIBRETA, ref_id: REF_LIBRETA, preferencias }, { etiqueta: "libretaCasa", ...opciones });

/** Lo de `data` que vive en filas de preferencia (CLAVES_EN_PREFERENCIAS), lo que se compara al guardar. */
const enPreferencias = (data) => Object.fromEntries(CLAVES_EN_PREFERENCIAS.filter((k) => data?.[k] !== undefined).map((k) => [k, data[k]]));

/**
 * Las preferencias de una casa tal como la conoce la app: las leídas (`conocida`, los datos de conLibretaLeida) y, tras
 * cada guardado que entra, las guardadas, con sus filas (`carga.filas`; de ellas, el id de lo que cambia). `guardar(datos)` manda lo que cambió (cambiosDePreferencias), uno tras
 * otro; tras un guardado que entra, vuelve a leer las filas (`releer`) para tener el id de lo recién creado (si no
 * puede, `conflict`: App.jsx recarga la casa en vez de seguir con filas viejas). Un
 * apunte o una regla que no cabe en una fila (PreferenciaInvalida) no se manda y vuelve como `{ ok: false, error }`.
 */
export function libretaDeCasa({ casa, carga, conocida: leida, enviar = enviarPreferencias, releer = leerLibretaDeCasa }) {
  let filas = carga.filas;
  let conocida = enPreferencias(leida);
  const encolar = colaEnOrden();
  const guardar = (datos) => encolar(async () => {
    const nueva = enPreferencias(datos);
    if (!Object.keys(nueva).length) return { ok: true, enviado: false };
    let preferencias;
    try {
      preferencias = cambiosDePreferencias({ ...conocida, groups: datos?.groups, members: datos?.members }, datos, filas);
    } catch (e) {
      if (!(e instanceof PreferenciaInvalida)) throw e;
      return { ok: false, enviado: false, error: e.message };
    }
    if (!preferencias.length) return { ok: true, enviado: false };
    const r = await enviar({ casa, preferencias });
    if (!r.ok) return { ...r, enviado: true };
    conocida = { ...conocida, ...nueva };
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
