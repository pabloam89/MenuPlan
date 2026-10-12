/**
 * eventosVocabulario.mjs — los vocabularios cerrados de los eventos de los hooks (#652), con el
 * significado de cada valor. Los usa `.claude/hooks/eventos.mjs` (que valida cada línea contra ellos)
 * y `scripts/lib/vocabulariosVida.mjs` (que ancla sus valores en ops/vocabularios-vida.json: un valor
 * no se borra, no se reutiliza ni se redefine sin registro). Sin imports: lo carga un hook y no puede fallar.
 *
 * Los proyectos y las zonas viven en `zonasProyecto.mjs`.
 */

/** Quién está detrás de la sesión. */
export const DEF_ACTORES = {
  pablo: "Pablo (usuario de git del PC o identidad de GitHub pabloam89)",
  alvaro: "Álvaro (usuario de git del PC)",
  app: "la identidad homenu-sesiones[bot] de las sesiones; no dice qué persona hay detrás",
  desconocido: "no se pudo saber: sin marca del arranque y sin usuario de git legible",
};
export const ACTORES = Object.keys(DEF_ACTORES);

/** Por qué hace falta una persona. */
export const DEF_MOTIVOS_INTERVENCION = {
  permiso: "una norma pide su sí antes de seguir (la guardia pregunta)",
  decision: "una decisión que solo puede tomar una persona (la sesión la deja para Pablo)",
  rescate: "la sesión no puede seguir sola y hay que sacarla (un bloqueo, una carpeta, una herramienta)",
  secreto: "crear, rotar o leer una clave que solo puede tocar una persona",
  produccion: "un paso en producción (main, migración con --pablo, datos de familias) que solo hace una persona",
  otro: "cualquier otra intervención; si un valor se repite, pasa a vocabulario",
};
export const MOTIVOS_INTERVENCION = Object.keys(DEF_MOTIVOS_INTERVENCION);

/** ¿Se habría podido evitar el paso humano? */
export const DEF_EVITABLE = {
  si: "vino de un fallo de la propia comprobación (no pudo leer git o la red) o de un olvido de la sesión (dejó una decisión sin issue), no de una decisión que hiciera falta",
  no: "hacía falta una persona de verdad",
};
export const EVITABLE = Object.keys(DEF_EVITABLE);
