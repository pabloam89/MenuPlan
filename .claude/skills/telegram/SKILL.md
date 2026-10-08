---
name: telegram
description: Úsala al operar el bot de Telegram: Lola no contesta, poner, mirar o quitar el webhook, la foto del bot o su perfil en BotFather, los comandos del menú «/», meter a Lola en un grupo, el bot de pruebas, la checklist de la compra o mensajes que llegan repetidos. No para: cómo se escribe el código de Lola (regla lola y agente lola).
---

# Telegram

Esto es operar la plataforma. Cómo se escribe el código de Lola está en
`.claude/rules/lola.md` y en el agente `lola`.

## Qué es y dónde

- **Un solo bot**, «Lola de HoMenu». Su usuario sale de
  `TELEGRAM_BOT_USERNAME`. Un bot tiene **un único webhook**: apunta a un
  despliegue (producción o staging) y no a los dos. Antes de tocarlo, mira a
  cuál apunta (`info`, abajo).
- **El webhook** es `api/bot/telegram.js`. Contesta a Telegram al momento y
  trabaja después con `waitUntil`. En `vercel.json` tiene `maxDuration: 120` y
  los ficheros que necesita en `includeFiles`.
- **Grupos familiares**, solo en Telegram de momento. Con el modo privacidad
  por defecto, en un grupo Lola solo ve comandos, menciones y respuestas a sus
  mensajes, y así se decidió.
- **Mini App**: retirada el 30 sep 2026. Se entra en la app con el enlace de
  `/app`, no con una Mini App.
- **Bot de pruebas: no hay.** El token es uno y el webhook, uno: probar contra
  staging significa moverle el webhook al bot de verdad. Si se crea uno
  (BotFather → `/newbot`), sus claves van a 1Password y a `ops/INVENTARIO.md`, y
  esta skill se actualiza.
- **Decidido, sin implementar (2 oct 2026): la lista de la compra viva.** En
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

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; hoy no se ha vuelto a ejecutar lo que cita. Sin comprobar: la checklist nativa (no está implementada) ni un bot de pruebas (no existe).
