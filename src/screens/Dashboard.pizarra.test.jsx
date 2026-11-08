// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DashboardScreen } from "./Dashboard.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("tarjeta «Empieza en blanco»", () => {
  it("no le pasa el clic a onStartPizarra (el evento lleva window y rompe todo guardado)", () => {
    const onStartPizarra = vi.fn();
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    act(() => {
      createRoot(caja).render(
        <DashboardScreen
          user={null}
          data={{ members: [], groups: [] }}
          menuPlan={{}}
          onNav={() => {}}
          onViewMenu={() => {}}
          onOpenAccount={() => {}}
          onStartPizarra={onStartPizarra}
        />,
      );
    });
    const boton = [...caja.querySelectorAll("button")].find((b) => b.textContent.includes("Empieza en blanco"));
    act(() => boton.click());
    expect(onStartPizarra).toHaveBeenCalledTimes(1);
    expect(onStartPizarra.mock.calls[0]).toEqual([]);
  });
});
