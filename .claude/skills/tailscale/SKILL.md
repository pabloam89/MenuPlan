---
name: tailscale
description: Úsala al conectar un PC o un servidor a la red privada, cuando no se pueda entrar a un servidor que solo se ve por esa red, si Tailscale «no abre» o sale Logged out, al invitar a alguien o al cambiar quién puede ver qué. No para: el servidor en sí, su cortafuegos y sus copias (hetzner) ni las llaves SSH (1password).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-08"
  normas: [ajustes-servicios-ok-pablo]
---

# Tailscale

Método de la casa. Las máquinas, sus direcciones y las cuentas de un proyecto concreto no van aquí: están en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/tailscale.md`), que llega con `--proyecto <id>` en el brief. Si no te llegó (no pasaste por `/orquestar`), ábrela tú en esa ruta, con el id de tu proyecto: la puerta de la guardia te la sugiere al pedirte esta skill.

## Qué es y dónde

- **Una red privada (tailnet)** entre los aparatos de una persona o un equipo: lo que no está en ella no ve los servidores que solo se abren por ahí. Consola: `console.tailscale.com/admin/machines`. Plan **Free** para empezar.
- **Para qué:** un servidor sin ningún puerto abierto a internet. Todo llega por la red privada: SSH, una base de datos, un panel.
- **Cómo se conectan:** directo de un aparato a otro; `status` dice `direct` cuando no pasa por un servidor de relevo.
- **En el servidor**, el cortafuegos deja pasar todo lo que entra por la interfaz `tailscale0` y nada más (skill `hetzner`).
- **En Windows** es una app de bandeja: no tiene ventana. Vive como un icono junto al reloj, y el servicio `Tailscale` arranca solo.
- **Pendiente:** el nombre de la máquina como dirección (MagicDNS) no se ha probado; se entra por la IP `100.x`.

## Claves y accesos

- **La cuenta** es la de quien administra la red (entra con su proveedor de identidad): no hay contraseña propia de Tailscale.
- **Sin claves de API ni auth keys** mientras no hagan falta. Cada máquina se añade con un enlace de un solo uso que abre una persona en el navegador.
- Si alguna vez se crea una auth key o un token, va a 1Password y se apunta en `ops/INVENTARIO.md`.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Ver si el PC está conectado | `"C:\Program Files\Tailscale\tailscale.exe" status` | la lista de máquinas; si pone `Logged out.`, falta iniciar sesión |
| Iniciar sesión en el PC | clic derecho (o izquierdo) en el icono de la bandeja → **Log in** | el navegador abre la página de acceso; al terminar, `status` ya lista máquinas |
| Ver si un servidor está en la red | `ssh root@<ip 100.x> 'tailscale status'` (con la `ssh` de Windows) | las máquinas de la red, la del PC con `direct` |
| Instalar en un servidor Linux | `curl -fsSL https://tailscale.com/install.sh \| sh` | `Installation complete!` y el servicio `tailscaled` en `active` |
| Conectar un servidor (OK) | `nohup tailscale up --hostname=<nombre> > /root/tailscale-up.log 2>&1 < /dev/null &` y leer el log | una línea `https://login.tailscale.com/a/…`; una persona la abre y aprueba |
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
  del log y pasárselo a quien lo apruebe.

## Qué requiere el OK de Pablo

- Invitar a alguien a la red o compartir una máquina.
- Cambiar la política de acceso (las ACL) o los ajustes de la cuenta.
- Crear auth keys o tokens de API.
- Pasar a un plan de pago.

## Coste y límites

Plan **Free**, sin coste. Antes de invitar a más gente, mirar en la consola el
límite de usuarios y de aparatos del plan Free. Si la red cayera, el servidor
seguiría vivo pero inaccesible por SSH: la vía de emergencia es la consola web
del proveedor del servidor (skill `hetzner`).

## Fuentes y comprobación

- https://tailscale.com/kb/1031/install-linux
- https://tailscale.com/kb/1347/installation
- https://tailscale.com/kb/1337/policy-syntax
- https://tailscale.com/kb/1081/magicdns

Comprobado el 2026-10-08: un PC y un servidor conectados a la misma red, SSH al servidor por su IP `100.x` con conexión directa y puertos públicos cerrados (qué máquinas eran, en la ficha del proyecto). Sin comprobar: MagicDNS, las políticas de acceso, invitar a otra persona y el límite exacto del plan Free.
