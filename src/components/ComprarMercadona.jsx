import { ArrowUpRight } from "./icons.jsx";
import { Conectar } from "./ConectarMercadona.jsx";
import { BOTON, TEXTO } from "./mercadonaEstilos.js";
import { enlaceDeLista } from "../lib/mercadonaList.js";
import { PASO_COMPRAR, textoDeEncargo } from "../lib/mercadonaApp.js";

/** La parte de la hoja de Comprar que rellena la lista. Si el servicio no está, no pinta nada. */
export function RellenarMercadona({ m }) {
  const { encargo, esperando, sinNoticias, aviso, rellenar } = m;
  if (!m.servicio) return null;
  if (!m.conectada) return <Conectar caducada={m.caducada} />;

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
          {esperando && sinNoticias ? (
            <>
              <p style={TEXTO}>Sigue en marcha, pero ahora mismo no sé cómo va.</p>
              <button type="button" onClick={m.mirar} style={BOTON}>{PASO_COMPRAR.MIRAR}</button>
            </>
          ) : (
            <button type="button" onClick={rellenar} disabled={esperando} style={{ ...BOTON, opacity: esperando ? 0.6 : 1 }}>
              {esperando ? "Rellenando tu lista…" : "Rellenar mi lista en Mercadona"}
            </button>
          )}
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
        onClick={m.desconectar}
        style={{ border: "none", background: "none", fontFamily: "inherit", cursor: "pointer", ...TEXTO }}
      >
        Desconectar mi cuenta de Mercadona
      </button>
    </div>
  );
}
