// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HuecosVivosContext } from "../lib/huecosVivos.js";
import { PizarraControles } from "./PizarraControles.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function montar(elemento) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  act(() => { createRoot(caja).render(elemento); });
  return caja;
}

const textos = (caja) => [...caja.querySelectorAll("button")].map((b) => b.textContent.trim());

describe("fila de mandos de la pizarra", () => {
  const props = {
    data: { members: [], groups: [] },
    setData: () => {},
    menuPlan: {},
    groups: [],
    onRellenar: () => {},
    despensa: [],
    onAddDespensa: () => {},
  };
  const hueco = { groupId: "g1", day: "lun", meal: "cena", course: "main" };

  it("con huecos enseña las cuatro baldosas de una vez, sin flecha ni otra cara", () => {
    const caja = montar(
      <HuecosVivosContext.Provider value={[hueco]}>
        <PizarraControles {...props} />
      </HuecosVivosContext.Provider>,
    );
    // El «1» es la chapa de huecos de Rellenar.
    expect(textos(caja)).toEqual(["1Rellenar", "En casa", "Balance", "Batch"]);
  });

  it("sin huecos, Rellenar se va y las demás siguen", () => {
    const caja = montar(
      <HuecosVivosContext.Provider value={[]}>
        <PizarraControles {...props} />
      </HuecosVivosContext.Provider>,
    );
    expect(textos(caja)).toEqual(["En casa", "Balance", "Batch"]);
  });
});
