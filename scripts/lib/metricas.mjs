/**
 * El registro de métricas (#480, fondo #479): `ops/metricas.json`.
 *
 * «Ninguna cifra sin pregunta» (CLAUDE.md, «Pensar en datos»): cada cifra que se
 * recoge dice a qué objetivo sirve, qué pregunta responde, quién la emite, quién la
 * lee, en qué unidad va, su umbral si lo tiene y qué otra cifra la vigila (una
 * cifra que se persigue deja de medir: Goodhart). Es el GQM de Basili
 * (objetivo → pregunta → métrica) con lector y vigilante.
 *
 * Forma del registro:
 *   objetivos   { id: texto }                       los objetivos (la G de GQM)
 *   lineas      [{ firma, emisores, campos, lectores?, dinamica? }]
 *               cada forma de línea `campo: valor`; `campos` da el papel de cada
 *               clave (ROLES_CAMPO); una línea sin cifras propias lleva sus lectores
 *   informes    { id: { ref, emisor, columnas } }   los informes que no son líneas
 *   metricas    [{ id, objetivo, pregunta, emisor, sale_en, lectores, unidad,
 *                  umbral, vigilante, muestra? }]
 *   excepciones [{ emisor, firma, causa, nota }]    líneas que aún no cumplen; solo baja
 *
 * Texto libre solo en los huecos declarados (`CAMPOS_DE_TEXTO`); lo demás es
 * vocabulario de aquí, un id o una ruta que existe. Puro: la lectura de ficheros
 * entra por argumento (`leer`). Lo vigila ops/metricas.test.js.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_METRICAS = "ops/metricas.json";

/** Unidades de una métrica. */
export const UNIDADES = {
  cuenta: "un número entero de cosas (issues, skills, criterios, líneas)",
  proporcion: "aciertos sobre el total, escrito a/b",
  ratio: "un número entre 0 y 1",
  usd: "dólares estimados a precio de API",
  minutos: "minutos activos de trabajo",
  tokens: "tokens de modelo",
  nivel: "el nivel de un plano, de 0 a 4",
};

/** Quién lee una métrica. Cada lector es un fichero que existe y la nombra (`menciona`). */
export const TIPOS_LECTOR = {
  script: "un script, hook o workflow que la interpreta (la filtra, la compara o decide con ella)",
  informe: "un workflow que la publica donde la lee una persona (un issue o el resumen del run)",
  rutina: "un comando, skill o agente que manda leerla en un paso de su método",
};

/** Papel de cada clave de una línea. */
export const ROLES_CAMPO = {
  id_metrica: "su valor es el id de una métrica del registro (indicador, contrapeso, ruido)",
  metrica: "una cifra medida: la cubre una métrica del registro",
  id: "de qué habla la línea (una skill, un candidato, un criterio, una clave)",
  estado: "un valor de un vocabulario cerrado",
  umbral: "el límite o el objetivo con el que se compara la cifra",
  cobertura: "cuántos datos respaldan la cifra (puntos, días de registro)",
  derivado: "una cifra calculada de otras ya registradas (sumas, medias, límites)",
  lista: "una lista de ids (issues, skills)",
  texto: "un texto corto declarado como hueco (una nota o un motivo)",
};

/** Por qué una línea está en las excepciones. */
export const CAUSAS_EXCEPCION = {
  sin_lector: "nadie la lee: o se le pone lector, o deja de emitirse",
  no_es_cifra: "es una línea de texto con forma de `campo: valor` y no lleva ninguna cifra que contar",
};

/** Los únicos campos de texto libre de una métrica, de una línea o de una excepción. */
export const CAMPOS_DE_TEXTO = ["pregunta", "muestra", "nota"];
const CAMPOS_METRICA = ["id", "objetivo", "pregunta", "emisor", "sale_en", "lectores", "unidad", "umbral", "vigilante", "muestra"];
const CAMPOS_LINEA = ["firma", "emisores", "campos", "lectores", "dinamica"];
const CAMPOS_LECTOR = ["tipo", "ref", "menciona"];
const CAMPOS_EXCEPCION = ["emisor", "firma", "causa", "nota"];
const MIN_TEXTO = 15;
const ID = /^[a-z][a-z0-9_]*$/;
const ID_OBJETIVO = /^[a-z][a-z0-9-]*$/;
/** Dónde puede vivir cada tipo de lector. */
const CARPETA_LECTOR = { script: /^(scripts\/|\.claude\/hooks\/|\.github\/workflows\/)/, informe: /^\.github\/workflows\/[\w.-]+\.yml$/, rutina: /^(\.claude\/(commands|skills|agents)\/|docs\/)/ };

export function leerMetricas(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_METRICAS), "utf8"));
}

const texto = (x, min = MIN_TEXTO) => typeof x === "string" && x.trim().length >= min;
const sobran = (o, permitidos) => Object.keys(o ?? {}).filter((k) => !permitidos.includes(k));

/** La expresión que reconoce una firma al principio de una línea escrita (`<x>` es un valor cualquiera). */
export function regexDeFirma(firma) {
  const partes = String(firma).split("<x>").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${partes.join("\\S+")}: `);
}

/**
 * Las claves de una línea que deben estar en los campos de su registro: las que van desde
 * la firma (lo de antes es la firma misma) hasta el primer campo de texto, cuyo valor se
 * come el resto de la línea (una nota puede llevar «x: y» dentro). `claves` en orden.
 */
export function clavesQueCuentan(claves, registro) {
  const out = [];
  for (const c of claves) {
    out.push(c);
    if (registro?.campos?.[c] === "texto") break;
  }
  return out;
}

/** Las claves de una línea ya escrita que casa con `registro` (por su firma), en orden. */
export function clavesDeTexto(linea, registro) {
  const m = regexDeFirma(registro.firma).exec(linea);
  if (!m) return null;
  const primera = String(registro.firma).split(" ").pop();
  const resto = [...linea.slice(m[0].length).matchAll(/(?<![\p{L}\p{N}_`-])([a-z][a-z0-9_]*): (?=[^\s:])/gu)].map((x) => x[1]);
  return clavesQueCuentan([primera, ...resto], registro);
}

/** La línea del registro con esa firma y ese emisor (o cualquiera con esa firma si no se da emisor). */
export function lineaDelRegistro(datos, firma, emisor = null) {
  return (datos.lineas ?? []).find((l) => l.firma === firma && (!emisor || l.emisores.includes(emisor))) ?? null;
}

/** La excepción de esa firma y ese emisor, o null. */
export function excepcionDe(datos, firma, emisor) {
  return (datos.excepciones ?? []).find((e) => e.firma === firma && e.emisor === emisor) ?? null;
}

/** La métrica que vigila a `id` (su `vigilante`), o null. */
export function vigilanteDe(datos, id) {
  const m = (datos.metricas ?? []).find((x) => x.id === id);
  return m ? (datos.metricas.find((x) => x.id === m.vigilante) ?? null) : null;
}

/** Problemas de un lector: tipo del vocabulario, fichero que existe en su sitio y que la nombra. */
function problemasDeLector(donde, l, leer) {
  const p = [];
  if (!l || typeof l !== "object") return [`${donde}: un lector es { tipo, ref, menciona }`];
  if (sobran(l, CAMPOS_LECTOR).length) p.push(`${donde}: el lector lleva campos que no existen (${sobran(l, CAMPOS_LECTOR).join(", ")})`);
  if (!TIPOS_LECTOR[l.tipo]) return [...p, `${donde}: tipo de lector «${l.tipo}» no es de TIPOS_LECTOR`];
  if (!CARPETA_LECTOR[l.tipo].test(String(l.ref ?? ""))) p.push(`${donde}: un lector «${l.tipo}» vive en ${CARPETA_LECTOR[l.tipo]}, no en «${l.ref}»`);
  const t = leer(String(l.ref ?? ""));
  if (t === null) p.push(`${donde}: el lector ${l.ref} no existe`);
  else if (!texto(l.menciona, 3) || !t.includes(l.menciona)) p.push(`${donde}: el lector ${l.ref} no nombra «${l.menciona}» (lo que prueba que la lee)`);
  return p;
}

/**
 * Los problemas del registro. `leer(ruta)` devuelve el texto de un fichero del repo o null si no existe.
 * Lista vacía si todo está bien.
 */
export function problemasDelRegistro(datos, { leer }) {
  const p = [];
  const objetivos = datos.objetivos ?? {};
  for (const [id, t] of Object.entries(objetivos)) {
    if (!ID_OBJETIVO.test(id)) p.push(`objetivo «${id}»: el id va en minúsculas con guiones`);
    if (!texto(t)) p.push(`objetivo «${id}»: su texto dice qué se quiere conseguir (${MIN_TEXTO} caracteres o más)`);
  }

  // Líneas
  const firmas = new Set();
  for (const l of datos.lineas ?? []) {
    const d = `línea «${l.firma}»`;
    if (sobran(l, CAMPOS_LINEA).length) p.push(`${d}: campos que no existen (${sobran(l, CAMPOS_LINEA).join(", ")})`);
    if (!texto(l.firma, 1)) p.push("una línea sin firma");
    if (!Array.isArray(l.emisores) || !l.emisores.length) p.push(`${d}: sin emisores`);
    for (const e of l.emisores ?? []) {
      const k = `${e}|${l.firma}`;
      if (firmas.has(k)) p.push(`${d}: repetida en ${e}`);
      firmas.add(k);
      const t = leer(e);
      if (t === null) p.push(`${d}: el emisor ${e} no existe`);
      else if (!t.includes(String(l.firma).split(/[ :<]/)[0])) p.push(`${d}: el emisor ${e} no contiene el principio de la firma`);
    }
    const campos = Object.entries(l.campos ?? {});
    if (!campos.length) p.push(`${d}: sin campos`);
    for (const [c, rol] of campos) {
      if (!ID.test(c)) p.push(`${d}: campo «${c}» no es una clave de línea`);
      if (!ROLES_CAMPO[rol]) p.push(`${d}: el papel «${rol}» de «${c}» no es de ROLES_CAMPO`);
    }
    if (campos.filter(([, r]) => r === "id_metrica").length > 1) p.push(`${d}: dos campos con papel id_metrica`);
    const conCifras = campos.some(([, r]) => r === "metrica");
    if (!conCifras && !(l.lectores ?? []).length) p.push(`${d}: no lleva cifras propias, así que dice sus lectores`);
    for (const lec of l.lectores ?? []) p.push(...problemasDeLector(d, lec, leer));
    if (l.dinamica !== undefined && typeof l.dinamica !== "boolean") p.push(`${d}: «dinamica» es true o false`);
  }

  // Informes que no son líneas
  for (const [id, inf] of Object.entries(datos.informes ?? {})) {
    const t = leer(String(inf.emisor ?? ""));
    if (t === null) p.push(`informe «${id}»: el emisor ${inf.emisor} no existe`);
    if (leer(String(inf.ref ?? "")) === null) p.push(`informe «${id}»: ${inf.ref} no existe`);
    for (const [col, rol] of Object.entries(inf.columnas ?? {})) {
      if (!ROLES_CAMPO[rol]) p.push(`informe «${id}»: el papel «${rol}» de «${col}» no es de ROLES_CAMPO`);
      if (t !== null && !t.includes(col)) p.push(`informe «${id}»: el emisor no escribe la columna «${col}»`);
    }
  }

  // Métricas
  const ids = new Set();
  const metricas = datos.metricas ?? [];
  const existe = new Set(metricas.map((m) => m.id));
  for (const m of metricas) {
    const d = `métrica «${m.id}»`;
    if (!ID.test(String(m.id ?? ""))) p.push(`${d}: el id va en minúsculas con guiones bajos`);
    if (ids.has(m.id)) p.push(`${d}: repetida`);
    ids.add(m.id);
    if (sobran(m, CAMPOS_METRICA).length) p.push(`${d}: campos que no existen (${sobran(m, CAMPOS_METRICA).join(", ")})`);
    if (!objetivos[m.objetivo]) p.push(`${d}: el objetivo «${m.objetivo}» no está en «objetivos»`);
    if (!texto(m.pregunta) || !/^¿.*\?$/.test(m.pregunta.trim())) p.push(`${d}: la pregunta va entre ¿ y ? (${MIN_TEXTO} caracteres o más)`);
    if (!UNIDADES[m.unidad]) p.push(`${d}: la unidad «${m.unidad}» no es de UNIDADES`);
    if (m.umbral !== null && typeof m.umbral !== "number") p.push(`${d}: el umbral es un número o null`);
    if (typeof m.umbral === "number" && !texto(m.muestra, 20)) p.push(`${d}: con umbral, la cifra se persigue: lleva la «muestra» que una persona lee a mano`);
    if (!existe.has(m.vigilante)) p.push(`${d}: el vigilante «${m.vigilante}» no es una métrica del registro`);
    if (m.vigilante === m.id) p.push(`${d}: no se vigila a sí misma`);
    const fuente = leer(String(m.emisor ?? ""));
    if (fuente === null) p.push(`${d}: el emisor ${m.emisor} no existe`);
    if (!Array.isArray(m.lectores) || !m.lectores.length) p.push(`${d}: sin lector (si nadie la lee, no se recoge)`);
    for (const lec of m.lectores ?? []) p.push(...problemasDeLector(d, lec, leer));
    if (!Array.isArray(m.sale_en) || !m.sale_en.length) p.push(`${d}: «sale_en» dice dónde sale`);
    for (const s of m.sale_en ?? []) {
      if (s.linea !== undefined) {
        const l = lineaDelRegistro(datos, s.linea, m.emisor);
        if (!l) { p.push(`${d}: no hay línea «${s.linea}» del emisor ${m.emisor}`); continue; }
        for (const c of s.campos ?? []) if (l.campos[c] !== "metrica") p.push(`${d}: «${c}» no es un campo con papel metrica de «${s.linea}»`);
        if (!(s.campos ?? []).length) p.push(`${d}: di qué campos de «${s.linea}» cubre`);
      } else if (s.indicador !== undefined) {
        const l = lineaDelRegistro(datos, s.indicador, m.emisor);
        if (!l || !Object.values(l.campos).includes("id_metrica")) p.push(`${d}: «${s.indicador}» no es una línea con id_metrica del emisor ${m.emisor}`);
        if (fuente !== null && !fuente.includes(m.id)) p.push(`${d}: el emisor ${m.emisor} no nombra «${m.id}»`);
      } else if (s.evento === true) {
        if (fuente !== null && !fuente.includes(`"${m.id}"`)) p.push(`${d}: el emisor ${m.emisor} no registra el evento «${m.id}»`);
      } else if (s.columna !== undefined) {
        const inf = (datos.informes ?? {})[s.informe];
        if (!inf) p.push(`${d}: el informe «${s.informe}» no está en «informes»`);
        else if (inf.columnas?.[s.columna] !== "metrica") p.push(`${d}: «${s.columna}» no es una columna con papel metrica de «${s.informe}»`);
        if (inf && inf.emisor !== m.emisor) p.push(`${d}: el emisor no es el del informe «${s.informe}»`);
      } else p.push(`${d}: cada «sale_en» es { linea, campos }, { indicador }, { evento: true } o { informe, columna }`);
    }
  }

  // Cobertura: cada cifra de una línea o de un informe la cubre una métrica.
  for (const l of datos.lineas ?? []) {
    const deMetrica = Object.entries(l.campos ?? {}).filter(([, r]) => r === "metrica").map(([c]) => c);
    const conId = Object.values(l.campos ?? {}).includes("id_metrica");
    for (const c of deMetrica) {
      const cubre = metricas.some((m) => (m.sale_en ?? []).some((s) => (s.linea === l.firma && s.campos?.includes(c)) || (conId && s.indicador === l.firma)));
      if (!cubre) p.push(`línea «${l.firma}»: la cifra «${c}» no la cubre ninguna métrica`);
    }
  }
  for (const [id, inf] of Object.entries(datos.informes ?? {})) {
    for (const [col, rol] of Object.entries(inf.columnas ?? {})) {
      if (rol === "metrica" && !metricas.some((m) => (m.sale_en ?? []).some((s) => s.informe === id && s.columna === col))) p.push(`informe «${id}»: la columna «${col}» no la cubre ninguna métrica`);
    }
  }

  // Excepciones
  for (const e of datos.excepciones ?? []) {
    const d = `excepción «${e.firma}» de ${e.emisor}`;
    if (sobran(e, CAMPOS_EXCEPCION).length) p.push(`${d}: campos que no existen (${sobran(e, CAMPOS_EXCEPCION).join(", ")})`);
    if (!CAUSAS_EXCEPCION[e.causa]) p.push(`${d}: la causa «${e.causa}» no es de CAUSAS_EXCEPCION`);
    if (!texto(e.nota)) p.push(`${d}: la nota dice por qué (${MIN_TEXTO} caracteres o más)`);
    if (lineaDelRegistro(datos, e.firma, e.emisor)) p.push(`${d}: ya está registrada; quítala de las excepciones`);
  }
  return p;
}

/** Las excepciones nuevas respecto a una referencia (el registro de origin/staging): la lista solo baja. */
export function excepcionesNuevas(datos, referencia) {
  const k = (e) => `${e.emisor}|${e.firma}`;
  const antes = new Set((referencia?.excepciones ?? []).map(k));
  return (datos.excepciones ?? []).filter((e) => !antes.has(k(e))).map(k);
}
