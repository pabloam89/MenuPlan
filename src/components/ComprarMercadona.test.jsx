// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../lib/mercadonaApp.js", async (original) => ({
  ...(await original()),
  leerEstado: vi.fn(),
  pedirLista: vi.fn(),
  quitarCuenta: vi.fn(async () => ({ ok: true })),
}));

const { RellenarMercadona } = await import("./ComprarMercadona.jsx");
const app = await import("../lib/mercadonaApp.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const LISTA = { name: "Compra", products: [{ merca_code: "1", quantity: 1 }] };
const BASE = { ok: true, disponible: true, clave_publica: "clave", cuenta: "conectada", encargo: null };
let root;
let contenedor;

async function pintar(ui) {
  contenedor = document.body.appendChild(document.createElement("div"));
  root = createRoot(contenedor);
  await act(async () => root.render(ui));
}
const boton = (texto) => [...contenedor.querySelectorAll("button")].find((b) => b.textContent.includes(texto));
const pulsar = (b) => act(async () => b.click());

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn(() => ({ matches: true }));
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  delete window.opener;
});

describe("RellenarMercadona", () => {
  it.each([
    ["sin respuesta", { ok: false }],
    ["sin servicio", { ...BASE, disponible: false }],
    ["sin clave", { ...BASE, clave_publica: null }],
  ])("%s no pinta nada", async (_, estado) => {
    app.leerEstado.mockResolvedValue(estado);
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.textContent).toBe("");
  });

  it("sin cuenta, con ratón, ofrece el marcador con su enlace", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, cuenta: null });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.querySelector("a").getAttribute("href")).toMatch(/^javascript:/);
    expect(contenedor.textContent).toContain("Nunca veo tu contraseña");
  });

  it("con la sesión caducada pide conectar otra vez", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, cuenta: "caducada" });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.textContent).toContain("ha cerrado la sesión");
  });

  it("pide la lista y espera", async () => {
    app.leerEstado.mockResolvedValue(BASE);
    app.pedirLista.mockResolvedValue({ ok: true, encargo: { id: "e", status: "pendiente" } });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Rellenar mi lista"));
    expect(app.pedirLista).toHaveBeenCalledWith("c", LISTA);
    expect(boton("Rellenando").disabled).toBe(true);
  });

  it("acabada, da el enlace y lo que entró", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, encargo: { status: "hecho", entraron: 3, faltan: [], lista_xid: "7" } });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.textContent).toContain("Lista creada con 3 productos");
    expect(contenedor.querySelector("a").href).toContain("shopping-lists/7");
  });

  it("si falló, lo dice y deja reintentar", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, encargo: { status: "fallido", fallo: "bloqueado" } });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.textContent).toContain("no nos ha dejado");
    expect(boton("Rellenar mi lista").disabled).toBe(false);
  });

  it("un tope o un encargo en marcha se explica", async () => {
    app.leerEstado.mockResolvedValue(BASE);
    app.pedirLista.mockResolvedValue({ ok: true, fallo: "tope" });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Rellenar mi lista"));
    expect(contenedor.textContent).toContain("muchas listas");
  });

  it("si la cuenta ya no vale al pedir, vuelve a mirar y ofrece conectar", async () => {
    app.leerEstado.mockResolvedValueOnce(BASE).mockResolvedValue({ ...BASE, cuenta: "caducada" });
    app.pedirLista.mockResolvedValue({ ok: true, fallo: "sesion_caducada" });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Rellenar mi lista"));
    expect(contenedor.textContent).toContain("ha cerrado la sesión");
  });

  it("desconectar borra la cuenta y vuelve a ofrecer conectar", async () => {
    app.leerEstado.mockResolvedValueOnce(BASE).mockResolvedValue({ ...BASE, cuenta: null });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Desconectar"));
    expect(app.quitarCuenta).toHaveBeenCalledWith("c");
    expect(contenedor.textContent).toContain("Conecta tu cuenta");
  });
});
