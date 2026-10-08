---
name: hetzner
description: Úsala al montar o tocar el servidor de Hetzner (el VPS del panel, de la base de staging o de los crons largos): entrar a la máquina por Tailscale o SSH, el firewall y los puertos, las copias, actualizar el servidor, reiniciarlo, ver el disco o restaurar una copia.
---

# Hetzner (servidor propio)

## Qué es y dónde

- **Estado hoy: sin montar.** No hay cuenta ni servidor (8 oct 2026). Lo
  primero lo hace Pablo: crear las cuentas de Hetzner y de Tailscale.
- **Para qué:** el panel de la factoría (repo propio, fuera de MenuPlan) y,
  quizá, una base de staging de MenuPlan y los crons largos, como el de
  Mercadona. **Producción no:** MenuPlan sigue en Vercel y Supabase.
- **Acceso:** solo por Tailscale (Pablo, Álvaro y Manu si se le invita). El
  servidor no expone ningún puerto a internet.
- Esta guía vive en el repo de MenuPlan porque aquí la ven todas las
  sesiones; cuando exista el repo del panel, se muda allí.

## Claves

Solo nombres; los valores van a 1Password, bóveda `HoMenu` (ver la skill
`1password`), y cada una se apunta en `ops/INVENTARIO.md`:
- Cuenta de Hetzner (usuario y 2FA de Pablo) y, si se usa la CLI `hcloud`, un
  token de API del proyecto.
- Cuenta de Tailscale y, si se automatiza el alta, una auth key.
- Contraseña del Postgres del servidor, si lo hay.

## Montaje paso a paso (todo «sin comprobar»)

1. **Tipo y región.** CX23 (x86) o CAX11 (ARM), en Falkenstein o Núremberg.
   *Por qué:* son los más baratos y están en Alemania, cerca de Vercel fra1.
   Imagen: Ubuntu LTS. Añade tu clave SSH pública al crearlo, nunca contraseña.
2. **Firewall de Hetzner antes de arrancar.** Crea un firewall sin reglas de
   entrada y aplícalo al servidor. *Por qué:* sin reglas, Hetzner bloquea todo
   lo entrante y deja salir todo; Tailscale funciona igual porque conecta
   hacia fuera. Durante el montaje, abre temporalmente el 22 solo a tu IP.
3. **Copias de Hetzner.** Actívalas al crear el servidor. *Por qué:* son
   diarias y guardan las 7 últimas. **No cubren los Volumes** que montes
   aparte, y una copia del disco en caliente no garantiza un Postgres
   coherente: ver el paso 8.
4. **Entrar y actualizar:** `ssh root@<ip-pública>`, y luego
   `apt update && apt full-upgrade -y`.
5. **Usuario normal:** `adduser pablo && usermod -aG sudo pablo`. *Por qué:*
   no trabajar como root.
6. **Tailscale con SSH:**
   ```
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up --ssh --advertise-tags=tag:servidor
   ```
   *Por qué:* entras con tu cuenta de Tailscale, sin claves que custodiar. Con
   MagicDNS lo llamas por su nombre (`ssh pablo@factoria`). En la consola de
   Tailscale, en la política: `tagOwners` para `tag:servidor`, un `grants` del
   grupo al tag y una regla `ssh` con `"action": "check"` y
   `"users": ["autogroup:nonroot"]`.
7. **Cerrar el SSH público.** Comprueba que entras por Tailscale, y entonces
   quita la regla del 22 en el firewall de Hetzner. En
   `/etc/ssh/sshd_config` pon `PasswordAuthentication no` y
   `PermitRootLogin no`, y haz `systemctl restart ssh`. *Por qué:* Tailscale
   SSH no toca OpenSSH; el SSH normal seguiría abierto si no lo cierras.
   fail2ban no hace falta si no hay ningún puerto abierto a internet.
8. **Actualizaciones automáticas.** Vienen instaladas en Ubuntu;
   comprueba que `/etc/apt/apt.conf.d/20auto-upgrades` tiene las dos líneas a
   `"1"`. Para reinicios de madrugada, en `50unattended-upgrades`:
   `Unattended-Upgrade::Automatic-Reboot "true";` y
   `Automatic-Reboot-Time "04:00";`. *Por qué:* los parches de seguridad
   entran solos.
9. **Postgres, solo en la tailnet.** `listen_addresses` = `localhost` más la
   IP de Tailscale (100.x.y.z), y en `pg_hba.conf` solo `100.64.0.0/10`.
   Copia lógica diaria con `pg_dump` a un fichero que también salga del
   servidor. *Por qué:* la copia de Hetzner es del disco; `pg_dump` es lo que
   se restaura con garantías.

## Operaciones habituales

| Qué | Cómo |
|---|---|
| Entrar | `ssh pablo@factoria` (con Tailscale encendido en tu PC) |
| Actualizar a mano | `sudo apt update && sudo apt full-upgrade -y` |
| ¿Pide reinicio? | `ls /var/run/reboot-required` (si existe, sí) |
| Reiniciar | `sudo reboot`, o desde la consola de Hetzner |
| Ver el disco | `df -h` y `sudo du -sh /var/* \| sort -h` |
| Restaurar una copia | Consola de Hetzner → servidor → Backups: «Rebuild» pisa el actual; mejor crear un servidor nuevo desde la copia y comprobarlo antes |
| Copia manual antes de un cambio gordo | Consola → Snapshots → crear (se guarda hasta que la borres) |

## Lo que falló y por qué

Vacío: se llena al montarlo (síntoma → causa → arreglo, con fecha).

## Qué requiere el OK de Pablo

- Crear o borrar el servidor, o cambiarlo de tamaño.
- Cualquier cosa con coste: copias, snapshots que se acumulan, Volumes, IPs.
- Abrir un puerto a internet, aunque sea un rato.
- Tocar la política de Tailscale o invitar a alguien.

## Coste

Unos 6-8 € al mes sin IVA: el servidor pequeño (5,5-6 €, más 0,50 € de IPv4)
y las copias (alrededor de un 20 % más). Hetzner subió precios en abril y en
junio de 2026: comprueba la cifra en la consola antes de crear nada.

## Fuentes

- https://docs.hetzner.com/cloud/firewalls/overview/
- https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
- https://www.hetzner.com/cloud/
- https://tailscale.com/kb/1031/install-linux
- https://tailscale.com/kb/1193/tailscale-ssh
- https://tailscale.com/kb/1337/policy-syntax
- https://tailscale.com/kb/1081/magicdns
- https://ubuntu.com/server/docs/how-to/software/automatic-updates/

Escrito el 2026-10-08, sin comprobar en un servidor real.
