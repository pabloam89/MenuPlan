// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import HojaComprar, { SIN_SERVICIO } from "./HojaComprar.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
const pintar = async (mercadona) => {
  caja = document.createElement("div");
  document.body.append(caja);
  raiz = createRoot(caja);
  await act(async () => raiz.render(<HojaComprar resumen="21 productos por 109,14 €" mercadona={mercadona} onClose={() => {}} />));
};
// Una cuenta conectada sin nada pedido: lo que pinta RellenarMercadona.
const CONECTADA = { servicio: true, conectada: true, encargo: null, esperando: false, sinNoticias: false, aviso: null, rellenar: vi.fn(), mirar: vi.fn(), desconectar: vi.fn() };

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
  document.body.innerHTML = "";
});

describe("HojaComprar", () => {
  it("con la cuenta conectada, solo el paso de rellenar: ni un enlace a productos", async () => {
    await pintar(CONECTADA);
    expect(document.body.textContent).toContain("Rellenar mi lista en Mercadona");
    expect(document.body.querySelectorAll('a[href*="/product/"]')).toHaveLength(0);
  });

  it("sin el servicio, dice que aún no está encendido, sin la lista", async () => {
    await pintar({ servicio: false });
    expect(document.body.textContent).toContain(SIN_SERVICIO);
    expect(document.body.querySelectorAll('a[href*="/product/"]')).toHaveLength(0);
  });
});
