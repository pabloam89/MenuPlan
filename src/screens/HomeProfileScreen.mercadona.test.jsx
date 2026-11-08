// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const leerEstado = vi.fn();
vi.mock("../lib/mercadonaApp.js", async (original) => ({ ...(await original()), leerEstado: (...a) => leerEstado(...a) }));
const { HomeProfileScreen } = await import("./HomeProfileScreen.jsx");
const { AJUSTE_MERCADONA } = await import("../lib/mercadonaApp.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raices = [];
async function pintar(props) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  raices.push(raiz);
  await act(async () => {
    raiz.render(<HomeProfileScreen user={{ id: "u1", email: "a@b.c" }} data={{ members: [] }} setData={() => {}} onNav={() => {}} onBack={() => {}} onDeleteAccount={() => {}} activeHousehold={{ id: "casa-1", name: "Mi casa" }} {...props} />);
  });
  return caja;
}
const fila = (caja) => [...caja.querySelectorAll("button")].find((b) => b.textContent.startsWith("Mercadona"));

describe("perfil: la fila de Mercadona (trozo 9)", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
    document.body.innerHTML = "";
    leerEstado.mockReset();
  });

  it("sin el servicio abierto para la casa no sale", async () => {
    leerEstado.mockResolvedValue({ ok: true, disponible: false, cuenta: null, clave_publica: null });
    expect(fila(await pintar())).toBeUndefined();
    expect(leerEstado).toHaveBeenCalledWith("casa-1");
  });

  it("con el servicio sale, y abre los dos interruptores", async () => {
    leerEstado.mockResolvedValue({ ok: true, disponible: true, cuenta: "conectada", clave_publica: "x" });
    const caja = await pintar();
    expect(fila(caja)).toBeTruthy();
    await act(async () => { fila(caja).click(); });
    expect(document.querySelector(`[role="switch"][aria-label="${AJUSTE_MERCADONA.LISTA}"]`).getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(`[role="switch"][aria-label="${AJUSTE_MERCADONA.PAGAR}"]`)).toBeTruthy();
  });
});
