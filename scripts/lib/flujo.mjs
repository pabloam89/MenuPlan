/**
 * El flujo de una incidencia (#335, fase F0 del plan #334): vocabularios
 * cerrados y generador de la vista.
 *
 * `ops/flujo.json` dice, paso a paso, qué obligaciones tiene el camino de un
 * fallo (de detectarlo a aprender de él) y qué las hace cumplir. La tabla de
 * `docs/ops/FLUJO.md` sale de ese JSON y no se edita a mano; `ops/flujo.test.js`
 * ata el JSON a lo que hay de verdad en el repo.
 *
 * Una obligación es una norma del proceso. Su vocabulario de ejecutor y de
 * veredicto es el del registro de normas (#296, `ops/normas.json`) y se IMPORTA
 * de `scripts/lib/normas.mjs`, no se copia: copiarlo era un `dos-fuentes` en
 * pequeño. Una obligación puede enlazar con su norma (`norma`); entonces su
 * ejecutor y su dureza tienen que ser los del registro.
 *
 * El repo es público (#300): este fichero dice QUÉ se exige y QUÉ lo hace
 * cumplir, y qué fase lo endurece. Nunca cómo se salta un control.
 */

import { basename } from "node:path";

import { EJECUTORES, EJECUTORES_DEL_SISTEMA, VEREDICTOS } from "./normas.mjs";

export { EJECUTORES, EJECUTORES_DEL_SISTEMA, VEREDICTOS };

/** Qué tan grande es un fallo: decide cuánto esfuerzo se le dedica (paso «triaje»). No es el `ALCANCES` del registro de normas (a quién alcanza un ejecutor). */
export const ALCANCES_FALLO = {
  local: "Un fichero o un caso suelto, sin patrón",
  modulo: "Dentro de un módulo de ops/MODULOS.json",
  transversal: "La misma causa en módulos de ámbitos distintos, tres casos parecidos, o la segunda vez que «no aguantó»",
};

/** Quién diagnostica según el alcance. */
export const DIAGNOSTICAN = {
  agente_dominio: "El agente del dominio, con la skill de causa raíz, en una pasada",
  orquestador_con_diagnosticadores: "El orquestador lanza varios diagnosticadores en paralelo, cada uno con su lente, y sintetiza",
};

/** Quién interviene en un paso. */
export const ACTORES = {
  agente_dominio: "El constructor del dominio (datos, lola, diseno, gobierno)",
  orquestador: "La sesión principal con /orquestar",
  juez: "Un agente juez (revisor, qa, evaluador, seguridad, auditor-datos)",
  persona: "Pablo o Álvaro",
  automatico: "Un script, un hook o un workflow, sin nadie delante",
};

/** Estado de un indicador de medida. */
export const ESTADOS_MEDIDA = {
  existe: "Hoy se puede sacar; `donde` dice de dónde",
  pendiente: "Hoy no se mide; `fase` dice qué fase lo trae",
};

/** Estado de un tipo de skill. */
export const ESTADOS_TIPO_SKILL = {
  existe: "Hay skills de este tipo en .claude/skills/",
  en_plan: "Tiene fase y encargo; aún no hay skill",
  reservado: "Declarado en la plantilla; no se crea ninguna hasta que se cumpla la regla de parada",
};

/** Orden fijo de los pasos: es el invariante de #334, y el test lo exige. */
export const PASOS = [
  "detectar", "registrar_caso", "triaje", "diagnosticar", "fondo", "plan",
  "ejecutar", "verificar", "observar", "cerrar", "aprender", "medir",
];

export const CAMPOS_OBLIGACION = ["id", "texto", "ejecutor", "dureza", "ref", "contiene", "test", "fase", "norma"];
export const CAMPOS_OPCIONALES = ["nota", "aceptada"];

/** Orden de dureza, de más a menos. `rota` es la peor. */
const ORDEN_DUREZA = ["dura", "semidura", "blanda", "rota"];

/** La dureza de un paso es la de su obligación más débil: una cadena vale lo que su eslabón más flojo. */
export function durezaDelPaso(paso) {
  const duras = (paso.obligaciones ?? []).map((o) => ORDEN_DUREZA.indexOf(o.dureza));
  return duras.length ? ORDEN_DUREZA[Math.max(...duras)] : "blanda";
}

/** Cuenta de obligaciones por dureza, en el orden fijo. */
export function cuentaPorDureza(datos) {
  const cuenta = Object.fromEntries(ORDEN_DUREZA.map((d) => [d, 0]));
  for (const p of datos.pasos) for (const o of p.obligaciones) cuenta[o.dureza]++;
  return cuenta;
}

const celda = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const fases = (f) => (f?.length ? f.join(", ") : "—");

/** La tabla de pasos y obligaciones que se pega en FLUJO.md. */
export function generarTablaPasos(datos) {
  const filas = [
    "| Paso | Obligación | Lo hace cumplir | Hoy | Norma | Fase que la endurece |",
    "|---|---|---|---|---|---|",
  ];
  for (const p of datos.pasos) {
    filas.push(`| **${celda(p.nombre)}** · ${durezaDelPaso(p)} | | | | | |`);
    for (const o of p.obligaciones) {
      const donde = o.ref ? `\`${celda(o.ref)}\`` : "no escrita aún";
      filas.push(`| ${o.id} | ${celda(o.texto)} | ${o.ejecutor} · ${donde} | ${o.dureza} | ${o.norma ? `\`${o.norma}\`` : "—"} | ${fases(o.fase)} |`);
    }
  }
  const c = cuentaPorDureza(datos);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const enlazadas = datos.pasos.flatMap((p) => p.obligaciones).filter((o) => o.norma).length;
  filas.push("", `**${total} obligaciones:** ${c.dura} duras · ${c.semidura} semiduras · ${c.blanda} blandas · ${c.rota} rotas. ${enlazadas} están enlazadas con su norma del registro.`);
  return filas.join("\n");
}

/** Pasos con su entrada, salida, quién, skill e indicador: la ficha de cada paso. */
export function generarFichas(datos) {
  const filas = [
    "| # | Paso | Entra | Sale | Quién | Skill | Se mide |",
    "|---|---|---|---|---|---|---|",
  ];
  datos.pasos.forEach((p, i) => {
    const skill = p.skill ? `\`${p.skill}\`` : p.skill_fase ? `(${fases(p.skill_fase)})` : "—";
    const mide = p.mide.map((m) => (m.estado === "existe" ? `✓ ${m.indicador}` : `○ ${m.indicador} (${m.fase})`)).join("; ");
    filas.push(`| ${i + 1} | ${celda(p.nombre)} | ${celda(p.entra)} | ${celda(p.sale)} | ${p.quien.join(", ")} | ${skill} | ${celda(mide)} |`);
  });
  return filas.join("\n");
}

/** Capas, escalera, tipos de skill y presupuestos, en tablas pequeñas. */
export function generarCatalogos(datos) {
  const out = [];
  out.push("### Las cuatro capas", "", "| Capa | Pregunta | Qué contiene | Dónde |", "|---|---|---|---|");
  for (const c of datos.capas) out.push(`| **${c.nombre}** | ${celda(c.pregunta)} | ${celda(c.contiene)} | ${c.donde.map((d) => `\`${d}\``).join(", ")} |`);
  out.push("", "### La escalera de durabilidad", "", "De más a menos duradero. Un fondo grave o repetido se cierra con un escalón 1 o 2; los demás, con el más alto posible y su porqué.", "",
    "| Escalón | Qué es | Etiqueta `arreglo:` |", "|---|---|---|");
  datos.escalera.forEach((e, i) => out.push(`| ${i + 1} · ${e.id} | ${celda(e.que)} | ${e.arreglo.map((a) => `\`${a}\``).join(", ")} |`));
  out.push("", "### Tipos de skill", "", "| Tipo | Qué guarda | Estado | Fase |", "|---|---|---|---|");
  for (const t of datos.tipos_skill) out.push(`| **${t.id}** | ${celda(t.que)} | ${t.estado} | ${fases(t.fase)} |`);
  out.push("", "### Presupuesto inicial por alcance", "", `${datos.presupuestos.nota}`, "",
    "| Alcance | Diagnostica | Hipótesis en paralelo (máx.) | Jueces (mín.) | Rondas (máx.) | Minutos orientativos |", "|---|---|---|---|---|---|");
  for (const [a, p] of Object.entries(datos.presupuestos.por_alcance)) {
    out.push(`| **${a}** | ${p.diagnostica} | ${p.hipotesis_en_paralelo_max} | ${p.jueces_min} | ${p.rondas_max} | ${p.minutos_orientativos} |`);
  }
  return out.join("\n");
}

const REF_ISSUE = /^#(\d+)$/;
const ES_TEST = /\.test\.(js|mjs|jsx)$/;

/**
 * Lo que está mal en `datos` (ops/flujo.json). Lista vacía si está bien. Cada
 * problema empieza por el nombre de su regla («dura-sin-sistema: …»), que es lo
 * que mira el autotest de ops/flujo.test.js.
 *
 *   existe(ruta)      ¿está ese fichero o carpeta en el repo?
 *   leer(ruta)        el texto de un fichero, o null si no está
 *   existeTest(test)  ¿existe ese test? (una ruta, o «planos:regla:rama»)
 *   skills            nombres de las carpetas de .claude/skills/
 *   arreglos          valores de la etiqueta `arreglo:` (scripts/lib/issues.mjs)
 *   normas            { id: norma } del registro (ops/normas.json)
 *
 * Una referencia que existe no basta (fondo #231: copiar como cierto lo que no
 * se ha comprobado): `contiene` es una frase que el fichero del `ref` tiene que
 * llevar de verdad, y una obligación `dura` necesita un `*.test.js` que nombre
 * ese fichero. Sigue siendo un indicio, no una prueba: que un test nombre un
 * fichero no garantiza que lo vigile.
 */
export function problemas(datos, { existe, leer = () => null, existeTest = existe, skills = [], arreglos = [], normas = {} }) {
  const p = [];
  const issues = datos.issues_citables ?? {};
  const conocida = (f) => typeof f === "string" && REF_ISSUE.test(f) && f.slice(1) in issues;
  const fasesMalas = (lista) => (Array.isArray(lista) ? lista : [null]).filter((f) => !conocida(f));

  if (JSON.stringify(datos.pasos.map((x) => x.id)) !== JSON.stringify(PASOS)) {
    p.push(`paso-orden: los pasos tienen que ser, en este orden, ${PASOS.join(", ")}`);
  }

  const ids = new Set();
  datos.pasos.forEach((paso, i) => {
    const n = String(i + 1).padStart(2, "0");
    for (const c of ["entra", "sale"]) if (!(typeof paso[c] === "string" && paso[c].length > 10)) p.push(`paso-campos: ${paso.id} sin «${c}»`);
    if (!Array.isArray(paso.quien) || !paso.quien.length || paso.quien.some((a) => !(a in ACTORES))) p.push(`actor: ${paso.id} tiene un actor fuera de ${Object.keys(ACTORES).join(", ")}`);
    if (paso.skill != null && !skills.includes(paso.skill)) p.push(`skill-no-existe: ${paso.id} cita la skill «${paso.skill}»`);
    if (fasesMalas(paso.skill_fase).length) p.push(`fase-desconocida: ${paso.id} skill_fase ${fasesMalas(paso.skill_fase).join(", ")}`);

    if (!Array.isArray(paso.mide) || !paso.mide.length) p.push(`medida: ${paso.id} no dice qué se mide`);
    for (const m of paso.mide ?? []) {
      if (!(m.estado in ESTADOS_MEDIDA)) p.push(`medida: ${paso.id} «${m.indicador}» tiene un estado fuera de ${Object.keys(ESTADOS_MEDIDA).join(", ")}`);
      else if (m.estado === "existe" && !existe(m.donde)) p.push(`medida: ${paso.id} «${m.indicador}» dice que existe en ${m.donde}, que no está`);
      else if (m.estado === "pendiente" && !conocida(m.fase)) p.push(`fase-desconocida: ${paso.id} «${m.indicador}» → ${m.fase}`);
    }

    if (!Array.isArray(paso.obligaciones) || !paso.obligaciones.length) p.push(`obligacion-campos: ${paso.id} no tiene obligaciones`);
    for (const o of paso.obligaciones ?? []) {
      const id = o.id ?? "(sin id)";
      if (!new RegExp(`^P${n}\\.\\d+$`).test(id)) p.push(`obligacion-id: ${id} no es P${n}.<n> (paso ${paso.id})`);
      if (ids.has(id)) p.push(`obligacion-id: ${id} está repetido`);
      ids.add(id);
      for (const c of CAMPOS_OBLIGACION) if (!(c in o)) p.push(`obligacion-campos: ${id} sin «${c}»`);
      for (const c of Object.keys(o)) if (!CAMPOS_OBLIGACION.includes(c) && !CAMPOS_OPCIONALES.includes(c)) p.push(`obligacion-campos: ${id} tiene un campo desconocido «${c}»`);
      if (!(typeof o.texto === "string" && o.texto.length >= 20)) p.push(`obligacion-campos: ${id} sin un texto que se entienda`);
      if (!(o.ejecutor in EJECUTORES)) p.push(`ejecutor: ${id} → «${o.ejecutor}» no está en el vocabulario`);
      if (!(o.dureza in VEREDICTOS)) p.push(`dureza: ${id} → «${o.dureza}» no está en el vocabulario`);

      // `ref`: dónde vive el mecanismo, o dónde está ESCRITA la norma. Si no está escrita en ningún sitio: null y su nota.
      if (o.ref === null) {
        if (o.contiene !== null) p.push(`ref-contiene: ${id} no tiene ref y sí «contiene»`);
        if (!(["nada", "persona"].includes(o.ejecutor) || o.dureza === "rota")) p.push(`ref-nulo: ${id} sin ref solo puede ser de ejecutor «nada» o «persona»`);
        if (!o.nota) p.push(`ref-sin-nota: ${id} no tiene ref y no dice por qué (nota: «No escrita aún…»)`);
      } else if (!existe(o.ref)) {
        p.push(`ref-no-existe: ${id} cita ${o.ref}`);
      } else if (!(typeof o.contiene === "string" && o.contiene.trim())) {
        p.push(`ref-sin-contiene: ${id} cita ${o.ref} sin decir qué tiene que llevar`);
      } else if (!String(leer(o.ref) ?? "").toLowerCase().includes(o.contiene.toLowerCase())) {
        p.push(`ref-no-contiene: ${id}: ${o.ref} no contiene «${o.contiene}»`);
      }
      if (o.test != null && !existeTest(o.test)) p.push(`test-no-existe: ${id} cita ${o.test}`);
      if (fasesMalas(o.fase).length) p.push(`fase-desconocida: ${id} → ${fasesMalas(o.fase).join(", ")}`);

      if (o.norma != null) {
        const r = normas[o.norma];
        if (!r) p.push(`norma-desconocida: ${id} enlaza con «${o.norma}», que no está en ops/normas.json`);
        else {
          if (r.ejecutor !== o.ejecutor) p.push(`norma-distinta: ${id} dice ejecutor «${o.ejecutor}» y el registro, «${r.ejecutor}» (${o.norma})`);
          if (r.veredicto !== o.dureza) p.push(`norma-distinta: ${id} dice «${o.dureza}» y el registro, «${r.veredicto}» (${o.norma})`);
        }
      }

      if (o.dureza === "dura") {
        if (!EJECUTORES_DEL_SISTEMA.includes(o.ejecutor)) p.push(`dura-sin-sistema: ${id} se dice dura con ejecutor «${o.ejecutor}», que no es del sistema`);
        if (!o.test) p.push(`dura-sin-test: ${id} se dice dura y no cita el test que la vigila`);
        else if (!ES_TEST.test(o.test) || !o.ref || !String(leer(o.test) ?? "").includes(basename(o.ref))) p.push(`dura-test-ajeno: ${id}: «${o.test}» tiene que ser un *.test.js que nombre ${o.ref ? basename(o.ref) : "su ref"}`);
        if (o.fase?.length) p.push(`dura-con-fase: ${id} ya es dura: quita su fase`);
      } else {
        if (["nada", "persona"].includes(o.ejecutor) && o.dureza === "semidura") p.push(`ejecutor-blando: ${id} con ejecutor «${o.ejecutor}» no puede ser semidura`);
        if (!o.fase?.length && !(o.aceptada === true && o.nota)) p.push(`sin-fase: ${id} no es dura y no dice qué fase la endurece (o «aceptada» con su nota)`);
      }
    }
  });

  if (datos.capas.length !== 4 || new Set(datos.capas.map((c) => c.id)).size !== 4) p.push("capa: tienen que ser cuatro capas, con ids distintos");
  for (const c of datos.capas) for (const d of c.donde) if (!existe(d)) p.push(`capa: ${c.id} cita ${d}, que no está`);

  const enEscalera = datos.escalera.flatMap((e) => e.arreglo).sort();
  const etiquetas = arreglos.filter((a) => a !== "ninguno").sort();
  if (JSON.stringify(enEscalera) !== JSON.stringify(etiquetas)) p.push(`escalera: los escalones cubren [${enEscalera}] y las etiquetas arreglo: son [${etiquetas}] (sin «ninguno»)`);

  if (datos.tipos_skill.length !== 8) p.push(`tipo-skill: tienen que ser ocho tipos y hay ${datos.tipos_skill.length}`);
  for (const t of datos.tipos_skill) {
    if (!(t.estado in ESTADOS_TIPO_SKILL)) p.push(`tipo-skill: ${t.id} con estado «${t.estado}» fuera del vocabulario`);
    if (["en_plan", "reservado"].includes(t.estado) && !t.fase?.length) p.push(`tipo-skill: ${t.id} no dice qué fase lo trae`);
    if (t.estado === "existe" && !skills.length) p.push(`tipo-skill: ${t.id} dice que existe y no hay ninguna skill en .claude/skills/`);
    if (fasesMalas(t.fase).length) p.push(`fase-desconocida: tipo ${t.id} → ${fasesMalas(t.fase).join(", ")}`);
  }

  const alcances = Object.keys(datos.presupuestos?.por_alcance ?? {});
  if (JSON.stringify(alcances) !== JSON.stringify(Object.keys(ALCANCES_FALLO))) p.push(`presupuesto: el presupuesto tiene que cubrir ${Object.keys(ALCANCES_FALLO).join(", ")} y cubre ${alcances.join(", ")}`);
  for (const [a, b] of Object.entries(datos.presupuestos?.por_alcance ?? {})) {
    if (!(b.diagnostica in DIAGNOSTICAN)) p.push(`presupuesto: ${a} diagnostica «${b.diagnostica}» fuera del vocabulario`);
    for (const c of ["hipotesis_en_paralelo_max", "jueces_min", "rondas_max", "minutos_orientativos"]) {
      if (!Number.isInteger(b[c]) || b[c] < 1) p.push(`presupuesto: ${a} «${c}» tiene que ser un entero positivo`);
    }
    if (b.rondas_max > 2) p.push(`presupuesto: ${a} permite ${b.rondas_max} rondas; el tope es 2 (a la tercera decide una persona)`);
  }
  return p;
}

export const MARCAS = {
  fichas: ["<!-- flujo:fichas:inicio -->", "<!-- flujo:fichas:fin -->"],
  pasos: ["<!-- flujo:pasos:inicio -->", "<!-- flujo:pasos:fin -->"],
  catalogos: ["<!-- flujo:catalogos:inicio -->", "<!-- flujo:catalogos:fin -->"],
};

/** Sustituye lo que hay entre dos marcas por `texto`. Devuelve null si faltan las marcas. */
export function sustituirEntre(md, [ini, fin], texto) {
  const a = md.indexOf(ini);
  const b = md.indexOf(fin);
  if (a < 0 || b < a) return null;
  return `${md.slice(0, a + ini.length)}\n${texto}\n${md.slice(b)}`;
}

/** Lo que hay entre dos marcas (sin saltos de borde), o null. */
export function textoEntre(md, [ini, fin]) {
  const a = md.indexOf(ini);
  const b = md.indexOf(fin);
  if (a < 0 || b < a) return null;
  return md.slice(a + ini.length, b).replace(/^\n/, "").replace(/\n$/, "");
}

/** Reescribe las tres tablas de FLUJO.md desde el JSON. */
export function regenerar(md, datos) {
  let out = md;
  for (const [clave, texto] of [
    ["fichas", generarFichas(datos)],
    ["pasos", generarTablaPasos(datos)],
    ["catalogos", generarCatalogos(datos)],
  ]) {
    const nuevo = sustituirEntre(out, MARCAS[clave], texto);
    if (nuevo === null) throw new Error(`Faltan las marcas ${MARCAS[clave].join(" … ")} en FLUJO.md`);
    out = nuevo;
  }
  return out;
}
