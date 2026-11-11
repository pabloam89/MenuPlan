import { bottomNavSpacer } from "./ui.jsx";
import { PASO_COMPRAR } from "../lib/mercadonaApp.js";
import { EnlaceMercadona } from "./EnlaceMercadona.jsx";
import lolaFoto from "../assets/lola/lola-perfil.jpg";

const FALTA_ALGO = "¿Falta algo? Díselo a Lola";

const pie = {
  position: "sticky",
  // Se mete 16 bajo el menú: sus esquinas son redondas y la lista asomaría.
  bottom: `calc(${bottomNavSpacer()} - var(--esp-16))`,
  zIndex: "var(--capa-local)",
  display: "flex",
  alignItems: "center",
  gap: "var(--esp-12)",
  // De borde a borde: la lista de la pantalla lleva 16 de margen a cada lado.
  margin: "var(--esp-12) calc(var(--esp-16) * -1) calc(var(--esp-16) * -1)",
  padding: "var(--esp-8) var(--esp-16) var(--esp-24)",
  background: "var(--color-superficie)",
  borderTop: "1px solid var(--color-linea)",
};

const botonLola = {
  flexShrink: 0,
  width: 40,
  height: 40,
  padding: 0,
  border: "1px solid var(--color-linea)",
  borderRadius: "var(--radio-pildora)",
  background: "transparent",
  cursor: "pointer",
};

const fotoLola = {
  width: "100%",
  height: "100%",
  borderRadius: "var(--radio-pildora)",
  objectFit: "cover",
  objectPosition: "center 30%",
  display: "block",
};

const importe = {
  display: "block",
  fontSize: "var(--tipo-paso-16)",
  fontWeight: "var(--tipo-peso-900)",
  color: "var(--color-tinta)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.2,
};

const cuenta = {
  display: "block",
  fontSize: "var(--tipo-paso-12)",
  fontWeight: "var(--tipo-peso-700)",
  color: "var(--color-tinta-suave)",
  lineHeight: 1.2,
};

const detalle = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  padding: 0,
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const botonComprar = {
  flexShrink: 0,
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 var(--esp-20)",
  border: "none",
  borderRadius: "var(--radio-control)",
  background: "var(--color-marca)",
  color: "var(--color-superficie)",
  fontFamily: "inherit",
  fontSize: "var(--tipo-paso-14)",
  fontWeight: "var(--tipo-peso-800)",
  textDecoration: "none",
  cursor: "pointer",
};

/**
 * El pie de la compra: cuánto es, cuántos productos, y el paso de comprar.
 * Pegado al menú de abajo (sticky, no fixed): al final de la lista ocupa su
 * sitio y no tapa la última fila. `onLola` es opcional: sin él no hay foto.
 * `paso` es lo que dice el botón (`pasoDeComprar`, y `pasoConMinimo`: con `bloqueado`, no se pulsa); el total abre el detalle.
 */
export default function BarraComprar({ total, productos, paso = { texto: PASO_COMPRAR.COMPRAR }, onComprar, onDetalle, onLola }) {
  const nombre = paso.texto === PASO_COMPRAR.COMPRAR ? `Comprar · ${total}` : paso.texto;
  return (
    <div style={pie}>
      {onLola && (
        <button type="button" onClick={onLola} aria-label={FALTA_ALGO} style={botonLola}>
          <img src={lolaFoto} alt="" style={fotoLola} />
        </button>
      )}
      <button type="button" onClick={onDetalle} aria-label={`Ver los productos · ${total}`} style={detalle}>
        <span style={importe}>{total}</span>
        <span style={cuenta}>{paso.nota ?? (productos === 1 ? "1 producto" : `${productos} productos`)}</span>
      </button>
      {paso.href ? (
        <EnlaceMercadona href={paso.href} style={botonComprar}>{paso.texto}</EnlaceMercadona>
      ) : (
        <button type="button" onClick={onComprar} disabled={paso.ocupado || paso.bloqueado} aria-label={nombre} style={{ ...botonComprar, opacity: paso.ocupado || paso.bloqueado ? 0.6 : 1 }}>
          {paso.texto}
        </button>
      )}
    </div>
  );
}

const hueco = {
  position: "sticky",
  bottom: `calc(${bottomNavSpacer()} + var(--esp-12))`,
  zIndex: "var(--capa-local)",
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "var(--esp-12)",
};

const pildora = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--esp-8)",
  minHeight: 44,
  padding: "var(--esp-4) var(--esp-12) var(--esp-4) var(--esp-4)",
  border: "1px solid var(--color-linea)",
  borderRadius: "var(--radio-pildora)",
  background: "var(--color-superficie)",
  boxShadow: "var(--sombra-2)",
  color: "var(--color-tinta)",
  fontFamily: "inherit",
  fontSize: "var(--tipo-paso-14)",
  fontWeight: "var(--tipo-peso-800)",
  cursor: "pointer",
};

/** Sin nada que comprar no hay barra: queda solo Lola, en su píldora. */
export function PildoraLola({ onClick }) {
  return (
    <div style={hueco}>
      <button type="button" onClick={onClick} style={pildora}>
        <img src={lolaFoto} alt="" style={{ ...fotoLola, width: 32, height: 32 }} />
        {FALTA_ALGO}
      </button>
    </div>
  );
}
