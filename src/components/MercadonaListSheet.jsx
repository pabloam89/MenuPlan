import { useEffect, useRef, useState } from "react";
import { WizardSheet } from "./ui.jsx";
import { ShoppingCart } from "./icons.jsx";
import { MERCADONA_BOOKMARKLET } from "../lib/mercadonaList.js";

const stepNum = {
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
const stepText = { margin: 0, fontSize: 13.5, fontWeight: 700, color: "#1a3a24", lineHeight: 1.35 };

// Pasa la lista a la cuenta de Mercadona del usuario con un marcador que él
// mismo pulsa en tienda.mercadona.es — ver lib/mercadonaList.js.
export function MercadonaListSheet({ payload, emparejados = [], sinProducto, onClose }) {
  const markRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // React 19 bloquea los href «javascript:» al renderizar. El marcador tiene
  // que llevarlo para poder arrastrarse a la barra, así que se pone a mano.
  useEffect(() => {
    markRef.current?.setAttribute("href", MERCADONA_BOOKMARKLET);
  }, []);

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open("https://tienda.mercadona.es/", "_blank", "noopener");
  };

  const n = payload.products.length;

  return (
    <WizardSheet
      icon={ShoppingCart}
      title="Pasar la lista a Mercadona"
      subtitle={`${n} ${n === 1 ? "producto" : "productos"}. Se guarda como lista en tu cuenta, también en la app.`}
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={stepNum}>1</span>
          <div style={{ minWidth: 0 }}>
            <p style={stepText}>Arrastra este botón a tu barra de marcadores. Solo la primera vez.</p>
            <a
              ref={markRef}
              onClick={(e) => e.preventDefault()}
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "7px 14px",
                borderRadius: 999,
                background: "#fff",
                border: "1.5px dashed #2d5a3d",
                color: "#2d5a3d",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
                cursor: "grab",
              }}
            >
              MenuPlan → Mercadona
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <span style={stepNum}>2</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={stepText}>Copia la lista y abre Mercadona.</p>
            <button
              type="button"
              onClick={copyAndOpen}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "12px 20px",
                borderRadius: 12,
                border: "none",
                background: "#2d5a3d",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {copied ? "Copiada · abrir otra vez" : "Copiar y abrir Mercadona"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <span style={stepNum}>3</span>
          <p style={stepText}>Allí, con tu cuenta iniciada, pulsa el marcador.</p>
        </div>

        {/* Qué producto se ha elegido para cada línea: lo que se va a mandar. */}
        {emparejados.length > 0 && (
          <details style={{ fontSize: 12.5, color: "#1a3a24" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, color: "#2d5a3d" }}>
              Ver qué producto va por cada ingrediente
            </summary>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {emparejados.map((e) => (
                <li key={e.ingrediente} style={{ lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 700 }}>{e.ingrediente}</span>
                  <span style={{ color: "#5a7066" }}> → {e.producto}{e.paquetes > 1 ? ` × ${e.paquetes}` : ""}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {sinProducto.length > 0 && (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
            Sin producto claro, añádelos tú: {sinProducto.join(", ")}.
          </p>
        )}
      </div>
    </WizardSheet>
  );
}
