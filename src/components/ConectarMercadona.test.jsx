// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../lib/mercadonaApp.js", async (original) => ({
  ...(await original()),
  leerEstado: vi.fn(),
  guardarSesion: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/mercadonaSello.js", () => ({ sellar: vi.fn(async () => "sellada") }));

const { RecibirCuentaMercadona } = await import("./ConectarMercadona.jsx");
const app = await import("../lib/mercadonaApp.js");
const { MENSAJE_LISTA, ORIGEN_TIENDA } = await import("../lib/mercadonaConectar.js");
const { sellar } = await import("../lib/mercadonaSello.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const BASE = { ok: true, disponible: true, clave_publica: "clave", cuenta: "conectada", encargo: null };
let root;
let contenedor;

async function pintar(ui) {
  contenedor = document.body.appendChild(document.createElement("div"));
  root = createRoot(contenedor);
  await act(async () => root.render(ui));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  delete window.opener;
});

describe("RecibirCuentaMercadona", () => {
  const SESION = { mo: JSON.stringify({ token: "t", uuid: "u" }), cookies: "a=1" };
  const llega = (origin, data = SESION) => act(async () => window.dispatchEvent(new MessageEvent("message", { origin, data })));

  beforeEach(() => {
    window.opener = { postMessage: vi.fn() };
    app.leerEstado.mockResolvedValue(BASE);
  });

  it("sin casa pide entrar y no avisa al marcador", async () => {
    await pintar(<RecibirCuentaMercadona casa={null} />);
    expect(contenedor.textContent).toContain("Entra en HoMenu");
    expect(window.opener.postMessage).not.toHaveBeenCalled();
  });

  it("avisa solo a Mercadona de que está lista", async () => {
    await pintar(<RecibirCuentaMercadona casa="c" />);
    expect(window.opener.postMessage).toHaveBeenCalledWith(MENSAJE_LISTA, ORIGEN_TIENDA);
  });

  it("sella la sesión con la clave y envía solo el sello", async () => {
    await pintar(<RecibirCuentaMercadona casa="c" />);
    await llega(ORIGEN_TIENDA);
    expect(sellar.mock.calls[0][1]).toBe("clave");
    expect(app.guardarSesion).toHaveBeenCalledWith("c", "sellada");
    expect(contenedor.textContent).toContain("Cuenta conectada");
  });

  it("no hace caso a otra web", async () => {
    await pintar(<RecibirCuentaMercadona casa="c" />);
    await llega("https://mala.test");
    expect(app.guardarSesion).not.toHaveBeenCalled();
  });

  it("sin clave pública no recibe nada", async () => {
    app.leerEstado.mockResolvedValue({ ...BASE, clave_publica: null });
    await pintar(<RecibirCuentaMercadona casa="c" />);
    expect(contenedor.textContent).toContain("No se ha podido conectar");
    expect(window.opener.postMessage).not.toHaveBeenCalled();
  });

  it("si Mercadona manda algo sin sesión, lo dice y no envía nada", async () => {
    await pintar(<RecibirCuentaMercadona casa="c" />);
    await llega(ORIGEN_TIENDA, { mo: "{}", cookies: "" });
    expect(contenedor.textContent).toContain("No se ha podido conectar");
    expect(app.guardarSesion).not.toHaveBeenCalled();
  });
});
