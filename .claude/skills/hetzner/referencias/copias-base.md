# Hetzner · copias de la base de MenuPlan

Capa de la skill `hetzner` (`.claude/skills/hetzner/SKILL.md`): se abre para instalar, ensayar o rotar la clave de la copia nocturna cifrada (#247). Qué es, dónde vive y las operaciones del día a día están en la skill. Aquí, `ssh` es `C:\Windows\System32\OpenSSH\ssh.exe root@100.73.252.32` (en PowerShell, `ssh` ya es esa).

## Copias de la base: instalar (OK; lo lanza Pablo con `!`)

Antes: la clave creada (`node scripts/copias-clave.mjs --si`, skill `1password`)
y la pública commiteada; la 0095 aplicada (`--pablo`) y la contraseña de
`copia_lectura` puesta (`node scripts/clave-copia-lectura.mjs --si`). `SSH` es la ruta de esa `ssh.exe`, entre comillas dobles; `R`,
la carpeta del repo con la rama de las copias. Cada paso, una llamada.

1. **Requisito:** `node scripts/copias-clave.mjs --comprobar` → `COINCIDEN`.
   Si no, no se sube nada: las copias se cifrarían para otra clave.
2. `"$SSH" root@100.73.252.32 'apt-get install -y age && age --version && install -d -m 700 /etc/menuplan-copia /var/backups/menuplan'` → `v1.x`.
3. Ficheros: `"$SSH" root@100.73.252.32 'cat > /usr/local/sbin/menuplan-copia' < "$R/ops/copias/copia-base.sh"`,
   y así `destinatarios.txt` (a `/etc/menuplan-copia/`) y las dos unidades (a
   `/etc/systemd/system/`). Luego `"$SSH" root@100.73.252.32 'chmod 700 /usr/local/sbin/menuplan-copia && sed -i "s/\r$//" /usr/local/sbin/menuplan-copia /etc/menuplan-copia/destinatarios.txt /etc/systemd/system/menuplan-copia.* && bash -n /usr/local/sbin/menuplan-copia && systemctl daemon-reload'` → sin salida.
4. La URL, por tubería y sin verla (`>`: crea el fichero):
   `op read "op://c64ol4a3oewjeue3szoafrrr6q/Supabase copia/SUPABASE_DB_URL_COPIA" | "$SSH" root@100.73.252.32 'umask 077; v=$(tr -d "\r\n"); printf "COPIA_DB_URL=%s\n" "$v" > /etc/menuplan-copia/copia.env; wc -c < /etc/menuplan-copia/copia.env'`
   → más de 60; 14 es que llegó vacía. `op` a pelo: la service account no ve `Panel HoMenu`. La contraseña no sale en ningún `ps`:
   el script la pasa a un passfile en `/run/menuplan-copia` (tmpfs; systemd lo borra al parar), montado `:ro` en el
   contenedor (`PGPASSFILE`), y usa la URL sin ella.
5. Primera copia (fila «Copia de la base ahora») → `resultado: ok`,
   `secuencias: con-valor`, `auth: si`, `aviso: sin-canal` (u `ok` con Healthchecks). Baja la imagen la
   primera vez (~150 MB).
6. Solo con el 5 en `ok`: `"$SSH" root@100.73.252.32 'systemctl enable --now menuplan-copia.timer'`.
7. El ensayo (abajo) con esa copia.

- **Healthchecks** (si se decide en #273): check diario, gracia 2 h. Antes, la URL
  de ping a la ficha `Healthchecks` de `HoMenu`, campo `COPIA_AVISO_URL` (OK;
  skill `1password`), nunca tecleada en un comando. Se **añade** con `>>`:
  `node scripts/op.mjs read "op://HoMenu/Healthchecks/COPIA_AVISO_URL" | "$SSH" root@100.73.252.32 'umask 077; v=$(tr -d "\r\n"); printf "COPIA_AVISO_URL=%s\n" "$v" >> /etc/menuplan-copia/copia.env; grep -c ^COPIA_ /etc/menuplan-copia/copia.env'`
  → `2` (`>` borraría `COPIA_DB_URL`). Luego `aviso: ok`; un fallo llega con `/fail`.
- **Tras una purga legítima** (la copia baja a menos de la mitad y para por
  `incompleta`): `"$SSH" root@100.73.252.32 'systemd-run --wait -p EnvironmentFile=/etc/menuplan-copia/copia.env /usr/local/sbin/menuplan-copia --aceptar-tamano'`
  → `resultado: ok`; esa pasa a ser la referencia. Solo si se sabe por qué bajó.
- **Actualizar la imagen** (fijada por digest en `copia-base.sh`; cada mes, con
  el ensayo): el digest nuevo de `postgres:17` en el registro, cambiarlo en el
  script por PR, instalar (paso 3) y ensayar.
- **Si systemd la corta** (30 min) o llega TERM/INT: línea `resultado: fallo`
  con el paso, `/fail` y fuera los contenedores con la etiqueta
  `menuplan-copia=<pid>`.

## Copias de la base: ensayo de restauración

- **Cadencia: el primer lunes de cada mes**, y tras cambiar `copia-base.sh`, el
  usuario de la copia o la versión de Postgres de Supabase.
- Lo lanza Pablo con `!` en una carpeta de tarea: añade su línea a
  `ops/copias/ensayos.log`, por PR (repo público: solo `recuento` y cociente,
  #273). Pide aprobar 3 veces: SSH, clave privada y URL de `copia_lectura`.
- Necesita `age` (`winget install FiloSottile.age`) y Postgres 17 (zip
  «PostgreSQL binaries» de EnterpriseDB en `C:\dev\herramientas\pgsql`, o
  `--pg-bin`). El 9 oct 2026 no estaba ninguno.
- Qué hace: baja la última diaria, comprueba que cada `.age` se descifra entero
  (sin guardarlo), y restaura por tubería (`age -d | pg_restore`, una pasada por
  sección) en un Postgres desechable en `127.0.0.1`, con los CSV de `copia` en
  un `auth` de mentira (`huerfanos: 0`); y compara con producción (`copia_lectura`).
- **Mientras dura, el datadir del Postgres desechable tiene la base en claro**
  (en `%TEMP%\menuplan-ensayo-*`). Al acabar, al fallar y con Ctrl+C, Ctrl+Break
  o cerrando la ventana, se para (`-m immediate`) y se borra; si dice «OJO: no
  pude borrar», se borra a mano. El siguiente ensayo borra los restos al empezar.
- `motivo: recuento` o `tablas-distintas`: la copia no sirve; se abre un caso.

## Copias de la base: rotar la clave (OK)

Sin script: `copias-clave.mjs` se niega si la ficha existe. Otra ficha con otro
nombre, las dos públicas en `destinatarios.txt` 28 días (la semanal más vieja) y
luego fuera la vieja. Es un encargo de `gobierno`.
