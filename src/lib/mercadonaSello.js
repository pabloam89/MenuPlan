/**
 * Sellar la sesión de Mercadona con la clave pública del trabajador (0131, skill `mercadona`): el navegador la sella
 * antes de enviarla, y ni Vercel ni la base la pueden abrir. Solo la abre scripts/lib/mercadonaAbrir.mjs, en el servidor
 * del trabajador, con la clave privada.
 *
 * Por dentro: AES-256-GCM con una clave de un solo uso, y esa clave cifrada con RSA-OAEP (SHA-256). Es lo que WebCrypto
 * da en todos los navegadores. Funciona igual en Node, que trae el mismo `crypto.subtle`.
 */

export const VERSION_SELLO = 1;

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

/** @param {string} texto la sesión @param {string} clavePublica base64 de la clave en SPKI */
export async function sellar(texto, clavePublica) {
  const { subtle } = globalThis.crypto;
  const publica = await subtle.importKey("spki", deBase64(clavePublica), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["wrapKey"]);
  const clave = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await subtle.encrypt({ name: "AES-GCM", iv }, clave, new TextEncoder().encode(texto));
  const envuelta = await subtle.wrapKey("raw", clave, publica, { name: "RSA-OAEP" });
  return JSON.stringify({ v: VERSION_SELLO, k: aBase64(envuelta), iv: aBase64(iv), c: aBase64(cifrado) });
}

/** @param {string} sello lo que dio `sellar` @param {CryptoKey} privada la clave privada RSA-OAEP, con uso `unwrapKey` */
export async function abrir(sello, privada) {
  const { v, k, iv, c } = JSON.parse(sello);
  if (v !== VERSION_SELLO) throw new Error(`sello de otra versión: ${v}`);
  const { subtle } = globalThis.crypto;
  const clave = await subtle.unwrapKey("raw", deBase64(k), privada, { name: "RSA-OAEP" }, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: deBase64(iv) }, clave, deBase64(c)));
}
