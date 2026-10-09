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
/**
 * Dónde vive en 1Password: una ficha propia en HoMenu, porque se crea con la
 * plantilla JSON por stdin (`op item create -`), y `op item edit` solo admite
 * plantillas desde un fichero o valores como argumento.
 */
export const FICHA_LECTURA = "Supabase lectura";
export const OP_LECTURA = `op://HoMenu/${FICHA_LECTURA}/${VAR_LECTURA}`;

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

/** La ficha de 1Password, en JSON para `op item create --vault HoMenu -`. */
export const fichaLectura = (clave, url) => JSON.stringify({
  title: FICHA_LECTURA,
  category: "PASSWORD",
  notesPlain: `Rol ${ROL_LECTURA} de Supabase (migración 0092, issue #233). La pone y la rota scripts/clave-consulta-lectura.mjs.`,
  fields: [
    { id: "password", type: "CONCEALED", purpose: "PASSWORD", label: "password", value: clave },
    { id: VAR_LECTURA, type: "CONCEALED", label: VAR_LECTURA, value: url },
  ],
});

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
 * Con la dirección de lectura, la sesión tiene que ser de `consulta_lectura`.
 * Si no (p. ej. SUPABASE_DB_URL_LECTURA apuntando por error a la de
 * administrador), el motivo para no seguir; null si cuadra o si no se esperaba
 * ningún rol (plan B, que ya avisa).
 */
export function motivoUsuarioIncorrecto(esperado, actual) {
  if (!esperado || actual === esperado) return null;
  return `${VAR_LECTURA} entra como «${actual}», no como «${esperado}». No sigo: corrige la dirección en 1Password.`;
}

/**
 * Qué dirección usa `npm run consulta`: la de lectura si existe; si la variable
 * no está, la del administrador con un aviso (plan B mientras la 0092 no esté
 * aplicada o la contraseña no esté en 1Password). Si está pero no se puede
 * leer, lanza: nunca cambia de usuario por un fallo.
 * @param {(clave: string) => string | undefined} leer
 */
export function conexionDeConsulta(leer) {
  let lectura;
  try {
    lectura = leer(VAR_LECTURA);
  } catch (e) {
    // Configurada pero ilegible (p. ej. una dirección op:// que no existe): se
    // para aquí. Caer al administrador dejaría a cualquiera forzar el cambio de
    // usuario con una dirección mala (juez de seguridad de la 0092).
    throw new Error(`${VAR_LECTURA} está configurada pero no la puedo leer (${e.message}). No cambio al administrador: arréglala o quítala.`);
  }
  if (lectura) return { url: lectura, aviso: null, rol: ROL_LECTURA };
  return {
    url: leer(VAR_ADMIN),
    rol: null,
    aviso: `Aviso: no hay ${VAR_LECTURA}. Entro como administrador; solo me protegen el filtro de texto y la transacción read only (issue #233).`,
  };
}
