/**
 * Casquería: qué platos la llevan, para que no caigan un martes.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * El motor sabía de proteínas, categorías, bases y raciones, pero no sabía que
 * un hígado encebollado no es un filete de pollo. Le salió de cena entre
 * semana, que es exactamente donde no va: la casquería se come cuando se
 * elige, no cuando toca. No es una cuestión de gusto discutible —hay a quien
 * le encanta— sino de CUÁNDO: un guiso de callos es un plan de domingo, y
 * ninguna de las reglas que había sabía distinguir el día.
 *
 * ── Cómo se decide ────────────────────────────────────────────────────────
 * Igual que `aporte` (lib/aporte.js): se DERIVA de los ingredientes, no se
 * escribe a mano plato a plato. El catálogo crece y una lista escrita a mano
 * se queda vieja en silencio; una derivación se queda mal una vez y se
 * arregla para todos.
 *
 * Se mira el ingrediente y también el nombre, porque hay platos que llevan la
 * casquería en el título y disuelta en el guiso ("Arroz meloso de rabo de
 * toro"). Un plato declara `casqueria` en su ficha si hay que corregir la
 * derivación en un caso concreto.
 */

/**
 * Las vísceras y despojos, con frontera de palabra. Sin `\b` "lengua" casaba
 * dentro de otras palabras y "morro" dentro de "morrón" (el pimiento).
 */
const CASQUERIA = [
  "higado", "hígado", "callos", "molleja", "mollejas", "riñon", "riñones", "riñón",
  "sesos", "lengua", "manitas", "oreja", "morro", "rabo de toro", "rabo de buey",
  "asadura", "criadillas", "tripas", "chicharrones", "casqueria", "casquería",
  "morcilla", "sangrecilla",
];

/**
 * Lo que PARECE casquería y no lo es. Va aparte y con su motivo, porque una
 * derivación sin excepciones declaradas se corrige tocando la lista de arriba
 * y rompiendo otra cosa.
 *
 *   · entraña: es un corte de músculo (falda), no una víscera. La cazaba
 *     "entraña" por parecido con "entrañas".
 */
const NO_ES_CASQUERIA = ["entraña", "entrana"];

const normalizar = (texto) =>
  String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function compilar(palabras) {
  const escapadas = palabras.map((p) => normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(^|[^a-z0-9])(${escapadas.join("|")})([^a-z0-9]|$)`, "i");
}

const RE_CASQUERIA = compilar(CASQUERIA);
const RE_NO = compilar(NO_ES_CASQUERIA);

/**
 * ¿Este plato lleva casquería?
 *
 * @param {object} receta
 * @returns {boolean}
 */
export function esCasqueria(receta) {
  if (!receta) return false;
  // Lo declarado manda sobre lo derivado, igual que en `aporte`.
  if (typeof receta.casqueria === "boolean") return receta.casqueria;

  const nombre = normalizar(receta.name);
  if (RE_CASQUERIA.test(nombre) && !RE_NO.test(nombre)) return true;

  for (const ing of receta.ingredients ?? []) {
    const texto = normalizar(ing?.name ?? ing?.ingredientId ?? "");
    if (!texto) continue;
    if (RE_NO.test(texto)) continue;
    if (RE_CASQUERIA.test(texto)) return true;
  }
  return false;
}
