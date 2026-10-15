/**
 * casos.mjs — la línea «Casos:» del cuerpo de un PR (#185).
 *
 * Por qué: «Cuando algo falla: hasta el problema de fondo» (CLAUDE.md) era solo
 * texto. El 9 oct 2026 una sesión de siete PR arregló fallos con su test y no
 * registró ninguno hasta que Pablo lo preguntó. Ahora cada PR dice, en una
 * línea, qué casos (issues `tipo:caso`) deja registrados o por qué no hay:
 *
 *   Casos: #301, #305
 *   Casos: #12 (el test rojo)     ← el texto tras la lista se admite; solo cuentan las referencias
 *   Casos: pabloam89/homenu-panel#4  ← un caso de otro repo de ops/entidades.json (#856)
 *   Casos: ninguno — solo mueve ficheros de sitio, no se ha visto ningún fallo
 *
 * La misma lógica la usan la guardia (al abrir el PR, solo la forma, sin red) y
 * el CI (`scripts/casos-pr.mjs`, además contra la API). Una sola fuente: la línea
 * `Casos:` solo se reconoce aquí (también `LINEA_CASOS`, la de pendientes.mjs), y
 * cada elemento se lee con `leerReferencia` (.claude/hooks/referenciaIssue.mjs).
 */
import { FUENTE_REFERENCIA, MAX_NUMERO, leerReferencia, limpiarCuerpo, mismaReferencia } from "./referenciaIssue.mjs";

// Siguen saliendo de aquí para quien ya los importaba; su sitio es el lector de referencias.
export { MAX_NUMERO, limpiarCuerpo };

/** Longitud mínima del motivo de «ninguno»: «n/a» o «nada» no es un motivo. */
export const MIN_MOTIVO = 25;
const MIN_PALABRAS = 4;
/** Tope de casos por PR (el número más alto, MAX_NUMERO, lo pone el lector de referencias). */
export const MAX_CASOS = 20;

export const AYUDA =
  "Añade al cuerpo del PR una línea «Casos: #n, #m» con los issues `tipo:caso` que has registrado " +
  "(`npm run issues -- --nuevo \"…\" --tipo caso --analisis <…> --area <…> --cuerpo <f.md> --padre <fondo>`; " +
  "cada fallo del camino —test rojo que no era tuyo, dato falso copiado, vigilante que bloqueó algo bueno, cosa del entorno— es un caso), " +
  `o «Casos: ninguno — <por qué no ha habido ningún fallo, al menos ${MIN_MOTIVO} caracteres>».`;

/**
 * ¿Hay en el texto una línea `Casos:` con forma (una referencia o «ninguno»)? Sin validar: es la
 * señal barata de pendientes.mjs de que un PR registró sus casos. Hecha con la forma del lector.
 */
export const LINEA_CASOS = new RegExp(String.raw`\bCasos\s*:\s*(?:${FUENTE_REFERENCIA}|ninguno)`, "i");

/** La lista: referencias separadas por `,`, `;`, « y » o « e », y lo que siga. */
const LISTA = new RegExp(String.raw`^(${FUENTE_REFERENCIA}(?:\s*(?:,|;|\sy\s|\se\s)\s*${FUENTE_REFERENCIA})*)\s*\.?\s*(.*)$`, "i");
const TODAS = new RegExp(FUENTE_REFERENCIA, "g");

/**
 * Las líneas «Casos:» del cuerpo, TODAS válidas (con que una valga, otra rota
 * colaba). `enComando`: el texto es el comando entero (`gh pr create --body "…"`),
 * donde la línea puede empezar tras una comilla y acabar en ella. `repoPropio` y
 * `repos` (y `soloForma`, el de la guardia): los de leerReferencia (hacen falta en cuanto la línea cita un issue).
 * → {valida, referencias:[{repo, numero}…], ninguno:boolean, motivo?}
 */
export function analizarCasos(cuerpo, { enComando = false, repoPropio, repos = [], soloForma = false } = {}) {
  const texto = limpiarCuerpo(cuerpo);
  const re = enComando
    ? /(?:^|[\s"'(])Casos[ \t]*:[ \t]*(.*)$/gim
    : /^[ \t>*-]*(?:\*\*)?Casos(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/gim;
  const lineas = [...texto.matchAll(re)].map((m) => (enComando ? m[1].replace(/["')\s]+$/, "") : m[1].trim()));
  if (!lineas.length) return { valida: false, motivo: "Falta la línea «Casos:» en el cuerpo del PR." };

  const referencias = [];
  let ninguno = false;
  for (const entera of lineas) {
    // Tope de largo: una línea de megas no debe costar tiempo de regex, ni
    // esconder números más allá de lo que se mira.
    if (entera.length > 2000) return { valida: false, motivo: "La línea «Casos:» es demasiado larga (más de 2000 caracteres). Pon la lista de #n en una línea corta y los detalles en otra." };
    const crudo = entera;
    if (!crudo) return { valida: false, motivo: "La línea «Casos:» está vacía." };
    if (LISTA.test(crudo)) {
      // Todas las referencias de la línea, no solo las de la lista: `#1, #2, y #3` o `#301 #305`
      // dejarían issues sin contar ni verificar. El tope (más abajo) cubre el total.
      for (const [trozo] of crudo.matchAll(TODAS)) {
        const r = leerReferencia(trozo, { repoPropio, repos, soloForma });
        if (r.error) return { valida: false, motivo: `«Casos:» cita ${r.error}.` };
        if (!referencias.some((x) => mismaReferencia(x, r))) referencias.push(r);
      }
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
    return { valida: false, motivo: `«Casos: ${crudo.slice(0, 60)}» no vale: tiene que ser «#n, #m» (o dueño/repo#n, de un repo de ops/entidades.json) o «ninguno — <motivo>».` };
  }
  // Tope: cada referencia es una petición a la API en el CI; miles agotarían el límite del token.
  if (referencias.length > MAX_CASOS) {
    return { valida: false, motivo: `«Casos:» cita demasiados issues (máximo ${MAX_CASOS} casos).` };
  }
  if (ninguno && referencias.length) {
    return { valida: false, motivo: "«Casos» dice a la vez «ninguno» y una lista de issues: o hay casos o no los hay." };
  }
  return { valida: true, referencias, ninguno };
}
