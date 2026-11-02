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
import { CAMPOS, CAMPOS_POR_ID, AMBITOS, SERVICIOS } from "./notepadFields.js";
import { COMIDAS } from "./comidas.js";
import { matizDe, NOTEPAD_VERSION } from "./notepad.js";
import { tipoDeGrupo } from "./groups.js";
import { EJE_POR_ID } from "../data/axisRegistry.js";
import { FUERZAS_PREFERENCIA, MEDIDAS_PREFERENCIA, NIVELES_PREFERENCIA, OPERADORES_PREFERENCIA, TIPOS_GRUPO } from "./vocabularios.js";

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
export const FUERZA_BLANDA = "bajo";

/**
 * El ámbito de la libreta (AMBITOS) y el tipo de grupo de la casa (TIPOS_GRUPO) que lo es: el mismo nombre, salvo
 * «bebes», que en los grupos es «bebe». Comprobado al cargar contra las dos listas.
 */
const TIPO_DE_AMBITO = Object.freeze(Object.fromEntries(AMBITOS.filter((a) => a !== "todos").map((a) => [a, a === "bebes" ? "bebe" : a])));
const AMBITO_DE_TIPO = Object.freeze(Object.fromEntries(Object.entries(TIPO_DE_AMBITO).map(([a, t]) => [t, a])));
/** El servicio de la libreta (SERVICIOS, sin «ambos») y la comida (COMIDAS) que lo es: la de ese nombre. */
const COMIDA_DE_SERVICIO = Object.freeze(Object.fromEntries(SERVICIOS.filter((s) => s !== "ambos")
  .map((s) => [s, COMIDAS.find((c) => c.nombre === s)?.id])));
const SERVICIO_DE_COMIDA = Object.freeze(Object.fromEntries(Object.entries(COMIDA_DE_SERVICIO).map(([s, c]) => [c, s])));

export const dia = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : undefined);

/** El valor del eje como lo guarda la tabla: sí/no en un eje booleano, texto en los demás. */
export function valorDelEje(eje, valorId) {
  if (EJE_POR_ID.get(eje)?.tipo !== "booleano") return valorId;
  if (valorId !== "si" && valorId !== "no") throw new PreferenciaInvalida(`el eje ${eje} es sí/no, no «${valorId}»`);
  return valorId === "si";
}
export const valorIdDelEje = (valor) => (typeof valor === "boolean" ? (valor ? "si" : "no") : String(valor));

/**
 * El grupo de la casa que es un ámbito de la libreta (niños, adultos, bebés), por su tipo. Sin ninguno, o con
 * varios (una fila lleva un solo grupo y no se sabe a cuál va), lanza PreferenciaInvalida.
 */
function grupoDeAmbito(ambito, grupos) {
  const tipo = TIPO_DE_AMBITO[ambito];
  const deTipo = (grupos ?? []).filter((x) => tipoDeGrupo(x) === tipo);
  if (!deTipo.length) throw new PreferenciaInvalida(`la casa no tiene un grupo de ${ambito}`);
  if (deTipo.length > 1) throw new PreferenciaInvalida(`la casa tiene ${deTipo.length} grupos de ${ambito} y no sé a cuál va`);
  return deTipo[0].id;
}

/** Un sesgo con signo como fila (mas/menos y su tamaño), y al revés; los usan la libreta y las reglas (reglasEnFilas.js). */
export const sesgoEnFila = (n) => ({ operador: n < 0 ? "menos" : "mas", cantidad: Math.abs(n) });
const OPERADORES_SESGO = ["mas", "menos"];
export const esSesgo = (fila) => OPERADORES_SESGO.includes(fila.operador) && fila.cantidad != null;
export const sesgoDeFila = (fila) => (fila.operador === "menos" ? -1 : 1) * Number(fila.cantidad);

/** El valor de la libreta → { operador, valor, cantidad } de la fila, o null si no se guarda (una marca falsa). */
function medidaDe(forma, eje, valorId, valor) {
  if (forma.marca) return valor ? { operador: forma.operador, valor: valorDelEje(eje, valorId), cantidad: null } : null;
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new PreferenciaInvalida(`«${valorId}»: el valor es un número, no ${JSON.stringify(valor)}`);
  if (forma.sesgo) return { ...sesgoEnFila(valor), valor: valorDelEje(eje, valorId) };
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
      && (f.sesgo ? OPERADORES_SESGO.includes(fila.operador) : f.operador === fila.operador);
  }) ?? null;
}

/**
 * Pura. Una fila de preferencias_de_casa como apunte de la libreta: [ruta, apunte], o null si no es de la libreta
 * (de una persona, de un conjunto, con días o semanas, de un eje que la libreta no tiene, o sin la cantidad que
 * lleva todo apunte que no es una marca).
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
  // «grupo:carne» no es un ingrediente: es lo que quita una regla (excluirHueco.js) y se lee como regla (reglasEnFilas.js).
  if (forma.marca && String(fila.valor).includes(":")) return null;
  // Sin cantidad (la 0109 la deja nula en una medida «valor» sin peso) no es un apunte de la libreta, que siempre
  // lleva un número: es de quien escribió la fila (una regla) y se queda en ella, no se lee como 0.
  if (!forma.marca && (fila.cantidad == null || !Number.isFinite(Number(fila.cantidad)))) return null;
  const valor = forma.marca ? true : forma.sesgo ? sesgoDeFila(fila) : Number(fila.cantidad);
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
for (const [ambito, tipo] of Object.entries(TIPO_DE_AMBITO)) {
  if (!TIPOS_GRUPO.includes(tipo)) throw new Error(`el ámbito ${ambito} no es ningún tipo de grupo (TIPOS_GRUPO)`);
}
for (const [servicio, comida] of Object.entries(COMIDA_DE_SERVICIO)) {
  if (!comida) throw new Error(`el servicio ${servicio} no es ninguna comida (COMIDAS)`);
}
