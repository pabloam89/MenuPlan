/**
 * #908: los turnos de Lola que escriben tardaban 11-16 s. Aquí, lo que se
 * decide en código: qué mensajes corren con effort low y qué dice la
 * descripción de proponer_platos (el efecto en el modelo, en las evals).
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { esAjusteSencillo, herramientas } = await import("./agente.js");

const SENCILLOS = [
  "No quiero más de dos ensaladas a la semana",
  "apunta que no comemos pescado los lunes",
  "añade a mi suegra de comensal",
  "nadie más tiene alergias",
  "ninguno mas tiene intolerancia",
];
const NO_SENCILLOS = [
  "Cambia la cena del jueves, que no nos apetece", // toca el menú: medium
  "quita la lechuga del viernes", // el eval que falla con low
  "rehazme el menú y apunta que no comemos pescado", // varias cosas
  "¿apunto a tu suegra de comensal?", // pregunta
  "Somos cuatro miembros, dos adultos, Álvaro e Isabel, de 34 años, y Gonzalo de 5, Sofía de 3. Álvaro tiene intolerancia al gluten y Isabel come fuera de lunes a viernes", // largo: medium
  "hola",
  "",
];

describe("effort low solo en ajustes sencillos", () => {
  it.each(SENCILLOS)("sí: %s", (t) => expect(esAjusteSencillo(t)).toBe(true));
  it.each(NO_SENCILLOS)("no: %s", (t) => expect(esAjusteSencillo(t)).toBe(false));
  it("un bloque de tareas delante lo saca del low (el texto ya no es corto)", () => {
    expect(esAjusteSencillo(`Tareas abiertas: ${"x".repeat(100)}\n\nnadie más tiene alergias`)).toBe(false);
  });
});

describe("proponer_platos no pide mirar el menú antes", () => {
  it("la descripción lo dice", async () => {
    const t = (await herramientas({ channel: "telegram", chatId: "0", householdId: "h", papel: "owner" })).find((x) => x.name === "proponer_platos");
    expect(t.description).toMatch(/NO hace falta ver_menu antes/);
  });
});
