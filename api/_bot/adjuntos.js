/**
 * Fotos y PDFs de Telegram → bloque para el modelo (que los lee directamente:
 * un ticket, la nevera, el menú del cole).
 *
 * Una foto normal llega en varios tamaños (el mayor, ~1280 px, sobra para leer
 * un ticket). Como documento puede venir una imagen a tamaño completo o un
 * PDF; la API de Anthropic acepta imágenes de hasta 5 MB y PDFs de hasta 32,
 * pero aquí se corta antes: nadie manda un menú del cole de 10 MB.
 *
 * Un PDF se cobra por página (texto e imagen de cada una, #958): uno de 10 MB
 * con cientos de páginas eran cientos de miles de tokens en un solo turno. Se
 * cuentan sus páginas y pasado MAX_PAGINAS_PDF no se lee, diciéndolo.
 */

import { inflateSync, constants } from "node:zlib";
import { llamar } from "./telegram.js";

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;
// Un menú del cole, un ticket o una receta caben de sobra en 20 páginas.
export const MAX_PAGINAS_PDF = 20;
// Si no se pueden contar sus páginas (un PDF raro), solo si es pequeño.
const MAX_PDF_SIN_CONTAR = 2 * 1024 * 1024;

/** Por qué no se puede leer un adjunto (vocabulario cerrado; el texto, en porQueNoAdjunto). */
export const ERROR_ADJUNTO = Object.freeze({ TIPO: "tipo", GRANDE: "grande", PAGINAS: "paginas", DESCARGA: "descarga" });

/**
 * Por qué no se puede leer una foto o un PDF, dicho a la persona.
 * @param {string} error  de ERROR_ADJUNTO
 * @param {number|null} [paginas]  las que tiene el PDF, si se contaron
 */
export function porQueNoAdjunto(error, paginas = null) {
  if (error === ERROR_ADJUNTO.TIPO) return "De ficheros solo entiendo fotos y PDFs.";
  if (error === ERROR_ADJUNTO.GRANDE) return "Es demasiado grande: mándala como foto normal (no como archivo) o un PDF más ligero.";
  if (error === ERROR_ADJUNTO.PAGINAS) return `Ese PDF es muy largo${paginas ? ` (${paginas} páginas)` : ""}: leo hasta ${MAX_PAGINAS_PDF}. Mándame solo las que importan, o una foto de cada una.`;
  return "No he podido abrirla. ¿Me la mandas otra vez?";
}

/** @returns {Promise<null | { tipo: "image"|"document", mediaType: string, base64: string } | { error: string, paginas?: number|null }>} */
export async function adjuntoDe(msg) {
  let fileId;
  let mediaType;
  let tamano;
  if (msg.photo?.length) {
    const mayor = msg.photo[msg.photo.length - 1];
    fileId = mayor.file_id;
    mediaType = "image/jpeg";
    tamano = mayor.file_size;
  } else if (msg.document) {
    mediaType = msg.document.mime_type;
    if (mediaType !== "application/pdf" && !IMAGENES.includes(mediaType)) return { error: ERROR_ADJUNTO.TIPO };
    fileId = msg.document.file_id;
    tamano = msg.document.file_size;
  } else {
    return null;
  }
  const max = mediaType === "application/pdf" ? MAX_PDF : MAX_IMAGEN;
  if ((tamano ?? 0) > max) return { error: ERROR_ADJUNTO.GRANDE };

  const fichero = await llamar("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`);
  if (!res.ok) {
    console.error("[adjunto] descarga", res.status);
    return { error: ERROR_ADJUNTO.DESCARGA };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > max) return { error: ERROR_ADJUNTO.GRANDE };
  if (mediaType === "application/pdf") {
    const paginas = paginasDePdf(bytes);
    if (!cabeElPdf(paginas, bytes.length)) return { error: ERROR_ADJUNTO.PAGINAS, paginas };
    return { tipo: "document", mediaType, base64: bytes.toString("base64") };
  }
  return { tipo: "image", mediaType, base64: bytes.toString("base64") };
}

/** ¿Se lee este PDF? Con sus páginas contadas, hasta MAX_PAGINAS_PDF; sin poder contarlas, solo si es pequeño. */
export const cabeElPdf = (paginas, bytes) => (paginas == null ? bytes <= MAX_PDF_SIN_CONTAR : paginas <= MAX_PAGINAS_PDF);

// «/Type /Page» y no «/Type /Pages» (el árbol): uno por página.
const PAGINA = /\/Type\s*\/Page(?![A-Za-z])/g;

/**
 * Cuántas páginas tiene un PDF, sin librería: cada página es un objeto
 * `/Type /Page`. Desde PDF 1.5 los objetos pueden ir comprimidos dentro de
 * «object streams» (Flate): si a la vista no hay ninguno, se descomprimen los
 * streams que dicen ser Flate (`/FlateDecode` en su diccionario) y se cuentan
 * dentro; los demás (una imagen JPEG) no llevan páginas y se saltan.
 * null si no se sabe: ninguna página encontrada, o un stream Flate que no se
 * puede abrir (podría llevar páginas: contar sin él sería quedarse corto).
 * @param {Buffer} bytes
 */
export function paginasDePdf(bytes) {
  const crudo = bytes.toString("latin1");
  const aLaVista = (crudo.match(PAGINA) ?? []).length;
  if (aLaVista) return aLaVista;
  let n = 0;
  // «stream» que no sea el final de «endstream».
  const inicio = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = inicio.exec(crudo))) {
    const ini = m.index + m[0].length;
    const fin = crudo.indexOf("endstream", ini);
    if (fin < 0) return null;
    inicio.lastIndex = fin + "endstream".length;
    // El diccionario del stream: desde el «obj» que lo abre.
    const dicc = crudo.slice(crudo.lastIndexOf("obj", m.index), m.index);
    if (!dicc.includes("/FlateDecode")) continue;
    let dentro;
    try {
      // Z_SYNC_FLUSH: acepta el final sin cerrar que deja el salto de línea antes de «endstream».
      dentro = inflateSync(bytes.subarray(ini, fin), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1");
    } catch (e) {
      console.warn("[adjunto] stream Flate ilegible: páginas sin contar", e?.message);
      return null;
    }
    n += (dentro.match(PAGINA) ?? []).length;
  }
  return n || null;
}
