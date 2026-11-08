// Lo que cuesta la lista, como una cuenta: cada concepto a la izquierda y su
// cifra a la derecha, en columna. «Con precio» lleva el total; «sin precio»,
// solo cuántos (no tiene total). Bajo una raya, el presupuesto de la casa.

const tabla = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  columnGap: "var(--esp-12)",
  rowGap: "var(--esp-4)",
  alignItems: "baseline",
  fontSize: "var(--tipo-paso-13)",
  fontWeight: "var(--tipo-peso-700)",
  color: "var(--color-tinta)",
};

const cifra = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const raya = {
  gridColumn: "1 / -1",
  borderTop: "1px solid var(--color-linea)",
  margin: "var(--esp-2) 0",
};

const suave = { color: "var(--color-tinta-suave)" };

const productos = (n) => (n === 1 ? "1 producto" : `${n} productos`);

/**
 * `conPrecio` y `sinPrecio` son cuántos productos; `total` y `presupuesto` ya
 * van formateados (`presupuesto` null si la casa no tiene, y entonces no hay
 * raya ni fila). `noCabe` pinta el presupuesto en rojo.
 */
export default function ResumenCompra({ conPrecio, sinPrecio, total, presupuesto = null, noCabe = false }) {
  return (
    <div style={tabla}>
      <span>{productos(conPrecio)} con precio</span>
      <span style={{ ...cifra, fontWeight: "var(--tipo-peso-900)" }}>{total}</span>
      {sinPrecio > 0 && (
        <>
          <span style={suave}>{productos(sinPrecio)} sin precio</span>
          <span />
        </>
      )}
      {presupuesto && (
        <>
          <div style={raya} />
          <span style={suave}>Presupuesto</span>
          <span style={{ ...cifra, color: noCabe ? "var(--color-peligro)" : "var(--color-tinta-suave)" }}>{presupuesto}</span>
        </>
      )}
    </div>
  );
}
