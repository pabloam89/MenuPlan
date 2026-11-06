// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import BarraComprar, { PildoraLola } from "./BarraComprar.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
const pintar = async (props) => {
  caja = document.createElement("div");
  document.body.append(caja);
  raiz = createRoot(caja);
  await act(async () => raiz.render(<BarraComprar total="92,70 €" productos={46} onComprar={() => {}} {...props} />));
};
const boton = (nombre) => caja.querySelector(`button[aria-label="${nombre}"]`);

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
});

describe("BarraComprar", () => {
  it("enseña el total y los productos, y comprar abre el paso siguiente", async () => {
    const onComprar = vi.fn();
    await pintar({ onComprar });
    expect(caja.textContent).toContain("92,70 €");
    expect(caja.textContent).toContain("46 productos");
    await act(async () => boton("Comprar · 92,70 €").click());
    expect(onComprar).toHaveBeenCalledTimes(1);
  });

  it("un solo producto va en singular", async () => {
    await pintar({ productos: 1 });
    expect(caja.textContent).toContain("1 producto");
    expect(caja.textContent).not.toContain("1 productos");
  });

  it("Lola solo sale si se puede hablar con ella", async () => {
    await pintar({});
    expect(boton("¿Falta algo? Díselo a Lola")).toBeNull();
    await act(async () => raiz.unmount());
    caja.remove();
    const onLola = vi.fn();
    await pintar({ onLola });
    await act(async () => boton("¿Falta algo? Díselo a Lola").click());
    expect(onLola).toHaveBeenCalledTimes(1);
  });

  it("sin nada que comprar, la píldora de Lola abre a Lola", async () => {
    const onClick = vi.fn();
    caja = document.createElement("div");
    document.body.append(caja);
    raiz = createRoot(caja);
    await act(async () => raiz.render(<PildoraLola onClick={onClick} />));
    expect(caja.textContent).toBe("¿Falta algo? Díselo a Lola");
    await act(async () => caja.querySelector("button").click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
