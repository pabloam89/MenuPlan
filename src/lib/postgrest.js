/**
 * Los códigos con que PostgREST y Postgres dicen que una función de la base no existe: una migración aún sin
 * aplicar (el plan B de cada RPC nueva). Un solo sitio para la app, Lola y los scripts.
 */

/** PostgREST no encuentra la función en su caché (404). */
export const PGRST_SIN_FUNCION = "PGRST202";
/** Postgres no tiene la función (undefined_function). */
export const PG_SIN_FUNCION = "42883";

/** Pura. ¿El error de una llamada a una RPC dice que la función no existe? */
export const esSinFuncion = (error) => error?.code === PGRST_SIN_FUNCION || error?.code === PG_SIN_FUNCION;
