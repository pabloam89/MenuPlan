# Tailscale en HoMenu (ficha de proyecto)

Los datos de HoMenu de la skill `tailscale` (`.claude/skills/tailscale/SKILL.md`, el método de la casa). Se piden con `--proyecto homenu` (`npm run skills-encargo -- … --proyecto homenu`). Lado: vertical (`ops/lados-ficheros.json`). Aquí van las cuentas, las máquinas y sus direcciones; el cómo se opera, en la skill.

## Qué hay

- **Cuenta** de Pablo (entra con Google), plan **Free**. Consola: `console.tailscale.com/admin/machines`.
- **Máquinas hoy** (la fecha, en «Comprobado» de abajo):
  - `homenu-panel`, el servidor de Hetzner, Linux, `100.73.252.32`.
  - `pabloartinano`, el PC de Pablo, Windows, `100.72.247.69`.
- **Para qué:** el servidor del panel no abre ningún puerto a internet. Todo llega por aquí: SSH, el Postgres del panel y, más adelante, el propio panel.
- **Cómo se conectan:** directo de un aparato a otro (comprobado: el PC llega al servidor con conexión directa, sin pasar por un servidor de relevo).
- **En el servidor**, el cortafuegos deja pasar todo lo que entra por la interfaz `tailscale0` y nada más (skill `hetzner`).
- **Pendiente:** el nombre `homenu-panel` como dirección (MagicDNS) no se ha probado: hoy se entra por la IP `100.x`. Álvaro y Manu todavía no están invitados.

## Claves y accesos

- **Cuenta:** Google de Pablo (`pabloam89@gmail.com`); no hay contraseña propia de Tailscale.
- **No hay claves de API ni auth keys creadas.** Cada máquina se añadió con un enlace de un solo uso que abrió Pablo en el navegador.
- Si alguna vez se crea una auth key o un token, va a 1Password y se apunta en `ops/INVENTARIO.md`.

## Operaciones del proyecto

| Qué | Comando | Debe salir |
|---|---|---|
| Ver si el servidor está en la red | `ssh root@100.73.252.32 'tailscale status'` (con la `ssh` de Windows) | `homenu-panel` y `pabloartinano`, la segunda con `direct` |
| Probar la entrada al servidor | `ssh root@100.73.252.32 hostname` | `HoMenu-Panel` |

## Quién puede pedir qué

Invitar a Álvaro o a Manu a la red o cambiar las ACL es del OK de Pablo (norma `ajustes-servicios-ok-pablo`). Antes de invitar, mirar en la consola el límite de usuarios y de aparatos del plan Free: Álvaro y Manu serían usuarios nuevos. Si la red cayera, el servidor seguiría vivo pero inaccesible por SSH: la vía de emergencia es la consola web de Hetzner (skill `hetzner`).

## Comprobado

Comprobado el 2026-10-08: PC y servidor conectados a la misma red, SSH al servidor por su IP `100.x` con conexión directa y puertos públicos cerrados. Sin comprobar: MagicDNS, las políticas de acceso, invitar a otra persona y el límite exacto del plan Free.
