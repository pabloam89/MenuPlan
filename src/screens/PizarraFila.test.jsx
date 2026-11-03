// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PizarraControles } from "./PizarraControles.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * La fila de la pizarra es la única puerta a las acciones del menú: la
 * cabecera ya no tiene burger, rayo ni corazón. Si una de estas baldosas se
 * pierde, esa acción deja de existir en la app.
 */
function montar(props = {}) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  act(() => {
    createRoot(caja).render(
      <PizarraControles
        data={{ members: [], groups: [], menuWeek: { offset: 0 } }}
        setData={() => {}}
        menuPlan={{}}
        groups={[]}
        onNuevaPizarra={() => {}}
        onVaciar={() => {}}
        onFavorito={() => {}}
        onCompartir={() => {}}
        onMenus={props.onMenus ?? (() => {})}
        onDescargar={props.onDescargar ?? (() => {})}
      />,
    );
  });
  return caja;
}

const etiquetas = (caja) => [...caja.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);

describe("la fila de acciones de la pizarra", () => {
  it("lleva lo que antes estaba en el burger: menús guardados y descargar", () => {
    const onMenus = vi.fn();
    const onDescargar = vi.fn();
    const caja = montar({ onMenus, onDescargar });
    const boton = (txt) => [...caja.querySelectorAll("button")].find((b) => b.textContent.trim() === txt);
    act(() => boton("Menús").click());
    act(() => boton("Descargar").click());
    expect(onMenus).toHaveBeenCalledTimes(1);
    expect(onDescargar).toHaveBeenCalledTimes(1);
  });

  it("deja Vaciar la última de las acciones, lejos del pulgar", () => {
    const lista = etiquetas(montar());
    const vaciar = lista.indexOf("Vaciar");
    expect(vaciar).toBeGreaterThan(-1);
    for (const otra of ["Nueva", "Menús", "Compartir", "Favorito", "Descargar"]) {
      expect(lista.indexOf(otra)).toBeGreaterThan(-1);
      expect(lista.indexOf(otra)).toBeLessThan(vaciar);
    }
  });
});
