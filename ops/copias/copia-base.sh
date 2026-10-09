#!/usr/bin/env bash
# Copia nocturna cifrada de la base de producción de MenuPlan (encargo #247).
#
# Corre en el servidor del panel (HoMenu-Panel, skill `hetzner`) con el
# temporizador `menuplan-copia.timer`. Hace un `pg_dump` de solo lectura de los
# esquemas `public` y `ops`, lo cifra al vuelo con `age` para la clave pública
# de `destinatarios.txt` y lo guarda en $COPIA_DIR. El servidor NO tiene la
# clave privada (vive solo en 1Password): no puede leer sus propias copias.
# El volcado en claro no toca nunca el disco: va de `pg_dump` a `age` por una
# tubería.
#
# Si existe el esquema `copia` (vistas de auth.users y auth.identities, pendiente
# de `datos`), cada relación legible de él sale además en CSV cifrado. Sin él,
# la copia sigue y lo dice (`auth: no`): el script no depende de la migración.
#
# Cada ejecución deja UNA línea estructurada en $COPIA_DIR/copias.log y en el
# journal, con vocabulario cerrado (scripts/lib/copias.mjs, que la cuenta):
#   copia-base fecha: … resultado: ok|fallo motivo: <paso>|- bytes: … segundos: …
#   tablas: … secuencias: con-valor|sin-valor auth: si|no semanal: si|no
#   diarias: … semanales: … aviso: ok|fallo|sin-canal
# Un fallo sale con código distinto de 0 (el servicio queda «failed») y avisa
# por $COPIA_AVISO_URL (Healthchecks: /fail). Ningún error se traga (#177).
#
# Retención: $COPIA_DIARIAS en diaria/ y $COPIA_SEMANALES en semanal/
# (enlaces duros a la diaria: no ocupan el doble). Solo se poda tras una copia
# buena, para que una racha de fallos no se coma el historial.
#
# Configuración: variables de entorno (systemd las carga de
# /etc/menuplan-copia/copia.env, permisos 600, NUNCA en el repo):
#   COPIA_DB_URL         obligatoria. Usuario de solo lectura (nunca postgres).
#                        Su contraseña no viaja en ningún argv (ni en el de
#                        docker ni en el de pg_dump o psql, que se ven en el
#                        `ps` del host): va a un passfile 600 del temporal,
#                        montado :ro en el contenedor (PGPASSFILE), y dentro se
#                        usa la misma URL sin contraseña.
#   COPIA_AVISO_URL      opcional. URL de ping de Healthchecks. Va a curl por
#                        stdin (-K -), no en su argv.
#   COPIA_DESTINATARIOS  /etc/menuplan-copia/destinatarios.txt
#   COPIA_DIR            /var/backups/menuplan
#   COPIA_DIARIAS        7
#   COPIA_SEMANALES      4
#   COPIA_IMAGEN         postgres:17 fijada por digest (cliente de la misma
#                        versión mayor que Supabase). Se sube a mano: skill
#                        hetzner, «Actualizar la imagen de las copias».
#   COPIA_DOCKER, COPIA_AGE, COPIA_CURL   los binarios (los tests los cambian)
#   COPIA_MIN_BYTES      100000: una copia más pequeña es «incompleta»
#
# Argumento opcional: --aceptar-tamano, para una ejecución a mano tras una
# purga legítima de datos. Se salta la comparación con la última copia buena
# (la «mitad»), no el mínimo absoluto. Cómo lanzarlo: skill hetzner.
#
# Si systemd la corta (TimeoutStartSec) o llega un INT/TERM, deja su línea de
# fallo con el paso en curso, avisa a /fail y quita los contenedores que
# lanzó (llevan la etiqueta menuplan-copia=<pid>).
#
# Probado con stubs en scripts/copias.test.js. Runbook: skill `hetzner`.

set -Eeuo pipefail
umask 077

COPIA_DIR=${COPIA_DIR:-/var/backups/menuplan}
COPIA_DESTINATARIOS=${COPIA_DESTINATARIOS:-/etc/menuplan-copia/destinatarios.txt}
COPIA_DIARIAS=${COPIA_DIARIAS:-7}
COPIA_SEMANALES=${COPIA_SEMANALES:-4}
# postgres:17 el 2026-10-09: digest del índice multiarquitectura, leído del registro.
COPIA_IMAGEN=${COPIA_IMAGEN:-postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3}
COPIA_DOCKER=${COPIA_DOCKER:-docker}
COPIA_AGE=${COPIA_AGE:-age}
COPIA_CURL=${COPIA_CURL:-curl}
COPIA_MIN_BYTES=${COPIA_MIN_BYTES:-100000}
REGISTRO="$COPIA_DIR/copias.log"
NOMBRE_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$'

INICIO=$(date -u +%s)
SELLO=$(date -u +%Y-%m-%dT%H%M%SZ)
PARCIAL="$COPIA_DIR/.parcial-$SELLO"
PASO=config
BYTES=0 TABLAS=0 SECUENCIAS=- AUTH=no SEMANAL=no DIARIAS=- SEMANALES=- AVISO=sin-canal
TMP=""

# El paso en curso es el `motivo` si algo falla. Vocabulario cerrado:
# MOTIVOS_COPIA en scripts/lib/copias.mjs (un test los cruza).
paso() { PASO=$1; }

linea() { # $1 resultado, $2 motivo
  printf 'copia-base fecha: %s resultado: %s motivo: %s bytes: %s segundos: %s tablas: %s secuencias: %s auth: %s semanal: %s diarias: %s semanales: %s aviso: %s\n' \
    "$SELLO" "$1" "$2" "$BYTES" "$(( $(date -u +%s) - INICIO ))" "$TABLAS" "$SECUENCIAS" "$AUTH" "$SEMANAL" "$DIARIAS" "$SEMANALES" "$AVISO"
}

avisar() { # $1 sufijo de Healthchecks ("" o "/fail"), $2 cuerpo
  if [ -z "${COPIA_AVISO_URL:-}" ]; then
    AVISO=sin-canal
    echo "AVISO: sin COPIA_AVISO_URL; nadie se entera si esto falla. Ver la skill hetzner." >&2
    return 0
  fi
  # La URL de ping, por stdin como configuración de curl: en el argv se vería en `ps`.
  if printf 'url = "%s%s"\n' "$COPIA_AVISO_URL" "$1" | "$COPIA_CURL" -fsS -m 15 --retry 3 -o /dev/null --data-raw "$2" -K -; then
    AVISO=ok
  else
    AVISO=fallo
    echo "ERROR: no pude avisar a Healthchecks (curl salió con error)." >&2
  fi
}

registrar() { # $1 línea: al journal y al registro
  echo "$1"
  if ! { mkdir -p "$COPIA_DIR" && echo "$1" >> "$REGISTRO"; }; then
    echo "ERROR: no pude escribir en $REGISTRO" >&2
  fi
}

fallar() {
  local codigo=$? motivo=$PASO
  trap - ERR TERM INT
  set +e
  rm -rf -- "$PARCIAL"
  [ -n "$TMP" ] && rm -rf -- "$TMP"
  echo "ERROR: la copia falló en el paso «$motivo» (código $codigo)." >&2
  avisar /fail "$(linea fallo "$motivo")"
  registrar "$(linea fallo "$motivo")"
  exit 1
}
trap fallar ERR

# Cortada por systemd (TimeoutStartSec manda TERM a todo el grupo) o a mano:
# fuera los contenedores de esta ejecución, y su línea de fallo con el paso.
cortar() {
  local ids
  echo "ERROR: me han cortado (señal) en el paso «$PASO»." >&2
  ids=$("$COPIA_DOCKER" ps -q --filter "label=menuplan-copia=$$" 2>/dev/null) || ids=""
  # shellcheck disable=SC2086
  [ -z "$ids" ] || "$COPIA_DOCKER" rm -f $ids >/dev/null 2>&1 || echo "ERROR: no pude quitar los contenedores $ids" >&2
  fallar
}
trap cortar TERM INT

# ── config ──────────────────────────────────────────────────────────────
paso config
ACEPTAR_TAMANO=no
case "${1:-}" in
  "") ;;
  --aceptar-tamano) ACEPTAR_TAMANO=si ;;
  *) echo "Argumento desconocido: $1 (solo vale --aceptar-tamano)" >&2; false ;;
esac
[ -n "${COPIA_DB_URL:-}" ] || { echo "Falta COPIA_DB_URL" >&2; false; }
grep -qE '^age1[0-9a-z]{58}$' "$COPIA_DESTINATARIOS" || { echo "Sin clave pública age en $COPIA_DESTINATARIOS" >&2; false; }
# Sin `grep -q` al final de la tubería: cortaría la lectura y, con pipefail,
# una línea mala pasaría por buena.
RARAS=$(grep -vE '^(#|$)' "$COPIA_DESTINATARIOS" | grep -vcE '^age1[0-9a-z]{58}$' || true)
[ "$RARAS" = 0 ] || { echo "Hay $RARAS líneas que no son claves age en $COPIA_DESTINATARIOS" >&2; false; }
command -v "$COPIA_DOCKER" >/dev/null || { echo "No encuentro $COPIA_DOCKER" >&2; false; }
command -v "$COPIA_AGE" >/dev/null || { echo "No encuentro $COPIA_AGE" >&2; false; }
mkdir -p "$COPIA_DIR/diaria" "$COPIA_DIR/semanal"
TMP=$(mktemp -d)

# La contraseña sale de la URL a un passfile (600, en el temporal, que se borra
# siempre) y la URL se queda sin ella: dentro del contenedor, pg_dump y psql la
# llevan en su argv, que se ve en el `ps` del host. Se decodifica (%xx) y se
# escapa para el passfile (\ y :).
URL_RE='^(postgres(ql)?://)([^:@/]+):([^@]+)@(.+)$'
[[ "$COPIA_DB_URL" =~ $URL_RE ]] || {
  echo "COPIA_DB_URL no tiene la forma postgresql://usuario:contraseña@servidor/base" >&2; false; }
PGURL="${BASH_REMATCH[1]}${BASH_REMATCH[3]}@${BASH_REMATCH[5]}"
clave=${BASH_REMATCH[4]}
clave=${clave//\\/\\\\}
clave=$(printf '%b' "${clave//%/\\x}")
clave=${clave//\\/\\\\}
clave=${clave//:/\\:}
printf '*:*:*:*:%s\n' "$clave" > "$TMP/pgpass"
unset clave COPIA_DB_URL
[[ x =~ x ]] # pisa BASH_REMATCH, que tenía la contraseña
PASSFILE_DENTRO=/run/menuplan-copia/pgpass
export PGURL PGSSLMODE=require

# Los clientes de Postgres van en un contenedor de la misma versión mayor que
# Supabase (17): el formato custom de un pg_dump más nuevo no lo lee un
# pg_restore más viejo. Al contenedor solo entran la URL sin contraseña (por el
# entorno, -e NOMBRE) y el passfile, de solo lectura. La etiqueta es para
# `cortar`.
pg() {
  "$COPIA_DOCKER" run --rm -i --label "menuplan-copia=$$" \
    -e PGURL -e PGSSLMODE -e "PGPASSFILE=$PASSFILE_DENTRO" \
    -v "$TMP/pgpass:$PASSFILE_DENTRO:ro" "$COPIA_IMAGEN" "$@"
}

# ── conexion: quién soy y qué hay ───────────────────────────────────────
paso conexion
# Una sola consulta de catálogo, por la entrada estándar; solo lee.
pg sh -c 'exec psql "$PGURL" -X -A -t -q -F "	" -v ON_ERROR_STOP=1' > "$TMP/estado.tsv" <<'SQL'
begin read only;
select 'usuario', current_user
union all
select 'escribe', count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'ops') and c.relkind in ('r', 'p')
   and has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
union all
select 'tablas', count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'ops') and c.relkind in ('r', 'p')
union all
select 'secuencia', n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'ops') and c.relkind = 'S'
   and not has_sequence_privilege(c.oid, 'SELECT')
union all
select 'copia', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'copia' and c.relkind in ('r', 'v', 'm')
   and has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT');
rollback;
SQL

USUARIO=$(awk -F'\t' '$1=="usuario"{print $2}' "$TMP/estado.tsv")
ESCRIBE=$(awk -F'\t' '$1=="escribe"{print $2}' "$TMP/estado.tsv")
TABLAS=$(awk -F'\t' '$1=="tablas"{print $2}' "$TMP/estado.tsv")
[ -n "$USUARIO" ] && [ -n "$TABLAS" ] || { echo "La comprobación previa no devolvió nada" >&2; false; }

# La credencial del servidor tiene que ser de solo lectura: si alguien pega la
# de administrador, se para aquí (motivo config), antes de volcar nada.
paso config
if [ "$USUARIO" = postgres ] || [ "$USUARIO" = supabase_admin ] || [ "${ESCRIBE:-0}" != 0 ]; then
  echo "COPIA_DB_URL entra como «$USUARIO» y puede escribir en ${ESCRIBE:-?} tablas: aquí solo vale un usuario de solo lectura." >&2
  false
fi

# Secuencias que el usuario no puede leer: se vuelca su definición pero no su
# valor (plan B con consulta_lectura). Tras restaurar hay que ponerlas al día
# con setval (lo hace el ensayo y lo dice el runbook).
EXCLUIR=()
while IFS= read -r s; do
  [ -n "$s" ] && EXCLUIR+=("--exclude-table-data=$s")
done < <(awk -F'\t' '$1=="secuencia"{print $2}' "$TMP/estado.tsv")
if [ "${#EXCLUIR[@]}" -gt 0 ]; then SECUENCIAS=sin-valor; else SECUENCIAS=con-valor; fi

# ── dump + cifrado, por tubería ─────────────────────────────────────────
mkdir "$PARCIAL"
paso dump
# pipefail: si pg_dump falla, la tubería falla aunque age haya escrito un
# fichero válido (age cifra también una entrada vacía; visto en el ensayo).
pg sh -c 'exec pg_dump --dbname="$PGURL" "$@"' pg_dump -Fc -Z 6 -n public -n ops \
    --no-publications --no-subscriptions "${EXCLUIR[@]}" \
  | "$COPIA_AGE" -R "$COPIA_DESTINATARIOS" -o "$PARCIAL/base.dump.age"

paso cifrado
[ "$(head -c 21 "$PARCIAL/base.dump.age")" = "age-encryption.org/v1" ] || { echo "base.dump.age no tiene la cabecera de age" >&2; false; }

# ── auth (si existe el esquema copia) ───────────────────────────────────
paso auth
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  [[ "$rel" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Nombre raro en el esquema copia: $rel" >&2; false; }
  # </dev/null: `docker run -i` se comería el resto de la lista del bucle, y
  # solo saldría la primera relación (lo cazó el revisor el 9 oct).
  pg sh -c "exec psql \"\$PGURL\" -X -q -v ON_ERROR_STOP=1 -c '\\copy (select * from copia.$rel) to stdout with (format csv, header)'" </dev/null \
    | "$COPIA_AGE" -R "$COPIA_DESTINATARIOS" -o "$PARCIAL/copia.$rel.csv.age"
  AUTH=si
done < <(awk -F'\t' '$1=="copia"{print $2}' "$TMP/estado.tsv")

# ── incompleta: ni vacía ni de golpe la mitad que la última buena ────────
paso incompleta
BYTES=$(du -sb "$PARCIAL" | cut -f1)
[ "$BYTES" -ge "$COPIA_MIN_BYTES" ] || { echo "La copia pesa $BYTES bytes (mínimo $COPIA_MIN_BYTES)" >&2; false; }
ANTERIOR=$( (grep 'resultado: ok ' "$REGISTRO" 2>/dev/null || true) | tail -n 1 | sed -nE 's/.* bytes: ([0-9]+) .*/\1/p')
if [ "$ACEPTAR_TAMANO" = si ]; then
  echo "AVISO: --aceptar-tamano: no comparo con la última buena (${ANTERIOR:-ninguna}); esta pasa a ser la referencia." >&2
elif [ -n "$ANTERIOR" ] && [ "$(( BYTES * 2 ))" -lt "$ANTERIOR" ]; then
  echo "La copia pesa $BYTES bytes, menos de la mitad que la última buena ($ANTERIOR)" >&2
  false
fi

# ── retencion ───────────────────────────────────────────────────────────
paso retencion
mv -- "$PARCIAL" "$COPIA_DIR/diaria/$SELLO"

# Semanal: si no hay ninguna o la última tiene ya 7 días (menos una hora de
# holgura por el retraso aleatorio del temporizador). Así no depende de que el
# domingo concreto saliera bien.
ULTIMA_SEMANAL=$(ls -1 "$COPIA_DIR/semanal" | grep -E "$NOMBRE_RE" | sort | tail -n 1 || true)
if [ -z "$ULTIMA_SEMANAL" ]; then
  SEMANAL=si
else
  f=$ULTIMA_SEMANAL
  epoca=$(date -u -d "${f:0:10} ${f:11:2}:${f:13:2}:${f:15:2}" +%s)
  [ "$(( $(date -u +%s) - epoca ))" -ge $(( 7 * 86400 - 3600 )) ] && SEMANAL=si
fi
[ "$SEMANAL" = si ] && cp -al -- "$COPIA_DIR/diaria/$SELLO" "$COPIA_DIR/semanal/$SELLO"

podar() { # $1 carpeta, $2 cuántas quedan. Solo toca nombres con el formato de copia.
  local viejos=() viejo
  # `|| true` dentro: con set -E la trampa ERR también corre en la sustitución,
  # y un grep sin coincidencias registraría un fallo falso.
  mapfile -t viejos < <(ls -1 "$1" | grep -E "$NOMBRE_RE" | sort -r | tail -n +"$(( $2 + 1 ))" || true)
  for viejo in "${viejos[@]}"; do
    [ -n "$viejo" ] && rm -rf -- "${1:?}/$viejo"
  done
  return 0
}
podar "$COPIA_DIR/diaria" "$COPIA_DIARIAS"
podar "$COPIA_DIR/semanal" "$COPIA_SEMANALES"
DIARIAS=$(ls -1 "$COPIA_DIR/diaria" | grep -cE "$NOMBRE_RE" || true)
SEMANALES=$(ls -1 "$COPIA_DIR/semanal" | grep -cE "$NOMBRE_RE" || true)
# Restos de ejecuciones cortadas a mitad (kill, apagado): no son copias.
find "$COPIA_DIR" -maxdepth 1 -name '.parcial-*' -mmin +120 -exec rm -rf -- {} +

rm -rf -- "$TMP"
# Desde aquí la copia ya está guardada: una señal no la convierte en fallo.
trap - ERR TERM INT

# ── aviso y registro ────────────────────────────────────────────────────
avisar "" "$(linea ok -)"
registrar "$(linea ok -)"
# Si la copia está bien pero el aviso no salió, el servicio queda en rojo igual:
# Healthchecks dará la alarma por falta de ping, y `systemctl --failed` lo enseña.
[ "$AVISO" != fallo ] || exit 3
