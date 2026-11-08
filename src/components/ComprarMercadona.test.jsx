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

const { RellenarMercadona: Hoja } = await import("./ComprarMercadona.jsx");
const { HOJA_COMPRAR, hojaConLista, pasoDeComprar, useRellenarMercadona } = await import("./useRellenarMercadona.js");
const app = await import("../lib/mercadonaApp.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const LISTA = { name: "Compra", products: [{ merca_code: "1", quantity: 1 }] };
const BASE = { ok: true, disponible: true, clave_publica: "clave", cuenta: "conectada", encargo: null };
let root;
let contenedor;

function RellenarMercadona({ casa, lista }) {
  return <Hoja m={useRellenarMercadona(casa, lista)} />;
}

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

describe("hojaConLista", () => {
  it("desde Comprar no repite la lista; desde el total, sí", () => {
    expect(hojaConLista(HOJA_COMPRAR.COMPRAR, { servicio: true })).toBe(false);
    expect(hojaConLista(HOJA_COMPRAR.TOTAL, { servicio: true })).toBe(true);
  });

  it("sin el servicio, la lista sale siempre: es la única forma de comprar", () => {
    expect(hojaConLista(HOJA_COMPRAR.COMPRAR, { servicio: false })).toBe(true);
  });
});

describe("pasoDeComprar", () => {
  const hecho = { status: "hecho", entraron: 3, faltan: [], lista_xid: "7" };

  it("sin pedir nada, comprar", () => {
    expect(pasoDeComprar({ encargo: hecho, vigente: false })).toEqual({ texto: "Comprar", nota: null });
  });

  it("mientras se rellena, ocupado; sin noticias, deja mirar", () => {
    expect(pasoDeComprar({ esperando: true })).toEqual({ texto: "Rellenando…", ocupado: true });
    expect(pasoDeComprar({ esperando: true, sinNoticias: true })).toMatchObject({ texto: "Mirar cómo va", mirar: true });
  });

  it("hecha la lista pedida, la abre", () => {
    const paso = pasoDeComprar({ encargo: hecho, vigente: true });
    expect(paso).toMatchObject({ texto: "Abrir lista", nota: expect.stringContaining("3 productos") });
    expect(paso.href).toContain("shopping-lists/7");
  });

  it("si falló, vuelve a comprar y dice qué pasó", () => {
    expect(pasoDeComprar({ encargo: { status: "fallido", fallo: "bloqueado" }, vigente: true }).texto).toBe("Comprar");
    expect(pasoDeComprar({ encargo: { status: "fallido", fallo: "bloqueado" }, vigente: true }).nota).toContain("no nos ha dejado");
  });
});

describe("el botón sigue a la lista", () => {
  function Paso({ lista }) {
    const m = useRellenarMercadona("c", lista);
    return <button onClick={m.rellenar}>{pasoDeComprar(m).texto}</button>;
  }

  it("si cambia la lista tras pedirla, deja de abrir la vieja", async () => {
    app.leerEstado.mockResolvedValue(BASE);
    app.pedirLista.mockResolvedValue({ ok: true, encargo: { status: "hecho", entraron: 1, faltan: [], lista_xid: "7" } });
    await pintar(<Paso lista={LISTA} />);
    await pulsar(boton("Comprar"));
    expect(contenedor.textContent).toBe("Abrir lista");
    await act(async () => root.render(<Paso lista={{ ...LISTA, products: [] }} />));
    expect(contenedor.textContent).toBe("Comprar");
  });
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
    expect(contenedor.textContent).toContain("HoMenu no ve ni guarda tu contraseña");
  });

  it("con la sesión caducada pide entrar otra vez", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, cuenta: "caducada" });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    expect(contenedor.textContent).toContain("Vuelve a entrar en Mercadona");
  });

  it("pide la lista y espera", async () => {
    app.leerEstado.mockResolvedValue(BASE);
    app.pedirLista.mockResolvedValue({ ok: true, encargo: { id: "e", status: "pendiente" } });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Rellenar mi lista"));
    expect(app.pedirLista).toHaveBeenCalledWith("c", LISTA);
    expect(boton("Rellenando").disabled).toBe(true);
  });

  describe("mientras se rellena", () => {
    const EN_MARCHA = { ...BASE, encargo: { id: "e", status: "rellenando" } };
    const avanzar = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms));

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("pasada la espera lo dice, deja de preguntar y deja mirar otra vez", async () => {
      app.leerEstado.mockResolvedValue(EN_MARCHA);
      await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
      await avanzar(app.ESPERA_MAX_MS + app.CADA_MS);
      expect(contenedor.textContent).toContain("no sé cómo va");
      const consultas = app.leerEstado.mock.calls.length;
      await avanzar(app.CADA_MS * 3);
      expect(app.leerEstado).toHaveBeenCalledTimes(consultas);
      app.leerEstado.mockResolvedValue({ ...BASE, encargo: { status: "hecho", entraron: 3, faltan: [], lista_xid: "7" } });
      await pulsar(boton("Mirar cómo va"));
      await avanzar(app.CADA_MS);
      expect(contenedor.textContent).toContain("Lista creada con 3 productos");
    });

    it("si no responde varias veces seguidas, lo dice", async () => {
      app.leerEstado.mockResolvedValueOnce(EN_MARCHA).mockResolvedValue({ ok: false });
      await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
      await avanzar(app.CADA_MS * (app.FALLOS_MAX - 1));
      expect(contenedor.textContent).not.toContain("no sé cómo va");
      await avanzar(app.CADA_MS);
      expect(contenedor.textContent).toContain("no sé cómo va");
    });
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
    expect(contenedor.textContent).toContain("Vuelve a entrar en Mercadona");
  });

  it("sin casa no pregunta nada", async () => {
    await pintar(<RellenarMercadona casa={null} lista={LISTA} />);
    expect(app.leerEstado).not.toHaveBeenCalled();
  });

  it("desconectar borra la cuenta y vuelve a ofrecer conectar", async () => {
    app.leerEstado.mockResolvedValueOnce(BASE).mockResolvedValue({ ...BASE, cuenta: null });
    await pintar(<RellenarMercadona casa="c" lista={LISTA} />);
    await pulsar(boton("Desconectar"));
    expect(app.quitarCuenta).toHaveBeenCalledWith("c");
    expect(contenedor.textContent).toContain("Entra en tu cuenta de Mercadona");
  });
});
