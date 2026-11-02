// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { lolaConectada } = vi.hoisted(() => ({ lolaConectada: vi.fn() }));
vi.mock("../lib/frontalBot.js", async (original) => ({ ...(await original()), lolaConectada }));

// El recuerdo vive en el módulo: cada test parte de uno recién cargado.
async function cargar() {
  vi.resetModules();
  return (await import("./Dashboard.jsx")).LolaCard;
}

let raices = [];
async function pintar(LolaCard) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  raices.push(raiz);
  await act(async () => { raiz.render(<LolaCard />); });
  return { caja, raiz };
}

const rotulo = (caja) => caja.querySelector("button > span");

describe("LolaCard", () => {
  beforeEach(() => lolaConectada.mockReset());
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
  });

  it("no enseña ningún texto hasta saber si hay conexión, y luego uno solo", async () => {
    let responder;
    lolaConectada.mockReturnValue(new Promise((r) => { responder = r; }));
    const { caja } = await pintar(await cargar());
    expect(rotulo(caja).style.visibility).toBe("hidden");
    await act(async () => responder(false));
    expect(rotulo(caja).textContent).toBe("Conecta con Lola");
    expect(rotulo(caja).style.visibility).toBe("visible");
  });

  it("si no se puede saber, dice «Pídeselo»", async () => {
    lolaConectada.mockResolvedValue(null);
    const { caja } = await pintar(await cargar());
    expect(rotulo(caja).textContent).toBe("Pídeselo a Lola");
    expect(rotulo(caja).style.visibility).toBe("visible");
  });

  it("al volver a Inicio sale ya el texto sabido, y un fallo de red no lo cambia", async () => {
    lolaConectada.mockResolvedValue(false);
    const LolaCard = await cargar();
    await pintar(LolaCard);
    let responder;
    lolaConectada.mockReturnValue(new Promise((r) => { responder = r; }));
    const { caja } = await pintar(LolaCard);
    expect(rotulo(caja).textContent).toBe("Conecta con Lola");
    expect(rotulo(caja).style.visibility).toBe("visible");
    await act(async () => responder(null));
    expect(rotulo(caja).textContent).toBe("Conecta con Lola");
  });
});
