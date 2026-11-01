/**
 * Los datos de la ficha Casa en la app (trozo 12 de #1037): los que ya se guardan con sobre se leen de
 * ficha_casa v2 (por api/operacion.js: la app no puede llamar a la RPC) y se escriben con la cola de la app
 * (crearColaDeDatos, escribirDato.js), no en household_state. El primero, wantsPriceEstimates; los PR 4-9 del
 * trozo añaden los suyos a CAMPOS_CASA_CON_SOBRE.
 *
 * Plan B, decidido en cada carga, como familiaCasa.js: si la base aún no tiene el campo en registro_campo (la
 * 0112 sin aplicar) o ficha_casa es la v1, ficha_casa no lo trae y el dato sigue en el documento como hasta
 * ahora. Si lo trae, vale lo de su sobre (o el defecto del registro), se escribe con la cola y el documento deja
 * de llevarlo. Nunca en los dos sitios.
 */
import { crearColaDeDatos, enviarAlServidor, jsonDeTexto } from "./escribirDato.js";
import { estadosDeFichas, leidoDe, FICHA_CON_ESTADO } from "./estadoDeDato.js";
import { tokenDeSesion, conVersionDeFamilia, urlOperacion } from "./familiaCasa.js";
import { guardarConVersion } from "./versionCasa.js";

/** Los datos de la casa (claves de `data` y campos de registro_campo, por = 'casa') que ya van con sobre. */
export const CAMPOS_CASA_CON_SOBRE = Object.freeze(["wantsPriceEstimates"]);

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
  const valores = {};
  for (const campo of CAMPOS_CASA_CON_SOBRE) {
    const leido = leidoDe(estados, campo);
    if (leido) valores[campo] = leido.valor;
  }
  return { valores };
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
 * `guardar(datos)` manda por la cola los de CAMPOS_CASA_CON_SOBRE que cambiaron (uno tras otro: lo llama la
 * cola de la casa, guardarCasaEnCola). Un dato enviado se da por conocido aunque espere en la cola o la base lo
 * rechace (eso se dice): no se vuelve a encolar en cada guardado. Devuelve `{ ok, enviado, rev }`.
 */
export function casaDeCasa({ casa, valores, cola = colaDeLaApp() }) {
  const conocidos = { ...valores };
  const guardar = async (datos) => {
    const resultados = [];
    for (const campo of Object.keys(conocidos)) {
      const valor = datos?.[campo];
      if (valor === undefined || JSON.stringify(valor) === JSON.stringify(conocidos[campo])) continue;
      resultados.push(await cola.escribir({ casa, accion: "guardar_casa", ref_id: REF_CASA, dato: { campo, valor, origen: "dicho" } }));
      conocidos[campo] = valor;
    }
    if (!resultados.length) return { ok: true, enviado: false };
    return { ok: resultados.every((r) => r.guardado === true), enviado: true, rev: resultados.at(-1).rev ?? null };
  };
  return { guardar };
}

/**
 * El guardado de los datos con sobre como tarea de la cola de la casa (guardarConVersion, versionCasa.js), que
 * se pide antes que el documento: escribir un dato sube bot_rev, y conVersionDeFamilia apunta la versión que deja
 * (o da `conflict` si otro escribió entretanto, para recargar). Con más de un dato en el mismo guardado la
 * versión no cuadra y también da `conflict`: recarga, que es seguro. Sin datos con sobre, nada.
 */
export function guardarCasaEnCola({ version, casa, datos, enCola = guardarConVersion }) {
  if (!casa?.guardada) return Promise.resolve({ ok: true, enviado: false });
  return enCola(version, conVersionDeFamilia(() => casa.guardada.guardar(datos)));
}
