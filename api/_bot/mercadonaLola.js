/**
 * «Pásalo a Mercadona» desde Lola: la lista por comprar, con los productos del catálogo, va a un encargo igual que el
 * botón de la app (api/_bot/mercadonaEncargos.js). Cuando acaba, el aviso le llega al chat con el enlace.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cambiarAlcance, encargar, estadoDeCasa, guardarTelefono } from "./mercadonaEncargos.js";
import { lineasPorComprar, motor } from "./menu.js";
import { NOMBRE_LISTA_MERCADONA, listaParaMercadona } from "../../src/lib/mercadonaList.js";
import { NO_ENCARGADO } from "../../src/lib/vocabularios.js";
import { ALCANCE_MERCADONA, FALTA_MERCADONA, faltaPara } from "../../src/lib/mercadonaAlcance.js";
import { telefonoDe, textoParaSellar } from "../../src/lib/mercadonaTelefono.js";
import { sellar } from "../../src/lib/mercadonaSello.js";

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
  const { lista, lineas, sinProducto } = listaParaMercadona(items, map, NOMBRE_LISTA_MERCADONA);
  if (!lineas.length) return "No he encontrado ningún producto de la lista en Mercadona.";
  const r = await encargar({ casa: householdId, por: userId, canal, chat_id: chatId ?? null, lista });
  if (r.fallo) return TEXTO_SIN_ENCARGO[r.fallo];
  const fuera = sinProducto.length ? ` Sin producto en Mercadona, y por tanto fuera: ${sinProducto.join(", ")}.` : "";
  const cuantos = lineas.length === 1 ? "1 producto" : `${lineas.length} productos`;
  const hasta = r.alcance ?? ALCANCE_MERCADONA.LISTA;
  return `Estoy ${HACIENDO[hasta]} en tu cuenta de Mercadona con ${cuantos}.${fuera} Te aviso aquí cuando acabe.${LUEGO[hasta]}`;
}

// ── Hasta dónde llega el bot (trozo 18 de #1407): el mismo dato que Ajustes → Mercadona en la app ──

/** Lo que hace el bot en cada paso, para decírselo a la familia. */
export const QUE_HACE = Object.freeze({
  [ALCANCE_MERCADONA.LISTA]: "rellenar la lista en tu cuenta de Mercadona",
  [ALCANCE_MERCADONA.RESERVAR]: "rellenar la lista, meterla en el carro y reservarte la hora de entrega",
  [ALCANCE_MERCADONA.PAGAR]: "rellenar la lista, meterla en el carro, reservarte la hora de entrega y pagar, siempre con tu visto bueno al importe y en tu banco",
});
const HACIENDO = Object.freeze({
  [ALCANCE_MERCADONA.LISTA]: "rellenando la lista",
  [ALCANCE_MERCADONA.RESERVAR]: "rellenando la lista y metiéndola en el carro",
  [ALCANCE_MERCADONA.PAGAR]: "rellenando la lista y metiéndola en el carro",
});
const LUEGO = Object.freeze({
  [ALCANCE_MERCADONA.LISTA]: " Pagar y pedir lo haces tú.",
  [ALCANCE_MERCADONA.RESERVAR]: " Luego eliges la hora de entrega.",
  [ALCANCE_MERCADONA.PAGAR]: " Luego eliges la hora de entrega y me confirmas el importe.",
});

/** Lo que tiene que hacer la persona por cada cosa que falta (FALTAS_MERCADONA). */
export const TEXTO_FALTA = Object.freeze({
  [FALTA_MERCADONA.DIRECCION]: "añade tu dirección en la app de Mercadona",
  [FALTA_MERCADONA.TELEFONO]: "dime un teléfono para el repartidor",
  [FALTA_MERCADONA.PAGO]: "añade una tarjeta en la app de Mercadona",
});

const unir = (partes) => (partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]);
/** Pura. «añade tu dirección en la app de Mercadona y dime un teléfono para el repartidor». */
export const textoDeFalta = (falta) => unir(falta.map((f) => TEXTO_FALTA[f]));

/** El paso de después de cada uno, y cómo se dice. */
const SIGUIENTE = Object.freeze({
  [ALCANCE_MERCADONA.LISTA]: { paso: ALCANCE_MERCADONA.RESERVAR, dicho: "reservarte también la hora de entrega" },
  [ALCANCE_MERCADONA.RESERVAR]: { paso: ALCANCE_MERCADONA.PAGAR, dicho: "pagar también" },
});

/** Pura. Lo que Lola dice del estado: hasta dónde llega y, si lo hay, el paso siguiente y lo que le falta. */
export function textoDeEstado(estado) {
  if (!estado.disponible) return TEXTO_SIN_ENCARGO[NO_ENCARGADO.SIN_SERVICIO];
  if (!estado.cuenta) return TEXTO_SIN_ENCARGO[NO_ENCARGADO.SIN_CUENTA];
  const ahora = `Ahora puedo ${QUE_HACE[estado.alcance]}.`;
  const siguiente = SIGUIENTE[estado.alcance];
  if (!siguiente) return ahora;
  const falta = faltaPara(estado, siguiente.paso);
  return falta.length ? `${ahora} Para ${siguiente.dicho}, ${textoDeFalta(falta)}.` : `${ahora} Si quieres, puedo ${siguiente.dicho}.`;
}

/** Cómo está Mercadona para la casa, en una frase. */
export async function verMercadona({ householdId }) {
  return textoDeEstado(await estadoDeCasa(householdId));
}

/** Cambia hasta dónde llega el bot. Lo comprueba cambiarAlcance, no Lola: aquí solo se dice. */
export async function cambiarMercadona({ householdId, alcance }) {
  const r = await cambiarAlcance({ casa: householdId, alcance });
  if (r.fallo) return TEXTO_SIN_ENCARGO[r.fallo];
  if (r.falta) return `Para eso, primero ${textoDeFalta(r.falta)}. Cuando esté, vuelve a pedírmelo.`;
  return `Hecho: a partir de ahora puedo ${QUE_HACE[r.alcance]}.`;
}

/** La clave pública del trabajador: la misma con la que la app sella la sesión (api/mercadona.js). */
const clavePublica = () => process.env.MERCADONA_CLAVE_PUBLICA || null;

/**
 * Guarda el teléfono para el pedido: se sella aquí, con la clave pública, antes de guardarlo, y no se repite entero.
 * Solo por privado: en un grupo lo verían los demás.
 */
export async function guardarTelefonoMercadona({ householdId, telefono, esGrupo = false }, { clave = clavePublica } = {}) {
  if (esGrupo) return "El teléfono, mejor por privado: escríbeme a mí directamente.";
  const t = telefonoDe(telefono);
  if (!t) return "Ese teléfono no me cuadra. Dime uno de España, de 9 cifras.";
  const publica = clave();
  if (!publica) return TEXTO_SIN_ENCARGO[NO_ENCARGADO.SIN_SERVICIO];
  const r = await guardarTelefono({ casa: householdId, telefono_sellado: await sellar(textoParaSellar(t), publica) });
  if (r.fallo) return TEXTO_SIN_ENCARGO[r.fallo];
  return `Guardado, el acabado en ${t.phone_national_number.slice(-3)}. Solo lo usa el repartidor de Mercadona.`;
}
