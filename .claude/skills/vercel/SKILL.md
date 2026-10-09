---
name: vercel
description: Úsala con un despliegue de Vercel — preview de un PR, staging o producción —, uno que sale Blocked, en rojo o no arranca, para leer logs, tocar una variable de entorno, subir a Blob, o al preguntar por un cron, un dominio o qué hay desplegado. No para: el CI de GitHub (github) ni la base de datos (supabase).
---

# Vercel

## Qué es y dónde

- **Equipo «menuplan», proyecto `homenu`** (antes «Monicos MenuPlan» y
  `menu-plan`: si aparecen así en algún sitio, es el mismo). Plan Pro. Owners:
  Pablo y Álvaro.
- **Qué despliega**: la app (Vite, `dist/`) y las funciones de `api/`. Región
  única **fra1** (`vercel.json`), cerca de Supabase (eu-central-1).
- **Ramas**: cada PR tiene su preview; `staging` despliega en el entorno
  personalizado `staging-menuplan`; `main` es producción.
- **El bot** (`api/bot/telegram.js`) lleva `maxDuration: 120` e
  `includeFiles` con `conocimiento.md`, `recetasVectores.json`,
  `dishImages.json` y dos que genera el propio build (core.mjs y
  dominiosGustos.json). Un fichero que el bot lea en tiempo de ejecución y no
  esté en esa lista no viaja al despliegue. **El canario**
  (`api/bot/canario.js`, #267) carga el mismo agente y lleva los mismos
  `includeFiles` y `maxDuration`; `src/lib/vigia.test.js` falla si se
  separan. Lo que importa una función desde `scripts/` no viaja
  (`.vercelignore`): por eso la configuración del vigía vive en
  `src/lib/vigia.js`.
- **Blob**: las fotos de platos y sus derivados WebP
  (`scripts/upload-to-blob.mjs`).
- **Crons**: en `vercel.json` no hay ninguno. Los de MenuPlan son de GitHub
  Actions y de `pg_cron` (skills `github` y `supabase`). El vigía de Lola
  (`vigia-lola.yml`) lee los logs de Vercel desde Actions con un
  `VERCEL_TOKEN` y llama al canario cada 15 min.
- **Supabase** cuelga del equipo como integración del Marketplace: Vercel es
  quien la paga.

## Claves y accesos

Los nombres, para qué sirve cada una y en qué entorno están se apuntan en
`ops/INVENTARIO.md`; las direcciones de 1Password, en `ops/env.1password`.
Aquí no se repiten. Una sola rareza que conviene saber:

- `AI_GATEWAY_API_KEY` (vectores de Voyage y modelos por el gateway) está en
  Production, Development y staging-menuplan, **pero no en Preview**: en la
  preview de un PR, el buscador cae a rasgos + Haiku. Es el comportamiento
  esperado, no un fallo. El gateway tiene crédito de pago desde el 1 oct 2026.

**Un token de Vercel no se limita por acciones (#299).** Según la documentación
(«Access tokens» y «Access Roles», leídas el 9 oct 2026), un token se limita
por **alcance** (cuenta, equipo o un solo proyecto) y puede todo lo que pueda
su dueño. Para que las sesiones lean logs sin promover a producción ni tocar
variables de producción, el token tiene que ser de **otra cuenta** del equipo
con rol **Developer** (Pro), sin el permiso «Full Production Deployment», y de
alcance solo `homenu`. Developer aún despliega previews, cambia variables de
preview y desarrollo y toca dominios; **Pro Viewer** (gratis) no ve logs, así
que no sirve. Sin probar: el precio del asiento Developer y si la CLI acepta
un token de un solo proyecto (con uno de equipo, `vercel logs` falló el 9 oct).

El acceso a Vercel desde Claude es el conector de claude.ai (equipo y proyecto de
arriba). La CLI `vercel` no está instalada en este PC.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Estado y logs de un despliegue | el conector de Vercel: `list_deployments`, `get_deployment`, `get_runtime_logs`, `get_runtime_errors` | el estado (`READY`, `ERROR`, …) y los logs. Primero se miran los logs; luego se toca nada |
| ¿Qué hay en staging? | `git fetch origin` y mirar `origin/staging` | el commit. Vercel solo dice si ese commit desplegó bien |
| Build local igual que Vercel | `npm run build` (el `prebuild` valida el catálogo y corre `check:tdz`) | build verde. Nunca `vite build` a secas |
| Subir fotos a Blob | `node scripts/upload-to-blob.mjs` | manifest y derivados escritos; lee `BLOB_READ_WRITE_TOKEN` por 1Password |
| Rehacer los vectores del buscador | `node scripts/build-vectores.mjs` | `api/_bot/recetasVectores.json` actualizado solo para lo que cambió; necesita `AI_GATEWAY_API_KEY` |
| Volver atrás en producción (OK) | «Instant Rollback» del panel o `request_rollback` del conector | el despliegue anterior vuelve a ser el de producción |

## Lo que falló y por qué

- **2026-09-24 · despliegue «Blocked»** (repo privado `gastos-homenu`): duración
  0 ms, estado `UNKNOWN` en la CLI, «This deployment can not be redeployed»,
  Cancel en gris aun siendo Owner. Causa: el ajuste «añadir como Developer a
  quien commitea en un repo privado» retiene el despliegue mientras el autor del
  commit no es miembro del equipo. Arreglo: commitear con una identidad que ya
  sea miembro (`git config user.email 99191376+pabloam89@users.noreply.github.com`);
  pasó de retenido a Ready en 9 s. MenuPlan es público y no lo sufre; si pasa a
  privado, esto vuelve.
- **2026-09-22 · staging roto por un build que en local pasaba.** Causa: se
  verificó con `vite build`, y el `prebuild` de Vercel cazó un `no-undef`.
  Arreglo: la guardia niega `vite build` a secas.
- **2026-10-01 · los vectores no funcionan en una preview.** Causa: la clave del
  gateway no está en Preview (ver «Claves y accesos»); no es un fallo. Arreglo:
  ninguno; el buscador cae a rasgos + Haiku.
- **2026-10-08 · `vercel logs` devuelve como mucho 50 peticiones**, aunque se
  pida `--limit 2000` (CLI 62.1.0), y sin avisar. Causa: es el tope de la CLI;
  las da de la más nueva a la más vieja, y `--until` incluye el instante
  límite. Arreglo: paginar hacia
  atrás con `--since`/`--until` en ISO y quitar repetidos por `id`, como hace
  `scripts/bot-fallos.mjs` (`paginar`). En producción puede no haber tráfico
  reciente: el informe dice qué entorno y qué rango ha cubierto.
- **2026-10-09 · los logs de staging no están en `production` ni en
  `staging-menuplan`.** Causa: `vercel logs --environment` solo acepta
  `production` o `preview` (con otro valor: «Invalid environment»), y el
  entorno personalizado de staging sale como `preview`. Medido ese día: en 24 h, 0 peticiones en
  `production` y en `preview` las de `/api/bot/recordatorios` y
  `/api/bot/telegram` (el webhook de Lola apuntaba a staging). Arreglo: el
  vigía mira el entorno de la variable `VIGIA_ENTORNO`, que tiene que seguir al
  webhook.

- **2026-10-09 · el vigía no leía los logs en Actions** (`logs: sin_configurar`
  con `VERCEL_TOKEN` puesto). Causa: en el runner no hay `.vercel/` (checkout
  parcial) y cualquier error con «not found» se tomaba por «falta la CLI»,
  sin decir cuál era. Arreglo: la CLI recibe `VERCEL_ORG_ID` y
  `VERCEL_PROJECT_ID` en su entorno (`IDS_VERCEL`, `scripts/bot-fallos.mjs`;
  probado sin sesión, sin `.vercel/` y con token: lee el proyecto) y
  `motivoDeCli` da el motivo del vocabulario a la línea `vigia_logs`.
  Con eso salió el motivo de verdad, `no_existe`: «User not found.».
  Causa: el token se creó con scope del equipo («Monicos MenuPlan»), y la
  CLI pregunta primero por el usuario (`/v2/user` da 404 con ese token,
  aunque el API REST del proyecto responda 200). Arreglo: un token para la
  CLI se crea con scope **«Full Account»**, que cubre la cuenta y el equipo,
  y a 90 días (ficha «Vercel Vigía»). Comprobado: con él, `vercel logs` lee y
  el vigía cerró el incidente.

## Qué requiere el OK de Pablo

- Subir o promover a producción, y el rollback.
- Crear, cambiar o borrar variables de entorno (en cualquier entorno).
- Cambiar ajustes del equipo o del proyecto: dominios, miembros, protección,
  plan, integraciones del Marketplace.
- Borrar despliegues, stores de Blob o cualquier recurso.

## Coste y límites

Plan Pro del equipo; Supabase y el crédito del gateway de IA salen de ahí. Límites
que muerden: `maxDuration: 120` en el bot, y el tamaño de los ficheros que el
bot lee (`includeFiles`). Si el repo pasa a privado, los commits de autores que
no son miembros del equipo se bloquean y cuentan como asientos.

## Fuentes y comprobación

- https://vercel.com/docs/deployments/troubleshoot-a-build
- https://vercel.com/docs/projects/environment-variables
- https://vercel.com/docs/instant-rollback

Comprobado el 2026-10-08: el contenido viene de la versión anterior de esta skill, reordenado a la plantilla sin cambiar los hechos; hoy no se ha vuelto a ejecutar lo que cita. Sin comprobar: un rollback real en producción.

Comprobado el 2026-10-09: en #299, en la documentación de Vercel, que los tokens se limitan por alcance y no por acción, y qué puede cada rol (Developer, Pro Viewer). Sin probar con una cuenta Developer de verdad.
