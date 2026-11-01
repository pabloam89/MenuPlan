/**
 * La familia de la casa en la app (trozo 10 de #1037): se lee de sus filas (personas_de_casa, 0108) y se guarda
 * por api/operacion.js (escribir_persona, la misma tubería y puerta que Lola), no en household_state.
 *
 * Plan B mientras la 0108 no esté aplicada (la rama se despliega antes que la migración): si la base no tiene
 * personas_de_casa, la app sigue como hasta ahora (la familia va en el documento y la copia a sus filas el
 * trigger 0089). Se decide en cada carga de la casa; la misma 0108 que crea la RPC quita el trigger.
 */
import { supabase } from "./supabase.js";
import { apiUrl } from "./apiUrl.js";
import * as ids from "./ids.js";
import { FALLO_DATO } from "./vocabularios.js";
import { esSinFuncion } from "./postgrest.js";
import { guardarConVersion } from "./versionCasa.js";
import { membersDeFilas, cambiosDePersonas, conOrdenDeTodos, textosDeAvisos, FamiliaSinLeer, RPC_FAMILIA, revSiguiente } from "./personas.js";

/** De dónde sale la familia en esta carga: de sus filas, o del documento (base sin la 0108). */
export const MODO_FAMILIA = Object.freeze({ FILAS: "filas", DOCUMENTO: "documento" });

/** La pantalla de la que sale un cambio de la familia (la `ref` de la operación). */
export const REF_FAMILIA = "familia";

/**
 * La familia de una casa. `{ modo: FILAS, familia }`; `{ modo: DOCUMENTO }` si la base aún no tiene la RPC; o
 * `{ error: true }` si no se pudo leer (sin red, o una respuesta sin la forma esperada): no es una casa sin nadie.
 * @param {string} casa
 */
export async function leerFamiliaDeCasa(casa, cliente = supabase) {
  if (!cliente) return { error: true };
  const { data, error } = await cliente.rpc(RPC_FAMILIA, { p_casa: casa });
  // La función no existe: base sin la 0108.
  if (esSinFuncion(error)) return { modo: MODO_FAMILIA.DOCUMENTO };
  try {
    if (error) throw new FamiliaSinLeer(error.code ?? null);
    return { modo: MODO_FAMILIA.FILAS, familia: membersDeFilas(data) };
  } catch (e) {
    if (!(e instanceof FamiliaSinLeer)) throw e;
    console.warn("[familiaCasa] lectura", e.message);
    return { error: true };
  }
}

/**
 * Pura. Los datos de la casa con la familia de sus filas en vez de la del documento. Sin cambio si no se leyó de
 * ahí; una casa sin fila de documento ni personas sigue sin datos (no es una casa que adoptar).
 */
export function conFamiliaLeida(data, carga) {
  if (carga?.modo !== MODO_FAMILIA.FILAS) return data;
  if (!data && !carga.familia.members.length) return data;
  return { ...(data ?? {}), ...carga.familia };
}

/** Pura. Lo que va al documento: sin `members` ni `groups` cuando la familia vive en sus filas. */
export function sinFamilia(datos, modo) {
  if (modo !== MODO_FAMILIA.FILAS) return datos;
  const { members: _m, groups: _g, ...resto } = datos;
  return resto;
}

async function tokenDeSesion() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/**
 * Un cambio de la familia a api/operacion.js. Nunca lanza: `{ ok: true, ... }` con lo que devuelve la
 * tubería, o `{ ok: false, fallo }` (FALLOS_DATO).
 */
export async function enviarFamilia({ casa, personas, grupos }, { token = tokenDeSesion, fetcher = fetch } = {}) {
  // a propósito: una sesión que no se puede leer es no tener sesión (sin_sesion), y quien llama lo dice
  const t = await token().catch(() => null);
  if (!t) return { ok: false, fallo: FALLO_DATO.SIN_SESION };
  let res;
  try {
    res = await fetcher(apiUrl("/api/operacion"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        casa, clave: ids.claveOperacion.nuevo(), accion: "guardar_familia", ref_id: REF_FAMILIA,
        pedida_at: new Date().toISOString(), personas, ...(grupos !== undefined ? { grupos } : {}),
      }),
    });
  } catch {
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  // Un cuerpo que no es JSON (la página de un proxy, un despliegue a medias) no es un guardado: se dice y al log.
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, fallo: cuerpo?.fallo ?? FALLO_DATO.SERVIDOR };
  if (cuerpo?.guardado !== true) {
    if (!cuerpo) console.warn("[familiaCasa] respuesta sin JSON", res.status);
    return { ...(cuerpo ?? {}), ok: false, fallo: cuerpo?.fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ...cuerpo, ok: true };
}

/**
 * La familia de una casa tal como la conoce la app: la leída y, tras cada guardado que entra, la guardada.
 * `guardar(datos)` manda lo que cambió respecto a ella (cambiosDePersonas, con el orden de todos), uno tras
 * otro: cada cambio se calcula sobre lo ya guardado, y uno que falla se vuelve a mandar con el siguiente.
 * Devuelve `{ ok, enviado, avisos }` (avisos, en frases, solo de lo enviado) y lo de enviarFamilia.
 */
export function familiaDeCasa({ casa, familia, enviar = enviarFamilia }) {
  let conocida = familia;
  let cola = Promise.resolve();
  const guardar = (datos) => {
    const ahora = { members: datos?.members ?? [], groups: datos?.groups ?? [] };
    const paso = cola.then(async () => {
      const { cambios, avisos } = cambiosDePersonas(conocida, ahora);
      const conOrden = conOrdenDeTodos(cambios, conocida, ahora);
      if (!conOrden) return { ok: true, enviado: false, avisos: [] };
      const r = await enviar({ casa, ...conOrden });
      if (r.ok) conocida = ahora;
      return { ...r, enviado: true, avisos: textosDeAvisos(avisos) };
    });
    // a propósito: el fallo ya lo recibe quien llamó (paso); la cola solo no se rompe para el siguiente
    cola = paso.catch(() => {});
    return paso;
  };
  return { casa, guardar, conocida: () => conocida };
}

/**
 * Un guardado de la familia como tarea de la cola de la casa (guardarConVersion, versionCasa.js), que le pasa
 * la versión conocida. escribir_persona sube bot_rev: si la app no lo apunta, su siguiente guardado del
 * documento chocaría consigo mismo y recargaría. Si la versión que deja es la siguiente a la conocida, nadie
 * más escribió y se apunta (`botRev`); si no, otro escribió entretanto (Lola, otro móvil) y la app no lo ha
 * visto: `conflict`, para recargar en vez de pisarlo con el documento de aquí.
 * @param {() => Promise<{ ok: boolean, enviado?: boolean, rev?: number | null }>} guardar
 */
export const conVersionDeFamilia = (guardar) => async (rev) => {
  const r = await guardar();
  if (!r.ok || !r.enviado) return r;
  const nueva = revSiguiente(rev, r.rev);
  if (nueva != null) return { ...r, botRev: nueva };
  return { ...r, conflict: true };
};

/**
 * Pura. ¿La carga de la casa se para aquí? Sin poder leer la familia, siempre: con ella a medias, un guardado
 * borraría a quien no salió. Sin poder leer el documento, solo si lo que hay en memoria no vale (`soloNube`).
 */
export const cargaSinSeguir = ({ soloNube, remoteState, cargaFamilia }) => Boolean((soloNube && remoteState?.error) || cargaFamilia?.error);

/**
 * Los dos guardados de la casa, en su cola (`guardarConVersion`, versionCasa.js): primero la familia, que con
 * conVersionDeFamilia apunta la versión que deja, y detrás el documento, que sale con ella. Un guardado
 * programado antes de una recarga de la nube no sale (`version.vigente`), así que nunca se calcula el cambio de
 * la familia contra otra recién leída. El documento no espera a que la familia entre: no la lleva, y la que falla
 * se vuelve a mandar con el siguiente guardado (familiaDeCasa). Devuelve las dos promesas.
 */
export function guardarFamiliaYDocumento({ version, familia, documento, enCola = guardarConVersion }) {
  return { familia: enCola(version, conVersionDeFamilia(familia)), documento: enCola(version, documento) };
}
