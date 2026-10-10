/**
 * Cumplimiento del flujo (#341, fondo #334): ¿se hace lo que el flujo manda?
 * Cuenta, sobre los issues de los problemas de fondo, lo que `docs/ops/FLUJO.md`
 * pide y no se está haciendo. Puro: los issues entran por argumento (la forma de
 * `desdeGraphql`), nada de red ni de reloj.
 *
 * Una línea por indicador, para contarla:
 *   indicador: <id> valor: <n> umbral: <m> estado: ok|dispara|sin_datos [en: #1,#2]
 *
 * Vocabulario cerrado (`INDICADORES`), umbral por indicador. «Dispara» es valor
 * MAYOR que el umbral. Repo público: la línea lleva números de issue y
 * vocabulario nuestro, nunca texto del autor.
 *
 * Qué no mide todavía: el registro local de la fábrica (#340) solo existe en el
 * PC de cada persona y el CI no lo ve; se lee aparte (`poda`, más abajo).
 */
import { ESTADOS_CON_DIAGNOSTICO, ESTADOS_CON_PLAN, aprendizajeValido, esDeLaCasa, fichaObligatoria, leerEncargo, leerFicha } from "./fondos.mjs";
import { porGrupo } from "./issues.mjs";
import { CATALOGO, TOPE_RONDAS, presupuestoDe } from "./presupuestos.mjs";

export const ESTADOS_INDICADOR = ["ok", "dispara", "sin_datos"];

/** Días hacia atrás en que un «no aguantó corto» cuenta como reciente. */
export const VENTANA_CORTO_DIAS = 28;

/**
 * Los indicadores del flujo. El umbral es el máximo que se tolera: hoy 0 en todos,
 * porque cada uno es un paso que el flujo declara obligatorio (los fondos
 * anteriores a la ficha, `FICHA_DESDE`, no cuentan: solo avisaban).
 */
export const INDICADORES = {
  fondos_sin_diagnostico: { umbral: 0, que: "fondos abiertos con encargos o en estado de diagnosticado en adelante, sin «mecanismo» y «causa_escape»" },
  encargos_sin_juez: { umbral: 0, que: "encargos abiertos de un fondo en plan o después, sin bloque «encargo», sin «juez» o con el mismo juez que constructor" },
  cerrados_sin_aprendizaje: { umbral: 0, que: "fondos cerrados como arreglados sin «aprendizaje» válido" },
  reabiertos_clase_mal_definida: { umbral: 0, que: `casos «no-aguanto-corto» (el arreglo tapó los casos y no la clase) creados en los últimos ${VENTANA_CORTO_DIAS} días` },
  ciclos_sobre_presupuesto: { umbral: 0, que: "fondos abiertos cuyas rondas de constructor y juez pasan el tope de ops/presupuestos.json" },
};
export const IDS_INDICADOR = Object.keys(INDICADORES);

const nombresDe = (labels) => (labels ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const tipoDe = (labels) => [...porGrupo(nombresDe(labels)).tipo][0] ?? null;

/** Una página de issues de la API GraphQL con la forma que usa este fichero (con el cuerpo de los hijos). */
export const CONSULTA_FLUJO = `query($cursor: String) {
  repository(owner: "pabloam89", name: "MenuPlan") {
    issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number state stateReason createdAt closedAt body authorAssociation
        labels(first: 20) { nodes { name } }
        subIssues(first: 50) {
          pageInfo { hasNextPage }
          nodes { number state stateReason createdAt body authorAssociation labels(first: 20) { nodes { name } } }
        }
      }
    }
  }
}`;

/** Un nodo de CONSULTA_FLUJO con la forma de `fondoDeRest`/`validarFicha`. */
export function desdeGraphql(n) {
  const ref = (x) => ({
    number: x.number,
    state: String(x.state).toUpperCase(),
    stateReason: x.stateReason ? String(x.stateReason).toUpperCase() : null,
    createdAt: x.createdAt ?? null,
    body: String(x.body ?? ""),
    asociacion: x.authorAssociation ?? null,
    labels: (x.labels?.nodes ?? []).map((l) => ({ name: l.name })),
    tipo: tipoDe(x.labels?.nodes),
  });
  // Más de 50 hijos: los que no caben no se ven; se avisa en la línea de los indicadores (nota) en vez de callarlo.
  return { ...ref(n), closedAt: n.closedAt ?? null, truncado: Boolean(n.subIssues?.pageInfo?.hasNextPage), hijos: (n.subIssues?.nodes ?? []).map(ref) };
}

const abierto = (i) => i.state === "OPEN";
const sinArreglo = (i) => ["NOT_PLANNED", "DUPLICATE"].includes(i.stateReason ?? "");

/** Solo los fondos de la casa (si no se sabe quién lo abrió, cuenta, como en el informe de fichas). */
const fondosDe = (issues) => issues.filter((i) => tipoDe(i.labels) === "fondo" && (!i.asociacion || esDeLaCasa(i.asociacion)));
const encargosDe = (f) => (f.hijos ?? []).filter((h) => h.tipo === "encargo" && (!h.asociacion || esDeLaCasa(h.asociacion)));

/** Los números de issue que dispara cada indicador (la lista, no el recuento). */
export function hallazgos(issues, { hoy = new Date() } = {}) {
  const r = Object.fromEntries(IDS_INDICADOR.map((id) => [id, []]));
  const desde = hoy.getTime() - VENTANA_CORTO_DIAS * 86_400_000;
  for (const f of fondosDe(issues)) {
    const { ficha, presente } = leerFicha(f.body);
    const obligatoria = fichaObligatoria(f);
    const encargos = encargosDe(f);

    if (abierto(f) && obligatoria) {
      const sinDiag = !presente ? encargos.length > 0 : (!ficha.mecanismo || !ficha.causa_escape);
      if (sinDiag && (encargos.length || ESTADOS_CON_DIAGNOSTICO.includes(ficha.estado))) r.fondos_sin_diagnostico.push(f.number);
    }

    if (abierto(f) && obligatoria && presente && ESTADOS_CON_PLAN.includes(ficha.estado)) {
      for (const e of encargos.filter(abierto)) {
        const l = leerEncargo(e.body);
        const c = l.ficha ?? {};
        if (!l.presente || !c.juez || c.juez === c["constructor"]) r.encargos_sin_juez.push(e.number);
      }
    }

    if (!abierto(f) && !sinArreglo(f) && obligatoria && !(presente && aprendizajeValido(ficha.aprendizaje))) r.cerrados_sin_aprendizaje.push(f.number);

    for (const h of (f.hijos ?? []).filter((x) => x.tipo === "caso")) {
      const corto = nombresDe(h.labels).includes("analisis:no-aguanto-corto");
      if (corto && h.createdAt && Date.parse(h.createdAt) >= desde) r.reabiertos_clase_mal_definida.push(f.number);
    }

    if (abierto(f) && presente && ficha.rondas !== undefined) {
      const causa = ficha.tipo_causa ?? [...porGrupo(nombresDe(f.labels)).causa][0];
      const tope = presupuestoDe(ficha.alcance, causa, CATALOGO)?.rondas_max ?? TOPE_RONDAS;
      if (ficha.rondas > tope) r.ciclos_sobre_presupuesto.push(f.number);
    }
  }
  for (const id of IDS_INDICADOR) r[id] = [...new Set(r[id])].sort((a, b) => a - b);
  return r;
}

/**
 * Los indicadores medidos. `issues` null = la API no respondió: todos `sin_datos`
 * (nunca un «ok» inventado). → [{ indicador, valor, umbral, estado, en }]
 */
export function medirIndicadores(issues, opciones = {}) {
  if (!Array.isArray(issues)) {
    return IDS_INDICADOR.map((indicador) => ({ indicador, valor: null, umbral: INDICADORES[indicador].umbral, estado: "sin_datos", en: [], truncados: [] }));
  }
  const h = hallazgos(issues, opciones);
  const truncados = fondosDe(issues).filter((f) => f.truncado).map((f) => f.number);
  return IDS_INDICADOR.map((indicador) => {
    const valor = h[indicador].length;
    const umbral = INDICADORES[indicador].umbral;
    return { indicador, valor, umbral, estado: valor > umbral ? "dispara" : "ok", en: h[indicador], truncados };
  });
}

/** La línea contable de un indicador. */
export function lineaDeIndicador(m) {
  const en = m.estado === "dispara" && m.en.length ? ` en: ${m.en.slice(0, 10).map((n) => `#${n}`).join(",")}${m.en.length > 10 ? ",…" : ""}` : "";
  const nota = m.truncados?.length ? ` nota: hijos_truncados_en:${m.truncados.map((n) => `#${n}`).join(",")}` : "";
  return `indicador: ${m.indicador} valor: ${m.valor ?? "-"} umbral: ${m.umbral} estado: ${m.estado}${en}${nota}`;
}

// ── Contrapesos: las cifras que vigilan a los indicadores (#480) ──────────────

/**
 * Una cifra que se persigue deja de medir (Goodhart): cada indicador va con otra que
 * subiría si se hiciera trampa con él (su `vigilante` en ops/metricas.json). Estas dos
 * no tienen umbral: no disparan, se leen junto al indicador que vigilan.
 */
export const CONTRAPESOS = {
  fondos_abiertos: { que: "fondos de la casa abiertos (si se dejan sin cerrar para no contar como cerrados sin aprendizaje, sube)" },
  casos_puntuales_recientes: { que: `casos «puntual» creados en los últimos ${VENTANA_CORTO_DIAS} días (si un «no aguantó» se apunta como puntual, sube)` },
};

/** Los contrapesos medidos; `issues` null = la API no respondió (valor null, nunca un cero inventado). → [{ contrapeso, valor }] */
export function medirContrapesos(issues, { hoy = new Date() } = {}) {
  if (!Array.isArray(issues)) return Object.keys(CONTRAPESOS).map((contrapeso) => ({ contrapeso, valor: null }));
  const desde = hoy.getTime() - VENTANA_CORTO_DIAS * 86_400_000;
  const deLaCasa = (i) => !i.asociacion || esDeLaCasa(i.asociacion);
  const puntual = (i) => deLaCasa(i) && tipoDe(i.labels) === "caso" && nombresDe(i.labels).includes("analisis:puntual") && i.createdAt && Date.parse(i.createdAt) >= desde;
  return [
    { contrapeso: "fondos_abiertos", valor: fondosDe(issues).filter(abierto).length },
    { contrapeso: "casos_puntuales_recientes", valor: issues.filter(puntual).length },
  ];
}

/** La línea contable de un contrapeso. */
export function lineaDeContrapeso(c) {
  return `contrapeso: ${c.contrapeso} valor: ${c.valor ?? "-"}`;
}

/**
 * La serie de antes de cada cifra, leída de informes anteriores (los comentarios del
 * issue «Flujo: informe semanal», del más antiguo al más reciente). Cada línea
 * `indicador: x valor: n` o `contrapeso: x valor: n` es un punto; un «-» (sin datos) no cuenta.
 * → { id: [n, …] }
 */
export function seriesDeHistorial(texto) {
  const series = {};
  for (const m of String(texto ?? "").matchAll(/^[ \t]*(?:indicador|contrapeso): ([a-z][a-z0-9_]*) valor: (\d+(?:\.\d+)?)(?=\s|$)/gm)) {
    (series[m[1]] ??= []).push(Number(m[2]));
  }
  return series;
}

// ── Poda: piezas sin uso (solo con el registro local de la fábrica, #340) ─────

/** Días de registro que se piden antes de proponer aparcar nada: el plazo de «Nadie la abre» de la skill forja-de-skills. */
export const DIAS_PARA_PODAR = 90;
export const DIAS_SEMANA = 7;

/**
 * Skills sin abrirse, a partir de las líneas `skill_cargada` del registro local.
 *   sin_uso_semana     las que no se abrieron en los últimos 7 días (informativo: una semana sin uso no es nada)
 *   candidatas_a_podar las que no se abrieron en DIAS_PARA_PODAR días, y solo si el registro cubre ese plazo
 * Con menos registro del necesario, `candidatas` queda `null` (sin datos): no se propone aparcar con una semana de historia.
 * `lineas`: objetos { ts, evento, nombre } ya leídos; `skills`: las que existen; `sinUsoSemana`: la cifra de
 * `npm run skills-uso` (transcripts, la que mide el plano 2) si se tiene: es la que manda para la semana, el registro
 * solo cubre las aperturas desde que existe. Los transcripts duran 30 días, por eso la poda de 90 sale del registro.
 */
export function usoDeSkills(lineas, skills, ahora = new Date(), sinUsoSemana = null) {
  const cargadas = lineas.filter((l) => l?.evento === "skill_cargada" && typeof l.nombre === "string" && Number.isFinite(Date.parse(l.ts)));
  const tiempos = lineas.filter((l) => Number.isFinite(Date.parse(l?.ts))).map((l) => Date.parse(l.ts));
  const dias = tiempos.length ? (ahora.getTime() - Math.min(...tiempos)) / 86_400_000 : 0;
  const ultima = new Map();
  for (const l of cargadas) ultima.set(l.nombre, Math.max(ultima.get(l.nombre) ?? 0, Date.parse(l.ts)));
  const sinUsoEn = (d) => skills.filter((s) => !ultima.has(s) || ultima.get(s) < ahora.getTime() - d * 86_400_000);
  return {
    dias_de_registro: Math.floor(dias),
    sin_uso_semana: sinUsoSemana ?? sinUsoEn(DIAS_SEMANA),
    candidatas: dias >= DIAS_PARA_PODAR ? sinUsoEn(DIAS_PARA_PODAR) : null,
  };
}

export function lineasDeUso(u) {
  const l = [`poda skills_sin_uso_semana: ${u.sin_uso_semana.length} registro_dias: ${u.dias_de_registro}`];
  l.push(u.candidatas === null
    ? `poda candidatas: sin_datos motivo: el registro cubre ${u.dias_de_registro} de ${DIAS_PARA_PODAR} días`
    : `poda candidatas: ${u.candidatas.length}${u.candidatas.length ? ` skills: ${u.candidatas.join(",")}` : ""}`);
  return l;
}
