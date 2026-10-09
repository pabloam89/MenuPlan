# Inventario de servicios, cuentas y claves

Qué servicios externos usa MenuPlan, **de qué cuenta es cada uno** y dónde vive
cada clave. Objetivo: que nada crítico dependa de la cuenta antigua de Bytask
(`pablo.artinano@bytask.ai`) y que perder un acceso no tumbe la app.

Leyenda de la columna «cuenta dueña»: ✅ confirmado personal · ⚠️ probablemente
Bytask, migrar · ❓ sin confirmar.

> Nunca se escriben valores de claves en este fichero, solo su nombre y dónde
> está configurada.

## Servicios

| Servicio | Para qué | Cuenta dueña | Variables | Dónde se configuran |
|---|---|---|---|---|
| **GitHub** `pabloam89/MenuPlan` | Código, PRs, Actions | ✅ personal (`pabloam89`) | secrets de Actions (abajo) | GitHub → Settings → Secrets |
| **Vercel** | Hosting web + funciones `api/` + crons | ✅ equipo «Monicos MenuPlan» (`team_sV2KePPHNXRWD9JsNQCfGwwV`), plan Pro; Owners: Pablo (`pabloam89@gmail.com`) y Álvaro. Ninguna cuenta de Bytask (7 oct 2026) | todas las de runtime de `api/` | Vercel → Project → Environment Variables |
| **1Password** | Las claves de `.env.local` (bóveda `HoMenu`), las del servidor del panel (bóveda `Panel HoMenu`) y la service account de solo lectura del PC de Pablo | ✅ cuenta de Pablo (`my.1password.eu`), plan Familias en prueba desde el 8 oct 2026 | el token de la service account «MenuPlan PC Pablo» | llavero de Windows del PC de Pablo |
| **Hetzner Cloud** (proyecto `HoMenu`) | Servidor `HoMenu-Panel` (CPX02, Falkenstein): el panel de la factoría y su Postgres. Skill `hetzner` | ✅ cuenta de Pablo (`pabloam89@gmail.com`), 2FA y códigos de recuperación en su ficha de `Private`. Desde el 8 oct 2026, ~7,85 €/mes con IVA | contraseña del Postgres del panel (ficha `Postgres del panel`) | 1Password, bóveda `Panel HoMenu`; copia en `/opt/panel/.env` del servidor |
| **Tailscale** | Red privada entre el PC de Pablo y el servidor; el servidor no abre puertos a internet. Skill `tailscale` | ✅ cuenta de Pablo (Google), plan Free, desde el 8 oct 2026 | — (sin auth keys ni tokens) | `console.tailscale.com` |
| **Supabase** (`mdzwbrworucnummibxrq`, eu-central-1) | Base de datos, Auth, RLS | ✅ integración del Marketplace de Vercel: la org `vercel_icfg_…` cuelga del equipo de Vercel, que es el dueño y el que paga. Nada que transferir (comprobado el 7 oct 2026) | `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`; `SUPABASE_DB_URL_LECTURA` (rol `consulta_lectura`, solo lectura, para `npm run consulta`; la pone `scripts/clave-consulta-lectura.mjs`) | Vercel + `.env.local`; la de lectura, solo en 1Password (`HoMenu/Supabase lectura`) y `.env.local` |
| **Upstash Redis** | Rate limit y caché | ❓ probablemente también del Marketplace de Vercel (variables `KV_REST_API_*`), sin confirmar | `UPSTASH_REDIS_*` / `KV_REST_API_*` | Vercel (integración) |
| **Vercel Blob** | Imágenes de platos | ✅ va con Vercel | `BLOB_READ_WRITE_TOKEN` | Vercel |
| **Anthropic** | Planificador, bot, OCR | ❓ | `ANTHROPIC_API_KEY` (`VITE_ANTHROPIC_API_KEY` en local) | Vercel + GitHub Actions + `.env` |
| **Google AI Studio (Gemini)** | Fotos de platos, visión | ❓ | `GEMINI_AI_STUDIO_KEY` | Vercel + `.env` |
| **fal.ai** | Generación de imágenes (scripts) | ❓ | `FAL_KEY` | `.env` local |
| **Groq** | Transcripción de voz del bot | ❓ | `GROQ_API_KEY` | Vercel |
| **Resend** | Emails de moderación | ❓ | `RESEND_API_KEY`, `MODERATION_*` | Vercel |
| **Telegram** (bot Lola) | Bot de mensajería | ❓ | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Vercel |
| **Google OAuth** | Login con Google | ❓ (Google Cloud Console) | — (configurado en Supabase Auth) | Supabase → Auth → Providers |
| **Apple** (Sign in + App Store) | Login Apple, TestFlight | ❓ | `APPLE_*`, `IOS_*`, `APPSTORE_API_KEY_P8_BASE64` | Vercel + GitHub Actions |
| **CallMeBot** | Avisos de fallos por WhatsApp | ❓ | `CALLMEBOT_DESTINOS` | GitHub Actions |
| **Mercadona** (API pública) | Catálogo de precios semanal | — sin cuenta | — | — |

### Secretos internos (no son de un servicio)

`CRON_SECRET`, `BOT_CRON_SECRET`, `MODERATION_SECRET`: valores inventados por
nosotros para que solo nuestros crons puedan llamar a ciertos endpoints. Viven
en Vercel (y `BOT_CRON_SECRET` también en el job de `pg_cron`, ver
`scripts/bot-cron.mjs`).

### Secretos de GitHub Actions

| Secreto | Workflow |
|---|---|
| `ANTHROPIC_API_KEY`, `OPS_DB_URL`, `CALLMEBOT_DESTINOS` | `agente-fallos.yml` |
| `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`, `APPSTORE_API_KEY_P8_BASE64` | `ios-testflight.yml` |

## Pendientes de la limpieza (abiertos el 7 oct 2026, al día ese mismo día)

| # | Qué | Quién | Estado |
|---|---|---|---|
| 1 | Confirmar la cuenta dueña de cada ❓ de la tabla | Pablo | abierto |
| 2 | ~~Transferir Supabase desde Bytask~~ — **no procede**: cuelga del equipo de Vercel (ver la tabla) | — | cerrado (7 oct) |
| 3 | Sacar la copia local de OneDrive a `C:\dev\MenuPlan` | Pablo + Claude | hecho (7 oct); queda retirar la carpeta vieja y sus worktrees |
| 13 | Retirar los worktrees ya fusionados del 7 oct (alergenos, fuente, grupos, ids, plan-semana, principios, ux, menuplan-ops, -gitignore, -0081 y `C:\dev\MenuPlan-claude-md`) cuando no tengan nada en vuelo: con `npm run retirar` o, si no salieron de `tarea`, con comandos que lanza Pablo | Pablo lanza, Claude prepara | abierto |
| 4 | Identidad de git: Gmail en todo `C:\dev\` (`includeIf` → `~/.gitconfig-personal`) | Pablo | hecho (7 oct) |
| 5 | Proteger `main` y `staging` en GitHub | Pablo + Claude | hecho (7 oct): `main` solo por PR con `tests` en verde; las dos sin force push ni borrado, también para administradores |
| 11 | Que el cron de Mercadona abra un PR en vez de empujar a `staging`, para poder exigir PR también en `staging`. Ojo: un PR abierto con el token de Actions no lanza `tests.yml`; hay que dispararlo a mano (`workflow_dispatch`) | Claude, con OK de Pablo | abierto |
| 12 | Activar secret scanning y push protection (Settings → Code security) | Pablo | hecho (7 oct), comprobado con `gh api` |
| 6 | Borrar las ~88 ramas ya fusionadas (las nuevas ya se borran solas) | Pablo lanza, Claude prepara | abierto, no urge |
| 7 | ~~Reconciliar `main` y `staging`~~ — **no procede**: revisado el 7 oct, nada de `main` que portar | — | cerrado |
| 8 | Rama por defecto de GitHub → `staging`; el cron de Mercadona empuja a `staging` (PR #85) | Pablo | hecho (7 oct) |
| 9 | Decidir el método del paso de `staging` a producción cuando toque | Pablo + Claude | más adelante |
| 10 | Repo privado (org `menuplanai`) | Pablo | en espera por decisión de Pablo (7 oct); coste medido: ~600 de 2.000 min de Actions |
