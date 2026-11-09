// @vitest-environment jsdom
// Trozo 17: «Reservar la hora de entrega» en Ajustes. Sale de `llega_hasta`, pide lo que falte y no deja nada a medias.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AjustesMercadona } from "./AjustesMercadona.jsx";
import { AJUSTE_MERCADONA, SIN_MIRAR, TELEFONO, TEXTO_FALTA } from "../lib/mercadonaApp.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LISTO = { tiene_direccion: true, tiene_pago: true, tiene_telefono: true };
let raices = [];
async function pintar(m) {
  const caja = document.body.appendChild(document.createElement("div"));
  const raiz = createRoot(caja);
  raices.push(raiz);
  const todo = { conectada: true, caducada: false, aviso: null, llega_hasta: "lista", desconectar: vi.fn(), cambiarLlegaHasta: vi.fn(async () => []), guardarTelefono: vi.fn(async () => true), ...LISTO, ...m };
  await act(async () => raiz.render(<AjustesMercadona m={todo} />));
  return { caja, m: todo };
}
const reservar = (caja) => caja.querySelector(`[role="switch"][aria-label="${AJUSTE_MERCADONA.RESERVAR}"]`);
const pulsar = (el) => act(async () => el.click());

describe("Ajustes → Mercadona: reservar la hora de entrega (trozo 17)", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
    document.body.innerHTML = "";
  });

  it("sale de llega_hasta, y sin cuenta no se puede encender", async () => {
    expect(reservar((await pintar({ llega_hasta: "reservar" })).caja).getAttribute("aria-checked")).toBe("true");
    expect(reservar((await pintar({ llega_hasta: "pagar" })).caja).getAttribute("aria-checked")).toBe("true");
    expect(reservar((await pintar({ llega_hasta: "lista" })).caja).getAttribute("aria-checked")).toBe("false");
    expect(reservar((await pintar({ conectada: false, llega_hasta: "reservar" })).caja).disabled).toBe(true);
  });

  it("con todo lo que hace falta, encender pide `reservar` y apagar vuelve a `lista`", async () => {
    const { caja, m } = await pintar({});
    await pulsar(reservar(caja));
    expect(m.cambiarLlegaHasta).toHaveBeenCalledWith("reservar");
    const otro = await pintar({ llega_hasta: "reservar" });
    await pulsar(reservar(otro.caja));
    expect(otro.m.cambiarLlegaHasta).toHaveBeenCalledWith("lista");
  });

  it("sin dirección, lo dice en una línea y no cambia nada", async () => {
    const { caja, m } = await pintar({ tiene_direccion: false });
    await pulsar(reservar(caja));
    expect(caja.textContent).toContain(TEXTO_FALTA.direccion);
    expect(m.cambiarLlegaHasta).not.toHaveBeenCalled();
  });

  it("sin mirar la cuenta todavía, dice que se mirará", async () => {
    const { caja, m } = await pintar({ tiene_direccion: null, tiene_pago: null });
    await pulsar(reservar(caja));
    expect(caja.textContent).toContain(SIN_MIRAR);
    expect(m.cambiarLlegaHasta).not.toHaveBeenCalled();
  });

  it("sin teléfono, lo pide; al guardarlo, enciende `reservar`", async () => {
    const { caja, m } = await pintar({ tiene_telefono: false });
    await pulsar(reservar(caja));
    expect(m.cambiarLlegaHasta).not.toHaveBeenCalled();
    const casilla = caja.querySelector(`input[aria-label="${TELEFONO.ETIQUETA}"]`);
    expect(casilla.type).toBe("tel");
    await act(async () => {
      const fijar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      fijar.call(casilla, "600 11 22 33");
      casilla.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => caja.querySelector("form").requestSubmit());
    expect(m.guardarTelefono).toHaveBeenCalledWith("600 11 22 33");
    expect(m.cambiarLlegaHasta).toHaveBeenCalledWith("reservar");
  });

  it("si no se pudo guardar (red o servidor), no dice que el teléfono esté mal", async () => {
    const { caja, m } = await pintar({ tiene_telefono: false, guardarTelefono: vi.fn(async () => null), aviso: TELEFONO.NO_GUARDADO });
    await pulsar(reservar(caja));
    await act(async () => caja.querySelector("form").requestSubmit());
    expect(caja.textContent).not.toContain(TELEFONO.MAL);
    expect(caja.textContent).toContain(TELEFONO.NO_GUARDADO);
    expect(m.cambiarLlegaHasta).not.toHaveBeenCalled();
  });

  it("un teléfono que no vale lo dice y no enciende nada", async () => {
    const { caja, m } = await pintar({ tiene_telefono: false, guardarTelefono: vi.fn(async () => false) });
    await pulsar(reservar(caja));
    await act(async () => caja.querySelector("form").requestSubmit());
    expect(caja.textContent).toContain(TELEFONO.MAL);
    expect(m.cambiarLlegaHasta).not.toHaveBeenCalled();
  });
});
