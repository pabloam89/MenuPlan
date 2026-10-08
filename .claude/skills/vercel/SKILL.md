---
name: vercel
description: Úsala con un despliegue de Vercel — preview de un PR, staging o producción —, uno que sale Blocked, en rojo o no arranca, para leer logs, tocar una variable de entorno, subir a Blob, o al preguntar por un cron, un dominio o qué hay desplegado.
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
  esté en esa lista no viaja al despliegue.
- **Blob**: las fotos de platos y sus derivados WebP
  (`scripts/upload-to-blob.mjs`).
- **Crons**: en `vercel.json` no hay ninguno. Los de MenuPlan son de GitHub
  Actions y de `pg_cron` (skills `github` y `supabase`).
- **Supabase** cuelga del equipo como integración del Marketplace: Vercel es
  quien la paga.

## Claves

Los nombres, para qué sirve cada una y en qué entorno están se apuntan en
`ops/INVENTARIO.md`; las direcciones de 1Password, en `ops/env.1password`.
Aquí no se repiten. Una sola rareza que conviene saber:

- `AI_GATEWAY_API_KEY` (vectores de Voyage y modelos por el gateway) está en
  Production, Development y staging-menuplan, **pero no en Preview**: en la
  preview de un PR, el buscador cae a rasgos + Haiku. Es el comportamiento
  esperado, no un fallo. El gateway tiene crédito de pago desde el 1 oct 2026.

## Operaciones habituales

- **Estado y logs**: el conector de Vercel de claude.ai (`list_deployments`,
  `get_deployment`, `get_runtime_logs`, `get_runtime_errors`) con el equipo
  y el proyecto de arriba. Primero se miran los logs; luego se toca nada.
- **¿Qué hay en staging?** No se pregunta a Vercel: `git fetch origin` y
  `origin/staging`. Vercel solo dice si ese commit desplegó bien.
- **Build local igual que Vercel**: `npm run build` (el `prebuild` valida el
  catálogo y corre `check:tdz`), nunca `vite build` a secas.
- **Subir fotos a Blob**: `node scripts/upload-to-blob.mjs` (lee
  `BLOB_READ_WRITE_TOKEN` por 1Password, escribe el manifest y los derivados).
- **Vectores del buscador**: `node scripts/build-vectores.mjs` rehace
  `api/_bot/recetasVectores.json` solo para lo que cambió; necesita
  `AI_GATEWAY_API_KEY`.
- **Volver atrás en producción**: «Instant Rollback» del panel o
  `request_rollback` del conector. Es un paso de producción: OK de Pablo.

## Lo que falló y por qué

- **Despliegue «Blocked»** (24 sep 2026, repo privado `gastos-homenu`).
  Síntoma: duración 0 ms, estado `UNKNOWN` en la CLI, «This deployment can not
  be redeployed», Cancel en gris aun siendo Owner. Causa: el ajuste «añadir
  como Developer a quien commitea en un repo privado» retiene el despliegue
  mientras el autor del commit no es miembro del equipo. Arreglo: commitear
  con una identidad que ya sea miembro
  (`git config user.email 99191376+pabloam89@users.noreply.github.com`). Pasó
  de retenido a Ready en 9 s. MenuPlan es público y no lo sufre; si pasa a
  privado, esto vuelve.
- **Staging roto por un build que en local pasaba** (22 sep 2026). Se verificó
  con `vite build` y el `prebuild` de Vercel cazó un `no-undef`. Arreglo: la
  guardia niega `vite build` a secas.
- **Vectores que no funcionan en una preview**: no es un fallo, es la clave
  que falta en Preview (ver Claves).

## Qué requiere el OK de Pablo

- Subir o promover a producción, y el rollback.
- Crear, cambiar o borrar variables de entorno (en cualquier entorno).
- Cambiar ajustes del equipo o del proyecto: dominios, miembros, protección,
  plan, integraciones del Marketplace.
- Borrar despliegues, stores de Blob o cualquier recurso.

Comprobado el 2026-10-08.
