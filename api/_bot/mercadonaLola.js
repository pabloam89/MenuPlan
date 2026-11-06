/**
 * «Pásalo a Mercadona» desde Lola: la lista por comprar, con los productos del catálogo, va a un encargo igual que el
 * botón de la app (api/_bot/mercadonaEncargos.js). Cuando acaba, el aviso le llega al chat con el enlace.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { encargar } from "./mercadonaEncargos.js";
import { lineasPorComprar, motor } from "./menu.js";
import { listaParaMercadona } from "../../src/lib/mercadonaList.js";
import { NO_ENCARGADO } from "../../src/lib/vocabularios.js";

const NOMBRE_LISTA = "Compra HoMenu";
const TIENDA = "Mercadona";

/** Lo que Lola dice si no se ha encolado. */
export const TEXTO_SIN_ENCARGO = Object.freeze({
  [NO_ENCARGADO.SIN_SERVICIO]: "Pasar la lista a Mercadona aún no está en marcha para vuestra casa.",
  [NO_ENCARGADO.SIN_CUENTA]: "Primero hay que conectar tu cuenta de Mercadona: se hace una vez, en Compra, en la app, desde un ordenador.",
  [NO_ENCARGADO.SESION_CADUCADA]: "Mercadona ha cerrado tu sesión. Vuelve a conectar la cuenta en Compra, en la app, desde un ordenador.",
  [NO_ENCARGADO.EN_MARCHA]: "Ya estoy rellenando una lista. Te aviso aquí cuando acabe.",
  [NO_ENCARGADO.TOPE]: "Hoy ya se han pedido muchas listas. Prueba mañana.",
});

/** El catálogo en el servidor: en el navegador se pide por red, aquí viene con la función (vercel.json). */
async function catalogoDelServidor() {
  const fichero = join(process.cwd(), "public/store/mercadona.json");
  return JSON.parse(await readFile(fichero, "utf8"));
}

/**
 * Encola la lista por comprar de la casa. Devuelve lo que Lola le dice a la familia.
 * @param {{ householdId: string, userId?: string|null, chatId?: string, canal: string }} quien
 */
export async function pasarAMercadona({ householdId, userId, chatId, canal }, { leerCatalogo = catalogoDelServidor } = {}) {
  // El canario y los chats sin persona no encargan: el encargo es de alguien (0131, `created_by`).
  if (!userId) return "Para pasar la lista a Mercadona necesito saber de quién es la cuenta, y en este chat no lo sé.";
  const items = await lineasPorComprar(householdId);
  if (items === null) return "No encuentro la casa.";
  if (!items.length) return "No hay nada por comprar en la lista.";
  // Del motor los dos: el catálogo se queda en su copia de storeCatalog, no en la de este fichero.
  const { fijarCatalogo, priceShoppingList } = await motor();
  fijarCatalogo(TIENDA, await leerCatalogo());
  const { map } = await priceShoppingList(TIENDA, items, []);
  const { lista, lineas, sinProducto } = listaParaMercadona(items, map, NOMBRE_LISTA);
  if (!lineas.length) return "No he encontrado ningún producto de la lista en Mercadona.";
  const r = await encargar({ casa: householdId, por: userId, canal, chat_id: chatId ?? null, lista });
  if (r.fallo) return TEXTO_SIN_ENCARGO[r.fallo];
  const fuera = sinProducto.length ? ` Sin producto en Mercadona, y por tanto fuera: ${sinProducto.join(", ")}.` : "";
  const cuantos = lineas.length === 1 ? "1 producto" : `${lineas.length} productos`;
  return `Estoy rellenando la lista en tu cuenta de Mercadona con ${cuantos}.${fuera} Te aviso aquí cuando acabe. Pagar y pedir lo haces tú.`;
}
