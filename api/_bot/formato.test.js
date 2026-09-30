/**
 * Las piezas del formato de los mensajes (rapido.js) y la línea del índice de
 * la búsqueda por significado (significado.js).
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { tituloDelDia, rangoDeFechas, iconoSeccion } = await import("./rapido.js");
const { lineaIndice } = await import("./significado.js");

describe("la cabecera de un día", () => {
  it("hoy, mañana y los demás, con su fecha", () => {
    expect(tituloDelDia("Mié", "2026-09-30", "2026-09-30")).toBe("📆 <b>Hoy, miércoles 30 de septiembre</b>");
    expect(tituloDelDia("Jue", "2026-10-01", "2026-09-30")).toBe("📆 <b>Mañana, jueves 1 de octubre</b>");
    expect(tituloDelDia("Dom", "2026-10-04", "2026-09-30")).toBe("📆 <b>Domingo 4 de octubre</b>");
  });
  it("el rango de la semana, sin repetir el mes si es el mismo", () => {
    expect(rangoDeFechas("2026-10-01", "2026-10-04")).toBe("1 al 4 de octubre");
    expect(rangoDeFechas("2026-09-28", "2026-10-04")).toBe("28 de septiembre al 4 de octubre");
  });
});

describe("el icono de cada sección de la compra", () => {
  it("por lo que es, aunque vengan juntas o en minúscula", () => {
    expect(iconoSeccion("Carnes y pescados")).toBe("🥩");
    expect(iconoSeccion("pescados")).toBe("🐟");
    expect(iconoSeccion("Verduras y frutas")).toBe("🥬");
    expect(iconoSeccion("Frutos secos")).toBe("🥜");
    expect(iconoSeccion("Lácteos y huevos")).toBe("🥛");
    expect(iconoSeccion("Panadería y cereales")).toBe("🥖");
    expect(iconoSeccion("Despensa")).toBe("🫙");
    expect(iconoSeccion("Especias")).toBe("🫙");
    expect(iconoSeccion("Otros")).toBe("🛍️");
  });
});

describe("la línea del índice de significado", () => {
  it("id, nombre, carpeta, tiempo y rasgos, sin huecos de más", () => {
    const r = { id: "leg-1", name: "Lentejas", time: 40, connotacion: ["casero", "reconfortante"], textura: "cuchara", sabor: ["intenso"], caloriasNivel: "contundente", costeNivel: "economico" };
    expect(lineaIndice(r, "legumbres")).toBe("leg-1|Lentejas|legumbres|40min|casero,reconfortante,cuchara,intenso,contundente,barato");
    expect(lineaIndice({ id: "x", name: "Sin datos" }, null)).toBe("x|Sin datos|||");
  });
});
