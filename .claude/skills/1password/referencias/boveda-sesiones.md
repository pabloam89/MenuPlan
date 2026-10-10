# Bóveda de sesiones (#328): pasos de Pablo, en orden

**Lo que pasa por la app de escritorio** (pasos 2 y 5) **se lanza desde una
PowerShell aparte, fuera de Claude Code**, con la integración de la CLI
encendida solo mientras dura (App → Ajustes → Desarrollador → «Integrar con
1Password CLI»). Un `!` dentro de Claude Code cuelga del mismo proceso que el
Bash de las sesiones y podría compartir la aprobación. Las sesiones no pueden
lanzar `op` ni `opPorLaApp`: la guardia lo niega. Una ventana de aprobación que
no has lanzado tú: no la apruebes.

**El camino corto (#328):** crea la bóveda (paso 1), enciende la integración y, desde la
PowerShell aparte, `cd C:\dev\MenuPlan; node scripts/boveda-pablo.mjs`. Hace los pasos 2, 5 y 6 en orden con una sola
aprobación: comprueba la bóveda, copia las 8 fichas, crea «MenuPlan sesiones» y la pasa por tubería al llavero
(el token no se imprime), comprueba, y dice qué salió BIEN o MAL. Cada paso se salta si ya está hecho y para en el
primero que falla. Se niega si ve las variables de Claude Code; la barrera de verdad es la ventana de aprobación de 1Password y la guardia. Al final solo quedan a mano los pasos 7 y 9. Los
pasos de abajo son el detalle y el plan B si el script falla.

1. App de 1Password → **Nueva bóveda** → `HoMenu-sesiones` (con guion).
2. PowerShell aparte, en `C:\dev\MenuPlan`: `node scripts/boveda-sesiones.mjs`
   (ensayo, no abre la app) y `$env:MENUPLAN_OP_PABLO = "1"; node scripts/boveda-sesiones.mjs --si`:
   8 fichas, una línea `COINCIDEN` cada una.
3. **Mover** (no copiar) la clave de la App de E1 (#327) a `HoMenu-sesiones`,
   Documento `GitHub App homenu-sesiones`: el arranque la lee ahí (hoy, de `HoMenu`, «GitHub App Sesiones»; #329).
4. Fusionar el PR de #328 y poner al día la carpeta principal:
   `git fetch origin; git merge --ff-only origin/staging`.
5. PowerShell aparte, en `C:\dev\MenuPlan`:
   `op service-account create "MenuPlan sesiones" --vault HoMenu-sesiones:read_items --raw | node scripts/llavero-op.mjs` → `COINCIDEN`.
6. `node scripts/boveda-sesiones.mjs --comprobar` → todo `BIEN`.
7. En la misma sentada, en 1Password.com → Developer → Service accounts: anular «MenuPlan PC Pablo».
8. **Los `.env.local` viejos no se tocan**: el plan B resuelve sus direcciones
   desde `HoMenu-sesiones` (línea `env-boveda … respaldo`); las carpetas nuevas
   salen con la plantilla nueva (`npm run tarea`), sin perder puerto ni flags.
9. **Apagar «Integrar con 1Password CLI»** al terminar, y encenderla solo
   mientras Pablo use `MENUPLAN_OP_PABLO`. Encendida, una sesión podría pedir
   ventanas iguales a las suyas: esa es la barrera real; la guardia es un
   filtro de buena fe.

Desde el paso 5 las sesiones no leen la URL de administrador:
`bot-coste`, `bot-medidas`, `bot-panel`, `lola-feedback`, `router-feedback` y
`verificar-estado` entran con `SUPABASE_DB_URL_LECTURA` (`verificar-estado` no
ve `cron`: con `--admin`, Pablo). Aplicar migraciones, `bot-cron`, `ensayo-*`,
`telegram-webhook`, `telegram-perfil` y los de Blob: Pablo con `MENUPLAN_OP_PABLO=1` hasta E5 (#331).
