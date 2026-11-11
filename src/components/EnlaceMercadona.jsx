import { isNativeApp } from "../lib/apiUrl.js";
import { abrirEnMercadona } from "../lib/mercadonaEntrarApp.js";

/**
 * Un enlace a la tienda de Mercadona (la lista que ha hecho Lola). En la web, un enlace normal. En la app, la página se
 * abre dentro de HoMenu con la sesión con la que se entró: sin esto el iPhone la mandaba a Safari, sin sesión, y de
 * ahí a la app de Mercadona, si la había.
 */
export function EnlaceMercadona({ href, style, children, nativa = isNativeApp, abrir = abrirEnMercadona }) {
  if (!nativa) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => abrir(href)} style={style}>
      {children}
    </button>
  );
}
