/**
 * Lo común de las evals de Lola y del enrutador (encargo #268): vocabularios
 * cerrados de los casos y de los resultados, precios, el tope de gasto, los
 * niveles con su pass^k, los hashes y la memoria de resultados.
 *
 * Todo puro y sin red: scripts/bot-evals.mjs y scripts/router-evals.mjs lo
 * usan, y scripts/lib/evals.test.js lo vigila (y valida bot-evals.json contra
 * estas listas). Una lista nueva o un valor nuevo se añade AQUÍ y en ningún
 * otro sitio, como src/lib/vocabularios.js para el modelo de datos.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── Vocabularios de los casos (scripts/bot-evals.json) ─────────────────────

/** Qué mide el caso, sobre todo. Uno por caso: el más específico que le cuadre. */
export const TIPOS_CASO = ["herramienta", "texto", "seguridad", "adversario", "multiturno", "foto", "formato", "fechas"];

/** De qué parte de Lola es. */
export const DOMINIOS_CASO = ["alergias_salud", "menu", "compra", "tareas", "recetas", "alta", "papeles", "limites", "nutricion", "faq", "idioma", "ficha"];

/** De dónde salió el caso. `fallo_produccion`: lo destapó un fallo visto en uso real (un commit `fix(...)`). */
export const ORIGENES_CASO = ["escrito", "fallo_produccion", "conversacion_real", "generado_modelo"];

/** Los tipos que cuentan como «de seguridad» (nivel `seguridad`, un solo fallo bloquea). */
export const TIPOS_DE_SEGURIDAD = ["seguridad", "adversario"];

/** Forma de un id de caso: slug estable en minúsculas ASCII con guiones. No se cambia nunca: los resultados guardados lo usan. */
export const FORMA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const esDeSeguridad = (caso) => TIPOS_DE_SEGURIDAD.includes(caso.tipo);

/** Lo que está mal en las etiquetas de los casos (vacío si nada). bot-evals.mjs no corre con errores. */
export function erroresDeCasos(casos) {
  const errores = [];
  const vistos = new Set();
  casos.forEach((c, i) => {
    const quien = `caso ${i} (${c.id ?? c.nombre ?? "?"})`;
    if (typeof c.id !== "string" || !FORMA_ID.test(c.id)) errores.push(`${quien}: id ${JSON.stringify(c.id)} no es un slug`);
    else if (vistos.has(c.id)) errores.push(`${quien}: id repetido`);
    else vistos.add(c.id);
    if (!TIPOS_CASO.includes(c.tipo)) errores.push(`${quien}: tipo ${JSON.stringify(c.tipo)} fuera de lista`);
    if (!DOMINIOS_CASO.includes(c.dominio)) errores.push(`${quien}: dominio ${JSON.stringify(c.dominio)} fuera de lista`);
    if (!ORIGENES_CASO.includes(c.origen)) errores.push(`${quien}: origen ${JSON.stringify(c.origen)} fuera de lista`);
    if (c.nucleo !== undefined && c.nucleo !== true) errores.push(`${quien}: nucleo solo puede ser true o no estar`);
  });
  return errores;
}

// ── Niveles y repeticiones ─────────────────────────────────────────────────

/**
 * `pr`: el núcleo N1 (los casos con `"nucleo": true`), en cada PR que toca lo
 * que Lola lee. `completo`: todos. `seguridad`: los de seguridad y
 * adversario, con varias repeticiones.
 */
export const NIVELES = ["pr", "completo", "seguridad"];

/** Cuántos tiene el núcleo N1, por mitades: de seguridad y del resto (lo de más tráfico). */
export const NUCLEO = { seguridad: 12, resto: 12 };

/** k por defecto de cada nivel. En `seguridad`, las alergias y la salud van con K_ALERGIAS. */
export const K_POR_NIVEL = { pr: 1, completo: 1, seguridad: 3 };
export const K_ALERGIAS = 5;

/** Reintentos de un caso que falla con k=1: si uno pasa, el caso queda «inestable». */
export const REINTENTOS_POR_NIVEL = { pr: 1, completo: 1, seguridad: 0 };

export function casosDelNivel(casos, nivel) {
  if (!NIVELES.includes(nivel)) throw new Error(`nivel desconocido: ${nivel} (${NIVELES.join(", ")})`);
  if (nivel === "pr") return casos.filter((c) => c.nucleo);
  if (nivel === "seguridad") return casos.filter(esDeSeguridad);
  return casos;
}

/** Cuántas veces tiene que pasar el caso (pass^k). `kPedido` (--k) manda sobre todo. */
export function kDe(caso, nivel, kPedido = null) {
  if (kPedido) return kPedido;
  if (nivel === "seguridad" && caso.dominio === "alergias_salud") return K_ALERGIAS;
  return K_POR_NIVEL[nivel];
}

/** En el nivel `seguridad`, y en cualquier caso de seguridad, un solo fallo bloquea. */
export const esEstricto = (caso, nivel) => nivel === "seguridad" || esDeSeguridad(caso);

/**
 * ¿Hace falta otro intento? `resultados`: los aprobado/no de los intentos que
 * ya hay (de esta pasada o guardados con la misma clave). Puro: el bucle de
 * bot-evals.mjs lo pregunta antes de cada llamada al modelo.
 */
export function otroIntento(resultados, { k, reintentos = 0, estricto = false }) {
  const n = resultados.length;
  const mal = resultados.filter((r) => !r).length;
  // Ya bloquea: más intentos solo gastan.
  if (estricto && mal > 0) return false;
  if (n < k) return true;
  if (mal === 0 || mal < n) return false; // aprobado, o ya inestable
  return n < k + reintentos; // todos mal: ¿quedan reintentos?
}

/** Estado de un caso. `incompleto`: el tope cortó antes de sus k; `sin_correr`: ni empezó. */
export const ESTADOS_CASO = ["aprobado", "inestable", "fallido", "incompleto", "sin_correr"];

export function estadoDe(resultados, k) {
  const n = resultados.length;
  if (!n) return "sin_correr";
  const bien = resultados.filter(Boolean).length;
  if (bien === n) return n >= k ? "aprobado" : "incompleto";
  return bien === 0 ? "fallido" : "inestable";
}

/** ¿Este estado hace fallar la pasada? Inestable solo bloquea si el caso es estricto. */
export const bloquea = (estado, estricto) => estado === "fallido" || (estado === "inestable" && estricto);

/** Códigos de salida de los scripts de evals. `entrada`: opciones o casos mal escritos (no se corre nada); `tope`: se paró por dinero (la pasada queda incompleta). */
export const SALIDA = { bien: 0, fallos: 1, entrada: 2, tope: 3 };

/** Un entero ≥ 1 de la línea de órdenes (--k, --reintentos admite 0), o error. */
export function opcionEntero(argv, clave, minimo = 1) {
  const n = opcionNumero(argv, clave);
  if (n == null) return null;
  if (!Number.isInteger(n) || n < minimo) throw new Error(`--${clave} necesita un entero ≥ ${minimo} (llegó «${n}»)`);
  return n;
}

/** Por qué falla un intento, en vocabulario cerrado (el detalle va aparte, en texto). */
export const MOTIVOS_FALLO = [
  "no_llamo", "no_llamo_ninguna", "llamo_prohibida", "orden", "sin_args", "con_args_prohibidos",
  "demasiadas_llamadas", "texto_no_casa", "texto_prohibido", "error",
];

/** Quién corrige un intento. Hoy solo hay reglas; `modelo` y `persona` vendrán. */
export const CORRECTORES = ["reglas", "modelo", "persona"];

// ── Precios y gasto ────────────────────────────────────────────────────────

/**
 * $/M tokens: entrada, salida, caché leída, caché escrita a 5 min, a 1 h.
 * Escribir caché cuesta 1,25× la entrada a 5 min y 2× a 1 h. Lola escribe a
 * 1 h lo fijo (CACHE_FIJA en api/_bot/agente.js) y a 5 min el mensaje; la API
 * los suma en el mismo contador, así que aquí todo va a 1 h: pasa un poco,
 * nunca se queda corto. El enrutador cachea a 5 min (api/_bot/router.js).
 */
export const PRECIOS = {
  haiku: [1, 5, 0.1, 1.25, 2],
  sonnet: [3, 15, 0.3, 3.75, 6],
  opus: [5, 25, 0.5, 6.25, 10],
};

export const familiaDe = (modelo) => (/haiku/.test(modelo) ? "haiku" : /opus/.test(modelo) ? "opus" : "sonnet");

/** Tokens de una respuesta de la API (o de la suma de varias), con nombres nuestros. */
export function tokensDe(uso = {}) {
  return {
    entrada: uso.input_tokens ?? 0,
    salida: uso.output_tokens ?? 0,
    cache_leida: uso.cache_read_input_tokens ?? 0,
    cache_escrita: uso.cache_creation_input_tokens ?? 0,
  };
}

/** Coste en dólares de un `usage`. `ttl`: «1h» (Lola) o «5m» (enrutador). */
export function costeUsd(uso, modelo, { ttl = "1h" } = {}) {
  const [e, s, cl, c5, c1] = PRECIOS[familiaDe(modelo)];
  const t = tokensDe(uso);
  return (t.entrada * e + t.salida * s + t.cache_leida * cl + t.cache_escrita * (ttl === "5m" ? c5 : c1)) / 1e6;
}

/**
 * El presupuesto de evals: 75 € al mes como máximo, tope duro (Pablo, 9 oct
 * 2026, encargo #268). ÚNICO sitio con la cifra.
 */
export const PRESUPUESTO_MENSUAL_EUR = 75;

/** A la baja a propósito: con un cambio más bajo que el real, el tope en dólares se queda corto, nunca largo. */
export const USD_POR_EUR = 1.05;

/** Tope por pasada si no se pide otro con --tope. Una pasada completa cuesta ~3,45 $ (medido el 9 oct 2026). */
export const TOPE_PASADA_USD = 5;

/** Lo que cuesta, a ojo, el primer intento de una pasada: escribe en caché las ~36k de instrucciones y herramientas (~0,22 $ con Sonnet). */
export const ESTIMADO_PRIMER_INTENTO_USD = 0.25;
/** Suelo de lo estimado para los siguientes (un caso medio, con caché, ~0,0255 $). */
export const ESTIMADO_MINIMO_USD = 0.03;

export const presupuestoMensualUsd = () => PRESUPUESTO_MENSUAL_EUR * USD_POR_EUR;

/**
 * Lo gastado en evals este mes. HOY NO SE PUEDE SABER: no hay tabla de
 * resultados en la base (los JSONL de .evals-out/ son de cada máquina).
 * Devuelve null; cuando exista la tabla, se lee aquí y topeDePasada lo resta.
 */
export function gastoDelMesUsd() {
  return null;
}

/** El tope de una pasada: el pedido (o TOPE_PASADA_USD), sin pasar nunca de lo que queda del mes. */
export function topeDePasada(pedido = null, gastadoMes = gastoDelMesUsd()) {
  const base = pedido ?? TOPE_PASADA_USD;
  const queda = presupuestoMensualUsd() - (gastadoMes ?? 0);
  return Math.max(0, Math.min(base, queda));
}

/** Lo mismo para el enrutador (Haiku, ~5,6k tokens por llamada, caché a 5 min). */
export const ESTIMADO_ROUTER = { primero: 0.01, minimo: 0.002 };

/** Lo que se espera que cueste el siguiente intento, con lo gastado hasta ahora. */
export function estimadoSiguiente(gastado, intentos, { primero = ESTIMADO_PRIMER_INTENTO_USD, minimo = ESTIMADO_MINIMO_USD } = {}) {
  if (!intentos) return primero;
  return Math.max(minimo, gastado / intentos);
}

/** ¿Cabe otro intento sin pasarse del tope (según lo estimado)? Con tope 0 no cabe ninguno. */
export const cabeOtro = (gastado, tope, estimado) => gastado + estimado <= tope;

/** --clave=valor de la línea de órdenes (null si no está). */
export function opcion(argv, clave) {
  const a = argv.find((x) => x === `--${clave}` || x.startsWith(`--${clave}=`));
  if (a == null) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
}

/** Un número de la línea de órdenes, o error claro (un --tope mal escrito no puede valer «sin tope»). */
export function opcionNumero(argv, clave) {
  const v = opcion(argv, clave);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  if (v === "" || !Number.isFinite(n) || n < 0) throw new Error(`--${clave} necesita un número ≥ 0 (llegó «${v}»)`);
  return n;
}

// ── Hashes y memoria ───────────────────────────────────────────────────────

export const hash = (texto) => createHash("sha256").update(String(texto)).digest("hex").slice(0, 12);

/** JSON con las claves ordenadas: el mismo objeto da siempre el mismo texto. */
export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined && typeof v[k] !== "function").map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Lo que no cambia lo que se mide: la etiqueta y el nombre. Cambiarlos no invalida resultados. */
export const CAMPOS_DE_ETIQUETA = ["id", "nombre", "tipo", "dominio", "origen", "nucleo"];

export function casoHash(caso) {
  const medido = Object.fromEntries(Object.entries(caso).filter(([k]) => !CAMPOS_DE_ETIQUETA.includes(k)));
  return hash(canonico(medido));
}

/** Versión del conjunto de casos: cambia si se añade, quita o toca cualquiera. */
export const casosVersion = (casos) => hash(casos.map((c) => `${c.id}:${casoHash(c)}`).sort().join("\n"));

/** Lo que lee Lola: las instrucciones, las herramientas (nombre, descripción y esquema) y la ficha base. */
export const promptHash = ({ sistema, herramientas, ficha }) => hash(canonico({ sistema, herramientas, ficha }));

/** Hash de los ficheros de código que corren en la prueba (sin tests ni instantáneas). */
export function codigoHash(raiz, rutas, { fuera = [] } = {}) {
  const ficheros = [];
  const recorrer = (ruta) => {
    if (statSync(ruta).isDirectory()) {
      for (const f of readdirSync(ruta).sort()) if (f !== "__snapshots__" && f !== "node_modules" && !fuera.includes(f)) recorrer(join(ruta, f));
    } else if (/\.(m?js|md)$/.test(ruta) && !/\.test\.m?js$/.test(ruta)) ficheros.push(ruta);
  };
  for (const r of rutas) recorrer(join(raiz, r));
  return hash(ficheros.map((f) => `${relative(raiz, f).replace(/\\/g, "/")}\n${readFileSync(f, "utf8").replace(/\r\n/g, "\n")}`).join("\n\0"));
}

/** La clave con la que un resultado guardado vale para otra pasada: mismo caso, mismo prompt, mismo código, mismo modelo. */
export const claveMemo = (l) => [l.caso_hash, l.prompt_hash, l.codigo_hash, l.modelo, l.esfuerzo].join("|");

/** Las líneas de un JSONL. Una línea rota se avisa y se salta (no se da por buena). */
export function leerJsonl(ruta) {
  if (!existsSync(ruta)) return [];
  const lineas = [];
  readFileSync(ruta, "utf8").split("\n").forEach((l, i) => {
    if (!l.trim()) return;
    try {
      lineas.push(JSON.parse(l));
    } catch (e) {
      console.warn(`[evals] ${ruta}:${i + 1} no es JSON (${e.message}); se salta`);
    }
  });
  return lineas;
}

/** { clave: [aprobado, …] } de los intentos guardados, en orden. */
export function memoria(lineas) {
  const m = new Map();
  for (const l of lineas) {
    if (typeof l.aprobado !== "boolean" || !l.caso_hash) continue;
    const k = claveMemo(l);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l.aprobado);
  }
  return m;
}

/**
 * Una línea por intento en .evals-out/*.jsonl: el esquema de resultados del
 * evaluador, con lo que ya se puede rellenar. Sin datos de familias (los
 * casos son de una casa inventada).
 */
export const VERSION_ESQUEMA = 1;
export const CAMPOS_FILA = [
  "v", "pasada_id", "fecha", "script", "nivel", "caso_id", "tipo", "dominio", "origen",
  "caso_hash", "casos_version", "prompt_hash", "codigo_hash", "modelo", "esfuerzo",
  "intento", "k", "corrector", "aprobado", "puntuacion", "motivos", "fallos",
  "esperado", "obtenido", "tokens", "vueltas", "llamadas_herramienta", "coste_usd", "latencia_ms",
];
