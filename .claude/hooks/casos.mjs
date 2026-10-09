/**
 * casos.mjs — la línea «Casos:» del cuerpo de un PR (#185).
 *
 * Por qué: «Cuando algo falla: hasta el problema de fondo» (CLAUDE.md) era solo
 * texto. El 9 oct 2026 una sesión de siete PR arregló fallos con su test y no
 * registró ninguno hasta que Pablo lo preguntó. Ahora cada PR dice, en una
 * línea, qué casos (issues `tipo:caso`) deja registrados o por qué no hay:
 *
 *   Casos: #301, #305
 *   Casos: #12 (el test rojo)     ← el texto tras la lista se admite; solo cuentan los números
 *   Casos: ninguno — solo mueve ficheros de sitio, no se ha visto ningún fallo
 *
 * La misma lógica la usan la guardia (al abrir el PR, solo la forma, sin red) y
 * el CI (`scripts/casos-pr.mjs`, además contra la API). Una sola fuente.
 */

/** Longitud mínima del motivo de «ninguno»: «n/a» o «nada» no es un motivo. */
export const MIN_MOTIVO = 25;
const MIN_PALABRAS = 4;
/** Tope de casos por PR y número de issue más alto que se acepta. */
export const MAX_CASOS = 20;
export const MAX_NUMERO = 10_000_000;

export const AYUDA =
  "Añade al cuerpo del PR una línea «Casos: #n, #m» con los issues `tipo:caso` que has registrado " +
  "(`npm run issues -- --nuevo \"…\" --tipo caso --analisis <…> --area <…> --cuerpo <f.md> --padre <fondo>`; " +
  "cada fallo del camino —test rojo que no era tuyo, dato falso copiado, vigilante que bloqueó algo bueno, cosa del entorno— es un caso), " +
  `o «Casos: ninguno — <por qué no ha habido ningún fallo, al menos ${MIN_MOTIVO} caracteres>».`;

/** Quita los comentarios HTML (la plantilla explica la línea) y los bloques de código. */
export function limpiarCuerpo(cuerpo) {
  return String(cuerpo ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$(?![\s\S]))/gm, "");
}

/**
 * Las líneas «Casos:» del cuerpo, TODAS válidas (con que una valga, otra rota
 * colaba). `enComando`: el texto es el comando entero (`gh pr create --body "…"`),
 * donde la línea puede empezar tras una comilla y acabar en ella.
 * → {valida, numeros:[n…], ninguno:boolean, motivo?}
 */
export function analizarCasos(cuerpo, { enComando = false } = {}) {
  const texto = limpiarCuerpo(cuerpo);
  const re = enComando
    ? /(?:^|[\s"'(])Casos[ \t]*:[ \t]*(.*)$/gim
    : /^[ \t>*-]*(?:\*\*)?Casos(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/gim;
  const lineas = [...texto.matchAll(re)].map((m) => (enComando ? m[1].replace(/["')\s]+$/, "") : m[1].trim()));
  if (!lineas.length) return { valida: false, motivo: "Falta la línea «Casos:» en el cuerpo del PR." };

  const numeros = [];
  let ninguno = false;
  for (const entera of lineas) {
    // Tope de largo: una línea de megas no debe costar tiempo de regex, ni
    // esconder números más allá de lo que se mira.
    if (entera.length > 2000) return { valida: false, motivo: "La línea «Casos:» es demasiado larga (más de 2000 caracteres)." };
    const crudo = entera;
    if (!crudo) return { valida: false, motivo: "La línea «Casos:» está vacía." };
    const lista = crudo.match(/^(#\d+(?:\s*(?:,|;|\sy\s|\se\s)\s*#\d+)*)\s*\.?\s*(.*)$/i);
    if (lista) {
      // Todos los #n de la línea, no solo los de la lista: `#1, #2, y #3` o `#301 #305`
      // dejarían números sin contar ni verificar. El tope (más abajo) cubre el total.
      numeros.push(...[...crudo.matchAll(/#(\d+)/g)].map((m) => Number(m[1])));
      continue;
    }
    const ning = crudo.match(/^ninguno\b\s*(?:[—–:;,-]+\s*)?(.*)$/i);
    if (ning) {
      const porque = ning[1].trim().replace(/\.$/, "");
      const palabras = porque.split(/\s+/).filter(Boolean).length;
      if (porque.length < MIN_MOTIVO || palabras < MIN_PALABRAS) {
        return {
          valida: false,
          motivo: `«Casos: ninguno» necesita su motivo (al menos ${MIN_MOTIVO} caracteres y ${MIN_PALABRAS} palabras): por qué en este trabajo no ha habido ningún fallo que registrar. Ahora: «${porque}».`,
        };
      }
      ninguno = true;
      continue;
    }
    return { valida: false, motivo: `«Casos: ${crudo.slice(0, 60)}» no vale: tiene que ser «#n, #m» o «ninguno — <motivo>».` };
  }
  // Tope: cada número es una petición a la API en el CI; miles agotarían el límite del token.
  if (numeros.length > MAX_CASOS || numeros.some((n) => n > MAX_NUMERO)) {
    return { valida: false, motivo: `«Casos:» cita demasiados issues o números que no son de un issue (máximo ${MAX_CASOS} casos, números hasta ${MAX_NUMERO}).` };
  }
  if (ninguno && numeros.length) {
    return { valida: false, motivo: "«Casos» dice a la vez «ninguno» y una lista de issues: o hay casos o no los hay." };
  }
  return { valida: true, numeros: [...new Set(numeros)], ninguno };
}
