// @vitest-environment jsdom
// Entrar en Mercadona desde la app (trozo 8): el botón entra con la casa, y si sale bien vuelve a leer el estado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const nativa = vi.hoisted(() => ({ valor: true }));
vi.mock("../lib/apiUrl.js", async (original) => ({
  ...(await original()),
  get isNativeApp() { return nativa.valor; },
}));

const { Conectar } = await import("./ConectarMercadona.jsx");
const { TEXTO_NO_ENTRADO } = await import("../lib/mercadonaApp.js");
const { NO_ENTRADO_MERCADONA } = await import("../lib/vocabularios.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let contenedor;

async function pintar(props) {
  contenedor = document.body.appendChild(document.createElement("div"));
  root = createRoot(contenedor);
  await act(async () => root.render(<Conectar caducada={false} casa="casa-1" {...props} />));
}
const boton = () => [...contenedor.querySelectorAll("button")].find((b) => /Entrar en Mercadona/.test(b.textContent));
const pulsar = () => act(async () => boton().click());

beforeEach(() => {
  nativa.valor = true;
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("entrar en Mercadona desde la app", () => {
  it("entra con la casa y, si sale bien, vuelve a leer el estado", async () => {
    const entrar = vi.fn(async () => ({ ok: true }));
    const alEntrar = vi.fn();
    await pintar({ entrar, alEntrar });
    await pulsar();
    expect(entrar).toHaveBeenCalledWith("casa-1");
    expect(alEntrar).toHaveBeenCalledTimes(1);
  });

  it("si se acaba el tiempo, lo dice y no vuelve a leer", async () => {
    const alEntrar = vi.fn();
    await pintar({ entrar: async () => ({ ok: false, motivo: NO_ENTRADO_MERCADONA.TIEMPO }), alEntrar });
    await pulsar();
    expect(contenedor.textContent).toContain(TEXTO_NO_ENTRADO[NO_ENTRADO_MERCADONA.TIEMPO]);
    expect(alEntrar).not.toHaveBeenCalled();
  });

  it("si la persona cierra la ventana, no dice nada y el botón sigue ahí", async () => {
    await pintar({ entrar: async () => ({ ok: false, motivo: NO_ENTRADO_MERCADONA.CERRADA }) });
    const antes = contenedor.textContent;
    await pulsar();
    expect(contenedor.textContent).toBe(antes);
    expect(boton().disabled).toBe(false);
  });

  it("cada motivo de no entrar tiene su texto, o nada a propósito", () => {
    for (const motivo of Object.values(NO_ENTRADO_MERCADONA)) expect(motivo in TEXTO_NO_ENTRADO).toBe(true);
  });
});
