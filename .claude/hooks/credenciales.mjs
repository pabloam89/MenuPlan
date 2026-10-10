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
 *      credential.…`, GIT_CONFIG_*, GIT_AUTHOR_NAME/EMAIL, GIT_COMMITTER_NAME/EMAIL);
 *   3. sacar o cambiar las credenciales guardadas (`gh auth token|login|switch…`,
 *      `git credential`, `cmdkey`);
 *   4. cambiar las reglas del repo (rulesets, protección, secretos, variables,
 *      ajustes del repo, `gh pr merge --admin`) y aprobar PR;
 *   5. imprimir el token (`echo $GH_TOKEN`, `printenv` a secas…);
 *   6. en la herramienta PowerShell, `gh` y `git push|pull|fetch|clone|ls-remote`
 *      sin el envoltorio `node scripts/token-sesion.mjs --`: esa herramienta NO
 *      carga el token de la sesión (CLAUDE_ENV_FILE es de Bash), así que ahí la
 *      sesión va como Pablo en cuanto lanza gh o git por la red.
 *
 * ESTO ES UN FILTRO DE BUENA FE, no una barrera. Huecos que no se pueden cerrar
 * mirando el texto: una variable intermedia (`X=GH_TOKEN; unset $X`), un script
 * escrito en un fichero y ejecutado, otro intérprete (`node -e`, `python -c`),
 * `xargs` u otro lanzador, y los nombres calculados en PowerShell
 * (`'GH_'+'TOKEN'`). Tampoco se vigila `git config user.name`, `--author` ni
 * `-c user.name=…`: solo cambian la autoría visible del commit, no con qué
 * credencial se sube. La barrera de fondo es de Pablo: `gh auth logout` y quitar
 * el manager de credenciales de github.com de su PC.
 *
 * Solo se miran órdenes reales: el texto de un mensaje de commit, de un
 * cuerpo de PR o de un heredoc que NOMBRA estas cosas no cuenta (`sinTextos`).
 */

import { AVISO_POR_CREDENCIAL, textoDeAviso } from "./avisos-guardia.mjs";

const TOKEN = String.raw`(?:GH|GITHUB)(?:_ENTERPRISE)?_TOKEN`;
// En PowerShell un comodín (`Env:GH_*`, `Env:*TOKEN`) también alcanza al token.
const TOKEN_PS = String.raw`(?:${TOKEN}|\w*[*?][\w*?]*)`;
// Solo lo que cambia con qué credencial o con qué configuración sube git; la fecha o NOSYSTEM no.
const GIT_ID = String.raw`GIT_(?:(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL)|CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|GLOBAL|PARAMETERS|SYSTEM))`;
// Lo que puede haber justo antes de una palabra de shell: inicio, espacio, `(`, comillas, `{`.
const IZQ = String.raw`(?:^|[\s("'\x60{])`;
const GH = String.raw`${IZQ}gh(?:\.exe)?\s+(?:(?:-R|--repo)\s+\S+\s+)?`;
// Tope a los comodines: una orden enorme no puede disparar el retroceso de la expresión.
const RESTO = String.raw`[^|;&\n]{0,200}`;

/**
 * Quita el cuerpo de los heredocs (una pasada por líneas, lineal) salvo si la
 * línea que los abre alimenta a un shell o a `xargs`. Sin cierre, no toca nada.
 */
function quitarHeredocs(texto) {
  const lineas = texto.split("\n");
  const fuera = [];
  const sinCierre = new Set();
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    fuera.push(l);
    const m = l.match(/<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/);
    if (!m || sinCierre.has(m[2])) continue;
    let fin = -1;
    for (let j = i + 1; j < lineas.length; j++) {
      if (lineas[j].trim() === m[2]) {
        fin = j;
        break;
      }
    }
    if (fin < 0) sinCierre.add(m[2]);
    if (fin < 0 || /\b(?:ba|z|da|k)?sh\b|\bpwsh\b|\bpowershell\b|\bsource\b|\bxargs\b/i.test(l)) continue;
    i = fin; // el cuerpo y la línea de cierre se saltan; lo que haya detrás en la orden sigue en las líneas siguientes
  }
  return fuera.join("\n");
}

/**
 * Quita lo que es texto y no orden: el cuerpo de un heredoc (salvo si alimenta
 * a un shell o a `xargs`) y el valor entre comillas de `-m`, `-am`, `--body`,
 * `--title`, `--nuevo`… y de los campos `-f/-F` de `gh api` (salvo `query` y
 * `event`, que se miran). Un valor con `$(` o acentos graves entre comillas
 * dobles se EJECUTA, así que ese se deja para mirarlo.
 */
export function sinTextos(cmd) {
  const unido = String(cmd).replace(/\\\r?\n/g, " ").replace(/\x60\r?\n/g, " ");
  const sinHeredoc = quitarHeredocs(unido);
  const sinMensajes = sinHeredoc.replace(
    /(\s(?:-[a-zA-Z]*m|-b|-t|--message|--body|--title|--subject|--comment|--nuevo|--notes))(\s*=?\s*)("(?:[^"\\]|\\.)*"|'[^']*')/g,
    (todo, flag, sep, valor) => (valor[0] === '"' && /\$\(|\x60/.test(valor) ? todo : `${flag} ""`),
  );
  return sinMensajes.replace(
    /(\s(?:-f|-F|--field|--raw-field))(\s+|=)((?:[^\s"']*(?:"(?:[^"\\]|\\.)*"|'[^']*'))+[^\s"']*|\S+)/g,
    (todo, flag, sep, valor) => (/^["']?(?:query|event)[=@]/.test(valor) ? todo : `${flag} ""`),
  );
}

/** Parte `a && b; c | d & e` en trozos; cada uno dice si lo que sigue es una tubería. */
export function trozos(cmd) {
  const partes = String(cmd).split(/(&&|\|\||;|\n|\||(?<![>&])&(?![>&]))/);
  const fuera = [];
  for (let i = 0; i < partes.length; i += 2) {
    const texto = partes[i].trim();
    if (texto) fuera.push({ texto, tuberia: partes[i + 1] === "|", siguiente: (partes[i + 2] ?? "").trim() });
  }
  return fuera;
}

/** Une lo que el shell une: `un""set`, `u'n'set`, `un\set`, `${env:X}`. */
function normalizar(t) {
  return t
    .replace(/\$\{env:([^}]+)\}/gi, "$$env:$1")
    .replace(/(['"])([\w.-]*)\1/g, "$2")
    .replace(/(?<=[A-Za-z_])\\(?=[A-Za-z_])/g, "");
}

// Órdenes que solo muestran texto: nombrar aquí un comando no lo ejecuta.
// (`awk` y `sed` no: `system()` y el comando `e` ejecutan.)
const SOLO_TEXTO = /^(?:echo|printf|grep|rg|cat|head|tail|less|wc|diff)\b/i;
const EJECUTA_DENTRO = /\$\(|\x60/;

const MET_ESCRIBE = /^(?:PUT|PATCH|POST|DELETE)$/i;
// El endpoint (no los campos): reglas, accesos, secretos y ajustes del repo o de la organización.
const ENDPOINT_DE_REGLAS = new RegExp(
  String.raw`^(?:repos/[^/]+/[^/]+|orgs/[^/]+|user)/(?:rulesets|collaborators|invitations|actions/(?:secrets|variables|permissions)|dependabot/secrets|codespaces/secrets|environments|hooks|keys|transfer|branches/.+?/protection)(?:/|$)`,
  "i",
);
const ENDPOINT_RAIZ = /^repos\/[^/]+\/[^/]+\/?$/i;
const ENDPOINT_DE_REVISION = /^repos\/[^/]+\/[^/]+\/pulls\/\d+\/reviews(?:\/|$)/i;
const MUTACION_DE_REGLAS = /\bmutation\b[\s\S]{0,5000}(?:BranchProtectionRule|Ruleset|updateRepository|deleteRepository|transferRepository|archiveRepository)/i;
const MUTACION_DE_REVISION = /\bmutation\b[\s\S]{0,5000}(?:add|submit)PullRequestReview\b[\s\S]{0,5000}APPROVE/i;
const CON_VALOR = new Set(["-X", "--method", "-H", "--header", "-q", "--jq", "-t", "--template", "-f", "-F", "--field", "--raw-field", "--input", "--hostname", "-p", "--preview", "--cache"]);

/** El método de un `gh api`: el explícito, o POST si lleva campos o cuerpo, o GET. */
function metodoDeApi(args) {
  const m = args.match(/(?:^|\s)(?:-X|--method)(?:[\s=]*)['"]?([A-Za-z]+)/);
  if (m) return m[1].toUpperCase();
  return /(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?:\s|=|$)/.test(args) ? "POST" : "GET";
}

/** El primer argumento que no es una opción ni el valor de una: la ruta a la que llama. */
function endpointDeApi(args) {
  const t = args.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  for (let i = 0; i < t.length; i++) {
    if (t[i].startsWith("-")) {
      if (CON_VALOR.has(t[i])) i++;
      continue;
    }
    return t[i].replace(/^["']|["']$/g, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/\?.*$/, "").replace(/\/{2,}/g, "/").replace(/^\//, "");
  }
  return "";
}

const QUITA_TOKEN = [
  new RegExp(String.raw`\benv\b.{0,200}?(?:\s-u\s*|\s--unset[\s=])${TOKEN}\b`),
  new RegExp(String.raw`${IZQ}env\s+(?:-i\b|--ignore-environment\b|-\s)`),
  new RegExp(String.raw`\bunset\b${RESTO}\b${TOKEN}\b`),
  new RegExp(String.raw`\bexport\s+-n\s+${TOKEN}\b`),
  // `GH_TOKEN=` vacío (las comillas vacías ya se quitaron al normalizar). Con valor no es vaciarlo.
  new RegExp(String.raw`(?<![\w$])${TOKEN}=(?=\s|$|[;&|)])`),
  // PowerShell
  new RegExp(String.raw`\b(?:Remove-Item|Clear-Item|Set-Item|Remove-ItemProperty|Remove-Variable|Clear-Variable|ri|si|del|rm|rd)\b${RESTO}\bEnv:[\\/]?\s*${TOKEN_PS}`, "i"),
  new RegExp(String.raw`\$env:${TOKEN_PS}\s*=\s*(?:\$null\b|(?=$|[;)]))`, "i"),
  new RegExp(String.raw`SetEnvironmentVariable\(\s*${TOKEN}\b`, "i"),
  /-UseNewEnvironment\b/i,
];

const TOCA_IDENTIDAD_GIT = [
  // `git -c credential.helper=…`, `-ccredential…`, `--config-env=credential…`
  new RegExp(String.raw`\bgit\b${RESTO}\s(?:-c\s*["']?credential\.|--config-env[\s=]+["']?credential\.)`, "i"),
  // `git config credential.… valor` (escribir; leer con --get/--list no cuenta)
  /\bgit\s+(?:-\S+\s+){0,6}config\b(?![^|;&\n]{0,200}(?:--get\b|--get-all\b|--list\b|\s-l\b|--show-origin\b))[^|;&\n]{0,200}\bcredential\./i,
  new RegExp(String.raw`(?<![\w$])${GIT_ID}=`),
  new RegExp(String.raw`\b(?:unset|export\s+-n)\b${RESTO}\b${GIT_ID}\b`),
  new RegExp(String.raw`\benv\b.{0,200}?(?:\s-u\s*|\s--unset[\s=])${GIT_ID}\b`),
  new RegExp(String.raw`\b(?:Remove-Item|Clear-Item|Set-Item|Remove-Variable|ri|si)\b${RESTO}\bEnv:[\\/]?\s*${GIT_ID}\b`, "i"),
  new RegExp(String.raw`\$env:${GIT_ID}\s*=`, "i"),
];

// Sacar o cambiar lo que el PC guarda de Pablo (llavero de gh, Git Credential Manager, Windows).
const CREDENCIALES_GUARDADAS = [
  new RegExp(String.raw`${GH}auth\s+(?:token|switch|login|refresh|setup-git|logout)\b`),
  new RegExp(String.raw`${GH}auth\s+status\b${RESTO}(?:\s-t\b|--show-token\b)`),
  /\bgit(?:-|\s+(?:-\S+\s+(?:[^-\s]\S*\s+)?){0,6})credential/i,
  new RegExp(String.raw`${IZQ}(?:cmdkey|vaultcmd|Get-StoredCredential)(?:\.exe)?\b`, "i"),
];

// Cambiar ajustes, secretos o accesos del repo con la CLI (la API se mira aparte).
const REGLAS_POR_CLI = [
  new RegExp(String.raw`${GH}(?:secret|variable)\s+(?:set|delete|remove)\b`),
  new RegExp(String.raw`${GH}repo\s+(?:edit|delete|archive|unarchive|rename|transfer)\b`),
  new RegExp(String.raw`${GH}repo\s+deploy-key\s+(?:add|delete)\b`),
  new RegExp(String.raw`${GH}pr\s+merge\b.{0,200}--admin\b`),
];

const VUELCA = [/^printenv$/, /^env$/, /^export\s+-p$/, /^declare\s+-[xp]+$/, /^(?:Get-ChildItem|gci|dir|ls|Get-Item|gi)\s+Env:[\\/]?\*?$/i];
const IMPRIME_TOKEN = [
  new RegExp(String.raw`^(?:echo|printf|print|Write-Host|Write-Output)\b.{0,300}(?:\$\{?${TOKEN}\b|\$env:${TOKEN}\b)`, "i"),
  new RegExp(String.raw`^printenv\s+${TOKEN}\s*$`),
  new RegExp(String.raw`^\$env:${TOKEN}\s*$`, "i"),
  new RegExp(String.raw`^(?:Get-Item|gi|Get-ChildItem|gci|dir|ls|Get-Content|gc|type|cat)\s+Env:[\\/]?\s*${TOKEN_PS}`, "i"),
  new RegExp(String.raw`GetEnvironmentVariable\(\s*${TOKEN}\b`, "i"),
  new RegExp(String.raw`\bnode\s+(?:-p|-e|--print|--eval)\b.{0,300}process\.env(?:\.|\[\s*)${TOKEN}\b`),
  new RegExp(String.raw`console\.(?:log|error)\([^)]{0,200}process\.env\.${TOKEN}\b`),
  /\/proc\/[^\s/]+\/environ\b/,
];
// Un volcado del entorno que va a un `grep` de otra cosa (`env | grep -i path`) no enseña el token.
const FILTRA_SIN_TOKEN = /^(?:grep|rg|egrep|findstr|Select-String|sls|wc)\b/i;
const PIDE_SECRETOS = /token|secret|passw|key|\bGH_|GITHUB|auth/i;

// Atajo: un trozo sin ninguna de estas palabras no puede disparar ninguna regla de arriba.
const ALGO_QUE_MIRAR = /gh|git|env|unset|export|printenv|declare|cmdkey|vaultcmd|credential|rulesets|node|proc|Item|Variable|Environment|ri|si|del|rm|rd|gi|gc|ls|dir|cat|type|Write-|print/i;

/** ¿Es `gh` o un `git` de red, sin el envoltorio de la sesión? (solo en PowerShell) */
function sinEnvoltorioEnPowerShell(o) {
  if (/token-sesion\.mjs\s+--/.test(o)) return false;
  return new RegExp(String.raw`${IZQ}(?:&\s*)?gh(?:\.exe)?(?:\s|$)`).test(o)
    || new RegExp(String.raw`${IZQ}(?:&\s*)?git(?:\.exe)?\s+(?:-\S+\s+(?:\S+\s+)?){0,4}(?:push|pull|fetch|clone|ls-remote|remote\s+update)\b`).test(o);
}

/**
 * ¿Esta orden toca las credenciales de la sesión o las reglas del repo?
 * Familia (`token`, `identidad`, `guardadas`, `reglas`, `aprobar`, `imprimir`,
 * `powershell`) o null. `opc`: `powershell`, `tuberia` y `siguiente` (el trozo que sigue).
 */
export function credencialDeSesion(orden, opc = {}) {
  const crudo = String(orden);
  if (!ALGO_QUE_MIRAR.test(crudo.replace(/['"\\]/g, ""))) return null;
  const o = normalizar(crudo).trim();
  const soloTexto = SOLO_TEXTO.test(o) && !EJECUTA_DENTRO.test(o);

  // Imprimir el token es justo lo que hace un `echo`: se mira aunque sea solo texto.
  if (IMPRIME_TOKEN.some((re) => re.test(o))) return "imprimir";
  if (VUELCA.some((re) => re.test(o))) {
    const filtrado = opc.tuberia && FILTRA_SIN_TOKEN.test(opc.siguiente ?? "") && !PIDE_SECRETOS.test(opc.siguiente ?? "");
    return filtrado ? null : "imprimir";
  }
  if (soloTexto) return null;

  if (opc.powershell && sinEnvoltorioEnPowerShell(o)) return "powershell";
  if (QUITA_TOKEN.some((re) => re.test(o))) return "token";
  if (TOCA_IDENTIDAD_GIT.some((re) => re.test(o))) return "identidad";
  if (CREDENCIALES_GUARDADAS.some((re) => re.test(o))) return "guardadas";

  if (/\brulesets\.mjs\b/.test(o) && /(?:^|\s)--escribir\b/.test(o)) return "reglas";
  if (REGLAS_POR_CLI.some((re) => re.test(o))) return "reglas";
  const api = o.match(new RegExp(String.raw`${GH}api\b(.*)$`));
  if (api) {
    const args = api[1];
    const ruta = endpointDeApi(args);
    const escribe = MET_ESCRIBE.test(metodoDeApi(args));
    const conFichero = /(?:^|\s)--input(?:\s|=)/.test(args);
    if (escribe && (ENDPOINT_DE_REGLAS.test(ruta) || ENDPOINT_RAIZ.test(ruta))) return "reglas";
    if (escribe && ENDPOINT_DE_REVISION.test(ruta) && (conFichero || /APPROVE/i.test(args))) return "aprobar";
    if (/^graphql$/i.test(ruta)) {
      // Una consulta que viene de un fichero no se puede leer: se niega.
      if (conFichero || /query=?@/.test(args)) return "reglas";
      if (MUTACION_DE_REVISION.test(args)) return "aprobar";
      if (MUTACION_DE_REGLAS.test(args)) return "reglas";
    }
  }
  if (new RegExp(String.raw`${GH}pr\s+review\b`).test(o) && /(?:^|\s)(?:--approve|-[a-zA-Z]*a[a-zA-Z]*)(?:\s|=|$|["'])/.test(o)) return "aprobar";
  return null;
}

/** La orden entera (puede llevar varias): la primera familia que salta, o null. */
export function credencialDeComando(cmd, { powershell = false } = {}) {
  const lista = trozos(sinTextos(cmd));
  for (const t of lista) {
    const familia = credencialDeSesion(t.texto, { powershell, tuberia: t.tuberia, siguiente: t.siguiente });
    if (familia) return familia;
  }
  return null;
}

/** Los avisos, en llano y con el remedio: su texto sale de avisos-guardia.mjs (cuatro partes fijas, #494). */
export const AVISOS_CREDENCIALES = Object.fromEntries(
  Object.entries(AVISO_POR_CREDENCIAL).map(([familia, aviso]) => [familia, textoDeAviso(aviso)]),
);
