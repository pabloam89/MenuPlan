---
name: supabase
description: Úsala para operar la base de datos de MenuPlan en Supabase: una consulta a producción, «¿está aplicada?», pg_cron y los crons del bot, el login y Auth (Google), copias o backup (lo que llevan; el cómo, hetzner), o cuando algo de la base no cuadra con el repo. No para: escribir una migración (regla migraciones y agente datos) ni el Postgres del panel en Hetzner (hetzner).
---

# Supabase

## Qué es y dónde

- **Un solo proyecto, `mdzwbrworucnummibxrq` (eu-central-1), y es
  producción.** No hay base de staging: staging, local, los scripts y los evals
  escriben en ella. Cada escritura es en datos de familias reales.
- **De quién es**: cuelga del equipo de Vercel por el Marketplace (org
  `vercel_icfg_…`). El dueño y el que paga es el equipo de Vercel; no hay
  cuenta propia que transferir (comprobado el 7 oct 2026).
- **Plan: «Supabase Free Plan»** (visto en Vercel y en Supabase el 2026-10-08):
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
- **Copias: propias, no de Supabase.** Decidido el 9 oct 2026 (#156): una copia
  cifrada cada noche en el servidor de Hetzner (encargo #247). Cómo se hace, se
  instala, se ensaya y se restaura: skill `hetzner`. Lo que lleva y lo que no:
  - Lleva `public` y `ops` enteros (esquema y datos), con `pg_dump` de solo
    lectura.
  - **No lleva `auth.users`** mientras se haga con `consulta_lectura`, que no
    ve `auth` (#273, punto 2). Restaurar en **esta misma** base (se rompió una
    tabla, un borrado de más) sirve igual: los usuarios siguen en `auth`.
    Restaurar en un **proyecto nuevo** deja las casas sin dueño: 34 claves ajenas
    de 29 tablas apuntan a `auth.users`, y el login de Google crearía usuarios
    con otros ids. Para eso hace falta el usuario `copia_lectura` con vistas de
    `auth.users` y `auth.identities` (sin tokens) en un esquema `copia`; el
    script ya las saca si existen (`auth: si`).
  - **Ni el valor de las secuencias** con `consulta_lectura`
    (`secuencias: sin-valor`): al restaurar se ponen al máximo de su columna
    con `SQL_SECUENCIAS` de `scripts/lib/copias.mjs`, o el siguiente insert
    chocaría.
- **Pendiente:** instalar las copias en el servidor y su primer ensayo (#247), y
  las decisiones de #273 (aviso, `copia_lectura`, segunda copia de la clave).

## Claves y accesos

Nombres, para qué sirve cada una y dónde viven: `ops/INVENTARIO.md` (fila
Supabase). Las direcciones de 1Password, en `ops/env.1password`. La que usan
los scripts para conectar es `SUPABASE_DB_URL`, leída con `leerEnv` de
`scripts/lib/env.mjs`. No hay cuenta propia de Supabase: el acceso al panel
cuelga del equipo de Vercel.

`npm run consulta` entra con `SUPABASE_DB_URL_LECTURA`, el rol
`consulta_lectura` de la 0092 (solo `select` en `public` y `ops`, sin `auth`,
`cron`, `vault` ni `storage`). Si la variable no está, entra con la de
administrador y lo avisa; si está pero no se puede leer, falla. Su contraseña
la pone `node scripts/clave-consulta-lectura.mjs --si` (Pablo, con `!`): la
genera, crea la ficha «Supabase lectura» en HoMenu por stdin y a la base solo
le manda el verificador SCRAM. Lo que esté fuera de `public` y `ops` (p. ej.
`cron.job`) se mira con `verificar-estado` o con la de administrador.
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
| ¿Qué plan y qué copias tiene? | En el navegador: Vercel → Storage → «MenuPlan» → **Open in Supabase** → Database → Backups (pestañas «Scheduled backups» y «Point in time»). Sin sesión de Supabase propia, esa es la única entrada | el plan, y o la lista de copias o el aviso «Free Plan does not include project backups». El 2026-10-08 salió ese aviso |
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

- Desde el 8 oct 2026 una sesión aplica (`--si`) si el script ve la migración
  en staging, un ensayo de menos de una hora y el OK de `auditor-datos` en la
  cabecera. Son de Pablo (`!` y `--pablo`): `CONTRAE`, y RLS o permisos de lo
  que ya existía. El SQL a mano que escribe, siempre negado.
- Cambiar ajustes del panel: Auth, proveedores, URLs de retorno, plan, crons
  fuera de `scripts/bot-cron.mjs`.
- Subir de plan (Pro) o dar de alta cualquier gasto de Supabase.
- Lo que cambie las copias propias: otro usuario para la copia (`copia_lectura`
  toca permisos: `--pablo`), sacar más esquemas (`auth`) o llevarlas a otro
  sitio. Son datos de salud de familias (alergias, RGPD art. 9) fuera de
  Supabase, siempre cifrados.
- Restaurar una copia sobre esta base, aunque sea una tabla.

## Coste y límites

Lo paga el equipo de Vercel por el Marketplace. La base pesa 65 MB (2026-10-08).

**Copias:** las de Supabase, ninguna (el plan Free no las incluye). Las propias
(elegidas el 9 oct, #156) no cuestan nada nuevo: ~9,1 MB y 14 s por copia
medidos ese día, y `pg_dump` usa una de las 3 conexiones de `consulta_lectura`
unos segundos a las 02:40 UTC. Lo que se descartó, por si hace falta más:
- **Plan Pro**: hasta 7 días de copias diarias con restauración desde el panel.
  Comprobar el precio en la pantalla de «Upgrade» antes de decidir.
- **PITR** (volver a un segundo concreto): extra de pago encima de Pro, desde unos
  100 $ al mes según el panel el 2026-10-08. No hace falta ahora.

Otros límites del Free que muerden: 500 MB de base (hoy pesa 65 MB) y que los
proyectos sin actividad se suspenden (los dos de pruebas lo están). La base de las
familias es la única activa. Plano 8 de `ops/PLANOS.md`.

## Fuentes y comprobación

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/pg_cron

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; salvo el plan y las copias, que se leyeron hoy en el panel de Vercel y en el de Supabase (Database → Backups, pestañas de copias programadas y de PITR), sin tocar nada. Sin comprobar: el precio del plan Pro, y restaurar una copia de Supabase (no hay ninguna). Comprobado el 2026-10-09, en el encargo #247: tamaño y duración de un `pg_dump` de `public` y `ops` y las 34 claves ajenas a `auth.users` (las contó `gobierno`; #273). Sin comprobar: una copia hecha por el servidor y restaurada.
