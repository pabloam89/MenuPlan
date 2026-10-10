/**
 * Los usuarios de solo lectura de la base: su nombre, cómo se arma su
 * dirección y cómo se guarda su contraseña sin que viaje en claro.
 *
 *   - `consulta_lectura` (migración 0092, issue #233): `npm run consulta` desde
 *     el PC y las sesiones. Su dirección, en la bóveda HoMenu-sesiones (#328;
 *     la lee la service account de las sesiones sin preguntar).
 *   - `copia_lectura` (issue #273): las copias nocturnas del
 *     servidor (`ops/copias/copia-base.sh`) y el ensayo de restauración. Lee
 *     también los usuarios de `auth` (esquema `copia`), así que su dirección va
 *     a la bóveda «Panel HoMenu», donde cada lectura pide aprobar.
 *
 * Lo usan `scripts/consulta.mjs`, `scripts/copias-ensayo.mjs` y
 * `scripts/lib/claveRol.mjs` (que pone la contraseña de cada uno).
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { BOVEDA_COPIAS } from "./copias.mjs";
import { BOVEDA_SESIONES } from "./env.mjs";

export const ROL_LECTURA = "consulta_lectura";
export const VAR_LECTURA = "SUPABASE_DB_URL_LECTURA";
export const VAR_ADMIN = "SUPABASE_DB_URL";
/**
 * Dónde vive en 1Password: una ficha propia en HoMenu-sesiones (#328), porque se crea con la
 * plantilla JSON por stdin (`op item create -`), y `op item edit` solo admite
 * plantillas desde un fichero o valores como argumento.
 */
export const FICHA_LECTURA = "Supabase lectura";
export const OP_LECTURA = `op://${BOVEDA_SESIONES}/${FICHA_LECTURA}/${VAR_LECTURA}`;

export const ROL_COPIA = "copia_lectura";
export const VAR_COPIA = "SUPABASE_DB_URL_COPIA";
export const FICHA_COPIA = "Supabase copia";
/** Por el id de la bóveda «Panel HoMenu»: con el nombre, el espacio rompe `op` (skill 1password). */
export const OP_COPIA = `op://${BOVEDA_COPIAS}/${FICHA_COPIA}/${VAR_COPIA}`;

/**
 * Cada usuario de solo lectura, con lo que necesita `claveRol.mjs` para ponerle
 * la contraseña:
 *   - `boveda`: dónde va su ficha; `servicio`: si la service account del PC
 *     puede leerla (en «Panel HoMenu», no: se lee con la app, que pide aprobar);
 *   - `prueba`: una consulta que, tras poner la contraseña, tiene que poder hacer;
 *   - `despues`: qué hacer con la dirección nueva.
 */
export const PERFILES = {
  [ROL_LECTURA]: {
    rol: ROL_LECTURA, variable: VAR_LECTURA, ficha: FICHA_LECTURA, boveda: BOVEDA_SESIONES, servicio: true,
    migracion: "0092_rol_consulta_lectura", issue: 233, script: "scripts/clave-consulta-lectura.mjs",
    prueba: null,
    despues: `Añade (o descomenta) en tu .env.local: ${VAR_LECTURA}=${OP_LECTURA}`,
  },
  [ROL_COPIA]: {
    rol: ROL_COPIA, variable: VAR_COPIA, ficha: FICHA_COPIA, boveda: BOVEDA_COPIAS, servicio: false,
    migracion: "0095_rol_copia_lectura", issue: 273, script: "scripts/clave-copia-lectura.mjs",
    prueba: "select 1 from copia.auth_usuarios limit 1",
    despues: "Súbela al servidor por tubería, sin verla: skill hetzner, «Copias de la base: instalar», paso 4.",
  },
};

/**
 * Columnas con códigos que `consulta_lectura` no lee (la migración del rol
 * copia_lectura, #374 para el fondo): [tabla, columna]. En esas tablas tiene
 * `select` solo por columnas, así que `select *` falla y hay que nombrarlas.
 * Un test cruza esta lista con la migración.
 */
export const COLUMNAS_SIN_CONSULTA = [
  ["public.bot_link_tokens", "token"],
  ["public.household_invites", "token"],
  ["public.bot_codigos", "codigo"],
  ["public.households", "invite_token"],
  ["public.user_profiles", "pending_invite_token"],
  ["public.apple_auth_tokens", "refresh_token"],
];

/** La dirección op:// de la URL de un perfil. */
export const direccionOp = (p) => `op://${p.boveda}/${p.ficha}/${p.variable}`;

/**
 * Qué dice `op item get <ficha>`: "existe", "no-existe" o "error". Solo cuenta
 * como «no existe» el mensaje exacto de `op` (visto con op 2.40 el 9 oct 2026:
 * `"X" isn't an item in the "HoMenu" vault`). Cualquier otro fallo (sin `op`,
 * sin acceso, sin red) es "error": crear la ficha a ciegas podría duplicarla y
 * dejar la dirección op:// ambigua.
 * @param {{ status: number|null, stderr?: string, error?: Error }} r  lo que devuelve spawnSync
 */
export function estadoFicha(r) {
  if (r.error) return "error";
  if (r.status === 0) return "existe";
  return /isn't an item in the "[^"]+" vault/.test(String(r.stderr ?? "")) ? "no-existe" : "error";
}

/** La ficha de 1Password de un perfil, en JSON para `op item create --vault <bóveda> -`. */
export const fichaDeRol = (p, clave, url) => JSON.stringify({
  title: p.ficha,
  category: "PASSWORD",
  notesPlain: `Rol ${p.rol} de Supabase (migración ${p.migracion.slice(0, 4)}, issue #${p.issue}). La pone y la rota ${p.script}.`,
  fields: [
    { id: "password", type: "CONCEALED", purpose: "PASSWORD", label: "password", value: clave },
    { id: p.variable, type: "CONCEALED", label: p.variable, value: url },
  ],
});

/** La de `consulta_lectura` (la firma de antes del rol de copias). */
export const fichaLectura = (clave, url) => fichaDeRol(PERFILES[ROL_LECTURA], clave, url);

/** Una contraseña larga, aleatoria y solo con caracteres seguros en una URL. */
export const claveNueva = () => randomBytes(32).toString("base64url");

/**
 * El verificador SCRAM-SHA-256 de una contraseña, en el formato de Postgres
 * (`SCRAM-SHA-256$<iter>:<sal>$<StoredKey>:<ServerKey>`). Con él, `alter role
 * … password` no lleva la contraseña: si el log de Postgres guarda la sentencia,
 * guarda el verificador, que no sirve para entrar.
 * Solo para contraseñas ASCII (las de `claveNueva`): sin SASLprep.
 */
export function verificadorScram(clave, sal = randomBytes(16), iter = 4096) {
  if (!/^[\x21-\x7e]+$/.test(clave)) throw new Error("La contraseña tiene que ser ASCII imprimible");
  const salada = pbkdf2Sync(clave, sal, iter, 32, "sha256");
  const clienteKey = createHmac("sha256", salada).update("Client Key").digest();
  const stored = createHash("sha256").update(clienteKey).digest();
  const servidor = createHmac("sha256", salada).update("Server Key").digest();
  return `SCRAM-SHA-256$${iter}:${sal.toString("base64")}$${stored.toString("base64")}:${servidor.toString("base64")}`;
}

/**
 * La dirección de un rol a partir de la del administrador: mismo servidor,
 * puerto y base. Por el pooler de Supabase (Supavisor) el usuario lleva el
 * proyecto detrás (`postgres.<ref>` → `<rol>.<ref>`); en conexión directa, el
 * nombre a secas.
 */
export function urlDeRol(urlAdmin, rol, clave) {
  const u = new URL(urlAdmin);
  const usuario = decodeURIComponent(u.username);
  const punto = usuario.indexOf(".");
  u.username = punto > 0 ? `${rol}${usuario.slice(punto)}` : rol;
  u.password = encodeURIComponent(clave);
  return u.toString();
}

/** La de `consulta_lectura`. */
export const urlLectura = (urlAdmin, clave) => urlDeRol(urlAdmin, ROL_LECTURA, clave);

/**
 * Con la dirección de un rol, la sesión tiene que ser de ese rol. Si no (p. ej.
 * SUPABASE_DB_URL_LECTURA apuntando por error a la de administrador), el motivo
 * para no seguir; null si cuadra o si no se esperaba ningún rol (`--admin`).
 */
export function motivoUsuarioIncorrecto(esperado, actual, variable = VAR_LECTURA) {
  if (!esperado || actual === esperado) return null;
  return `${variable} entra como «${actual}», no como «${esperado}». No sigo: corrige la dirección en 1Password.`;
}

/** El argumento con el que `npm run consulta` entra como administrador. */
export const ARG_ADMIN = "--admin";

/**
 * Qué dirección usa `npm run consulta`. A todo o nada (decisión de Pablo en
 * #238, 9 oct 2026):
 *   - sin `--admin`, la de lectura; si la variable no está, lanza con un
 *     mensaje claro. Nunca cae sola al administrador;
 *   - si está pero no se puede leer, lanza también: un fallo no cambia de
 *     usuario;
 *   - con `--admin` explícito, la del administrador (sin leer la de lectura),
 *     con un aviso.
 * @param {(clave: string) => string | undefined} leer
 * @param {{ admin?: boolean }} [opciones]
 * @returns {{ url: string, rol: string | null, aviso: string | null }}
 */
export function conexionDeConsulta(leer, { admin = false } = {}) {
  if (admin) {
    const url = leer(VAR_ADMIN);
    if (!url) throw new Error(`${ARG_ADMIN}: falta ${VAR_ADMIN} en .env.local (o en el entorno).`);
    return {
      url,
      rol: null,
      aviso: `Aviso: ${ARG_ADMIN}. Entro como administrador; solo me protegen el filtro de texto y la transacción read only (issue #233).`,
    };
  }
  let lectura;
  try {
    lectura = leer(VAR_LECTURA);
  } catch (e) {
    // Configurada pero ilegible (p. ej. una dirección op:// que no existe): se
    // para aquí. Caer al administrador dejaría a cualquiera forzar el cambio de
    // usuario con una dirección mala (juez de seguridad de la 0092).
    throw new Error(`${VAR_LECTURA} está configurada pero no la puedo leer (${e.message}). No cambio al administrador: arréglala o quítala.`);
  }
  if (!lectura) {
    throw new Error(
      `Falta ${VAR_LECTURA}: npm run consulta solo entra con el usuario de solo lectura (${ROL_LECTURA}). `
      + `Añade en tu .env.local ${VAR_LECTURA}=${OP_LECTURA} (plantilla: ops/env.1password). `
      + `Entrar como administrador es a propósito: ${ARG_ADMIN} (issue #238).`,
    );
  }
  return { url: lectura, aviso: null, rol: ROL_LECTURA };
}

/**
 * Separa `--admin` de lo demás en los argumentos de `consulta.mjs`. Solo cuenta
 * el argumento exacto: un `--admin` dentro del texto de la consulta no es el
 * argumento.
 * @param {string[]} argv  los argumentos, sin `node` ni el script
 */
export function argumentosDeConsulta(argv) {
  return { admin: argv.includes(ARG_ADMIN), sql: argv.filter((a) => a !== ARG_ADMIN).join(" ").trim() };
}
