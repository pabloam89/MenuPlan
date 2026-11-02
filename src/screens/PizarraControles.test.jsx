// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HuecosVivosContext } from "../lib/huecosVivos.js";
import { PizarraControles } from "./PizarraControles.jsx";
import { DeckFilter } from "./Menu.jsx";

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

describe("chips del filtro de la pizarra", () => {
  const groups = [{ id: "g1", label: "Adultos" }, { id: "g2", label: "Niños" }];

  it("enseña cada menú por su nombre y marca el elegido", () => {
    const caja = montar(<DeckFilter chips groups={groups} scope="g2" onScopeChange={() => {}} members={[]} />);
    expect(textos(caja)).toEqual(["Todos", "Adultos", "Niños"]);
    const marcados = [...caja.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(marcados).toEqual(["Niños"]);
  });

  it("tocar un chip va a ese menú, no al siguiente de la lista", () => {
    const onScopeChange = vi.fn();
    const caja = montar(<DeckFilter chips groups={groups} scope="all" onScopeChange={onScopeChange} members={[]} />);
    const ninos = [...caja.querySelectorAll("button")].find((b) => b.textContent === "Niños");
    act(() => { ninos.click(); });
    expect(onScopeChange).toHaveBeenCalledWith("g2");
  });

  it("un menú que ya no existe cae en Todos", () => {
    const caja = montar(<DeckFilter chips groups={groups} scope="borrado" onScopeChange={() => {}} members={[]} />);
    const marcados = [...caja.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(marcados).toEqual(["Todos"]);
  });
});
