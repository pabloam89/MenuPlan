// Guardia del intérprete (interprete.js, #958 raíz 3): que ninguna herramienta
// vuelva a entender el idioma por su cuenta.
//
// Busca en api/_bot (sin tests) las huellas de un analizador privado de días o
// de personas. Cada huella tiene su lista congelada (fichero → veces) y el
// número solo puede bajar: si el test falla porque BAJÓ, bájalo aquí también.
// Algo nuevo que entender («el puente», «los mellizos»), a interprete.js.
//
//   1. «hoy» / «mañana» / «pasado mañana» comparados a mano.
//   2. «finde», «fin de semana», «entre semana», «laborables» en un regex.
//   3. Un mapa de nombres de día a clave («lunes: "Lun"») o «mañana» → día.
//   4. Una persona buscada por su nombre a mano: normal(x.name) === …,
//      .startsWith, o la lista de «todos / niños / peques».

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const CARPETA = "api/_bot";
const FUERA = [/\.test\.(m?js)$/, /^api\/_bot\/interprete\.js$/, /^api\/_bot\/core\.mjs$/];

export const HUELLAS = {
  relativos: /["'](manana|pasado manana|esta noche)["']/,
  finde: /\b(finde|fin de semana|entre \?semana|entre semana|laborables)\b[^\n]*\/[a-z]*\.test\(/,
  mapaDias: /\blunes:\s*["']Lun|\bmiercoles:\s*["']Mi/,
  persona: /normal\w*\(\s*\w+\??\.name\s*\)\s*(===|\.startsWith|\.split)|\b(ninos\|hijos|todos["'],\s*["']todas)/,
  // 5. Una copia de `normal` o de `escapar` (interprete.js las exporta), #967 C8.
  copias: /\.normalize\(\s*["']NFD["']\s*\)|\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]/,
};

function ficheros() {
  return fs.readdirSync(path.join(RAIZ, CARPETA))
    .map((f) => `${CARPETA}/${f}`)
    .filter((f) => /\.(m?js)$/.test(f) && !FUERA.some((re) => re.test(f)));
}

export function recuento(re, leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8"), lista = ficheros()) {
  const r = {};
  for (const f of lista) {
    const n = (leer(f).match(new RegExp(re.source, "g")) ?? []).length;
    if (n) r[f] = n;
  }
  return r;
}

// Congeladas el 29 oct 2026, al migrar las herramientas al intérprete. Solo pueden bajar.
const PERMITIDO = {
  relativos: {
    // El valor cerrado `cuando` del enrutador (CUANDOS), no texto libre.
    "api/_bot/agente.js": 1,
    "api/_bot/cuando.js": 2,
  },
  finde: {},
  mapaDias: {},
  persona: {
    // Alta de comensal: «¿ya está en la casa?» compara el nombre entero, no busca a nadie.
    "api/_bot/ajustes.js": 1,
    // Recetas y artículos de la compra por su nombre, no personas.
    "api/_bot/generar.js": 1,
    "api/_bot/menu.js": 4,
    "api/_bot/plato.js": 1,
    "api/_bot/recetas.js": 1,
  },
  copias: {
    // Copias de antes del intérprete, en ficheros que #958 no tocó. Solo bajan.
    "api/_bot/ficha.js": 1,
    "api/_bot/plato.js": 1,
    "api/_bot/rapido.js": 1,
    "api/_bot/recetas.js": 1,
    "api/_bot/silencio.js": 1,
    "api/_bot/supervisor.js": 2,
    "api/_bot/vispera.js": 1,
    "api/_bot/voz.js": 3,
  },
};

describe("nadie entiende días ni personas fuera del intérprete (#958)", () => {
  for (const [huella, re] of Object.entries(HUELLAS)) {
    it(`${huella}: solo lo congelado`, () => {
      const hay = recuento(re);
      const permitido = PERMITIDO[huella];
      const deMas = Object.entries(hay).filter(([f, n]) => n > (permitido[f] ?? 0));
      expect(deMas, `Analizador privado (${huella}): pásalo a api/_bot/interprete.js`).toEqual([]);
      const bajados = Object.entries(permitido).filter(([f, n]) => (hay[f] ?? 0) < n);
      expect(bajados, "Ha bajado: baja también el número de aquí").toEqual([]);
    });
  }
});
