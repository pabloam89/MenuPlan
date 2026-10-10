---
name: alta-de-secreto
description: Úsala al dar de alta, rotar o retirar una clave, token o credencial, de punta a punta: «nuevo token», «API key para…», «secreto para el workflow», «bot nuevo», «ha caducado», «toca rotarla», una clave filtrada o vista en un log, o crear o mover la ficha de 1Password donde se guarda. Dice ámbito y caducidad, ficha y bóveda, cómo llega a GitHub, Vercel o el servidor sin verse, cómo se comprueba y se apunta. No para: leer una clave desde un script (1password), operar el servicio (su skill), la clave de las copias cifradas (hetzner), ni bajar o listar variables de Vercel (vercel).
metadata:
  tipo: receta_cambio
  dueno: gobierno
  comprobado: 2026-10-10
---

# Alta de un secreto

## Cuándo y para qué

Para dar de alta una clave o un servicio de punta a punta sin que el valor
salga en pantalla, en la conversación, en un argumento ni en el repo
(que es público), y sin dejarla con más alcance o más vida de la que necesita.
Se dieron de alta cinco seguidas (el bot de avisos, el token de Vercel del
vigía, una clave de Anthropic, la del canario y la del rol de copias) y cada una
tropezó en algo distinto (#398): por eso es receta.

Cubre también **rotar** (es un alta nueva más la retirada de la vieja) y
**retirar** una clave que ya no se usa.

No es para:
- leer una clave desde un script o `.env.local`: skill `1password` (`leerEnv`);
- la clave privada de las copias cifradas, que tiene su propio procedimiento:
  skill `hetzner` y `.claude/skills/hetzner/referencias/copias-base.md`;
- la contraseña de un rol de solo lectura de la base: la ponen
  `scripts/clave-consulta-lectura.mjs` y `scripts/clave-copia-lectura.mjs`, que
  ya siguen esta receta; aquí solo el paso 6 (apuntarla);
- operar el servicio en sí (webhook, despliegues, workflows): su skill.

## Método

Cada paso, con lo que sale. Los comandos con «(Pablo)» los lanza él con `!`:
crear, rotar o cambiar un secreto es siempre suyo. <!-- norma:secretos-ok-pablo -->

1. **Una clave, un uso.** Decide quién la usa (un workflow, el despliegue, un
   script del PC, el servidor) y no reutilices la de otro uso: si se filtra o
   caduca, solo cae ese. Sale: una línea «para qué, quién la lee, dónde vive».
2. **Créala en el servicio con el ámbito mínimo y caducidad** (tabla de
   abajo). Si el servicio deja poner caducidad, se pone: 90 días por defecto,
   el mismo plazo que una skill. Si no deja, se dice en el inventario que no
   caduca y cuándo se revisa. Sale: el token en el portapapeles o en la
   pantalla del servicio, **no** en la conversación.
3. **Guárdala en su ficha** (Pablo, en la app de 1Password o por un script con
   la ficha en JSON por stdin; skill `1password`):
   - bóveda `HoMenu` si la leen los scripts del PC o el despliegue; `Panel
     HoMenu` si es del servidor o no debe leerse sin aprobar;
   - antes, `node scripts/op.mjs item list --vault HoMenu` (solo títulos): si
     ya hay ficha de ese servicio y uso, es una rotación; la de otro servicio
     no se reutiliza;
   - **una ficha por servicio y uso**, con nombre sin tildes ni signos (solo
     letras, cifras, espacios, `-`, `_` y `.`): una tilde rompe las direcciones
     `op://`;
   - **el campo se llama como la variable** (`VERCEL_TOKEN`), y en la ficha va
     la caducidad;
   - si la leen los scripts, su línea en `ops/env.1password`.
   Sale: `op item get "<Ficha>" --vault <bóveda> --fields label=<CAMPO>` (sin
   `--reveal`) responde `[use 'op item get … --reveal' to reveal]`: el campo
   existe y está oculto.
4. **Pásala a donde se usa, por tubería y leyendo por nombre de ficha** (no
   por `op://`, que no admite tildes). `op item get … --reveal` acaba en un
   salto de línea, y ni `gh secret set` ni `vercel env add` dicen en su ayuda
   que lo recorten: se recorta con `tr -d '\r\n'` en la tubería. Un documento
   de varias líneas (un `.pem`) no se recorta y va con `op document get`.
   - **GitHub**: siempre en un **environment con política de ramas** (solo <!-- norma:secretos-en-environments -->
     `staging`), nunca secreto de repo. <!-- norma:secretos-de-repo --> El environment se crea antes, a mano
     (Pablo; si el workflow lo nombra sin existir, GitHub lo crea sin
     política: skill `github`). Luego
     `node scripts/op.mjs item get "<Ficha>" --vault HoMenu --fields label=<CAMPO> --reveal | tr -d '\r\n' | gh secret set <NOMBRE> --env <environment>`.
     Lo que no es secreto (un id, una URL pública) va como variable:
     `gh variable set <NOMBRE> --env <environment> --body <valor>`.
   - **Vercel**: `… | tr -d '\r\n' | vercel env add <NOMBRE> <entorno>` lee el
     valor de stdin, con la CLI recién entrada por Pablo (`! npx vercel login`)
     y su `logout` al acabar (skill `vercel`). Si la variable ya existe (al
     rotar), se niega: `--force` la sobrescribe (CLI 62.1.0). Solo en los
     entornos que la usan: si no, Preview la tiene sin necesitarla.
   - **Servidor**: la misma tubería hacia la `ssh` de Windows, escribiendo un
     fichero de root con permisos 600 (skill `hetzner`). Sus claves viven en
     `Panel HoMenu`, que la service account no lee: `env -u
     OP_SERVICE_ACCOUNT_TOKEN op item get "<Ficha>" --vault <id de la bóveda> …`
     (el id, no el nombre, y se aprueba en la app; skill `1password`).
   Sale: `gh secret list --env <environment>` con el nombre y la fecha de hoy;
   en Vercel, el nombre en el entorno pedido.
5. **Comprueba sin enseñarla** («Cómo se comprueba»): forma y una llamada
   gratis. Sale: `forma: ok` y un 200.
6. **Apúntala en `ops/INVENTARIO.md`**: nombre de la variable, para qué, cuenta
   dueña, ficha y bóveda, dónde está (environment de GitHub, entornos de
   Vercel, fichero del servidor), ámbito, fecha de alta y **fecha de
   caducidad**. El valor, no. Sale: la fila en el mismo PR que el workflow o
   el código que la usa.
7. **Rotar**: a los 14 días de caducar, al irse alguien con acceso, si salió en
   un log, en la conversación o en un aviso de secret scanning, o si se guardó
   donde no tocaba. Se hace un alta nueva (pasos 2 a 5) en **la misma ficha y
   campo**, así ninguna dirección cambia. Se pone en **cada destino tal como
   está hoy** según el inventario: si hoy es secreto de repo, ahí
   (`gh secret set <NOMBRE>` sin `--env`), porque el workflow que lo lee no
   declara `environment:` y no vería uno nuevo. Pasarla a un environment es
   otro cambio, con `environment:` en el workflow (norma `secretos-de-repo`,
   rama «ops/secretos-a-environments»). Se comprueba por forma y con la llamada
   gratis, **y solo entonces** se revoca la vieja en el servicio y se cambia la
   fecha en el inventario.
8. **Retirar**: se quita de cada destino del inventario, se revoca en el
   servicio, se archiva la ficha y se borra la fila (o se marca «retirada» con
   fecha).

### Dónde se crea cada una

| Servicio | Dónde | Ámbito | Caducidad |
|---|---|---|---|
| GitHub | primero el `GITHUB_TOKEN` del workflow con `permissions:` mínimos; si no basta, una GitHub App propia (como `homenu-dependabot-merge`) o un token *fine-grained* de un solo repo | solo `pabloam89/MenuPlan` y solo los permisos que pide la API | token: 90 días; clave de App y deploy key no caducan, se rotan (skill `github`) |
| Vercel | Account Settings → Tokens | **«Full Account»** si lo usa la CLI (`vercel logs`, `vercel env`): con ámbito de equipo la CLI dice «User not found» (skill `vercel`) | 90 días, fecha en el inventario y rotación antes <!-- norma:caducidad-token-vercel --> |
| Anthropic | Console → API keys, en el workspace del uso, con límite de gasto del workspace | no hay permisos por clave: el límite lo pone el workspace | la de las evals, al año <!-- norma:caducidad-clave-anthropic-evals --> (#297; sin comprobar en la consola); si la consola no deja ponerla, se dice en el inventario y se revisa cada 90 días |
| Telegram | @BotFather: `/newbot` da el token; `/revoke` lo rota | el bot entero | no caduca |
| Supabase | un rol propio con lo justo (`scripts/clave-*.mjs`); la clave de servicio salta la RLS y solo la usa el despliegue | `select` en lo que lee, nada más | la del rol se rota archivando la ficha y relanzando su script (skill `supabase`) |
| Un secreto nuestro (`CANARIO_SECRET`, `BOT_CRON_SECRET`) | lo genera un script en memoria (`crypto.randomBytes(32)`) y lo pasa por stdin a la ficha | abre un solo endpoint | se rota si sale de su sitio |

## Antes de empezar

- **Abre las skills del camino**: `1password` (fichas, service account, la
  app de escritorio para escribir) y la del destino (`github`, `vercel`,
  `hetzner`). La guardia pide abrirlas antes de `op item`, `gh secret`,
  `vercel env` o `ssh` al panel.
- **Mira si ya existe**: `ops/INVENTARIO.md` y
  `node scripts/op.mjs item list --vault HoMenu` (solo títulos). Si ya hay
  ficha para ese servicio y uso, es una rotación, no un alta.
- **El environment de GitHub existe y tiene su política** antes de subir el
  secreto: `gh api repos/pabloam89/MenuPlan/environments/<env>/deployment-branch-policies -q '.branch_policies[].name'`
  devuelve `staging`.
- **La app de 1Password abierta y desbloqueada** (escribir pasa por ella y
  pide aprobar; la service account solo lee `HoMenu`).
- **El valor, fuera de los comandos**: ni `--body <clave>`, ni `echo <clave> |`,
  ni la URL con la clave dentro. Va por tubería desde `op` o desde el script
  que la genera.

## Cómo se comprueba

- **Forma**, sin verla: `node scripts/op.mjs item get "<Ficha>" --vault HoMenu --fields label=<CAMPO> --reveal | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{s=s.trim();console.log('largo:',s.length,'forma:',/^[\x21-\x7e]+$/.test(s)?'ok':'MAL')})"`
  → `largo: N forma: ok`. Un largo de 0 o un salto de línea dentro es ficha o
  campo equivocado.
- **Una llamada gratis**, con la clave leída de stdin dentro de Node (no en
  la línea de comandos) e imprimiendo solo el código HTTP:

| Servicio | Llamada gratis | Debe salir |
|---|---|---|
| Anthropic | `GET https://api.anthropic.com/v1/models` con `x-api-key` y `anthropic-version: 2023-06-01` | 200 (401 si la clave no vale) |
| Vercel (CLI) | `GET https://api.vercel.com/v2/user` con `Authorization: Bearer` | 200; un 404 es un token de equipo que la CLI no acepta |
| Telegram | `getMe` del bot | `ok: true` y el usuario del bot esperado |
| GitHub (token) | `GET https://api.github.com/repos/pabloam89/MenuPlan` | 200 |
| Supabase (rol) | `select current_user` con la URL del rol | el nombre del rol, y `read only` si es de lectura |
| GitHub (secreto ya subido) | `gh workflow run <workflow> --ref staging` y su log | la línea del workflow que dice que lo ve (p. ej. `clave-app: si`) |

### Lista de comprobación

La cita `ops/mecanismos.json` (`entorno_aprobador` y `permisos_identidad`). Cada
clave nueva o rotada, antes de dar el alta por hecha:

- [ ] Un solo uso, y su ficha es de ese servicio y ese uso.
- [ ] Nombre de ficha sin tildes ni signos; campo con el nombre de la variable.
- [ ] Ámbito mínimo: el permiso que pide la API, un solo repo o proyecto, un rol
      propio en vez de la clave de servicio.
- [ ] Caducidad puesta en el servicio (90 días) o «no caduca» dicho en el
      inventario con su fecha de revisión.
- [ ] En GitHub, en un environment con política de ramas; ningún secreto de
      repo nuevo.
- [ ] En Vercel, solo en los entornos que la leen.
- [ ] Comprobada por forma y con una llamada gratis, sin enseñarla.
- [ ] Fila en `ops/INVENTARIO.md` con ficha, destinos, ámbito, alta y caducidad.
- [ ] Si es rotación: la vieja revocada después de comprobar la nueva.

## Qué requiere el OK de Pablo

<!-- norma:secretos-ok-pablo -->

- Crear, rotar, retirar o cambiar cualquier clave, ficha o variable de
  entorno, en el servicio, en 1Password, en GitHub, en Vercel o en el servidor.
- Crear un environment de GitHub o cambiar su política.
- Dar a una clave más ámbito del mínimo o quitarle la caducidad.
- Una sesión prepara los comandos y los deja listos para pegar con `!`; leer
  con la service account y comprobar la forma no lo requieren.

## Lo que falló y por qué

- **2026-10-09 · una CLI que en local funcionaba no encontraba su proyecto en el runner de Actions.** Causa: en local la CLI lee el enlace del proyecto de una carpeta que el checkout del runner no trae (en Vercel, `.vercel/`). Arreglo: el workflow le pasa los ids del proyecto por variables de entorno, que no son secretas (`VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`; skill `vercel`). Al dar de alta una clave para una CLI en Actions, se prueba en el runner, no solo en el PC.
- **2026-10-09 · el generador de 1Password no daba la longitud que pedía el secreto.** Causa: el generador de contraseñas tiene un límite de longitud y de juego de caracteres. Arreglo: los secretos nuestros los genera el script en memoria con `crypto.randomBytes(32)` (como `claveNueva` de `scripts/lib/rolLectura.mjs`) y los pasa por stdin a la ficha.
- **2026-10-09 · un token de Vercel recién creado no le valía a la CLI.** Causa: se creó con ámbito de equipo, y la CLI pregunta primero por el usuario. Arreglo: para la CLI, ámbito «Full Account» y 90 días; comprobado con `GET /v2/user` (lección completa en la skill `vercel`).
- **2026-10-09 · una dirección `op://` no resolvía aunque la ficha existía.** Causa: el nombre de la ficha llevaba una tilde, y las direcciones `op://` solo admiten letras sin acento, cifras, espacios, `-`, `_` y `.`. Arreglo: leer por nombre de ficha con `op item get` y nombrar las fichas nuevas sin tildes (skill `1password`).
- **2026-10-09 · una clave se guardó en la ficha de otro servicio.** Causa: no había regla de qué ficha le toca a cada clave, y se aprovechó una abierta. Arreglo: una ficha por servicio y uso, el campo con el nombre de la variable, mirar antes `op item list` y releer ficha y campo por nombre en el paso de forma.

## Registro de cambios

- **2026-10-10** · Descriptions afinadas (aquí, en `1password`, `vercel` y `hetzner`) tras el disparo 4 de 8 de la primera pasada; mirar las fichas antes y cada destino al rotar (#398).
- **2026-10-10** · Primera versión, con los cinco tropiezos del 9 oct y la lista de comprobación que cita `ops/mecanismos.json` (#398).

## Fuentes y comprobación

- https://developer.1password.com/docs/cli/secret-reference-syntax/
- https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment
- https://cli.github.com/manual/gh_secret_set
- https://vercel.com/docs/rest-api#creating-an-access-token
- https://docs.anthropic.com/en/api/models-list
- https://core.telegram.org/bots/api#getme

Comprobado el 2026-10-10: los nombres de los secretos y variables del environment `vigia` (`gh secret list --env vigia`, alta del 9 oct) y que el repo aún tiene secretos sueltos de antes de esta norma; los cinco tropiezos, por el encargo #398 y la skill `vercel`. Sin comprobar: el límite exacto del generador de 1Password, `vercel env add` contra el entorno personalizado de staging, y si `gh secret set` o `vercel env add` recortan el salto de línea final que deja `op item get` (su ayuda no lo dice; por eso el `tr -d`). La opción `--force` de `vercel env add` se leyó en la ayuda de la CLI 62.1.0, sin usarla.
