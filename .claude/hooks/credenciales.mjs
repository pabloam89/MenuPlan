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
 *   5. imprimir el token (`echo $GH_TOKEN`, `printenv` a secas…) o usarlo como
 *      argumento de cualquier orden (`$GH_TOKEN`, `%GH_TOKEN%`, `$env:GH_TOKEN`), y
 *      tocar el fichero de caché del token (`token-sesion.json`) o `~/.claude/session-env`,
 *      se use como se use (#715, opción A de Pablo, 13 oct 2026);
 *   6. en la herramienta PowerShell, `gh` y `git push|pull|fetch|clone|ls-remote`
 *      sin el envoltorio `node scripts/token-sesion.mjs --`: esa herramienta NO
 *      carga el token de la sesión (CLAUDE_ENV_FILE es de Bash), así que ahí la
 *      sesión va como Pablo en cuanto lanza gh o git por la red;
 *   7. lanzar `op` (1Password) fuera de `npm run op -- …` o nombrar lo que es solo
 *      de Pablo (`MENUPLAN_OP_PABLO`, la bóveda `HoMenu`…): la regla `op-de-pablo`
 *      de la guardia grande, traída aquí en #878 (familia `op`, `opDeSesion`).
 *
 * ESTO ES UN FILTRO DE BUENA FE, no una barrera. Huecos que no se pueden cerrar
 * mirando el texto: una variable intermedia (`X=GH_TOKEN; unset $X`), un script
 * escrito en un fichero y ejecutado, otro intérprete que no sea `sh|bash -c`, `eval`,
 * `iex`, `pwsh -c` o `cmd /c` (`node -e`, `python -c`), `xargs` u otro lanzador, y los nombres calculados en PowerShell
 * (`'GH_'+'TOKEN'`). Tampoco se vigila `git config user.name`, `--author` ni
 * `-c user.name=…`: solo cambian la autoría visible del commit, no con qué
 * credencial se sube. La barrera de fondo es de Pablo: `gh auth logout` y quitar
 * el manager de credenciales de github.com de su PC.
 *
 * Solo se miran órdenes reales: el texto de un mensaje de commit, de un
 * cuerpo de PR o de un heredoc que NOMBRA estas cosas no cuenta (`sinTextos`).
 */

const TOKEN = String.raw`(?:GH|GITHUB)(?:_ENTERPRISE)?_TOKEN`;
// En PowerShell un comodín (`Env:GH_*`, `Env:*TOKEN`) también alcanza al token.
const TOKEN_PS = String.raw`(?:${TOKEN}|\w*[*?][\w*?]*)`;
// Solo lo que cambia con qué credencial o con qué configuración sube git; la fecha o NOSYSTEM no.
const GIT_ID = String.raw`GIT_(?:(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL)|CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|GLOBAL|PARAMETERS|SYSTEM))`;
// Lo que puede haber justo antes de una palabra de shell: inicio, espacio, `(`, comillas, `{`.
const IZQ = String.raw`(?:^|[\s("'\x60{])`;
// `gh` suelto, con ruta delante (`/usr/bin/gh`) o el shim de las sesiones (`scripts/gh-shim.mjs`, E1 #719).
const GH = String.raw`(?:${IZQ}|/)(?:gh(?:\.exe)?|gh-shim\.mjs)["']?\s+(?:(?:-R|--repo)\s+\S+\s+)?`;
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

// El envoltorio de la sesión al principio de la orden: `node scripts/token-sesion.mjs -- `.
const ENVOLTORIO = /^(?:node(?:\.exe)?\s+)?\S*token-sesion\.mjs\s+--\s+/;
// El mismo envoltorio en cualquier sitio del trozo (asignado, entre paréntesis, en un `if`): solo el
// `gh`/`git` que va JUSTO detrás queda cubierto; cualquier otro `gh` del trozo sigue sin envoltorio.
const GH_ENVUELTO = /(\btoken-sesion\.mjs\s+--\s+)(?:&\s*)?(?:\S*[\\/])?(?:gh|git)(?:\.exe)?(?=\s|$)/g;

/** Quita el envoltorio del principio de una orden (para mirar la orden de verdad). */
export function sinEnvoltorio(orden) {
  return String(orden).replace(ENVOLTORIO, "");
}

// Atajo: un trozo sin ninguna de estas palabras no puede disparar ninguna regla de arriba.
const ALGO_QUE_MIRAR = /gh|git|env|unset|export|printenv|declare|cmdkey|vaultcmd|credential|rulesets|node|proc|Item|Variable|Environment|ri|si|del|rm|rd|gi|gc|ls|dir|cat|type|Write-|print/i;

/**
 * ¿Es `gh` o un `git` de red, sin el envoltorio de la sesión? (solo en PowerShell)
 * También con la ruta entera, entre comillas o no: `& 'C:\Program Files\GitHub CLI\gh.exe' pr merge 1`
 * o `C:/Program Files/GitHub CLI/gh.exe pr view 1` (juicio de seguridad del PR #880).
 */
function sinEnvoltorioEnPowerShell(orden) {
  const o = orden.replace(GH_ENVUELTO, "$1ENVUELTO");
  return new RegExp(String.raw`(?:${IZQ}|[\\/])(?:&\s*)?gh(?:\.exe)?["']?(?:\s|$)`).test(o)
    || new RegExp(String.raw`(?:${IZQ}|[\\/])(?:&\s*)?git(?:\.exe)?["']?\s+(?:-\S+\s+(?:\S+\s+)?){0,4}(?:push|pull|fetch|clone|ls-remote|remote\s+update)\b`).test(o);
}

// ── 1Password: lo que es solo de Pablo (#328) ─────────────────────────────
// Hasta #878 era la regla `op-de-pablo` de guardia.mjs (`opDeSesion`); se trae tal cual al
// desconectar la guardia grande (juicio de seguridad del PR #880, hallazgo 1): `scripts/lib/env.mjs`
// tiene un interruptor solo de Pablo que va por la app de escritorio de 1Password, y sin esta regla
// lo único entre una sesión y las claves de `HoMenu` es una ventana de aprobación que no dice qué
// orden la pide. Filtro de buena fe (ACEPTADO en la ronda 3 de #328): quien parta el texto adrede se
// lo salta; la barrera de fondo es que la integración de la CLI de 1Password esté apagada fuera de
// las operaciones de Pablo.

// El ejecutable `op`, con o sin ruta y `.exe`, y con o sin comillas.
const OP_EXE = String.raw`(?:"[^"]*[\\/]op(?:\.exe)?"|'[^']*[\\/]op(?:\.exe)?'|["']?(?:[^\s"']*[\\/])?op(?:\.exe)?["']?)(?=\s|$)`;
const OP_AL_PRINCIPIO = new RegExp(String.raw`^(?:\w+=\S*\s+)*(?:env\s+(?:-\S+\s+|\w+=\S*\s+)*)?(?:&\s*|call\s+)?` + OP_EXE, "i");
const OP_ANIDADO = new RegExp(String.raw`(?:\$\(|\x60|!)\s*` + OP_EXE, "i");
const OP_EN_SHELL = new RegExp(String.raw`\b(?:bash|sh|zsh|cmd|powershell|pwsh)(?:\.exe)?\b.*(?:\s-c|\s/c|\s-command)\b.*[\s"'&;]` + OP_EXE, "i");
// `op` suelto seguido de un subcomando de la CLI: `timeout 10 op vault list`, `if op whoami`,
// `node -e "…execSync('op read …')"`, `Start-Process op …`, `(op whoami)`… Un `npm run op -- read`
// no casa: tras `op` va `--`, no un subcomando.
const OP_SUELTO = /(?:^|[\s(;{&|"'\x60])op(?:\.exe)?\s+(?:read|run|inject|item|vault|whoami|signin|account|service-account|document|user|group|connect|plugin|ssh)\b/i;

/** Separa `a && b; c | d` para mirar cada orden por su cuenta (como la guardia grande, sin quitar textos). */
const ordenesOp = (cmd) => String(cmd).split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean);

/**
 * #328: ¿esta orden lanza `op` por la app o nombra lo que es solo de Pablo? Por orden: un commit,
 * un grep o un comentario de gh que lo nombran no cuentan, salvo que lleven `$(`, comillas
 * invertidas o `alias`.
 */
export function opDeSesion(o) {
  if (/^(git|gh|grep|rg)\b/.test(o) && !/\$\(|\x60|\balias[.\s]/.test(o)) return false;
  return OP_AL_PRINCIPIO.test(o) || OP_ANIDADO.test(o) || OP_EN_SHELL.test(o) || OP_SUELTO.test(o)
    || /\b(MENUPLAN_OP_PABLO|OP_SIN_SERVICIO|OP_SERVICE_ACCOUNT_TOKEN)\b/.test(o)
    || /op:\/\/[\s"']*homenu(?![-\w])/i.test(o)
    || /--vault[=\s]+["']?homenu(?![-\w])/i.test(o)
    || /op:\/\/["']?[a-z0-9]{26}\b/i.test(o)
    || /--vault[=\s]+["']?[a-z0-9]{26}\b/i.test(o)
    || /\bitem\s+(?:get|edit|share|delete)\s+["']?[a-z0-9]{26}\b/i.test(o);
}

/**
 * ¿Esta orden toca las credenciales de la sesión o las reglas del repo?
 * Familia (`token`, `identidad`, `guardadas`, `reglas`, `aprobar`, `imprimir`,
 * `powershell`) o null. `opc`: `powershell`, `tuberia` y `siguiente` (el trozo que sigue).
 */
export function credencialDeSesion(orden, opc = {}) {
  const crudo = String(orden);
  if (!ALGO_QUE_MIRAR.test(crudo.replace(/['"\\]/g, ""))) return null;
  // Lo que va detrás del envoltorio es la orden de verdad: se mira como si fuese sola
  // (`token-sesion.mjs -- printenv` vuelca el entorno igual que `printenv`).
  const entera = normalizar(crudo).trim();
  const envuelta = ENVOLTORIO.exec(entera);
  const o = envuelta ? entera.slice(envuelta[0].length) : entera;
  const soloTexto = SOLO_TEXTO.test(o) && !EJECUTA_DENTRO.test(o);

  // Imprimir el token es justo lo que hace un `echo`: se mira aunque sea solo texto.
  if (IMPRIME_TOKEN.some((re) => re.test(o))) return "imprimir";
  if (VUELCA.some((re) => re.test(o))) {
    const filtrado = opc.tuberia && FILTRA_SIN_TOKEN.test(opc.siguiente ?? "") && !PIDE_SECRETOS.test(opc.siguiente ?? "");
    return filtrado ? null : "imprimir";
  }
  if (soloTexto) return null;

  // También sobre el texto crudo: `normalizar` une `CLI\gh.exe` en `CLIgh.exe` y la ruta entre comillas se perdería.
  if (opc.powershell && !envuelta && (sinEnvoltorioEnPowerShell(o) || sinEnvoltorioEnPowerShell(crudo.trim()))) return "powershell";
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

// El token como argumento: `$GH_TOKEN`, `${GH_TOKEN}`, `$env:GH_TOKEN`, `${env:GH_TOKEN}`, `%GH_TOKEN%`.
// `%GH_TOKEN:~0,40%` (cmd, con subcadena) también, y `printenv` con el nombre del token en cualquier posición
// de ese trozo (con otra variable antes, con asignación o `command` delante, con ruta, tras `env` o tras el envoltorio).
const TOKEN_COMO_ARGUMENTO = new RegExp(
  String.raw`\$\{?(?:env:)?${TOKEN}\b|%${TOKEN}(?::[^%]*)?%|\bprintenv\b[^\n;&|)]*\b${TOKEN}\b`,
  "i",
);
// Un volcado del entorno dentro de una sustitución de orden (`$(env)`, `$(printenv)`, `$(set)`,
// `$(declare -p)`, `$(export -p)`, `$(Get-ChildItem Env:)`) lleva el token a la orden de fuera.
const VOLCADO_EN_SUSTITUCION =
  /^(?:(?:command|builtin|exec|sudo|nohup)\s+|\w+=\S*\s+)*(?:\S*[\\/])?(?:(?:env|printenv)(?:\s+-\S+)*|set|(?:declare|typeset)\s+-\w*[px]\w*|export(?:\s+-p)?|(?:Get-ChildItem|gci|dir|ls|Get-Item|gi)\s+Env:[\\/]?\*?)\s*$/i;

/** ¿Alguna `$(…)` o par de acentos graves vuelca el entorno, a secas o filtrado por algo que pide secretos? */
function volcadoEnSustitucion(texto) {
  if (!EJECUTA_DENTRO.test(texto)) return false;
  const dentro = [...texto.matchAll(/\$\(([^)]*)/g), ...texto.matchAll(/\x60([^\x60]*)\x60/g)].map((m) => m[1]);
  return dentro.some((c) => {
    const segs = c.split(/\|\||&&|[|;&\n]/).map((x) => x.trim()).filter(Boolean);
    const i = segs.findIndex((x) => VOLCADO_EN_SUSTITUCION.test(x));
    if (i < 0) return false;
    const despues = segs.slice(i + 1);
    const filtrado = /\|/.test(c) && despues.length > 0 && FILTRA_SIN_TOKEN.test(despues[0]) && !PIDE_SECRETOS.test(c);
    return !filtrado;
  });
}
// La caché del token de sesión (scripts/lib/cacheTokenSesion.mjs) y el directorio de entorno de las sesiones de Claude.
// `token-sesion.json` es la caché; `token-sesion.mjs` es el envoltorio y no se toca.
// También el directorio, porque un comodín o un `ls` no necesitan el nombre del fichero:
// `…\AppData\Local\MenuPlan`, `$LOCALAPPDATA/MenuPlan`, `%LOCALAPPDATA%\MenuPlan`, `~/.claude/token-*`, `~/.claude/sess*`.
const FICHERO_DEL_TOKEN =
  /token-sesion\.json|\bsession-env\b|AppData[\\/]Local[\\/]MenuPlan|LOCALAPPDATA\W{0,3}[\\/]?MenuPlan|\.claude[\\/](?:token|sess)[\w.-]*[*?[]/i;
// Una orden que lleva su texto a otro intérprete: `bash -c '…'`, `eval`, `iex`, `pwsh -c`, `cmd /c`.
const INTERPRETE_DENTRO =
  /(?:^|[\s;&|(])(?:(?:ba|z|da|k)?sh\s+(?:-\S+\s+)*-\w*c\b|eval\b|iex\b|Invoke-Expression\b|(?:pwsh|powershell)(?:\.exe)?\s+(?:-\S+\s+)*-(?:c|command)\b|cmd(?:\.exe)?\s+\/c\b)/i;
// Un `git log` o `git grep` del repo solo nombra la ruta (no lee nada de fuera); con `$(…)`, acentos graves o `--no-index` no vale.
const GIT_SOLO_DEL_REPO = /^git\s+(?:log|grep)\b(?![^\n]*--no-index)(?![^\n]*(?:\$\(|\x60))/;

/** Como `quitarHeredocs`, pero solo los de delimitador entrecomillado o con barra: su cuerpo no se expande. */
function quitarHeredocsLiterales(texto) {
  const lineas = texto.split("\n");
  const fuera = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    fuera.push(l);
    const m = l.match(/<<-?[ \t]*(?:(['"])([A-Za-z_]\w*)\1|\\([A-Za-z_]\w*))/);
    if (!m || /\b(?:ba|z|da|k)?sh\b|\bpwsh\b|\bpowershell\b|\bsource\b|\bxargs\b/i.test(l)) continue;
    const marca = m[2] ?? m[3];
    const fin = lineas.findIndex((x, j) => j > i && x.trim() === marca);
    if (fin > i) i = fin;
  }
  return fuera.join("\n");
}

/**
 * Lo que el shell expandiría: quita el texto entre comillas simples (en PowerShell
 * también), los heredocs de delimitador entrecomillado y el `$` escapado. Lo que va entre
 * comillas dobles se queda, porque ahí `$GH_TOKEN` sí se sustituye.
 *
 * El carácter de escape (fuera de comillas simples) se come SIEMPRE el siguiente: `\\$X` es una
 * barra literal y el `$X` se expande, y `\'` no abre una comilla simple. Con `envuelto` (la
 * orden lleva `bash -c`, `eval`, `iex`…) las comillas simples no protegen nada: el intérprete
 * de dentro expande lo que lleven.
 */
function loQueSeExpande(cmd, powershell, envuelto = false) {
  const t = quitarHeredocsLiterales(String(cmd).replace(/\\\r?\n/g, " "));
  const escape = powershell ? "`" : "\\";
  let fuera = "";
  let estado = ""; // "" | "'" | '"'
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (estado === "'") {
      if (c === "'") estado = "";
      continue;
    }
    if (c === escape && i + 1 < t.length) {
      i++; // el carácter escapado es literal: ni variable ni comilla
      continue;
    }
    if (c === "'" && estado === "" && !envuelto) {
      estado = "'";
      continue;
    }
    if (c === '"') estado = estado === '"' ? "" : '"';
    fuera += c;
  }
  return fuera;
}

/**
 * ¿La orden usa el token (o el fichero que lo guarda) como argumento, se use como se use?
 * Es lo que `imprimir` no veía: `gh issue comment -b "$GH_TOKEN"`, `curl -H "Authorization:
 * token $GH_TOKEN"`, `cat` de la caché o de `~/.claude/session-env`. Filtro de buena fe, no
 * barrera (ver la cabecera): no ve una variable intermedia, un script ni otro intérprete.
 * La variable se busca en lo que el shell expandiría (dobles sí, simples no); los ficheros,
 * en la orden sin los textos de mensajes (`-m`, `--body`…) pero SIN quitar las comillas
 * simples: `cat 'ruta\token-sesion.json'` sigue siendo leer el fichero.
 */
export function tokenComoArgumento(cmd, { powershell = false } = {}) {
  const crudo = String(cmd);
  if (volcadoEnSustitucion(loQueSeExpande(crudo, powershell, INTERPRETE_DENTRO.test(crudo)))) return true;
  if (!/GH_|GITHUB_|token-sesion|session-env|MenuPlan|\.claude/i.test(crudo)) return false;
  const sinMensajes = sinTextos(crudo);
  const envuelto = INTERPRETE_DENTRO.test(sinMensajes);
  if (TOKEN_COMO_ARGUMENTO.test(loQueSeExpande(crudo, powershell, envuelto))) return true;
  // Los ficheros, por trozos: un `git log`/`git grep` del repo que solo nombra la ruta no la lee.
  return trozos(sinMensajes).some((t) => FICHERO_DEL_TOKEN.test(t.texto) && !GIT_SOLO_DEL_REPO.test(t.texto));
}

/** La orden entera (puede llevar varias): la primera familia que salta, o null. */
export function credencialDeComando(cmd, { powershell = false } = {}) {
  if (tokenComoArgumento(cmd, { powershell })) return "imprimir";
  const lista = trozos(sinTextos(cmd));
  for (const t of lista) {
    const familia = credencialDeSesion(t.texto, { powershell, tuberia: t.tuberia, siguiente: t.siguiente });
    if (familia) return familia;
  }
  // #328: como la regla op-de-pablo de la guardia grande, sobre la orden entera partida por órdenes.
  // Atajo: toda rama de `opDeSesion` necesita «op», «--vault» o «item»; sin ninguno no se parte la orden.
  if (/op|--vault|\bitem\s/i.test(cmd) && ordenesOp(cmd).some(opDeSesion)) return "op";
  return null;
}

/**
 * Los avisos, en llano y con el remedio, uno por familia de `credencialDeComando` (las siete de `credencialDeSesion` y `op`).
 * Hasta #878 salían de avisos-guardia.mjs (cuatro partes fijas, #494); al desconectar la guardia
 * grande se copian aquí, con las mismas partes (qué, por qué, en su lugar y a quién pedírselo),
 * para que este fichero no importe nada.
 */
const RENOVAR = "Si el token ha caducado (dura 1 hora), pide uno nuevo con `node scripts/token-sesion.mjs -- <comando>` (por ejemplo `node scripts/token-sesion.mjs -- gh pr list` o `-- git push`).";
export const AVISOS_CREDENCIALES = Object.freeze({
  token: `Quitar o vaciar GH_TOKEN. Por qué: deja a gh y a git con las credenciales de Pablo (administrador): la sesión va con la identidad de la App homenu-sesiones a propósito (#447). En su lugar: ${RENOVAR}`,
  identidad: `Cambiar de dónde saca git sus credenciales o quién firma (credential.helper, GIT_CONFIG_*, GIT_AUTHOR_*, GIT_COMMITTER_*). Por qué: es salirse de la identidad de la sesión (#447). En su lugar: si un push o un commit falla, mira el error y cuéntalo en vez de rodearlo. ${RENOVAR}`,
  guardadas: `Sacar o cambiar las credenciales guardadas del PC (gh auth token, login o switch, git credential, cmdkey). Por qué: es salirse de la identidad de la sesión (#447). En su lugar: ${RENOVAR} Si hace falta de verdad una credencial de Pablo, dale el comando para que lo lance él con \`!\`. Pídeselo a: Pablo.`,
  reglas: "Cambiar las reglas del repo (rulesets, protección de ramas, colaboradores, secretos, variables, ajustes del repo, environments, hooks o llaves). Por qué: es solo de Pablo (#447): hace falta una credencial de administrador, que la sesión no tiene. En su lugar: prepara el cambio y el comando exacto; una consulta de GraphQL desde un fichero tampoco se puede leer: escríbela en el propio comando. Pídeselo a: Pablo, para que lo lance él con `!`.",
  aprobar: "Aprobar un PR desde una sesión. Por qué: aprobar un PR no es cometido de una sesión (#447, #608). En su lugar: deja el PR listo con el CI en verde. Pídeselo a: el juez revisor y el CI; Pablo solo fusiona a main.",
  imprimir: "Imprimir el token de la sesión, usarlo como argumento o nombrar la ruta de su caché o de session-env (también el directorio o con comodín). Por qué: lo dejaría en la conversación o en un texto público (#447, #715). En su lugar: para comprobar que existe, usa `node scripts/token-sesion.mjs --comprobar`, que dice si vale sin enseñarlo.",
  powershell: "Lanzar gh o git (push, pull, fetch, clone) desde PowerShell sin envoltorio. Por qué: en PowerShell la sesión no lleva el token de la App: gh y git irían con las credenciales de Pablo (#447). En su lugar: usa Bash, o envuélvelo: `node scripts/token-sesion.mjs -- <comando>`.",
  op: "Leer 1Password fuera de `npm run op -- …`, o tocar lo que es de Pablo. Por qué: las sesiones leen solo con la cuenta de servicio de `HoMenu-sesiones`, y `op` a pelo, sin token, iría por la app y le sacaría una ventana a Pablo (#328). En su lugar: usa siempre `npm run op -- …`, sin `MENUPLAN_OP_PABLO`, sin tocar `OP_SERVICE_ACCOUNT_TOKEN` y sin `op://HoMenu`; si solo es texto de un commit, PR o issue, pásalo por fichero (`git commit -F`, `--body-file`). Pídeselo a: Pablo, desde su propia terminal, si hace falta algo de producción.",
});
