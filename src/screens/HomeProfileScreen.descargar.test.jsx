// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HomeProfileScreen } from "./HomeProfileScreen.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raices = [];
async function pintar(props) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  raices.push(raiz);
  await act(async () => {
    raiz.render(<HomeProfileScreen user={{ id: "u1", email: "a@b.c" }} data={{ members: [] }} setData={() => {}} onNav={() => {}} onBack={() => {}} onDeleteAccount={() => {}} {...props} />);
  });
  return caja;
}
const fila = (caja) => [...caja.querySelectorAll("button")].find((b) => b.textContent.includes("Descargar mis datos"));

describe("perfil: descargar mis datos (trozo 36)", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
  });

  it("con sesión y casa sale la fila, y pulsarla pide la descarga", async () => {
    const onExportData = vi.fn();
    const caja = await pintar({ onExportData });
    expect(fila(caja)).toBeTruthy();
    await act(async () => { fila(caja).click(); });
    expect(onExportData).toHaveBeenCalledTimes(1);
  });

  it("sin a quién exportar (sin sesión o sin casa) no sale", async () => {
    expect(fila(await pintar({ onExportData: null }))).toBeUndefined();
  });
});
