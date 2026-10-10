/**
 * credenciales.mjs — la guardia de las credenciales de la sesión (#447, hijo de #326).
 *
 * Las sesiones arrancan con GH_TOKEN de la App `homenu-sesiones` (1 hora, solo
 * este repo, no puede cambiar reglas). Pero el PC de Pablo guarda sus propias
 * credenciales (llavero de `gh`, Git Credential Manager) y basta quitar el
 * token del entorno para que `gh` y `git` vuelvan a usarlas: administrador.
 * Aquí, lo que se niega a una sesión:
 *
 *   1. quitar o vaciar GH_TOKEN / GITHUB_TOKEN (`env -u`, `unset`, `GH_TOKEN=`,
 *      `Remove-Item Env:GH_TOKEN`…);
 *   2. cambiar de dónde saca git sus credenciales o quién firma (`git -c
 *      credential.…`, GIT_CONFIG_*, GIT_AUTHOR_*, GIT_COMMITTER_*);
 *   3. cambiar las reglas del repo: `scripts/rulesets.mjs --escribir`, `gh api`
 *      que escribe en rulesets, protección de ramas, colaboradores, secretos,
 *      variables, environments, hooks o llaves, y `gh pr review --approve`;
 *   4. imprimir el token (`echo $GH_TOKEN`, `printenv` a secas).
 *
 * ACEPTADO por escrito: es un filtro de buena fe. Quien parta el texto adrede
 * (variables intermedias, un script en un fichero, otro intérprete) se lo
 * salta. La barrera de fondo es que Pablo cierre la sesión de `gh`
 * (`gh auth logout`) y quite el manager de credenciales de github.com en su PC.
 *
 * Solo se miran órdenes reales: el texto de un mensaje de commit, de un
 * cuerpo de PR o de un heredoc que NOMBRA estas cosas no cuenta (`sinTextos`).
 */

const TOKEN = String.raw`(?:GH|GITHUB)(?:_ENTERPRISE)?_TOKEN`;
const GIT_ID = String.raw`GIT_(?:CONFIG_\w+|AUTHOR_\w+|COMMITTER_\w+)`;
const VAR = String.raw`(?:${TOKEN}|${GIT_ID})`;
// Lo que puede haber justo antes de una palabra de shell: inicio, espacio, `(`, comillas, `{`.
const IZQ = String.raw`(?:^|[\s("'\x60{])`;

const AYUDA_TOKEN = "Si el token ha caducado (dura 1 hora), pide uno nuevo con `node scripts/token-sesion.mjs -- <comando>` (por ejemplo `node scripts/token-sesion.mjs -- gh pr list` o `-- git push`).";

/**
 * Quita lo que es texto y no orden: el cuerpo de un heredoc (salvo si alimenta
 * a un shell) y el valor entre comillas de `-m`, `--body`, `--title`,
 * `--nuevo`… Un commit o un PR que explica la regla no puede dispararla.
 */
export function sinTextos(cmd) {
  const sinHeredoc = String(cmd).replace(
    /(<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\2)([^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$|\))/g,
    (todo, cabeza, _q, _d, resto, pos, entero) => {
      const linea = entero.slice(entero.lastIndexOf("\n", pos - 1) + 1, pos);
      return /\b(?:ba|z|da|k)?sh\b|\bpwsh\b|\bpowershell\b|\bsource\b/i.test(linea) ? todo : `${cabeza}${resto}`;
    },
  );
  return sinHeredoc.replace(
    /(\s(?:-m|--message|--body|-b|--title|-t|--subject|--comment|--nuevo|--notes)(?:\s+|=))("(?:[^"\\]|\\.)*"|'[^']*')/g,
    '$1""',
  );
}

// Órdenes que solo muestran texto: nombrar aquí un comando no lo ejecuta.
const SOLO_TEXTO = /^(?:echo|printf|grep|rg|cat|sed|awk|head|tail|less|wc|diff)\b/i;
const EJECUTA_DENTRO = /\$\(|\x60/;

const MET_ESCRIBE = /^(?:PUT|PATCH|POST|DELETE)$/i;
// Rutas del repo que cambian reglas, accesos o secretos.
const RUTA_DE_REGLAS = new RegExp(
  String.raw`repos/[^/\s"']+/[^/\s"']+/(?:rulesets|branches/\S+?/protection|collaborators|actions/secrets|actions/variables|environments|hooks|keys)\b`,
  "i",
);
const RUTA_DE_REVISION = /repos\/[^/\s"']+\/[^/\s"']+\/pulls\/\d+\/reviews\b/i;
const MUTACION_DE_REGLAS = /\bmutation\b[\s\S]*(?:BranchProtectionRule|Ruleset|PullRequestReview|updateRepository|deleteRepository|transferRepository|archiveRepository)/i;

/** El método de un `gh api`: el explícito, o POST si lleva campos o cuerpo, o GET. */
function metodoDeApi(o) {
  const m = o.match(/(?:^|\s)(?:-X|--method)(?:[\s=]*)['"]?([A-Za-z]+)/);
  if (m) return m[1].toUpperCase();
  return /(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?:\s|=|$)/.test(o) ? "POST" : "GET";
}

const QUITA_TOKEN = [
  [new RegExp(String.raw`\benv\b.*?(?:\s-u\s*|\s--unset[\s=])["']?${TOKEN}\b`), "env -u"],
  [new RegExp(String.raw`${IZQ}env\s+(?:-i\b|--ignore-environment\b|-\s)`), "env -i"],
  [new RegExp(String.raw`\bunset\b[^|;&\n]*\b${TOKEN}\b`), "unset"],
  [new RegExp(String.raw`\bexport\s+-n\s+${TOKEN}\b`), "export -n"],
  // `GH_TOKEN=` vacío: al final, antes de un espacio o con comillas vacías. Con valor no es vaciarlo.
  [new RegExp(String.raw`(?<![\w$])${TOKEN}=(?:""|''|(?=\s|$|[;&|)]))`), "vaciar"],
  // PowerShell
  [new RegExp(String.raw`\b(?:Remove-Item|Clear-Item|Set-Item|Remove-ItemProperty|ri|si|del|rm)\b[^|;&\n]*\bEnv:[\\/]?\s*${TOKEN}\b`, "i"), "Env:"],
  [new RegExp(String.raw`\$env:${TOKEN}\s*=\s*(?:""|''|\$null\b|(?=$|[;)]))`, "i"), "$env:"],
  [new RegExp(String.raw`SetEnvironmentVariable\(\s*["']${TOKEN}["']`, "i"), "SetEnvironmentVariable"],
];

const TOCA_IDENTIDAD_GIT = [
  // `git -c credential.helper=…`, `-ccredential…`, `--config-env=credential…`
  new RegExp(String.raw`\bgit\b[^|;&\n]*?\s(?:-c\s*["']?credential\.|--config-env[\s=]+["']?credential\.)`, "i"),
  // `git config credential.… valor` (escribir; leer con --get/--list no cuenta)
  /\bgit\s+(?:-\S+\s+)*config\b(?![^|;&\n]*(?:--get\b|--get-all\b|--list\b|\s-l\b|--show-origin\b))[^|;&\n]*\bcredential\./i,
  new RegExp(String.raw`(?<![\w$])${GIT_ID}=`),
  new RegExp(String.raw`\b(?:unset|export\s+-n)\b[^|;&\n]*\b${GIT_ID}\b`),
  new RegExp(String.raw`\benv\b.*?(?:\s-u\s*|\s--unset[\s=])["']?${GIT_ID}\b`),
  new RegExp(String.raw`\b(?:Remove-Item|Clear-Item|Set-Item|ri|si)\b[^|;&\n]*\bEnv:[\\/]?\s*${GIT_ID}\b`, "i"),
  new RegExp(String.raw`\$env:${GIT_ID}\s*=`, "i"),
];

const IMPRIME_TOKEN = [
  new RegExp(String.raw`^(?:echo|printf|print|Write-Host|Write-Output)\b.*(?:\$\{?${TOKEN}\b|\$env:${TOKEN}\b)`, "i"),
  new RegExp(String.raw`^printenv(?:\s+${TOKEN})?\s*$`),
  /^(?:env|export\s+-p|declare\s+-x)\s*$/,
  /^(?:Get-ChildItem|gci|dir|ls)\s+Env:\\?\s*$/i,
  new RegExp(String.raw`console\.(?:log|error)\([^)]*process\.env\.${TOKEN}\b`),
];

/**
 * ¿Esta orden toca las credenciales de la sesión o las reglas del repo?
 * Devuelve la familia (`token`, `identidad`, `reglas`, `aprobar`, `imprimir`) o null.
 */
export function credencialDeSesion(orden) {
  const o = String(orden).trim();
  const soloTexto = SOLO_TEXTO.test(o) && !EJECUTA_DENTRO.test(o);

  // Imprimir el token es justo lo que hace un `echo`: se mira aunque sea solo texto.
  if (IMPRIME_TOKEN.some((re) => re.test(o))) return "imprimir";
  if (soloTexto) return null;

  if (QUITA_TOKEN.some(([re]) => re.test(o))) return "token";
  if (TOCA_IDENTIDAD_GIT.some((re) => re.test(o))) return "identidad";

  if (/\brulesets\.mjs\b/.test(o) && /(?:^|\s)--escribir\b/.test(o)) return "reglas";
  if (new RegExp(`${IZQ}gh(?:\\.exe)?\\s+(?:(?:-R|--repo)\\s+\\S+\\s+)?api\\b`).test(o)) {
    const escribe = MET_ESCRIBE.test(metodoDeApi(o));
    if (escribe && RUTA_DE_REGLAS.test(o)) return "reglas";
    if (escribe && RUTA_DE_REVISION.test(o) && /APPROVE/i.test(o)) return "aprobar";
    if (/\bgraphql\b/i.test(o) && MUTACION_DE_REGLAS.test(o)) return /PullRequestReview/i.test(o) ? "aprobar" : "reglas";
  }
  if (new RegExp(`${IZQ}gh(?:\\.exe)?\\s+(?:(?:-R|--repo)\\s+\\S+\\s+)?pr\\s+review\\b`).test(o) && /(?:^|\s)(?:--approve|-a)(?:\s|=|$|["'])/.test(o)) return "aprobar";
  return null;
}

/** Los avisos, en llano y con el remedio. Cada uno empieza por su frase de `FAMILIAS_GUARDIA`. */
export const AVISOS_CREDENCIALES = {
  token: `Quitar o vaciar GH_TOKEN deja a gh y a git con las credenciales de Pablo (administrador): la sesión va con la identidad de la App homenu-sesiones a propósito (#447). ${AYUDA_TOKEN}`,
  identidad: `Cambiar de dónde saca git sus credenciales o quién firma (credential.helper, GIT_CONFIG_*, GIT_AUTHOR_*, GIT_COMMITTER_*) es salirse de la identidad de la sesión (#447). Si un push o un commit falla, mira el error y cuéntalo en vez de rodearlo. ${AYUDA_TOKEN}`,
  reglas: "Cambiar las reglas del repo (rulesets, protección de ramas, colaboradores, secretos, variables, environments, hooks o llaves) es solo de Pablo (#447): hace falta una credencial de administrador, que la sesión no tiene. Prepara el cambio y el comando exacto, y dáselo a Pablo para que lo lance él con `!`.",
  aprobar: "Una sesión no aprueba PR (#447): la aprobación de dueño de código es de una persona. Deja el PR listo con el CI en verde y pide la revisión a Pablo o a Álvaro.",
  imprimir: "Imprimir el token de la sesión lo dejaría en la conversación (#447). Para comprobar que existe, usa `node scripts/token-sesion.mjs --comprobar`, que dice si vale sin enseñarlo.",
};
