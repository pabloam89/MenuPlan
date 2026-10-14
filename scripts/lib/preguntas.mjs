// preguntas.mjs — qué se le pregunta al dueño de un proyecto y qué queda autorizado (#690).
//
// Una sola fuente por proyecto, ops/proyectos/<id>/preguntas.json (acuerdo con Pablo del 14 oct 2026). La sección
// «Qué se le pregunta a …, y qué no» de CLAUDE.md sale de aquí (renderSeccion) y ops/preguntas.test.js la compara;
// el orquestador lee el registro con `npm run preguntas`, sin copia a mano.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RUTA_PROYECTOS } from "./normas.mjs";

export const rutaPreguntas = (id) => `${RUTA_PROYECTOS}/${id}/preguntas.json`;
export const RUTA_CLAUDE = "CLAUDE.md";

/** Vocabulario cerrado del `tipo` de una entrada, con el rótulo que lleva en CLAUDE.md. El orden es el de la sección. */
export const TIPOS_DE_ENTRADA = {
  pregunta: "**Se pregunta y se espera el sí:**",
  autorizada: "**Autorizado de forma permanente** (se hace y se cuenta en el resumen):",
};

const CAMPOS_ENTRADA = ["id", "tipo", "texto", "norma"];
const PREFIJO_TITULO = "## Qué se le pregunta a ";

/** El registro de un proyecto, o null si no tiene. */
export function leerPreguntas(raiz, id) {
  const ruta = join(raiz, rutaPreguntas(id));
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
}

/**
 * Errores del registro: su proyecto, sus campos, el vocabulario de `tipo`, ids únicos en kebab-case y `norma` como id
 * de una norma que existe (`normas`: los ids de ops/normas.json y de los registros de proyecto) o null.
 */
export function problemasDePreguntas(datos, id, normas) {
  const p = [];
  if (datos.project !== id) p.push(`project es «${datos.project}» y el registro está en ops/proyectos/${id}/`);
  if (typeof datos.pregunta_a !== "string" || !datos.pregunta_a.trim()) p.push("falta pregunta_a: a quién se le pregunta");
  if (typeof datos.criterio !== "string" || !datos.criterio.trim()) p.push("falta criterio: qué se pregunta y por qué");
  if (!Array.isArray(datos.entradas) || !datos.entradas.length) return [...p, "sin entradas"];
  const vistos = new Set();
  for (const e of datos.entradas) {
    const q = `entrada «${e.id ?? "?"}»`;
    const sobran = Object.keys(e).filter((k) => !CAMPOS_ENTRADA.includes(k));
    if (sobran.length) p.push(`${q}: campos que nadie lee: ${sobran.join(", ")}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id ?? "")) p.push(`${q}: el id va en kebab-case`);
    if (vistos.has(e.id)) p.push(`${q}: id repetido`);
    vistos.add(e.id);
    if (!Object.hasOwn(TIPOS_DE_ENTRADA, e.tipo)) p.push(`${q}: tipo «${e.tipo}» no es ${Object.keys(TIPOS_DE_ENTRADA).join(" ni ")}`);
    if (typeof e.texto !== "string" || !e.texto.trim() || /\n/.test(e.texto)) p.push(`${q}: el texto es una línea no vacía`);
    if (!Object.hasOwn(e, "norma")) p.push(`${q}: falta norma (un id o null)`);
    else if (e.norma !== null && !normas.has(e.norma)) p.push(`${q}: la norma «${e.norma}» no existe`);
  }
  for (const t of Object.keys(TIPOS_DE_ENTRADA)) {
    if (!datos.entradas.some((e) => e.tipo === t)) p.push(`ninguna entrada de tipo «${t}»`);
  }
  return p;
}

/** El título de la sección: lleva a quién se pregunta, que es dato del proyecto. */
export const tituloSeccion = (datos) => `${PREFIJO_TITULO}${datos.pregunta_a}, y qué no`;

/** El texto de la sección de CLAUDE.md, generado desde el registro. */
export function renderSeccion(datos, id) {
  const lineas = [
    tituloSeccion(datos),
    "",
    // No empieza por «Generado desde»: esa cabecera marca un documento generado entero (ops/generados.test.js), y CLAUDE.md no lo es.
    `<!-- Sección que sale de ${rutaPreguntas(id)} con \`npm run preguntas -- --escribir\`; ops/preguntas.test.js la compara, no se edita aquí. -->`,
    "",
    datos.criterio,
  ];
  for (const [tipo, rotulo] of Object.entries(TIPOS_DE_ENTRADA)) {
    lineas.push("", rotulo, "");
    for (const e of datos.entradas.filter((x) => x.tipo === tipo)) lineas.push(`- ${e.texto}`);
  }
  return lineas.join("\n");
}

/** La sección «Qué se le pregunta a …» que hay en un texto (hasta la siguiente `## ` o el final), o null. */
export function extraerSeccion(md) {
  const texto = md.replace(/\r\n/g, "\n");
  const i = texto.indexOf(`\n${PREFIJO_TITULO}`);
  if (i === -1) return null;
  const resto = texto.slice(i + 1);
  const fin = resto.slice(PREFIJO_TITULO.length).search(/\n## /);
  return (fin === -1 ? resto : resto.slice(0, PREFIJO_TITULO.length + fin)).trimEnd();
}

/** Sustituye la sección en el texto; si no la hay, no la inventa (devuelve null). */
export function conSeccion(md, seccion) {
  const texto = md.replace(/\r\n/g, "\n");
  const actual = extraerSeccion(texto);
  return actual === null ? null : texto.replace(actual, () => seccion);
}

/** Escribe la sección en CLAUDE.md. Devuelve true si cambió. */
export function escribirSeccion(raiz, datos, id) {
  const ruta = join(raiz, RUTA_CLAUDE);
  const antes = readFileSync(ruta, "utf8");
  const despues = conSeccion(antes, renderSeccion(datos, id));
  if (despues === null) throw new Error(`${RUTA_CLAUDE} no tiene la sección «${PREFIJO_TITULO}…»: no se inventa el sitio`);
  if (despues === antes.replace(/\r\n/g, "\n")) return false;
  writeFileSync(ruta, despues);
  return true;
}
