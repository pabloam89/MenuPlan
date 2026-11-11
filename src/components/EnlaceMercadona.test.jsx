// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@capgo/capacitor-inappbrowser", () => ({ InAppBrowser: {}, ToolBarType: { COMPACT: "compact" } }));
const { EnlaceMercadona } = await import("./EnlaceMercadona.jsx");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const LISTA = "https://tienda.mercadona.es/shopping-lists/7";

let raiz;
let caja;
const pintar = async (props) => {
  caja = document.createElement("div");
  document.body.append(caja);
  raiz = createRoot(caja);
  await act(async () => raiz.render(<EnlaceMercadona href={LISTA} {...props}>Abrir lista</EnlaceMercadona>));
};

afterEach(async () => {
  await act(async () => raiz.unmount());
  caja.remove();
});

describe("EnlaceMercadona", () => {
  it("en la web es un enlace normal a la lista, en otra pestaña", async () => {
    await pintar({ nativa: false });
    const a = caja.querySelector("a");
    expect(a.href).toBe(LISTA);
    expect(a.target).toBe("_blank");
  });

  it("en la app abre la lista dentro de HoMenu, sin pasar por Safari", async () => {
    const abrir = vi.fn(async () => ({ ok: true }));
    await pintar({ nativa: true, abrir });
    expect(caja.querySelector("a")).toBeNull();
    await act(async () => caja.querySelector("button").click());
    expect(abrir).toHaveBeenCalledWith(LISTA);
  });
});
