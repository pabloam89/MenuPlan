// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, useState } from "react";
import { QuienCome, DeckFilter } from "./Menu.jsx";
import { opcionesDeMenu } from "../lib/groups.js";

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
  const dosMenus = [
    { id: "ga", label: "Mayores", memberIds: ["p1", "p2"] },
    { id: "gb", label: "Peques", memberIds: ["p3"] },
  ];
  const unMenu = [{ id: "g1", label: "Familia", memberIds: ["p1", "p2", "p3", "p4"] }];
  function Pantalla({ grupos, espia = () => {} }) {
    const [scope, setScope] = useState("all");
    const [persona, setPersona] = useState(null);
    return (
      <QuienCome
        groups={grupos} scope={scope} members={casa} persona={persona}
        onScopeChange={(x) => { espia("menu", x); setScope(x); }}
        onPersona={(x) => { espia("persona", x); setPersona(x); }}
      />
    );
  }
  const boton = (caja) => caja.querySelector("button[data-coach]");
  const hoja = () => document.body.querySelector('[role="dialog"]');
  const opcion = (texto) => [...hoja().querySelectorAll("button")].find((b) => b.textContent.includes(texto));
  const abrir = (caja) => act(() => boton(caja).click());

  it("con una sola persona es la cara y no es un botón", () => {
    const sola = [persona("p1", "Pablo")];
    const caja = montar(<QuienCome groups={[{ id: "g1", label: "Familia", memberIds: ["p1"] }]} scope="all" onScopeChange={() => {}} members={sola} />);
    expect(caja.querySelector("button")).toBeNull();
    expect(caja.querySelector('[role="img"]').getAttribute("aria-label")).toBe("Comen: Pablo");
  });

  it("con un solo menú ya se puede tocar, y la hoja lleva a cada persona", () => {
    const espia = vi.fn();
    const caja = montar(<Pantalla grupos={unMenu} espia={espia} />);
    expect(caras(caja)).toBe(3);
    expect(caja.textContent).toContain("+1");
    expect(boton(caja).getAttribute("aria-label")).toBe("Quién come: Todos. Toca para elegir");
    abrir(caja);
    expect(opcion("Familia")).toBeUndefined();
    act(() => opcion("Ana").click());
    expect(espia.mock.calls).toEqual([["menu", "g1"], ["persona", "p2"]]);
    expect(hoja()).toBeNull();
    expect(boton(caja).getAttribute("aria-label")).toBe("Quién come: Ana. Toca para elegir");
    expect(caras(caja)).toBe(1);
  });

  it("tocar las caras abre la hoja y no cambia nada hasta elegir", () => {
    const espia = vi.fn();
    const caja = montar(<Pantalla grupos={dosMenus} espia={espia} />);
    abrir(caja);
    expect(hoja()).not.toBeNull();
    expect(espia).not.toHaveBeenCalled();
    act(() => hoja().parentElement.click());
  });

  it("elegir un menú quita a la persona elegida", () => {
    const espia = vi.fn();
    const caja = montar(<Pantalla grupos={dosMenus} espia={espia} />);
    abrir(caja);
    act(() => opcion("Leo").click());
    abrir(caja);
    act(() => opcion("Mayores").click());
    expect(espia.mock.calls).toEqual([["menu", "gb"], ["persona", "p3"], ["menu", "ga"], ["persona", null]]);
    expect(boton(caja).getAttribute("aria-label")).toBe("Quién come: Mayores. Toca para elegir");
    expect(caras(caja)).toBe(2);
  });

  it("alguien sin menú deja el tablero en Todos", () => {
    const espia = vi.fn();
    const caja = montar(<Pantalla grupos={dosMenus} espia={espia} />);
    abrir(caja);
    act(() => opcion("Sol").click());
    expect(espia.mock.calls).toEqual([["menu", "all"], ["persona", "p5"]]);
  });

  it("un menú que ya no existe cae en Todos", () => {
    const caja = montar(<QuienCome groups={dosMenus} scope="borrado" onScopeChange={() => {}} members={casa} />);
    expect(boton(caja).getAttribute("aria-label")).toBe("Quién come: Todos. Toca para elegir");
  });

  it("QuienCome y DeckFilter sacan las opciones de opcionesDeMenu: el mismo nombre para el mismo menú", () => {
    const grupos = [{ id: "ga", label: "Mayores" }, { id: "gx", label: "interno", adHoc: true, reason: "sin-motivo-conocido" }];
    expect(opcionesDeMenu(grupos, "gx").opciones.map((o) => o.label)).toEqual(["Todos", "Mayores", "Menú individual"]);
    expect(opcionesDeMenu(grupos, "borrado").indice).toBe(0);
    const quien = montar(<QuienCome groups={grupos} scope="gx" onScopeChange={() => {}} members={casa} />);
    const filtro = montar(<DeckFilter groups={grupos} scope="gx" onScopeChange={() => {}} members={casa} />);
    expect(boton(quien).getAttribute("aria-label")).toBe("Quién come: Menú individual. Toca para elegir");
    expect(filtro.querySelector("button").getAttribute("aria-label")).toBe("Filtrar menú (Menú individual)");
  });
});
