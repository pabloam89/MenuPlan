/**
 * Las preferencias de la casa que pesa el motor (con operador, fuerza y origen) y cuánto las cumple el menú (trozo 31
 * de #1037). Los valores salen de la vista que ya lee el motor (`sesgos`, `favoritos`, `cocinas`) y de la libreta su
 * origen y vigencia; los topes, de la libreta (`freqs.*`). Una regla de sesgo no tiene apunte: es dicha. Lo delegado y
 * lo que no vale hoy no cuentan. Los vetos y la salud no están: quitan el plato antes (filterRecipes).
 */
import { FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { matizDe, vigente } from "./notepad.js";
import { FAMILIA_LABELS } from "./notepadFields.js";
import { FORMA_DE_PROYECCION, FUERZA_BLANDA, TIPO_DE_AMBITO } from "./preferencias.js";
import { esAnadido } from "./cocinaTopes.js";
import { tipoDeGrupo } from "./groups.js";
import { OPERADOR_PREFERENCIA as OP } from "./vocabularios.js";
import { CIFRA_CUMPLIMIENTO as C } from "./rastro.js";
import { CASA_SESGO, SIGNO_SALSA } from "./sesgos.js";

/** Cómo sale una preferencia en el menú de la semana. */
export const ESTADOS_CUMPLIMIENTO = Object.freeze(["cumplida", "parcial", "no"]);
/** Por qué no se cumplió: ningún plato posible la cumple, u otra cosa pesó más (reparto, otra preferencia, reglas). */
export const MOTIVOS_INCUMPLIMIENTO = Object.freeze(["sin_candidatos", "pesaba_menos"]);

/** Cuánto pesa cada escalón de fuerza. `obligatoria` no está: no se pesa, es una regla. */
export const PESO_FUERZA = Object.freeze({ alto: 3, medio: 2, bajo: 1 });
/** Por origen (las FUENTES de la libreta): lo dicho pesa entero; lo visto, la mitad; lo supuesto, un cuarto (lo dicho manda: método de choques, trozo 33). */
export const FACTOR_ORIGEN = Object.freeze({ dicho: 1, visto: 0.5, supuesto: 0.25 });
/**
 * Un escalón en la escala del orden del solver (resolverMenu): un gusto dicho pesa más que el orden del pool y el ruido
 * de la semilla juntos (1,5 por plato del pool) y menos que PESO_RECIENTE y PESO_PRESUPUESTO (lo mide su test).
 */
export const UNIDAD_PESO = 1e3;

export const pesoDe = (p) => (p.fuerza === "obligatoria" ? Infinity : UNIDAD_PESO * PESO_FUERZA[p.fuerza] * FACTOR_ORIGEN[p.origen]);

/** Qué platos cumplen cada clase de preferencia: los de los sesgos (sesgos.js), la cuota de cocinas y la regla 11. */
const PREDICADO = Object.freeze({
  ...CASA_SESGO,
  cocina: (r, v) => r.cocina === v,
  freqs: (r, v) => !!FREQ_KEY_MATCHERS[v]?.(r),
});
/** Las clases de preferencia que pesa el motor: las de PREDICADO, ni una más. */
export const CAMPOS_DEL_MOTOR = Object.freeze(Object.keys(PREDICADO));

export const casaCon = (p, receta) => !!receta && PREDICADO[p.campo](receta, p.valor);

/** Las preferencias que valen para un grupo: las de la casa entera y las de su ámbito. */
export const delGrupo = (prefs, group) => prefs.filter((p) => !p.ambito || TIPO_DE_AMBITO[p.ambito] === tipoDeGrupo(group));

/** Pura. Las preferencias de la casa de una semana (las lee entradaDelMotor); lo que no vale `hoy` no cuenta. */
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
      // «no» a la salsa es «menos platos con salsa» (SIGNO_SALSA).
      const signo = Math.sign(Number(n)) * (campo === "salsa" ? SIGNO_SALSA[valor] ?? 1 : 1);
      poner({ id: `${campo}.${valor}`, campo, valor, operador: signo < 0 ? OP.MENOS : OP.MAS, origen, fuerza: fuerzaDe("sesgos", origen) });
    }
  }
  for (const valor of data?.favoritos ?? []) {
    if (!String(valor ?? "").trim()) continue;
    const origen = origenDe(apunte("favoritos", valor));
    poner({ id: `favoritos.${valor}`, campo: "favoritos", valor, operador: OP.MAS, origen, fuerza: fuerzaDe("favoritos", origen) });
  }
  // La cuota de cocinas: la que pesa el solver (cocinaPendiente) y recorta cuotaCocinas, de las cocinas añadidas.
  for (const [valor, n] of Object.entries(data?.cocinas ?? {})) {
    if (!esAnadido(valor) || !(Number(n) > 0)) continue;
    const origen = origenDe(apunte("cocina", valor));
    poner({ id: `cocina.${valor}`, campo: "cocina", valor, operador: OP.AL_MENOS, cantidad: Number(n), origen, fuerza: fuerzaDe("sesgos", origen) });
  }
  // Los topes de la libreta: «como mucho N de pescado». Dicho, obligatorio; visto o supuesto, nunca a cero (proyectar).
  for (const [ruta, c] of campos) {
    const [campo, valor, ...resto] = ruta.split(".");
    if (campo !== "freqs" || !FREQ_KEY_MATCHERS[valor] || !Number.isFinite(c.valor)) continue;
    const origen = origenDe(c);
    const ambito = resto.find((x) => x.startsWith("@"))?.slice(1) ?? null;
    if (ambito && !TIPO_DE_AMBITO[ambito]) continue;
    const cantidad = origen !== "dicho" && c.valor === 0 ? 1 : c.valor;
    poner({ id: ruta, campo, valor, operador: OP.COMO_MUCHO, cantidad, ambito, origen, fuerza: fuerzaDe("freqs", origen) });
  }
  return Object.freeze(out);
}

/** Lo que saldría al azar: los platos de la semana por la parte del pool que cumple la preferencia. */
function estadoDe(p, veces, platos, posibles, tamano) {
  const azar = tamano ? (posibles / tamano) * platos : 0;
  switch (p.operador) {
    case OP.MAS: return veces === 0 ? "no" : veces > azar ? "cumplida" : "parcial";
    case OP.MENOS: return veces === 0 || veces < azar ? "cumplida" : "no";
    case OP.AL_MENOS: return veces >= p.cantidad ? "cumplida" : veces > 0 ? "parcial" : "no";
    case OP.COMO_MUCHO: return veces <= p.cantidad ? "cumplida" : "no";
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
    const motivo = estado === "cumplida" ? null : posibles === 0 && p.operador !== OP.MENOS ? "sin_candidatos" : "pesaba_menos";
    return { id: p.id, campo: p.campo, valor: p.valor, operador: p.operador, cantidad: p.cantidad, origen: p.origen, fuerza: p.fuerza, estado, motivo, veces };
  });
  const porHueco = {};
  for (const a of asignaciones ?? []) {
    const r = porId.get(a.recipeId);
    const ids = prefs.filter((p) => (p.operador === OP.MAS || p.operador === OP.AL_MENOS) && casaCon(p, r)).map((p) => p.id);
    if (ids.length) porHueco[a.slotId] = ids;
  }
  return { preferencias, porHueco };
}

const COMO_SE_DICE = Object.freeze({
  tecnica: (v) => `cosas ${v === "horno" ? "al horno" : `de ${v}`}`,
  base: (v) => v,
  salsa: () => "platos con salsa",
  favoritos: (v) => `platos con ${v}`,
  cocina: (v) => `cocina ${v}`,
  freqs: (v) => String(FAMILIA_LABELS[v] ?? v).toLowerCase(),
});

/** Una preferencia en palabras: «más cosas al horno», «como mucho 2 de pescado». */
export function textoDe(p) {
  const que = COMO_SE_DICE[p.campo](p.valor);
  switch (p.operador) {
    case OP.MAS: return `más ${que}`;
    case OP.MENOS: return `menos ${que}`;
    case OP.AL_MENOS: return `${p.cantidad} ${p.cantidad === 1 ? "plato" : "platos"} de ${que}`;
    default: return `como mucho ${p.cantidad} de ${que}`;
  }
}

/** Pura. La cifra del plan sobre las filas de una semana (dichas, cumplidas, %) y, en palabras, las dichas que no. */
export function resumenCumplimiento(filas) {
  const dichas = (filas ?? []).filter((f) => f.origen === "dicho");
  const cumplidas = dichas.filter((f) => f.estado === "cumplida").length;
  const pct = dichas.length ? Math.round((100 * cumplidas) / dichas.length) : null;
  return { [C.dichas]: dichas.length, [C.cumplidas]: cumplidas, [C.pct]: pct, incumplidas: [...new Set(dichas.filter((f) => f.estado === "no").map(textoDe))] };
}
