---
name: hetzner
description: Úsala al tocar el servidor de Hetzner (el VPS del panel): entrar a la máquina, el cortafuegos y los puertos, actualizar o reiniciar, Docker y el Postgres del panel, las copias y restaurarlas, el disco o la memoria, o crear otro servidor. No para: la red privada y quién puede entrar (tailscale), las claves y la llave SSH (1password) ni la base de MenuPlan (supabase).
---

# Hetzner (servidor propio)

## Qué es y dónde

- **Servidor `HoMenu-Panel`**, en el proyecto `HoMenu` de la consola de Hetzner
  Cloud: CPX02 (1 vCPU AMD, **1 GB de RAM**, 20 GB NVMe), Falkenstein (fsn1),
  Ubuntu 26.04 LTS. Creado el 8 oct 2026.
- **Direcciones:** la pública, `188.245.14.194`, no se usa para nada (el 22 está
  cerrado). La de la red privada es `100.73.252.32` (skill `tailscale`).
- **Para qué:** el panel de la factoría (repo propio, fuera de MenuPlan). Producción
  **no**: MenuPlan sigue en Vercel y Supabase.
- **Qué corre:** Docker 29 y Compose; Postgres 17 en `/opt/panel`
  (`compose.yaml` y `.env`, contenedor `panel-db-1`, volumen `pgdata`); 2 GB de
  swap; cortafuegos `ufw`; copia diaria con un temporizador de systemd.
- **Cómo está cerrado:**
  - `ufw`: todo lo que entra se deniega salvo lo que llega por `tailscale0`.
  - `sshd`: solo llaves, sin contraseña (`/etc/ssh/sshd_config.d/10-solo-llaves.conf`).
  - Postgres escucha **solo** en `100.73.252.32:5432`.
- **Pendiente:**
  - **Copia fuera del servidor.** Las copias están en el mismo disco: si se pierde
    el servidor, se pierden con él.
  - **Restaurar una copia de verdad** está sin ensayar en este servidor (ver
    «Fuentes y comprobación»).
  - Usuario sin privilegios y el repo del panel, que aún no existe.

## Claves y accesos

- **Entrar:** `root` con la llave Ed25519 `HoMenu - Hetzner Panel`, del agente SSH
  de 1Password; cada conexión pide aprobar. Hace falta Tailscale encendido en el
  PC. Skill `1password`.
- **Cuenta de Hetzner:** ficha `Hetzner` en la bóveda `Private` de Pablo, con 2FA
  y los códigos de recuperación dentro.
- **Contraseña del Postgres:** ficha `Postgres del panel` en la bóveda
  `Panel HoMenu`, y su copia en `/opt/panel/.env` del servidor (permisos 600).
  Ninguna se imprime nunca.
- **Nada en `ops/env.1password`:** el panel todavía no es parte de MenuPlan.

## Operaciones habituales

Con `ssh` se entiende `C:\Windows\System32\OpenSSH\ssh.exe root@100.73.252.32`
(en PowerShell, `ssh` ya es esa).

| Qué | Comando | Debe salir |
|---|---|---|
| Entrar | `ssh` | el prompt del servidor; la primera vez, ventana de 1Password a aprobar |
| Lanzar algo largo | subir el script (`ssh 'cat > /root/x.sh' < x.sh`) y **en otra llamada** `ssh 'nohup bash /root/x.sh >/dev/null 2>&1 < /dev/null &'`; leer el log | el script sigue aunque se corte la conexión |
| Actualizar | `apt-get update && apt-get -y upgrade`, lanzado como lo anterior | el log acaba sin errores |
| ¿Pide reinicio? | `ls /var/run/reboot-required` | el fichero existe, o `No such file` |
| Reiniciar (OK) | `systemctl reboot` | el servidor vuelve en menos de un minuto; la swap y Docker arrancan solos |
| Memoria y swap | `free -m; swapon --show` | ~927 MB de RAM y `/swapfile` de 2 G |
| Disco | `df -h /` | 19 G en total |
| Estado del Postgres | `cd /opt/panel && docker compose ps` | `Up … (healthy)` y `100.73.252.32:5432->5432/tcp` |
| Cortafuegos | `ufw status verbose` | `active`, `deny (incoming)` y `ALLOW IN` en `tailscale0` |
| Copia ahora | `systemctl start panel-backup.service` | un `panel-….dump` nuevo en `/var/backups/panel` |
| Últimas copias | `ls -lt /var/backups/panel \| head -3` | una por día (03:30 UTC), con 14 días de historia |
| Ver el temporizador | `systemctl list-timers panel-backup.timer` | la próxima ejecución |
| Restaurar en una base nueva (OK) | `cd /opt/panel && docker compose exec -T db pg_restore -U panel -d <base_nueva> --no-owner < <fichero.dump>` | sin errores; los datos están en la base nueva |
| ¿Se ve el puerto desde fuera? | `bash -c 'echo > /dev/tcp/188.245.14.194/5432'` desde cualquier PC | no conecta (timeout) |

- **Cortafuegos con red de seguridad.** Antes de tocar `ufw` o `sshd`, armar un
  temporizador que lo deshaga solo:
  `systemd-run --on-active=300 --unit=ufw-rescate /usr/sbin/ufw disable`; se
  cancela con `systemctl stop ufw-rescate.timer` cuando se comprueba que se
  entra por Tailscale. Si algo falla, la consola web de Hetzner entra sin red.
- **Docker publica los puertos saltándose `ufw`.** Todo `ports:` de un
  `compose.yaml` va atado a la IP de Tailscale (`100.73.252.32:5432:5432`), nunca
  `5432:5432`.

## Lo que falló y por qué

- **2026-10-08 · una orden larga por SSH no vuelve y se corta a los 300 s
  (`apt upgrade`, `ufw` con varios pasos).** Causa: la orden depende de que la
  conexión siga viva y esperando; no se llegó a determinar si fue la aprobación
  de 1Password o la propia sesión. Con el mismo trabajo lanzado dentro del
  servidor tardó un minuto. Arreglo: subir el script y lanzarlo con `nohup`;
  esperar leyendo el log. El cortafuegos, en pasos cortos y con el temporizador
  de rescate.
- **2026-10-08 · el script se subió vacío y no se ejecutó nada.** Causa:
  `cat > f && nohup … &` mete la lista entera en segundo plano, y un trabajo en
  segundo plano pierde la entrada estándar. Arreglo: subir el fichero en una
  llamada y lanzarlo en otra.
- **2026-10-08 · ventana de «Git for Windows» al conectar.** Causa: la `ssh` de
  Git Bash no habla con el agente de 1Password. Arreglo: la `ssh` de Windows
  (detalle en la skill `1password`).
- **2026-10-08 · la guardia niega `create table` y `drop` aunque sean sobre el
  Postgres del panel.** Causa: la regla de «SQL contra producción» mira el texto
  y no distingue entre Supabase y esta base. Arreglo: la guardia deja pasar un
  `psql` que va dentro de `docker compose exec` (o `docker exec`) sin URL ni host
  en su tramo, y sigue negando cualquier otro; con test en
  `.claude/hooks/guardia.test.js`. No ve el SQL que va dentro de un fichero.
- **2026-10-08 · SSH aceptaba contraseñas** (`passwordauthentication yes`).
  Causa: es el valor por defecto de Ubuntu. Arreglo: el fichero
  `/etc/ssh/sshd_config.d/10-solo-llaves.conf`, validado con `sshd -t` y aplicado
  con `systemctl reload ssh`; con contraseña ahora da `Permission denied (publickey)`.
- **2026-10-08 · los 23 € que asustaron eran de otro modelo.** Causa: la web de
  ventas enseña precios **sin IVA** (CPX02, 6,49 €) y la consola, **con IVA del
  21 %** (7,25 €), y la fila de abajo, la CPX22, cuesta 23,58 €. Arreglo: fijarse
  en el **total** de la columna de la derecha al crear (7,85 € con IPv4).

## Qué requiere el OK de Pablo

- Crear, borrar o cambiar de tamaño el servidor, o un Volume o IP.
- Cualquier cosa con coste: Backups de Hetzner (+20 %), snapshots que se
  acumulan, otro servidor.
- Abrir un puerto a internet, aunque sea un rato; tocar `ufw` o `sshd` más allá
  de lo escrito aquí.
- `docker compose down -v` o borrar el volumen `pgdata` (se pierden los datos), y
  restaurar sobre la base `panel`.
- Rotar la contraseña del Postgres (es un secreto: skill `1password`).

## Coste y límites

**7,85 €/mes con IVA** (servidor 7,25 € + IPv4 0,61 €; 8 oct 2026), facturado por
horas: si se borra a los tres días, se paga tres días. Sin Backups de Hetzner
(sumarían ~20 %). Tráfico incluido: 20 TB. Límite que muerde: **1 GB de RAM**, con
la swap de 2 GB como colchón; si Postgres y el panel no caben, se sube a la CPX12
(2 GB, 13,90 € con IVA) desde la consola, y se puede volver a bajar eligiendo
«solo CPU y RAM» al redimensionar. Hetzner subió precios en abril y en junio de
2026: confirmar la cifra en la consola antes de crear nada.

## Fuentes y comprobación

- https://docs.hetzner.com/cloud/servers/overview/
- https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
- https://docs.docker.com/engine/network/packet-filtering-firewalls/
- https://ubuntu.com/server/docs/how-to/software/automatic-updates/

Comprobado el 2026-10-08: entrada por SSH (por la red privada y, antes de cerrarlo, por la pública), actualización, reinicio con la swap activa, `ufw` activo con la pública sin respuesta en el 22 y el 5432, Postgres sano, copia diaria creada y `sshd` sin contraseñas. Sin comprobar: restaurar una copia en una base nueva, las actualizaciones automáticas de seguridad más allá de ver sus dos líneas activas y la copia fuera del servidor (no existe).
