/**
 * Cliente del webservice interno de BEDCA (Base de Datos Española de
 * Composición de Alimentos, https://www.bedca.net) — sin API pública, pero
 * con un endpoint XML (`procquery.php`) que llevan usando librerías de
 * terceros en Python/PHP/Java desde hace años. Mismo patrón que
 * mercadonaFetch.mjs contra el endpoint no documentado de Mercadona.
 *
 * Protocolo confirmado a mano contra el servidor real (Fase 9, spike):
 *   POST https://www.bedca.net/bdpub/procquery.php
 *   Content-Type: text/xml
 *   body: XML `<foodquery>` — `type level` decide qué se consulta:
 *     level="1" → lista de alimentos (con <condition> opcional, p.ej.
 *                 f_ori_name LIKE '%término%' para buscar por nombre)
 *     level="2" → valores nutricionales de UN alimento (<condition> f_id
 *                 EQUAL <id>) — el valor real está en <best_location>, NO en
 *                 <v_n>/<stdv>/<min>/<max> (esos son metadatos estadísticos)
 *     level="3" → grupos de alimentos (sin usar aquí)
 *   La respuesta siempre trae además un <componentList> con el catálogo
 *   completo de nutrientes posibles — no filtrado al alimento consultado,
 *   así que no sirve para saber qué valores tiene ESTE alimento en concreto.
 */

const ENDPOINT = "https://www.bedca.net/bdpub/procquery.php";

// c_id de BEDCA para los 8 campos que nos interesan (confirmados en el spike
// contra "Pollo, pechuga, con piel, crudo" f_id=994 y "Manzana" f_id=1707).
// energía viene en kJ — se convierte a kcal al vuelo (÷4.184, factor estándar).
// azúcares (446) existe como componente pero su cobertura es dispersa incluso
// dentro de BEDCA — null es el resultado esperado y correcto para muchos
// alimentos, no un fallo de la consulta.
export const BEDCA_COMPONENT_IDS = {
  energyKJ: 409,
  protein: 416,
  fat: 410,
  carbs: 53,
  fiber: 307,
  sugar: 446,
  saturatedFat: 299,
  sodium: 323,
};

const KJ_PER_KCAL = 4.184;

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

async function postXml(xml) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new Error(`BEDCA ${res.status}`);
  return res.text();
}

/** Extrae todos los <food>…</food> de nivel 1 (id + nombre) de una respuesta XML, sin dependencias de parseo XML completo. */
function parseFoodList(xml) {
  const foods = [];
  const foodRe = /<food>(.*?)<\/food>/gs;
  let m;
  while ((m = foodRe.exec(xml)) !== null) {
    const block = m[1];
    const id = block.match(/<f_id>(\d+)<\/f_id>/)?.[1];
    const name = block.match(/<f_ori_name>([^<]*)<\/f_ori_name>/)?.[1];
    if (id && name) foods.push({ id: Number(id), name: name.trim() });
  }
  return foods;
}

/** Extrae los <foodvalue>…</foodvalue> del ÚNICO <food> de una respuesta de nivel 2 (no confundir con <componentList>, que es el catálogo completo). */
function parseFoodValues(xml) {
  const foodBlock = xml.match(/<food>(.*?)<\/food>/s)?.[1] ?? "";
  const values = new Map();
  const valueRe = /<foodvalue>(.*?)<\/foodvalue>/gs;
  let m;
  while ((m = valueRe.exec(foodBlock)) !== null) {
    const block = m[1];
    const cId = Number(block.match(/<c_id>(\d+)<\/c_id>/)?.[1]);
    const raw = block.match(/<best_location>([^<]*)<\/best_location>/)?.[1];
    const value = raw != null && raw.trim() !== "" ? Number(raw.trim()) : null;
    if (Number.isFinite(cId)) values.set(cId, Number.isFinite(value) ? value : null);
  }
  return values;
}

/**
 * Busca alimentos cuyo nombre contenga `term` (case-insensitive, LIKE de SQL
 * por debajo — BEDCA hace su propia normalización de acentos/mayúsculas).
 * @param {string} term
 * @returns {Promise<{id: number, name: string}[]>}
 */
export async function searchFoodByName(term) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<foodquery>
    <type level="1"/>
    <selection>
        <atribute name="f_id"/>
        <atribute name="f_ori_name"/>
    </selection>
    <condition>
        <cond1><atribute1 name="f_ori_name"/></cond1>
        <relation type="LIKE"/>
        <cond3>${escapeXml(term)}</cond3>
    </condition>
</foodquery>`;
  return parseFoodList(await postXml(xml));
}

/**
 * Nutrición por 100g de un alimento BEDCA, en el shape de
 * `IngredientSchema.nutrition` (Fase 9). `null` en un campo significa que
 * BEDCA no tiene ese componente relleno para este alimento concreto — no es
 * un error, es exactamente lo que la app espera poder representar.
 * @param {number} foodId
 * @returns {Promise<import("../../src/data/ingredientSchema.js").IngredientSchema["nutrition"] | null>}
 */
export async function getFoodNutrition(foodId) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<foodquery>
    <type level="2"/>
    <selection>
        <atribute name="c_id"/>
        <atribute name="best_location"/>
    </selection>
    <condition>
        <cond1><atribute1 name="f_id"/></cond1>
        <relation type="EQUAL"/>
        <cond3>${Number(foodId)}</cond3>
    </condition>
</foodquery>`;
  const values = parseFoodValues(await postXml(xml));
  if (values.size === 0) return null;

  const energyKJ = values.get(BEDCA_COMPONENT_IDS.energyKJ);
  const protein = values.get(BEDCA_COMPONENT_IDS.protein);
  const fat = values.get(BEDCA_COMPONENT_IDS.fat);
  const carbs = values.get(BEDCA_COMPONENT_IDS.carbs);
  // Sin los 4 macros principales, la fila no sirve — mejor null explícito que
  // una nutrición a medias que parezca completa.
  if (energyKJ == null || protein == null || fat == null || carbs == null) return null;

  return {
    kcal100g: Math.round((energyKJ / KJ_PER_KCAL) * 10) / 10,
    protein100g: protein,
    carbs100g: carbs,
    fat100g: fat,
    fiber100g: values.get(BEDCA_COMPONENT_IDS.fiber) ?? null,
    sugar100g: values.get(BEDCA_COMPONENT_IDS.sugar) ?? null,
    saturatedFat100g: values.get(BEDCA_COMPONENT_IDS.saturatedFat) ?? null,
    sodium100g: values.get(BEDCA_COMPONENT_IDS.sodium) ?? null,
  };
}
