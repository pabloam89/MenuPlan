---
name: tailscale
description: Úsala al conectar un PC o un servidor a la red privada, cuando no se pueda entrar al servidor del panel, si Tailscale «no abre» o sale Logged out, al invitar a alguien (Álvaro, Manu) o al cambiar quién puede ver qué. No para: el servidor en sí, su cortafuegos y sus copias (hetzner) ni las llaves SSH (1password).
---

# Tailscale

## Qué es y dónde

- **Una red privada (tailnet)** entre los aparatos de Pablo: lo que no está en
  ella no ve el servidor del panel. Cuenta de Pablo (entra con Google), plan
  **Free**. Consola: `console.tailscale.com/admin/machines`.
- **Máquinas hoy (8 oct 2026):**
  - `homenu-panel`, el servidor de Hetzner, Linux, `100.73.252.32`.
  - `pabloartinano`, el PC de Pablo, Windows, `100.72.247.69`.
- **Para qué:** el servidor del panel no abre ningún puerto a internet. Todo
  llega por aquí: SSH, el Postgres del panel y, más adelante, el propio panel.
- **Cómo se conectan:** directo de un aparato a otro (comprobado: el PC llega al
  servidor con conexión directa, sin pasar por un servidor de relevo).
- **En el servidor**, el cortafuegos deja pasar todo lo que entra por la interfaz
  `tailscale0` y nada más (skill `hetzner`).
- **En Windows** es una app de bandeja: no tiene ventana. Vive como un icono
  junto al reloj, y el servicio `Tailscale` arranca solo.
- **Pendiente:** el nombre `homenu-panel` como dirección (MagicDNS) no se ha
  probado: hoy se entra por la IP `100.x`. Álvaro y Manu todavía no están
  invitados.

## Claves y accesos

- **Cuenta:** Google de Pablo (`pabloam89@gmail.com`); no hay contraseña propia
  de Tailscale.
- **No hay claves de API ni auth keys creadas.** Cada máquina se añadió con un
  enlace de un solo uso que abrió Pablo en el navegador.
- Si alguna vez se crea una auth key o un token, va a 1Password y se apunta en
  `ops/INVENTARIO.md`.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Ver si el PC está conectado | `"C:\Program Files\Tailscale\tailscale.exe" status` | la lista de máquinas; si pone `Logged out.`, falta iniciar sesión |
| Iniciar sesión en el PC | clic derecho (o izquierdo) en el icono de la bandeja → **Log in** | el navegador abre la página de acceso; al terminar, `status` ya lista máquinas |
| Ver si el servidor está en la red | `ssh root@100.73.252.32 'tailscale status'` (con la `ssh` de Windows) | `homenu-panel` y `pabloartinano`, la segunda con `direct` |
| Probar la entrada al servidor | `ssh root@100.73.252.32 hostname` | `HoMenu-Panel` |
| Instalar en un servidor Linux | `curl -fsSL https://tailscale.com/install.sh \| sh` | `Installation complete!` y el servicio `tailscaled` en `active` |
| Conectar un servidor (OK) | `nohup tailscale up --hostname=<nombre> > /root/tailscale-up.log 2>&1 < /dev/null &` y leer el log | una línea `https://login.tailscale.com/a/…`; Pablo la abre y aprueba |
| IP de una máquina | `tailscale ip -4` | su dirección `100.x.y.z` |

## Lo que falló y por qué

- **2026-10-08 · «no consigo abrir Tailscale» en Windows.** Causa: no es una app
  con ventana; el servicio estaba corriendo, pero sin sesión
  (`tailscale status` decía `Logged out.`). Arreglo: iniciar
  sesión desde el icono de la bandeja; si no se ve, pulsar la flecha `^` de los
  iconos ocultos.
- **2026-10-08 · `tailscale up` en el servidor se queda esperando y parece
  colgado.** Causa: espera a que alguien abra el enlace de acceso, y no termina
  hasta entonces. Arreglo: lanzarlo con `nohup` en segundo plano, leer el enlace
  del log y pasárselo a Pablo.

## Qué requiere el OK de Pablo

- Invitar a alguien a la red (Álvaro, Manu) o compartir una máquina.
- Cambiar la política de acceso (las ACL) o los ajustes de la cuenta.
- Crear auth keys o tokens de API.
- Pasar a un plan de pago.

## Coste y límites

Plan **Free**, sin coste. Antes de invitar a más gente, mirar en la consola el
límite de usuarios y de aparatos del plan Free: Álvaro y Manu serían usuarios
nuevos. Si la red cayera, el servidor seguiría vivo pero inaccesible por SSH: la
vía de emergencia es la consola web de Hetzner (skill `hetzner`).

## Fuentes y comprobación

- https://tailscale.com/kb/1031/install-linux
- https://tailscale.com/kb/1347/installation
- https://tailscale.com/kb/1337/policy-syntax
- https://tailscale.com/kb/1081/magicdns

Comprobado el 2026-10-08: PC y servidor conectados a la misma red, SSH al servidor por su IP `100.x` con conexión directa y puertos públicos cerrados. Sin comprobar: MagicDNS, las políticas de acceso, invitar a otra persona y el límite exacto del plan Free.
