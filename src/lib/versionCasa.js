// Los guardados de la casa, de uno en uno (0068).
//
// Desde la 0068 cada guardado de la app sube la versión de la casa
// (`household_state.bot_rev`), igual que los de Lola: así otro dispositivo, u
// otro cotitular, ve que algo cambió. Pero entonces la app tiene que llevar la
// cuenta de SUS versiones, o chocaría consigo misma: la casa y la semana se
// guardan casi a la vez, y la segunda saldría con la versión que la primera
// acaba de dejar vieja.
//
// Por eso todo guardado con versión pasa por esta cola: uno detrás de otro,
// cada uno lee la versión al salir (no al programarse) y apunta la que le
// devuelve la base. Y el sondeo pregunta aquí si hay algo en marcha, para no
// tomar un guardado propio por un cambio ajeno.

let cola = Promise.resolve();
let enMarcha = 0;
let encolados = 0;

/**
 * @template T
 * @param {() => Promise<T>} tarea
 * @returns {Promise<T>}
 */
export function enColaDeCasa(tarea) {
  enMarcha += 1;
  encolados += 1;
  const p = cola.then(tarea).finally(() => {
    enMarcha -= 1;
  });
  cola = p.catch(() => {});
  return p;
}

/**
 * Un guardado con versión, en la cola. Lee la versión al salir y, si la base
 * lo acepta, apunta la nueva. Si entretanto se recargó la nube (`vigente`
 * dice que no), lo que iba a subir es viejo y no sale.
 *
 * @param {{ leer: () => number | null, apuntar: (rev: number) => void, vigente: () => boolean }} version
 * @param {(rev: number | null) => Promise<{ ok: boolean, conflict?: boolean, botRev?: number | null }>} enviar
 */
export function guardarConVersion(version, enviar) {
  return enColaDeCasa(async () => {
    if (!version.vigente()) return { ok: false, descartado: true };
    const r = await enviar(version.leer());
    if (r?.ok && r.botRev != null) version.apuntar(r.botRev);
    return r;
  });
}

/** Hay un guardado en cola o en vuelo. */
export const guardandoCasa = () => enMarcha > 0;

/** Cuántos guardados se han encolado desde que arrancó la app: si cambia entre
 * dos momentos, hubo un guardado propio entremedias. */
export const guardadosDeCasa = () => encolados;
