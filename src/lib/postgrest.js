// Los códigos de «la función no existe» (una migración sin aplicar, el plan B de cada RPC): la app y Lola.

/** PostgREST no encuentra la función en su caché (404). */
export const PGRST_SIN_FUNCION = "PGRST202";
/** Postgres no tiene la función (undefined_function). */
export const PG_SIN_FUNCION = "42883";

/** Pura. ¿El error de una llamada a una RPC dice que la función no existe? */
export const esSinFuncion = (error) => error?.code === PGRST_SIN_FUNCION || error?.code === PG_SIN_FUNCION;
