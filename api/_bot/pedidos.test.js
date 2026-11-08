import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { dondeQuedaron } = await import("./generar.js");

describe("dónde quedó un plato pedido", () => {
  const pedidos = [{ pedido: "salmón", aproximada: true, fijo: { catalogId: "pescados_1", name: "Salmón a la plancha" } }];
  // El motor planifica la semana entera; si es jueves, el lunes ya pasó.
  const plan = { g: { "Lun-Comida": { recipeId: "g__pescados_1" }, "Jue-Comida": { recipeId: "g__carnes_2" } } };

  it("en un día que ya pasó, no cuenta como puesto (y se recoloca)", () => {
    expect(dondeQuedaron(pedidos, plan, ["Jue", "Vie", "Sáb", "Dom"])[0]).toMatch(/no ha cabido/);
  });

  it("en un día activo, sí", () => {
    expect(dondeQuedaron(pedidos, plan, ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"])[0]).toMatch(/→ Salmón a la plancha \(lunes, comida\)/);
  });
});
