// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PizarraControles } from "./PizarraControles.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * La fila de la pizarra es la puerta a las acciones del menú: la cabecera ya
 * no tiene burger ni corazón. Si una de estas baldosas se pierde, esa acción
 * deja de existir en la pizarra.
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
        quienCome={props.quienCome}
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

describe("«Nueva» con un menú que ya tiene platos", () => {
  it("avisa antes y no empieza hasta que se confirma", () => {
    const onNueva = vi.fn();
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    act(() => {
      createRoot(caja).render(
        <PizarraControles
          data={{ members: [], groups: [], menuWeek: { offset: 0 } }}
          setData={() => {}}
          menuPlan={{ g1: { "Lun-comida": { recipeId: "r1" } } }}
          groups={[]}
          onNuevaPizarra={onNueva}
          conCuenta
        />,
      );
    });
    const boton = (donde, txt) => [...donde.querySelectorAll("button")].find((b) => b.textContent.trim() === txt);
    act(() => boton(caja, "Nueva").click());
    // El aviso va por portal, colgado del body.
    const dialogo = document.querySelector('[role="dialog"]');
    expect(onNueva).not.toHaveBeenCalled();
    expect(dialogo?.textContent).toMatch(/queda en «Menús»/);
    act(() => boton(dialogo, "Empezar").click());
    expect(onNueva).toHaveBeenCalledTimes(1);
  });
});

describe("el orden de la fila", () => {
  it("pone quién come a la izquierda y el chevron a la derecha", () => {
    const caja = montar({ quienCome: <span data-testid="caras" /> });
    const fila = caja.querySelector('[data-testid="caras"]').parentElement;
    expect(fila.firstElementChild.dataset.testid).toBe("caras");
    expect(fila.lastElementChild.getAttribute("aria-label")).toBe("Ver los ajustes");
  });
});
