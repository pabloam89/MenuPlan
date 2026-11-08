/**
 * Buscar por significado con embeddings: cada receta se describe una vez en
 * prosa (lo que es, con qué se hace, cómo es) y se convierte en un vector; una
 * petición («algo de cuchara para el frío») se convierte en otro, y las
 * recetas más cercanas son las que encajan. Sin modelo que piense: comparar
 * 743 vectores en memoria es ~1 ms; lo único que cuesta es vectorizar la frase.
 *
 * Los vectores del catálogo van en el bundle, como el catálogo: no hace falta
 * base de datos para 743 recetas. Lo que un vector NO entiende es el «no»
 * («que no sea pescado» queda cerca de «pescado»): las negaciones se aplican
 * después como filtros, que ya existen.
 */

const CARPETA = {
  legumbres: "legumbres", carnes: "carne", pescados: "pescado", huevos: "huevos",
  pasta_arroces: "pasta y arroz", sopas_cremas: "sopa o crema", ensaladas_verduras: "ensalada o verduras",
  cenas_rapidas: "cena rápida", bebes: "plato para bebé", desayunos: "desayuno", meriendas: "merienda", postres: "postre",
};
const TECNICA = { olla: "guisado en olla", crudo: "sin cocinar", horno: "al horno", sarten: "a la sartén", plancha: "a la plancha" };
const TEXTURA = { cuchara: "plato de cuchara", tenedor: "de tenedor", mano: "para comer con la mano" };
const PESCADO_AZUL = /\b(sardinas?|salmon|caballa|atun|boquerones?|bonito|jurel|anchoas?|arenque|trucha)\b/;
const ingredientesSinTilde = (r) => (r.ingredients ?? []).map((i) => i?.name ?? "").join(" ").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const TEMPERATURA = { caliente: "se come caliente", frio: "se come frío", templado: "se come templado" };

/**
 * La receta en una frase o dos, en español llano, que es como pregunta la
 * gente. Pura y estable: si cambia, hay que volver a vectorizar el catálogo.
 */
export function textoDeReceta(r) {
  const ingredientes = (r.ingredients ?? []).map((i) => i?.name).filter(Boolean).slice(0, 8);
  const roles = r.mealRole ?? [];
  const rasgos = [
    // Cómo lo dice la gente: «algo rápido», «para cenar», «de picoteo», «pescado azul».
    r.time && r.time <= 20 ? "rápido, en un momento" : r.time >= 60 ? "lleva su tiempo" : "",
    roles.includes("plato_unico") ? "plato único, completo, que llena" : "",
    roles.includes("cena") ? "bueno para cenar" : "",
    r.textura === "mano" ? "de picoteo" : "",
    PESCADO_AZUL.test(ingredientesSinTilde(r)) ? "pescado azul" : "",
    TEXTURA[r.textura], TEMPERATURA[r.temperatura], TECNICA[r.tecnica],
    ...(r.connotacion ?? []), ...(r.sabor ?? []),
    r.picante && r.picante !== "no" ? "picante" : "",
    r.caloriasNivel === "ligero" ? "ligero" : r.caloriasNivel === "contundente" ? "contundente" : "",
    r.costeNivel === "economico" ? "barato" : "",
    r.kidFriendly ? "gusta a los niños" : "", r.tupperFriendly ? "va bien en táper" : "",
    r.freezable ? "se puede congelar" : "", r.occasion === "especial" ? "para ocasiones especiales" : "",
  ].filter(Boolean);
  const frase = (s) => {
    const t = String(s ?? "").trim().replace(/[.\s]+$/, "");
    return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : "";
  };
  return [
    frase(r.name),
    frase(r.description),
    frase(`${CARPETA[r.category] ?? r.category ?? ""}${r.time ? `, ${r.time} minutos` : ""}`),
    ingredientes.length ? frase(`lleva ${ingredientes.join(", ").toLowerCase()}`) : "",
    frase(rasgos.join(", ")),
  ].filter(Boolean).join(" ");
}

/** Producto escalar: los vectores llegan normalizados, así que es el coseno. */
export function coseno(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalizar(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/**
 * Los `n` más cercanos a `consulta`, de más a menos.
 * @param {number[]} consulta  vector normalizado
 * @param {{ ids: string[], vectores: number[][] }} indice
 * @returns {{ id: string, parecido: number }[]}
 */
export function masCercanos(consulta, { ids, vectores }, n = 8) {
  return vectores
    .map((v, i) => ({ id: ids[i], parecido: coseno(consulta, v) }))
    .sort((a, b) => b.parecido - a.parecido)
    .slice(0, n);
}
