/**
 * Las cifras del plan «fichas con estado» (specs/plan-fichas-con-estado.md,
 * trozo 38): las de «Cifras que bajan», las del «Estado medido» y las nuevas
 * de los trozos 23-37, cada una con su línea base, su meta y cómo se mide.
 * Las saca scripts/cifras-modelo.mjs (`npm run cifras:modelo`), en tabla o en
 * JSON para el panel (homenu-panel, otro repo).
 *
 * Aquí no hay red ni ficheros: cada cifra mide con un contexto que le da el
 * script (`ctx`: inventario, capacidades, git grep, consultas de solo lectura,
 * la última pasada del banco de frases). Lo que ya calcula otro script se pide
 * a ese script; aquí solo se declara qué se mide y contra qué.
 *
 * Una cifra que no se puede medir hoy sale «sin medir» con su motivo, nunca
 * como 0: o su trozo no existe (`falta`: el fichero que lo trae; si aparece,
 * el script falla para que alguien la mida), o su tabla no está (migración sin
 * aplicar), o se corre con --sin-base, o no hay pasada del banco.
 */
import { EJES } from "../../src/data/axisRegistry.js";
import { ESCRITORAS_HEREDADAS, LLAMADAS_HEREDADAS } from "../../src/lib/operaciones/escritoras.js";
import { clavesGuardadas } from "./inventarioFicha.mjs";

/** De dónde sale una cifra: el código del repo, la base (producción, solo lectura) o el banco de frases. */
export const FUENTE = Object.freeze({ codigo: "codigo", base: "base", banco: "banco" });
/** Si la cifra está medida hoy o no (y entonces lleva motivo). */
export const ESTADO_CIFRA = Object.freeze({ medida: "medida", sin_medir: "sin_medir" });
/** Hacia dónde tiene que ir. */
export const SENTIDO = Object.freeze({ baja: "baja", sube: "sube" });

/** Línea base: valor (y de cuántos), día y de dónde sale. */
const base = (valor, fecha, origen, de = null) => ({ valor, de, fecha, origen });
const PLAN = "plan";
const DIA_PLAN = "2026-10-30";
/** Cuándo se fusionó el trozo 1 (#1040): desde ahí, el alta guarda la marca de alergias. */
const DESDE_TROZO_1 = "2026-10-30T09:58:11Z";
/** Ficheros que lee el motor (trozo 30: claves `data.*`). */
const FICHEROS_MOTOR = ["src/lib/aiPlanner.js", "src/lib/solver.js", "src/lib/reglas.js", "src/utils/validateMenu.js"];

/** Claves `data.*` distintas en unos textos (el `grep -ohE "data\.[a-zA-Z]+" | sort -u` del trozo 30). */
export const clavesData = (textos) => new Set(textos.flatMap((t) => t.match(/\bdata\.[a-zA-Z]+/g) ?? [])).size;

/** El último resumen del banco de frases con operaciones exactas medidas (pasadas.jsonl), o null. */
/**
 * Cuántas herramientas que escriben siguen sin resultado: los nombres de
 * SIN_RESULTADO_TODAVIA (api/_bot/agente.js), leídos del texto para no cargar
 * a Lola entera. Si la lista cambia de forma, falla en alto (nunca sale 0).
 */
export function pendientesSinResultado(texto) {
  const m = texto.match(/SIN_RESULTADO_TODAVIA = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error("cifra herramientas_sin_resultado: no encuentro SIN_RESULTADO_TODAVIA = new Set([...]) en api/_bot/agente.js");
  return (m[1].match(/"[^"]+"/g) ?? []).length;
}

export const ultimaConEspera = (pasadas) => pasadas.findLast((p) => p.pct_operacion_exacta != null) ?? null;

const SIN_PASADA = "sin pasada del banco en .evals-out/pasadas.jsonl (node scripts/bot-evals.mjs: cuesta dinero, este script no la lanza)";
/** Una cifra del banco de frases: de la última pasada, o sin medir. */
const delBanco = (f) => async (ctx) => {
  const p = ultimaConEspera(await ctx.pasadas());
  return p ? f(p) : { sin_medir: SIN_PASADA };
};
const deuda = (k) => async (ctx) => (await ctx.inventario())[k];
const ficherosCon = (clave) => async (ctx) => (await ctx.ficherosCon(clave, ["src", "api"])).length;

/**
 * Las cifras. `trozo`: el que la mueve (null: la bajan varios tramos).
 * `medir(ctx)` devuelve un número, { valor, de } o { sin_medir: motivo };
 * `falta` (en vez de medir): el fichero que trae su trozo; `requiere`: la tabla
 * y la migración sin las que no se puede medir.
 */
export const CIFRAS = [
  // «Cifras que bajan», medidas al cerrar cada tramo.
  { id: "claves_data_vivas", nombre: "Claves vivas en state.data de la casa", trozo: 22, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: 0,
    base: null, nota: "el plan dio 139 contando el registro (113 + 26 sin declarar), no la base",
    medir: async (ctx) => (await clavesGuardadas(ctx.consultar)).casa.size },
  { id: "sin_declarar", nombre: "Datos sin ficha ni clase (ficha:inventario)", trozo: 6, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(26, DIA_PLAN, PLAN), medir: deuda("sin_declarar") },
  { id: "copia", nombre: "Copias guardadas de otro dato", trozo: null, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(10, DIA_PLAN, PLAN), medir: deuda("copia") },
  { id: "sin_tabular", nombre: "Datos sin tabular (objeto, mapa, lista)", trozo: null, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(54, DIA_PLAN, PLAN), medir: deuda("sin_tabular") },
  { id: "lola_no_lo_ve", nombre: "Datos que Lola no ve", trozo: null, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(30, DIA_PLAN, "inventario del trozo 5 (#1037; el plan decía 22 sin lista)"), medir: deuda("lola_no_lo_ve") },
  { id: "casas_sin_marca_alergias", nombre: "Casas con personas y alguien sin marca de alergias", trozo: null, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: null,
    base: base(25, DIA_PLAN, PLAN, 32), nota: "Pablo no repuebla las viejas: se les vuelve a preguntar",
    medir: async (ctx) => {
      const [f] = await ctx.consultar(`select count(*) filter (where exists (select 1 from jsonb_array_elements(state->'data'->'members') m
        where (m->>'alergiasRevisadas') is distinct from 'true'))::int valor, count(*)::int de from household_state
        where jsonb_typeof(state->'data'->'members') = 'array' and jsonb_array_length(state->'data'->'members') > 0`);
      return f;
    } },
  { id: "casas_nuevas_sin_marca", nombre: "Casas dadas de alta tras el trozo 1 con alguien sin marca de alergias", trozo: 1, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: 0,
    base: null, nota: "el plan no la midió; cuenta desde la fusión del trozo 1",
    medir: async (ctx) => {
      const [f] = await ctx.consultar(`select count(*) filter (where exists (select 1 from jsonb_array_elements(hs.state->'data'->'members') m
        where (m->>'alergiasRevisadas') is distinct from 'true'))::int valor, count(*)::int de
        from household_state hs join households h on h.id = hs.household_id
        where h.created_at >= '${DESDE_TROZO_1}' and jsonb_typeof(hs.state->'data'->'members') = 'array' and jsonb_array_length(hs.state->'data'->'members') > 0`);
      return f;
    } },
  { id: "semanas_vivas_con_huecos", nombre: "Semanas vivas con huecos sin plato (avisos del motor)", trozo: 3, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: 0,
    base: null, nota: "el plan solo midió la casa de Pablo (6 huecos en una semana)",
    medir: async (ctx) => {
      const [f] = await ctx.consultar(`select count(distinct (household_id, week_start)) filter (where w ~ 'hueco omitido|sin asignar')::int valor,
        count(distinct (household_id, week_start))::int de from user_menu_weeks
        left join lateral jsonb_array_elements_text(case when jsonb_typeof(plan->'_warnings') = 'array' then plan->'_warnings' else '[]' end) w on true
        where week_end >= (now() at time zone 'Europe/Madrid')::date`);
      return f;
    } },
  { id: "banco_no_exacta", nombre: "Banco de frases: % de casos sin la operación exacta", trozo: 29, fuente: FUENTE.banco, sentido: SENTIDO.baja, meta: 0, unidad: "%",
    base: base(17, DIA_PLAN, "#958: respuestas que contradicen el estado"), medir: delBanco((p) => 100 - p.pct_operacion_exacta) },
  { id: "banco_coste_caso", nombre: "Banco de frases: coste medio por intento", trozo: 29, fuente: FUENTE.banco, sentido: SENTIDO.baja, meta: null, unidad: "$",
    base: base(0.045, DIA_PLAN, "trozo 29 (#1058), Sonnet"), medir: delBanco((p) => p.coste_medio_usd) },
  // Estado medido (30 oct).
  { id: "sitios_escriben_casa_app", nombre: "Sitios de la app que escriben la casa entera (setData)", trozo: 20, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(145, DIA_PLAN, PLAN), medir: (ctx) => ctx.lineasCon("setData\\(", ["src"]) },
  { id: "sitios_escriben_casa_lola", nombre: "Sitios de Lola que escriben la casa entera (conData, conCasa)", trozo: null, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(35, DIA_PLAN, "re-medida en 5b9dbaed, la base del plan (que dio 28 con otro recuento)"), medir: (ctx) => ctx.lineasCon("conData\\(|conCasa\\(", ["api"]) },
  { id: "filas_sobre", nombre: "Filas en sobre (datos con origen y fecha)", trozo: 8, fuente: FUENTE.base, sentido: SENTIDO.sube, meta: null,
    base: base(0, DIA_PLAN, PLAN), medir: async (ctx) => (await ctx.consultar("select count(*)::int n from sobre"))[0].n },
  // Trozo 23: el mapa de capacidades (npm run capacidades), sus líneas base en capacidades.base.json.
  { id: "huecos_capacidades", nombre: "Capacidades con un lado vacío sin motivo", trozo: 23, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(35, "2026-10-28", "capacidades.base.json"), medir: async (ctx) => (await ctx.capacidades()).huecos },
  { id: "sin_pregunta_en_lola", nombre: "Datos de la familia sin pregunta en Lola", trozo: 23, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(32, DIA_PLAN, "capacidades.base.json"), medir: async (ctx) => (await ctx.capacidades()).sinPreguntaEnLola },
  { id: "sin_pantalla_en_app", nombre: "Datos de la familia sin pantalla en la app", trozo: 23, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(40, DIA_PLAN, "capacidades.base.json"), medir: async (ctx) => (await ctx.capacidades()).sinPantallaEnApp },
  // Trozo 25: ficheros que hay que tocar para añadir un dato (git grep -l, sin tests).
  { id: "ficheros_cookLevel", nombre: "Ficheros que nombran cookLevel", trozo: 25, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: null,
    base: base(19, DIA_PLAN, PLAN), medir: ficherosCon("cookLevel") },
  { id: "ficheros_etapaBebe", nombre: "Ficheros que nombran etapaBebe", trozo: 25, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: null,
    base: base(17, DIA_PLAN, PLAN), medir: ficherosCon("etapaBebe") },
  // Trozo 26: la tubería única.
  { id: "escrituras_fuera_tuberia", nombre: "Escritoras de fichas fuera de la tubería (funciones y llamadas heredadas)", trozo: 26, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(4, "2026-10-31", "trozo 26 (#1076)"), medir: () => Object.keys(ESCRITORAS_HEREDADAS).length + Object.keys(LLAMADAS_HEREDADAS).length },
  { id: "operaciones_apuntadas", nombre: "Operaciones apuntadas por la tubería", trozo: 26, fuente: FUENTE.base, sentido: SENTIDO.sube, meta: null,
    base: null, requiere: { tabla: "operacion", migracion: "0105" }, medir: async (ctx) => (await ctx.consultar("select count(*)::int n from operacion"))[0].n },
  // Trozo 27.
  { id: "herramientas_sin_resultado", nombre: "Herramientas que escriben sin resultado", trozo: 27, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(19, "2026-10-31", "trozo 27 (#1078)"), medir: (ctx) => pendientesSinResultado(ctx.leer("api/_bot/agente.js")) },
  { id: "analizadores_fuera_interprete", nombre: "Analizadores de fechas y personas fuera del intérprete", trozo: 27, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(3, DIA_PLAN, PLAN), medir: (ctx) => ctx.lineasCon("function (diaDe|resolverDia|resolverPersona)\\(", ["api", "src"]) },
  { id: "turnos_con_mensaje_en_curso", nombre: "Turnos de Lola que reciben otro mensaje mientras corren", trozo: 28, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: null,
    base: null, falta: "api/_bot/turnosRafaga.test.js" },
  // Trozos 30-33: el motor.
  { id: "claves_data_motor", nombre: "Claves data.* que lee el motor", trozo: 30, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: base(30, DIA_PLAN, PLAN), medir: async (ctx) => clavesData(await Promise.all(FICHEROS_MOTOR.map((f) => ctx.leer(f)))) },
  { id: "ejes_sin_consumidor", nombre: "Ejes sin consumidor", trozo: 31, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: null,
    base: base(27, DIA_PLAN, PLAN, 78), medir: () => ({ valor: EJES.filter((e) => !e.consumidores.length).length, de: EJES.length }) },
  { id: "pct_preferencias_cumplidas", nombre: "% de preferencias dichas cumplidas por semana", trozo: 31, fuente: FUENTE.base, sentido: SENTIDO.sube, meta: 100, unidad: "%",
    base: null, falta: "src/lib/cumplimiento.js" },
  { id: "reglas_fuera_de_preferencias", nombre: "Reglas del validador escritas a mano (no caben como preferencia)", trozo: 32, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: null,
    base: null, falta: "src/lib/preferenciasSistema.js" },
  { id: "choques_repetidos", nombre: "Choques repetidos tras una tarea de decisión", trozo: 33, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: 0,
    base: null, falta: "src/lib/choques.js" },
  // Trozos 34-36: tareas, caducidades y privacidad.
  { id: "preguntas_hasta_primer_menu", nombre: "Preguntas hasta el primer menú", trozo: 34, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: null,
    base: null, falta: "supabase/migrations/0110_tareas_a_fondo.sql" },
  { id: "tareas_caducadas_sin_respuesta", nombre: "Tareas caducadas sin respuesta", trozo: 34, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: null,
    base: null, falta: "supabase/migrations/0110_tareas_a_fondo.sql" },
  { id: "referencias_rotas", nombre: "Referencias rotas (receta, valor o persona que ya no está)", trozo: 35, fuente: FUENTE.base, sentido: SENTIDO.baja, meta: 0,
    base: null, falta: "src/lib/referenciasRotas.js" },
  { id: "tablas_sin_cascada", nombre: "Tablas de casa o persona sin cascada declarada", trozo: 36, fuente: FUENTE.codigo, sentido: SENTIDO.baja, meta: 0,
    base: null, falta: "supabase/cascadas.test.js" },
];

/** El valor de una medida en { valor, de }; falla en alto si no es un número (una cifra rota no sale como 0). */
function comoValor(id, m) {
  const v = typeof m === "number" ? { valor: m, de: null } : { valor: m?.valor, de: m?.de ?? null };
  if (!Number.isFinite(v.valor)) throw new Error(`cifra ${id}: la medida no es un número (${JSON.stringify(m)})`);
  return v;
}

/**
 * Mide todas las cifras. `sinBase`: las de la base salen sin medir (CI, Done).
 * Devuelve filas sin funciones, listas para JSON. Lanza si una cifra con
 * `falta` ya tiene su fichero (su trozo llegó: hay que medirla).
 */
export async function medirCifras(cifras, ctx, { sinBase = false } = {}) {
  const filas = [];
  for (const c of cifras) {
    const { medir, falta, requiere, ...fila } = c;
    const sinMedir = (motivo) => filas.push({ ...fila, estado: ESTADO_CIFRA.sin_medir, valor: null, de: null, motivo });
    if (falta) {
      if (await ctx.existe(falta)) throw new Error(`cifra ${c.id}: ${falta} ya existe (trozo ${c.trozo}); dale cómo medirla en scripts/lib/cifrasModelo.js`);
      sinMedir(`trozo ${c.trozo} sin hacer (no existe ${falta})`);
      continue;
    }
    if (c.fuente === FUENTE.base && sinBase) { sinMedir("corrida sin la base (--sin-base)"); continue; }
    if (requiere && !(await ctx.consultar(`select to_regclass('public.${requiere.tabla}') is not null as hay`))[0].hay) {
      sinMedir(`falta la tabla ${requiere.tabla}: migración ${requiere.migracion} sin aplicar`);
      continue;
    }
    const m = await medir(ctx);
    if (m && typeof m === "object" && "sin_medir" in m) { sinMedir(m.sin_medir); continue; }
    filas.push({ ...fila, estado: ESTADO_CIFRA.medida, ...comoValor(c.id, m), motivo: null });
  }
  return filas;
}

const numero = (v, de, unidad) => `${v}${unidad === "%" ? " %" : unidad === "$" ? " $" : ""}${de == null ? "" : ` de ${de}`}`;

/** La tabla en Markdown (para la terminal y el cuerpo de un PR). */
export function tablaDeCifras(filas, { fecha }) {
  const lineas = [`Cifras del plan fichas con estado, ${fecha}.`, "", "| Cifra | Hoy | Línea base | Meta | Trozo |", "|---|---|---|---|---|"];
  for (const f of filas) {
    const hoy = f.estado === ESTADO_CIFRA.medida ? numero(f.valor, f.de, f.unidad) : `sin medir: ${f.motivo}`;
    const b = f.base ? `${numero(f.base.valor, f.base.de, f.unidad)} (${f.base.fecha}, ${f.base.origen})` : `sin base${f.nota ? `: ${f.nota}` : ""}`;
    const meta = f.meta == null ? (f.sentido === SENTIDO.baja ? "baja" : "sube") : `→ ${f.meta}`;
    lineas.push(`| ${f.nombre} | ${hoy} | ${b} | ${meta} | ${f.trozo ?? "tramos"} |`);
  }
  return lineas.join("\n");
}
