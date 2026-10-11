# El panel de la factoría (repo `homenu-panel`)

Lo que corre en el servidor `HoMenu-Panel` desde el 10 oct 2026. El código vive en su
propio repo privado, `pabloam89/homenu-panel` (en el PC, `C:\dev\homenu-panel`); MenuPlan
solo lo nombra.

## Qué es y dónde

- **Dirección:** `http://100.73.252.32:8080`, solo por Tailscale. El puerto va atado a
  la IP de Tailscale (Docker se salta `ufw`); la pública no responde.
- **Qué corre:** Node 24 sin dependencias, en Docker Compose en `/opt/panel/app`
  (`mem_limit 128m`, `read_only`, `cap_drop ALL`, volumen `datos:/data` para los informes).
- **Qué enseña:** glosario, estándares, agentes, skills, tipos de encargo, fondos,
  entidades, la biblioteca de diseño (`/diseno`: meta-sistema, HoMenu y estado, con
  barra lateral e índice), issues y coste. Todo se lee de MenuPlan (rama `staging`):
  ficheros por `raw.githubusercontent.com` y issues por la API REST pública, con caché
  de 15 minutos y datos viejos si GitHub falla.
- **Qué manda el PC de Pablo:** el informe de `npm run fabrica -- --json` (coste y
  tiempo por encargo) a `POST /ingest/fabrica`.

## Desplegar

Dos llamadas separadas (un `&&` seguido de `&` pierde la entrada estándar):

1. `git archive HEAD | ssh 'tar -x -C /opt/panel/app'`, desde `C:\dev\homenu-panel`.
2. `ssh ': > /root/panel-deploy.log; nohup sh /opt/panel/app/desplegar.sh >/dev/null 2>&1 < /dev/null &'`.

Cada conexión pide aprobar en 1Password: avisa a Pablo antes (skill `1password`).
Comprobar: `curl http://100.73.252.32:8080/<vista>` devuelve 200.

## El envío desde el PC de Pablo

- **Qué:** `cliente/enviar-fabrica.mjs`, lanzado cada 10 minutos por la tarea de
  Windows «HoMenu panel - enviar fabrica» (Programador de tareas), con `--solo-si-cambia`
  (sin transcripciones nuevas sale en 0,4 s) y `--actualizar` (pone al día la copia de
  solo lectura `C:\dev\MenuPlan-panel-lectura`, para medir con el `fabrica` actual).
- **Instalar o reinstalar (lo lanza Pablo con `!`):**
  `powershell -NoProfile -ExecutionPolicy Bypass -File C:/dev/homenu-panel/cliente/instalar-tarea.ps1`.
  Con barras normales: en Git Bash las invertidas se pierden.
- **Ver que corre:** `~/.claude/menuplan-fabrica/enviar.log` gana una línea por ejecución
  (`enviar-fabrica resultado: ok|fallo|sin-cambios`).

## Lo que falló

- **2026-10-10 · la tarea no ejecutaba nada con `conhost.exe --headless`.** Causa: no
  lanza el comando. Arreglo: `wscript.exe` con `cliente/oculto.vbs`, que corre `cmd` sin
  ventana. En VBScript `log` es palabra reservada (colgó un `wscript`); depurar con
  `cscript //nologo`.
- **2026-10-10 · la sesión no pudo crear la tarea programada.** Causa: el clasificador de
  permisos niega dejar algo corriendo en el PC. Arreglo: la lanza Pablo con `!`.
- **2026-10-10 · `fabrica` sin `--sin-github` fallaba con «API rate limit exceeded».**
  Causa: su consulta GraphQL gastaba 321 puntos. Arreglo: PR #532 (18 puntos, caché de
  10 minutos, campo `datos_github`).
- **2026-10-11 · sin la tarea reinstalada, la acción seguía siendo la antigua** (`conhost`
  y `C:\dev\MenuPlan`), y el panel solo se actualizaba a mano. Arreglo: reinstalar con el
  script de arriba; el primer envío llegó a las 08:37 (hora de Madrid).
- **2026-10-11 · el despliegue de `/diseno` dejó el contenedor reiniciándose en bucle.**
  Causa: el `Dockerfile` copia los `.mjs` uno a uno y no incluía el nuevo `markdown.mjs`;
  el script daba `FIN ok` aunque el servidor no arrancaba. Arreglo: añadirlo, y un test del
  repo del panel que exige todos los `.mjs` de la raíz en el `Dockerfile` (visto fallar sin
  la línea). Tras desplegar, comprobar con `curl` que la vista responde 200; `FIN ok` no basta.
