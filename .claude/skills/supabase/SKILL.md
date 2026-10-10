---
name: supabase
description: Úsala para operar la base de datos de MenuPlan en Supabase: una consulta a producción, «¿está aplicada?», pg_cron y los crons del bot, el login y Auth (Google), copias o backup (lo que llevan; el cómo, hetzner), o cuando algo de la base no cuadra con el repo. No para: escribir una migración (regla migraciones y agente datos) ni el Postgres del panel en Hetzner (hetzner).
metadata:
  tipo: servicio
  dueno: gobierno
  comprobado: "2026-10-09"
---

# Supabase

## Qué es y dónde

- **Un solo proyecto, `mdzwbrworucnummibxrq` (eu-central-1), y es
  producción.** No hay base de staging: staging, local, los scripts y los evals
  escriben en ella. Cada escritura es en datos de familias reales.
- **De quién es**: cuelga del equipo de Vercel por el Marketplace (org
  `vercel_icfg_…`). El dueño y el que paga es el equipo de Vercel; no hay
  cuenta propia que transferir (día comprobado, en «Fechas» de Fuentes y comprobación).
- **Plan: «Supabase Free Plan»** (visto en Vercel y en Supabase; día en «Fechas» de Fuentes y comprobación):
  500 MB de base de datos, 500 MB de RAM, CPU compartida, 5 GB de ancho de
  banda, Frankfurt. **No incluye copias de seguridad** y tampoco la vuelta a un
  minuto (PITR, que además exige Pro y un extra de pago). En Supabase el
  proyecto cuelga de una organización que se llama «pabloartinano's projects»;
  en Vercel, de la integración `icfg_qokeOhoFb9v7MHJ1bq8Yl050`, enlazada al
  proyecto `dish-gallery-menuplan`. Los otros dos proyectos de Supabase de la
  cuenta (`menuplan-staging`, `supabase-coffee-flame`) están suspendidos.
- **Qué da**: Postgres, Auth (login con Google) y RLS. El código depende de
  las tres, por eso irse de Supabase no es un cambio de proveedor sin más.
- **Escribir migraciones** no es de esta skill: `.claude/rules/migraciones.md`,
  `docs/datos/PRINCIPIOS.md` y el agente `datos`.
- **Copias: propias, no de Supabase.** Decidido (#156; día en «Fechas» de Fuentes y comprobación): una copia
  cifrada cada noche en el servidor de Hetzner (encargo #247). Cómo se hace, se
  instala, se ensaya y se restaura: skill `hetzner`. Lo que lleva y lo que no:
  - Lleva `public` y `ops` enteros (esquema y datos), con `pg_dump` de solo
    lectura.
  - Lo hace el usuario propio `copia_lectura` (0095, #273): `select` en
    `public`, `ops` y sus secuencias (`secuencias: con-valor`), `bypassrls`
    (sin él `pg_dump` se para con la RLS), una sola conexión. Sin
    `bot_link_tokens`, `household_invites` ni `bot_codigos` (códigos efímeros
    que no hacen falta; `TABLAS_SIN_COPIA`): al restaurar se recrean vacías
    con sus migraciones.
  - **Lleva lo justo de `auth`** (`auth: si`): el esquema `copia` tiene dos
    vistas, `auth_usuarios` (id, email, teléfono, confirmaciones, anónimo, alta)
    y `auth_identidades` (id, user_id, provider, provider_id, alta), sin
    contraseñas, tokens ni metadatos; salen en CSV cifrado. Restaurar en
    **esta misma** base no las necesita (los usuarios siguen en `auth`). En un
    **proyecto nuevo** sí: 34 claves ajenas de 29 tablas apuntan a
    `auth.users`, y sin la identidad el login de Google crearía usuarios con
    otros ids. Al cargarlas en un `auth` de verdad faltan columnas que la copia
    no lleva a propósito: `aud` y `role` (`authenticated`) e `identity_data`
    (al menos `sub` = `provider_id` y el email). Sin ensayar todavía.
  - Si una copia sale `secuencias: sin-valor`, al restaurar se ponen al máximo
    de su columna con `SQL_SECUENCIAS` de `scripts/lib/copias.mjs`, o el
    siguiente insert chocaría.
- **Pendiente:** aplicar la 0095 y poner su contraseña, instalar las copias en
  el servidor y su primer ensayo (#247, #273).

## Claves y accesos

Nombres, para qué sirve cada una y dónde viven: `ops/INVENTARIO.md` (fila
Supabase). Las direcciones de 1Password, en `ops/env.1password`. La que usan
los scripts para conectar es `SUPABASE_DB_URL`, leída con `leerEnv` de
`scripts/lib/env.mjs`. No hay cuenta propia de Supabase: el acceso al panel
cuelga del equipo de Vercel.

`npm run consulta` entra con `SUPABASE_DB_URL_LECTURA`, el rol
`consulta_lectura` de la 0092 (solo `select` en `public` y `ops`, sin `auth`,
`cron`, `vault` ni `storage`). A todo o nada (#238): si la variable no está o
no se puede leer, falla; como administrador solo entra con `--admin` explícito
(`npm run consulta -- --admin "select …"`), y lo avisa. Su contraseña
la pone `node scripts/clave-consulta-lectura.mjs --si` (Pablo, con `!`): la
genera, crea la ficha «Supabase lectura» en HoMenu por stdin y a la base solo
le manda el verificador SCRAM. Lo que esté fuera de `public` y `ops` (p. ej.
`cron.job`) se mira con `verificar-estado` o con la de administrador.
Desde la 0095 hay columnas con códigos que no lee (`COLUMNAS_SIN_CONSULTA` de
`scripts/lib/rolLectura.mjs`). En sus seis tablas (`households`,
`user_profiles`, `apple_auth_tokens`, `bot_link_tokens`, `household_invites`,
`bot_codigos`) solo tiene `select` por columnas: **`select *` falla**, hay que
nombrar las columnas (`count(*)` sí vale). Una columna nueva en ellas no la ve
hasta que se le da.
**La frontera es la URL, no el rol**: el read only y los tiempos límite son
valores por defecto que la sesión puede cambiar, y con su propia sesión quien
tenga la URL puede usar `net.http_*`, objetos grandes o bloqueos consultivos
(concesiones de Supabase a todos; riesgo aceptado, cabecera de la 0092). Por
`consulta.mjs` no.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| ¿Está aplicada la 00XX? | `node scripts/verificar-estado.mjs --solo 00XX` (sin argumentos, todas; `--detalle` enseña cada testigo) | cada migración con su testigo; avisa de lo que no cuadra con `supabase/ESTADO.md`. Solo lectura, sin preguntar |
| Ensayar una migración | `node scripts/apply-migration.mjs <nombre>` (sin `--si`) | ejecuta y hace ROLLBACK |
| Aplicar una migración (OK, o Pablo con `!`) | `node scripts/apply-migration.mjs <nombre> --si` | exige estar en staging, un ensayo de menos de una hora y el OK de `auditor-datos` en la cabecera |
| Consulta a producción | como `scripts/verificar-estado.mjs`: `set session characteristics as transaction read only`, `begin read only`, solo `select`, `rollback` | filas o recuentos; aunque se colara un `update`, Postgres lo rechaza |
| ¿Qué plan y qué copias tiene? | En el navegador: Vercel → Storage → «MenuPlan» → **Open in Supabase** → Database → Backups (pestañas «Scheduled backups» y «Point in time»). Sin sesión de Supabase propia, esa es la única entrada | el plan, y o la lista de copias o el aviso «Free Plan does not include project backups». Salió ese aviso (día en «Fechas» de Fuentes y comprobación) |
| Borrar tablas o vistas (primer drop, #303) | los pasos de abajo; la migración la lanza Pablo con `--pablo` | `verificar-estado --solo 00XX` con los testigos negativos «está» (el objeto ya falta de la base) |
| Ver los jobs de `pg_cron` | `select jobname, schedule from cron.job` en solo lectura | `bot-recordatorios` y `bot-retencion` |
| Programar o quitar el cron de recordatorios | `node scripts/bot-cron.mjs [url] [--quitar]` (por defecto, contra staging) | el job creado o quitado; el mismo `BOT_CRON_SECRET` tiene que estar en Vercel |
| Ver quién es `anon` en una función | `select proname, proacl from pg_proc where proname = '<función>'` en solo lectura | `anon` ni `public` en el ACL |

- **Borrar tablas o vistas** (lo que enseñó la 0093, #303):
  1. Copia previa de solo esos objetos, fuera del repo y de OneDrive
     (`C:\dev\copias-previas\<fecha>-<tema>\`): un JSON por pieza, un esquema
     (columnas, restricciones, políticas y `relacl` de `pg_class`), un manifiesto
     con filas y sha256, y un LEEME de cómo restaurar. No es una copia de la base.
  2. La migración empieza con un bloque que cuenta las filas y aborta si no coinciden
     con la copia.
  3. Las vistas primero y una sentencia por objeto, sin `cascade` ni `if exists`: si
     algo depende, que falle en el ensayo. El `drop` va fuera de todo `do $$`, porque
     las herramientas no lo ven (test `dropsSinLeer`).
  4. En `src/data/model.js` la fuente queda `retirado` con la nota «Borrada en la
     NNNN»; `ops/fuentes.test.js` comprueba en los dos sentidos que esa migración la
     borra, y `ops/lecturasRetiradas.test.js` sigue vigilando que nadie la lea.
  5. Orden: PR fusionado en staging, ensayo (vale una hora), Pablo la lanza,
     `verificar-estado --solo`, y `supabase/ESTADO.md`.
  6. Número: el contiguo a staging; el «siguiente libre» del arranque suma uno al número
     más alto de los PR abiertos y deja huecos que `migrations.test.js` rechaza (#369).
- **El registro de verdad es `supabase/ESTADO.md`**, no la tabla de
  migraciones de Supabase (`supabase_migrations.schema_migrations`), que solo
  tiene 12 filas: casi todo se aplicó a mano.
- Preferir el catálogo (`pg_catalog`, `information_schema`, `cron.job`) a las
  filas de usuarios; si hay que contar filas, contar, no imprimirlas.
- **pg_cron:** `bot-recordatorios`, cada 5 minutos, hace POST a
  `/api/bot/recordatorios` con `BOT_CRON_SECRET`; `bot-retencion`, a las 03:17,
  purga lo viejo del bot (la 0065). Las extensiones las pone la 0062.
- **Login (Auth)**: Google por OAuth (`src/lib/useAuth.js`, vuelve a
  `window.location.origin`). El proveedor se configura en Supabase → Auth →
  Providers, con su cliente de Google Cloud. En local, el login solo vuelve al
  puerto 5176, que es la URL de retorno dada de alta.
- **Funciones `security definer`**: Supabase concede EXECUTE a `anon` y
  `authenticated` por defecto, y revocar a `public` no lo quita. Cada función
  nueva revoca a los tres y concede explícitamente (PRINCIPIOS §8).

## Lo que falló y por qué

- **2026-10-09 · primer drop de tablas (#303): las herramientas del repo daban
  por hecho que toda tabla creada seguía existiendo.** Causa: era el primer
  `drop table` del repo; los tests de fuentes, módulos y ids de persona seguían dando
  verde o rojo por el CREATE antiguo, y el número que proponía el arranque dejaba
  huecos. Arreglo: `scripts/lib/migraciones.mjs` lee los drops, el test de doble
  sentido de `ops/fuentes.test.js`, la copia previa con manifiesto y esta operación.
- **2026-10-08 · esta skill daba por buena una «pista» de copias continuas y no
  había ninguna copia.** La consulta de solo lectura `pg_stat_archiver` salía
  sana (`archive_mode = on`, `wal-g`, 8.620 ficheros, 0 fallidos) y se tomó por la
  señal de que Supabase guardaba el historial. Causa: ese archivado es de la
  plataforma, y que funcione no quiere decir que el cliente pueda restaurar nada;
  el panel dice que el plan Free no incluye copias. Arreglo: se miró el panel
  (Vercel → Storage → MenuPlan → Open in Supabase → Backups) y la skill dejó de
  citar el archivado como prueba. Un ajuste del servidor no sustituye al panel.
- **2026-10-07 · el código usaba `user_recipe_discards` y la tabla no existía
  en producción.** Causa: nadie comprobaba el código contra el catálogo real; lo
  encontró `verificar-estado` el primer día. Arreglo: el 8 oct los descartes pasaron a ser
  de la casa, en `household_recipe_discards`, y
  `src/lib/householdDiscardsSync.test.js` falla si alguien vuelve a consultar la
  vieja. Queda un fallo en la base: `ensure_user_household` (0071) la lee dentro
  de un `exception when others`, así que ese bloque se deshace siempre y ninguna
  casa pasa a `active`. Detalle en `supabase/ESTADO.md`.
- **2026-09-17 · el registro de migraciones decía 12 y había más de 60
  aplicadas.** Causa: se aplicaban a mano desde el panel. Arreglo:
  `supabase/ESTADO.md` con un objeto testigo por migración, y desde el 7 oct
  `scripts/verificar-estado.mjs`, que lo comprueba solo.
- **2026-09 · `anon` podía ejecutar funciones de compartir (0055/0056).**
  Causa: el EXECUTE por defecto de Supabase. Arreglo: revoke a `anon` en la
  0056 y la regla de PRINCIPIOS §8, con su test.

## Qué requiere el OK de Pablo

- Desde el día de «Fechas» de Fuentes y comprobación una sesión aplica (`--si`) si el script ve la migración
  en staging, un ensayo de menos de una hora y el OK de `auditor-datos` en la
  cabecera. Son de Pablo (`!` y `--pablo`): `CONTRAE`, y RLS o permisos de lo
  que ya existía. El SQL a mano que escribe, siempre negado.
- Cambiar ajustes del panel: Auth, proveedores, URLs de retorno, plan, crons
  fuera de `scripts/bot-cron.mjs`.
- Subir de plan (Pro) o dar de alta cualquier gasto de Supabase.
- Lo que cambie las copias propias: los permisos de `copia_lectura` o las
  columnas de `auth` que saca el esquema `copia` (tocan permisos: `--pablo`),
  sacar más esquemas o llevarlas a otro sitio. Son datos de salud de familias (alergias, RGPD art. 9) fuera de
  Supabase, siempre cifrados.
- Restaurar una copia sobre esta base, aunque sea una tabla.

## Coste y límites

Lo paga el equipo de Vercel por el Marketplace. La base pesa 65 MB (medido el día de «Fechas» de Fuentes y comprobación).

**Copias:** las de Supabase, ninguna (el plan Free no las incluye). Las propias
(elegidas el 9 oct, #156) no cuestan nada nuevo: ~9,1 MB y 14 s por copia
medidos ese día, y `pg_dump` usa la única conexión de `copia_lectura` unos
segundos a las 02:40 UTC. Lo que se descartó, por si hace falta más:
- **Plan Pro**: hasta 7 días de copias diarias con restauración desde el panel.
  Comprobar el precio en la pantalla de «Upgrade» antes de decidir.
- **PITR** (volver a un segundo concreto): extra de pago encima de Pro, desde unos
  100 $ al mes según el panel (día en «Fechas» de Fuentes y comprobación). No hace falta ahora.

Otros límites del Free que muerden: 500 MB de base (hoy pesa 65 MB) y que los
proyectos sin actividad se suspenden (los dos de pruebas lo están). La base de las
familias es la única activa. Plano 8 de `ops/PLANOS.md`.

## Fuentes y comprobación

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/pg_cron

Fechas que estaban repartidas por el cuerpo (#411): propiedad por el equipo de Vercel comprobada el 7 oct 2026; plan Free, aviso de que no hay copias, 65 MB de base y precio de PITR leídos el 2026-10-08; copias propias decididas el 9 oct 2026; las sesiones aplican migraciones desde el 8 oct 2026.

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; salvo el plan y las copias, que se leyeron hoy en el panel de Vercel y en el de Supabase (Database → Backups, pestañas de copias programadas y de PITR), sin tocar nada. Sin comprobar: el precio del plan Pro, y restaurar una copia de Supabase (no hay ninguna). Comprobado el 2026-10-09, en el encargo #247: tamaño y duración de un `pg_dump` de `public` y `ops` y las 34 claves ajenas a `auth.users` (las contó `gobierno`; #273). Sin comprobar: una copia hecha por el servidor y restaurada.
