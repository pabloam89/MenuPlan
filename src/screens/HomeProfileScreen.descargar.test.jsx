// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HomeProfileScreen } from "./HomeProfileScreen.jsx";
import { color as tono } from "../design/tokens.js";

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

// «Formas de entrar» (#1238, specs/auth.md §7): una fila como las demás; dentro, cada forma con su interruptor.
describe("perfil: formas de entrar", () => {
  afterEach(() => {
    act(() => raices.forEach((r) => r.unmount()));
    raices = [];
  });
  const formas = [
    { forma: "telegram", tiene: true, apagable: false },
    { forma: "google", tiene: false, apagable: false },
    { forma: "apple", tiene: true, apagable: true },
  ];
  const fila = (caja) => [...caja.querySelectorAll("button")].find((b) => b.textContent.includes("Formas de entrar"));
  const interruptor = (nombre) => document.querySelector(`[role="switch"][aria-label="${nombre}"]`);
  const abrir = async (props) => {
    const caja = await pintar(props);
    await act(async () => { fila(caja).click(); });
    return caja;
  };

  it("la fila dice con qué entras y no enseña la lista hasta tocarla", async () => {
    const caja = await pintar({ formasDeEntrar: formas });
    expect(fila(caja).textContent).toContain("Entras con Telegram y Apple");
    expect(interruptor("Google")).toBeNull();
  });

  it("encender añade, apagar quita", async () => {
    const onAnadirFormaDeEntrar = vi.fn();
    const onQuitarFormaDeEntrar = vi.fn();
    await abrir({ formasDeEntrar: formas, onAnadirFormaDeEntrar, onQuitarFormaDeEntrar });
    await act(async () => { interruptor("Google").click(); });
    expect(onAnadirFormaDeEntrar).toHaveBeenCalledWith("google");
    await act(async () => { interruptor("Apple").click(); });
    expect(onQuitarFormaDeEntrar).toHaveBeenCalledWith("apple");
  });

  it("lo que no se puede apagar sale encendido y no responde", async () => {
    const onQuitarFormaDeEntrar = vi.fn();
    await abrir({ formasDeEntrar: formas, onQuitarFormaDeEntrar });
    const telegram = interruptor("Telegram");
    expect(telegram.getAttribute("aria-checked")).toBe("true");
    expect(telegram.disabled).toBe(true);
    await act(async () => { telegram.click(); });
    expect(onQuitarFormaDeEntrar).not.toHaveBeenCalled();
  });

  it("sin sesión no sale, y el botón suelto de antes ya no está", async () => {
    const caja = await pintar({ formasDeEntrar: null });
    expect(fila(caja)).toBeUndefined();
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
    const muestra = document.createElement("div");
    muestra.style.background = tono["marca-fondo"];
    expect(banda.style.background).toBe(muestra.style.background);
    expect(banda.querySelector("button:last-child").textContent).toBe("Atrás");
    expect(banda.textContent).toBe("Mi perfilAtrás");
  });
});
