import { useState } from "react";
import { createPortal } from "react-dom";
import { WizardSheet } from "./ui.jsx";
import { BOTON, TEXTO } from "./mercadonaEstilos.js";
import { isNativeApp } from "../lib/apiUrl.js";
import { abrirEnMercadona } from "../lib/mercadonaEntrarApp.js";
import { ABRIR_EN, TEXTO_ABRIR, abrirEnAppMercadona, guardarAbrirEn, leerAbrirEn } from "../lib/mercadonaAbrir.js";

const BOTON_SECUNDARIO = { ...BOTON, background: "none", color: "var(--color-marca)", border: "1px solid var(--color-marca)" };

/**
 * Un enlace a la tienda de Mercadona (la lista que ha hecho Lola). En la web, un enlace normal. En la app, la primera
 * vez pregunta dónde abrirla (la web de Mercadona dentro de HoMenu, con la sesión, o la app de Mercadona) y lo
 * recuerda; las siguientes va directa (ver lib/mercadonaAbrir.js).
 */
export function EnlaceMercadona({
  href, style, children,
  nativa = isNativeApp, abrirWeb = abrirEnMercadona, abrirApp = abrirEnAppMercadona, leer = leerAbrirEn, guardar = guardarAbrirEn,
}) {
  const [eligiendo, setEligiendo] = useState(false);
  if (!nativa) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={style}>
        {children}
      </a>
    );
  }
  const abrirCon = (donde) => (donde === ABRIR_EN.APP ? abrirApp(href) : abrirWeb(href));
  const pulsar = () => {
    const donde = leer();
    if (donde) abrirCon(donde);
    else setEligiendo(true);
  };
  const elegir = (donde) => {
    guardar(donde);
    setEligiendo(false);
    abrirCon(donde);
  };
  return (
    <>
      <button type="button" onClick={pulsar} style={style}>
        {children}
      </button>
      {/* En un portal y en la capa de «hoja sobre hoja»: pintada en su sitio, dentro de la hoja de Comprar quedaba
          recortada (su tarjeta conserva un `transform` de la animación mp-sheet-up, y entonces `position: fixed` se
          mide desde ella), y desde la barra de Compra quedaba debajo del menú (la barra es `sticky` con su capa). */}
      {eligiendo &&
        createPortal(
          <div data-eleccion-mercadona style={{ position: "relative", zIndex: "var(--capa-hoja-2)" }}>
            <WizardSheet title={TEXTO_ABRIR.PREGUNTA} onClose={() => setEligiendo(false)}>
              <div style={{ display: "grid", gap: "var(--esp-8)" }}>
                <button type="button" onClick={() => elegir(ABRIR_EN.WEB)} style={BOTON}>{TEXTO_ABRIR.WEB}</button>
                <button type="button" onClick={() => elegir(ABRIR_EN.APP)} style={BOTON_SECUNDARIO}>{TEXTO_ABRIR.APP}</button>
                <p style={{ ...TEXTO, textAlign: "center" }}>{TEXTO_ABRIR.SI_LA_TIENES}</p>
              </div>
            </WizardSheet>
          </div>,
          document.body,
        )}
    </>
  );
}
