/**
 * El teléfono del pedido de Mercadona (trozos 15, 17, 18 y 20 de #1407). Mercadona lo exige en cada pedido y su perfil
 * no lo tiene (`.claude/skills/mercadona/referencias/pedido.md`, «Pedido»): se pide una vez y se guarda sellado en
 * `mercadona_cuenta.telefono_sellado`. Lo que se sella es `textoParaSellar`, con los nombres de campo de Mercadona: el
 * trabajador lo abre y lo manda tal cual a `PUT …/phone-number/`. La app lo sella en el móvil; Lola, en el servidor.
 * Aparte de vocabularios.js porque el trabajador corre en un contenedor que solo lleva lo suyo.
 */

/** Solo España: Mercadona reparte en España. */
export const PREFIJO_ESPANA = "34";

/**
 * Pura. Lo que escribió la persona, como lo pide Mercadona, o null si no es un teléfono de España: nueve cifras que
 * empiezan por 6, 7, 8 o 9, con o sin +34 / 0034 / 34 delante, y con espacios, puntos, guiones o paréntesis.
 * @returns {{ phone_country_code: string, phone_national_number: string } | null}
 */
export function telefonoDe(texto) {
  if (typeof texto !== "string") return null;
  if (!/^[\d\s().+-]+$/.test(texto.trim())) return null;
  let cifras = texto.replace(/\D/g, "");
  if (texto.trim().startsWith("+") || cifras.length > 9) cifras = cifras.replace(/^(00)?34/, "");
  if (!/^[6-9]\d{8}$/.test(cifras)) return null;
  return { phone_country_code: PREFIJO_ESPANA, phone_national_number: cifras };
}

/** Pura. El texto que se sella: siempre el mismo para el mismo teléfono. */
export const textoParaSellar = (telefono) =>
  JSON.stringify({ phone_country_code: telefono.phone_country_code, phone_national_number: telefono.phone_national_number });
