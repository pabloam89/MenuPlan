/**
 * Las preferencias de la casa que pesa el motor, y cuánto las cumple el menú (trozo 31 de #1037).
 *
 *   preferenciasDelMotor  la casa de una semana → la lista de preferencias que el solver pesa y el informe mide, cada
 *                         una con su operador, su fuerza (FUERZAS_PREFERENCIA) y su origen (dicho, visto, supuesto)
 *   casaCon               ¿cumple este plato lo que pide la preferencia?
 *   pesoDe                cuánto pesa en el orden del solver: la fuerza por el origen (lo dicho pesa más)
 *   cumplimientoDelGrupo  el menú de un grupo → por preferencia, cumplida, parcial o no y por qué; y por hueco, las
 *                         que tiraron del plato que salió
 *   resumenCumplimiento   la cifra del plan: % de preferencias dichas cumplidas en la semana, y las que no
 *
 * Salen de la vista que ya lee el motor (`sesgos`, `favoritos`, `cocinas`), con el origen y la vigencia de su apunte
 * en la libreta (`notepad`); los topes por familia, de la libreta (`freqs.*`). Una regla de sesgo no está en la
 * libreta: se dice, así que es `dicho`. Lo `delegado` no es una preferencia (es permiso), ni lo que ya no vale hoy.
 * Los vetos y la salud no están aquí: no se pesan, quitan el plato antes (filterRecipes).
 */
import { FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { matizDe, vigente } from "./notepad.js";
import { FAMILIA_LABELS } from "./notepadFields.js";
import { FORMA_DE_PROYECCION, FUERZA_BLANDA } from "./preferencias.js";
import { esAnadido } from "./cocinaTopes.js";
import { tipoDeGrupo } from "./groups.js";
import { FUERZAS_PREFERENCIA } from "./vocabularios.js";

/** Cómo sale una preferencia en el menú de la semana. */
export const ESTADOS_CUMPLIMIENTO = Object.freeze(["cumplida", "parcial", "no"]);
/** Por qué no se cumplió: ningún plato posible la cumple, u otra cosa pesó más (reparto, otra preferencia, reglas). */
export const MOTIVOS_INCUMPLIMIENTO = Object.freeze(["sin_candidatos", "pesaba_menos"]);
/** De dónde sale una preferencia que pesa el motor (preferencia.origen de la 0109; matizDe de la libreta). */
export const ORIGENES_DEL_MOTOR = Object.freeze(["dicho", "visto", "supuesto"]);

/** Cuánto pesa cada escalón de fuerza. `obligatoria` no está: no se pesa, es una regla. */
export const PESO_FUERZA = Object.freeze({ alto: 3, medio: 2, bajo: 1 });
/** Lo dicho pesa entero; lo visto, la mitad; lo supuesto, un cuarto (lo dicho manda: método de choques, trozo 33). */
export const FACTOR_ORIGEN = Object.freeze({ dicho: 1, visto: 0.5, supuesto: 0.25 });
/**
 * Un escalón en la escala del orden del solver (solver.js, resolverMenu): por encima del orden del pool y del ruido de
 * la semilla (juntos no llegan a 500), y por debajo de lo reciente (6.000), el presupuesto (8.000) y el déficit del
 * reparto (10.000 por familia que falta). Un gusto dicho ordena de verdad, pero no desequilibra la semana.
 */
export const UNIDAD_PESO = 1e3;

export const pesoDe = (p) => (p.fuerza === "obligatoria" ? Infinity : UNIDAD_PESO * PESO_FUERZA[p.fuerza] * FACTOR_ORIGEN[p.origen]);

const minusculas = (x) => String(x ?? "").toLowerCase();

/** Qué platos cumplen cada clase de preferencia: lo mismo que miran sesgos.js, cuotaCocinas y la regla 11. */
const PREDICADO = Object.freeze({
  tecnica: (r, v) => r.tecnica === v,
  base: (r, v) => r.mainBase === v || (r.basesAparte ?? []).includes(v),
  salsa: (r, v) => (v === "si") === (r.llevaSalsa === true),
  favoritos: (r, v) => {
    const f = minusculas(v).trim();
    return !!f && (r.ingredients ?? []).some((i) => minusculas(i?.name).includes(f));
  },
  cocina: (r, v) => r.cocina === v,
  freqs: (r, v) => !!FREQ_KEY_MATCHERS[v]?.(r),
});
/** Las clases de preferencia que pesa el motor: las de PREDICADO, ni una más. */
export const CAMPOS_DEL_MOTOR = Object.freeze(Object.keys(PREDICADO));

export const casaCon = (p, receta) => !!receta && PREDICADO[p.campo](receta, p.valor);

/** El ámbito de la libreta (`@ninos`) y el tipo de grupo que lo es. */
const TIPO_DE_AMBITO = Object.freeze({ ninos: "ninos", adultos: "adultos", bebes: "bebe" });

/** Las preferencias que valen para un grupo: las de la casa entera y las de su ámbito. */
export const delGrupo = (prefs, group) => prefs.filter((p) => !p.ambito || TIPO_DE_AMBITO[p.ambito] === tipoDeGrupo(group));

/**
 * Pura. Las preferencias de la casa de una semana (lo que lee entradaDelMotor), en la forma que pesa el solver.
 * `hoy` (ISO): lo que la libreta ya no da por vigente ese día no cuenta.
 */
export function preferenciasDelMotor(data, { hoy = null } = {}) {
  const campos = Object.entries(data?.notepad?.campos ?? {})
    .filter(([, c]) => c && c.valor !== undefined && !c.delegado && vigente(c, hoy));
  const origenDe = (c) => (c ? matizDe(c) : "dicho");
  const apunte = (campo, valor) => campos.find(([ruta]) => ruta === `${campo}.${valor}` || ruta.startsWith(`${campo}.${valor}.`))?.[1];
  const fuerzaDe = (forma, origen) => (origen === "dicho" ? FORMA_DE_PROYECCION[forma].fuerza : FUERZA_BLANDA);
  const out = [];
  const poner = (p) => out.push(Object.freeze({ ambito: null, cantidad: null, ...p }));

  for (const campo of ["tecnica", "base", "salsa"]) {
    for (const [valor, n] of Object.entries(data?.sesgos?.[campo] ?? {})) {
      if (!Number(n)) continue;
      const origen = origenDe(apunte(campo, valor));
      poner({ id: `${campo}.${valor}`, campo, valor, operador: Number(n) < 0 ? "menos" : "mas", origen, fuerza: fuerzaDe("sesgos", origen) });
    }
  }
  for (const valor of data?.favoritos ?? []) {
    if (!String(valor ?? "").trim()) continue;
    const origen = origenDe(apunte("favoritos", valor));
    poner({ id: `favoritos.${valor}`, campo: "favoritos", valor, operador: "mas", origen, fuerza: fuerzaDe("favoritos", origen) });
  }
  // La cuota de cocinas: la que pesa el solver (cocinaPendiente) y recorta cuotaCocinas, de las cocinas añadidas.
  for (const [valor, n] of Object.entries(data?.cocinas ?? {})) {
    if (!esAnadido(valor) || !(Number(n) > 0)) continue;
    const origen = origenDe(apunte("cocina", valor));
    poner({ id: `cocina.${valor}`, campo: "cocina", valor, operador: "al_menos", cantidad: Number(n), origen, fuerza: fuerzaDe("sesgos", origen) });
  }
  // Los topes de la libreta: «como mucho N de pescado». Dicho, obligatorio; visto o supuesto, nunca a cero (proyectar).
  for (const [ruta, c] of campos) {
    const [campo, valor, ...resto] = ruta.split(".");
    if (campo !== "freqs" || !FREQ_KEY_MATCHERS[valor] || !Number.isFinite(c.valor)) continue;
    const origen = origenDe(c);
    const ambito = resto.find((x) => x.startsWith("@"))?.slice(1) ?? null;
    if (ambito && !TIPO_DE_AMBITO[ambito]) continue;
    poner({
      id: ruta, campo, valor, operador: "como_mucho", ambito, origen, fuerza: fuerzaDe("freqs", origen),
      cantidad: origen !== "dicho" && c.valor === 0 ? 1 : c.valor,
    });
  }
  return Object.freeze(out);
}

/** Lo que saldría al azar: los platos de la semana por la parte del pool que cumple la preferencia. */
function estadoDe(p, veces, platos, posibles, tamano) {
  const azar = tamano ? (posibles / tamano) * platos : 0;
  switch (p.operador) {
    case "mas": return veces === 0 ? "no" : veces > azar ? "cumplida" : "parcial";
    case "menos": return veces === 0 || veces < azar ? "cumplida" : "no";
    case "al_menos": return veces >= p.cantidad ? "cumplida" : veces > 0 ? "parcial" : "no";
    case "como_mucho": return veces <= p.cantidad ? "cumplida" : "no";
    default: throw new Error(`preferencia ${p.id}: operador ${p.operador} sin cumplimiento`);
  }
}

/**
 * Pura. Cuánto cumple el menú de un grupo (`asignaciones`: { slotId, recipeId }) cada preferencia, sobre `pool`, los
 * platos que podían salir. Por hueco, las que pidieron el plato que salió (`mas` y `al_menos` que cumple): el `motivo`.
 */
export function cumplimientoDelGrupo(prefs, asignaciones, pool) {
  const porId = new Map((pool ?? []).map((r) => [r.id, r]));
  const platos = (asignaciones ?? []).map((a) => porId.get(a.recipeId)).filter(Boolean);
  const preferencias = prefs.map((p) => {
    const veces = platos.filter((r) => casaCon(p, r)).length;
    const posibles = (pool ?? []).filter((r) => casaCon(p, r)).length;
    const estado = estadoDe(p, veces, platos.length, posibles, pool?.length ?? 0);
    const motivo = estado === "cumplida" ? null : posibles === 0 && p.operador !== "menos" ? "sin_candidatos" : "pesaba_menos";
    return { id: p.id, campo: p.campo, valor: p.valor, operador: p.operador, cantidad: p.cantidad, origen: p.origen, fuerza: p.fuerza, estado, motivo, veces };
  });
  const porHueco = {};
  for (const a of asignaciones ?? []) {
    const r = porId.get(a.recipeId);
    const ids = prefs.filter((p) => (p.operador === "mas" || p.operador === "al_menos") && casaCon(p, r)).map((p) => p.id);
    if (ids.length) porHueco[a.slotId] = ids;
  }
  return { preferencias, porHueco };
}

const COMO_SE_DICE = Object.freeze({
  tecnica: (v) => `cosas ${v === "horno" ? "al horno" : `de ${v}`}`,
  base: (v) => v,
  salsa: (v) => (v === "si" ? "platos con salsa" : "platos sin salsa"),
  favoritos: (v) => `platos con ${v}`,
  cocina: (v) => `cocina ${v}`,
  freqs: (v) => minusculas(FAMILIA_LABELS[v] ?? v),
});

/** Una preferencia en palabras: «más cosas al horno», «como mucho 2 de pescado». */
export function textoDe(p) {
  const que = COMO_SE_DICE[p.campo](p.valor);
  switch (p.operador) {
    case "mas": return `más ${que}`;
    case "menos": return `menos ${que}`;
    case "al_menos": return `${p.cantidad} ${p.cantidad === 1 ? "plato" : "platos"} de ${que}`;
    default: return `como mucho ${p.cantidad} de ${que}`;
  }
}

/**
 * Pura. La cifra del plan sobre las filas de todos los grupos de una semana: cuántas preferencias dichas hay, cuántas
 * se cumplen y su %, y en palabras las dichas que no se cumplen (sin repetir), que es lo que se le dice a la familia.
 */
export function resumenCumplimiento(filas) {
  const dichas = (filas ?? []).filter((f) => f.origen === "dicho");
  const cumplidas = dichas.filter((f) => f.estado === "cumplida").length;
  return {
    dichas: dichas.length,
    cumplidas,
    pct: dichas.length ? Math.round((100 * cumplidas) / dichas.length) : null,
    incumplidas: [...new Set(dichas.filter((f) => f.estado === "no").map(textoDe))],
  };
}

// Las listas cerradas, comprobadas al cargar: cada escalón con peso es una fuerza de la 0109 y cada clase se dice.
for (const f of Object.keys(PESO_FUERZA)) if (!FUERZAS_PREFERENCIA.includes(f)) throw new Error(`PESO_FUERZA.${f} no es una fuerza`);
if (Object.keys(FACTOR_ORIGEN).join() !== ORIGENES_DEL_MOTOR.join()) throw new Error("FACTOR_ORIGEN no es ORIGENES_DEL_MOTOR");
if (Object.keys(COMO_SE_DICE).join() !== CAMPOS_DEL_MOTOR.join()) throw new Error("COMO_SE_DICE no es CAMPOS_DEL_MOTOR");
