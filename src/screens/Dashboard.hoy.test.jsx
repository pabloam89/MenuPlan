// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DashboardScreen } from "./Dashboard.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { diaDeFecha } from "../lib/dias.js";
import { isoLocalDate } from "../lib/weekCalendar.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.useRealTimers());

describe("«Hoy toca» mirando otra semana", () => {
  it("enseña el plato de hoy aunque la semana a la vista esté vacía", () => {
    const receta = { id: "prueba_hoy", name: "Plato de prueba", time: 20 };
    RECIPES_BY_ID[receta.id] = receta;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 12));
    const hoy = isoLocalDate(new Date());
    const dia = diaDeFecha(new Date());
    const planHoy = { g1: { [`${dia}-Comida`]: { recipeId: receta.id } } };
    const data = {
      members: [{ id: "p1", name: "Ana" }],
      groups: [{ id: "g1", label: "Casa", memberIds: ["p1"] }],
      activeMenuId: "m",
      menuWeek: { offset: 1 },
      menus: {
        m: {
          weeks: {
            a: { offset: 0, startISO: hoy, endISO: hoy, plan: planHoy },
            b: { offset: 1, startISO: "2999-01-04", endISO: "2999-01-10", plan: {} },
          },
        },
      },
    };
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    act(() => {
      createRoot(caja).render(
        <DashboardScreen user={null} data={data} menuPlan={{}} onNav={() => {}} onViewMenu={() => {}} onOpenAccount={() => {}} />,
      );
    });
    expect(caja.textContent).toContain(receta.name);
  });
});
