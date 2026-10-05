/**
 * Perfiles nutricionales: preguntas sobre VARIOS nutrientes de un plato a la
 * vez («algo equilibrado», «para después de entrenar», «bajo en sal»). No son
 * ejes nuevos: son preguntas compuestas sobre ejes que ya existen (macros,
 * micros, carga, completitud). Eje 50 del registro (src/data/axisRegistry.js).
 *
 * Puro a propósito: no sabe en qué forma llega un plato. Quien llama le pasa
 * `leer(plato, campo)` con el nombre `porRacion` de src/data/nutrientes.js
 * (`protein_g`, `sodium_mg`, `iron_mg`…), y `completitud(plato)` con el
 * resultado de `completitudDe`. Así la misma maquinaria vale para el catálogo
 * crudo y para el plato que entrega el motor.
 *
 * Un dato que falta NUNCA cumple: «bajo en sal» sin sodio es «no lo sé», no
 * «bajo». Va a `sinDato` y resta como una condición fallada.
 *
 * Puntos (0 = cumple todo): por cada condición, lo que se sale del rango
 * dividido por su escala (0,10 en porcentajes de kcal, como midió el diseño;
 * el 25 % del umbral en el resto); +0,5 por componente de completitud que
 * falte; +1 por cada dato que no se sabe; y +5·(kcalActual−kcal)/kcalActual si
 * el plato pide no bajar de calorías y baja.
 */

import { NUTRIENTES } from "../../data/nutrientes.js";

const KCAL_POR_G = { protein_g: 4, carbs_g: 4, fat_g: 9 };
const ESCALA_PCT = 0.1;
const ESCALA_RELATIVA = 0.25;
const COMPONENTES = ["proteina", "hidrato", "verdura"];

const pctKcal = (campo, min = null, max = null) => ({
  id: `${campo}%`, campo, min, max, escala: ESCALA_PCT,
  medir: (leer, p) => {
    const g = leer(p, campo);
    const kcal = leer(p, "kcal");
    return g == null || !(kcal > 0) ? null : (KCAL_POR_G[campo] * g) / kcal;
  },
});

const cantidad = (campo, min = null, max = null) => ({
  id: campo, campo, min, max,
  medir: (leer, p) => leer(p, campo),
});

const por100kcal = (campos, min = null, max = null) => ({
  id: `${campos.join("+")}/100kcal`, campo: campos.join("+"), min, max,
  medir: (leer, p) => {
    const kcal = leer(p, "kcal");
    const v = campos.map((c) => leer(p, c));
    return v.some((x) => x == null) || !(kcal > 0) ? null : (100 * v.reduce((a, b) => a + b, 0)) / kcal;
  },
});

export const PERFILES = {
  equilibrado: {
    etiqueta: "equilibrado",
    condiciones: [pctKcal("protein_g", 0.2), pctKcal("carbs_g", 0.3, 0.55), pctKcal("fat_g", 0.2, 0.4)],
    completitud: true,
    noMenosKcal: true,
  },
  altoProteina: {
    etiqueta: "alto en proteína",
    condiciones: [pctKcal("protein_g", 0.3), cantidad("protein_g", 25)],
  },
  despuesEntrenar: {
    etiqueta: "para después de entrenar",
    condiciones: [cantidad("protein_g", 25), cantidad("carbs_g", 35), pctKcal("fat_g", null, 0.35)],
  },
  antesEntrenar: {
    etiqueta: "para antes de entrenar",
    condiciones: [pctKcal("carbs_g", 0.45), pctKcal("fat_g", null, 0.3), pctKcal("protein_g", 0.15)],
  },
  ligeroQueSacie: {
    etiqueta: "ligero pero que sacie",
    condiciones: [cantidad("kcal", null, 450), por100kcal(["protein_g", "fiber_g"], 7.6)],
  },
  bajoSal: {
    etiqueta: "bajo en sal",
    condiciones: [cantidad("sodium_mg", null, 500)],
  },
  ricoHierro: {
    etiqueta: "rico en hierro",
    condiciones: [cantidad("iron_mg", 4.2)],
  },
};

export const IDS_PERFILES = Object.keys(PERFILES);

const CAMPOS_VALIDOS = new Set(["kcal", ...Object.values(NUTRIENTES).map((n) => n.porRacion)]);
for (const [id, p] of Object.entries(PERFILES)) {
  for (const c of p.condiciones) {
    for (const campo of c.campo.split("+")) {
      if (!CAMPOS_VALIDOS.has(campo)) throw new Error(`perfil ${id}: «${campo}» no está en src/data/nutrientes.js`);
    }
  }
}

function escalaDe(c, limite) {
  return c.escala ?? (Math.abs(limite) * ESCALA_RELATIVA || 1);
}

/** Los componentes que le faltan según `completitudDe`, o null si no se puede juzgar. */
function faltanDe(res) {
  if (!res || res.valor == null) return null;
  if (res.valor === true) return [];
  if (Array.isArray(res.faltan)) return res.faltan;
  return COMPONENTES.filter((k) => String(res.via ?? "").includes(k));
}

const fraccionProteina = (leer, p) => {
  const g = leer(p, "protein_g");
  const kcal = leer(p, "kcal");
  return g == null || !(kcal > 0) ? -1 : (4 * g) / kcal;
};

/**
 * @param {string} perfilId
 * @param {object} plato
 * @param {{ leer: (plato: object, campo: string) => number|null, completitud?: (plato: object) => any, kcalActual?: number|null }} ctx
 * @returns {{ puntos: number, cumple: boolean, falla: string[], sinDato: string[] } | null} null si el perfil no existe
 */
export function puntuar(perfilId, plato, { leer, completitud = null, kcalActual = null }) {
  const perfil = PERFILES[perfilId];
  if (!perfil) return null;
  let puntos = 0;
  const falla = [];
  const sinDato = [];

  for (const c of perfil.condiciones) {
    const x = c.medir(leer, plato);
    if (x == null) { sinDato.push(c.id); puntos += 1; continue; }
    if (c.min != null && x < c.min) { falla.push(c.id); puntos += (c.min - x) / escalaDe(c, c.min); }
    else if (c.max != null && x > c.max) { falla.push(c.id); puntos += (x - c.max) / escalaDe(c, c.max); }
  }

  if (perfil.completitud) {
    const faltan = faltanDe(completitud ? completitud(plato) : null);
    if (faltan == null) { sinDato.push("completitud"); puntos += 1; }
    else if (faltan.length) { falla.push(...faltan.map((k) => `sin ${k}`)); puntos += 0.5 * faltan.length; }
  }

  if (perfil.noMenosKcal && kcalActual > 0) {
    const kcal = leer(plato, "kcal");
    if (kcal == null) { sinDato.push("kcal"); puntos += 1; }
    else if (kcal < kcalActual) { falla.push("kcal"); puntos += (5 * (kcalActual - kcal)) / kcalActual; }
  }

  return { puntos, cumple: !falla.length && !sinDato.length, falla, sinDato };
}

/** Los perfiles que el plato cumple de verdad (sin dudas). */
export function perfilesDe(plato, ctx) {
  return IDS_PERFILES.filter((id) => puntuar(id, plato, ctx).cumple);
}

/**
 * Como `conRasgos` y `conEje` (api/_bot/menu.js): si alguna cumple, solo esas;
 * si ninguna, todas por cercanía y un aviso para que Lola lo diga así.
 */
export function ordenarPorPerfil(lista, perfilId, ctx) {
  const perfil = PERFILES[perfilId];
  if (!perfil) return { lista, aviso: `(No tengo un perfil «${perfilId}»: estas son las de siempre. Dilo con naturalidad, no como un fallo.)` };
  const puntuadas = lista.map((p) => ({ p, r: puntuar(perfilId, p, ctx), prot: fraccionProteina(ctx.leer, p) }));
  const orden = (a, b) => a.r.puntos - b.r.puntos || b.prot - a.prot;
  const cumplen = puntuadas.filter((x) => x.r.cumple).sort(orden);
  if (cumplen.length) return { lista: cumplen.map((x) => x.p), aviso: null };
  return {
    lista: puntuadas.sort(orden).map((x) => x.p),
    aviso: `(Ninguna cumple del todo «${perfil.etiqueta}»: estas son las que más se acercan. Dilo así.)`,
  };
}
