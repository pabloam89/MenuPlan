-- Con qué prueba se apuntó que un Telegram ES una cuenta (#1238, trozo 3 de specs/auth.md §7).
-- AUDITADA: auditor-datos 2026-11-04 OK
--   (agente independiente, desde el repo: columna nullable con lector en cuentas.js y escritor en apuntarPrueba, CHECK
--   igual a PRUEBAS_IDENTIDAD y llamado _vocabulario, sin tocar filas, RLS ni permisos, y plan B que no tumba el enlace.
--   Sin leer producción (cuota de 1Password): ni tamaño de bot_identities ni ensayo; columna sin default, sin reescritura.
--   En su primera pasada pidió dar nombre al CHECK y nombrar apuntarPrueba en la cabecera: hecho)
--
-- «Entrar con Telegram» abre una cuenta de Google o Apple solo si ese Telegram se conectó a Lola desde dentro de esa
-- cuenta: el enlace de «Conectar Telegram» que sacó una sesión de esa cuenta (api/bot/link.js), pulsado en el privado
-- de ese Telegram. bot_identities dice qué cuenta es un Telegram, pero no con qué prueba se apuntó: la prueba solo vive
-- al escribir (el parámetro `identidad` de enlazarChat, api/_bot/enlace.js), y el código del email, una invitación o
-- la cuenta nacida en Telegram acaban en la misma fila.
--
--   · bot_identities.prueba_identidad (nueva, nullable): la prueba con la que se apuntó la fila, de la lista cerrada
--     PRUEBAS_IDENTIDAD de src/lib/vocabularios.js (nacida, codigo_email, ajustes, cambio). La escribe enlace.js
--     (apuntarPrueba) y la lee cuentas.js (cuentaConectadaDesdeLaApp), que solo abre sesión con ajustes o cambio.
--   · Principio 1 roto a la vista (docs/datos/PRINCIPIOS.md): nullable. Las filas de antes no dicen con qué prueba se
--     apuntaron y no se rellenan: null es «no se sabe», y no abre nada. Quien quiera entrar así se conecta otra vez
--     desde la app, y la fila pasa a ajustes.
--
-- NO hace: no cambia ninguna fila, ni RLS ni permisos (bot_identities sigue con RLS sin políticas, 0057).
-- Plan B (regla migraciones): sin ella, el update de la prueba falla, se apunta en el log (seguirCon) y el enlace
-- sigue; la lectura no encuentra la columna y nada abre sesión: el 403 de hoy.
-- Testigo: la columna public.bot_identities.prueba_identidad.

set lock_timeout = '5s';

alter table public.bot_identities
  add column if not exists prueba_identidad text
  constraint bot_identities_prueba_identidad_vocabulario check (prueba_identidad in ('nacida', 'codigo_email', 'ajustes', 'cambio'));

comment on column public.bot_identities.prueba_identidad is
  'Con qué prueba se apuntó que este Telegram es la cuenta (#1238): nacida, codigo_email, ajustes o cambio. Null en las de antes de la 0129. Escribe api/_bot/enlace.js; lee api/_bot/cuentas.js (solo ajustes y cambio abren sesión).';
