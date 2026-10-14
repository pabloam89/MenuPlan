/**
 * tipo-y-jueces.mjs — las líneas «Tipo:», «Jueces:» y «Agente:» del cuerpo de un PR (#642, fondo #639; decisión #387).
 *
 * Por qué: «quien construye no juzga» era una convención de las fichas de agentes y de /orquestar. Pablo decidió el
 * 14 oct 2026 endurecerla: todo PR dice qué TIPO de trabajo es (create, fix, improve, operate, audit o uno de sus
 * subtipos de ops/tipos-de-encargo.json) y qué JUECES lo juzgan, distintos de quien lo construyó (`Agente:`):
 *
 *   Tipo: operate                    ← un tipo o un subtipo (operate-reversible)
 *   Jueces: seguridad, revisor       ← separados por coma; ninguno es el Agente
 *   Agente: constructor
 *
 * Una sola lectura, sin red y sin dependencias, para los dos que la usan: la guardia (al abrir el PR, solo la forma)
 * y el CI (scripts/dimensionado-pr.mjs: además, que el tipo exista y que estén los jueces que exige el dimensionado
 * del diff). Mismo criterio que la línea «Casos:» (casos.mjs): los comentarios y los bloques de código no cuentan.
 */
import { limpiarCuerpo } from "./casos.mjs";

/** Lo que se escribe en el cuerpo, para los mensajes. */
export const AYUDA =
  "Añade al cuerpo del PR «Tipo: <create|fix|improve|operate|audit o un subtipo>» y «Jueces: <juez>, <juez>» con los que " +
  "exige `npm run dimensionar -- --diff --tipo <tipo>` (línea «jueces:»); ninguno puede ser el de «Agente:»: quien construye no juzga.";

/** Por qué no vale una lectura (`regla`): la forma de las líneas, o que quien construye se nombra juez. */
export const REGLAS = { forma: "forma", construyeYJuzga: "construye-y-juzga" };

/** Lo que nunca es un juez: la sesión y lo vacío. */
const NO_JUECES = new Set(["sesión", "sesion", "ninguno", "nadie"]);
const LARGO_MAX = 300;

const etiqueta = (nombre, enComando) =>
  enComando ? new RegExp(`(?:^|[\\s"'(])${nombre}[ \\t]*:[ \\t]*(.*)$`, "gim") : new RegExp(`^[ \\t>*-]*(?:\\*\\*)?${nombre}(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*(.*)$`, "gim");
const valores = (texto, nombre, enComando) =>
  [...limpiarCuerpo(texto).matchAll(etiqueta(nombre, enComando))].map((m) => (enComando ? m[1].replace(/["')]+\s*$/, "") : m[1]).trim());
const nombre = (x) => x.replace(/[`*]/g, "").trim().toLowerCase().replace(/^sesion$/, "sesión");

/** Los nombres de las líneas «Agente:» del cuerpo, en minúsculas («sesion» pasa a «sesión»). La lee también fondos-pr.mjs. */
export function agentesDeLineas(cuerpo, { enComando = false } = {}) {
  return valores(cuerpo, "Agente", enComando).map((v) => nombre(/^[`*]*([\p{L}-]{0,40})/u.exec(v)?.[1] ?? ""));
}

/**
 * Las líneas «Tipo:» y «Jueces:» del cuerpo, solo su forma. → { valida, tipo, jueces: [..], agentes: [..], motivo? }
 * `enComando`: el texto es el comando entero (`gh pr create --body "…"`), como en analizarCasos.
 */
export function analizarTipoYJueces(cuerpo, { enComando = false } = {}) {
  const agentes = agentesDeLineas(cuerpo, { enComando });
  const tipos = [...new Set(valores(cuerpo, "Tipo", enComando).map((v) => nombre(v.split(/[\s—–(]/)[0] ?? "")))];
  const fuera = (motivo) => ({ valida: false, regla: REGLAS.forma, tipo: tipos[0] ?? null, jueces: [], agentes, motivo });
  if (!tipos.length) return fuera("Falta la línea «Tipo:» en el cuerpo del PR.");
  if (tipos.length > 1) return fuera(`El PR dice dos tipos (${tipos.slice(0, 3).join(", ")}): uno solo.`);
  if (!/^[a-z]+(?:-[a-z]+){0,3}$/.test(tipos[0])) return fuera(`«Tipo: ${tipos[0].slice(0, 40)}» no es un tipo ni un subtipo (create, fix, improve, operate, audit o un id como operate-reversible).`);
  const lineas = valores(cuerpo, "Jueces", enComando);
  if (!lineas.length) return fuera("Falta la línea «Jueces:» en el cuerpo del PR.");
  if (lineas.some((l) => l.length > LARGO_MAX)) return fuera(`La línea «Jueces:» es demasiado larga (más de ${LARGO_MAX} caracteres).`);
  const jueces = [...new Set(lineas.flatMap((l) => l.split(/\s*(?:,|;|\sy\s)\s*/)).map(nombre).filter(Boolean))];
  if (!jueces.length) return fuera("La línea «Jueces:» está vacía: todo PR lo juzga al menos un juez distinto de quien lo construyó.");
  const noJuez = jueces.find((j) => NO_JUECES.has(j));
  if (noJuez) return fuera(`«${noJuez}» no es un juez: todo PR lo juzga un agente juez distinto de quien lo construyó.`);
  const raro = jueces.find((j) => !/^[a-z]+(?:-[a-z]+)*$/.test(j));
  if (raro) return fuera(`«Jueces: … ${raro.slice(0, 30)}» no es el nombre de un juez (revisor, seguridad, qa, evaluador, auditor-datos).`);
  // La forma está bien; lo que falla es quién juzga: se dice con su regla para que el CI lo mida en su norma.
  const propio = jueces.find((j) => agentes.includes(j));
  if (propio) return { valida: false, regla: REGLAS.construyeYJuzga, tipo: tipos[0], jueces, agentes, motivo: `«${propio}» está en «Agente:» y en «Jueces:»: quien construye no juzga.` };
  return { valida: true, tipo: tipos[0], jueces, agentes };
}
