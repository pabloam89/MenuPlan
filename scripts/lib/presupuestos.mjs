/**
 * presupuestos.mjs — el catálogo de presupuestos del triaje (#339, fase D del
 * plan #334). Lógica pura sobre `ops/presupuestos.json`, que es el dato y la
 * única fuente: aquí solo viven el vocabulario, los rangos y las funciones.
 *
 * Los usan:
 *   scripts/presupuesto.mjs     `npm run presupuesto -- <alcance> <causa>` (lo lee /orquestar)
 *   scripts/lib/fondos.mjs      la regla `rondas-excedidas` de la ficha del fondo
 *   scripts/lib/flujo.mjs       la tabla de docs/ops/FLUJO.md (la recibe por argumento)
 *
 * Se resuelve por celda (alcance × tipo de causa): el valor del alcance, y si
 * la causa sobrescribe alguno en `por_causa`, el de la causa. Los alcances son
 * los de ALCANCES_FALLO (flujo.mjs) y las causas, las de `causa:` de issues.mjs:
 * no se copian, y el test comprueba que toda celda sale con un presupuesto.
 *
 * La fase F (#340) compara los números con lo medido (scripts/lib/fabrica.mjs,
 * `npm run fabrica -- --recalibrar`); este fichero no sabe de eso más que el
 * hueco `recalibracion` y la fecha `calibrado_el` del JSON.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ALCANCES_FALLO, DIAGNOSTICAN } from "./flujo.mjs";
import { GRUPOS } from "./issues.mjs";

/** Las causas de `causa:` (issues.mjs), sin copiarlas. */
export const CAUSAS = Object.keys(GRUPOS.causa.valores);
export const ALCANCES = Object.keys(ALCANCES_FALLO);

/** Tope duro de rondas de constructor y juez: a la siguiente decide una persona. Ninguna celda puede pasarlo. */
export const TOPE_RONDAS = 2;

/**
 * Los jueces que se pueden exigir: los agentes con «Tipo: juez» de
 * .claude/agents/. Un test lo cruza con la carpeta, así que un juez nuevo
 * obliga a añadirlo aquí.
 */
export const JUECES = ["auditor-datos", "evaluador", "qa", "revisor", "seguridad"];

/** Rangos admitidos de cada cifra: [mínimo, máximo], enteros. */
export const RANGOS = {
  hipotesis_en_paralelo_max: [1, 3],
  jueces_min: [1, 3],
  rondas_max: [1, TOPE_RONDAS],
  minutos_orientativos: [5, 240],
};

/** Lo que puede fijar un alcance (todo) y lo que puede sobrescribir una causa. */
export const CAMPOS_ALCANCE = ["diagnostica", "es_no_es", ...Object.keys(RANGOS)];
export const CAMPOS_CAUSA = [...Object.keys(RANGOS), "jueces_obligatorios", "reproducir_en_ci"];

const RUTA = new URL("../../ops/presupuestos.json", import.meta.url);
/** El catálogo tal como está en ops/presupuestos.json. */
export const CATALOGO = JSON.parse(readFileSync(fileURLToPath(RUTA), "utf8"));

/** Todas las celdas alcance × causa, en orden estable. */
export function celdas() {
  return ALCANCES.flatMap((alcance) => CAUSAS.map((causa) => ({ alcance, causa })));
}

/**
 * El presupuesto de una celda, o null si el alcance o la causa no existen.
 * → { alcance, causa, diagnostica, es_no_es, hipotesis_en_paralelo_max,
 *     jueces_min, jueces_obligatorios, reproducir_en_ci, rondas_max,
 *     minutos_orientativos, de_la_causa: [campos que la causa sobrescribe] }
 * `jueces_min` nunca baja del número de jueces obligatorios.
 */
export function presupuestoDe(alcance, causa, catalogo = CATALOGO) {
  if (!Object.hasOwn(catalogo.por_alcance ?? {}, alcance) || !CAUSAS.includes(causa)) return null;
  const base = catalogo.por_alcance[alcance];
  const sobre = Object.hasOwn(catalogo.por_causa ?? {}, causa) ? catalogo.por_causa[causa] : {};
  const p = { alcance, causa, ...base, jueces_obligatorios: [], reproducir_en_ci: false, ...sobre };
  p.de_la_causa = Object.keys(sobre);
  p.jueces_min = Math.max(p.jueces_min, p.jueces_obligatorios.length);
  return p;
}

/** Lo que está mal en un catálogo (lista vacía si está bien). Cada línea empieza por el nombre de su regla. */
export function problemas(catalogo) {
  const p = [];
  const entero = (v) => Number.isInteger(v);
  const alcances = Object.keys(catalogo?.por_alcance ?? {});

  if (JSON.stringify(alcances) !== JSON.stringify(ALCANCES)) p.push(`alcance: el catálogo tiene que cubrir ${ALCANCES.join(", ")} (en ese orden) y cubre ${alcances.join(", ")}`);
  for (const [a, b] of Object.entries(catalogo?.por_alcance ?? {})) {
    for (const c of Object.keys(b)) if (!CAMPOS_ALCANCE.includes(c)) p.push(`campo: ${a} tiene un campo desconocido «${c}»`);
    if (!(b.diagnostica in DIAGNOSTICAN)) p.push(`diagnostica: ${a} diagnostica «${b.diagnostica}», fuera de ${Object.keys(DIAGNOSTICAN).join(", ")}`);
    if (typeof b.es_no_es !== "boolean") p.push(`campo: ${a} «es_no_es» tiene que ser verdadero o falso`);
    for (const [c, [min, max]] of Object.entries(RANGOS)) {
      if (!entero(b[c]) || b[c] < min || b[c] > max) p.push(`rango: ${a} «${c}» tiene que ser un entero entre ${min} y ${max}`);
    }
    if (entero(b.hipotesis_en_paralelo_max) && b.hipotesis_en_paralelo_max > 1 && b.diagnostica !== "orquestador_con_diagnosticadores") {
      p.push(`diagnostica: ${a} permite varias hipótesis en paralelo y las diagnostica «${b.diagnostica}»: varias a la vez las lanza el orquestador`);
    }
  }
  // Un alcance mayor nunca recibe menos que uno menor: si no, subir el alcance abarataría el trabajo.
  for (let i = 1; i < alcances.length; i++) {
    const menor = catalogo.por_alcance[alcances[i - 1]];
    const mayor = catalogo.por_alcance[alcances[i]];
    for (const c of ["hipotesis_en_paralelo_max", "jueces_min", "minutos_orientativos"]) {
      if (entero(menor[c]) && entero(mayor[c]) && mayor[c] < menor[c]) p.push(`monotonia: ${alcances[i]} «${c}» (${mayor[c]}) es menor que el de ${alcances[i - 1]} (${menor[c]})`);
    }
  }

  for (const [causa, s] of Object.entries(catalogo?.por_causa ?? {})) {
    if (!CAUSAS.includes(causa)) p.push(`causa: «${causa}» no es una causa de issues.mjs (${CAUSAS.join(", ")})`);
    for (const c of Object.keys(s)) if (!CAMPOS_CAUSA.includes(c)) p.push(`campo: la causa ${causa} sobrescribe «${c}», que no puede sobrescribir (${CAMPOS_CAUSA.join(", ")})`);
    for (const [c, [min, max]] of Object.entries(RANGOS)) {
      if (c in s && (!entero(s[c]) || s[c] < min || s[c] > max)) p.push(`rango: la causa ${causa} «${c}» tiene que ser un entero entre ${min} y ${max}`);
    }
    if ("reproducir_en_ci" in s && typeof s.reproducir_en_ci !== "boolean") p.push(`campo: la causa ${causa} «reproducir_en_ci» tiene que ser verdadero o falso`);
    if ("jueces_obligatorios" in s) {
      const js = s.jueces_obligatorios;
      if (!Array.isArray(js) || !js.length) p.push(`juez: la causa ${causa} «jueces_obligatorios» es una lista de jueces`);
      else {
        for (const j of js) if (!JUECES.includes(j)) p.push(`juez: la causa ${causa} exige «${j}», que no es un juez (${JUECES.join(", ")})`);
        if (new Set(js).size !== js.length) p.push(`juez: la causa ${causa} repite un juez`);
      }
    }
  }

  // Todas las celdas se resuelven y ninguna pasa del tope ni se queda sin jueces suficientes.
  // Y por CELDA ya resuelta: lo que una causa sobrescriba tampoco puede abaratar un alcance mayor.
  if (JSON.stringify(alcances) === JSON.stringify(ALCANCES)) {
    for (const causa of CAUSAS) {
      for (let i = 1; i < ALCANCES.length; i++) {
        const menor = presupuestoDe(ALCANCES[i - 1], causa, catalogo);
        const mayor = presupuestoDe(ALCANCES[i], causa, catalogo);
        for (const c of ["hipotesis_en_paralelo_max", "jueces_min", "minutos_orientativos"]) {
          if (entero(menor?.[c]) && entero(mayor?.[c]) && mayor[c] < menor[c]) p.push(`monotonia-celda: ${ALCANCES[i]} × ${causa} «${c}» (${mayor[c]}) es menor que en ${ALCANCES[i - 1]} (${menor[c]})`);
        }
      }
    }
  }

  for (const { alcance, causa } of celdas()) {
    const r = presupuestoDe(alcance, causa, catalogo);
    if (!r) p.push(`celda: ${alcance} × ${causa} no sale con presupuesto`);
    else if (r.jueces_min > RANGOS.jueces_min[1]) p.push(`celda: ${alcance} × ${causa} pide ${r.jueces_min} jueces y el máximo admitido es ${RANGOS.jueces_min[1]}`);
  }

  // La recalibración (fase F): el hueco y la fecha, coherentes.
  if (typeof catalogo?.valores_iniciales !== "boolean") p.push("calibracion: «valores_iniciales» tiene que ser verdadero o falso");
  else if (catalogo.valores_iniciales && catalogo.calibrado_el !== null) p.push("calibracion: con valores iniciales no hay fecha de calibrado (calibrado_el: null)");
  else if (!catalogo.valores_iniciales && !/^\d{4}-\d{2}-\d{2}$/.test(String(catalogo.calibrado_el))) p.push("calibracion: calibrado, y falta «calibrado_el» (AAAA-MM-DD)");
  if (!(typeof catalogo?.recalibracion?.como === "string" && catalogo.recalibracion.como.length > 40) || !/^#\d+$/.test(String(catalogo?.recalibracion?.fase))) {
    p.push("calibracion: falta el hueco «recalibracion» con la fase que recalibra y cómo");
  }
  return p;
}

/** El pipeline sugerido de una celda, en frases cortas (lo que imprime `npm run presupuesto`). */
export function pipelineSugerido(p) {
  const pasos = [];
  const quien = DIAGNOSTICAN[p.diagnostica];
  pasos.push(`Diagnóstico: ${quien}.`);
  if (p.hipotesis_en_paralelo_max > 1) pasos.push(`Hasta ${p.hipotesis_en_paralelo_max} hipótesis en paralelo, cada una con una lente distinta, y una síntesis del orquestador.`);
  else pasos.push("Una sola pasada: sin hipótesis en paralelo.");
  if (p.es_no_es) pasos.push("Con ES / NO ES: qué falla y qué no, dónde pasa y dónde no.");
  if (p.reproducir_en_ci) pasos.push("Reproducirlo en el CI antes de arreglar (el fallo depende del entorno).");
  pasos.push("Construye el agente del dominio (rama con número de issue).");
  const libres = p.jueces_min - p.jueces_obligatorios.length;
  const juez = [];
  if (p.jueces_obligatorios.length) juez.push(`obligatorios: ${p.jueces_obligatorios.join(", ")}`);
  if (libres > 0) juez.push(`${libres} más a elegir del catálogo de /orquestar`);
  pasos.push(`Jueces, al menos ${p.jueces_min} distintos de quien construye (${juez.join("; ")}).`);
  pasos.push(`Rondas de construir, juzgar y reparar: como mucho ${p.rondas_max}. Si el juez sigue bloqueando después, no hay otra vuelta: issue tipo decisión asignado a Pablo. El conteo va en «rondas» de la ficha del fondo.`);
  pasos.push(`Tiempo orientativo: ${p.minutos_orientativos} min.`);
  return pasos;
}

/** El texto completo de una celda para consola. */
export function textoDe(p, catalogo = CATALOGO) {
  const origen = catalogo.valores_iniciales ? "valores iniciales de F0 (a ojo)" : `calibrado el ${catalogo.calibrado_el}`;
  return [
    `presupuesto: alcance=${p.alcance} causa=${p.causa} diagnostica=${p.diagnostica} hipotesis_max=${p.hipotesis_en_paralelo_max} jueces_min=${p.jueces_min} rondas_max=${p.rondas_max} minutos=${p.minutos_orientativos}`,
    `jueces_obligatorios: ${p.jueces_obligatorios.join(", ") || "ninguno"}`,
    `reproducir_en_ci: ${p.reproducir_en_ci ? "si" : "no"}`,
    `sobrescribe_la_causa: ${p.de_la_causa.join(", ") || "nada"}`,
    `origen: ${origen}`,
    "",
    "Pipeline sugerido:",
    ...pipelineSugerido(p).map((l, i) => `  ${i + 1}. ${l}`),
  ].join("\n");
}

/** La tabla de docs/ops/FLUJO.md: alcance × valores y las causas que sobrescriben. */
export function generarTabla(catalogo = CATALOGO) {
  const out = [
    catalogo.valores_iniciales
      ? "Valores iniciales de F0, a ojo y marcados como tales. `npm run fabrica -- --recalibrar` (fase F) los compara con lo medido y propone cambios; una persona los aplica en /revision-issues (hueco `recalibracion` y fecha `calibrado_el` de `ops/presupuestos.json`)."
      : `Calibrados el ${catalogo.calibrado_el}. \`npm run fabrica -- --recalibrar\` (fase F) los compara con lo medido y propone cambios.`,
    "",
    "| Alcance | Diagnostica | ES / NO ES | Hipótesis en paralelo (máx.) | Jueces (mín.) | Rondas (máx.) | Minutos orientativos |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const [a, b] of Object.entries(catalogo.por_alcance)) {
    out.push(`| **${a}** | ${b.diagnostica} | ${b.es_no_es ? "sí" : "no"} | ${b.hipotesis_en_paralelo_max} | ${b.jueces_min} | ${b.rondas_max} | ${b.minutos_orientativos} |`);
  }
  out.push("", "Una causa puede sobrescribir al alcance (`por_causa`):", "", "| Causa | Sobrescribe |", "|---|---|");
  for (const [c, s] of Object.entries(catalogo.por_causa)) {
    out.push(`| **${c}** | ${Object.entries(s).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")} |`);
  }
  return out.join("\n");
}
