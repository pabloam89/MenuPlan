// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingRestrictions } from "./Onboarding.jsx";
import { alergiasRevisadas } from "../lib/alergiasBase.js";

/**
 * «Nada que evitar» cierra el alta y la app genera el primer menú en ese mismo
 * clic. La marca de «alergias revisadas» entraba con un setData que aún no
 * había llegado a quien generaba: el motor recibía la casa SIN revisar,
 * esquivaba los 14 alérgenos (27 recetas) y el menú salía con huecos (la e2e
 * de #1064: viernes y sábado sin cena). Quien sigue tras el clic recibe la
 * casa ya marcada.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const casaSinRevisar = () => ({
  members: [
    { id: "m1", name: "Juan", homeRole: "Papá", allergies: [], dislikes: [] },
    { id: "m2", name: "Ana", homeRole: "Mamá", allergies: [], dislikes: [] },
  ],
  allergiesReviewed: false,
  customAllergies: [],
});

let contenedor;
let raiz;
afterEach(() => {
  act(() => raiz?.unmount());
  contenedor?.remove();
});

describe("OnboardingRestrictions: el clic que sigue lleva la casa revisada", () => {
  it("«Nada que evitar» pasa a onNext la casa con todos revisados", { timeout: 60000 }, () => {
    const data = casaSinRevisar();
    expect(data.members.some((m) => alergiasRevisadas(data, m))).toBe(false);
    const onNext = vi.fn();
    contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    raiz = createRoot(contenedor);
    act(() => raiz.render(<OnboardingRestrictions data={data} setData={() => {}} onNext={onNext} />));
    const boton = [...contenedor.querySelectorAll("button")].find((b) => b.textContent.trim() === "Nada que evitar");
    expect(boton, "el botón «Nada que evitar»").toBeTruthy();
    act(() => boton.click());
    expect(onNext).toHaveBeenCalledTimes(1);
    const revisada = onNext.mock.calls[0][0];
    expect(revisada?.allergiesReviewed).toBe(true);
    expect(revisada.members.every((m) => alergiasRevisadas(revisada, m))).toBe(true);
  });
});
