// La forma de lo que se apunta en receta_descartes (0102), una sola vez para el cliente
// (src/lib/descartes.js) y para el servidor (api/track.js): el tope por petición y lo que
// vale como id de receta. El CHECK de la base lo repite (largo ≤ 120); lo ata
// src/lib/descartes.test.js.

/** Descartes por petición: un menú entero son ~40 platos. */
export const MAX_DESCARTES = 60;

/** Largo máximo de un id de receta (el CHECK receta_descartes_receta_id_limpio). */
export const RECETA_ID_MAX = 120;

/** Un id de receta del catálogo: letras, cifras y `_ . : -`, sin espacios. */
export const RECETA_ID_RE = new RegExp(`^[A-Za-z0-9_.:-]{1,${RECETA_ID_MAX}}$`);
