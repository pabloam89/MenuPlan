// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { ArranqueDePizarra, SALIDA_ARRANQUE_MS } from "./PizarraControles.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("la hoja de arranque de la pizarra", () => {
  it("espera lo que dura su animación de salida", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const segundos = css.match(/\.mp-arranque-out\s*\{[^}]*?\bmpArranqueOut\s+([\d.]+)s/)[1];
    expect(SALIDA_ARRANQUE_MS).toBe(Number(segundos) * 1000);
  });

  it("se cierra con la X, una sola vez aunque el toque sea doble", () => {
    vi.useFakeTimers();
    const onSalir = vi.fn();
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    act(() => {
      createRoot(caja).render(
        <ArranqueDePizarra
          data={{ members: [], groups: [] }}
          setData={() => {}}
          onAplicar={() => {}}
          onEmpezar={() => {}}
          onSalir={onSalir}
        />,
      );
    });
    const x = caja.querySelector('[aria-label="Cerrar"]');
    act(() => x.click());
    act(() => x.click());
    expect(onSalir).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    vi.useRealTimers();
    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});
