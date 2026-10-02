import { describe, expect, it } from "vitest";

import { marcasEntre } from "./tacharLector.js";

const semana = [
  { name: "leche", unit: "ud", qty: 2, have: false },
  { name: "Leche", unit: "ud", qty: 1, have: false },
  { name: "huevos", unit: "ud", qty: 12, have: true },
  { name: "harina", unit: "g", qty: 500, have: false },
];

describe("lo que el lector manda al tachar", () => {
  it("solo los cambios de comprado, con el nombre y la unidad guardados", () => {
    const despues = [
      { name: "leche", unit: "ud", qty: 3, have: true }, // la pantalla juntó las dos leches
      { name: "huevos", unit: "ud", qty: 12, have: true },
      { name: "harina", unit: "g", qty: 500, have: false },
    ];
    expect(marcasEntre(semana, despues)).toEqual([
      { name: "leche", unit: "ud", have: true },
      { name: "Leche", unit: "ud", have: true },
    ]);
  });

  it("destachar también viaja", () => {
    const despues = semana.map((it) => (it.name === "huevos" ? { ...it, have: false } : it));
    expect(marcasEntre(semana, despues)).toEqual([{ name: "huevos", unit: "ud", have: false }]);
  });

  it("nada que no estuviera, ni cantidades", () => {
    const despues = [...semana.map((it) => ({ ...it, qty: 99 })), { name: "lejía", unit: "ud", have: true }];
    expect(marcasEntre(semana, despues)).toEqual([]);
  });
});
