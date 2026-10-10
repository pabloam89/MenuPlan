/**
 * El flujo de una incidencia (#335, fase F0 del plan #334): vocabularios
 * cerrados y generador de la vista.
 *
 * `ops/flujo.json` dice, paso a paso, qué obligaciones tiene el camino de un
 * fallo (de detectarlo a aprender de él) y qué las hace cumplir. La tabla de
 * `docs/ops/FLUJO.md` sale de ese JSON y no se edita a mano; `ops/flujo.test.js`
 * ata el JSON a lo que hay de verdad en el repo.
 *
 * Una obligación es una regla del proceso (#515, fondo #488) y se escribe con la
 * plantilla de `regla.mjs`, de una de dos maneras:
 *   - REMITE a su norma (`norma`): su frase, su ejecutor, su veredicto y su control
 *     salen del registro (`ops/normas.json`) y la obligación no los copia; solo dice
 *     dónde vive el mecanismo (`ref`, `contiene`), qué fase la endurece y su nota;
 *   - se escribe POR CAMPOS (nombre, sujeto, fuerza, condicion, exigencia, ejecutor,
 *     veredicto, control): lo que aún no es una norma del registro.
 * Los sujetos son los del registro de normas más los propios del flujo (`sujetos`).
 * La escala de veredicto y el vocabulario de ejecutor y de control se IMPORTAN
 * (`escalas.mjs`, `normas.mjs`), no se copian.
 *
 * El repo es público (#300): este fichero dice QUÉ se exige y QUÉ lo hace
 * cumplir, y qué fase lo endurece. Nunca cómo se salta un control.
 */

import { basename } from "node:path";

import { ESCALERA, ORDEN_VEREDICTO, VEREDICTOS, masDebil } from "./escalas.mjs";
import { CONTROL_TIPOS, EJECUTORES, EJECUTORES_DEL_SISTEMA, problemasDeControl } from "./normas.mjs";
import { FUERZAS, LIMITES_REGLA, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";

export { EJECUTORES, EJECUTORES_DEL_SISTEMA };

/** Qué tan grande es un fallo: decide cuánto esfuerzo se le dedica (paso «triaje»). No es el `ALCANCES` del registro de normas (a quién alcanza un ejecutor). */
export const ALCANCES_FALLO = {
  local: "Un fichero o un caso suelto, sin patrón",
  modulo: "Dentro de un módulo de ops/MODULOS.json",
  transversal: "La misma causa en módulos de ámbitos distintos, tres casos parecidos, o la segunda vez que «no aguantó»",
};

/** Quién diagnostica según el alcance. */
export const DIAGNOSTICAN = {
  agente_dominio: "El agente del dominio, en una pasada, con la skill causa-raiz",
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

/** Orden fijo de los pasos: es el invariante de #334, y el test lo exige. */
export const PASOS = [
  "detectar", "registrar_caso", "triaje", "diagnosticar", "fondo", "plan",
  "ejecutar", "verificar", "observar", "cerrar", "aprender", "medir",
];

/** Lo que lleva una obligación que REMITE a su norma: lo demás sale del registro. */
export const CAMPOS_REMISION = ["id", "norma", "ref", "contiene", "fase"];
export const CAMPOS_REMISION_OPCIONALES = ["nota", "aceptada"];
/** Lo que lleva una obligación escrita POR CAMPOS: los de regla más los de quién la hace cumplir. */
export const CAMPOS_PROPIOS = ["id", "nombre", "sujeto", "fuerza", "exigencia", "ejecutor", "veredicto", "control", "control_tipo", "ref", "contiene", "fase"];
export const CAMPOS_PROPIOS_OPCIONALES = ["condicion", "nota", "aceptada"];
/** Lo que una obligación con norma no puede copiar: su frase y sus datos salen de la norma. */
export const CAMPOS_DE_NORMA = ["texto", "nombre", "sujeto", "fuerza", "condicion", "exigencia", "ejecutor", "dureza", "veredicto", "control", "control_tipo", "test"];

/**
 * La obligación con todo lo que dice su frase y su control: si remite a una norma, lo toma de ella;
 * si no, es la propia. `normas`: { id: norma }. Una norma que no existe deja los campos sin rellenar.
 */
export function resolver(o, normas = {}) {
  if (o.norma == null) return { ...o };
  const n = normas[o.norma] ?? {};
  const de = {};
  for (const c of ["nombre", "sujeto", "fuerza", "condicion", "exigencia", "ejecutor", "veredicto", "control", "control_tipo"]) if (c in n) de[c] = n[c];
  return { ...de, ...o };
}

/** El vocabulario de sujetos del flujo: el del registro de normas más los propios de ops/flujo.json. */
export const sujetosDelFlujo = (datos, sujetosNormas = {}) => ({ ...sujetosNormas, ...(datos.sujetos ?? {}) });

/** Las obligaciones de todos los pasos, en orden. */
export const obligacionesDe = (datos) => datos.pasos.flatMap((p) => p.obligaciones);

/** El veredicto de un paso es el de su obligación más débil: una cadena vale lo que su eslabón más flojo. */
export function veredictoDelPaso(paso, normas = {}) {
  return masDebil((paso.obligaciones ?? []).map((o) => resolver(o, normas).veredicto)) ?? "blanda";
}

/** Cuenta de obligaciones por veredicto, en el orden de la escala. */
export function cuentaPorVeredicto(datos, normas = {}) {
  const cuenta = Object.fromEntries(ORDEN_VEREDICTO.map((v) => [v, 0]));
  for (const o of obligacionesDe(datos)) cuenta[resolver(o, normas).veredicto]++;
  return cuenta;
}

const celda = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const fases = (f) => (f?.length ? f.join(", ") : "—");

const controlLegible = (e) => (e.control_tipo === "juicio" ? "juicio" : `${e.control_tipo}: \`${e.criterio_planos ?? e.control}\``);

/**
 * El contexto del registro de normas para resolver las obligaciones que remiten a una:
 * { normas: { id: norma }, sujetos } a partir de `ops/normas.json` leído.
 */
export const contextoDeNormas = (registro) => ({ normas: Object.fromEntries(registro.normas.map((n) => [n.id, n])), sujetos: registro.sujetos });

/**
 * La tabla de pasos y obligaciones que se pega en FLUJO.md. La frase y los datos de una obligación
 * con norma salen de la norma. `ctx`: { normas, sujetos } (`contextoDeNormas`).
 */
export function generarTablaPasos(datos, ctx) {
  const sujetos = sujetosDelFlujo(datos, ctx.sujetos);
  const filas = [
    "| Paso | Obligación | Fuerza | Lo hace cumplir | Control | Norma | Fase que la endurece |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const p of datos.pasos) {
    filas.push(`| **${celda(p.nombre)}** · ${veredictoDelPaso(p, ctx.normas)} | | | | | | |`);
    for (const o of p.obligaciones) {
      const e = resolver(o, ctx.normas);
      const donde = o.ref ? `\`${celda(o.ref)}\`` : "no escrita aún";
      const norma = o.norma ? `\`${o.norma}\`` : "—";
      filas.push(`| ${o.id} | ${celda(fraseDeRegla(e, sujetos, { conControl: false }))} | ${FUERZAS[e.fuerza].palabra} | ${e.ejecutor} · ${e.veredicto} · ${donde} | ${celda(controlLegible(e))} | ${norma} | ${fases(o.fase)} |`);
    }
  }
  const c = cuentaPorVeredicto(datos, ctx.normas);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const enlazadas = obligacionesDe(datos).filter((o) => o.norma).length;
  const cuenta = ORDEN_VEREDICTO.map((v) => `${c[v]} ${v}s`).join(" · ");
  filas.push("", `**${total} obligaciones:** ${cuenta}. ${enlazadas} remiten a su norma del registro y ${total - enlazadas} están escritas por campos.`);
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

/**
 * Capas, escala, escalera, tipos de skill y presupuestos, en tablas pequeñas.
 * `tablaPresupuestos`: el texto de generarTabla() de presupuestos.mjs. El
 * catálogo vive en ops/presupuestos.json (#339) y entra por argumento: este
 * fichero no importa presupuestos.mjs porque ese ya importa este (ciclo).
 */
export function generarCatalogos(datos, tablaPresupuestos) {
  const out = [];
  out.push("### Las cuatro capas", "", "| Capa | Pregunta | Qué contiene | Dónde |", "|---|---|---|---|");
  for (const c of datos.capas) out.push(`| **${c.nombre}** | ${celda(c.pregunta)} | ${celda(c.contiene)} | ${c.donde.map((d) => `\`${d}\``).join(", ")} |`);
  out.push("", "### La escala de veredicto", "", "Cómo de dura es una regla hoy. Es la misma para las obligaciones de aquí, las normas (`veredicto`) y los mecanismos (`veredicto`, el más alto que pueden dar). Se declara en `scripts/lib/escalas.mjs` y se lee de allí.", "",
    "| Veredicto | Qué quiere decir |", "|---|---|");
  for (const [v, t] of Object.entries(VEREDICTOS)) out.push(`| ${v} | ${celda(t)} |`);
  out.push("", "### La escalera de durabilidad", "", "De más a menos duradero. Un fondo grave o repetido se cierra con un escalón 1 o 2; los demás, con el más alto posible y su porqué. Se declara en `scripts/lib/escalas.mjs`: el `escalon` de un mecanismo, la `barrera` de la ficha del fondo y la etiqueta `arreglo:` de GitHub salen de ahí.", "",
    "| Escalón | Qué es | Etiqueta `arreglo:` | Automático |", "|---|---|---|---|");
  ESCALERA.forEach((e, i) => out.push(`| ${i + 1} · ${e.id} | ${celda(e.que)} | \`${e.etiqueta}\` | ${e.automatico ? "sí" : "no"} |`));
  out.push("", "### Tipos de skill", "", "La lista, qué entra y qué sale de cada tipo y cómo se asigna viven en `ops/forja.json` (`tipos_skill`, vista en `docs/ops/FORJA.md`); el molde de cada uno, en `.claude/plantillas-skill/` (#495).");
  out.push("", "### Presupuestos por alcance y causa (`ops/presupuestos.json`)", "", tablaPresupuestos);
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
 *   skills            nombres de las carpetas de .claude/skills/
 *   normas            { id: norma } del registro (ops/normas.json)
 *   sujetos           los sujetos del registro de normas (los del flujo se suman)
 *
 * Una referencia que existe no basta (fondo #231: copiar como cierto lo que no
 * se ha comprobado): `contiene` es una frase que el fichero del `ref` tiene que
 * llevar de verdad, y una obligación `dura` necesita un control que sea un `*.test.js`
 * que nombre ese fichero. Sigue siendo un indicio, no una prueba: que un test nombre un
 * fichero no garantiza que lo vigile.
 */
export function problemas(datos, { existe, leer = () => null, skills = [], normas = {}, sujetos = {} }) {
  const p = [];
  const issues = datos.issues_citables ?? {};
  const conocida = (f) => typeof f === "string" && REF_ISSUE.test(f) && f.slice(1) in issues;
  const fasesMalas = (lista) => (Array.isArray(lista) ? lista : [null]).filter((f) => !conocida(f));
  const vocabulario = sujetosDelFlujo(datos, sujetos);

  if (JSON.stringify(datos.pasos.map((x) => x.id)) !== JSON.stringify(PASOS)) {
    p.push(`paso-orden: los pasos tienen que ser, en este orden, ${PASOS.join(", ")}`);
  }

  // Los sujetos propios: bien escritos, sin repetir los del registro de normas y todos usados.
  p.push(...problemasDeSujetos(datos.sujetos, ["obligacion"]).map((m) => `sujetos: ${m}`));
  for (const s of Object.keys(datos.sujetos ?? {})) if (s in sujetos) p.push(`sujetos: «${s}» ya está en ops/normas.json: se usa el del registro, no se repite`);
  const usados = new Set(obligacionesDe(datos).map((o) => resolver(o, normas).sujeto));
  for (const s of Object.keys(datos.sujetos ?? {})) if (!usados.has(s)) p.push(`sujetos: «${s}» no lo usa ninguna obligación: no se infla la lista`);

  const ids = new Set();
  const nombres = new Set();
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

      // Dos maneras de escribirla: remite a su norma (todo sale de ella) o va por campos.
      const remite = o.norma != null;
      const obligatorios = remite ? CAMPOS_REMISION : CAMPOS_PROPIOS;
      const opcionales = remite ? CAMPOS_REMISION_OPCIONALES : CAMPOS_PROPIOS_OPCIONALES;
      for (const c of obligatorios) if (!(c in o)) p.push(`obligacion-campos: ${id} sin «${c}»`);
      for (const c of Object.keys(o)) {
        if (obligatorios.includes(c) || opcionales.includes(c)) continue;
        if (remite && CAMPOS_DE_NORMA.includes(c)) p.push(`norma-copia: ${id} remite a «${o.norma}» y copia «${c}»: su frase, su ejecutor, su veredicto y su control salen de la norma`);
        else if (c === "dureza") p.push(`dureza-vieja: ${id} tiene «dureza», que ahora se llama «veredicto» (la escala de scripts/lib/escalas.mjs)`);
        else if (c === "test") p.push(`test-viejo: ${id} tiene «test», que ahora es «control» con su «control_tipo»`);
        else if (c !== "texto") p.push(`obligacion-campos: ${id} tiene un campo desconocido «${c}»`);
      }

      if (remite && !normas[o.norma]) p.push(`norma-desconocida: ${id} remite a «${o.norma}», que no está en ops/normas.json`);
      const e = resolver(o, normas);

      if (!remite) {
        // La regla por campos: la plantilla de regla.mjs, con los sujetos del registro y los del flujo.
        p.push(...problemasDeRegla(o, id, vocabulario).map((m) => `regla: ${m}`));
        if (typeof o.nombre === "string") {
          if (nombres.has(o.nombre)) p.push(`regla: ${id}: el nombre «${o.nombre}» está repetido`);
          nombres.add(o.nombre);
        }
        if (!(o.ejecutor in EJECUTORES)) p.push(`ejecutor: ${id} → «${o.ejecutor}» no está en el vocabulario`);
        if (!(o.veredicto in VEREDICTOS)) p.push(`veredicto: ${id} → «${o.veredicto}» no está en la escala (${Object.keys(VEREDICTOS).join(", ")})`);
        if (!(o.control_tipo in CONTROL_TIPOS)) p.push(`control: ${id} → control_tipo «${o.control_tipo}» no está en el vocabulario (${Object.keys(CONTROL_TIPOS).join(", ")})`);
        p.push(...problemasDeControl(o, id).map((m) => `control: ${m}`));
        if (o.control_tipo === "planos") p.push(`control: ${id}: un control de planos es de una norma del registro; remite a ella`);
        else if (o.control_tipo !== "juicio" && o.control_tipo in CONTROL_TIPOS && typeof o.control === "string" && !existe(o.control)) p.push(`control-no-existe: ${id} cita ${o.control}`);
      }

      // `ref`: dónde vive el mecanismo, o dónde está ESCRITA la norma. Si no está escrita en ningún sitio: null y su nota.
      if (o.ref === null) {
        if (o.contiene !== null) p.push(`ref-contiene: ${id} no tiene ref y sí «contiene»`);
        if (!(["nada", "persona"].includes(e.ejecutor) || e.veredicto === "rota")) p.push(`ref-nulo: ${id} sin ref solo puede ser de ejecutor «nada» o «persona»`);
        if (!o.nota) p.push(`ref-sin-nota: ${id} no tiene ref y no dice por qué (nota: «No escrita aún…»)`);
      } else if (!existe(o.ref)) {
        p.push(`ref-no-existe: ${id} cita ${o.ref}`);
      } else if (!(typeof o.contiene === "string" && o.contiene.trim())) {
        p.push(`ref-sin-contiene: ${id} cita ${o.ref} sin decir qué tiene que llevar`);
      } else if (o.contiene.trim().length < 12) {
        p.push(`ref-contiene-corto: ${id}: «${o.contiene}» es tan corta que cualquier fichero la llevaría (mínimo 12 caracteres): usa la frase o el nombre que ES el mecanismo`);
      } else if (!String(leer(o.ref) ?? "").toLowerCase().includes(o.contiene.toLowerCase())) {
        p.push(`ref-no-contiene: ${id}: ${o.ref} no contiene «${o.contiene}»`);
      }
      if (fasesMalas(o.fase).length) p.push(`fase-desconocida: ${id} → ${fasesMalas(o.fase).join(", ")}`);
      if (remite && typeof o.nota === "string" && o.nota.length > LIMITES_REGLA.nota.max) p.push(`nota-larga: ${id}: la nota pasa de ${LIMITES_REGLA.nota.max} caracteres (${o.nota.length}); es solo para el matiz`);

      if (e.veredicto === "dura") {
        if (!EJECUTORES_DEL_SISTEMA.includes(e.ejecutor)) p.push(`dura-sin-sistema: ${id} se dice dura con ejecutor «${e.ejecutor}», que no es del sistema`);
        if (!CONTROL_TIPOS[e.control_tipo]?.prueba) p.push(`dura-sin-test: ${id} se dice dura y su control (${e.control_tipo}) no es una prueba que falle sola`);
        else if (e.control_tipo === "test" && (!ES_TEST.test(e.control) || !o.ref || !String(leer(e.control) ?? "").includes(basename(o.ref)))) {
          p.push(`dura-test-ajeno: ${id}: «${e.control}» tiene que ser un *.test.js que nombre ${o.ref ? basename(o.ref) : "su ref"}`);
        }
        if (o.fase?.length) p.push(`dura-con-fase: ${id} ya es dura: quita su fase`);
      } else {
        if (["nada", "persona"].includes(e.ejecutor) && e.veredicto === "semidura") p.push(`ejecutor-blando: ${id} con ejecutor «${e.ejecutor}» no puede ser semidura`);
        if (!o.fase?.length && !(o.aceptada === true && o.nota)) p.push(`sin-fase: ${id} no es dura y no dice qué fase la endurece (o «aceptada» con su nota)`);
      }
    }
  });

  if (datos.capas.length !== 4 || new Set(datos.capas.map((c) => c.id)).size !== 4) p.push("capa: tienen que ser cuatro capas, con ids distintos");
  for (const c of datos.capas) for (const d of c.donde) if (!existe(d)) p.push(`capa: ${c.id} cita ${d}, que no está`);

  // La escala y la escalera se declaran en scripts/lib/escalas.mjs (#515): aquí no vuelven a escribirse.
  if ("escalera" in datos) p.push("escalera: la escalera vive en scripts/lib/escalas.mjs; quita `escalera` de flujo.json (una sola fuente)");

  // Los tipos de skill viven solo en ops/forja.json (#495): aquí no vuelve otra lista.
  if ("tipos_skill" in datos) p.push("tipo-skill: los tipos de skill viven en ops/forja.json (tipos_skill); quita tipos_skill de flujo.json (una sola fuente)");

  // Los presupuestos ya no viven aquí (#339): están en ops/presupuestos.json y los valida scripts/lib/presupuestos.mjs.
  if ("presupuestos" in datos) p.push("presupuesto: los presupuestos viven en ops/presupuestos.json; quita `presupuestos` de flujo.json (una sola fuente)");
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

/** Reescribe las tres tablas de FLUJO.md desde el JSON, el registro de normas (`ctx`, `contextoDeNormas`) y la tabla de presupuestos que se le pasa. */
export function regenerar(md, datos, tablaPresupuestos, ctx) {
  let out = md;
  for (const [clave, texto] of [
    ["fichas", generarFichas(datos)],
    ["pasos", generarTablaPasos(datos, ctx)],
    ["catalogos", generarCatalogos(datos, tablaPresupuestos)],
  ]) {
    const nuevo = sustituirEntre(out, MARCAS[clave], texto);
    if (nuevo === null) throw new Error(`Faltan las marcas ${MARCAS[clave].join(" … ")} en FLUJO.md`);
    out = nuevo;
  }
  return out;
}
