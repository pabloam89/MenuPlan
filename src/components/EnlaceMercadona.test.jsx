// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@capgo/capacitor-inappbrowser", () => ({ InAppBrowser: {}, ToolBarType: { COMPACT: "compact" } }));
const { EnlaceMercadona } = await import("./EnlaceMercadona.jsx");
const { ABRIR_EN, TEXTO_ABRIR } = await import("../lib/mercadonaAbrir.js");

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
const botonCon = (texto) => [...document.querySelectorAll("button")].find((b) => b.textContent === texto);

afterEach(async () => {
  await act(async () => raiz.unmount());
  document.body.innerHTML = "";
});

/** En la app, con la elección que haya guardada (o ninguna). */
const enApp = (guardada = null) => ({
  nativa: true,
  abrirWeb: vi.fn(async () => ({ ok: true })),
  abrirApp: vi.fn(),
  leer: vi.fn(() => guardada),
  guardar: vi.fn(),
});

describe("EnlaceMercadona", () => {
  it("en la web es un enlace normal a la lista, en otra pestaña", async () => {
    await pintar({ nativa: false });
    const a = caja.querySelector("a");
    expect(a.href).toBe(LISTA);
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noreferrer");
  });

  it("en la app, la primera vez pregunta: web o app de Mercadona, y aún no abre nada", async () => {
    const p = enApp();
    await pintar(p);
    expect(caja.querySelector("a")).toBeNull();
    await act(async () => botonCon("Abrir lista").click());
    expect(document.body.textContent).toContain(TEXTO_ABRIR.PREGUNTA);
    expect(botonCon(TEXTO_ABRIR.WEB)).toBeTruthy();
    expect(botonCon(TEXTO_ABRIR.APP)).toBeTruthy();
    expect(document.body.textContent).toContain(TEXTO_ABRIR.SI_LA_TIENES);
    // Fuera de donde está el botón (otra hoja o la barra de Compra), colgada del body y en la capa de hoja sobre hoja.
    const eleccion = document.querySelector("[data-eleccion-mercadona]");
    expect(eleccion.parentElement).toBe(document.body);
    expect(caja.contains(eleccion)).toBe(false);
    expect(eleccion.style.zIndex).toBe("var(--capa-hoja-2)");
    expect(p.abrirWeb).not.toHaveBeenCalled();
    expect(p.abrirApp).not.toHaveBeenCalled();
  });

  it("al elegir la web, la abre dentro de HoMenu, lo recuerda y cierra la pregunta", async () => {
    const p = enApp();
    await pintar(p);
    await act(async () => botonCon("Abrir lista").click());
    await act(async () => botonCon(TEXTO_ABRIR.WEB).click());
    expect(p.guardar).toHaveBeenCalledWith(ABRIR_EN.WEB);
    expect(p.abrirWeb).toHaveBeenCalledWith(LISTA);
    expect(p.abrirApp).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(TEXTO_ABRIR.PREGUNTA);
  });

  it("al elegir la app, la abre en la app de Mercadona y lo recuerda", async () => {
    const p = enApp();
    await pintar(p);
    await act(async () => botonCon("Abrir lista").click());
    await act(async () => botonCon(TEXTO_ABRIR.APP).click());
    expect(p.guardar).toHaveBeenCalledWith(ABRIR_EN.APP);
    expect(p.abrirApp).toHaveBeenCalledWith(LISTA);
    expect(p.abrirWeb).not.toHaveBeenCalled();
  });

  it("con la app ya elegida, va directa a la app, sin preguntar", async () => {
    const p = enApp(ABRIR_EN.APP);
    await pintar(p);
    await act(async () => botonCon("Abrir lista").click());
    expect(p.abrirApp).toHaveBeenCalledWith(LISTA);
    expect(p.guardar).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(TEXTO_ABRIR.PREGUNTA);
  });

  it("con la web ya elegida, va directa a la web, sin preguntar", async () => {
    const p = enApp(ABRIR_EN.WEB);
    await pintar(p);
    await act(async () => botonCon("Abrir lista").click());
    expect(p.abrirWeb).toHaveBeenCalledWith(LISTA);
    expect(p.abrirApp).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(TEXTO_ABRIR.PREGUNTA);
  });
});
