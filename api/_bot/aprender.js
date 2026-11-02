/**
 * Lo que se aprende de lo que hace la casa (plan fichas con estado, trozo 15): de las señales que olvidan (`senal`,
 * 0109) a las preferencias vistas, por la tubería. Lo llama el cron de cada pocos minutos (api/bot/recordatorios.js),
 * con `ref_tipo: cron` y el canal `sistema`, sin autor: lo visto no lo dice nadie.
 *
 * Qué casas mira cada pasada: las que han tenido una señal desde la pasada anterior (lo que acaba de pasar el umbral
 * se aprende en minutos) y, una vez al día después del olvido de la noche (`senal-decaer`, 0109), todas las que tienen
 * alguna señal (lo que el olvido dejó por debajo del umbral se retira). Lo que hay que escribir lo decide
 * vistasDeSenales (src/lib/senales.js), puro.
 */
import { select, eq } from "./db.js";
import { escribirPreferencias, leerPreferencias } from "./datos.js";
import { vistasDeSenales, ACCION_APRENDER } from "../../src/lib/senales.js";
import { CANAL_DATO, REF_OPERACION } from "../../src/lib/vocabularios.js";
import { CADA_MS } from "./cadencia.js";

/**
 * La hora (UTC, la de pg_cron) del repaso de todas las casas: después de `senal-decaer` (0109, a las 3:23 UTC;
 * aprender.test.js lo compara con la migración).
 */
export const HORA_REPASO_UTC = 4;

/** Pura. ¿Toca el repaso de todas las casas? En la primera pasada de HORA_REPASO_UTC (las pasadas van cada CADA_MS). */
export const tocaRepaso = (ahoraMs, cadaMs = CADA_MS) => {
  const d = new Date(ahoraMs);
  return d.getUTCHours() === HORA_REPASO_UTC && d.getUTCMinutes() * 60000 + d.getUTCSeconds() * 1000 < cadaMs;
};

/**
 * Una pasada: por cada casa que toca, sus señales y sus preferencias, y lo que cambia, en una operación. Una casa que
 * falla (sin leer, sin guardar) no para a las demás: queda en el log y en `fallos`.
 * @returns {Promise<{ casas: number, escritas: number, fallos: number }>}
 */
export async function aprenderDeSenales({ ahoraMs = Date.now(), cadaMs = CADA_MS } = {}) {
  const repaso = tocaRepaso(ahoraMs, cadaMs);
  // Dos pasadas de margen: si una se pierde, la siguiente la recoge (y el repaso diario, lo que se escape).
  const filtro = `user_id=is.null${repaso ? "" : `&ultima_at=gte.${new Date(ahoraMs - 2 * cadaMs).toISOString()}`}`;
  const casas = [...new Set((await select("senal", filtro, "household_id")).map((f) => f.household_id))];
  const cuenta = { casas: casas.length, escritas: 0, fallos: 0 };
  for (const casa of casas) {
    try {
      const senales = await select("senal", `household_id=${eq(casa)}&user_id=is.null`, "eje,valor,peso");
      const { preferencias } = await leerPreferencias(casa);
      const cambios = vistasDeSenales(senales, preferencias);
      if (!cambios.length) continue;
      const r = await escribirPreferencias({
        casa,
        clave: `${ACCION_APRENDER}:${new Date(ahoraMs).toISOString()}`,
        accion: ACCION_APRENDER,
        canal: CANAL_DATO.SISTEMA,
        ref: { tipo: REF_OPERACION.CRON, id: ACCION_APRENDER },
        preferencias: cambios,
      }, { papel: null });
      if (r.guardado === false) cuenta.fallos++;
      else cuenta.escritas++;
    } catch (e) {
      console.error(JSON.stringify({ evento: "senales_sin_aprender", motivo: String(e?.message ?? e).slice(0, 200) }));
      cuenta.fallos++;
    }
  }
  return cuenta;
}
