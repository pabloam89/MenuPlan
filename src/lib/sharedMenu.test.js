import { describe, it, expect } from "vitest";
import { buildSharedMenuPayload } from "./sharedMenu.js";

const members = [
  { id: "a1", name: "Pablo", age: 38, photo: "/foto-pablo.jpg", allergies: ["frutos_secos"] },
  { id: "a2", name: "Marta", age: 36, photo: null },
  { id: "n1", name: "Lucía", age: 7, photo: "/foto-lucia.jpg" },
];

const groups = [
  { id: "adultos", memberIds: ["a1", "a2"] },
  { id: "ninos", memberIds: ["n1"] },
];

const menuPlan = {
  adultos: {
    "Lun-Comida": { firstRecipeId: "sopas_cremas_001", recipeId: "carnes_001" },
    "Lun-Cena": { recipeId: "huevos_002" },
  },
  ninos: {
    "Lun-Comida": { recipeId: "pasta_arroces_001" },
  },
};

const NAMES = {
  sopas_cremas_001: "Crema de calabacín",
  carnes_001: "Pollo al horno",
  huevos_002: "Tortilla francesa",
  pasta_arroces_001: "Macarrones con tomate",
  user_secreta: "Guiso de la abuela",
};

const build = (over = {}) =>
  buildSharedMenuPayload({
    menuPlan, groups, members,
    meals: ["Comida", "Cena"],
    weekStart: "2026-09-01",
    dishName: (id) => NAMES[id] ?? null,
    isReadable: (id) => id !== "user_secreta",
    ...over,
  });

describe("buildSharedMenuPayload", () => {
  it("saca los platos por día, comida y grupo", () => {
    const lun = build().weeks[0].days.find((d) => d.day === "Lun");
    expect(lun.meals).toHaveLength(3); // comida adultos + comida niños + cena adultos
    const comidaAdultos = lun.meals[0];
    expect(comidaAdultos.slot).toBe("Comida");
    expect(comidaAdultos.dishes.map((x) => x.name)).toEqual(["Crema de calabacín", "Pollo al horno"]);
    expect(comidaAdultos.eaters).toEqual(["a1", "a2"]);
  });

  it("no incluye los días sin nada planificado", () => {
    const days = build().weeks[0].days.map((d) => d.day);
    expect(days).toEqual(["Lun"]);
  });

  it("quita el prefijo de grupo del id de receta", () => {
    const payload = build({ menuPlan: { adultos: { "Lun-Comida": { recipeId: "adultos__carnes_001" } } } });
    expect(payload.weeks[0].days[0].meals[0].dishes[0].recipeId).toBe("carnes_001");
  });

  it("marca readable:false en la receta propia que sigue en privado", () => {
    const payload = build({ menuPlan: { adultos: { "Lun-Comida": { recipeId: "user_secreta" } } } });
    const dish = payload.weeks[0].days[0].meals[0].dishes[0];
    // El nombre se comparte igual: el menú no puede salir con agujeros.
    expect(dish.name).toBe("Guiso de la abuela");
    expect(dish.readable).toBe(false);
    expect(dish.source).toBe("user");
  });

  it("los miembros salen anónimos: ni nombre, ni edad, ni alergias", () => {
    const [first] = build().members;
    expect(Object.keys(first).sort()).toEqual(["avatar", "id", "role"]);
    const json = JSON.stringify(build());
    expect(json).not.toContain("Pablo");
    expect(json).not.toContain("Lucía");
    expect(json).not.toContain("frutos_secos");
  });

  it("distingue adulto de niño, que es el único contexto que se comparte", () => {
    const roles = Object.fromEntries(build().members.map((m) => [m.id, m.role]));
    expect(roles).toEqual({ a1: "adulto", a2: "adulto", n1: "nino" });
  });

  it("solo incluye a quien aparece comiendo", () => {
    const payload = build({ groups: [{ id: "adultos", memberIds: ["a1", "a2"] }] });
    expect(payload.members.map((m) => m.id)).toEqual(["a1", "a2"]);
  });

  it("nunca arrastra compra, presupuesto ni horarios aunque vengan en el plan", () => {
    // El menú vivo lleva estos campos en la misma estructura. La función copia
    // lo que comparte en vez de quitar lo que no, así que no pueden colarse.
    const payload = build({
      menuPlan: {
        adultos: {
          "Lun-Comida": { recipeId: "carnes_001", precio: 12.4, shopping: ["pollo"], fueraDeCasa: true },
        },
      },
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain("precio");
    expect(json).not.toContain("shopping");
    expect(json).not.toContain("fueraDeCasa");
  });

  it("aguanta un menú vacío sin reventar", () => {
    const payload = buildSharedMenuPayload({});
    expect(payload.v).toBe(1);
    expect(payload.weeks[0].days).toEqual([]);
    expect(payload.members).toEqual([]);
  });
});

describe("buildSharedMenuPayload · onlyDays (compartir solo hoy)", () => {
  const plan2dias = {
    adultos: {
      "Lun-Comida": { recipeId: "carnes_001" },
      "Mar-Comida": { recipeId: "huevos_002" },
    },
  };

  it("con onlyDays solo sale ese día, y los demás ni siquiera entran al payload", () => {
    const payload = build({ menuPlan: plan2dias, onlyDays: ["Mar"] });
    expect(payload.weeks[0].days.map((d) => d.day)).toEqual(["Mar"]);
    expect(JSON.stringify(payload)).not.toContain("Pollo al horno");
  });

  it("sin onlyDays se comporta como siempre", () => {
    const payload = build({ menuPlan: plan2dias });
    expect(payload.weeks[0].days.map((d) => d.day)).toEqual(["Lun", "Mar"]);
  });
});
