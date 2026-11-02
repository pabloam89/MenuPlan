/**
 * La libreta como preferencias (plan fichas con estado, trozo 14; tabla preferencia, 0109).
 *
 * Cada apunte de la libreta (notepad.js: `campo.valor[@ámbito][#servicio]` → valor y su procedencia) es una fila
 * de `preferencia`, y al revés: la libreta que leen la app, Lola y el motor se calcula de las filas al leer, como
 * `members` se calcula de `persona` (personas.js). Aquí, puro y en un solo sitio:
 *
 *   filaDeApunte     un apunte → la fila que se pide a escribir_preferencias (sin id)
 *   apunteDeFila     una fila → [ruta, apunte], o null si no es de la libreta (de una regla, de un conjunto…)
 *   libretaDeFilas   las filas de preferencias_de_casa → la libreta
 *   cambiosDeLibreta lo que cambió entre dos libretas → la lista `preferencias` de la operación
 *
 * Cómo es cada campo como preferencia lo dice FORMA_DE_PROYECCION, por su `proyecta` (notepadFields.js); el eje es
 * el del campo. Lo que la libreta no puede decir con una fila no se guarda: `anterior` (deshacer lo hace la
 * operación, con su inversa) y un apunte sin valor ni rechazo (no cambia el menú).
 */
import { CAMPOS, CAMPOS_POR_ID } from "./notepadFields.js";
import { matizDe, NOTEPAD_VERSION } from "./notepad.js";
import { tipoDeGrupo } from "./groups.js";
import { EJE_POR_ID } from "../data/axisRegistry.js";
import { FUERZAS_PREFERENCIA, MEDIDAS_PREFERENCIA, NIVELES_PREFERENCIA, OPERADORES_PREFERENCIA } from "./vocabularios.js";

/** Una fila o un apunte que no cabe en la otra forma: quien lo pide lo dice, no se guarda a medias. */
export class PreferenciaInvalida extends Error {}

/**
 * Cómo es, como preferencia, cada clase de campo de la libreta (su `proyecta`). `sesgo`: el signo del valor da el
 * operador (mas / menos) y su tamaño la cantidad. `marca`: solo se guarda si es verdadera.
 */
export const FORMA_DE_PROYECCION = Object.freeze({
  freqs: { nivel: "semana", medida: "cuenta", operador: "como_mucho", fuerza: "obligatoria" },
  reparto: { nivel: "semana", medida: "media", operador: "es", fuerza: "alto" },
  tanda: { nivel: "semana", medida: "cuenta", operador: "al_menos", fuerza: "obligatoria" },
  tandaPlatos: { nivel: "semana", medida: "cuenta", operador: "al_menos", fuerza: "obligatoria" },
  sesgos: { nivel: "plato", medida: "valor", sesgo: true, fuerza: "medio" },
  favoritos: { nivel: "plato", medida: "valor", operador: "mas", marca: true, fuerza: "medio" },
  excluidos: { nivel: "plato", medida: "valor", operador: "no_es", marca: true, fuerza: "obligatoria" },
});
/** Lo visto y lo supuesto solo sesgan (notepad.js, matizDe): nunca mandan. */
const FUERZA_BLANDA = "bajo";

/** El ámbito de la libreta (AMBITOS) y el tipo de grupo de la casa (TIPOS_GRUPO) que lo es. */
const TIPO_DE_AMBITO = Object.freeze({ ninos: "ninos", adultos: "adultos", bebes: "bebe" });
const AMBITO_DE_TIPO = Object.freeze(Object.fromEntries(Object.entries(TIPO_DE_AMBITO).map(([a, t]) => [t, a])));
/** El servicio de la libreta (SERVICIOS) y la comida (COMIDAS) que lo es. */
const COMIDA_DE_SERVICIO = Object.freeze({ comida: "Comida", cena: "Cena" });
const SERVICIO_DE_COMIDA = Object.freeze(Object.fromEntries(Object.entries(COMIDA_DE_SERVICIO).map(([s, c]) => [c, s])));

const dia = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : undefined);

/** El valor del eje como lo guarda la tabla: sí/no en un eje booleano, texto en los demás. */
function valorDelEje(eje, valorId) {
  if (EJE_POR_ID.get(eje)?.tipo !== "booleano") return valorId;
  if (valorId !== "si" && valorId !== "no") throw new PreferenciaInvalida(`el eje ${eje} es sí/no, no «${valorId}»`);
  return valorId === "si";
}
const valorIdDelEje = (valor) => (typeof valor === "boolean" ? (valor ? "si" : "no") : String(valor));

/** El grupo de la casa que es un ámbito de la libreta (niños, adultos, bebés), por su tipo; el primero si hay varios. */
function grupoDeAmbito(ambito, grupos) {
  const tipo = TIPO_DE_AMBITO[ambito];
  const g = (grupos ?? []).find((x) => tipoDeGrupo(x) === tipo);
  if (!g) throw new PreferenciaInvalida(`la casa no tiene un grupo de ${ambito}`);
  return g.id;
}

/** El valor de la libreta → { operador, valor, cantidad } de la fila, o null si no se guarda (una marca falsa). */
function medidaDe(forma, eje, valorId, valor) {
  if (forma.marca) return valor ? { operador: forma.operador, valor: valorDelEje(eje, valorId), cantidad: null } : null;
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new PreferenciaInvalida(`«${valorId}»: el valor es un número, no ${JSON.stringify(valor)}`);
  if (forma.sesgo) return { operador: valor < 0 ? "menos" : "mas", valor: valorDelEje(eje, valorId), cantidad: Math.abs(valor) };
  return { operador: forma.operador, valor: valorDelEje(eje, valorId), cantidad: valor };
}

/**
 * Pura. Un apunte de la libreta como fila de preferencia (sin id), o null si no cambia nada (sin valor, o una
 * marca falsa). Lanza PreferenciaInvalida si la ruta no es de la libreta o la casa no tiene el grupo del ámbito.
 */
export function filaDeApunte(ruta, apunte, { grupos } = {}) {
  const [campoId, valorId, ...resto] = String(ruta).split(".");
  const campo = CAMPOS_POR_ID[campoId];
  const forma = FORMA_DE_PROYECCION[campo?.proyecta];
  if (!forma || !valorId) throw new PreferenciaInvalida(`«${ruta}» no es una ruta de la libreta`);
  if (apunte?.valor === undefined) return null;
  const medida = medidaDe(forma, campo.eje, valorId, apunte.valor);
  if (!medida) return null;
  const ambito = resto.find((p) => p.startsWith("@"))?.slice(1);
  const servicio = resto.find((p) => p.startsWith("#"))?.slice(1);
  if (servicio && !COMIDA_DE_SERVICIO[servicio]) throw new PreferenciaInvalida(`«${ruta}»: servicio «${servicio}»`);
  const matiz = matizDe(apunte);
  return {
    grupo_id: ambito ? grupoDeAmbito(ambito, grupos) : null,
    nivel: forma.nivel, eje: campo.eje, medida: forma.medida, ...medida,
    fuerza: matiz === "visto" || matiz === "supuesto" ? FUERZA_BLANDA : forma.fuerza,
    comidas: servicio ? [COMIDA_DE_SERVICIO[servicio]] : null,
    desde: apunte.desde ?? null, hasta: apunte.hasta ?? null,
    frase: apunte.procedencia?.frase ?? null,
    origen: matiz,
    confirmado: apunte.confirmado === true || apunte.origen === "pregunta" || apunte.bloqueado === true,
  };
}

/** El campo de la libreta al que corresponde una fila (eje, nivel, medida y operador), o null. */
function campoDeFila(fila) {
  return CAMPOS.find((c) => {
    const f = FORMA_DE_PROYECCION[c.proyecta];
    return c.eje === fila.eje && f.nivel === fila.nivel && f.medida === fila.medida
      && (f.sesgo ? ["mas", "menos"].includes(fila.operador) : f.operador === fila.operador);
  }) ?? null;
}

/**
 * Pura. Una fila de preferencias_de_casa como apunte de la libreta: [ruta, apunte], o null si no es de la libreta
 * (de una persona, de un conjunto, con días o semanas, o de un eje que la libreta no tiene).
 */
export function apunteDeFila(fila, { grupos } = {}) {
  const campo = campoDeFila(fila);
  if (!campo || fila.persona_id || fila.plan_id || fila.dias || fila.semanas || fila.salvo_dias || fila.salvo_comidas || fila.salvo_semanas) return null;
  if (fila.comidas && (fila.comidas.length !== 1 || !SERVICIO_DE_COMIDA[fila.comidas[0]])) return null;
  let ambito = null;
  if (fila.grupo_id) {
    ambito = AMBITO_DE_TIPO[tipoDeGrupo((grupos ?? []).find((g) => g.id === fila.grupo_id))];
    if (!ambito) return null;
  }
  const forma = FORMA_DE_PROYECCION[campo.proyecta];
  const valor = forma.marca ? true : forma.sesgo && fila.operador === "menos" ? -Number(fila.cantidad) : Number(fila.cantidad);
  const ruta = [campo.id, valorIdDelEje(fila.valor), ...(ambito ? [`@${ambito}`] : []),
    ...(fila.comidas ? [`#${SERVICIO_DE_COMIDA[fila.comidas[0]]}`] : [])].join(".");
  const blando = fila.origen === "visto" || fila.origen === "supuesto";
  const apunte = {
    valor,
    origen: fila.confirmado_at ? "pregunta" : "texto",
    confirmado: Boolean(fila.confirmado_at),
    delegado: fila.origen === "delegado",
    bloqueado: false,
    ...(fila.frase ? { procedencia: { frase: fila.frase, fecha: dia(fila.updated_at) } } : {}),
    ...(blando ? { fuente: fila.origen, apuntado: dia(fila.updated_at) } : {}),
    ...(fila.desde ? { desde: fila.desde } : {}),
    ...(fila.hasta ? { hasta: fila.hasta } : {}),
  };
  if (!fila.rechazada_at) return [ruta, apunte];
  const { valor: _v, fuente: _f, apuntado: _a, ...resto } = apunte;
  return [ruta, { ...resto, valor: undefined, rechazos: [{ valor, fecha: dia(fila.rechazada_at) }] }];
}

/** Pura. La libreta de una casa, de sus filas de preferencia (las que no son de la libreta se quedan fuera). */
export function libretaDeFilas(filas, { grupos } = {}) {
  const campos = {};
  for (const fila of filas ?? []) {
    const e = apunteDeFila(fila, { grupos });
    if (e) campos[e[0]] = e[1];
  }
  return { v: NOTEPAD_VERSION, campos };
}

/**
 * Pura. Lo que cambió entre dos libretas, como la lista `preferencias` de escribir_preferencias (0109): crear o
 * cambiar (con el id de su fila si ya la tiene), rechazar lo supuesto que la familia desmintió, o borrar lo que se
 * olvidó. `filas`: las de preferencias_de_casa, de donde salen los ids.
 */
export function cambiosDeLibreta(antes, despues, filas, { grupos } = {}) {
  const idDe = new Map();
  for (const fila of filas ?? []) {
    const e = apunteDeFila(fila, { grupos });
    if (e) idDe.set(e[0], fila.id);
  }
  const a = antes?.campos ?? {};
  const d = despues?.campos ?? {};
  const cambios = [];
  for (const ruta of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (JSON.stringify(a[ruta]) === JSON.stringify(d[ruta])) continue;
    const id = idDe.get(ruta);
    const fila = d[ruta] ? filaDeApunte(ruta, d[ruta], { grupos }) : null;
    if (fila) cambios.push(id ? { ...fila, id } : fila);
    else if (id && (d[ruta]?.rechazos?.length ?? 0) > (a[ruta]?.rechazos?.length ?? 0)) cambios.push({ id, rechazar: true });
    else if (id) cambios.push({ id, borrar: true });
  }
  return cambios;
}

// Los vocabularios de la forma, comprobados al cargar (principio 3): una forma con un valor que la tabla no admite
// fallaría en cada escritura, mejor aquí.
for (const [k, f] of Object.entries(FORMA_DE_PROYECCION)) {
  if (!NIVELES_PREFERENCIA.includes(f.nivel) || !MEDIDAS_PREFERENCIA.includes(f.medida) || !FUERZAS_PREFERENCIA.includes(f.fuerza)
    || (f.operador && !OPERADORES_PREFERENCIA.includes(f.operador))) throw new Error(`FORMA_DE_PROYECCION.${k}: fuera de los vocabularios de la preferencia`);
}
if (!FUERZAS_PREFERENCIA.includes(FUERZA_BLANDA)) throw new Error("FUERZA_BLANDA fuera de FUERZAS_PREFERENCIA");
