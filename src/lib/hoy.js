/**
 * «Hoy» de la casa: la fecha del calendario en su zona horaria, no en UTC.
 *
 * `new Date().toISOString().slice(0, 10)` da el día en UTC: entre las 00:00 y
 * las 02:00 de Madrid (01:00 en invierno) sale el día anterior. Y en el
 * servidor (Vercel corre en UTC) tampoco vale `getDay()`/`getDate()`.
 *
 * La casa aún no guarda su zona: va Madrid por defecto. El día que la guarde,
 * solo cambia quien llama (`hoyISO(casa.zona)`), no esta función.
 *
 * Vive en src/lib y sin dependencias para que la usen la app y el bot
 * (api/_bot importa directamente los módulos pequeños de src/lib; lo que no
 * puede importar es lo que arrastra el catálogo, que va por core.mjs).
 */

export const ZONA_CASA = "Europe/Madrid";

/** La fecha de hoy en `zona`, como «AAAA-MM-DD». `ahora` es para las pruebas. */
export function hoyISO(zona = ZONA_CASA, ahora = new Date()) {
  // en-CA formatea año-mes-día con guiones; se monta a mano por si algún
  // motor de Intl cambia el separador.
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(ahora);
  const p = (t) => partes.find((x) => x.type === t).value;
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/** El día de la semana de una fecha «AAAA-MM-DD»: 0 lunes … 6 domingo. */
export const indiceDeFecha = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/** El día de la semana de hoy en `zona`: 0 lunes … 6 domingo. */
export const indiceDiaHoy = (zona = ZONA_CASA, ahora = new Date()) => indiceDeFecha(hoyISO(zona, ahora));
