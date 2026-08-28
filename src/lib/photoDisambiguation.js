/**
 * Extra guidance for dish names that generative models routinely misread.
 * @param {string} dishName
 * @returns {string}
 */
export function disambiguationClause(dishName) {
  const d = String(dishName).toLowerCase();
  const clauses = [];

  const hasTomate = /\btomate\b/.test(d);
  const isSalad = /ensalada|gazpacho|tomate fresco|tomate natural/.test(d);
  const isRice = /\barroz\b|risotto|paella/.test(d);
  const isPasta = /pasta|macarrones|espagueti|fideos|ñoquis|noquis|lasaña|tallarines|ravioli/.test(d);

  if (hasTomate && isRice && !isSalad && !isPasta) {
    clauses.push(
      `El tomate es salsa de tomate frito COCINADA, roja y brillante, en cantidad MODERADA ` +
        `sobre arroz blanco suelto: se ven claramente los granos de arroz alrededor y por debajo, ` +
        `la salsa NO cubre todo el bol ni forma una capa gruesa y uniforme; ` +
        `presentación casera, ligera y apetitosa. NO tomate crudo en dados ni rodajas frescas. `,
    );
  }

  if (hasTomate && isPasta && !isSalad) {
    clauses.push(
      `El tomate es salsa de tomate COCINADA roja, mezclada con PASTA (macarrones tubulares cortos, ` +
        `espaguetis o fideos — NO arroz): se ven claramente los trozos de pasta cubiertos de salsa, ` +
        `presentación casera en bol hondo. PROHIBIDO arroz blanco, PROHIBIDO granos sueltos, ` +
        `PROHIBIDO tomate crudo en dados. `,
    );
  }

  if (/patatas fritas/.test(d)) {
    clauses.push(
      `Las patatas fritas son OBLIGATORIAS y bien visibles: bastones alargados de patata ` +
        `fritos, dorados y crujientes, tipo patatas fritas caseras clásicas, apiladas junto al ` +
        `plato principal ocupando buena parte del bol. NADA de salsa de yogur, NADA de pepino, ` +
        `NADA de crema blanca ni tzatziki. `,
    );
  }

  // Postre de super: vasito de yogur procesado de frutas, no bol artesanal de yogur griego.
  if (/yogur de sabores|yogur de frutas/.test(d) && !/natural|casero|griego|miel|avena|bizcocho/.test(d)) {
    clauses.push(
      `Es un yogur PROCESADO de supermercado en vasito individual de plástico ya abierto, ` +
        `contenido rosa frambuesa/fresa bien visible con textura cremosa homogénea de yogur batido comercial. ` +
        `PROHIBIDO yogur artesanal en cuenco de barro, PROHIBIDO yogur griego espeso blanco, ` +
        `PROHIBIDO granola ni fruta fresca entera encima. `,
    );
  }

  // Tarta de queso al horno (base galleta + queso crema), no albóndigas ni bolitas saladas.
  if (/\btarta de queso\b/.test(d) && !/tarta de lim[oó]n/.test(d)) {
    clauses.push(
      `Es una tarta de queso CASERA al horno, redonda entera dentro del bol, con base de galleta ` +
        `maría dorada visible en el borde y relleno cremoso blanco-amarillo de queso crema cuajado. ` +
        `Presentación igual que una tarta redonda casera (como tarta de limón), NO porción triangular suelta. ` +
        `PROHIBIDO albóndigas, PROHIBIDO bolitas de patata, PROHIBIDO comida salada, PROHIBIDO plato plano aparte. `,
    );
  }

  // Tortilla española (patatas/calabacín/espinacas/boletus...), NO "tortilla
  // francesa" (esa sí va doblada, es correcto) ni "tortilla wrap"/de trigo
  // (harina, no huevo) ni un bocadillo QUE lleva tortilla dentro.
  const isSpanishTortilla =
    /\btortilla\b/.test(d) && !/tortilla francesa|tortilla wrap|bocadillo/.test(d);
  if (isSpanishTortilla) {
    clauses.push(
      `Es una tortilla española REDONDA y GRUESA, servida entera en el bol pero con UNA porción/cuña ` +
        `ya cortada y ligeramente separada o levantada hacia arriba, dejando ver el corte transversal: ` +
        `el interior jugoso y cuajado, con las capas visibles del relleno (patata, cebolla, verdura u otro ` +
        `ingrediente mencionado en el nombre del plato) bien diferenciadas por dentro, no solo por encima. ` +
        `PROHIBIDO mostrarla doblada por la mitad en forma de media luna cerrada como una tortilla francesa; ` +
        `PROHIBIDO mostrarla entera sin ningún corte que revele el interior. `,
    );
  }

  const conIdx = d.indexOf(" con ");
  const isCombo = conIdx !== -1;
  const garnishPart = isCombo ? d.slice(conIdx + 5).trim() : "";
  // "Macarrones con tomate", "Arroz con atún" — the second part is sauce/filling, not a side.
  const isSauceCompanion = /^(tomate|atún|atun|queso|nata|champiñones|champinones|setas|verduras|salsa|atún en conserva|atun en conserva)$/.test(garnishPart);
  const isArrozGarnish = /\barroz\b|risotto|paella/.test(garnishPart);

  if (/a la plancha/.test(d) && !isCombo) {
    clauses.push(
      `Este plato va SOLO a la plancha, sin guarnición ni acompañamiento: ` +
        `PROHIBIDO arroz blanco, pasta, patatas u otro cereal/hidrato de fondo. ` +
        `Solo la proteína o verdura a la plancha en el bol, sin base de arroz debajo. `,
    );
  }

  if (isSpanishTortilla) {
    // "Tortilla de patatas con cebolla caramelizada": lo que sigue a "con" es
    // relleno DENTRO de la tortilla, no una guarnición aparte en el bol — no
    // aplican las reglas genéricas de combo de abajo.
  } else if (isCombo && isArrozGarnish) {
    clauses.push(
      `OBLIGATORIO: arroz blanco suelto visible como guarnición, claramente distinguible del plato principal. `,
    );
  } else if (isCombo && !isSauceCompanion) {
    const garnishLabel = String(dishName).slice(String(dishName).toLowerCase().indexOf(" con ") + 5);
    clauses.push(
      `La guarnición es "${garnishLabel}" — debe verse claramente como acompañamiento separado. ` +
        `PROHIBIDO añadir arroz blanco u otra guarnición no mencionada en el nombre. `,
    );
  }

  return clauses.join("");
}
