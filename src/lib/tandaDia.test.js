import { describe, expect, it } from "vitest";
import { claveDeBase, sesionDeBases } from "./bases.js";
import { conTandaPedida } from "./libretaEnData.js";
import { estadoDe } from "./notepad.js";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const COMIDAS = ["Cena"];
const planDe = (dias) => ({ g1: Object.fromEntries(dias.map((d) => [`${d}-Cena`, { recipeId: `plato-${d}`, eaters: 2 }])) });
const catalogo = (dias, claves) =>
  Object.fromEntries(dias.map((d) => [`plato-${d}`, { id: `plato-${d}`, name: d, basesAparte: claves, mealRole: ["cena"] }]));

describe("el día de la tanda", () => {
  it("con la tanda el miércoles, el arroz vale miércoles y jueves; el lunes siguiente, al congelador", () => {
    // Arroz: 2 días de nevera, congelable. Cocinado el miércoles, el lunes
    // queda a 5 días.
    const s = sesionDeBases(planDe(["Lun", "Mié", "Jue"]), catalogo(["Lun", "Mié", "Jue"], ["arroz"]), { dias: DIAS, comidas: COMIDAS, diaTanda: "Mié" });
    const arroz = s.bases.find((b) => claveDeBase(b.base) === "arroz");
    const por = Object.fromEntries(arroz.huecos.map((h) => [h.clave, h.desde]));
    expect(por).toEqual({ "Lun-Cena": "congelador", "Mié-Cena": "nevera", "Jue-Cena": "nevera" });
  });

  it("sin día dicho, como siempre: se cuenta desde el día antes del primero", () => {
    const s = sesionDeBases(planDe(["Lun", "Mié", "Jue"]), catalogo(["Lun", "Mié", "Jue"], ["arroz"]), { dias: DIAS, comidas: COMIDAS });
    const arroz = s.bases.find((b) => claveDeBase(b.base) === "arroz");
    expect(arroz.huecos.map((h) => h.desde)).toEqual(["nevera", "congelador", "congelador"]);
  });
});

describe("pedir una tanda (la misma escritura en la app y en el chat)", () => {
  const casa = () => ({ cookTime: { mode: "shared", weekday: { Comida: 30, Cena: 30 }, weekend: { Comida: 60, Cena: 60 } } });

  it("pedir la primera base la apunta como DICHA y abre el finde", () => {
    const d = conTandaPedida(casa(), "tanda.sofrito", 3);
    expect(d.tanda).toEqual({ sofrito: 3 });
    expect(estadoDe(d.notepad, "tanda.sofrito")).toBe("fijado");
    expect(d.cookTime.weekend.Comida).toBe(90);
  });

  it("pedir otra no vuelve a tocar el finde; quitar la última lo cierra", () => {
    let d = conTandaPedida(casa(), "tanda.sofrito", 3);
    d = { ...d, cookTime: { ...d.cookTime, weekend: { Comida: 120, Cena: 120 } } };   // ajustado a mano
    d = conTandaPedida(d, "tandaPlatos.croquetas-crudas", 1);
    expect(d.cookTime.weekend.Comida).toBe(120);
    d = conTandaPedida(conTandaPedida(d, "tandaPlatos.croquetas-crudas", 0), "tanda.sofrito", 0);
    expect(d.cookTime.weekend.Comida).toBe(30);
  });
});
