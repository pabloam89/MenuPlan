/**
 * El esquema de una regla por campos (#487, fondo #455). Una regla se escribe con
 * campos cerrados y la frase se genera: no hay prosa libre que cada autor redacte a
 * su manera. Pensado para los criterios de la forja (`ops/forja.json`) y, luego, para
 * `ops/normas.json` y las obligaciones de `ops/flujo.json` (#488): son el mismo tipo de
 * entidad (una regla con fuerza, sujeto y control).
 *
 * La forma sigue EARS (Mavin, Rolls-Royce, 2009: «Easy Approach to Requirements Syntax»)
 * y las palabras de fuerza de RFC 2119:
 *   - `nombre`: sustantivo corto (2 a 5 palabras), mayúscula inicial y sin punto;
 *   - `sujeto`: una parte de un artefacto, de un vocabulario cerrado que declara cada
 *     catálogo (`sujetos`: id -> { legible, aplica_a });
 *   - `fuerza`: `debe`, `no_debe` o `conviene`;
 *   - `condicion` (opcional): empieza por «cuando» o «si»;
 *   - `exigencia`: el único hueco de texto, una frase verbal en infinitivo, sin sujeto y
 *     sin punto final, de 160 caracteres como mucho;
 *   - `control`: el que vigila la regla (un fichero, o «juicio»).
 *
 * Este módulo no sabe de qué catálogo es la regla: recibe su vocabulario de sujetos.
 */

/** La fuerza de una regla: la palabra que sale en la frase y qué quiere decir (RFC 2119). */
export const FUERZAS = {
  debe: { palabra: "DEBE", que: "Obligatoria: sin ella la regla no se cumple (RFC 2119, MUST)" },
  no_debe: { palabra: "NO DEBE", que: "Prohibida: hacerlo incumple la regla (RFC 2119, MUST NOT)" },
  conviene: { palabra: "CONVIENE", que: "Recomendada: se avisa, pero no impide seguir (RFC 2119, SHOULD)" },
};

export const LIMITES_REGLA = {
  nombre: { palabras_min: 2, palabras_max: 5 },
  exigencia: { max: 160, min: 10 },
  condicion: { max: 120, min: 8 },
  nota: { max: 400, min: 15 },
  rubrica: { min: 20 },
};

/** El valor de `control` cuando no lo vigila un fichero sino un juicio. */
export const CONTROL_JUICIO = "juicio";

const ID_SUJETO = /^[a-z]+(\.[a-z]+)*$/;
const NOMBRE = /^[A-ZÁÉÍÓÚÑÜ][^.\n]*[^.\s]$/;
const CONDICION = /^(cuando|si) \S/;
// Infinitivo: acaba en ar, er, ir (con tilde si lleva pronombre: devolvérselo), con pronombres enclíticos si los hay (arse, erlo, irles…).
const INFINITIVO = /^[a-zñáéíóúü]*(ar|er|ir|ár|ér|ír)(se|me|te|nos|os|l[oae]s?)*$/;
/** La primera palabra de la exigencia que debe ser un infinitivo: salta un «no» inicial. */
const primeraPalabra = (e) => {
  const w = e.trim().split(/\s+/).map((x) => x.replace(/[,;:]+$/, ""));
  return w[0] === "no" ? (w[1] ?? "") : w[0];
};
const esTexto = (v, min) => typeof v === "string" && v.trim().length >= min;
const palabras = (t) => t.trim().split(/\s+/).length;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Errores del vocabulario de sujetos de un catálogo (lista vacía si está bien).
 * `artefactos`: los ids de artefacto a los que puede aplicarse un sujeto.
 */
export function problemasDeSujetos(sujetos, artefactos = []) {
  if (!sujetos || typeof sujetos !== "object" || !Object.keys(sujetos).length) return ["el catálogo no declara «sujetos»"];
  const malos = [];
  for (const [id, s] of Object.entries(sujetos)) {
    if (!ID_SUJETO.test(id)) malos.push(`sujeto «${id}»: el id va en minúsculas, con puntos para las partes (skill.descripcion)`);
    if (!esTexto(s?.legible, 5) || s.legible !== s.legible.trim() || /\.$/.test(s.legible) || s.legible !== s.legible.charAt(0).toLowerCase() + s.legible.slice(1)) {
      malos.push(`sujeto «${id}»: «legible» es el nombre en castellano, en minúscula inicial y sin punto (cada skill)`);
    }
    if (!Array.isArray(s?.aplica_a) || !s.aplica_a.length) malos.push(`sujeto «${id}»: «aplica_a» lista los artefactos que puede juzgar`);
    else for (const a of s.aplica_a) if (artefactos.length && !artefactos.includes(a)) malos.push(`sujeto «${id}»: aplica_a «${a}» no es un artefacto (${artefactos.join(", ")})`);
  }
  return malos;
}

/**
 * Errores de los campos de regla de una entrada (lista vacía si está bien). `d` es cómo se
 * nombra en el mensaje; `sujetos` el vocabulario del catálogo. No mira el control ni la
 * fuente: eso es de cada catálogo.
 */
export function problemasDeRegla(r, d, sujetos) {
  const malos = [];
  if ("texto" in (r ?? {})) malos.push(`${d}: «texto» ya no existe: la regla se escribe por campos (nombre, sujeto, fuerza, condicion, exigencia)`);
  const n = r?.nombre;
  if (typeof n !== "string" || !NOMBRE.test(n)) malos.push(`${d}: «nombre» es un sustantivo corto con mayúscula inicial y sin punto final`);
  else if (palabras(n) < LIMITES_REGLA.nombre.palabras_min || palabras(n) > LIMITES_REGLA.nombre.palabras_max) {
    malos.push(`${d}: «nombre» tiene de ${LIMITES_REGLA.nombre.palabras_min} a ${LIMITES_REGLA.nombre.palabras_max} palabras, no ${palabras(n)}`);
  }
  if (!(r?.sujeto in (sujetos ?? {}))) malos.push(`${d}: sujeto «${r?.sujeto}» no está en el vocabulario (${Object.keys(sujetos ?? {}).join(", ")})`);
  if (!(r?.fuerza in FUERZAS)) malos.push(`${d}: fuerza «${r?.fuerza}» no está en el vocabulario (${Object.keys(FUERZAS).join(", ")})`);
  if ("condicion" in (r ?? {})) {
    const c = r.condicion;
    if (!esTexto(c, LIMITES_REGLA.condicion.min) || !CONDICION.test(c)) malos.push(`${d}: «condicion» es opcional y empieza por «cuando» o «si»`);
    else if (c.length > LIMITES_REGLA.condicion.max) malos.push(`${d}: «condicion» pasa de ${LIMITES_REGLA.condicion.max} caracteres (${c.length})`);
    else if (/[.\n]$|\n/.test(c) || /,$/.test(c)) malos.push(`${d}: «condicion» va en una línea, sin punto ni coma final`);
  }
  const e = r?.exigencia;
  if (!esTexto(e, LIMITES_REGLA.exigencia.min)) malos.push(`${d}: «exigencia» es una frase verbal (${LIMITES_REGLA.exigencia.min} caracteres o más)`);
  else {
    if (e.length > LIMITES_REGLA.exigencia.max) malos.push(`${d}: «exigencia» pasa de ${LIMITES_REGLA.exigencia.max} caracteres (${e.length}); lo que sobra va a «nota»`);
    if (/\n/.test(e)) malos.push(`${d}: «exigencia» va en una sola línea`);
    if (/[.;:]\s*$/.test(e)) malos.push(`${d}: «exigencia» va sin punto final`);
    if (e !== e.trim() || e.charAt(0) !== e.charAt(0).toLowerCase()) malos.push(`${d}: «exigencia» empieza en minúscula, con el verbo: la frase se une al sujeto`);
    else if (!INFINITIVO.test(primeraPalabra(e))) malos.push(`${d}: «exigencia» empieza por un verbo en infinitivo (ar, er, ir, con o sin pronombre), o por «no» y un infinitivo`);
  }
  if ("nota" in (r ?? {})) {
    if (!esTexto(r.nota, LIMITES_REGLA.nota.min) || /\n/.test(r.nota)) malos.push(`${d}: «nota» es una línea de ${LIMITES_REGLA.nota.min} caracteres o más`);
    else if (r.nota.length > LIMITES_REGLA.nota.max) malos.push(`${d}: «nota» pasa de ${LIMITES_REGLA.nota.max} caracteres (${r.nota.length})`);
  }
  return malos;
}

/** El control en castellano: un fichero va entre comillas invertidas; el juicio se explica. */
export function controlLegible(control) {
  return control === CONTROL_JUICIO ? "el juicio de una persona o de un LLM sobre sus casos" : `\`${control}\``;
}

/**
 * La frase de una regla:
 * «**Nombre.** [Condición,] <sujeto> DEBE|NO DEBE <exigencia>. Se comprueba con: <control>.»
 * Con `conviene` la frase cambia a «Para <sujeto>, CONVIENE <exigencia>», porque
 * «CONVIENE QUE» pediría subjuntivo y la exigencia va siempre en infinitivo.
 * `sujetos`: el vocabulario del catálogo (id -> { legible }).
 */
export function fraseDeRegla(r, sujetos) {
  const legible = sujetos?.[r.sujeto]?.legible;
  if (!legible) throw new Error(`sujeto «${r.sujeto}» sin texto legible`);
  const fuerza = FUERZAS[r.fuerza];
  if (!fuerza) throw new Error(`fuerza «${r.fuerza}» desconocida`);
  const cabeza = `**${r.nombre}.**`;
  const condicion = r.condicion ? `${mayuscula(r.condicion)}, ` : "";
  let cuerpo;
  if (r.fuerza === "conviene") cuerpo = `${condicion ? `${condicion}para ${legible}` : `Para ${legible}`}, ${fuerza.palabra} ${r.exigencia}`;
  else cuerpo = `${condicion || ""}${condicion ? legible : mayuscula(legible)} ${fuerza.palabra} ${r.exigencia}`;
  return `${cabeza} ${cuerpo}. Se comprueba con: ${controlLegible(r.control)}.`;
}
