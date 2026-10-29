/**
 * Quitar a una persona de la casa, con todo lo que cuelga de ella (#958,
 * clase G: «1 dato, 1 sitio»). Una sola función para la app (Onboarding.jsx)
 * y para Lola (api/_bot/ajustes.js, quitar_comensal).
 *
 * Antes cada lado limpiaba lo suyo: la app solo `members`, Lola solo los
 * huecos de `schedule`. Quedaban colgando, en vocabulario cerrado (QUE_LIMPIA):
 *   schedule          los huecos `${id}|Lun|Comida`
 *   kid_dinner        kidDinnerConfig.byMember[id]
 *   cole              schoolMenus.byMember[id], también el de cada semana
 *   cuenta            accountMemberIdByUser[usuario] → id (y el accountMemberId viejo)
 *   reglas            las reglas cuyo sujeto es esa persona (o el grupo que se queda vacío)
 *   grupos            su id en memberIds, y el grupo que se queda sin nadie
 *   mapas_de_grupo    lo de ese grupo vacío en los mapas por grupo del registro
 *                     (registroFicha.js: entidad «grupo», tipo «mapa»)
 *
 * Pura: no toca `data`, devuelve otra. Lo que no existía no se crea.
 */

import { DATOS_CASA } from "./registroFicha.js";

/** Lo que limpia, para contarlo (el inventario de huérfanos de #958). */
export const QUE_LIMPIA = Object.freeze(["schedule", "kid_dinner", "cole", "cuenta", "reglas", "grupos", "mapas_de_grupo"]);

/** Los mapas por id de grupo, sacados del registro: un dato nuevo así entra solo. */
export const MAPAS_POR_GRUPO = Object.freeze(
  Object.entries(DATOS_CASA).filter(([, d]) => d.entidad === "grupo" && d.tipo === "mapa" && d.vive === "data").map(([k]) => k),
);

const esObjeto = (o) => Boolean(o) && typeof o === "object" && !Array.isArray(o);
const sinClave = (o, k) => {
  if (!esObjeto(o) || !(k in o)) return o;
  const { [k]: _fuera, ...resto } = o;
  return resto;
};
const sinClaves = (o, fuera) => (esObjeto(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !fuera.has(k))) : o);

/**
 * @param {object} data  household_state.state.data
 * @param {string} id  el id de la persona (members[].id)
 * @returns {object} la casa sin esa persona ni nada suyo
 */
export function quitarPersona(data, id) {
  if (!data || id == null) return data;
  const out = { ...data, members: (data.members ?? []).filter((m) => m.id !== id) };

  // Grupos: fuera de sus memberIds. Si un grupo se queda vacío por ella, se va
  // (nunca el último: una casa sin grupos no genera).
  let vacios = new Set();
  if (Array.isArray(data.groups)) {
    const groups = data.groups.map((g) => (g?.memberIds?.includes(id) ? { ...g, memberIds: g.memberIds.filter((x) => x !== id) } : g));
    const vaciados = groups.filter((g, i) => !g?.memberIds?.length && data.groups[i]?.memberIds?.includes(id)).map((g) => g.id);
    if (vaciados.length && vaciados.length < groups.length) vacios = new Set(vaciados);
    out.groups = vacios.size ? groups.filter((g) => !vacios.has(g.id)) : groups;
  }
  for (const k of MAPAS_POR_GRUPO) if (vacios.size && esObjeto(data[k])) out[k] = sinClaves(data[k], vacios);

  if (esObjeto(data.schedule)) {
    out.schedule = Object.fromEntries(Object.entries(data.schedule).filter(([k]) => !k.startsWith(`${id}|`)));
  }
  if (esObjeto(data.kidDinnerConfig?.byMember)) {
    out.kidDinnerConfig = { ...data.kidDinnerConfig, byMember: sinClave(data.kidDinnerConfig.byMember, id) };
  }
  if (esObjeto(data.schoolMenus)) {
    const sm = data.schoolMenus;
    out.schoolMenus = {
      ...sm,
      ...(esObjeto(sm.byMember) ? { byMember: sinClave(sm.byMember, id) } : {}),
      ...(Array.isArray(sm.weeks) ? { weeks: sm.weeks.map((w) => (esObjeto(w?.byMember) ? { ...w, byMember: sinClave(w.byMember, id) } : w)) } : {}),
    };
  }
  if (esObjeto(data.accountMemberIdByUser)) {
    out.accountMemberIdByUser = Object.fromEntries(Object.entries(data.accountMemberIdByUser).filter(([, v]) => v !== id));
  }
  if (data.accountMemberId === id) out.accountMemberId = null;
  if (Array.isArray(data.reglas)) {
    out.reglas = data.reglas.filter((r) => !(
      (r?.sujeto?.tipo === "miembro" && r.sujeto.ref === id)
      || (r?.sujeto?.tipo === "grupo" && vacios.has(r.sujeto.ref))
    ));
  }
  return out;
}

/**
 * Lo que una casa tiene colgando de personas o grupos que ya no están, por
 * cada clase de QUE_LIMPIA. Para medir (antes y después) y para el test.
 */
export function huerfanosDe(data) {
  const ids = new Set((data?.members ?? []).map((m) => m.id));
  const gids = new Set((data?.groups ?? []).map((g) => g.id));
  const fuera = (o) => (esObjeto(o) ? Object.keys(o).filter((k) => !ids.has(k)).length : 0);
  return {
    schedule: Object.keys(esObjeto(data?.schedule) ? data.schedule : {}).filter((k) => !ids.has(k.split("|")[0])).length,
    kid_dinner: fuera(data?.kidDinnerConfig?.byMember),
    cole: fuera(data?.schoolMenus?.byMember) + (data?.schoolMenus?.weeks ?? []).reduce((n, w) => n + fuera(w?.byMember), 0),
    cuenta: Object.values(esObjeto(data?.accountMemberIdByUser) ? data.accountMemberIdByUser : {}).filter((v) => !ids.has(v)).length,
    reglas: (data?.reglas ?? []).filter((r) => r?.sujeto?.tipo === "miembro" && !ids.has(r.sujeto.ref)).length,
    grupos: (data?.groups ?? []).filter((g) => !g?.memberIds?.length || g.memberIds.some((x) => !ids.has(x))).length,
    mapas_de_grupo: MAPAS_POR_GRUPO.reduce((n, k) => n + (esObjeto(data?.[k]) ? Object.keys(data[k]).filter((g) => !gids.has(g)).length : 0), 0),
  };
}
