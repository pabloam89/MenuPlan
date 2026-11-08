// Lo que cuesta la lista, en dos renglones: lo que tiene precio, con su total
// (y el presupuesto al lado), y debajo cuántos no lo tienen, sin total. Antes
// iba todo en una línea junto a las semanas y en el móvil «N sin precio» se
// cortaba con puntos suspensivos.

const fila = {
  display: "flex",
  alignItems: "center",
  gap: "var(--esp-8)",
  minHeight: 24,
};

const texto = {
  flex: 1,
  minWidth: 0,
  fontSize: "var(--tipo-paso-13)",
  fontWeight: "var(--tipo-peso-700)",
  color: "var(--color-tinta)",
};

const pastilla = {
  flexShrink: 0,
  padding: "2px 10px",
  borderRadius: "var(--radio-pildora)",
  color: "#fff",
  fontSize: "var(--tipo-paso-12)",
  fontWeight: "var(--tipo-peso-700)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.35,
};

const productos = (n) => (n === 1 ? "1 producto" : `${n} productos`);

/**
 * `conPrecio` y `sinPrecio` son cuántos productos; `total` y `presupuesto` ya
 * van formateados (`presupuesto` null si la casa no tiene). `noCabe` pinta el
 * presupuesto en rojo. `colorTotal` es el de la pastilla del total: el de los
 * pasillos abiertos de la lista (AISLE_OPEN_BAND, en Shopping.jsx).
 */
export default function ResumenCompra({ conPrecio, sinPrecio, total, presupuesto = null, noCabe = false, colorTotal }) {
  return (
    <div style={{ display: "grid", gap: "var(--esp-2)" }}>
      <div style={fila}>
        <span style={texto}>{productos(conPrecio)} con precio</span>
        <span style={{ ...pastilla, background: colorTotal }}>{total}</span>
        {presupuesto && (
          <span
            style={{
              flexShrink: 0,
              fontSize: "var(--tipo-paso-13)",
              fontWeight: "var(--tipo-peso-700)",
              color: noCabe ? "var(--color-peligro)" : "var(--color-tinta-suave)",
              whiteSpace: "nowrap",
            }}
          >
            de {presupuesto}
          </span>
        )}
      </div>
      {sinPrecio > 0 && (
        <div style={fila}>
          <span style={{ ...texto, color: "var(--color-tinta-suave)" }}>{productos(sinPrecio)} sin precio</span>
        </div>
      )}
    </div>
  );
}
