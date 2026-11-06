import { useEffect, useRef, useState } from "react";
import { BOTON, TEXTO } from "./mercadonaEstilos.js";
import { Check } from "./icons.jsx";
import { sellar } from "../lib/mercadonaSello.js";
import { estadoDeMarcador, marcador, MENSAJE_LISTA, ORIGEN_TIENDA } from "../lib/mercadonaConectar.js";
import { guardarSesion, leerEstado } from "../lib/mercadonaApp.js";

/** Conectar se hace una vez, desde un ordenador: el marcador no se puede arrastrar en un móvil. */
export function Conectar({ caducada }) {
  const enlace = useRef(null);
  // React no deja poner un `javascript:` en un href: se pone a mano.
  useEffect(() => {
    enlace.current?.setAttribute("href", marcador(window.location.origin));
  }, []);
  const motivo = caducada ? "Mercadona ha cerrado la sesión. Conéctala otra vez." : "Conecta tu cuenta una vez y yo te relleno la lista.";
  if (!window.matchMedia?.("(pointer: fine)").matches) return <p style={TEXTO}>{motivo} Se hace una sola vez, desde un ordenador.</p>;
  return (
    <div style={{ display: "grid", gap: "var(--esp-8)" }}>
      <p style={TEXTO}>{motivo} Nunca veo tu contraseña, y no puedo pagar.</p>
      <a ref={enlace} style={{ ...BOTON, cursor: "grab" }} onClick={(e) => e.preventDefault()}>Conectar Mercadona</a>
      <p style={TEXTO}>Arrastra el botón a tu barra de marcadores. Luego entra en Mercadona y púlsalo allí.</p>
    </div>
  );
}

/** La pestaña que abre el marcador: recibe la sesión, la sella aquí mismo y la envía. */
export function RecibirCuentaMercadona({ casa }) {
  const [fase, setFase] = useState("esperando");

  useEffect(() => {
    if (!casa) return undefined;
    let clave = null;
    const recibir = async (e) => {
      if (e.origin !== ORIGEN_TIENDA || !clave) return;
      window.removeEventListener("message", recibir);
      try {
        const r = await guardarSesion(casa, await sellar(estadoDeMarcador(e.data), clave));
        setFase(r.ok ? "hecho" : "fallo");
      } catch (err) {
        console.error("[mercadona] sin conectar:", err.name);
        setFase("fallo");
      }
    };
    window.addEventListener("message", recibir);
    leerEstado(casa).then((r) => {
      clave = r.clave_publica ?? null;
      if (clave && window.opener) window.opener.postMessage(MENSAJE_LISTA, ORIGEN_TIENDA);
      else setFase("fallo");
    });
    return () => window.removeEventListener("message", recibir);
  }, [casa]);

  const textos = {
    esperando: casa ? "Conectando tu cuenta de Mercadona…" : "Entra en HoMenu en este navegador y vuelve a pulsar el marcador.",
    hecho: "Cuenta conectada. Ya puedes cerrar esta pestaña y rellenar tu lista desde Compra.",
    fallo: "No se ha podido conectar. Vuelve a Mercadona y pulsa otra vez el marcador.",
  };
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        zIndex: "var(--capa-emergente)",
        left: "var(--esp-16)",
        right: "var(--esp-16)",
        top: "var(--esp-16)",
        display: "flex",
        gap: "var(--esp-8)",
        alignItems: "center",
        padding: "var(--esp-16)",
        borderRadius: "var(--radio-tarjeta)",
        background: "var(--color-superficie)",
        boxShadow: "var(--sombra-2)",
        color: "var(--color-tinta)",
        fontSize: "var(--tipo-paso-14)",
      }}
    >
      {fase === "hecho" && <Check size={18} color="var(--color-marca)" />}
      {textos[fase]}
    </div>
  );
}
