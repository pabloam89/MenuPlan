import { describe, it, expect } from "vitest";
import { montarFicha, alergiasRevisadas } from "./ficha.js";
import { alergiasRevisadas as deAlergias } from "../../src/lib/alergias.js";

const tok = (t) => Math.ceil(t.length / 3.6);
const casaDe = (data, extra = {}) => ({ state: { data, aiRecipes: extra.aiRecipes ?? [] }, semana: extra.semana ?? null, semanas: extra.semanas ?? [] });

const MIEMBROS = [
  { id: "p", name: "Pablo", age: 39, allergies: [], alergiasRevisadas: true },
  { id: "m", name: "Marta", age: 37, allergies: [], alergiasRevisadas: true, dietaryStates: ["lactancia"] },
  { id: "l", name: "Lucas", age: 7, allergies: ["frutos_cascara"], dislikes: ["champiñón"] },
  { id: "v", name: "Vega", age: 1 },
];

describe("la ficha de la casa", () => {
  it("una casa recién creada: lo que falta, en una línea", () => {
    const f = montarFicha(casaDe({ members: [] }), {}, "2026-10-01");
    expect(f.estable).toMatch(/SIN REVISAR · PARA EMPEZAR FALTA: quién come · alergias · comidas/);
    // Con la fecha ISO: ajustar_gustos pide desde/hasta en AAAA-MM-DD.
    expect(f.delDia).toBe("jue 1 oct (2026-10-01)");
  });

  it("SEGURIDAD: alergias por persona, quién falta por preguntar, a quién aplica y los estados", () => {
    const data = { members: MIEMBROS, groups: [{ id: "g", label: "Mayores", memberIds: ["p", "m", "l"] }, { id: "b", label: "Vega", memberIds: ["v"] }], etapaBebe: "solidos" };
    const f = montarFicha(casaDe(data), {}, "2026-10-01");
    expect(f.estable).toMatch(/Lucas: alergia a frutos de cáscara/);
    expect(f.estable).toMatch(/Pablo y Marta: ninguna/);
    expect(f.estable).toMatch(/Vega: SIN PREGUNTAR/);
    expect(f.estable).toMatch(/Lo de Lucas aplica a todo «Mayores»/);
    expect(f.estable).toMatch(/Marta: lactancia, sin fecha/);
    expect(f.estable).toMatch(/Vega \(12 m\): bebé, ya come sólidos/);
    expect(f.delDia).toMatch(/PENDIENTE\n- ¿Vega tiene alguna alergia/);
  });

  it("no inventa edades: quien no la tiene sale sin número", () => {
    const f = montarFicha(casaDe({ members: [{ id: "a", name: "Ana", age: null }, { id: "b", name: "Bea", age: 40 }] }), {}, "2026-10-01");
    expect(f.estable).toMatch(/- Ana · Bea 40\./);
  });

  it("el menú de hoy y mañana, por nombre, y los grupos solo si comen distinto", () => {
    const plan = { g: { "Jue-Comida": { recipeId: "g__legumbres_1" }, "Vie-Cena": { recipeId: "g__huevos_2" } } };
    const semana = { weekStart: "2026-09-28", weekEnd: "2026-10-04", plan };
    const data = { members: MIEMBROS.slice(0, 2), groups: [{ id: "g", label: "Familia", memberIds: ["p", "m"] }] };
    const f = montarFicha(casaDe(data, { semana, semanas: [semana], aiRecipes: [{ id: "g__legumbres_1", name: "Lentejas" }, { id: "g__huevos_2", name: "Tortilla" }] }), {}, "2026-10-01");
    expect(f.delDia).toMatch(/MENÚ 28\/09–04\/10 \(no hay semana siguiente\)/);
    expect(f.delDia).toMatch(/- Hoy: comida Lentejas\./);
    expect(f.delDia).toMatch(/- Mañana: cena Tortilla\./);
  });

  it("la libreta por matiz: lo del panel es dicho; lo visto y supuesto, aparte; lo caducado, fuera", () => {
    const campos = {
      // Escrito a mano en el panel: origen «texto» y sin fuente → dicho (antes salía como «Supuesto»).
      "freqs.pescado": { valor: 3, origen: "texto" },
      "favoritos.lentejas": { valor: true, fuente: "supuesto", apuntado: "2026-09-20" },
      "cocina.mexicana": { valor: true, fuente: "visto", apuntado: "2026-09-25" },
      // Supuesto hace más de 90 días: caducado.
      "favoritos.pizza": { valor: true, fuente: "supuesto", apuntado: "2026-05-01" },
      // Con ventana: uno vigente hasta el 31, uno que ya pasó y uno que empieza el lunes.
      "freqs.fritos": { valor: 0, hasta: "2026-10-31" },
      "freqs.carne": { valor: 1, hasta: "2026-09-15" },
      "freqs.verdura": { valor: 5, desde: "2026-10-05" },
    };
    const f = montarFicha(casaDe({ members: MIEMBROS, notepad: { v: 1, campos } }), {}, "2026-10-01");
    const dicho = f.estable.match(/- Dicho: (.*)/)?.[1] ?? "";
    const supuesto = f.estable.match(/- Supuesto: (.*)/)?.[1] ?? "";
    expect(dicho).toMatch(/pescado \(3\)/);
    expect(dicho).toMatch(/fritos \(0\) \(hasta 31\/10\)/);
    expect(f.estable).toMatch(/verdura \(5\) \(desde 5\/10\)/);
    expect(supuesto).toMatch(/lentejas/);
    expect(supuesto).toMatch(/mexicana/);
    expect(f.estable).not.toMatch(/pizza/);
    expect(f.estable).not.toMatch(/carne/);
  });

  it("nunca pasa del tope, y SEGURIDAD no se recorta aunque la casa sea enorme", () => {
    const muchos = Array.from({ length: 24 }, (_, i) => ({ id: `x${i}`, name: `Persona${i}`, age: 30 + i, allergies: i % 3 ? [] : ["gluten"], alergiasRevisadas: true, dislikes: ["coliflor", "hígado", "brócoli", "berenjena"] }));
    const schedule = Object.fromEntries(muchos.flatMap((m) => ["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => [`${m.id}|${d}|Comida`, "fuera"])));
    const data = { members: muchos, schedule, groups: [{ id: "g", label: "Todos", memberIds: muchos.map((m) => m.id) }], fixedDishes: [{ name: "Pizza" }], kitchenTools: ["Horno", "Thermomix", "Airfryer"] };
    const f = montarFicha(casaDe(data), {}, "2026-10-01");
    expect(tok(f.estable) + tok(f.delDia)).toBeLessThanOrEqual(470);
    expect(f.estable).toMatch(/SEGURIDAD\n- Persona0, Persona3, .* y Persona21: alergia a gluten/);
  });

  it("alergiasRevisadas dice lo mismo que src/lib/alergias.js", () => {
    const casos = [
      [{ allergiesReviewed: true }, {}], [{ allergiesReviewed: false }, {}], [{}, { alergiasRevisadas: true }],
      [{ allergiesReviewed: true }, { alergiasRevisadas: false }], [{}, {}],
    ];
    for (const [data, m] of casos) expect(alergiasRevisadas(data, m)).toBe(deAlergias(data, m));
  });
});
