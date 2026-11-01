/**
 * Los datos de la ficha Casa en la app (trozo 12 de #1037): los que ya se guardan con sobre se leen de
 * ficha_casa v2 (por api/operacion.js: la app no puede llamar a la RPC) y se escriben con la cola de la app
 * (crearColaDeDatos, escribirDato.js), no en household_state: los de CAMPOS_CASA_CON_SOBRE (estadoDeDato.js).
 *
 * Plan B, decidido en cada carga, como familiaCasa.js: si la base aún no tiene el campo en registro_campo (la
 * 0112 sin aplicar) o ficha_casa es la v1, ficha_casa no lo trae y el dato sigue en el documento como hasta
 * ahora. Si lo trae, vale lo de su sobre (o el defecto del registro), se escribe con la cola y el documento deja
 * de llevarlo. Nunca en los dos sitios.
 */
import { crearColaDeDatos, enviarAlServidor, jsonDeTexto } from "./escribirDato.js";
import { estadosDeFichas, datosConSobre, FICHA_CON_ESTADO } from "./estadoDeDato.js";
import { tokenDeSesion, urlOperacion } from "./familiaCasa.js";
import { revSiguiente } from "./personas.js";
import { guardarConVersion } from "./versionCasa.js";

/** La pantalla de la que sale un cambio de la casa (la `ref` de la operación). */
export const REF_CASA = "casa";

/**
 * Pura. Lo que contestó api/operacion.js (GET) en la carga de la casa: `{ valores }` con los de
 * CAMPOS_CASA_CON_SOBRE que la ficha trae (vacío con la v1 o sin la 0112: siguen en el documento), o
 * `{ error: true }` si la respuesta no es la esperada: no es una casa sin datos.
 */
function cargaDeRespuesta(status, cuerpo) {
  if (status !== 200 || !cuerpo || !Number.isInteger(cuerpo.v)) return { error: true };
  if (cuerpo.v !== FICHA_CON_ESTADO) return { valores: {} };
  if (!Array.isArray(cuerpo.datos)) return { error: true };
  let estados;
  try {
    estados = estadosDeFichas({ casa: cuerpo.datos });
  } catch (e) {
    // La base y el código no dicen lo mismo (estadoDeDato.js lo explica): se dice y la carga no sigue.
    console.error("[casaDatos] ficha sin el contrato:", e.message);
    return { error: true };
  }
  return { valores: Object.fromEntries(datosConSobre(estados).map((l) => [l.campo, l.valor])) };
}

/**
 * Los datos de la ficha Casa al cargar la casa (ver cargaDeRespuesta). En desarrollo (`npm run dev`, sin las
 * funciones de api/), con lo que no es la respuesta del servidor se sigue con el documento y se dice en consola.
 */
export async function leerDatosDeCasa(casa, { token = tokenDeSesion, fetcher = fetch, enDesarrollo = import.meta.env?.DEV === true } = {}) {
  let res;
  let texto;
  try {
    const t = await token();
    if (!t) return { error: true };
    res = await fetcher(`${urlOperacion()}?casa=${encodeURIComponent(casa)}`, { headers: { Authorization: `Bearer ${t}` } });
    texto = await res.text();
  } catch (e) {
    // Sin red o sin sesión que leer: no es una casa sin datos. Se dice y la carga no sigue (cargaSinSeguir), en vez de
    // romper la carga entera de App.jsx con un rechazo que nadie recoge.
    console.error("[casaDatos] no se pudieron leer los datos de la casa:", String(e?.message ?? e));
    return { error: true };
  }
  const cuerpo = jsonDeTexto(texto);
  if (cuerpo == null) console.error("[casaDatos] la respuesta no es JSON", res.status);
  const carga = cargaDeRespuesta(res.status, cuerpo);
  if (carga.error && enDesarrollo && cuerpo == null) {
    console.warn("[casaDatos] sin api/operacion.js en desarrollo: los datos de la casa, del documento");
    return { valores: {} };
  }
  return carga;
}

/** Pura. Los datos de la casa con los leídos de su sobre en vez de los del documento. Sin cambio si no hay. */
export function conCasaLeida(data, carga) {
  if (!data || !carga?.valores) return data;
  return { ...data, ...carga.valores };
}

/** Pura. Lo que va al documento: sin los datos que viven en su sobre. */
export function sinCasa(datos, carga) {
  const fuera = Object.keys(carga?.valores ?? {});
  if (!fuera.length) return datos;
  return Object.fromEntries(Object.entries(datos).filter(([k]) => !fuera.includes(k)));
}

let colaApp = null;
/** La cola de la app (una por pestaña): localStorage, la sesión de Supabase y api/operacion.js; reintenta al volver la red. */
export function colaDeLaApp() {
  if (!colaApp) {
    colaApp = crearColaDeDatos({ almacen: window.localStorage, enviar: enviarAlServidor({ token: tokenDeSesion, url: urlOperacion() }) });
    colaApp.escucharRed(window);
  }
  return colaApp;
}

/**
 * Los datos con sobre de una casa tal como los conoce la app: los leídos y, tras cada envío, los enviados.
 * `guardar(datos, rev)` manda por la cola, uno tras otro, los de CAMPOS_CASA_CON_SOBRE que cambiaron; `rev` es
 * la versión de la casa que conoce la app (la da la cola de la casa, guardarCasaEnCola). Cada dato que entra sube
 * bot_rev en uno: si cada uno deja la siguiente a la anterior, `botRev` es la última; si no (otro escribió
 * entremedias, o no se conocía la versión), `conflict`, para recargar. Lo que espera en la cola o la base rechaza
 * no sube la versión ni cuenta como guardado. Un dato enviado se da por conocido aunque espere o se rechace (eso
 * se dice): no se vuelve a encolar en cada guardado. Devuelve `{ ok, enviado, botRev?, conflict? }`.
 */
export function casaDeCasa({ casa, valores, cola = colaDeLaApp() }) {
  const conocidos = { ...valores };
  const guardar = async (datos, rev) => {
    let ok = true;
    let enviado = false;
    let actual = rev;
    let conflict = false;
    for (const campo of Object.keys(conocidos)) {
      const valor = datos?.[campo];
      if (valor === undefined || JSON.stringify(valor) === JSON.stringify(conocidos[campo])) continue;
      const r = await cola.escribir({ casa, accion: "guardar_casa", ref_id: REF_CASA, dato: { campo, valor, origen: "dicho" } });
      conocidos[campo] = valor;
      enviado = true;
      if (r.guardado !== true) {
        ok = false;
        continue;
      }
      const siguiente = conflict ? null : revSiguiente(actual, r.rev);
      if (siguiente == null) conflict = true;
      else actual = siguiente;
    }
    if (!enviado) return { ok: true, enviado: false };
    if (conflict) return { ok, enviado, conflict: true };
    return { ok, enviado, botRev: actual };
  };
  return { guardar };
}

/**
 * El guardado de los datos con sobre como tarea de la cola de la casa (guardarConVersion, versionCasa.js), que
 * se pide antes que el documento: con la versión que conoce la app, casaDeCasa apunta la que deja tras uno o
 * varios datos, o da `conflict` si otro escribió entretanto, para recargar. Sin datos con sobre, nada.
 */
export function guardarCasaEnCola({ version, casa, datos, enCola = guardarConVersion }) {
  if (!casa?.guardada) return Promise.resolve({ ok: true, enviado: false });
  return enCola(version, (rev) => casa.guardada.guardar(datos, rev));
}
