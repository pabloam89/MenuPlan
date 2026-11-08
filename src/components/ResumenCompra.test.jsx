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
  await act(async () => raiz.render(<ResumenCompra conPrecio={12} sinPrecio={0} total="45 €" {...props} />));
};
// Las celdas de la tabla, en orden: concepto, cifra, concepto, cifra…; la raya sale como «—».
const celdas = () => [...caja.firstChild.children].map((c) => (c.tagName === "DIV" ? "—" : c.textContent));

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
});

describe("ResumenCompra", () => {
  it("con precio y su total; debajo, sin precio y sin cifra; raya y presupuesto", async () => {
    await pintar({ sinPrecio: 3, presupuesto: "80 €" });
    expect(celdas()).toEqual(["12 productos con precio", "45 €", "3 productos sin precio", "", "—", "Presupuesto", "80 €"]);
  });

  it("sin productos sin precio ni presupuesto, una sola fila", async () => {
    await pintar();
    expect(celdas()).toEqual(["12 productos con precio", "45 €"]);
  });

  it("en singular dice producto", async () => {
    await pintar({ conPrecio: 1, sinPrecio: 1 });
    expect(celdas()).toEqual(["1 producto con precio", "45 €", "1 producto sin precio", ""]);
  });
});
