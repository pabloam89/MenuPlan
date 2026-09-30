/**
 * Fotos y PDFs de Telegram → bloque para el modelo (que los lee directamente:
 * un ticket, la nevera, el menú del cole).
 *
 * Una foto normal llega en varios tamaños (el mayor, ~1280 px, sobra para leer
 * un ticket). Como documento puede venir una imagen a tamaño completo o un
 * PDF; la API de Anthropic acepta imágenes de hasta 5 MB y PDFs de hasta 32,
 * pero aquí se corta antes: nadie manda un menú del cole de 10 MB.
 */

import { llamar } from "./telegram.js";

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;

/** @returns {Promise<null | { tipo: "image"|"document", mediaType: string, base64: string } | { error: string }>} */
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
    if (mediaType !== "application/pdf" && !IMAGENES.includes(mediaType)) return { error: "tipo" };
    fileId = msg.document.file_id;
    tamano = msg.document.file_size;
  } else {
    return null;
  }
  const max = mediaType === "application/pdf" ? MAX_PDF : MAX_IMAGEN;
  if ((tamano ?? 0) > max) return { error: "grande" };

  const fichero = await llamar("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fichero.file_path}`);
  if (!res.ok) return { error: `descarga ${res.status}` };
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > max) return { error: "grande" };
  return {
    tipo: mediaType === "application/pdf" ? "document" : "image",
    mediaType,
    base64: bytes.toString("base64"),
  };
}
