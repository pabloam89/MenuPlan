import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { pintarMenu, tituloDia } = await import("./pintar.js");
// Una casa: Pablo, Isa y Leo comen juntos («Familia»); Cova, el bebé, aparte.
// Comida (con primero), cena y merienda; sin desayunos. Menú de dos semanas.
const miembros = [
  { id: "p", name: "Pablo", age: 38 }, { id: "i", name: "Isa", age: 36 },
  { id: "l", name: "Leo", age: 6 }, { id: "c", name: "Cova", age: 1 },
];
const groups = [{ id: "f", label: "Familia", memberIds: ["p", "i", "l"] }, { id: "b", label: "Bebé", memberIds: ["c"] }];
const receta = (id, name) => ({ id, name });
const aiRecipes = [
  receta("f__crema", "Crema de calabaza"), receta("f__pollo", "Pollo al horno"), receta("f__tortilla", "Tortilla de patatas"),
  receta("f__salmon", "Salmón al horno"), receta("f__bocata", "Bocadillo de queso"), receta("b__pure", "Puré de verduras"),
  receta("f__lentejas", "Lentejas"), receta("b__papilla", "Papilla de frutas"),
];
const semana1 = {
  weekStart: "2026-09-28", weekEnd: "2026-10-04",
  plan: {
    f: { "Sáb-Comida": { firstRecipeId: "f__crema", recipeId: "f__pollo" }, "Sáb-Cena": { recipeId: "f__tortilla" }, "Sáb-Merienda": { recipeId: "f__bocata" }, "Dom-Cena": { recipeId: "f__salmon" } },
    b: { "Sáb-Comida": { recipeId: "b__pure" }, "Sáb-Cena": { recipeId: "f__tortilla" }, "Sáb-Merienda": { recipeId: "b__papilla" }, "Dom-Cena": { recipeId: "b__pure" } },
  },
};
const semana2 = { weekStart: "2026-10-05", weekEnd: "2026-10-11", plan: { f: { "Lun-Comida": { recipeId: "f__lentejas" } }, b: {} } };
const casa = {
  state: { data: { members: miembros, groups, meals: ["Comida", "Cena"], extraMeals: { merienda: "variado", desayuno: "off" } }, aiRecipes },
  semana: semana1, semanas: [semana1, semana2],
};

describe("pintarMenu", () => {
  it("un día: el día en negrita sin 📆, una línea por comida con su icono, los grupos solo si comen distinto", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"] });
    expect(r.texto.startsWith("<b>Sábado 3 de octubre</b>")).toBe(true);
    expect(r.texto).not.toContain("📆");
    expect(r.texto).toContain("🍽️ <i>Pablo, Isa y Leo:</i> Crema de calabaza + Pollo al horno");
    expect(r.texto).toContain("🍽️ <i>Cova:</i> Puré de verduras");
    // En la cena comen lo mismo: sin nombres.
    expect(r.texto).toContain("🌙 Tortilla de patatas");
    expect(r.texto).toContain("🥪");
  });

  it("el finde: sábado y domingo, y solo un día lleva fotos", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03", "2026-10-04"] });
    expect(r.texto).toMatch(/<b>Sábado 3 de octubre<\/b>[\s\S]*<b>Domingo 4 de octubre<\/b>/);
    expect(r.fotos).toEqual([]);
    expect(r.conMenu).toBe(2);
  });

  it("solo desayunos en una casa sin desayunos: lo dice y ofrece añadirlos", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"], comidas: ["Desayuno"] });
    expect(r.texto).toBe("☕ No te planifico desayunos. ¿Quieres que los añada?");
    expect(r.noPlanificadas).toEqual(["Desayuno"]);
  });

  it("solo las meriendas de los niños (Leo come en «Familia»)", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"], comidas: ["Merienda"], grupo: "Leo" });
    expect(r.texto).toBe("<b>Sábado 3 de octubre</b>\n🥪 Bocadillo de queso");
  });

  it("solo los primeros", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"], comidas: ["Comida"], platos: ["primero"], grupo: "los mayores" });
    expect(r.texto).toBe("<b>Sábado 3 de octubre</b>\n🍽️ Crema de calabaza");
  });

  it("solo lo del bebé", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-04"], grupo: "el bebé" });
    expect(r.texto).toBe("<b>Domingo 4 de octubre</b>\n🌙 Puré de verduras");
  });

  it("dos semanas seguidas del menú, y un día sin menú lo dice", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-04", "2026-10-05", "2026-10-12"] });
    expect(r.texto).toContain("<b>Domingo 4 de octubre</b>");
    expect(r.texto).toContain("<b>Lunes 5 de octubre</b>\n🍽️ Lentejas");
    expect(r.texto).toContain("<b>Lunes 12 de octubre</b>\nNo hay menú para este día.");
    expect(r.sinMenu).toEqual(["2026-10-12"]);
  });

  it("el aperitivo, que aún no se planifica, se entiende y se dice", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"], comidas: ["Aperitivo"] });
    expect(r.texto).toBe("🫒 Los aperitivos todavía no los preparo.");
  });

  it("lo destacado va en negrita con ✨", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-04"], destacar: [{ fecha: "2026-10-04", comida: "Cena" }], grupo: "Familia" });
    expect(r.texto).toContain("🌙 <b>Salmón al horno</b> ✨");
  });

  it("si no cabe en un mensaje, recorta por días y manda el resto a la app", () => {
    const largo = Array.from({ length: 80 }, (_, i) => receta(`f__x${i}`, `Un plato con un nombre bastante largo número ${i}`));
    const plan = { f: {} };
    const dias = [];
    for (let d = 0; d < 60; d++) {
      const iso = new Date(Date.UTC(2026, 9, 5 + d)).toISOString().slice(0, 10);
      dias.push(iso);
    }
    const semanas = dias.map((iso) => ({ weekStart: iso, weekEnd: iso, plan: { f: Object.fromEntries(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].flatMap((dd) => [[`${dd}-Comida`, { recipeId: "f__x1" }], [`${dd}-Cena`, { recipeId: "f__x2" }]])) } }));
    const r = pintarMenu({ ...casa, state: { ...casa.state, aiRecipes: largo }, semanas, semana: semanas[0] }, { dias });
    expect(r.texto.length).toBeLessThan(3700);
    expect(r.recortado).toBe(true);
    expect(r.texto).toMatch(/más: míralos en la app\.<\/i>$/);
    void plan;
  });

  it("los grupos que comen lo mismo van en una línea", () => {
    const tres = {
      ...casa,
      state: { ...casa.state, data: { ...casa.state.data, members: [...miembros, { id: "a", name: "Abuela", age: 80 }], groups: [...groups, { id: "a", label: "Abuela", memberIds: ["a"] }] } },
      semanas: [{ ...semana1, plan: { ...semana1.plan, a: { "Sáb-Comida": { recipeId: "b__pure" } } } }],
    };
    const r = pintarMenu(tres, { dias: ["2026-10-03"], comidas: ["Comida"] });
    expect(r.texto).toContain("🍽️ <i>Cova y Abuela:</i> Puré de verduras");
    expect(r.texto.match(/Puré de verduras/g)).toHaveLength(1);
  });

  it("alguien que no está en la casa: lo dice, no pinta la casa entera", () => {
    const r = pintarMenu(casa, { dias: ["2026-10-03"], grupo: "Marta" });
    expect(r.texto).toBe("No encuentro a «Marta» en la casa.");
    expect(r.sinGrupo).toBe(true);
  });

  it("concordancia: «las meriendas… las añada»", () => {
    const sinMeriendas = { ...casa, state: { ...casa.state, data: { ...casa.state.data, extraMeals: {} } } };
    expect(pintarMenu(sinMeriendas, { dias: ["2026-10-03"], comidas: ["Merienda"] }).texto).toBe("🥪 No te planifico meriendas. ¿Quieres que las añada?");
  });

  it("una receta que no está guardada con el menú: no es un día vacío, y se busca fuera", () => {
    const rara = { ...casa, semanas: [{ ...semana1, plan: { f: { "Sáb-Cena": { recipeId: "f__rara" } } } }] };
    const sin = pintarMenu(rara, { dias: ["2026-10-03"], comidas: ["Cena"] });
    expect(sin.faltan).toBe(1);
    expect(sin.sinMenu).toEqual([]);
    const con = pintarMenu(rara, { dias: ["2026-10-03"], comidas: ["Cena"] }, { otras: (id) => (id === "f__rara" ? { id, name: "Pisto" } : null) });
    expect(con.texto).toBe("<b>Sábado 3 de octubre</b>\n🌙 Pisto");
  });

  // Staging, 2 oct 2026: el día salía «Nat, Pablo y Isa» con Pablo fuera a
  // mediodía y Nat fuera por la noche, mientras Lola decía lo contrario.
  describe("quien no come en casa ese día no sale", () => {
    const fuera = (ref, comida, extra = {}) => ({
      sujeto: { tipo: "miembro", ref }, ambito: { dias: ["Sáb"], comidas: [comida] },
      vigencia: { desde: "2026-10-03", hasta: "2026-10-03" }, efecto: { tipo: "presente", valor: "fuera" }, ...extra,
    });
    const con = (data) => ({ ...casa, state: { ...casa.state, data: { ...casa.state.data, ...data } } });

    it("con una ausencia puntual, la etiqueta es de los que quedan", () => {
      const r = pintarMenu(con({ reglas: [fuera("p", "Comida")] }), { dias: ["2026-10-03"], comidas: ["Comida"] });
      expect(r.texto).toContain("🍽️ <i>Isa y Leo:</i> Crema de calabaza + Pollo al horno");
      expect(r.texto).not.toContain("Pablo");
    });

    it("solo ese día y esa comida: el domingo y la cena, como siempre", () => {
      const r = pintarMenu(con({ reglas: [fuera("p", "Comida")] }), { dias: ["2026-10-03", "2026-10-04"], comidas: ["Comida", "Cena"] });
      expect(r.texto).toContain("<i>Isa y Leo:</i> Crema");
      expect(r.texto).toMatch(/🌙 Tortilla de patatas$/m);
      expect(r.texto).toContain("Domingo 4 de octubre</b>\n🌙 <i>Pablo, Isa y Leo:</i>");
    });

    it("si todos comen lo mismo (sin etiqueta), quien falta se dice al lado", () => {
      const r = pintarMenu(con({ reglas: [fuera("p", "Cena")] }), { dias: ["2026-10-03"], comidas: ["Cena"] });
      expect(r.texto).toBe("<b>Sábado 3 de octubre</b>\n🌙 Tortilla de patatas <i>(Pablo fuera)</i>");
    });

    it("el horario de siempre («los sábados Pablo come fuera») cuenta igual; el tupper no", () => {
      expect(pintarMenu(con({ schedule: { "p|Sáb|Comida": "fuera" } }), { dias: ["2026-10-03"], comidas: ["Comida"] }).texto).toContain("<i>Isa y Leo:</i>");
      expect(pintarMenu(con({ schedule: { "p|Sáb|Comida": "tupper" } }), { dias: ["2026-10-03"], comidas: ["Comida"] }).texto).toContain("<i>Pablo, Isa y Leo:</i>");
    });

    it("un grupo que se va entero no se pinta", () => {
      const r = pintarMenu(con({ reglas: [fuera("c", "Comida")] }), { dias: ["2026-10-03"], comidas: ["Comida"] });
      expect(r.texto).not.toContain("Puré");
      expect(r.texto).toContain("🍽️ Crema de calabaza + Pollo al horno");
    });

    it("una ausencia de otro día no toca este", () => {
      const otra = { ...fuera("p", "Comida"), vigencia: { desde: "2026-10-10", hasta: "2026-10-10" } };
      expect(pintarMenu(con({ reglas: [otra] }), { dias: ["2026-10-03"], comidas: ["Comida"] }).texto).toContain("<i>Pablo, Isa y Leo:</i>");
    });
  });

  it("el título del día", () => {
    expect(tituloDia("2026-10-03")).toBe("Sábado 3 de octubre");
  });
});
