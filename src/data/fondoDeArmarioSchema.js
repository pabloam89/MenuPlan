import { z } from "zod";

import { porNombre } from "../lib/vocabularios.js";

/**
 * `fondoDeArmario` — qué ingredientes son de fondo de armario y cuáles se
 * compran para la receta. Es un atributo del ingrediente, decidido una vez para
 * el catálogo (no lo adivina cada lista).
 *
 * EL CRITERIO. Un ingrediente es de fondo de armario si cumple las tres cosas:
 *   1. aguanta meses en casa una vez abierto (o semanas fuera de la nevera,
 *      como el ajo);
 *   2. cada receta gasta un poco del envase, no el envase entero;
 *   3. lo tiene casi cualquier casa española.
 * Es lo que las guías de despensa llaman «básicos de larga duración» o
 * «stable staples» (aceite, sal, vinagre, especias, azúcar, harina), frente a
 * los perecederos y lo que se compra por cantidad. El tercer punto deja fuera
 * lo duradero pero poco corriente (gochujang, tahini, mirin): si se diera por
 * hecho, la lista callaría algo que la familia no tiene.
 *
 * LAS ESPECIAS, TODAS. Toda especia seca (el pasillo «Especias» del catálogo)
 * es de fondo de armario, aunque no la tenga cualquier casa (la mezcla cajún):
 * en la Compra se buscan juntas, en un sitio (Pablo, 9 nov 2026). El test lo
 * exige. Las hierbas frescas no son especias: se estropean en días y van al
 * pasillo de Verduras, como en Mercadona.
 *
 * LO QUE NO ES. Arroz, pasta y legumbres aguantan meses, pero una receta gasta
 * un paquete entero: van por cantidad, son de receta. Las hierbas frescas, el
 * vino abierto y los caldos, igual.
 *
 * LA FORMA. Solo se listan los de fondo de armario; un ingrediente que no está
 * es de receta. Así hay una decisión por ingrediente y en un solo sitio, y el
 * test exige que cada id exista en ingredients.json.
 */
export const TIPOS_DE_COMPRA = ["fondo_de_armario", "receta"];
export const TIPO_DE_COMPRA = porNombre(TIPOS_DE_COMPRA);

export const FilaFondoSchema = z
  .object({
    // Clave ajena a ingredients.json (el test lo comprueba).
    ingredientId: z.string().min(1),
    // Por qué, solo cuando el criterio no es evidente (el ajo es fresco).
    motivo: z.string().min(15).nullable(),
  })
  .strict();

export const TablaFondoSchema = z
  .object({
    _doc: z.object({ que: z.string(), fuentes: z.array(z.string()).min(1) }).strict(),
    filas: z.array(FilaFondoSchema).min(1),
  })
  .strict();
