import { useEffect, useState } from "react";
import { ArrowUpRight } from "./icons.jsx";
import { Conectar } from "./ConectarMercadona.jsx";
import { BOTON, TEXTO } from "./mercadonaEstilos.js";
import { enlaceDeLista } from "../lib/mercadonaList.js";
import { NO_ENCARGADO, ESTADO_CUENTA_MERCADONA } from "../lib/vocabularios.js";
import {
  CADA_MS, ESPERA_MAX_MS, encargoEnMarcha, leerEstado, pedirLista, quitarCuenta, TEXTO_NO_ENCARGADO, textoDeEncargo,
} from "../lib/mercadonaApp.js";

/** La parte de la hoja de Comprar que rellena la lista. Si el servicio no está, no pinta nada. */
export function RellenarMercadona({ casa, lista }) {
  const [estado, setEstado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const encargo = estado?.encargo;
  const esperando = encargoEnMarcha(encargo);

  useEffect(() => {
    let vivo = true;
    leerEstado(casa).then((r) => vivo && setEstado(r));
    return () => {
      vivo = false;
    };
  }, [casa]);

  useEffect(() => {
    if (!esperando) return undefined;
    const hasta = Date.now() + ESPERA_MAX_MS;
    const t = setInterval(async () => {
      const r = await leerEstado(casa);
      if (r.ok) setEstado(r);
      if (Date.now() > hasta) clearInterval(t);
    }, CADA_MS);
    return () => clearInterval(t);
  }, [casa, esperando]);

  if (!estado?.ok || !estado.disponible || !estado.clave_publica) return null;
  if (estado.cuenta !== ESTADO_CUENTA_MERCADONA.CONECTADA) return <Conectar caducada={estado.cuenta === ESTADO_CUENTA_MERCADONA.CADUCADA} />;

  const rellenar = async () => {
    setAviso(null);
    const r = await pedirLista(casa, lista);
    if (r.encargo) return setEstado((s) => ({ ...s, encargo: r.encargo }));
    if (r.fallo === NO_ENCARGADO.SIN_CUENTA || r.fallo === NO_ENCARGADO.SESION_CADUCADA) return setEstado(await leerEstado(casa));
    setAviso(TEXTO_NO_ENCARGADO[r.fallo] ?? "No se ha podido pedir. Inténtalo otra vez.");
    return undefined;
  };

  return (
    <div style={{ display: "grid", gap: "var(--esp-8)" }}>
      {encargo?.lista_xid ? (
        <>
          <p style={TEXTO}>{textoDeEncargo(encargo)}</p>
          <a href={enlaceDeLista(encargo.lista_xid)} target="_blank" rel="noreferrer" style={BOTON}>
            Abrir en Mercadona <ArrowUpRight size={16} color="currentColor" />
          </a>
        </>
      ) : (
        <>
          {encargo && !esperando && <p style={TEXTO}>{textoDeEncargo(encargo)}</p>}
          <button type="button" onClick={rellenar} disabled={esperando} style={{ ...BOTON, opacity: esperando ? 0.6 : 1 }}>
            {esperando ? "Rellenando tu lista…" : "Rellenar mi lista en Mercadona"}
          </button>
        </>
      )}
      {encargo?.lista_xid && (
        <button type="button" onClick={rellenar} style={{ ...BOTON, background: "none", color: "var(--color-marca)" }}>
          Volver a rellenarla
        </button>
      )}
      {aviso && <p style={TEXTO}>{aviso}</p>}
      <button
        type="button"
        onClick={async () => {
          const r = await quitarCuenta(casa);
          if (r.ok) setEstado(await leerEstado(casa));
          else setAviso("No se ha podido desconectar. Inténtalo otra vez.");
        }}
        style={{ border: "none", background: "none", fontFamily: "inherit", cursor: "pointer", ...TEXTO }}
      >
        Desconectar mi cuenta de Mercadona
      </button>
    </div>
  );
}
