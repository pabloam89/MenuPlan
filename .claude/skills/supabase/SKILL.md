---
name: supabase
description: Úsala para operar la base de datos de MenuPlan en Supabase: una consulta a producción, «¿está aplicada?», pg_cron y los crons del bot, el login y Auth (Google), copias o backup, o cuando algo de la base no cuadra con el repo. No para: escribir una migración (regla migraciones y agente datos) ni el Postgres del panel en Hetzner (hetzner).
---

# Supabase

## Qué es y dónde

- **Un solo proyecto, `mdzwbrworucnummibxrq` (eu-central-1), y es
  producción.** No hay base de staging: staging, local, los scripts y los evals
  escriben en ella. Cada escritura es en datos de familias reales.
- **De quién es**: cuelga del equipo de Vercel por el Marketplace (org
  `vercel_icfg_…`). El dueño y el que paga es el equipo de Vercel; no hay
  cuenta propia que transferir (comprobado el 7 oct 2026).
- **Qué da**: Postgres, Auth (login con Google) y RLS. El código depende de
  las tres, por eso irse de Supabase no es un cambio de proveedor sin más.
- **Escribir migraciones** no es de esta skill: `.claude/rules/migraciones.md`,
  `docs/datos/PRINCIPIOS.md` y el agente `datos`.
- **Pendiente:** las copias continuas están activas (ver «Coste y límites»),
  pero falta saber cuántos días guardan y no hay una restauración ensayada.

## Claves y accesos

Nombres, para qué sirve cada una y dónde viven: `ops/INVENTARIO.md` (fila
Supabase). Las direcciones de 1Password, en `ops/env.1password`. La que usan
los scripts para conectar es `SUPABASE_DB_URL`, leída con `leerEnv` de
`scripts/lib/env.mjs`. No hay cuenta propia de Supabase: el acceso al panel
cuelga del equipo de Vercel.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| ¿Está aplicada la 00XX? | `node scripts/verificar-estado.mjs --solo 00XX` (sin argumentos, todas; `--detalle` enseña cada testigo) | cada migración con su testigo; avisa de lo que no cuadra con `supabase/ESTADO.md`. Solo lectura, sin preguntar |
| Ensayar una migración | `node scripts/apply-migration.mjs <nombre>` (sin `--si`) | ejecuta y hace ROLLBACK |
| Aplicar una migración (OK, o Pablo con `!`) | `node scripts/apply-migration.mjs <nombre> --si` | exige estar en staging, un ensayo de menos de una hora y el OK de `auditor-datos` en la cabecera |
| Consulta a producción | como `scripts/verificar-estado.mjs`: `set session characteristics as transaction read only`, `begin read only`, solo `select`, `rollback` | filas o recuentos; aunque se colara un `update`, Postgres lo rechaza |
| ¿Hay copias continuas? (pista, solo lectura) | `select archived_count, failed_count, last_archived_time from pg_stat_archiver` | `archived_count` que crece, `failed_count` en 0 y `last_archived_time` de hace unos minutos. El 2026-10-08: 8.620, 0, y hace menos de 15 minutos |
| Ver los jobs de `pg_cron` | `select jobname, schedule from cron.job` en solo lectura | `bot-recordatorios` y `bot-retencion` |
| Programar o quitar el cron de recordatorios | `node scripts/bot-cron.mjs [url] [--quitar]` (por defecto, contra staging) | el job creado o quitado; el mismo `BOT_CRON_SECRET` tiene que estar en Vercel |
| Ver quién es `anon` en una función | `select proname, proacl from pg_proc where proname = '<función>'` en solo lectura | `anon` ni `public` en el ACL |

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

- Desde el 8 oct 2026 una sesión aplica (`--si`) si el script ve la migración
  en staging, un ensayo de menos de una hora y el OK de `auditor-datos` en la
  cabecera. Son de Pablo (`!` y `--pablo`): `CONTRAE`, y RLS o permisos de lo
  que ya existía. El SQL a mano que escribe, siempre negado.
- Cambiar ajustes del panel: Auth, proveedores, URLs de retorno, plan, crons
  fuera de `scripts/bot-cron.mjs`.
- Comprobar las copias en el panel (Database → Backups): qué plan hay, si hay
  PITR y cuántos días guarda.

## Coste y límites

Lo paga el equipo de Vercel por el Marketplace. La base pesa 65 MB (2026-10-08).

**Copias.** Hay archivado continuo de la bitácora de la base (`archive_mode = on`,
`archive_command` con `wal-g`, `archive_timeout = 120`): 8.620 ficheros archivados,
ninguno fallido, el último de hace minutos. Es la señal de que Supabase guarda el
historial para volver a un minuto concreto (PITR), pero **no es una prueba**: no
se ha visto el plan, ni cuántos días guarda, ni se ha restaurado nunca. La
integración no aparece en la lista del conector de Vercel, así que el plan solo se
ve en el panel de Supabase (Database → Backups). Hoy **no hay copia propia** de esta base: una
copia diaria nuestra, restaurable en nuestro propio Postgres, sería la única que
se podría ensayar (plano 8 de `ops/PLANOS.md`). Son datos de salud de familias
(alergias, RGPD art. 9) en otro sitio: la decide Pablo, y iría cifrada.

## Fuentes y comprobación

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/pg_cron

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; salvo el archivado de copias, que se consultó hoy en solo lectura contra producción (`pg_stat_archiver` y `pg_settings`). Sin comprobar: el plan de Supabase, los días que guarda, y restaurar.
