---
name: telegram
description: Úsala al operar el bot de Telegram: Lola no contesta, poner, mirar o quitar el webhook, la foto del bot o su perfil en BotFather, los comandos del menú «/», meter a Lola en un grupo, el bot de pruebas, la checklist de la compra o mensajes que llegan repetidos. No para: cómo se escribe el código de Lola (regla lola y agente lola).
metadata:
  tipo: herramienta
  dueno: lola
  comprobado: "2026-10-09"
---

# Telegram

Esto es operar la plataforma. Cómo se escribe el código de Lola está en
`.claude/rules/lola.md` y en el agente `lola`.

## Qué es y dónde

- **Un solo bot que habla con familias**, «Lola de HoMenu». Su usuario sale de
  `TELEGRAM_BOT_USERNAME`. Un bot tiene **un único webhook**: apunta a un
  despliegue (producción o staging) y no a los dos. Antes de tocarlo, mira a
  cuál apunta (`info`, abajo). Al día de «Fechas» apuntaba a staging
  (`homenu-staging.vercel.app`).
- **Bot de avisos «HoMenu avisos»** (#267, pendiente de crear; día en «Fechas»):
  solo escribe en un grupo con Pablo, Álvaro y Manu lo que manda el vigía
  (`.github/workflows/vigia-lola.yml`, `scripts/vigia.mjs`). No tiene webhook
  ni lee nada; no es Lola. Manu no tiene acceso al repo: **ningún aviso lleva
  datos de familias**, solo cifras, motivos, sitios y enlaces. Token en
  1Password (`HoMenu/Telegram avisos`) y en el environment `vigia` de GitHub,
  `AVISOS_TELEGRAM_TOKEN`; el chat del grupo, en la variable
  `AVISOS_TELEGRAM_CHAT`.
- **El canario** (`api/bot/canario.js`) llama al webhook de Lola de su propio
  despliegue con una actualización sin chat (`{"update_id":0}`): contesta 200
  sin abrir la base. Si en los logs ve llamadas así cada 15 min, es él.
- **El webhook** es `api/bot/telegram.js`. Contesta a Telegram al momento y
  trabaja después con `waitUntil`. En `vercel.json` tiene `maxDuration: 120` y
  los ficheros que necesita en `includeFiles`.
- **Grupos familiares**, solo en Telegram de momento. Con el modo privacidad
  por defecto, en un grupo Lola solo ve comandos, menciones y respuestas a sus
  mensajes, y así se decidió.
- **Mini App**: retirada (día en «Fechas»). Se entra en la app con el enlace de
  `/app`, no con una Mini App.
- **Bot de pruebas: no hay.** El token es uno y el webhook, uno: probar contra
  staging significa moverle el webhook al bot de verdad. Si se crea uno
  (BotFather → `/newbot`), sus claves van a 1Password y a `ops/INVENTARIO.md`, y
  esta skill se actualiza.
- **Decidido, sin implementar (día en «Fechas»): la lista de la compra viva.** En
  Telegram usará la checklist nativa de la Bot API 9.1 (`sendChecklist`,
  `editMessageChecklist`), que permite tachar tocando sin escribir a Lola. En
  WhatsApp, mensajes interactivos repintados (10 elementos como máximo, por
  páginas). Una sola función de dominio con un formateador por canal.

## Claves y accesos

Nombres, dueño y dónde viven: `ops/INVENTARIO.md` (fila Telegram). En local
son direcciones de 1Password (`ops/env.1password`, skill `1password`). En
Vercel están en las variables del proyecto. No se repiten aquí.

`TELEGRAM_WEBHOOK_SECRET` tiene que ser **el mismo valor** en tu `.env.local`
(con el que registras el webhook) y en el despliegue al que apunta el webhook.
Si no coinciden, cada mensaje recibe un 401 y Lola no contesta. El perfil y el
menú se editan desde @BotFather con la cuenta de Telegram de Pablo.

## Operaciones habituales

Todos leen la clave de `.env.local` con `scripts/lib/env.mjs`.

| Qué | Comando | Debe salir |
|---|---|---|
| Ver el bot, a dónde apunta el webhook y los errores recientes | `node scripts/telegram-webhook.mjs info` | la URL del webhook y el último error, si lo hay |
| Apuntar el webhook a un despliegue (OK) | `node scripts/telegram-webhook.mjs set https://<dominio>/api/bot/telegram` | confirmación de Telegram; `info` enseña la URL nueva |
| Quitar el webhook (OK) | `node scripts/telegram-webhook.mjs delete` | `info` sin URL |
| Ver el perfil (nombre, About, descripción, comandos) | `node scripts/telegram-perfil.mjs` | los textos actuales y sus longitudes |
| Subir el perfil y el menú «/» (OK) | `node scripts/telegram-perfil.mjs aplicar` | lo que hay en el script, ya en Telegram |
| Crear el bot de avisos (Pablo, una vez) | @BotFather → `/newbot` → nombre `HoMenu avisos` → usuario acabado en `bot`; luego `/setjoingroups` → Enable | el token (`123456:ABC…`), que va a 1Password `HoMenu/Telegram avisos` y al secreto `AVISOS_TELEGRAM_TOKEN` |
| Sacar el chat_id del grupo de avisos | meter al bot en el grupo, escribir `/hola@<usuario_del_bot>` en el grupo y abrir `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador (el bot de avisos no tiene webhook, así que `getUpdates` funciona) | `"chat":{"id":-100…,"type":"supergroup"}`: ese número, con su signo, es `AVISOS_TELEGRAM_CHAT` |
| Probar el aviso sin esperar a un fallo | `gh workflow run vigia-lola.yml --ref staging` | la pasada en Actions; la primera vez abre «El vigía, sin logs» si falta `VERCEL_TOKEN`, y ese aviso llega al grupo |
| Si se mueve el webhook de Lola | cambiar a la vez las variables `CANARIO_URL` y `VIGIA_ENTORNO` del repo | si no, el canario avisa `webhook_info (webhook_otra_url)` y el vigía mira logs donde ya no hay nadie |

- `set` y `delete` tiran los mensajes pendientes (`drop_pending_updates`). Lo
  que la gente escribió mientras tanto se pierde.
- `set` solo pide `message` y `callback_query`. Si una función nueva necesita
  otro tipo de actualización, hay que añadirlo en
  `scripts/telegram-webhook.mjs` y volver a hacer `set`.
- **La foto de perfil y el GIF de la descripción no tienen API**: se cambian a
  mano en @BotFather (`/setuserpic` y `/setdescription` con animación).
- Los textos del perfil y los comandos se editan en
  `scripts/telegram-perfil.mjs`, que avisa de los máximos: 64 caracteres el
  nombre, 120 el About y 512 la descripción.

## Lo que falló y por qué

- **2026-10-08 · mensajes atendidos dos veces.** Causa: Telegram reintenta con
  el mismo `update_id` si no le llega un 200 a tiempo, y no se guardaba.
  Arreglo: `api/_bot/entradas.js` apunta cada `update_id` en `bot_entradas`
  (migración `supabase/migrations/0088_bot_entradas.sql`) y descarta el
  repetido. Si la 0088 no está aplicada, se atiende como antes.
- **2026-09 · Lola no contesta a nada.** Causa: el webhook apunta a otro
  despliegue, o el secreto no coincide (401). Arreglo: `info` enseña la URL y el
  último error; `set` contra el despliegue correcto, con el secreto de ese
  entorno.
- **2026-09 · un turno largo y Telegram reintenta.** Causa: se trabajaba antes
  de contestar. Arreglo: se contesta al momento y se trabaja con `waitUntil`; no
  metas trabajo lento antes del `res.status(200)`.

## Qué requiere el OK de Pablo

- Mover el webhook de producción a otro despliegue, o quitarlo.
- Cambiar el token o el secreto (son secretos: skill `1password`).
- Cambiar la foto, el nombre, la descripción o los comandos que ven los
  usuarios.

## Coste y límites

Sin coste propio: la Bot API es gratuita. Límites que muerden: 64, 120 y 512
caracteres en nombre, About y descripción; una sola URL de webhook por bot; en
grupos, con el modo privacidad por defecto, Lola solo ve comandos, menciones y
respuestas a sus mensajes.

## Fuentes y comprobación

- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/webhooks
- https://core.telegram.org/bots/features#privacy-mode

**Ojo, sin aclarar (9 oct 2026):** `getMe` da `can_read_all_group_messages:
true`, que en Telegram significa el modo privacidad **apagado**, en contra de lo
que dice esta skill arriba. Mientras no se mire en @BotFather (`/setprivacy`),
no te fíes de que en un grupo Lola solo vea comandos y menciones.

Fechas que estaban repartidas por el cuerpo (#411): el webhook apuntaba a staging el 9 oct 2026; el bot de avisos seguía sin crear el 9 oct 2026; Mini App retirada el 30 sep 2026; lista de la compra viva decidida el 2 oct 2026.

Comprobado el 2026-10-09: `telegram-webhook.mjs info` (solo lectura) da el webhook en `https://homenu-staging.vercel.app/api/bot/telegram`, sin cola ni errores, y el canario (salud) pasó sus cuatro chequeos contra él; lo demás viene de la versión del 8 oct sin volver a ejecutarlo. Sin comprobar: la checklist nativa (no está implementada), un bot de pruebas (no existe), el bot de avisos y el chat_id de su grupo (no existen aún).
