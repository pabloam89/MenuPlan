/**
 * Lo que hay en el menú de esta semana, contado.
 *
 * Es la entrada que esperan `sugerenciasDelMenu` y `contextoParaElModelo`
 * (lib/panelSuggestions.js), y que hasta ahora se construía a mano en el
 * playground del panel: su docstring decía "ya contado por quien lo tiene a
 * mano" y no había nadie que lo tuviera. Esto es ese alguien.
 *
 * Con esto, la burbuja del bot abre YA sabiendo lo que hay en tu semana —
 * "menos pescado" solo se ofrece si de verdad hay pescado— y eso compra más
 * confianza que cualquier respuesta del modelo, sin gastar una llamada.
 */

// El mapeo familia ← (category, mainProtein). Es el MISMO que enumera el
// prompt del planner en api/_prompts.js, y tiene que seguir siéndolo: si aquí
// un arroz con pollo contara como carne y allí como pasta_arroz, el bot
// sugeriría bajar algo que el planner cree que ya está bajo.
const FAMILIA_POR_CATEGORIA = {
  carnes: "carne",
  pescados: "pescado",
  legumbres: "legumbres",
  huevos: "huevos",
  pasta_arroces: "pasta_arroz",
  ensaladas_verduras: "verdura",
  sopas_cremas: "verdura",
};

const FAMILIA_POR_PROTEINA = {
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres",
  huevo: "huevos",
};

/** Las familias que consume un plato. Puede ser más de una, y eso importa. */
function familiasDe(receta) {
  const familias = new Set();
  const porCategoria = FAMILIA_POR_CATEGORIA[receta?.category];
  if (porCategoria) familias.add(porCategoria);
  const porProteina = FAMILIA_POR_PROTEINA[receta?.mainProtein];
  // Un "Arroz a la cubana" es pasta_arroz Y huevos a la vez, y gasta las dos
  // cuotas de golpe: contarlo en una sola dejaría al bot ciego a la mitad de
  // lo que la casa está comiendo.
  if (porProteina) familias.add(porProteina);
  return familias;
}

/**
 * @param {object} plan            el menuPlan vivo (`{ [groupId]: { "Lun-Comida": slot } }`)
 * @param {object} catalogoPorId   recipeCatalogById, para mirar los ejes del plato
 *
 * Se cuenta sobre el CATÁLOGO y no sobre la receta ya hidratada porque
 * `catalogToFrontendRecipe` no arrastra `tecnica` ni `cocina` — solo deja
 * `tags: [category, mainProtein]`, que llega para las familias y no para los
 * otros dos ejes.
 */
export function recuentoDelMenu(plan, catalogoPorId) {
  const familias = {};
  const cocinas = {};
  const tecnicas = {};
  let huecos = 0;

  for (const [groupId, slots] of Object.entries(plan ?? {})) {
    if (groupId.startsWith("_") || !slots || typeof slots !== "object") continue;
    for (const slot of Object.values(slots)) {
      const ids = [slot?.firstRecipeId, slot?.recipeId].filter(Boolean);
      if (ids.length) huecos++;
      for (const id of ids) {
        // Con varios menús el id lleva prefijo de grupo ("g1__carnes_007"); el
        // catálogo se indexa por el id pelado.
        const base = id.includes("__") ? id.split("__").slice(1).join("__") : id;
        const receta = catalogoPorId?.[base];
        if (!receta) continue;
        for (const f of familiasDe(receta)) familias[f] = (familias[f] ?? 0) + 1;
        if (receta.cocina) cocinas[receta.cocina] = (cocinas[receta.cocina] ?? 0) + 1;
        if (receta.tecnica) tecnicas[receta.tecnica] = (tecnicas[receta.tecnica] ?? 0) + 1;
      }
    }
  }

  return { familias, cocinas, tecnicas, huecos };
}
