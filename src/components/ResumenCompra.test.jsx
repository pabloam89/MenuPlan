// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ResumenCompra from "./ResumenCompra.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
const pintar = async (props) => {
  caja = document.createElement("div");
  document.body.append(caja);
  raiz = createRoot(caja);
  await act(async () => raiz.render(<ResumenCompra productos={12} sinProducto={0} total="45 €" {...props} />));
};
// Las celdas de la tabla, en orden: concepto, cifra, concepto, cifra…; la raya sale como «—».
const celdas = () => [...caja.firstChild.children].map((c) => (c.tagName === "DIV" ? "—" : c.textContent));

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
});

describe("ResumenCompra", () => {
  it("productos y su total; debajo, ingredientes sin producto y sin cifra; raya y presupuesto", async () => {
    await pintar({ sinProducto: 3, presupuesto: "80 €" });
    expect(celdas()).toEqual(["12 productos", "45 €", "3 ingredientes sin producto", "—", "Presupuesto", "80 €"]);
  });

  it("sin ingredientes sin producto ni presupuesto, una sola fila", async () => {
    await pintar();
    expect(celdas()).toEqual(["12 productos", "45 €"]);
  });

  it("en singular, producto e ingrediente", async () => {
    await pintar({ productos: 1, sinProducto: 1 });
    expect(celdas()).toEqual(["1 producto", "45 €", "1 ingrediente sin producto"]);
  });
});
