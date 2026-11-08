// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AjustesMercadona } from "./AjustesMercadona.jsx";
import { AJUSTE_MERCADONA } from "../lib/mercadonaApp.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raices = [];
async function pintar(m) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  raices.push(raiz);
  await act(async () => {
    raiz.render(<AjustesMercadona m={{ conectada: false, caducada: false, aviso: null, desconectar: vi.fn(), ...m }} />);
  });
  return caja;
}
const interruptor = (caja, nombre) => caja.querySelector(`[role="switch"][aria-label="${nombre}"]`);

describe("Ajustes → Mercadona (trozo 9)", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
    document.body.innerHTML = "";
  });

  it("«Hacer la lista» está encendido si la cuenta está dentro, y apagarlo sale de Mercadona", async () => {
    const desconectar = vi.fn();
    const caja = await pintar({ conectada: true, desconectar });
    const lista = interruptor(caja, AJUSTE_MERCADONA.LISTA);
    expect(lista.getAttribute("aria-checked")).toBe("true");
    await act(async () => { lista.click(); });
    expect(desconectar).toHaveBeenCalledTimes(1);
  });

  it("sin cuenta, encender «Hacer la lista» lleva a entrar en Mercadona y no desconecta nada", async () => {
    const desconectar = vi.fn();
    const caja = await pintar({ conectada: false, desconectar });
    const lista = interruptor(caja, AJUSTE_MERCADONA.LISTA);
    expect(lista.getAttribute("aria-checked")).toBe("false");
    expect(caja.textContent).not.toContain("Mercadona ha cerrado");
    await act(async () => { lista.click(); });
    expect(lista.getAttribute("aria-checked")).toBe("true");
    // La pantalla de entrar (Conectar) ya está en el árbol: en jsdom, sin puntero fino, da su texto de móvil.
    expect(caja.textContent).toContain("Se hace una sola vez");
    expect(desconectar).not.toHaveBeenCalled();
  });

  it("«Pagar la compra» se ve apagado, con «Pronto», y no se puede encender", async () => {
    const desconectar = vi.fn();
    const caja = await pintar({ conectada: true, desconectar });
    const pagar = interruptor(caja, AJUSTE_MERCADONA.PAGAR);
    expect(pagar.getAttribute("aria-checked")).toBe("false");
    expect(pagar.disabled).toBe(true);
    expect(caja.textContent).toContain(AJUSTE_MERCADONA.PRONTO);
    await act(async () => { pagar.click(); });
    expect(pagar.getAttribute("aria-checked")).toBe("false");
    expect(desconectar).not.toHaveBeenCalled();
  });
});
