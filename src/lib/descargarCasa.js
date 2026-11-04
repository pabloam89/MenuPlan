/**
 * Descargar los datos de la casa (trozo 36 de #1037): la app pide la exportación a GET /api/operacion?casa=&exportar=1
 * (api/_bot/exportar.js) con el token de la sesión y la guarda como un fichero JSON. Lo que no sea una exportación
 * entera lanza, con su motivo: la app lo dice en vez de bajar un fichero vacío o a medias.
 */

/** La ruta de la exportación de una casa. */
export const rutaDeExportar = (casa) => `/api/operacion?casa=${encodeURIComponent(casa)}&exportar=1`;

/** El nombre del fichero: la fecha (AAAA-MM-DD) del día en que se exporta. */
export const nombreDelFichero = (ahora = new Date()) => `homenu-mis-datos-${ahora.toISOString().slice(0, 10)}.json`;

/**
 * Pide la exportación y devuelve el texto JSON listo para guardar. `pedir`: fetch (o uno falso en los tests);
 * `url`: apiUrl de src/lib/apiUrl.js. Lanza si falta la sesión o la casa, si el servidor no contesta 200 o si lo que
 * llega no es una exportación (sin `tablas`).
 */
export async function pedirExportacion({ casa, token, pedir = fetch, url = (r) => r }) {
  if (!casa) throw new Error("sin casa");
  if (!token) throw new Error("sin sesión");
  const res = await pedir(url(rutaDeExportar(casa)), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({})); // a propósito: un error sin JSON se dice igual, con su código
    throw new Error(cuerpo?.fallo || `HTTP ${res.status}`);
  }
  const datos = await res.json();
  if (!datos || typeof datos.tablas !== "object") throw new Error("la exportación no trae tablas");
  return JSON.stringify(datos, null, 2);
}
