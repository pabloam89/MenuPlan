/**
 * Las copias de la base de producción (encargo #247): vocabulario cerrado, la
 * línea estructurada que deja cada copia y cada ensayo, y las piezas puras del
 * ensayo de restauración (qué claves ajenas apuntan a auth.users y si lo
 * restaurado cuadra con producción).
 *
 * La copia la hace `ops/copias/copia-base.sh` en el servidor; el ensayo,
 * `scripts/copias-ensayo.mjs` en el PC de Pablo. Un test
 * (`scripts/copias.test.js`) cruza los pasos del script de bash con
 * MOTIVOS_COPIA: si alguien añade un paso allí, falla hasta que se añade aquí.
 */

/** Cómo acabó una copia o un ensayo. */
export const RESULTADOS = ["ok", "fallo"];

/** En qué paso de `copia-base.sh` falló una copia (el `motivo:` de su línea). */
export const MOTIVOS_COPIA = ["config", "conexion", "dump", "cifrado", "auth", "incompleta", "retencion"];

/** Si la copia lleva el valor de las secuencias (sin él, hay que hacer setval al restaurar). */
export const SECUENCIAS = ["con-valor", "sin-valor"];

/** Si salió el aviso a Healthchecks. */
export const AVISOS = ["ok", "fallo", "sin-canal"];

/** En qué paso falló un ensayo de restauración. */
export const MOTIVOS_ENSAYO = [
  "herramientas", // faltan pg_restore, initdb… o age, o no son de la versión 17
  "descarga", // no se pudo traer la copia del servidor
  "clave", // no se pudo leer la clave privada de 1Password
  "descifrado", // age no la descifra (clave equivocada o fichero roto)
  "postgres", // no arranca el Postgres desechable
  "restauracion", // pg_restore falla
  "produccion", // no se pudo leer producción para comparar
  "tablas-distintas", // la copia y producción no tienen las mismas tablas
  "columnas-copia", // las vistas de `copia` en producción no tienen las columnas de RELACIONES_COPIA
  "recuento", // las filas no cuadran (ver `veredicto`)
];

/**
 * Dónde vive la clave privada: bóveda «Panel HoMenu» (por su id: con el nombre,
 * el espacio rompe `op`; skill 1password). No en HoMenu a propósito: la service
 * account del PC lee toda HoMenu sin preguntar, y esta clave abre todas las
 * copias; aquí cada lectura pide aprobarla en la app de 1Password.
 */
export const BOVEDA_COPIAS = "c64ol4a3oewjeue3szoafrrr6q";
export const FICHA_COPIAS = "Copias de la base";
export const CAMPO_CLAVE = "clave_privada_age";
export const OP_CLAVE_COPIAS = `op://${BOVEDA_COPIAS}/${FICHA_COPIAS}/${CAMPO_CLAVE}`;

/**
 * Las vistas del esquema `copia` (migración del rol copia_lectura): de qué tabla de `auth` sale
 * cada una y sus columnas con su tipo, en el orden de la vista. Sin
 * contraseñas, tokens ni metadatos. Las usan `copia-base.sh` (exige las dos:
 * sin ellas, una copia restaurada en un proyecto nuevo deja las casas sin
 * dueño) y el ensayo (que crea esas columnas en su `auth` de mentira y carga
 * los CSV). `supabase/rolLectura.test.js` cruza esta lista con la de esa migración.
 */
export const RELACIONES_COPIA = {
  auth_usuarios: {
    origen: "auth.users",
    columnas: [["id", "uuid"], ["email", "text"], ["phone", "text"], ["email_confirmed_at", "timestamptz"], ["phone_confirmed_at", "timestamptz"], ["is_anonymous", "boolean"], ["created_at", "timestamptz"]],
  },
  auth_identidades: {
    origen: "auth.identities",
    columnas: [["id", "uuid"], ["user_id", "uuid"], ["provider", "text"], ["provider_id", "text"], ["created_at", "timestamptz"]],
  },
};

/**
 * Tablas de códigos efímeros que no hacen falta para restaurar: la migración del
 * rol copia_lectura le quita el `select` sobre ellas, `copia-base.sh` las deja
 * fuera del volcado (`--exclude-table`, porque pg_dump bloquea toda tabla cuya
 * definición vuelca y eso pide `select`) y el ensayo no las cuenta. Al
 * restaurar se recrean vacías con sus migraciones. Un test cruza esta lista con
 * el script y con la migración.
 */
export const TABLAS_SIN_COPIA = ["public.bot_link_tokens", "public.household_invites"];

/** El `data_type` de information_schema.columns de cada tipo de RELACIONES_COPIA. */
const DATA_TYPE = { uuid: "uuid", text: "text", timestamptz: "timestamp with time zone", boolean: "boolean", jsonb: "jsonb" };

/**
 * Lo que no cuadra entre RELACIONES_COPIA y las columnas reales de las vistas de
 * `copia` en producción (filas de information_schema.columns con table_name,
 * column_name, data_type y ordinal_position). Vacío = cuadra.
 * @param {{ table_name: string, column_name: string, data_type: string, ordinal_position: number }[]} filas
 */
export function columnasCopiaQueNoCuadran(filas) {
  const fallos = [];
  for (const [rel, { columnas }] of Object.entries(RELACIONES_COPIA)) {
    const reales = filas.filter((f) => f.table_name === rel).sort((a, b) => a.ordinal_position - b.ordinal_position);
    const esperadas = columnas.map(([c, t]) => `${c} ${DATA_TYPE[t] ?? t}`);
    const vistas = reales.map((f) => `${f.column_name} ${f.data_type}`);
    if (esperadas.join(", ") !== vistas.join(", ")) fallos.push(`copia.${rel}: espero (${esperadas.join(", ")}) y hay (${vistas.join(", ") || "nada"})`);
  }
  return fallos;
}

/**
 * El `auth` de mentira del ensayo: `auth.users` con las columnas del esquema
 * `copia` más las que nombran las funciones del volcado (los metadatos, que la
 * copia no lleva), y `auth.identities` con las suyas. Sin claves ajenas entre
 * ellas: la copia saca cada vista en un momento distinto, y una identidad de un
 * usuario creado entre medias no es un fallo de la copia.
 */
export function sqlAuthDeMentira() {
  const tabla = (nombre, columnas) =>
    `create table ${nombre} (${columnas.map(([c, t]) => `${c} ${t}${c === "id" ? " primary key" : ""}`).join(", ")});`;
  const { auth_usuarios: u, auth_identidades: i } = RELACIONES_COPIA;
  return [
    tabla(u.origen, [...u.columnas, ["raw_user_meta_data", "jsonb"], ["raw_app_meta_data", "jsonb"]]),
    tabla(i.origen, i.columnas),
  ].join("\n");
}

/**
 * Cuántos ids distintos de las claves ajenas a auth.users no están en el
 * auth.users restaurado: con la copia de `auth` cargada, los usuarios que se
 * quedarían sin fila (casas sin dueño) si se restaurase de verdad. Una consulta
 * que devuelve una fila con `n`.
 * @param {{ tabla: string, columna: string }[]} fks  lo que da clavesAjenasAAuth
 */
export function sqlHuerfanos(fks) {
  if (!fks.length) return "select 0 as n";
  const ids = fks.map((f) => `select ${f.columna} as id from ${f.tabla} where ${f.columna} is not null`).join("\n  union\n  ");
  return `select count(*) as n from (\n  ${ids}\n) x where not exists (select 1 from auth.users u where u.id = x.id)`;
}

/**
 * ops/copias/ensayos.log está en un repo PÚBLICO. true: solo `recuento:
 * ok|fallo` y el cociente copia/producción, sin el número de tablas ni de filas
 * (que sería una serie pública del crecimiento de la base). Lo decidió Pablo el
 * 9 oct 2026 en #273; volver a false es cosa suya.
 */
export const REGISTRO_SOLO_COCIENTE = true;

/** Dónde están las copias en el servidor del panel. */
export const SERVIDOR = "root@100.73.252.32";
export const DIR_SERVIDOR = "/var/backups/menuplan";

/** Una clave pública age (bech32, 62 caracteres) y una privada. */
export const CLAVE_PUBLICA = /^age1[0-9a-z]{58}$/;
export const CLAVE_PRIVADA = /^AGE-SECRET-KEY-1[0-9A-Z]{58}$/;

/**
 * Pone cada secuencia con dueño al máximo de su columna. Hace falta tras
 * restaurar una copia `secuencias: sin-valor` (el usuario de solo lectura no
 * puede leer su valor): si no, el siguiente insert chocaría con un id que ya
 * existe. Es la misma consulta que se usa en una restauración de verdad.
 */
export const SQL_SECUENCIAS = `
do $$
declare r record; v bigint;
begin
  for r in
    select s.oid::regclass as seq, t.oid::regclass as tabla, a.attname as col
      from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     where s.relkind = 'S'
  loop
    execute format('select max(%I) from %s', r.col, r.tabla) into v;
    perform setval(r.seq, coalesce(v, 1), v is not null);
  end loop;
end $$;`;

/** Nombre de cada copia: su sello UTC, `2026-10-10T024312Z`. */
export const NOMBRE_COPIA = /^\d{4}-\d{2}-\d{2}T\d{6}Z$/;

/** La fecha de una copia a partir de su nombre, o null. */
export function fechaDeCopia(nombre) {
  if (!NOMBRE_COPIA.test(nombre)) return null;
  const iso = `${nombre.slice(0, 10)}T${nombre.slice(11, 13)}:${nombre.slice(13, 15)}:${nombre.slice(15, 17)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Una línea estructurada: `<tipo> campo: valor campo: valor…`. Los valores no
 * llevan espacios (se cambian por guiones bajos) para que se lean con una
 * expresión regular, igual que las del script de bash.
 */
export function lineaEstructurada(tipo, campos) {
  const partes = Object.entries(campos).map(([k, v]) => `${k}: ${String(v ?? "-").replace(/\s+/g, "_") || "-"}`);
  return `${tipo} ${partes.join(" ")}`;
}

/** { tipo, campos } de una línea, o null si no lo es. */
export function leerLinea(linea) {
  const m = /^(copia-base|ensayo-copia) (.*)$/.exec(String(linea).trim());
  if (!m) return null;
  const campos = {};
  for (const [, k, v] of m[2].matchAll(/(\w+): (\S+)/g)) campos[k] = v;
  return { tipo: m[1], campos };
}

/**
 * Las claves ajenas de un volcado (SQL de `pg_restore --section=post-data`)
 * que apuntan a auth.users: `[{ tabla, columna, nombre }]`. El ensayo las usa
 * para llenar el auth.users de mentira con los ids que hacen falta, y así las
 * demás claves ajenas se comprueban de verdad al restaurar. Solo admite claves
 * de una columna: si aparece una compuesta, lanza error (no se adivina).
 */
export function clavesAjenasAAuth(sql) {
  const re = /ALTER TABLE ONLY ([\w."]+)\s+ADD CONSTRAINT ([\w"]+) FOREIGN KEY \(([^)]*)\) REFERENCES auth\.users\(([^)]*)\)/g;
  const salida = [];
  for (const [, tabla, nombre, cols, refs] of sql.matchAll(re)) {
    const columnas = cols.split(",").map((c) => c.trim());
    if (columnas.length !== 1 || refs.trim() !== "id") {
      throw new Error(`Clave ajena a auth.users que no es de una columna a id: ${nombre} (${cols}) -> (${refs})`);
    }
    salida.push({ tabla, columna: columnas[0], nombre });
  }
  return salida;
}

/**
 * ¿Cuadra lo restaurado con producción? Las dos entradas son { tabla: filas }.
 * La copia es de hasta un día antes, así que no se exige igualdad:
 *   - las tablas tienen que ser las mismas (si no, `tablas-distintas`);
 *   - una tabla con 10 filas o más en producción no puede llegar vacía, y el
 *     total restaurado no puede bajar del 90 % del de producción (`recuento`).
 * Devuelve { resultado, motivo, diferencias: [{ tabla, copia, prod }], filasCopia, filasProd }.
 */
export function veredicto(copia, prod) {
  const tc = Object.keys(copia).sort();
  const tp = Object.keys(prod).sort();
  const faltan = tp.filter((t) => !(t in copia));
  const sobran = tc.filter((t) => !(t in prod));
  const filasCopia = tc.reduce((s, t) => s + copia[t], 0);
  const filasProd = tp.reduce((s, t) => s + prod[t], 0);
  const diferencias = tp.filter((t) => t in copia && copia[t] !== prod[t]).map((t) => ({ tabla: t, copia: copia[t], prod: prod[t] }));
  const base = { diferencias, filasCopia, filasProd, faltan, sobran };
  if (faltan.length || sobran.length) return { resultado: "fallo", motivo: "tablas-distintas", ...base };
  const vacias = tp.filter((t) => prod[t] >= 10 && copia[t] === 0);
  if (vacias.length || filasCopia < 0.9 * filasProd) return { resultado: "fallo", motivo: "recuento", vacias, ...base };
  return { resultado: "ok", motivo: "-", ...base };
}

/**
 * ¿`destinatarios.txt` es justo la pública de la ficha de 1Password? Antes de
 * subirlo al servidor (skill hetzner): si alguien cambiara el fichero del repo
 * por su propia clave, las copias se cifrarían para él. Devuelve
 * { coincide, claves, sobran, falta } (claves = las públicas del fichero).
 */
export function comprobarDestinatarios(texto, publicaFicha) {
  const claves = String(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const publica = String(publicaFicha ?? "").trim();
  const sobran = claves.filter((c) => c !== publica);
  const falta = !CLAVE_PUBLICA.test(publica) || !claves.includes(publica);
  return { coincide: !falta && sobran.length === 0, claves, sobran, falta };
}

/**
 * Los campos de la línea del ensayo que van a `ops/copias/ensayos.log`, que está
 * en un repo PÚBLICO. Sin `soloCociente`, tal cual (con el total de filas). Con
 * él (lo que se usa desde #273: REGISTRO_SOLO_COCIENTE), quita tablas y filas y
 * deja `recuento: ok|fallo` y el cociente copia/producción con dos decimales.
 * Lo que sale por pantalla no cambia.
 */
export function camposRegistroEnsayo(campos, { soloCociente = false } = {}) {
  if (!soloCociente) return { ...campos };
  const { tablas, filas_copia: fc, filas_prod: fp, diferencias, ...resto } = campos;
  const cociente = Number(fp) > 0 && Number.isFinite(Number(fc)) ? (Number(fc) / Number(fp)).toFixed(2) : "-";
  return { ...resto, recuento: campos.resultado === "ok" ? "ok" : "fallo", cociente };
}

/** La línea que el ensayo añade a `ops/copias/ensayos.log`, con lo que manda REGISTRO_SOLO_COCIENTE. */
export const lineaRegistroEnsayo = (campos) =>
  lineaEstructurada("ensayo-copia", camposRegistroEnsayo(campos, { soloCociente: REGISTRO_SOLO_COCIENTE }));
