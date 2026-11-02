/**
 * Los vetos y sesgos de las reglas como preferencias (trozo 14; tabla preferencia, 0109): una regla (reglas.js) de
 * `excluir` o `sesgo` es una fila de `preferencia`, y las reglas se calculan de las filas al leer, como la libreta
 * (preferencias.js). Las de `presente` (quién come dónde) siguen en el documento. Sujeto: casa, grupo_id o persona_id
 * (un invitado no es de la casa); ámbito: dias, comidas, semanas, su salvedad (salvo_*) y la vigencia (desde, hasta).
 */
import { CAMPOS, CAMPOS_POR_ID } from "./notepadFields.js";
import { apunteDeFila, PreferenciaInvalida, FORMA_DE_PROYECCION } from "./preferencias.js";
import { PREFIJO_TECNICA } from "./excluirHueco.js";
import { normalizarRegla, EFECTOS } from "./reglas.js";
import { EJE_POR_ID } from "../data/axisRegistry.js";
import { COMIDAS, DIAS } from "./vocabularios.js";

/** Los efectos de una regla que son preferencias. El resto (`presente`) se queda en el documento. */
export const EFECTOS_DE_PREFERENCIA = Object.freeze(["excluir", "sesgo"]);
export const esReglaDePreferencia = (regla) => EFECTOS_DE_PREFERENCIA.includes(regla?.efecto?.tipo);

// Un veto y un sesgo tienen la forma de los de la libreta: el mismo deseo es la misma fila. Lo que se quita va al eje
// de los excluidos («coliflor», «grupo:carne», tal como lo entiende excluirHueco.js), salvo «tecnica:x», al de tecnica.
const { marca: _m, ...EXCLUIR } = FORMA_DE_PROYECCION.excluidos;
const { sesgo: _s, ...SESGO } = FORMA_DE_PROYECCION.sesgos;
const EJE_EXCLUIR = CAMPOS_POR_ID.excluidos.eje;
const EJE_TECNICA = CAMPOS_POR_ID.tecnica.eje;
/** Las reglas se dicen: nunca se suponen (ajustes.js, gustosPorDias, solo apunta lo dicho). */
const ORIGEN_FILA = "dicho";
const ORIGEN_REGLA = "texto";

const dia = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : undefined);

/** Una lista del ámbito, comprobada contra su vocabulario (el CHECK de la 0109), o null. */
function lista(valores, vocabulario, que) {
  if (!valores?.length) return null;
  const fuera = valores.filter((v) => !vocabulario.includes(v));
  if (fuera.length) throw new PreferenciaInvalida(`${que}: ${fuera.join(", ")} no ${fuera.length > 1 ? "son" : "es"} de la lista`);
  return [...valores];
}

function sujetoEnFila({ tipo, ref }, { grupos, miembros }) {
  if (tipo === "casa") return { persona_id: null, grupo_id: null };
  const de = { grupo: grupos, miembro: miembros }[tipo];
  if (!de) throw new PreferenciaInvalida(`una regla de ${tipo} no es una preferencia de la casa`);
  if (!de.some((x) => x.id === ref)) throw new PreferenciaInvalida(`${tipo === "grupo" ? "el grupo" : "la persona"} ${ref} no es de la casa`);
  return tipo === "grupo" ? { persona_id: null, grupo_id: ref } : { persona_id: ref, grupo_id: null };
}

function efectoEnFila(efecto) {
  if (efecto.tipo === "excluir") {
    const item = String(efecto.valor).trim();
    return item.startsWith(PREFIJO_TECNICA)
      ? { ...EXCLUIR, eje: EJE_TECNICA, valor: item.slice(PREFIJO_TECNICA.length), cantidad: null }
      : { ...EXCLUIR, eje: EJE_EXCLUIR, valor: item, cantidad: null };
  }
  const { campo, valor, peso } = efecto.valor;
  const eje = CAMPOS_POR_ID[campo].eje;
  const enEje = EJE_POR_ID.get(eje)?.tipo === "booleano" ? valor === "si" : valor;
  return { ...SESGO, eje, valor: enEje, operador: peso < 0 ? "menos" : "mas", cantidad: Math.abs(peso) };
}

/** Pura. Una regla de excluir o sesgo como fila (sin id). PreferenciaInvalida si no lo es o no cabe en la tabla. */
export function filaDeRegla(regla, ctx = {}) {
  const r = normalizarRegla(regla);
  if (!r) throw new PreferenciaInvalida(`la regla ${regla?.id ?? "sin id"} no es válida`);
  if (!esReglaDePreferencia(r)) throw new PreferenciaInvalida(`una regla de ${r.efecto.tipo} no es una preferencia`);
  const a = r.ambito ?? {};
  const s = r.salvedad ?? {};
  return {
    ...sujetoEnFila(r.sujeto, ctx),
    ...efectoEnFila(r.efecto),
    dias: lista(a.dias, DIAS, "días"),
    comidas: lista(a.comidas, COMIDAS, "comidas"),
    semanas: a.semanas?.length ? [...a.semanas] : null,
    salvo_dias: lista(s.dias, DIAS, "días de la salvedad"),
    salvo_comidas: lista(s.comidas, COMIDAS, "comidas de la salvedad"),
    salvo_semanas: s.semanas?.length ? [...s.semanas] : null,
    desde: r.vigencia?.desde ?? null,
    hasta: r.vigencia?.hasta ?? null,
    frase: r.frase ?? null,
    origen: ORIGEN_FILA,
  };
}

/** El efecto de una fila, o null si no es de una regla. */
function efectoDeFila(fila) {
  if (fila.nivel !== EXCLUIR.nivel || fila.medida !== EXCLUIR.medida || fila.plan_id) return null;
  if (fila.operador === EXCLUIR.operador) {
    if (fila.eje === EJE_TECNICA) return { tipo: "excluir", valor: `${PREFIJO_TECNICA}${fila.valor}` };
    if (fila.eje === EJE_EXCLUIR) return { tipo: "excluir", valor: String(fila.valor) };
    return null;
  }
  if (!["mas", "menos"].includes(fila.operador) || fila.cantidad == null) return null;
  const campo = CAMPOS.find((c) => c.proyecta === "sesgos" && c.eje === fila.eje);
  if (!campo) return null;
  const valor = typeof fila.valor === "boolean" ? (fila.valor ? "si" : "no") : String(fila.valor);
  const peso = Number(fila.cantidad) * (fila.operador === "menos" ? -1 : 1);
  return { tipo: "sesgo", valor: { campo: campo.id, valor, peso } };
}

const ambitoDe = (dias, comidas, semanas) => ({
  ...(dias ? { dias: [...dias] } : {}), ...(comidas ? { comidas: [...comidas] } : {}), ...(semanas ? { semanas: [...semanas] } : {}),
});

/** Pura. Una fila como regla, o null si no lo es o si es de la libreta (que lee antes: un veto de toda la casa sin días). */
export function reglaDeFila(fila, ctx = {}) {
  if (apunteDeFila(fila, ctx)) return null;
  const efecto = efectoDeFila(fila);
  if (!efecto) return null;
  const sujeto = fila.persona_id ? { tipo: "miembro", ref: fila.persona_id }
    : fila.grupo_id ? { tipo: "grupo", ref: fila.grupo_id } : { tipo: "casa" };
  const salvedad = ambitoDe(fila.salvo_dias, fila.salvo_comidas, fila.salvo_semanas);
  return normalizarRegla({
    id: fila.id,
    sujeto,
    ambito: ambitoDe(fila.dias, fila.comidas, fila.semanas),
    vigencia: { ...(fila.desde ? { desde: fila.desde } : {}), ...(fila.hasta ? { hasta: fila.hasta } : {}) },
    efecto,
    ...(Object.keys(salvedad).length ? { salvedad } : {}),
    origen: ORIGEN_REGLA,
    ...(fila.frase ? { frase: fila.frase } : {}),
    ...(fila.created_at ? { creadaEn: dia(fila.created_at) } : {}),
  });
}

/** Pura. Las reglas de una casa, de sus filas de preferencia (las de la libreta y las que no son reglas, fuera). */
export function reglasDeFilas(filas, ctx = {}) {
  return (filas ?? []).map((f) => reglaDeFila(f, ctx)).filter(Boolean);
}

/** Lo que hace a dos filas la misma preferencia (preferencia_unica, 0109): todo menos cuánto, cuánto manda y su sobre. */
const CLAVES_DE_FIRMA = ["persona_id", "grupo_id", "nivel", "eje", "medida", "operador", "valor", "dias", "comidas", "semanas",
  "salvo_dias", "salvo_comidas", "salvo_semanas", "desde", "hasta"];
const firma = (fila) => JSON.stringify(CLAVES_DE_FIRMA.map((k) => fila[k] ?? null));

/**
 * Pura. Lo que cambió entre dos listas de reglas (las de preferencia), como la lista `preferencias` de
 * escribir_preferencias: crear (sin id), cambiar y borrar (con el id de su fila: el de la regla o, si aún lleva el de
 * ids.regla porque se acaba de crear, el de la fila con su misma firma). `filas`: las de preferencias_de_casa.
 */
export function cambiosDeReglas(antes, despues, filas, ctx = {}) {
  const idPorFirma = new Map((filas ?? []).filter((f) => reglaDeFila(f, ctx)).map((f) => [firma(f), f.id]));
  const deFila = new Set(idPorFirma.values());
  const idDeFila = (regla, fila) => (deFila.has(regla.id) ? regla.id : idPorFirma.get(firma(fila ?? filaDeRegla(regla, ctx))));
  const previas = new Map((antes ?? []).filter(esReglaDePreferencia).map((r) => [r.id, r]));
  const nuevas = (despues ?? []).filter(esReglaDePreferencia);
  const cambios = [];
  for (const regla of nuevas) {
    if (JSON.stringify(previas.get(regla.id)) === JSON.stringify(regla)) continue;
    const fila = filaDeRegla(regla, ctx);
    const id = idDeFila(regla, fila);
    cambios.push(id ? { ...fila, id } : fila);
  }
  const siguen = new Set(nuevas.map((r) => r.id));
  for (const [idRegla, regla] of previas) {
    const id = siguen.has(idRegla) ? null : idDeFila(regla);
    if (id) cambios.push({ id, borrar: true });
  }
  return cambios;
}

// Comprobado al cargar (principio 3): un efecto de preferencia que reglas.js no conozca no se guardaría nunca.
for (const e of EFECTOS_DE_PREFERENCIA) if (!EFECTOS.includes(e)) throw new Error(`EFECTOS_DE_PREFERENCIA: ${e} no es un efecto de reglas.js`);
