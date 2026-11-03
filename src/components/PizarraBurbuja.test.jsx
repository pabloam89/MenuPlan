// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PizarraBurbuja } from "./PizarraBurbuja.jsx";
import lolaFoto from "../assets/lola/lola-perfil.jpg";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Quien hace los cambios pedidos con palabras es Lola, la misma del chat: el
 * botón flotante lleva su cara, no un icono genérico, y lo dice su etiqueta.
 */
describe("el botón flotante de la pizarra", () => {
  it("cerrado, enseña la cara de Lola y se anuncia como Lola", () => {
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    act(() => { createRoot(caja).render(<PizarraBurbuja onOrden={async () => ({})} onDeshacer={() => {}} />); });
    const boton = caja.querySelector('button[aria-label="Pedirle un cambio a Lola"]');
    expect(boton).not.toBeNull();
    expect(boton.querySelector("img")?.getAttribute("src")).toBe(lolaFoto);
  });
});
