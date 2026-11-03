/**
 * ¿Sale el botón «Regenerar» de cada día?
 *
 * En la pizarra, no (Pablo, 3 nov 2026): un plato se cambia con sus «…» y lo
 * demás se le pide a Lola o se rellena con «Rellenar». Tres formas de rehacer
 * lo mismo en una pantalla despistaban. Fuera de la pizarra sigue como estaba.
 * En una casa de solo lectura, nunca.
 */
export function puedeRegenerarDia({ soloLectura, esPizarra }) {
  return !soloLectura && !esPizarra;
}
