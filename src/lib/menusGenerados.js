/**
 * La app y los menús generados de su casa (trozo 22 de #1037): viven en `menu_generado` (0125), que solo escribe el
 * servidor (api/operacion.js), y no en el documento (`data.menuHistory`). Sin casa, los guarda el móvil. En memoria,
 * `[{ at }]` (ms), la forma que leen computeStreak y countMenusGenerated (menuStats.js). Leer y mandar, en
 * menusGeneradosApp.js; aquí lo que comparten la app y el servidor.
 */
import { jsonDeTexto } from "./escribirDato.js";

/** Los menús que se leen: los últimos 60, el tope del contador («60+», menuStats.js). */
export const MENUS_QUE_SE_LEEN = 60;

/** El documento de la casa sin el historial de menús, que vive en su tabla. Sin nada que quitar, el mismo objeto. */
export function sinHistorialDeMenus(data) {
  if (!data || !("menuHistory" in data)) return data;
  const { menuHistory: _h, ...resto } = data;
  return resto;
}

/** La lista de la app (`[{ at }]`) de las fechas ISO que da el servidor; una fecha que no lo es, lanza. */
export function menusDeFechas(fechas) {
  return fechas.map((f) => {
    const at = Date.parse(f);
    if (!Number.isFinite(at)) throw new Error(`menú: «${f}» no es una fecha`);
    return { at };
  });
}

const CLAVE_LOCAL = "hm.menus";
/** Los menús del invitado, en este móvil. Si lo guardado no se puede leer, lanza: no es «ningún menú». */
export function menusLocales(almacen = window.localStorage) {
  const crudo = almacen.getItem(CLAVE_LOCAL);
  const l = crudo ? jsonDeTexto(crudo) : [];
  if (!Array.isArray(l)) throw new Error("menús: lo del móvil no se puede leer");
  return l;
}
/** Apunta un menú del invitado (ahora) y devuelve la lista, con los últimos MENUS_QUE_SE_LEEN. */
export function apuntarMenuLocal(almacen = window.localStorage, ahora = Date.now()) {
  const l = [...menusLocales(almacen), { at: ahora }].slice(-MENUS_QUE_SE_LEEN);
  almacen.setItem(CLAVE_LOCAL, JSON.stringify(l));
  return l;
}
