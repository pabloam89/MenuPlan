---
name: 1password
description: Úsala al montar un .env.local o un worktree, cuando un script no pueda leer una dirección op://, para leer una clave desde un script (leerEnv), al guardar algo en una bóveda nueva, o si falla la service account, el token del llavero o el agente SSH. No para: dar de alta ni rotar una clave de punta a punta, ni una clave filtrada (alta-de-secreto); la clave de las copias cifradas (hetzner); dónde vive cada clave (ops/INVENTARIO.md) ni las contraseñas personales de Pablo.
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-11"
  normas: [claves-de-pablo-solo-pablo, secretos-ok-pablo]
---

# 1Password

Método de la casa. Las bóvedas, las service accounts, las fichas y los scripts de un proyecto concreto no van aquí: están en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/1password.md`), que llega con `--proyecto <id>` en el brief.

## Qué es y dónde

- **El gestor de claves** de la persona que administra el proyecto, con una cuenta y varias bóvedas. Ninguna clave va escrita en el repo: se guarda su nombre y dónde vive.
- **`.env.local` guarda direcciones, no claves** (`op://bóveda/ficha/campo`). Hay una plantilla en `ops/env.1password`, y `npm run tarea` copia el `.env.local` de la carpeta principal, así que cada worktree hereda las direcciones.
- **Quién las resuelve**: `scripts/lib/env.mjs` (`leerEnv`, `cargarEnv`) en los scripts y `vite.config.js` en la app. En los tests no se resuelven: corren sin claves, como en el CI.
- **Dos caminos con `op`, y no se mezclan**: con una service account (solo lectura, sin ventanas) para leer; sin ella, por la app de escritorio (pide aprobación a una persona), para escribir o leer lo que la cuenta no ve. Sin token y sin la variable que elige la app, `env.mjs` falla cerrado: no cae solo a la app.
- **La guardia** niega a las sesiones elegir el camino de la app, tocar el token de la service account (`env -u`, `unset`…) y escribir direcciones `op://` de la bóveda de producción en una orden. La persona lo lanza con `!`, que no pasa por ella.
- **Plan B entre bóvedas** (`env.mjs`, `enOtraBoveda`): una dirección de la bóveda de las sesiones que no se lee se busca en la principal y al revés, con la línea `env-boveda clave: X de: A a: B motivo: respaldo`; Vite arranca sin las que no puede leer.
- **Agente SSH de 1Password**: guarda las llaves SSH; cada conexión pide aprobar **en la ventana de 1Password y con la persona delante**: si nadie la contesta en unos segundos, la `ssh` falla con «communication with agent failed» (ver «Lo que falló»). Sirve a la `ssh` de Windows, no a la de Git for Windows.
- **CLI** `op`: `winget install AgileBits.1Password.CLI`.

## Claves y accesos

- Los nombres, para qué sirve cada clave y quién es el dueño: `ops/INVENTARIO.md`, que es la tabla que manda. Las direcciones: `ops/env.1password`. No se repiten aquí.
- **El token del llavero** de Windows (Administrador de credenciales → credenciales web): `env.mjs` lo coge de ahí para que `op` no pida la huella en cada comando. Un solo token: el de las sesiones, con lectura solo de la bóveda de las sesiones. Cualquier proceso del PC puede leerlo. Lo guarda `scripts/llavero-op.mjs` por stdin, con un solo `Add` (sustituye en sitio: el llavero no se queda vacío) y lo relee a ciegas.
- **Una service account solo lee las bóvedas que se le dieron al crearla**; no puede crear nada. Una clave que da acceso a producción no va a la bóveda que leen las sesiones.
- Qué service accounts, bóvedas y fichas hay en un proyecto, y qué clave abre qué: la ficha del proyecto.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Worktree nuevo sin `.env.local` | `cp ops/env.1password .env.local` | un `.env.local` con líneas `NOMBRE=op://…` |
| Leer una clave desde un script nuevo | `leerEnv("NOMBRE")` de `scripts/lib/env.mjs`; nunca un `readFileSync(".env.local")` propio | el valor en memoria; en pantalla nada |
| Lanzar algo que lee `process.env` (`node --env-file`, `vercel`…) | `npm run op -- run --env-file=.env.local -- <comando>` | el comando corre; si imprime una clave, sale `<concealed by 1Password>` |
| Comprobar que una clave está bien | comparar a ciegas (`valor === otro`) e imprimir solo el sí o el no | `COINCIDEN` o `NO COINCIDEN`, nunca el valor |
| Guardar algo en una bóveda nueva (OK; la persona, `!`) | sin el token de la service account y con el **id** de la bóveda, no su nombre: `npm run op -- item create --vault <id> --format json -` | ficha creada; ventana de 1Password a aprobar |
| Pasar una clave a otro programa por nombre de ficha (la persona, PowerShell aparte) | `node scripts/op.mjs item get "<Ficha>" --vault <bóveda> --fields label=<CAMPO> --reveal \| <programa que lee stdin>` | el programa la recibe; en pantalla, nada. Vale con fichas cuyo nombre no cabe en `op://` |
| Cambiar el valor de una ficha (OK). Rotar de punta a punta es de `alta-de-secreto` | solo el paso de 1Password: se cambia el campo de la ficha (en todas las bóvedas donde esté). Crear la nueva en el servicio, ponerla en cada destino y revocar la vieja: skill `alta-de-secreto` | las direcciones no cambian: nadie toca su `.env.local` |
| Ver qué llaves sirve el agente SSH | `C:\Windows\System32\OpenSSH\ssh-add.exe -l` | una línea por llave, con su título |
| La `ssh` falla con «communication with agent failed» o «Permission denied (publickey)»: ¿por qué? | `grep -a "ssh authorization prompt" "$LOCALAPPDATA"/1Password/logs/1Password_r*.log` (Git Bash; las horas del log son UTC) | una línea `ssh authorization prompt timed out` a la hora del fallo = nadie aprobó la ventana; no es un fallo del agente |

El valor de una clave **nunca va escrito en un comando**: quedaría en la conversación. Se pasa por tubería (stdin) entre dos procesos.

Crear la bóveda de las sesiones y su service account, copiar fichas, guardar el token nuevo y comprobar que la cuenta lee solo lo suyo son pasos de un proyecto: están en su ficha.

## Lo que falló y por qué

- **2026-10-11 · la `ssh` al servidor falla con «communication with agent failed».**
  Causa: nadie contestó la ventana de aprobar de 1Password (log: `ssh authorization
  prompt timed out`); no era el agente ni la llave. Arreglo: avisar a la persona antes de
  conectar y esperar su sí, sin reintentar en bucle.
- **2026-10-09 · una dirección `op://` daba error con la ficha y el campo bien puestos.**
  Causa: el nombre de la ficha llevaba una tilde; la sintaxis de `op://` solo
  admite letras y cifras sin acento, espacios, `-`, `_` y `.` (lo demás, por id).
  Arreglo: leer esa ficha por nombre con `op item get` (fila de arriba) y crear
  las fichas nuevas sin tildes (skill `alta-de-secreto`).
- **2026-10-09 · «a vault query must be provided when this command is called by
  a service account» al leer fichas por su nombre.** Causa: con la service
  account, `op item get` pide `--vault`; con la app, no. Arreglo: todo script
  pasa `--vault`.
- **2026-10-08 · «"<nombre de bóveda>" isn't a vault in this account» al crear una
  ficha por script.** Causa: Node con `shell: true` concatena los argumentos y
  el espacio del nombre parte la bóveda en dos. Arreglo: pasar el **id** de la
  bóveda, no el nombre (`op vault list` lo da).
- **2026-10-08 · al conectar por SSH sale una ventana de «Git for Windows» que
  pide algo, y la conexión se queda colgada.** Causa: la `ssh` que trae Git Bash
  no habla con el agente de 1Password (que escucha en la tubería de Windows).
  Arreglo: usar siempre `C:\Windows\System32\OpenSSH\ssh.exe` (en PowerShell,
  `ssh` ya es esa). Una llave propia con `IdentityFile` e `IdentitiesOnly` en
  `~/.ssh/config` no se ve afectada.
- **2026-10-08 · cada comando tardaba ~10 s y el build cayó con «authorization
  timeout».** Causa: sin service account, `op` pasa por la app de escritorio,
  que pide aprobar en cada proceso nuevo, y cada comando de una sesión es un
  proceso nuevo. Arreglo: service account de solo lectura con el token en el
  llavero. Ahora 16 claves tardan unos 9 s y no piden nada.
- **2026-10-08 · «connecting to desktop app timed out».** Causa: la app de
  1Password estaba cerrada o bloqueada mientras se creaba la service account.
  Arreglo: abrirla y desbloquearla. La creación sí necesita la app, porque la
  service account no puede crear nada.
- **2026-10-08 · `op` no se encontraba tras instalarlo.** Causa: el PATH nuevo
  solo llega a los terminales abiertos después de instalar. Arreglo: reiniciar
  el terminal.

## Qué requiere el OK de Pablo

- Crear, rotar, editar o borrar una clave, una ficha, una bóveda o una service
  account.
- Cambiar los permisos de una bóveda o invitar a alguien.
- Leer la clave privada de unas copias cifradas o hacer una segunda copia de ella.
- Guardar o mover códigos de recuperación del 2FA: los pega él, nunca pasan por
  la conversación.
- Leer con la service account no lo requiere.
- El token nunca va a un fichero ni a una variable de entorno permanente
  (`setx`), y ninguna sesión escribe en la bóveda personal de la persona.

## Coste y límites

Un plan de pago o de prueba según la cuenta: hay que decidir antes de que
acabe si se paga. Las service accounts tienen su propio límite de peticiones
por hora, y se puede agotar con varias sesiones leyendo a la vez. Una service
account solo lee las bóvedas que se le dieron al crearla: para dar otra hay que
crear una nueva.

## Fuentes y comprobación

- https://developer.1password.com/docs/cli/
- https://developer.1password.com/docs/cli/secret-reference-syntax/
- https://developer.1password.com/docs/service-accounts/
- https://developer.1password.com/docs/ssh/agent/

Comprobado el 2026-10-11: lectura con una service account, creación y lectura de una ficha en una bóveda aparte y agente SSH con una conexión real; el plan B entre bóvedas contra 1Password de verdad y que la cuenta de las sesiones ve solo su bóveda (qué bóvedas y cuentas, en la ficha del proyecto). Sin probar: caducidad del token ni el límite exacto de peticiones.
