// Guardia de src/lib/ids.js: que nadie vuelva a hacerse sus propios ids.
//
// 1. Fabricar ids a mano está prohibido fuera de ids.js: `Math.random()` a
//    texto, `randomUUID(`, `randomBytes(`, `getRandomValues(`, y la hora en
//    base36 (`Date.now().toString(36)`). `Math.random()` a secas NO se mira: el
//    azar para barajar, muestrear o esperar (jitter) es legítimo y no es un id.
// 2. Partir ids compuestos a mano (`split("__")`, `startsWith("user_")`) queda
//    congelado: los sitios de hoy están en la lista con su número, y ese
//    número solo puede bajar (ids.recetaEnGrupo, ids.recetaPropia.es). No se
//    han migrado todos de golpe a propósito: son ~40 y tocan el motor.
//
// Las dos listas van congeladas. Si el test falla porque un número BAJÓ,
// bájalo aquí también: así la lista no deja hueco para que vuelva a subir.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const CARPETAS = ["src", "api"];
const EXTENSIONES = /\.(m?js|jsx)$/;
const FUERA = [
  /\.test\.(m?js|jsx)$/, // los tests pueden fabricar lo que quieran
  /^src\/lib\/ids\.js$/, // el único sitio donde se fabrican
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

// ── 1. Fabricar ids ─────────────────────────────────────────────────────────

const FABRICAR = /Math\.random\(\)\s*\.toString\(|randomUUID\(|randomBytes\(|getRandomValues\(|Date\.now\(\)\s*\.toString\(36\)/;

// Usos de hoy que no son ids de entidad (o no se tocan en este paso). Pequeña
// y con el porqué; algo nuevo aquí, mejor una clase nueva en ids.js.
const PERMITIDO_FABRICAR = Object.freeze({
  // Un artículo a mano de la lista de la compra: `manual:<nombre>:<hora>`.
  // Se reconoce por el `manual:` y el nombre; la hora solo desempata.
  "api/_bot/menu.js": 1,
  // El nombre del fichero de una foto en Storage, no un id de nada.
  "api/_bot/recetas.js": 1,
});

describe("los ids se fabrican solo en src/lib/ids.js", () => {
  it("nadie más fabrica ids a mano", () => {
    expect(recuento(FABRICAR)).toEqual(PERMITIDO_FABRICAR);
  });

  it("la guardia ve lo que tiene que ver", () => {
    // Si la regex dejara de casar, el test de arriba pasaría sin medir nada.
    for (const malo of [
      "Math.random().toString(36).slice(2, 10)",
      "crypto.randomUUID()",
      "crypto.randomBytes(16)",
      "crypto.getRandomValues(b)",
      "`draft_${Date.now().toString(36)}`",
    ]) expect(FABRICAR.test(malo), malo).toBe(true);
    for (const bueno of ["Math.random() * 10", "Math.floor(Math.random() * n)", "Date.now()"]) {
      expect(FABRICAR.test(bueno), bueno).toBe(false);
    }
    expect(ficheros()).toContain("src/lib/groups.js");
    expect(ficheros()).toContain("api/bot/telegram.js");
    expect(ficheros()).not.toContain("src/lib/ids.js");
  });
});

// ── 2. Partir ids compuestos a mano ─────────────────────────────────────────

const PARTIR = /split\(\s*["'`]__["'`]\s*\)|startsWith\(\s*["'`]user_["'`]\s*\)/;

// Congelada el 7 oct 2026. Solo puede bajar.
const PERMITIDO_PARTIR = Object.freeze({
  "api/_bot/compartir.js": 3,
  "api/_bot/ficha.js": 2,
  "api/_bot/generar.js": 1,
  "api/_bot/menu.js": 3,
  "api/_bot/pintar.js": 5,
  "api/_bot/vispera.js": 2,
  "api/share-recipe.js": 1,
  "src/App.jsx": 15,
  "src/assets/dishes/dishImages.js": 1,
  "src/lib/aiPlanner.js": 2,
  "src/lib/destinoBot.js": 1,
  "src/lib/menuRecuento.js": 1,
  "src/lib/rastro.js": 1,
  "src/lib/sharedMenu.js": 2,
  "src/lib/tandaDelPlato.js": 2,
  "src/screens/Menu.jsx": 2,
});

describe("partir ids compuestos: congelado", () => {
  it("ni sitios nuevos ni más en los de siempre (usa ids.recetaEnGrupo / ids.recetaPropia.es)", () => {
    expect(recuento(PARTIR)).toEqual(PERMITIDO_PARTIR);
  });

  it("la guardia ve lo que tiene que ver", () => {
    for (const malo of ['id.split("__")', "id.split('__')", 'x.startsWith("user_")', "x.startsWith( 'user_' )"]) {
      expect(PARTIR.test(malo), malo).toBe(true);
    }
    expect(PARTIR.test('id.split("_")')).toBe(false);
  });
});
