// Lo que cuesta la lista, como una cuenta: cada concepto a la izquierda y su
// cifra a la derecha, en columna. Los productos de Mercadona llevan el total;
// los ingredientes sin producto, solo cuántos (no tienen total). Bajo una raya,
// el presupuesto de la casa. «Producto» es siempre uno de Mercadona, como en la
// barra de Comprar; lo de la lista es un «ingrediente».

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

const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * `productos` es cuántos productos de Mercadona; `sinProducto`, cuántos
 * ingredientes no tienen producto (listaFrenteAPresupuesto); `total` y `presupuesto` ya
 * van formateados (`presupuesto` null si la casa no tiene, y entonces no hay
 * raya ni fila). `noCabe` pinta el presupuesto en rojo.
 */
export default function ResumenCompra({ productos, sinProducto, total, presupuesto = null, noCabe = false }) {
  return (
    <div style={tabla}>
      <span>{cuantos(productos, "producto", "productos")}</span>
      <span style={{ ...cifra, fontWeight: "var(--tipo-peso-900)" }}>{total}</span>
      {sinProducto > 0 && (
        <>
          <span style={suave}>{cuantos(sinProducto, "ingrediente sin producto", "ingredientes sin producto")}</span>
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
