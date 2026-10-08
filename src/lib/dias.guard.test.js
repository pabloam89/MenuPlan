// Guardia de src/lib/dias.js: que nadie vuelva a escribirse la semana a mano.
//
// Cuatro cosas, cada una con su lista congelada (fichero → veces). El número
// solo puede bajar: si el test falla porque BAJÓ, bájalo aquí también, para
// que la lista no deje hueco a que vuelva a subir. Algo nuevo, a dias.js.
//
// 1. Listas y mapas de días escritos a mano (["Lun", "Mar"…], slugs, nombres
//    largos, letras, los que empiezan en domingo, `{ Lun: "…" }`).
// 2. Sacar el día de una fecha a mano: `(getDay() + 6) % 7` y `=== 0 ? 6 :`.
//    → indiceDeFecha / indiceDeISO / diaDeFecha / diaDeISO.
// 3. Pasar «Comida»/«Cena» a «comida»/«cena» a mano → tipoDeComida / comidaDeTipo.
// 4. Partir el hueco del motor («lun_comida_1») con split("_") → huecoMotor.leer.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const CARPETAS = ["src", "api"];
const EXTENSIONES = /\.(m?js|jsx)$/;
const FUERA = [
  /\.test\.(m?js|jsx)$/, // los tests escriben la semana como quieren
  /^src\/lib\/dias\.js$/, // el único sitio donde vive
  /^src\/lib\/vocabularios\.js$/, // la lista canónica (DIAS)
  /^api\/_bot\/core\.mjs$/, // generado desde src/ (scripts/build-bot-core.mjs)
  /(^|\/)migrations\//,
  /(^|\/)node_modules\//,
];

function ficheros() {
  const out = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (FUERA.some((re) => re.test(rel))) continue;
      if (e.isDirectory()) andar(rel);
      else if (EXTENSIONES.test(e.name)) out.push(rel);
    }
  };
  CARPETAS.forEach(andar);
  return out;
}

const contar = (texto, re) => (texto.match(new RegExp(re.source, "g")) ?? []).length;

function recuento(re) {
  const r = {};
  for (const f of ficheros()) {
    const n = contar(fs.readFileSync(path.join(RAIZ, f), "utf8"), re);
    if (n) r[f] = n;
  }
  return r;
}

// ── 1. Listas de días a mano ────────────────────────────────────────────────

const LISTA = new RegExp([
  /["']Lun["']\s*,\s*["']Mar["']/.source, // ["Lun", "Mar", …]
  /["']lun["']\s*,\s*["']mar["']/.source, // slugs
  /["']Dom["']\s*,\s*["']Lun["']/.source, // empieza en domingo
  /["'][Ll]unes["']\s*,\s*["'][Mm]artes["']/.source, // nombres largos
  /["'][Dd]omingo["']\s*,\s*["'][Ll]unes["']/.source, // largos desde el domingo
  /["']L["']\s*,\s*["']M["']\s*,\s*["']X["']/.source, // letras
  /\bLun:\s*["']/.source, // mapas { Lun: "…" }
].join("|"));

// Congelada el 8 oct 2026. Solo puede bajar.
const PERMITIDO_LISTA = Object.freeze({
  // Pantalla de pruebas de desarrollo, no se publica.
  "src/dev/PanelPlayground.jsx": 1,
  // Reconoce texto libre de un menú escolar (minúsculas, sin tildes).
  "src/lib/menuParser.js": 1,
  // Reconoce lo que escribe la gente: va con «hoy», «mañana», «pasado mañana».
  "api/_bot/router.js": 1,
  // Texto del prompt («["Lun","Mar"]» como ejemplo para el modelo).
  "api/_prompts.js": 1,
});

// ── 2. El día de una fecha, a mano ──────────────────────────────────────────

const FECHA = /\+\s*6\s*\)\s*%\s*7|===\s*0\s*\?\s*-?6\s*:/;

const PERMITIDO_FECHA = Object.freeze({});

// ── 3. Comida ↔ mealType, a mano ────────────────────────────────────────────

const COMIDA = /===\s*["']cena["']\s*\?\s*["']Cena["']|toLowerCase\(\)\s*===\s*["']cena["']/;

const PERMITIDO_COMIDA = Object.freeze({
  // Busca cuál de las comidas marcadas es la cena; no convierte.
  "src/lib/fixedDishes.js": 1,
});

// ── 4. Partir el hueco del motor ────────────────────────────────────────────

const MOTOR = /slotId\.split\(\s*["']_["']\s*\)/;

// Dentro del motor y del validador; no se han pasado a huecoMotor.leer de
// golpe a propósito (tocan reglas del validador una a una).
const PERMITIDO_MOTOR = Object.freeze({
  "src/lib/aiPlanner.js": 4,
  "src/lib/fixedDishes.js": 2,
  "src/utils/validateMenu.js": 13,
});

describe("la semana vive en src/lib/dias.js: congelado", () => {
  it("listas y mapas de días escritos a mano", () => {
    expect(recuento(LISTA)).toEqual(PERMITIDO_LISTA);
  });
  it("el día de una fecha calculado a mano (usa indiceDeFecha / diaDeISO)", () => {
    expect(recuento(FECHA)).toEqual(PERMITIDO_FECHA);
  });
  it("«Cena» ↔ «cena» a mano (usa tipoDeComida / comidaDeTipo)", () => {
    expect(recuento(COMIDA)).toEqual(PERMITIDO_COMIDA);
  });
  it("el hueco del motor partido a mano (usa huecoMotor.leer)", () => {
    expect(recuento(MOTOR)).toEqual(PERMITIDO_MOTOR);
  });
});

describe("la guardia ve lo que tiene que ver", () => {
  // Si una regex dejara de casar, los tests de arriba pasarían sin medir nada.
  it("listas", () => {
    for (const malo of [
      'const D = ["Lun", "Mar", "Mié"];',
      "const D = ['lun','mar'];",
      'const D = ["Dom", "Lun", "Mar"];',
      'const D = ["lunes", "martes"];',
      'const D = ["Lunes", "Martes"];',
      'const D = ["domingo", "lunes"];',
      'const D = ["L", "M", "X", "J"];',
      'const D = { Lun: "L", Mar: "M" };',
    ]) expect(LISTA.test(malo), malo).toBe(true);
    for (const bueno of ['DIAS.includes("Lun")', 'dia === "Lun"', '["Sáb", "Dom"]']) {
      expect(LISTA.test(bueno), bueno).toBe(false);
    }
  });

  it("fechas", () => {
    for (const malo of ["(d.getDay() + 6) % 7", "(hoy.getUTCDay() + 6) % 7", "dow === 0 ? 6 : dow - 1", "dow === 0 ? -6 : 1 - dow"]) {
      expect(FECHA.test(malo), malo).toBe(true);
    }
    expect(FECHA.test("indiceDeFecha(d)")).toBe(false);
  });

  it("comidas y huecos del motor", () => {
    expect(COMIDA.test('s.mealType === "cena" ? "Cena" : "Comida"')).toBe(true);
    expect(COMIDA.test('meal.toLowerCase() === "cena" ? "cena" : "comida"')).toBe(true);
    expect(COMIDA.test("tipoDeComida(meal)")).toBe(false);
    expect(MOTOR.test('slot.slotId.split("_")[1]')).toBe(true);
    expect(MOTOR.test("huecoMotor.leer(slot.slotId)")).toBe(false);
  });

  it("mira donde tiene que mirar", () => {
    const fs_ = ficheros();
    expect(fs_).toContain("src/lib/aiPlanner.js");
    expect(fs_).toContain("api/_bot/menu.js");
    expect(fs_).toContain("src/screens/Menu.jsx");
    expect(fs_).not.toContain("src/lib/dias.js");
    expect(fs_).not.toContain("src/lib/vocabularios.js");
  });
});
