import { z } from "zod";

import { SUPERMERCADOS } from "../lib/supermercados.js";
import { porNombre } from "../lib/vocabularios.js";

/**
 * `productoPorIngrediente` — qué PRODUCTO de cada súper corresponde a cada
 * ingrediente. La tercera entidad de alimentoSchema.js, que estaba declarada y
 * no tenía tabla:
 *
 *   ingrediente  lo que una receta pide              → ingredients.json
 *   alimento     lo que existe y se puede analizar   → alimentos.json
 *   producto     lo que tiene código de barras       → el súper (esta tabla)
 *
 * POR QUÉ EXISTE. La nutrición ya funcionaba así: cada ingrediente tiene su
 * ficha de BEDCA decidida una vez, con motivo (bedcaChoices.json). La compra
 * no: el producto se adivinaba en cada lista comparando el nombre que escribe
 * la receta con los nombres del súper. Medido el 8 nov 2026 sobre las 747
 * recetas estrella: 758 maneras distintas de escribir 375 ingredientes, y 345
 * de esas maneras (el 46 %) se quedaban sin producto. El mismo perejil salía
 * con producto como «Perejil» y sin él como «Perejil fresco».
 *
 * LA CLAVE. (ingredientId, alias, supermercado).
 *   - `alias: null` es la fila del ingrediente: vale para todas sus maneras de
 *     escribirlo. Casi todo cabe aquí.
 *   - `alias: "<nombre>"` solo cuando esa manera de escribirlo es OTRO
 *     producto en el súper: «Pimentón picante» y «Pimentón» son el mismo
 *     ingrediente para la nutrición y dos botes distintos en la tienda. El
 *     alias tiene que ser el nombre o uno de los `aliases` del ingrediente en
 *     ingredients.json; el test lo exige.
 *
 * POR QUÉ EL ID Y NO UN TÉRMINO DE BÚSQUEDA. productoBuscado.json guardaba
 * términos porque «un id caducado desaparece en silencio». Medido: de los
 * 3064 productos del 9 oct seguían 2977 el 6 nov (97 %), 2967 con el mismo
 * nombre. El id aguanta, y que no desaparezca en silencio lo garantiza el test
 * que cruza cada `productId` con el catálogo de la semana.
 */

/**
 * Cómo encaja el producto con lo que pide la receta. Vocabulario cerrado.
 *   exacto        es lo que pide la receta.
 *   equivalente   no lo hay; este ocupa su lugar (grana padano por parmesano).
 *   no_lo_vende   el súper no tiene nada que sirva. productId null.
 *   no_se_compra  no se compra en ningún súper (el agua del grifo). productId null.
 */
export const ENCAJES_PRODUCTO = ["exacto", "equivalente", "no_lo_vende", "no_se_compra"];
export const ENCAJE_PRODUCTO = porNombre(ENCAJES_PRODUCTO);
/** Los encajes que no llevan producto. */
export const ENCAJES_SIN_PRODUCTO = Object.freeze([ENCAJE_PRODUCTO.NO_LO_VENDE, ENCAJE_PRODUCTO.NO_SE_COMPRA]);

/**
 * Quién tomó la decisión. `modelo` es una propuesta revisada contra el catálogo
 * pero no por una persona; `persona` pisa a `modelo` y no al revés.
 */
export const DECISORES_PRODUCTO = ["persona", "modelo"];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export const FilaProductoSchema = z
  .object({
    // Clave ajena a ingredients.json: el test de la tabla exige que exista, y eso ya dice su forma.
    ingredientId: z.string().min(1),
    alias: z.string().min(1).nullable(),
    supermercado: z.enum(SUPERMERCADOS),
    productId: z.string().min(1).nullable(),
    encaje: z.enum(ENCAJES_PRODUCTO),
    decididoPor: z.enum(DECISORES_PRODUCTO),
    motivo: z.string().nullable(),
    revisado: z.string().regex(FECHA_RE),
  })
  .strict()
  .superRefine((f, ctx) => {
    const sinProducto = ENCAJES_SIN_PRODUCTO.includes(f.encaje);
    if (sinProducto !== (f.productId == null)) {
      ctx.addIssue({ code: "custom", message: `encaje «${f.encaje}» ${sinProducto ? "no lleva" : "lleva"} productId` });
    }
    // Lo que no es exacto se explica: si nadie sabe por qué está, nadie se atreve a tocarlo.
    if (f.encaje !== ENCAJE_PRODUCTO.EXACTO && !(f.motivo && f.motivo.length >= 15)) {
      ctx.addIssue({ code: "custom", message: `encaje «${f.encaje}» pide motivo` });
    }
  });

export const TablaProductoSchema = z.object({
  _doc: z.string(),
  filas: z.array(FilaProductoSchema),
});
