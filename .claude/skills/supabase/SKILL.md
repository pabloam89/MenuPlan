---
name: supabase
description: Úsala para operar la base de datos de MenuPlan en Supabase: una consulta a producción, «¿está aplicada?», pg_cron y los crons del bot, el login y Auth (Google), copias o backup, o cuando algo de la base no cuadra con el repo. Escribir una migración es de la regla migraciones y del agente datos.
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

## Claves

Nombres, para qué sirve cada una y dónde viven: `ops/INVENTARIO.md` (fila
Supabase). Las direcciones de 1Password, en `ops/env.1password`. La que usan
los scripts para conectar es `SUPABASE_DB_URL`, leída con `leerEnv` de
`scripts/lib/env.mjs`.

## Operaciones habituales

- **¿Está aplicada la 00XX?** `node scripts/verificar-estado.mjs --solo 00XX`
  (o sin argumentos, todas; `--detalle` para ver cada testigo). Compara el
  catálogo de producción con `supabase/ESTADO.md`. Es de solo lectura y está
  permitido sin preguntar.
- **El registro de verdad es `supabase/ESTADO.md`**, no la tabla de
  migraciones de Supabase (`supabase_migrations.schema_migrations`), que solo
  tiene 12 filas: casi todo se aplicó a mano.
- **Una consulta a producción**: como hace `scripts/verificar-estado.mjs`,
  `set session characteristics as transaction read only`, luego
  `begin read only`, solo `select`, y `rollback` al final. Así, aunque se
  colara un `update`, Postgres lo rechaza. Preferir el catálogo
  (`pg_catalog`, `information_schema`, `cron.job`) a las filas de usuarios;
  si hay que contar filas, contar, no imprimirlas.
- **Ensayar una migración**: `node scripts/apply-migration.mjs <nombre>` sin
  `--si` abre la transacción, ejecuta y hace ROLLBACK. Lo de `--si`, en la
  sección del OK.
- **pg_cron**:
  - `bot-recordatorios`, cada 5 minutos, hace POST a `/api/bot/recordatorios`
    con `BOT_CRON_SECRET`. Se programa, reprograma o quita con
    `node scripts/bot-cron.mjs [url] [--quitar]` (por defecto, contra
    staging). El mismo secreto tiene que estar en Vercel.
  - `bot-retencion`, a las 03:17 cada día, purga lo viejo del bot (la 0065).
  - Las extensiones las pone la 0062.
  - Ver los jobs: `select jobname, schedule from cron.job` en solo lectura.
- **Login (Auth)**: Google por OAuth (`src/lib/useAuth.js`, vuelve a
  `window.location.origin`). El proveedor se configura en el panel de Supabase,
  Auth → Providers, con su cliente de Google Cloud. En local, el login solo
  vuelve al puerto 5176, que es la URL de retorno dada de alta.
- **Funciones `security definer`**: Supabase concede EXECUTE a `anon` y
  `authenticated` por defecto, y revocar a `public` no lo quita. Cada función
  nueva revoca a los tres y concede explícitamente (PRINCIPIOS §8).

## Lo que falló y por qué

- **2026-09-17 · el registro de migraciones decía 12 y había más de 60
  aplicadas.** Causa: se aplicaban a mano desde el panel. Arreglo:
  `supabase/ESTADO.md` con un objeto testigo por migración, y desde el 7 oct
  `scripts/verificar-estado.mjs`, que lo comprueba solo.
- **2026-10-07 · el código usaba `user_recipe_discards` y la tabla no existía
  en producción.** Lo encontró `verificar-estado` el primer día. Arreglo
  (8 oct): los descartes son de la casa, en `household_recipe_discards`, y
  `src/lib/householdDiscardsSync.test.js` falla si alguien vuelve a consultar
  la vieja. Queda un fallo en la base: `ensure_user_household` (0071) la lee
  dentro de un `exception when others`, así que ese bloque se deshace siempre
  y ninguna casa pasa a `active`. Detalle en `supabase/ESTADO.md`.
- **Septiembre 2026 (0055/0056) · `anon` podía ejecutar funciones de
  compartir.** Causa: el EXECUTE por defecto de Supabase. Arreglo: revoke a
  `anon` en la 0056 y la regla de PRINCIPIOS §8, con su test.

## Qué requiere el OK de Pablo

- Cualquier escritura en producción: `apply-migration.mjs --si`, SQL que
  escribe, borra o cambia permisos o RLS. Hoy la guardia lo niega a las
  sesiones y lo lanza Pablo con `!`; la política puede cambiar (CLAUDE.md
  manda).
- Cambiar ajustes del panel: Auth, proveedores, URLs de retorno, plan, crons
  fuera de `scripts/bot-cron.mjs`.
- **Pendiente de Pablo: comprobar las copias.** En el panel, Database →
  Backups: qué plan hay, si hay PITR y cuántos días guarda. Nadie lo ha
  comprobado todavía, y no hay una restauración ensayada.

Comprobado el 2026-10-08.
