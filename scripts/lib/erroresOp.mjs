/**
 * Cómo se reconoce lo que dice `op` (1Password CLI) cuando falla: un solo sitio para todos los scripts (env.mjs,
 * tokenSesion.mjs, rolLectura.mjs). Textos vistos con op 2.40 (oct-nov 2026); si 1Password los cambia, se cambian aquí.
 */

/** El límite de cupo de la cuenta («Too many requests», «rate limit»). Pasa en horas: no es falta de acceso. */
export const LIMITE_OP = /too many requests|rate.?limit/i;

/**
 * La ficha no existe en esa bóveda: `"X" isn't an item in the "HoMenu" vault`. Es lo único que deja crear una ficha
 * sin miedo a duplicarla (rolLectura.mjs).
 */
export const NO_EXISTE_FICHA = /isn't an item in the "[^"]+" vault/;

/**
 * La cuenta no ve la dirección: la bóveda no existe o no es suya («isn't a vault»), la ficha no está («could not
 * resolve item», «could not find»), o le falta ese campo («does not have a field»).
 */
export const NO_SE_VE = /isn't a vault|could not resolve item|does not have a field|could not find/i;

const textoDe = (e) => String(e?.stderr || e?.message || e || "");

/** ¿Falló por el límite de cupo? */
export const esCupo = (e) => LIMITE_OP.test(textoDe(e));

/** ¿Falló porque la dirección no existe o la cuenta no la ve? (un fallo de red, de token o de cupo, no). */
export const esSinAcceso = (e) => NO_EXISTE_FICHA.test(textoDe(e)) || NO_SE_VE.test(textoDe(e));
