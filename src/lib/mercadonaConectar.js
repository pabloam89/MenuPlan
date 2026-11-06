/**
 * Conectar la cuenta de Mercadona desde un ordenador (0131, skill `mercadona`), sin contraseñas y sin instalar nada.
 * La persona entra en Mercadona como siempre y pulsa un marcador: el marcador abre HoMenu en otra pestaña y le pasa la
 * sesión con postMessage, entre esas dos webs y ninguna otra. HoMenu la sella con la clave del trabajador y la envía.
 * El marcador no sabe nada de la familia: quién conecta y qué casa salen de la sesión de HoMenu de esa pestaña.
 */

export const ORIGEN_TIENDA = "https://tienda.mercadona.es";
/** La pestaña de HoMenu que abre el marcador: `/?mercadona=conectar`. */
export const PARAM_CONECTAR = "mercadona";
export const VALOR_CONECTAR = "conectar";
export const vieneDelMarcador = (busqueda) => new URLSearchParams(busqueda).get(PARAM_CONECTAR) === VALOR_CONECTAR;
/** Lo que la pestaña de HoMenu dice cuando puede recibir. */
export const MENSAJE_LISTA = "homenu:mercadona:lista";

/** El código del marcador para esta web de HoMenu. En un `javascript:`, así que sin comentarios ni `//`. */
export function marcador(origen) {
  const codigo = `(()=>{
const O=${JSON.stringify(origen)};
if(location.origin!==${JSON.stringify(ORIGEN_TIENDA)}){alert("Pulsa este marcador con tienda.mercadona.es abierta.");return}
const mo=localStorage.getItem("MO-user");
if(!mo||!JSON.parse(mo).token){alert("Entra primero en tu cuenta de Mercadona.");return}
const w=window.open(O+"/?${PARAM_CONECTAR}=${VALOR_CONECTAR}","_blank");
const f=(e)=>{if(e.origin!==O||e.data!==${JSON.stringify(MENSAJE_LISTA)})return;removeEventListener("message",f);w.postMessage({mo,cookies:document.cookie},O)};
addEventListener("message",f)
})()`;
  return `javascript:${encodeURIComponent(codigo.replaceAll("\n", ""))}`;
}

/**
 * Lo que manda el marcador, como estado de navegador para el trabajador. Es lo que un marcador puede leer, y basta:
 * comprobado el 6 nov 2026 con una cuenta real, en un navegador limpio.
 * @returns {string} el texto a sellar; lanza si no trae sesión
 */
export function estadoDeMarcador({ mo, cookies }) {
  const sesion = JSON.parse(mo);
  if (!sesion?.token || !sesion?.uuid) throw new Error("sin sesión de Mercadona");
  const lista = String(cookies ?? "").split("; ").filter(Boolean).map((c) => {
    const i = c.indexOf("=");
    return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(ORIGEN_TIENDA).hostname, path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" };
  });
  return JSON.stringify({ cookies: lista, origins: [{ origin: ORIGEN_TIENDA, localStorage: [{ name: "MO-user", value: mo }] }] });
}
