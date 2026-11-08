// Los códigos de «la función no existe» (una migración sin aplicar, el plan B de cada RPC): la app y Lola.

/** PostgREST no encuentra la función en su caché (404). */
export const PGRST_SIN_FUNCION = "PGRST202";
/** Postgres no tiene la función (undefined_function). */
export const PG_SIN_FUNCION = "42883";

/** Lo que dice que la tabla o la función no existen: una migración sin aplicar. */
export const NO_EXISTE = Object.freeze(new Set(["PGRST205", PGRST_SIN_FUNCION, "42P01", PG_SIN_FUNCION]));

/** Pura. ¿El error de una llamada a una RPC dice que la función no existe? */
export const esSinFuncion = (error) => error?.code === PGRST_SIN_FUNCION || error?.code === PG_SIN_FUNCION;
