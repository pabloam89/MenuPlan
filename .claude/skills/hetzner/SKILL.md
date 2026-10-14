---
name: hetzner
description: Úsala al tocar un servidor de Hetzner (un VPS propio): entrar a la máquina, el cortafuegos y los puertos, actualizar o reiniciar, Docker y su Postgres, las copias y restaurarlas (también una copia nocturna cifrada de una base, su ensayo y rotar su clave de cifrado), el disco o la memoria, o crear otro servidor. No para: la red privada y quién puede entrar (tailscale), la llave SSH y las demás claves (1password, alta-de-secreto) ni una base alojada en otro proveedor (supabase).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-09"
  normas: [copia-nocturna-base, copias-solo-con-su-rol, copia-restaurada-ensayada]
---

# Hetzner (servidor propio)

Método de la casa. El servidor concreto de un proyecto (nombre, direcciones, qué corre, sus copias, su coste y lo que ha fallado ahí) no va aquí: está en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/hetzner.md`), que llega con `--proyecto <id>` en el brief.

## Qué es y dónde

- **Un VPS de Hetzner Cloud** (consola `console.hetzner.cloud`), con Ubuntu LTS, Docker y Compose, y cortafuegos `ufw`. Se crea en un proyecto de la consola y se factura por horas.
- **Se entra solo por la red privada** (skill `tailscale`): el cortafuegos deniega todo lo que entra salvo lo que llega por `tailscale0`, y la dirección pública no se usa para nada.
- **Cómo debe quedar cerrado:**
  - `ufw`: todo lo que entra se deniega salvo lo que llega por `tailscale0`.
  - `sshd`: solo llaves, sin contraseña (`/etc/ssh/sshd_config.d/10-solo-llaves.conf`, validado con `sshd -t`).
  - Un Postgres en Docker escucha **solo** en la IP de la red privada.
- **Copias.** Una copia diaria con un temporizador de systemd, y para una base ajena una copia nocturna cifrada con `age`: `pg_dump -Fc` por tubería a `age` con la clave pública, nada en claro en el disco, y **el servidor no puede leer sus copias** (la privada vive en 1Password). Se poda sola tras una copia buena. Solo con un rol de lectura de copia <!-- norma:copias-solo-con-su-rol -->: con otro usuario, o si puede escribir, la copia para. Cada copia deja una línea `campo: valor` (`copia-base … resultado: ok|fallo motivo: …`).
- **Pendiente:** una copia fuera del servidor (las copias están en el mismo disco que lo que copian) y un aviso cuando una copia falle.

## Claves y accesos

- **Entrar:** `root` con una llave Ed25519 del agente SSH de 1Password; cada conexión pide aprobar. Hace falta la red privada encendida en el PC. Skill `1password`.
- **Cuenta de Hetzner:** una ficha en la bóveda personal de la persona, con 2FA y los códigos de recuperación dentro.
- **Contraseña del Postgres del servidor:** una ficha en 1Password y su copia en el `.env` del servidor (permisos 600). Ninguna se imprime nunca.
- **Copias de una base:** un `copia.env` en el servidor (root, 600) con la URL de un rol de solo lectura de copia; se escribe por tubería desde 1Password, nunca a mano en un comando. La clave privada de `age` **no** va al servidor.
- Qué fichas, bóvedas y rutas son las de un proyecto: la ficha del proyecto.

## Operaciones habituales

Con `ssh` se entiende `C:\Windows\System32\OpenSSH\ssh.exe root@<ip de la red privada>` (en PowerShell, `ssh` ya es esa).

| Qué | Comando | Debe salir |
|---|---|---|
| Entrar | `ssh` | el prompt del servidor; **cada vez** ventana de 1Password a aprobar: avisa a la persona antes y espera su sí (sin él, «communication with agent failed»; skill `1password`) |
| Lanzar algo largo | subir el script (`ssh 'cat > /root/x.sh' < x.sh`) y **en otra llamada** `ssh 'nohup bash /root/x.sh >/dev/null 2>&1 < /dev/null &'`; leer el log | el script sigue aunque se corte la conexión |
| Actualizar | `apt-get update && apt-get -y upgrade`, lanzado como lo anterior | el log acaba sin errores |
| ¿Pide reinicio? | `ls /var/run/reboot-required` | el fichero existe, o `No such file` |
| Reiniciar (OK) | `systemctl reboot` | el servidor vuelve en menos de un minuto; la swap y Docker arrancan solos |
| Memoria y swap | `free -m; swapon --show` | la RAM del plan y `/swapfile` |
| Disco | `df -h /` | el tamaño del plan |
| Estado de un Postgres en Docker | `cd /opt/<app> && docker compose ps` | `Up … (healthy)` y el puerto atado a la IP de la red privada |
| Cortafuegos | `ufw status verbose` | `active`, `deny (incoming)` y `ALLOW IN` en `tailscale0` |
| Ver un temporizador | `systemctl list-timers <nombre>.timer` | la próxima ejecución |
| Restaurar en una base nueva (OK) | `docker compose exec -T db pg_restore -U <usuario> -d <base_nueva> --no-owner < <fichero.dump>` | sin errores y los datos en la base nueva |
| ¿Se ve el puerto desde fuera? | `bash -c 'echo > /dev/tcp/<ip pública>/5432'` desde cualquier PC | no conecta (timeout) |
| ¿Falló alguna copia? | `ssh 'grep -c "resultado: fallo" <copias.log>; systemctl is-failed <servicio>'` | `0` e `inactive` |

Instalar las copias de una base (OK; lo lanza la persona con `!`), su ensayo de restauración mensual y rotar su clave son pasos de un proyecto: están en su ficha.

- **Cortafuegos con red de seguridad.** Antes de tocar `ufw` o `sshd`, armar un
  temporizador que lo deshaga solo:
  `systemd-run --on-active=300 --unit=ufw-rescate /usr/sbin/ufw disable`; se
  cancela con `systemctl stop ufw-rescate.timer` cuando se comprueba que se
  entra por la red privada. Si algo falla, la consola web de Hetzner entra sin red.
- **Docker publica los puertos saltándose `ufw`.** Todo `ports:` de un
  `compose.yaml` va atado a la IP de la red privada (`<ip 100.x>:5432:5432`), nunca
  `5432:5432`.

## Lo que falló y por qué

- **2026-10-08 · una orden larga por SSH no vuelve y se corta a los 300 s
  (`apt upgrade`, `ufw` con varios pasos).** Causa: la orden depende de que la
  conexión siga viva y esperando; probablemente fue la ventana de aprobación de
  1Password sin contestar (el 11 oct se midió que sin ella la `ssh` falla con
  «communication with agent failed»; skill `1password`). Con el mismo trabajo lanzado dentro del
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
- **2026-10-08 · SSH aceptaba contraseñas** (`passwordauthentication yes`).
  Causa: es el valor por defecto de Ubuntu. Arreglo: el fichero
  `/etc/ssh/sshd_config.d/10-solo-llaves.conf`, validado con `sshd -t` y aplicado
  con `systemctl reload ssh`; con contraseña ahora da `Permission denied (publickey)`.
- **2026-10-08 · un precio de la consola asustó porque era de otro modelo.**
  Causa: la web de ventas enseña precios **sin IVA** y la consola, **con IVA del
  21 %**, y la fila de abajo es otro modelo. Arreglo: fijarse en el **total** de la
  columna de la derecha al crear.

## Qué requiere el OK de Pablo

- Crear, borrar o cambiar de tamaño el servidor, o un Volume o IP.
- Cualquier cosa con coste: Backups de Hetzner (+20 %), snapshots que se
  acumulan, otro servidor.
- Abrir un puerto a internet, aunque sea un rato; tocar `ufw` o `sshd` más allá
  de lo escrito aquí.
- `docker compose down -v` o borrar el volumen de datos (se pierden), y
  restaurar sobre una base con datos.
- Rotar la contraseña del Postgres (es un secreto: skill `1password`).
- Copias de una base: instalarlas o cambiarlas en el servidor, escribir su
  `copia.env`, activar el temporizador, borrar copias a mano y lanzar el ensayo
  (baja una copia y lee producción). Pueden ser datos de salud de familias.

## Coste y límites

Se factura por horas: si se borra a los tres días, se paga tres días. Sin Backups
de Hetzner (sumarían ~20 %). Límite que muerde en un servidor pequeño: la **RAM**
(1 GB), con la swap como colchón; si no cabe, se sube de plan desde la consola y se
puede volver a bajar eligiendo «solo CPU y RAM» al redimensionar. Hetzner subió
precios en abril y en junio de 2026: confirmar la cifra en la consola antes de
crear nada. El precio concreto de un proyecto, en su ficha.

## Fuentes y comprobación

- https://docs.hetzner.com/cloud/servers/overview/
- https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
- https://docs.docker.com/engine/network/packet-filtering-firewalls/
- https://ubuntu.com/server/docs/how-to/software/automatic-updates/
- https://github.com/FiloSottile/age
- https://www.postgresql.org/docs/17/app-pgdump.html
- https://healthchecks.io/docs/

Comprobado el 2026-10-08: entrada por SSH (por la red privada y, antes de cerrarlo, por la pública), actualización, reinicio con la swap activa, `ufw` activo con la pública sin respuesta en el 22 y el 5432, Postgres sano, copia diaria creada, restauración de una copia en una base nueva con el dato intacto y `sshd` sin contraseñas (qué servidor, en la ficha del proyecto). Sin comprobar: restaurar sobre una base llena de datos de verdad, las actualizaciones automáticas de seguridad más allá de ver sus dos líneas activas y una copia fuera del servidor. Comprobado el 2026-10-09: el script de copia con docker, age y curl falsos (copia buena, poda, cada motivo de fallo, código de salida, contraseña fuera de todo argv). Sin probar en ninguna parte: la restauración por tubería (`age -d | pg_restore` desde stdin).
