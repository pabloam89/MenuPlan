/**
 * Los estados temporales de una persona (members[].dietaryStates: «blanda»,
 * «embarazo»…) y lo que cuelga de cada uno (dietaryStatesMeta[estado]: su
 * `hasta`). Al quitar un estado se va también su meta (#958): la app solo
 * cambiaba la lista y dejaba el `hasta` viejo, que el trigger de 0089 seguía
 * copiando a persona_estado si el estado volvía a marcarse.
 *
 * No rediseña la dieta temporal (eso es #959): solo que lista y meta digan lo mismo.
 */

/**
 * La persona con esta lista de estados, y la meta solo de los que quedan.
 * @param {object} m  la persona (members[])
 * @param {string[]} estados
 */
export function conEstadosDieta(m, estados) {
  const lista = [...new Set(estados ?? [])];
  const meta = m?.dietaryStatesMeta && typeof m.dietaryStatesMeta === "object" ? m.dietaryStatesMeta : null;
  const siguen = meta ? Object.fromEntries(Object.entries(meta).filter(([k]) => lista.includes(k))) : null;
  const { dietaryStatesMeta: _fuera, ...resto } = m ?? {};
  return siguen && Object.keys(siguen).length ? { ...resto, dietaryStates: lista, dietaryStatesMeta: siguen } : { ...resto, dietaryStates: lista };
}
