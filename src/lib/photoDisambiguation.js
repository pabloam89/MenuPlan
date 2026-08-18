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
  const isStarch = /arroz|pasta|macarrones|espagueti|fideos|ñoquis|noquis/.test(d);
  if (hasTomate && isStarch && !isSalad) {
    clauses.push(
      `El tomate es salsa de tomate frito COCINADA, roja y brillante, en cantidad MODERADA ` +
        `sobre arroz blanco suelto: se ven claramente los granos de arroz alrededor y por debajo, ` +
        `la salsa NO cubre todo el bol ni forma una capa gruesa y uniforme; ` +
        `presentación casera, ligera y apetitosa. NO tomate crudo en dados ni rodajas frescas. `,
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

  const conIdx = d.indexOf(" con ");
  const isCombo = conIdx !== -1;
  const garnishPart = isCombo ? d.slice(conIdx + 5) : "";
  const isArrozGarnish = /\barroz\b|risotto|paella/.test(garnishPart);

  if (/a la plancha/.test(d) && !isCombo) {
    clauses.push(
      `Este plato va SOLO a la plancha, sin guarnición ni acompañamiento: ` +
        `PROHIBIDO arroz blanco, pasta, patatas u otro cereal/hidrato de fondo. ` +
        `Solo la proteína o verdura a la plancha en el bol, sin base de arroz debajo. `,
    );
  }

  if (isCombo && isArrozGarnish) {
    clauses.push(
      `OBLIGATORIO: arroz blanco suelto visible como guarnición, claramente distinguible del plato principal. `,
    );
  } else if (isCombo) {
    const garnishLabel = String(dishName).slice(String(dishName).toLowerCase().indexOf(" con ") + 5);
    clauses.push(
      `La guarnición es "${garnishLabel}" — debe verse claramente como acompañamiento separado. ` +
        `PROHIBIDO añadir arroz blanco u otra guarnición no mencionada en el nombre. `,
    );
  }

  return clauses.join("");
}
