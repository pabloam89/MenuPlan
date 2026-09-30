/**
 * `?ir=`: a qué pantalla lleva un enlace del bot.
 *
 * Lola manda enlaces a la app («ver con fotos») y tienen que abrir lo que se
 * está hablando, no la portada: una madre que pulsa «ver la receta» y aterriza
 * en Inicio no sabe dónde buscarla. Valores:
 *
 *   hoy              el menú en vista de día, hoy
 *   semana           el menú en vista de semana
 *   dia:Jue          el menú en vista de día, ese día (claves de la app)
 *   compra           la lista de la compra
 *   receta:<id>      la ficha de esa receta (id del catálogo; se quita el
 *                    prefijo de grupo `grupo__` si lo trae)
 *
 * Suele ir junto a `?entrar=` (BotEnlace.jsx), que puede recargar la página al
 * cambiar de cuenta: por eso el destino se guarda en sessionStorage y no solo
 * en memoria, para que sobreviva a esa recarga.
 */

export const DIAS_APP = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CLAVE = "mp_ir";

/** De la cadena del enlace al destino, o null si no se entiende. */
export function interpretarDestino(valor) {
  const v = String(valor ?? "").trim();
  if (!v) return null;
  if (v === "hoy") return { pantalla: "menu", vista: "dia", dia: null };
  if (v === "semana") return { pantalla: "menu", vista: "semana" };
  if (v === "compra") return { pantalla: "shopping" };
  const [tipo, ...resto] = v.split(":");
  const arg = resto.join(":");
  if (tipo === "dia") {
    const dia = DIAS_APP.find((d) => d.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() === arg.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
    return dia ? { pantalla: "menu", vista: "dia", dia } : null;
  }
  if (tipo === "receta" && arg) return { pantalla: "receta", id: arg.split("__").pop() };
  return null;
}

/** Lee `?ir=` de la URL (y lo quita) o, si no hay, lo que quedó guardado de antes de una recarga. */
export function leerDestino() {
  try {
    const url = new URL(window.location.href);
    const valor = url.searchParams.get("ir");
    if (valor != null) {
      url.searchParams.delete("ir");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      const destino = interpretarDestino(valor);
      if (destino) sessionStorage.setItem(CLAVE, JSON.stringify(destino));
      return destino;
    }
    const guardado = sessionStorage.getItem(CLAVE);
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
}

/** Ya se ha llevado al usuario: que no vuelva a pasar en la próxima recarga. */
export function olvidarDestino() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento, nada que olvidar */ }
}
