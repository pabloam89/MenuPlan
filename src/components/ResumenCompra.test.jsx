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
const renglones = () => [...caja.firstChild.children].map((r) => r.textContent);

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
});

describe("ResumenCompra", () => {
  it("lo que tiene precio con su total y, debajo, lo que no, sin total", async () => {
    await pintar({ sinPrecio: 3 });
    expect(renglones()).toEqual(["12 productos con precio45 €", "3 productos sin precio"]);
  });

  it("sin productos sin precio, un solo renglón", async () => {
    await pintar();
    expect(renglones()).toEqual(["12 productos con precio45 €"]);
  });

  it("el presupuesto va al lado del total, y en singular dice producto", async () => {
    await pintar({ conPrecio: 1, sinPrecio: 1, presupuesto: "80 €" });
    expect(renglones()).toEqual(["1 producto con precio45 €de 80 €", "1 producto sin precio"]);
  });
});
