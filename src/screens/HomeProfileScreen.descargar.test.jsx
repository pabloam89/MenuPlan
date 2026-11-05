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

// «Formas de entrar» (#1238, specs/auth.md §7): cada una con su estado real, en lugar del botón suelto de Google.
describe("perfil: formas de entrar", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
  });
  const formas = [{ forma: "telegram", tiene: true }, { forma: "google", tiene: false }, { forma: "apple", tiene: true }];
  const seccion = (caja) => caja.querySelector('section[aria-label="Formas de entrar"]');

  it("enseña lo que tiene con ✓ y lo que no con «Añadir», que lo añade", async () => {
    const onAnadirFormaDeEntrar = vi.fn();
    const caja = await pintar({ formasDeEntrar: formas, onAnadirFormaDeEntrar });
    const s = seccion(caja);
    expect([...s.querySelectorAll('[role="img"]')].map((e) => e.getAttribute("aria-label"))).toEqual(["Ya entras con Telegram", "Ya entras con Apple"]);
    const anadir = [...s.querySelectorAll("button")];
    expect(anadir.map((b) => b.getAttribute("aria-label"))).toEqual(["Añadir Google"]);
    await act(async () => { anadir[0].click(); });
    expect(onAnadirFormaDeEntrar).toHaveBeenCalledWith("google");
  });

  it("dice para qué sirve cuando la cuenta entra con Telegram", async () => {
    expect(seccion(await pintar({ formasDeEntrar: formas })).textContent).toContain("Por si un día no tienes Telegram a mano.");
    expect(seccion(await pintar({ formasDeEntrar: [{ forma: "google", tiene: true }] })).textContent).not.toContain("Telegram");
  });

  it("sin sesión no sale, y el botón suelto de antes ya no está", async () => {
    const caja = await pintar({ formasDeEntrar: null });
    expect(seccion(caja)).toBeNull();
    expect(caja.textContent).not.toContain("Entrar también con Google");
  });
});

describe("perfil: la cabecera", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
  });

  it("es una franja propia, con «Atrás» al final y sin el papel en la casa", async () => {
    const caja = await pintar({ onBack: () => {}, activeHousehold: { id: "c1", name: "Casa", role: "owner" } });
    const banda = caja.querySelector("header");
    expect(banda.style.background).not.toBe("");
    expect(banda.querySelector("button:last-child").textContent).toBe("Atrás");
    expect(banda.textContent).toBe("Mi perfilAtrás");
  });
});
