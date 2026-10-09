/**
 * El usuario de solo lectura de la base (`consulta_lectura`, migración 0092,
 * issue #233): su nombre, cómo se arma su dirección y cómo se guarda su
 * contraseña sin que viaje en claro.
 *
 * Lo usan `scripts/consulta.mjs` (para conectar) y
 * `scripts/clave-consulta-lectura.mjs` (para ponerle la contraseña).
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export const ROL_LECTURA = "consulta_lectura";
export const VAR_LECTURA = "SUPABASE_DB_URL_LECTURA";
export const VAR_ADMIN = "SUPABASE_DB_URL";
/** Dónde vive en 1Password (bóveda HoMenu, ficha Supabase). */
export const OP_LECTURA = `op://HoMenu/Supabase/${VAR_LECTURA}`;

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
 * La dirección del rol de lectura a partir de la del administrador: mismo
 * servidor, puerto y base. Por el pooler de Supabase (Supavisor) el usuario
 * lleva el proyecto detrás (`postgres.<ref>` → `consulta_lectura.<ref>`); en
 * conexión directa, el nombre a secas.
 */
export function urlLectura(urlAdmin, clave) {
  const u = new URL(urlAdmin);
  const usuario = decodeURIComponent(u.username);
  const punto = usuario.indexOf(".");
  u.username = punto > 0 ? `${ROL_LECTURA}${usuario.slice(punto)}` : ROL_LECTURA;
  u.password = encodeURIComponent(clave);
  return u.toString();
}

/**
 * Qué dirección usa `npm run consulta`: la de lectura si existe; si no, la del
 * administrador con un aviso (plan B mientras la 0092 no esté aplicada o la
 * contraseña no esté en 1Password).
 * @param {(clave: string) => string | undefined} leer
 */
export function conexionDeConsulta(leer) {
  let lectura;
  let motivo = `no hay ${VAR_LECTURA}`;
  try {
    lectura = leer(VAR_LECTURA);
  } catch (e) {
    // La dirección op:// está en .env.local pero la ficha aún no tiene el campo.
    motivo = `no pude leer ${VAR_LECTURA} (${e.message})`;
  }
  if (lectura) return { url: lectura, aviso: null };
  return {
    url: leer(VAR_ADMIN),
    aviso: `Aviso: ${motivo}. Entro como administrador; solo me protegen el filtro de texto y la transacción read only (issue #233).`,
  };
}
