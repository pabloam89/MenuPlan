import { z } from "zod";

/**
 * `alimentos` — la tabla de referencia que falta, y la primera pieza de la
 * Fase A de specs/modelo-datos.md (§14).
 *
 * POR QUÉ EXISTE. Hoy la nutrición vive en `ingredients.json`, escrita por
 * scripts/apply-bedca-nutrition.mjs con una línea que lo dice todo:
 *
 *     ing.nutrition = chosen.nutrition;   // y `chosen.foodId` se tira
 *
 * Se copian los ocho números y se pierde de qué ficha de BEDCA salieron. Medido
 * antes de escribir esto: 198 ingredientes con nutrición, 0 con procedencia. Y
 * sin procedencia no se puede responder la pregunta que de verdad importa —
 * "¿esta proteína es la del atún fresco o la del atún de lata?"— porque son el
 * mismo `ingredientId` y fichas distintas.
 *
 * LA REGLA QUE SEPARA LAS TRES ENTIDADES: antes o después de la caja del súper.
 *
 *   alimento     lo que existe y se puede analizar   → BEDCA        (esta tabla)
 *   producto     lo que tiene código de barras       → el súper
 *   ingrediente  lo que una receta pide              → el catálogo  (ya existe)
 *
 * El ingrediente NO desaparece ni se duplica: se queda como lo que ya es —el
 * nombre con el que hablan las recetas— y pasa a apuntar aquí con `alimentoId`.
 *
 * QUÉ SE RELLENA EN ESTA FASE Y QUÉ NO. Solo lo INGERIBLE: procedencia y
 * dimensiones, ambas leídas del nombre que BEDCA ya publica. `familia`,
 * `densidad` y `fraccionComestible` son campos CURADOS (§15) y se declaran aquí
 * para que el libro de cuentas pueda contarlos como pendientes — declarar antes
 * de rellenar es el orden del repo, no un descuido.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─────────────────────────────────────────────────────────────────────────────
// Las seis dimensiones de variedad
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada una es un enum CERRADO. Los valores no salen de la imaginación: salen de
// leer los 109 fragmentos distintos que aparecen tras la primera coma en los
// 346 nombres de BEDCA que el catálogo ya ha tocado ("Atún, en aceite,
// enlatado, escurrido"). Añadir un valor obliga a tocar este fichero, igual que
// SHOPPING_AISLES o MAIN_PROTEINS: así es una decisión y no un typo.

/** De qué parte de la pieza. Solo aplica a lo que tiene despiece. */
export const CORTES = [
  "solomillo", "lomo", "pechuga", "muslo", "pierna", "costilla", "chuleta",
  "jarrete", "panceta", "carne", "higado", "hoja", "raiz", "semilla", "grano",
];

/** Cómo llega de la tienda. Es lo que decide si hay que descongelar o remojar. */
export const ESTADOS = [
  "fresco", "congelado", "seco", "remojado", "conserva", "desecado",
  "precocinado", "fiambre",
];

/** En qué líquido viene. Solo aplica a conservas y a lácteos reconstituidos. */
export const MEDIOS = [
  "aceite_oliva", "aceite_girasol", "aceite_soja", "aceite_vegetal",
  "escabeche", "almibar", "salmuera", "agua", "natural", "leche", "mantequilla",
];

/**
 * Qué le ha pasado al alimento. NO es la técnica con la que lo cocina la
 * receta: es el estado en el que BEDCA lo analizó, y por eso cambia los
 * números. Lenteja seca: 24 g de proteína/100 g. Lenteja cocida: 9,5 g.
 */
export const PROCESADOS = [
  "crudo", "hervido", "cocido", "frito", "asado", "plancha", "parrilla",
  "estofado", "ahumado", "tostado", "curado", "fermentado", "infusion",
];

/** La forma física. Es lo que decide si la unidad natural es pieza, peso o volumen. */
export const PRESENTACIONES = [
  "entero", "fileteado", "rodajas", "picado", "triturado", "pure", "polvo",
  "copos", "liquido", "molde", "relleno",
  "pelado", "con_piel", "sin_piel", "con_hueso", "con_cascara",
  "con_grasa", "sin_grasa",
];

/** De dónde viene. BEDCA casi nunca lo dice; se declara para no perderlo cuando sí. */
export const ORIGENES = ["salvaje", "cultivo", "almadraba", "ecologico", "dop"];

export const DIMENSIONES = {
  corte: CORTES,
  estado: ESTADOS,
  medio: MEDIOS,
  procesado: PROCESADOS,
  presentacion: PRESENTACIONES,
  origen: ORIGENES,
};

// ─────────────────────────────────────────────────────────────────────────────
// Familia
// ─────────────────────────────────────────────────────────────────────────────
//
// POR QUÉ NO VALE `category`. El catálogo ya tiene dos campos de agrupación y
// ninguno agrupa alimentos: `aisle` es la estantería del súper y `category` es
// el pasillo. Medido: 209 de 383 ingredientes caen en "Verduras y frutas", y
// ahí dentro conviven Butifarra, Bogavante, Fettuccine, Hojaldre y Tofu.
//
// POR QUÉ NO ES UNA SÉPTIMA COPIA DE LA TAXONOMÍA. El repo ya tiene un
// vocabulario de familia a nivel de RECETA (FAMILIAS de lib/notepadFields.js,
// PROTEIN_GROUP_BY_MAIN_PROTEIN de data/recipeSchema.js). Esta lista es más
// fina porque un ingrediente necesita distinguir lo que un menú semanal no
// (merluza de sardina), pero NO es independiente: GRUPO_POR_FAMILIA la pliega
// sobre ese vocabulario, y un test comprueba que el destino existe allí.
/**
 * DÓNDE ESTÁ EL LÍMITE, porque no es obvio y se puede discutir.
 *
 * `familia` es identidad CULINARIA, no botánica. Por eso `pan`, `pasta`,
 * `embutido`, `queso` y `casqueria` son familias aunque biológicamente sean
 * transformaciones de trigo, leche y carne: en una cocina la pasta es una
 * cosa, no "trigo con forma", y las reglas de variedad de este repo necesitan
 * distinguir pasta de arroz de pan. Purificar el eje hasta lo botánico daría
 * un modelo más elegante y un producto peor.
 *
 * El eje de transformación no falta: ya existe, repartido en las dimensiones
 * `procesado` y `estado`. Lo que NO puede pasar es que un valor de uso
 * —salsa, caldo, bebida— vuelva a entrar aquí: para eso está `rol`.
 *
 * Solape conocido y aceptado: `casqueria` se pisa con la dimensión `corte`
 * (los callos y el hígado son cortes). Se mantienen los dos porque responden
 * a preguntas distintas — `corte` distingue dentro de un animal, `casqueria`
 * agrupa despojos entre animales— y quitar cualquiera de los dos perdería
 * información que alguien usa.
 */
export const FAMILIAS_ALIMENTO = [
  // proteína animal
  "carne_ave", "carne_roja", "carne_cerdo", "carne_caza", "casqueria", "embutido",
  "pescado_blanco", "pescado_azul", "marisco", "cefalopodo", "huevo",
  // lácteos
  "leche", "queso", "lacteo_fermentado", "nata_mantequilla",
  // vegetal
  "verdura_hoja", "verdura_fruto", "verdura_raiz", "verdura_bulbo", "verdura_col",
  // `especia` y `endulzante` se quedan como IDENTIDAD además de ser roles, y
  // no es una recaída en la mezcla: son clases de alimento reconocidas —parte
  // aromática seca de una planta, azúcares— antes que usos. Que un valor
  // exista en los dos vocabularios no los confunde: son campos distintos y
  // responden preguntas distintas sobre la misma fila.
  "seta", "alga", "legumbre", "fruta", "fruto_seco", "especia", "endulzante",
  // fécula
  "cereal", "pasta", "arroz", "pan", "tuberculo",
  // lo que no viene de un ser vivo, y lo que viene de varios
  "mineral", "compuesto",
];

/**
 * El papel que juega en la cocina. ES OTRO PLANO, y tenerlo aparte es la
 * corrección de un error de la primera versión de esta tabla.
 *
 * QUÉ PASÓ. `familia` mezclaba dos preguntas: qué es algo y para qué se usa.
 * Medido: 99 de 383 filas (26 %) llevaban un valor funcional —`salsa`,
 * `caldo`, `grasa`, `bebida`…— que no dice nada de qué son. Y el precio se vio
 * en el tomate, que se partía en tres:
 *
 *     Tomate · Tomate cherry · Tomate triturado   → verdura_fruto
 *     Tomate concentrado · Tomate frito           → salsa
 *     Tomate seco en aceite                       → encurtido
 *
 * Eso rompe justo el caso que `familia` venía a arreglar: "no me gusta el
 * tomate" no casaría con el tomate frito. Y salió también en forma de choque
 * real: `Tomate triturado` comparte ficha de BEDCA con `Tomate` —son el mismo
 * alimento— pero su derivación pedía `salsa` mientras la fila decía
 * `verdura_fruto`. Las dos tenían razón, sobre planos distintos.
 *
 * LA SEÑAL DE QUE EL SPLIT ES EL CORRECTO: con dos campos desaparece el truco
 * de desempate que la versión anterior necesitaba ("la preparación gana al
 * ingrediente que la nombra"). No hacía falta un principio, hacía falta una
 * columna: ya no compiten, porque no responden lo mismo.
 */
export const ROLES = [
  "basico",      // se come como es: la carne, la verdura, la fruta
  "condimento",  // sazona: sal, pimienta, laurel, vinagre
  "salsa",       // acompaña o liga: mayonesa, tomate frito, pesto
  "caldo",       // medio líquido de cocción
  "grasa",       // grasa de cocinado: aceites, manteca
  "endulzante",  // azúcares y siropes
  "bebida",      // se bebe, o entra como líquido alcohólico
  "encurtido",   // conservado en ácido o salmuera
];

/**
 * Familia de alimento → el grupo con el que ya trabajan las reglas de variedad.
 * El destino es el vocabulario de FAMILIAS (lib/notepadFields.js), no uno nuevo.
 * `null` = esta familia no participa del reparto semanal (el aceite no es una
 * "vez por semana"), y eso es un valor legítimo, no un hueco.
 */
export const GRUPO_POR_FAMILIA = {
  carne_ave: "carne", carne_roja: "carne", carne_cerdo: "carne",
  carne_caza: "carne", casqueria: "carne", embutido: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado",
  marisco: "pescado", cefalopodo: "pescado",
  huevo: "huevos",
  legumbre: "legumbres",
  pasta: "pasta_arroz", arroz: "pasta_arroz",
  verdura_hoja: "verdura", verdura_fruto: "verdura", verdura_raiz: "verdura",
  verdura_bulbo: "verdura", verdura_col: "verdura", seta: "verdura", alga: "verdura",
  leche: null, queso: null, lacteo_fermentado: null, nata_mantequilla: null,
  fruta: null, fruto_seco: null, especia: null, endulzante: null, cereal: null,
  pan: null, tuberculo: null, mineral: null, compuesto: null,
};

/**
 * Una familia puede tener cualquier rol —un pollo es `basico` y su caldo es
 * `caldo`— salvo estas dos, que existen precisamente porque el material no
 * tiene identidad biológica y solo se entienden por su uso.
 */
export const ROL_OBLIGATORIO = {
  mineral: null,   // sal (condimento) y agua (bebida) comparten familia
  compuesto: null, // no se restringe: un compuesto puede ser salsa o bebida
};

/**
 * Qué dimensiones tienen sentido en cada familia. Sin esta tabla, "el corte de
 * la harina" sería un hueco a rellenar en vez de una pregunta sin sentido, y el
 * libro de cuentas mediría mal: contaría como pendiente lo que nunca va a
 * existir. Es la diferencia entre `ausente_resoluble` y `no_aplica`.
 */
export const FAMILIA_DIMENSIONES = {
  carne_ave: ["corte", "estado", "procesado", "presentacion", "origen"],
  carne_roja: ["corte", "estado", "procesado", "presentacion", "origen"],
  carne_cerdo: ["corte", "estado", "procesado", "presentacion", "origen"],
  carne_caza: ["corte", "estado", "procesado", "presentacion", "origen"],
  casqueria: ["corte", "estado", "procesado", "presentacion"],
  // `corte` porque la panceta y el lacón son cortes, aunque lleguen curados.
  embutido: ["corte", "estado", "procesado", "presentacion"],
  pescado_blanco: ["corte", "estado", "medio", "procesado", "presentacion", "origen"],
  pescado_azul: ["corte", "estado", "medio", "procesado", "presentacion", "origen"],
  marisco: ["estado", "medio", "procesado", "presentacion", "origen"],
  cefalopodo: ["estado", "medio", "procesado", "presentacion", "origen"],
  huevo: ["estado", "procesado", "presentacion"],
  leche: ["estado", "procesado", "presentacion"],
  queso: ["estado", "procesado", "presentacion", "origen"],
  lacteo_fermentado: ["estado", "procesado", "presentacion"],
  nata_mantequilla: ["estado", "presentacion"],
  verdura_hoja: ["corte", "estado", "procesado", "presentacion", "origen"],
  verdura_fruto: ["estado", "medio", "procesado", "presentacion", "origen"],
  verdura_raiz: ["estado", "procesado", "presentacion", "origen"],
  verdura_bulbo: ["estado", "procesado", "presentacion", "origen"],
  verdura_col: ["estado", "procesado", "presentacion", "origen"],
  seta: ["estado", "medio", "procesado", "presentacion", "origen"],
  alga: ["estado", "presentacion"],
  legumbre: ["estado", "medio", "procesado", "presentacion"],
  fruta: ["estado", "medio", "procesado", "presentacion", "origen"],
  fruto_seco: ["estado", "procesado", "presentacion"],
  cereal: ["estado", "procesado", "presentacion"],
  pasta: ["estado", "procesado", "presentacion"],
  arroz: ["estado", "procesado", "presentacion"],
  pan: ["estado", "procesado", "presentacion"],
  tuberculo: ["estado", "procesado", "presentacion", "origen"],
  grasa: ["origen", "presentacion"],
  // `corte` porque el laurel es la hoja, el sésamo la semilla y la pimienta el
  // grano: en una especia, de qué parte de la planta viene es media identidad.
  especia: ["corte", "estado", "procesado", "presentacion"],
  endulzante: ["estado", "presentacion", "origen"],
  // Sin identidad biológica: sal, agua, bicarbonato. Solo forma y estado.
  mineral: ["estado", "presentacion"],
  // Hecho de varias cosas, así que ninguna dimensión de la materia prima
  // aplica; lo que sí varía es cómo llega y en qué medio.
  compuesto: ["estado", "medio", "procesado", "presentacion"],
};

// ─────────────────────────────────────────────────────────────────────────────
// El libro de cuentas
// ─────────────────────────────────────────────────────────────────────────────
//
// Cuatro estados, y el motivo de que sean cuatro y no dos: "no lo tenemos" y
// "no existe" son cosas distintas, y mezclarlas hace que una tabla al 60 %
// parezca a medio hacer cuando en realidad está terminada. Solo
// `ausente_resoluble` es trabajo pendiente; `ausente_sin_fuente` es trabajo que
// hay que ir a buscar fuera.
export const ESTADOS_LIBRO = [
  "relleno", "no_aplica", "ausente_resoluble", "ausente_sin_fuente",
];

/**
 * Los campos que el libro de cuentas vigila. Un campo sin entrada es un bug.
 *
 * `procedencia` está en la lista y no es un campo de la fila: es el `fuenteId`.
 * Se contabiliza aparte a propósito, porque "tengo el número" y "sé de dónde
 * viene" son dos preguntas distintas y la segunda es la que esta tabla existe
 * para responder. Sin esta entrada, las 23 filas heredadas se contarían como
 * completas.
 */
export const CAMPOS_CONTABLES = [
  "nutricion", "procedencia", "familia", "rol", "taxonomia", "densidad",
  "fraccionComestible",
  "corte", "estado", "medio", "procesado", "presentacion", "origen",
];

// ─────────────────────────────────────────────────────────────────────────────

const NutricionSchema = z.object({
  kcal100g: z.number().nonnegative(),
  protein100g: z.number().nonnegative(),
  carbs100g: z.number().nonnegative(),
  fat100g: z.number().nonnegative(),
  fiber100g: z.number().nonnegative().nullable(),
  sugar100g: z.number().nonnegative().nullable(),
  saturatedFat100g: z.number().nonnegative().nullable(),
  sodium100g: z.number().nonnegative().nullable(),
});

// Una dimensión tiene tres lecturas posibles y las tres son información:
//   "lomo"      → lo sabemos
//   "no_aplica" → la pregunta no tiene sentido en esta familia
//   null        → aplica y NO lo sabemos  ← el único que es deuda
// Por eso null no se sustituye por "" ni por "desconocido": el hueco tiene que
// doler al contarlo. Mismo criterio que `null` ≠ `0` en las magnitudes.
const dimension = (valores) => z.enum([...valores, "no_aplica"]).nullable();

export const AlimentoSchema = z
  .object({
    id: z.string().regex(SLUG_RE, "id debe ser kebab-case (a-z, 0-9, guiones)"),
    nombre: z.string().min(1),

    // ── Procedencia ─────────────────────────────────────────────────────────
    // Lo que el pipeline de hoy tira. `fuenteNombre` se guarda literal, sin
    // limpiar: es la evidencia de la que salen las dimensiones, y una
    // dimensión sin su frase original no se puede auditar.
    // `heredado` no es un eufemismo de "sin fuente": son dos estados distintos
    // y mezclarlos borra información. Medido al construir la tabla: 23 filas
    // traen nutrición que estaba en el catálogo desde antes de que existiera
    // la disciplina de procedencia, y cuya ficha no aparece en ninguno de los
    // tres artefactos del pipeline. El número es real y se usa; lo que falta
    // es de dónde salió. Llamarlo `sin_fuente` diría que no hay dato, que es
    // falso; callarlo diría que está trazado, que también. `heredado` lo deja
    // contado y, con BEDCA respondiendo, resoluble.
    fuente: z.enum(["bedca", "etiqueta", "manual", "heredado", "sin_fuente"]),
    fuenteId: z.string().nullable(),
    fuenteNombre: z.string().nullable(),
    fuenteFecha: z.string().nullable(),

    // ── Plano A: identidad — QUÉ ES ─────────────────────────────────────────
    familia: z.enum(FAMILIAS_ALIMENTO).nullable(),

    // ── Plano C: función — PARA QUÉ SE USA ──────────────────────────────────
    rol: z.enum(ROLES).nullable(),

    taxonomia: z
      .object({
        reino: z.string().min(1),
        clase: z.string().min(1),
        subclase: z.string().min(1),
        especie: z.string().min(1).nullable(),
        variedad: z.string().min(1).nullable(),
      })
      .nullable(),

    dimensiones: z
      .object({
        corte: dimension(CORTES),
        estado: dimension(ESTADOS),
        medio: dimension(MEDIOS),
        procesado: dimension(PROCESADOS),
        presentacion: dimension(PRESENTACIONES),
        origen: dimension(ORIGENES),
      })
      .strict(),

    // ── Plano B: nutrición, por 100 g de PARTE COMESTIBLE ───────────────────
    nutricion: NutricionSchema.nullable(),

    // ── Conversión física (§15) ─────────────────────────────────────────────
    // densidad: 1.776 de 7.586 líneas del catálogo van en ml y hoy se pesan
    // asumiendo 1 g/ml. fraccionComestible: 1 = todo se come; 0,55 en una
    // dorada entera. Las dos son curadas, y por eso empiezan a null.
    densidad: z.number().positive().nullable(),
    fraccionComestible: z.number().min(0).max(1).nullable(),

    // ── Libro de cuentas ────────────────────────────────────────────────────
    huecos: z.record(z.enum(ESTADOS_LIBRO)),
  })
  .strict()
  .superRefine((a, ctx) => {
    // El libro tiene que hablar de TODOS los campos contables y de ninguno más:
    // un libro incompleto miente por omisión, y uno con campos de más miente
    // sobre lo que hay.
    const faltan = CAMPOS_CONTABLES.filter((c) => !(c in a.huecos));
    if (faltan.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `el libro de cuentas no menciona: ${faltan.join(", ")}`,
        path: ["huecos"],
      });
    }
    const sobran = Object.keys(a.huecos).filter((c) => !CAMPOS_CONTABLES.includes(c));
    if (sobran.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `el libro de cuentas habla de campos que no existen: ${sobran.join(", ")}`,
        path: ["huecos"],
      });
    }

    // Y no puede contradecir a la fila. Esta es la comprobación que convierte
    // el libro en un dato fiable en vez de en un comentario: si dice "relleno"
    // el campo tiene que estar, y si dice ausente no puede estar.
    const valorDe = {
      nutricion: a.nutricion, procedencia: a.fuenteId,
      familia: a.familia, rol: a.rol, taxonomia: a.taxonomia,
      densidad: a.densidad, fraccionComestible: a.fraccionComestible,
      ...a.dimensiones,
    };
    for (const [campo, estado] of Object.entries(a.huecos)) {
      const v = valorDe[campo];
      if (estado === "relleno" && (v === null || v === undefined || v === "no_aplica")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `\`${campo}\` se declara relleno y está vacío`,
          path: ["huecos", campo],
        });
      }
      if (estado === "no_aplica" && v !== "no_aplica" && v !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `\`${campo}\` se declara no_aplica y trae valor (${JSON.stringify(v)})`,
          path: ["huecos", campo],
        });
      }
      if (estado.startsWith("ausente") && v !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `\`${campo}\` se declara ausente y trae valor (${JSON.stringify(v)})`,
          path: ["huecos", campo],
        });
      }
    }

    // Una dimensión que no aplica a la familia tiene que decirlo, no quedarse a
    // null: si no, el hueco se cuenta como deuda y la tabla nunca "termina".
    if (a.familia) {
      const aplican = new Set(FAMILIA_DIMENSIONES[a.familia] ?? []);
      for (const [dim, valor] of Object.entries(a.dimensiones)) {
        if (!aplican.has(dim) && valor !== "no_aplica") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `\`${dim}\` no aplica a la familia ${a.familia}: debe ser "no_aplica", no ${JSON.stringify(valor)}`,
            path: ["dimensiones", dim],
          });
        }
      }
    }

    // Procedencia coherente: si hay fuente hay id, y si no la hay no puede
    // haber nutrición. Un número sin de dónde viene es justo el defecto que
    // esta tabla existe para cerrar.
    if (a.fuente === "bedca" && !a.fuenteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fuente bedca sin fuenteId: es el dato que esta tabla existe para no perder",
        path: ["fuenteId"],
      });
    }
    if (a.fuente === "sin_fuente" && a.nutricion !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "trae nutrición sin declarar de dónde sale: si el número es real, la fuente es `heredado`",
        path: ["nutricion"],
      });
    }
    // Al revés también: `heredado` describe un número que existe. Una fila
    // vacía marcada como heredada inventaría una deuda que no hay.
    if (a.fuente === "heredado" && a.nutricion === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`heredado` sin nutrición: no hay nada que heredar, la fuente es `sin_fuente`",
        path: ["fuente"],
      });
    }
  });

/**
 * Valida la tabla entera: cada fila contra el schema, más las invariantes ENTRE
 * filas, que una validación por fila no puede ver.
 *
 * @returns {string[]} errores legibles (vacío si todo es válido)
 */
export function validateAlimentos(alimentos) {
  const errors = [];

  for (const a of alimentos) {
    const result = AlimentoSchema.safeParse(a);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length ? ` (campo: ${issue.path.join(".")})` : "";
        errors.push(`[${a?.id ?? "?"}] ${issue.message}${path}`);
      }
    }
  }

  const vistos = new Set();
  for (const a of alimentos) {
    if (vistos.has(a.id)) errors.push(`Id de alimento duplicado: ${a.id}`);
    vistos.add(a.id);
  }

  // Dos alimentos con la MISMA ficha de BEDCA y las MISMAS dimensiones son la
  // misma fila escrita dos veces: la que se lleve el `alimentoId` de un
  // ingrediente decidiría el número por orden de array.
  const porFicha = new Map();
  for (const a of alimentos) {
    if (!a.fuenteId) continue;
    const clave = `${a.fuenteId}|${Object.values(a.dimensiones).join("|")}`;
    if (porFicha.has(clave)) {
      errors.push(`Misma ficha y mismas dimensiones en dos filas: ${porFicha.get(clave)} y ${a.id}`);
    }
    porFicha.set(clave, a.id);
  }

  return errors;
}
