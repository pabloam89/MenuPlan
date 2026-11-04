// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, useState } from "react";
import { QuienCome } from "./Menu.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function montar(elemento) {
  const caja = document.createElement("div");
  document.body.appendChild(caja);
  act(() => { createRoot(caja).render(elemento); });
  return caja;
}

const persona = (id, name) => ({ id, name, photo: `/${id}.png` });
const casa = [persona("p1", "Pablo"), persona("p2", "Ana"), persona("p3", "Leo"), persona("p4", "Mía"), persona("p5", "Sol")];
const caras = (caja) => caja.querySelectorAll("img").length;

describe("quién come, en la fila de la pizarra", () => {
  it("con un solo menú enseña las caras de quien come y no es un botón", () => {
    const onScopeChange = vi.fn();
    const grupos = [{ id: "g1", label: "Familia", memberIds: ["p1", "p2", "p3", "p4"] }];
    const caja = montar(<QuienCome groups={grupos} scope="all" onScopeChange={onScopeChange} members={casa} />);
    expect(caja.querySelector("button")).toBeNull();
    // Tres caras y el «+1»: cuatro personas, la quinta no está en el menú.
    expect(caras(caja)).toBe(3);
    expect(caja.textContent).toContain("+1");
    expect(caja.querySelector('[role="img"]').getAttribute("aria-label")).toBe("Comen: Pablo, Ana, Leo, Mía");
    caja.firstChild.click();
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it("con dos menús rota Todos → A → B → Todos, dice cuál es y filtra con el scope", () => {
    const onScopeChange = vi.fn();
    const grupos = [
      { id: "ga", label: "Mayores", memberIds: ["p1", "p2"] },
      { id: "gb", label: "Peques", memberIds: ["p3"] },
    ];
    function Pantalla() {
      const [scope, setScope] = useState("all");
      return <QuienCome groups={grupos} scope={scope} onScopeChange={(s) => { onScopeChange(s); setScope(s); }} members={casa} />;
    }
    const caja = montar(<Pantalla />);
    const boton = () => caja.querySelector("button");
    const vistos = [];
    for (let i = 0; i < 4; i++) {
      vistos.push([boton().textContent.replace(/\+\d+/, "").trim(), boton().getAttribute("aria-label"), caras(caja)]);
      if (i < 3) act(() => boton().click());
    }
    expect(vistos).toEqual([
      ["Todos", "Menú de Todos. Toca para ver Mayores", 3],
      ["Mayores", "Menú de Mayores. Toca para ver Peques", 2],
      ["Peques", "Menú de Peques. Toca para ver Todos", 1],
      ["Todos", "Menú de Todos. Toca para ver Mayores", 3],
    ]);
    expect(onScopeChange.mock.calls.map((c) => c[0])).toEqual(["ga", "gb", "all"]);
  });

  it("un menú que ya no existe cae en Todos", () => {
    const grupos = [{ id: "ga", label: "Mayores" }, { id: "gb", label: "Peques" }];
    const caja = montar(<QuienCome groups={grupos} scope="borrado" onScopeChange={() => {}} members={casa} />);
    expect(caja.querySelector("button").getAttribute("aria-label")).toBe("Menú de Todos. Toca para ver Mayores");
  });
});
