/**
 * Los clásicos de casa: los platos que una familia pone sí o sí (macarrones
 * con tomate, lentejas, cocido, tortilla…). Salen en el paso «¿Qué no puede
 * faltar?» de la pizarra (decisión de Pablo, 9 nov 2026).
 *
 * Una lista curada y ordenada (clasicos.json), no un campo de la receta: no es
 * un eje que una familia pida como preferencia, es una selección, y el orden
 * es el que se enseña. No es `estrella`: el motor no los propone por su
 * cuenta; solo se ponen A MANO —ese paso y el recetario de un hueco—. Muchos
 * son del fondo de armario: la versión sencilla, la que la estrella sustituyó
 * por otra con un toque.
 *
 * Que cada id exista en el catálogo, tenga foto y quepa en una comida o una
 * cena lo vigila clasicos.test.js.
 */
import lista from "./clasicos.json" with { type: "json" };

/** Los ids, en el orden en que se enseñan. */
export const CLASICOS = Object.freeze([...lista]);

const SON_CLASICOS = new Set(CLASICOS);

/** ¿Es un clásico de casa? Recibe la receta del catálogo (o cualquier cosa con `id`). */
export const esClasico = (receta) => SON_CLASICOS.has(receta?.id);
