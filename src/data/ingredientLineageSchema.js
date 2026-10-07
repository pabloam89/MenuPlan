import { z } from "zod";

import { EU_ALLERGEN_IDS } from "./ingredientSchema.js";

/**
 * De dónde sale cada ingrediente, para derivar su alérgeno en vez de
 * guardarlo como un booleano por receta.
 *
 * Tres clases:
 *   · simple:   un solo componente (verdura, carne, pescado fresco, huevo,
 *               legumbre o grano seco). Su alérgeno sale directo del Anexo II.
 *   · derivado: sale de un origen por extracción, fermentación, curado o
 *               destilación, con composición estándar (aceites, quesos,
 *               curados, vinagres). El alérgeno se hereda del origen, no hay
 *               que leer una etiqueta para saberlo.
 *   · compuesto: una receta de varios ingredientes que cambia según la marca
 *               (embutidos, salsas preparadas, pan, caldos). No se puede
 *               derivar: hace falta la etiqueta del producto concreto.
 *
 * Nada de texto libre en lo que se consulta: `origenes` apunta a un id del
 * catálogo o a una de las FUENTE_BIOLOGICA cerradas de abajo, nunca a una
 * frase. El texto explicativo vive en docs/alergias, no aquí.
 */
export const CLASE_INGREDIENTE = ["simple", "derivado", "compuesto"];

/**
 * Orígenes biológicos o de proceso que no son, ellos mismos, un ingrediente
 * del catálogo (no se cocinan sueltos: la planta, el animal o el proceso de
 * origen). Cerrado a propósito: añadir uno nuevo es editar este fichero, no
 * escribir una frase en un dato.
 */
export const FUENTE_BIOLOGICA_IDS = [
  "girasol", "aceituna", "alcaparra", "cana-azucar-o-remolacha",
  "pescado-blanco", "cerdo", "trigo", "cereal-malta", "alcohol-destilado",
  "vainilla", "colageno-animal", "cafe", "fruta-variable", "semilla-mostaza",
  "cereal-o-patata", "soja",
];

export const OrigenSchema = z.object({
  tipo: z.enum(["ingrediente", "fuente"]),
  id: z.string(),
});

export const IngredientLineageItemSchema = z
  .object({
    id: z.string(),
    clase: z.enum(CLASE_INGREDIENTE),
    confianza: z.enum(["alta", "revisar"]),
    origenes: z.array(OrigenSchema).optional(),
    heredaAlergenos: z.array(z.enum(EU_ALLERGEN_IDS)).optional(),
  })
  .refine((it) => it.clase !== "derivado" || (it.origenes && it.origenes.length > 0), {
    message: "un derivado necesita al menos un origen",
  });

export const IngredientLineageSchema = z.object({
  version: z.number(),
  generadoEl: z.string(),
  fuenteBiologica: z.record(z.string(), z.string()),
  items: z.array(IngredientLineageItemSchema),
});

/**
 * Alérgenos de un ingrediente derivando por la cadena de origen, hasta un
 * máximo de `maxSaltos` para no entrar en un ciclo si algún día hay uno.
 * @param {string} id
 * @param {Map<string, object>} porId   lineage.items indexado por id
 * @returns {string[]}
 */
export function alergenosHeredados(id, porId, maxSaltos = 5) {
  const item = porId.get(id);
  if (!item) return [];
  if (item.clase !== "derivado") return [];
  const propios = new Set(item.heredaAlergenos ?? []);
  if (maxSaltos <= 0) return [...propios];
  for (const o of item.origenes ?? []) {
    if (o.tipo === "ingrediente") for (const a of alergenosHeredados(o.id, porId, maxSaltos - 1)) propios.add(a);
  }
  return [...propios];
}
