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
  cordero: "carne", pato: "carne", caza: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres",
  huevo: "huevos",
};

/**
 * La categoría que se da por sabida en cada familia. Sirve para explicar los
 * casos en que NO coinciden: una «Crema de tres quesos» cuenta como verdura
 * porque `sopas_cremas` va a verdura, y eso hay que decirlo o parece un fallo.
 */
const CATEGORIA_OBVIA = {
  carne: "carnes",
  pescado: "pescados",
  legumbres: "legumbres",
  huevos: "huevos",
  pasta_arroz: "pasta_arroces",
  verdura: "ensaladas_verduras",
};

/**
 * Cómo se llaman en cristiano, para poder enseñarlo. UNA palabra corta: esto
 * va en una etiqueta dentro de la fila y cada letra se la quita al nombre del
 * plato. «Pescado azul» dejaba el nombre en «Past…»; dentro de la familia
 * «Pescado», «azul» dice lo mismo y cuesta un tercio.
 */
const NOMBRE_PROTEINA = {
  pollo: "pollo", pavo: "pavo", cerdo: "cerdo", ternera: "ternera",
  cordero: "cordero", pato: "pato", caza: "caza",
  pescado_blanco: "blanco", pescado_azul: "azul", marisco: "marisco",
  legumbre: "legumbre", huevo: "huevo",
};
const NOMBRE_CATEGORIA = {
  sopas_cremas: "crema", ensaladas_verduras: "verdura", pasta_arroces: "pasta",
  carnes: "carne", pescados: "pescado", legumbres: "legumbre", huevos: "huevo",
};

/**
 * POR QUÉ este plato cuenta en esta familia, cuando no salta a la vista.
 *
 * Un plato entra en una familia por su categoría, por su proteína, o por las
 * dos. Cuando entra por la proteína y su categoría dice otra cosa —una pasta
 * con bacon cuenta como carne— la lista parece equivocada, y no lo está: está
 * enseñando lo que el motor de verdad cuenta. Así que lo dice.
 *
 * Devuelve `null` cuando es evidente: unos filetes empanados en «Carne» no
 * necesitan que nadie explique nada.
 */
export function motivoDeFamilia(receta, familia) {
  const porCategoria = FAMILIA_POR_CATEGORIA[receta?.category];
  const porProteina = FAMILIA_POR_PROTEINA[receta?.mainProtein];
  if (porCategoria !== familia && porProteina === familia) {
    return NOMBRE_PROTEINA[receta.mainProtein] ?? null;
  }
  if (porCategoria === familia && CATEGORIA_OBVIA[familia] !== receta.category) {
    return NOMBRE_CATEGORIA[receta.category] ?? null;
  }
  return null;
}

/**
 * Las familias que consume un plato. Puede ser más de una, y eso importa.
 *
 * Lo normal es que la receta ya las traiga: `recipeCatalog` las pega desde
 * `derived/recipeFamilias.json`, donde se calcularon por MASA (ver
 * lib/derive/familias.js). Eso es lo que separa una pasta con bacon al 12 %
 * de unos filetes al 33 %, y lo que saca a la familia «verdura» de `category`,
 * que describe el formato y no de qué está hecho el plato.
 *
 * Los dos mapas de abajo son el RESPALDO, para lo que no tiene fila: una
 * receta de usuario, una recién llegada de Supabase. Dan una respuesta peor
 * —binaria y por cajón— pero dan una.
 */
export function familiasDe(receta) {
  if (Array.isArray(receta?.familias)) return new Set(receta.familias);
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
 *
 * Además del recuento devuelve los platos en DOS formas, y la diferencia
 * importa:
 *
 *   · `platosPorFamilia` — para abrir una fila y ver de qué se compone su
 *     número. Un plato puede salir en DOS familias: un arroz a la cubana es
 *     pasta_arroz y huevos a la vez, y así lo cuenta `familiasDe`.
 *   · `platos` — la lista plana, cada plato UNA vez. Es la que hay que usar
 *     para cualquier total de la semana: sumar `platosPorFamilia` contaría dos
 *     veces todo lo que pertenece a dos familias.
 *
 * Cada plato trae su día, su franja y sus macros por ración.
 *
 * Los macros salen de la receta de catálogo, donde `recipeCatalog.js` ya los
 * ha dejado POR RACIÓN. Solo se copian los cuatro que están al 100% en las
 * 1033 recetas; el azúcar, por ejemplo, está al 58% y enseñarlo sería
 * prometer un dato que no se tiene.
 */
export function recuentoDelMenu(plan, catalogoPorId) {
  const familias = {};
  const platos = [];
  const platosPorFamilia = {};
  const cocinas = {};
  const tecnicas = {};
  let huecos = 0;

  for (const [groupId, slots] of Object.entries(plan ?? {})) {
    if (groupId.startsWith("_") || !slots || typeof slots !== "object") continue;
    for (const [clave, slot] of Object.entries(slots)) {
      const ids = [slot?.firstRecipeId, slot?.recipeId].filter(Boolean);
      if (ids.length) huecos++;
      const corte = String(clave).indexOf("-");
      const dia = corte > 0 ? clave.slice(0, corte) : "";
      const comida = corte > 0 ? clave.slice(corte + 1) : "";
      for (const id of ids) {
        // Con varios menús el id lleva prefijo de grupo ("g1__carnes_007"); el
        // catálogo se indexa por el id pelado.
        const base = id.includes("__") ? id.split("__").slice(1).join("__") : id;
        const receta = catalogoPorId?.[base];
        if (!receta) continue;
        const ficha = {
          id: base, nombre: receta.name, dia, comida,
          kcal: receta.kcal ?? null,
          protein_g: receta.protein_g ?? null,
          carbs_g: receta.carbs_g ?? null,
          fat_g: receta.fat_g ?? null,
          fiber_g: receta.fiber_g ?? null,
          grupo: groupId,
        };
        platos.push(ficha);
        for (const f of familiasDe(receta)) {
          familias[f] = (familias[f] ?? 0) + 1;
          // Una copia por familia: el mismo plato puede estar en dos y el
          // motivo por el que está en cada una no es el mismo.
          (platosPorFamilia[f] ??= []).push({ ...ficha, motivo: motivoDeFamilia(receta, f) });
        }
        if (receta.cocina) cocinas[receta.cocina] = (cocinas[receta.cocina] ?? 0) + 1;
        if (receta.tecnica) tecnicas[receta.tecnica] = (tecnicas[receta.tecnica] ?? 0) + 1;
      }
    }
  }

  return { familias, platos, platosPorFamilia, cocinas, tecnicas, huecos };
}
