// Cómo comen los peques (`kidDinnerConfig.byMember`, kidsMenu.js) en filas de preferencia (trozo 14 de #1037; ejes
// de la 0117). Cada niño, sus filas (persona_id = el niño):
//   weekdayLunch, dinner, weekend → comeConLaFamilia (sí = lo de la familia), cada uno con su ámbito (ÁMBITOS)
//   reuseColeDinner               → cenaDelMediodia, en la cena
//   avoid.{protein,carbs,veg}     → repiteDelComedor, en la cena: no_es = la cena no lo repite; es = puede repetirlo
//   limited                       → comePocasCosas
//   safeFoods                     → subtipoIngrediente «es», una fila por alimento que sí come
// Un niño sin filas no tiene la suya (resolveKidDinnerConfig le da la de por defecto). Lo leen la app y Lola al
// cargar y lo que cambia va con la libreta a escribir_preferencias (libretaEnData.js).

import { PreferenciaInvalida, valorDelEje, valorIdDelEje, COLUMNAS_DE_AMBITO } from "./preferencias.js";
import { CLAVES_DE_FIRMA } from "./reglasEnFilas.js";
import { KID_DINNER_OPTIONS, KID_DINNER_DEFAULTS, KID_DINNER_AVOID_DEFAULTS, normalizeKidDinnerConfig } from "./kidsMenu.js";
import { DIAS_LABORABLES, DIAS_FINDE } from "./dias.js";

/** El ámbito de cada comida de kidDinnerConfig que dice si come lo de la familia. El finde incluye las vacaciones: no caben. */
export const AMBITOS = Object.freeze({
  weekdayLunch: { dias: [...DIAS_LABORABLES], comidas: ["Comida"], familia: "together" },
  dinner: { dias: [...DIAS_LABORABLES], comidas: ["Cena"], familia: "sameDinner" },
  weekend: { dias: [...DIAS_FINDE], comidas: null, familia: "together" },
});
const EJES = Object.freeze({ familia: "comeConLaFamilia", reaprovecha: "cenaDelMediodia", repite: "repiteDelComedor", pocas: "comePocasCosas", come: "subtipoIngrediente" });
const AVOID = Object.freeze(Object.keys(KID_DINNER_AVOID_DEFAULTS));
const CENA = ["Cena"];
/** El ámbito de las filas de cada eje que no es comeConLaFamilia (que lleva el de AMBITOS): al escribir y al leer. */
const AMBITO_DE = Object.freeze({ [EJES.reaprovecha]: { comidas: CENA }, [EJES.repite]: { comidas: CENA }, [EJES.pocas]: {}, [EJES.come]: {} });
const SI_NO = Object.freeze([EJES.familia, EJES.reaprovecha, EJES.pocas]);
const BASE = Object.freeze({ medida: "valor", fuerza: "obligatoria", cantidad: null, origen: "dicho" });

const esDeNino = (f) => Boolean(f?.persona_id) && Object.values(EJES).includes(f.eje)
  && (f.eje !== EJES.come || f.operador === "es") && !f.plan_id;
const igual = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
/** ¿Lleva la fila exactamente ese ámbito (y ninguna otra columna de ámbito)? */
const conAmbito = (f, a) => COLUMNAS_DE_AMBITO.every((k) => igual(f[k], a[k]));

/** Pura. Las filas de la config de un niño (sin id). */
export function filasDeNino(persona, cfg) {
  const fila = (nivel, eje, operador, valor, ambito = {}) => ({ ...BASE, persona_id: persona, nivel, eje, operador, valor: valorDelEje(eje, valorIdDelEje(valor)),
    dias: ambito.dias ?? null, comidas: ambito.comidas ?? null });
  return [
    ...Object.entries(AMBITOS).map(([k, a]) => fila("comida", EJES.familia, "es", cfg[k] === a.familia, a)),
    fila("comida", EJES.reaprovecha, "es", cfg.reuseColeDinner === true, AMBITO_DE[EJES.reaprovecha]),
    ...AVOID.map((k) => fila("comida", EJES.repite, cfg.avoid?.[k] ? "no_es" : "es", k, AMBITO_DE[EJES.repite])),
    fila("semana", EJES.pocas, "es", cfg.limited === true, AMBITO_DE[EJES.pocas]),
    ...(cfg.safeFoods ?? []).map((s) => fila("plato", EJES.come, "es", s, AMBITO_DE[EJES.come])),
  ];
}

/** Pura. `kidDinnerConfig` de las filas: { byMember } con los niños que tienen las suyas. Una fila que no se sabe leer: PreferenciaInvalida. */
export function pequesDeFilas(filas) {
  const byMember = {};
  for (const f of (filas ?? []).filter(esDeNino)) {
    const cfg = (byMember[f.persona_id] ??= structuredClone({ ...KID_DINNER_DEFAULTS, safeFoods: [] }));
    if (SI_NO.includes(f.eje) && typeof f.valor !== "boolean") throw new PreferenciaInvalida(`${f.eje} es sí/no, no «${f.valor}» (${f.id})`);
    if (f.eje !== EJES.familia && !conAmbito(f, AMBITO_DE[f.eje])) throw new PreferenciaInvalida(`${f.eje} con un ámbito que no es de kidDinnerConfig (${f.id})`);
    const si = f.valor === true;
    if (f.eje === EJES.familia) {
      const [k, a] = Object.entries(AMBITOS).find(([, x]) => conAmbito(f, x)) ?? [];
      if (!k) throw new PreferenciaInvalida(`comeConLaFamilia con un ámbito que no es de kidDinnerConfig (${f.id})`);
      cfg[k] = si ? a.familia : KID_DINNER_OPTIONS[k].find((o) => o !== a.familia);
    } else if (f.eje === EJES.reaprovecha) cfg.reuseColeDinner = si;
    else if (f.eje === EJES.pocas) cfg.limited = si;
    else if (f.eje === EJES.come) cfg.safeFoods.push(String(f.valor));
    else if (AVOID.includes(f.valor)) cfg.avoid[f.valor] = f.operador === "no_es";
    else throw new PreferenciaInvalida(`repiteDelComedor «${f.valor}»: no es ${AVOID.join(", ")}`);
  }
  return { byMember };
}

const firma = (f) => JSON.stringify(CLAVES_DE_FIRMA.map((k) => f[k] ?? null));

/**
 * Pura. Lo que cambió en `kidDinnerConfig`, como lista de escribir_preferencias: de cada niño cuya config cambió, las
 * filas que faltan (crear) y las que sobran (borrar), por su firma. Un niño que no es de la casa: PreferenciaInvalida.
 */
export function cambiosDePeques(antes, despues, filas, miembros = []) {
  if (despues === undefined) return [];
  const a = normalizeKidDinnerConfig(antes).byMember;
  const d = normalizeKidDinnerConfig(despues).byMember;
  const cambios = [];
  for (const persona of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (igual(a[persona], d[persona])) continue;
    if (d[persona] && !miembros.some((m) => m.id === persona)) throw new PreferenciaInvalida(`kidDinnerConfig de alguien que no es de la casa (${persona})`);
    const hay = new Map((filas ?? []).filter((f) => esDeNino(f) && f.persona_id === persona).map((f) => [firma(f), f.id]));
    const quiere = d[persona] ? filasDeNino(persona, d[persona]) : [];
    const quedan = new Set(quiere.map(firma));
    cambios.push(...quiere.filter((f) => !hay.has(firma(f))));
    for (const [k, id] of hay) if (!quedan.has(k)) cambios.push({ id, borrar: true });
  }
  return cambios;
}
