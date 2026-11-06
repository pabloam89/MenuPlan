/**
 * Por qué falló un encargo de Mercadona (mercadona_encargo.fallo, 0131). Aparte de vocabularios.js porque el trabajador
 * corre en un contenedor que solo lleva lo suyo; vocabularios.js la reexporta y la registra.
 */
export const FALLOS_ENCARGO_MERCADONA = ["sin_cuenta", "sesion_caducada", "bloqueado", "lista_no_valida", "caducado", "error"];
export const FALLO_ENCARGO_MERCADONA = Object.freeze(Object.fromEntries(FALLOS_ENCARGO_MERCADONA.map((f) => [f.toUpperCase(), f])));
