/**
 * La taxonomía de un alimento (clase → subclase → especie), traducida a los
 * vocabularios de la receta: `mainProtein` y el tipo de hidrato.
 *
 * Puras y sin dependencias: las usan la composición del plato (composicion.js)
 * y el diccionario de sinónimos (sinonimos.js), que no debe cargar el catálogo.
 */

/** clase/subclase/especie → el vocabulario de `mainProtein`. */
export function ejeProteina(t) {
  if (!t) return null;
  const { clase, subclase, especie } = t;
  if (clase === "ave") {
    if (subclase === "huevo") return "huevo";
    if (especie === "pavo") return "pavo";
    if (especie === "pato") return "pato";
    if (especie === "codorniz" || especie === "perdiz") return "caza";
    return "pollo";
  }
  if (clase === "pez") return subclase;                  // pescado_blanco | pescado_azul
  if (clase === "marisco" || clase === "cefalopodo") return "marisco";
  if (clase === "mamifero") {
    if (subclase === "carne_cerdo") return "cerdo";
    if (subclase === "carne_roja") return especie === "cordero" ? "cordero" : "ternera";
    if (subclase === "carne_caza") return "caza";
    // El pastrami es ternera: la transformación es atributo, no posición.
    if (subclase === "embutido") return especie === "pastrami" ? "ternera" : "cerdo";
  }
  // Una víscera compite como su animal: unos callos son ternera. La especie la
  // resuelve el árbol (HEREDA_ESPECIE_DE en scripts/lib/taxonomia.mjs).
  if (clase === "viscera") return especie === "cerdo" || especie === "ternera" ? especie : null;
  if (clase === "legumbre") return "legumbre";
  if (clase === "lacteo") return "lacteo";               // clase CONDICIONAL, ver dominante()
  return null;
}

/** clase/subclase/especie → el vocabulario de `carbType` (validateMenu.js). */
export function ejeHidrato(t) {
  if (!t) return null;
  const { clase, subclase, especie } = t;
  if (clase === "cereal") {
    if (subclase === "arroz") return "arroz";
    if (subclase === "pasta") return "pasta";
    if (subclase === "pan") return "pan";
    if (especie === "avena") return "avena";
    if (especie === "quinoa") return "quinoa";
    if (especie === "cuscu") return "cuscus";
    return null;                                          // harina, levadura, maicena
  }
  if (clase === "hortaliza" && subclase === "tuberculo") return "patatas";
  return null;
}
