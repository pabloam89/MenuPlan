import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COMIDAS, IDS_COMIDAS, comidaDe, platoDe, comidasDeLaCasa, comidasEnTexto, iconoDe, articuloDe } from "./comidas.js";

const RAIZ = path.resolve(__dirname, "../..");
const NOMBRES = COMIDAS.map((c) => c.id).join("|");
// Una lista a mano: dos o más nombres entre comillas en la misma línea
// (["Comida", "Cena"]). Un mapa a mano: dos o más con la comida de clave
// ({ Desayuno: "☕", Comida: "🍽️" }).
const LISTA = new RegExp(`["'](${NOMBRES})["']\\s*[,:\\]]`, "g");
const MAPA = new RegExp(`(?:^|[{,\\s])(${NOMBRES})\\s*:\\s*["']`, "g");
const aMano = (linea) => (linea.match(LISTA) ?? []).length >= 2 || (linea.match(MAPA) ?? []).length >= 2;

describe("el catálogo de comidas", () => {
  it("cada comida trae lo que hace falta para pintarla y entenderla", () => {
    for (const c of COMIDAS) {
      expect(c.icono).toBeTruthy();
      expect(c.articulo).toMatch(/^(el|la) /);
      expect(c.sinonimos.length).toBeGreaterThan(0);
    }
  });

  it("entiende cómo se dice: «almuerzo» es la comida, «picoteo» el aperitivo", () => {
    expect(comidaDe("almuerzo")).toBe("Comida");
    expect(comidaDe("Cenamos")).toBe("Cena");
    expect(comidaDe("meriendan")).toBe("Merienda");
    expect(comidaDe("picoteo")).toBe("Aperitivo");
    expect(comidaDe("lunes")).toBe(null);
    expect(platoDe("primeros")).toBe("primero");
    expect(platoDe("plato principal")).toBe("principal");
  });

  it("ve las comidas que se nombran en una frase, y ninguna en «¿qué comemos hoy?»", () => {
    expect(comidasEnTexto("¿qué cenamos este finde?")).toEqual(["Cena"]);
    expect(comidasEnTexto("la cena y la comida del jueves")).toEqual(["Comida", "Cena"]);
    expect(comidasEnTexto("¿qué hay de picoteo el sábado?")).toEqual(["Aperitivo"]);
    expect(comidasEnTexto("¿qué comemos hoy?")).toEqual([]);
    // Lo ambiguo sin artículo no cuenta, y lo negado tampoco.
    expect(comidasEnTexto("¿qué comida tenemos el jueves?")).toEqual([]);
    expect(comidasEnTexto("algo dulce para el sábado")).toEqual([]);
    expect(comidasEnTexto("el sábado no cenamos, ¿qué hay de comida?")).toEqual([]);
  });

  it("las comidas de cada casa salen de sus datos", () => {
    expect(comidasDeLaCasa({ meals: ["Comida", "Cena"], extraMeals: { desayuno: "off", merienda: "variado" } })).toEqual(["Comida", "Merienda", "Cena"]);
    expect(comidasDeLaCasa({ meals: ["Cena"] })).toEqual(["Cena"]);
    expect(comidasDeLaCasa({})).toEqual(["Comida", "Cena"]);
    expect(comidasDeLaCasa({ meals: ["comida", "CENA"] })).toEqual(["Comida", "Cena"]);
  });

  it("añadir una comida al catálogo basta: el aperitivo ya se entiende, tiene icono y artículo", () => {
    expect(IDS_COMIDAS).toContain("Aperitivo");
    expect(iconoDe("Aperitivo")).toBe("🫒");
    expect(articuloDe("Aperitivo")).toBe("el aperitivo");
    // Pero no se planifica: ninguna casa lo tiene aún.
    expect(comidasDeLaCasa({ meals: ["Comida", "Cena"], extraMeals: { aperitivo: "variado" } })).not.toContain("Aperitivo");
  });

  it("en el bot no queda ninguna lista de comidas escrita a mano", () => {
    const ficheros = [
      ...fs.readdirSync(path.join(RAIZ, "api/_bot")).filter((f) => f.endsWith(".js") && !f.includes(".test.")).map((f) => path.join(RAIZ, "api/_bot", f)),
      path.join(RAIZ, "api/bot/telegram.js"),
      path.join(RAIZ, "src/lib/pedidoLola.js"),
    ];
    const culpables = [];
    for (const f of ficheros) {
      fs.readFileSync(f, "utf8").split("\n").forEach((linea, i) => {
        if (aMano(linea)) culpables.push(`${path.relative(RAIZ, f)}:${i + 1}`);
      });
    }
    expect(culpables).toEqual([]);
  });

  it("y esa prueba ve una lista o un mapa cuando los hay", () => {
    expect(aMano(`const X = ["Comida", "Cena"];`)).toBe(true);
    expect(aMano(`const E = { Desayuno: "☕", Comida: "🍽️" };`)).toBe(true);
    expect(aMano("texto: `Comida: ${x}`")).toBe(false);
  });
});
