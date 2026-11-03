// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DeckFilter } from "./Menu.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function montar(elemento) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  act(() => { createRoot(caja).render(elemento); });
  return caja;
}

const textos = (caja) => [...caja.querySelectorAll("button")].map((b) => b.textContent.trim());

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
