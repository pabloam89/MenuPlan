/**
 * Los ejemplos del prompt, del enrutador y de las descripciones de las
 * herramientas tienen que mandar a la MISMA herramienta (#958, clase C). Sin
 * modelo: se leen los textos y se cuadran con una tabla.
 *
 * El caso que lo abrió: conocimiento.md decía «q el jueves comida no» →
 * ajustar_horario, que es el horario fijo, y Lola quitaba la comida de TODOS
 * los jueves. La clase: un día suelto mandado a lo que se repite cada semana.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { herramientas } = await import("./agente.js");
const { EJEMPLOS, FRONTERA } = await import("./routerEjemplos.js");
const { REGLAS } = await import("./router.js");

const conocimiento = fs.readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const tools = await herramientas({ householdId: "x", chatId: "1", channel: "telegram", fotos: [], papel: "owner" });
const NOMBRES = tools.map((t) => t.name);
const descripcion = (n) => tools.find((t) => t.name === n)?.description ?? "";

// Qué herramienta hace cada modo del enrutador cuando va a Lola.
const HERRAMIENTA_DE_MODO = { ausencia: "fuera_de_casa", cambiar: "cambiar_plato", generar: "generar_menu", compra_anadir: "anadir_compra" };

// La tabla: frase → herramienta. Si una frase sale en el prompt, en el
// enrutador o en una descripción, tiene que mandar a esta.
const PARES = [
  ["q el jueves comida no xq no tengo tiempo", "fuera_de_casa"],
  ["hoy cenamos fuera", "fuera_de_casa"],
  ["el jueves no como en casa", "fuera_de_casa"],
  ["mañana no comemos", "fuera_de_casa"],
  ["los jueves comemos fuera", "ajustar_horario"],
  ["los niños comen en el cole de lunes a jueves", "ajustar_horario"],
  ["tenemos airfryer", "ajustar_cocina"],
  ["quita la lechuga del viernes", "cambiar_plato"],
];

// Un día suelto («el jueves», «hoy», «el 15»), no «los jueves».
const DIA_SUELTO = /\b(hoy|mañana|esta noche|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo)|el \d{1,2})\b/i;

describe("ejemplos del prompt contra las herramientas (#958)", () => {
  it("cada herramienta de la tabla existe", () => {
    for (const [, h] of PARES) expect(NOMBRES, h).toContain(h);
  });

  it("en conocimiento.md, la frase manda a su herramienta y no a otra antes", () => {
    for (const [frase, h] of PARES) {
      const linea = conocimiento.split("\n").find((l) => l.includes(frase));
      if (!linea) continue;
      // La primera herramienta que se nombra DESPUÉS de la frase.
      const desde = linea.indexOf(frase);
      const primera = NOMBRES.map((n) => [n, linea.indexOf(n, desde)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]?.[0];
      if (primera) expect(primera, frase).toBe(h);
    }
  });

  it("ningún ejemplo de un día suelto manda al horario fijo", () => {
    for (const linea of conocimiento.split("\n")) {
      const r = linea.match(/«([^»]+)»[^«]*?→[^.]*?\b(ajustar_horario)\b/);
      if (r) expect(DIA_SUELTO.test(r[1]), linea).toBe(false);
    }
  });

  it("el enrutador y sus ejemplos dicen lo mismo que la tabla", () => {
    const modoDe = (frase) => FRONTERA.find(([f]) => f.includes(frase))?.[1]
      ?? Object.entries(EJEMPLOS).find(([, fs]) => fs.some((f) => f.includes(frase)))?.[0];
    for (const [frase, h] of PARES) {
      const modo = modoDe(frase);
      if (!modo || !HERRAMIENTA_DE_MODO[modo]) continue;
      expect(HERRAMIENTA_DE_MODO[modo], frase).toBe(h);
    }
  });

  it("las descripciones: fuera_de_casa es lo de un día, ajustar_horario lo de siempre", () => {
    expect(descripcion("fuera_de_casa")).toMatch(/el jueves comida no/);
    expect(descripcion("ajustar_horario")).toMatch(/NO es esto: es fuera_de_casa/);
    expect(descripcion("ajustar_horario")).toMatch(/cole, vacío = solo la Comida/);
  });

  it("compra_anadir no trae nada que el enrutador dice que no es comida (#958)", () => {
    const noComida = REGLAS.match(/no es comida ni bebida \(([^)]+)\)/)[1].split(/,\s*/).filter((x) => !/cita/.test(x));
    for (const f of EJEMPLOS.compra_anadir) for (const x of noComida) expect(f.toLowerCase(), f).not.toContain(x);
  });
});
