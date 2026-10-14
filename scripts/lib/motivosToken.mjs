/**
 * motivosToken.mjs — el vocabulario cerrado de por qué no hay token o por qué se cambió (E3 #731).
 *
 * Vive aquí, en una hoja sin imports, para que `tokenSesion.mjs`, `cuotaGh.mjs` y `ghConRenovacion.mjs`
 * (que se importan en círculo: `ghSync` renueva por defecto y el arranque registra con `execFileGh`)
 * no lean un valor antes de que exista. `tokenSesion.mjs` los vuelve a exportar: sigue siendo la puerta.
 */

/**
 * Los motivos de una renovación decidida por edad o por la caché (`ghConRenovacion`): no son causas de
 * fallo, dicen por qué se cambió el token ANTES de llamar. Van dentro de MOTIVOS, que sigue siendo el
 * único vocabulario (`-` es «sin motivo»).
 */
export const MOTIVOS_DE_RENOVACION = ["vencida-por-edad", "cache-mas-nueva"];

/** Vocabulario cerrado de por qué no hay token (se cuenta en la línea `identidad-sesion`). */
export const MOTIVOS = ["sin-clave", "clave-ilegible", "sin-instalacion", "github-rechaza", "red", "token-raro", "sin-fichero-de-entorno", "error-interno", "limite-de-1password", "bloqueo-ocupado", "fallo-reciente", "ruta-de-shim-rara", ...MOTIVOS_DE_RENOVACION];
