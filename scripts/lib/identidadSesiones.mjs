/**
 * identidadSesiones.mjs — quién es, en GitHub, la App de las sesiones (`homenu-sesiones`, #327 y #329).
 *
 * Una hoja sin imports, para que la lean sin cargar `child_process` tanto tokenSesion.mjs (el canje del
 * token, que la vuelve a exportar) como el filtro de «de la casa» (`esDeLaCasa`, fondos.mjs, #839), que
 * está en el grafo del hook buscar-antes. El id es la única forma segura de reconocer al bot: el login se
 * puede parecer y el id numérico no lo reutiliza nadie. Si la App se recrea, cambia aquí y el `if:` de
 * .github/workflows/fondos.yml a la vez (scripts/esDeLaCasa.test.js falla si difieren).
 */

/** El login del usuario bot de la App. Para mostrarlo y para el autor de los commits; nunca para decidir quién es de la casa. */
export const BOT_LOGIN = "homenu-sesiones[bot]";
/** Id del usuario bot (público, `GET /users/homenu-sesiones[bot]`). */
export const BOT_ID = 340485937;
