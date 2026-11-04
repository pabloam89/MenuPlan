/**
 * Donde la app propone sus operaciones (plan fichas con estado, trozos 8 y 26; #1037).
 *
 * La app no escribe tablas de ficha ni llama a aplicar_operacion (es solo de la
 * service role, 0106): manda aquí el dato que tocó la familia y este endpoint lo
 * pasa por la tubería del servidor (escribirDato, api/_bot/datos.js →
 * src/lib/operaciones/tuberia.js y su puerta), la misma que usa Lola. Hoy acepta solo
 * operaciones de tipo dato.
 *
 * Quién escribe sale del token de la sesión (nunca del cuerpo), y su papel en
 * la casa, de household_members. La puerta decide con ese papel: quien no es de
 * la casa o no la edita no escribe, y desde una pantalla habla una persona
 * (nada supuesto). El canal es siempre `app` y la
 * referencia, la pantalla: la app no puede hacerse pasar por Lola ni por el
 * sistema. aplicar_operacion vuelve a comprobar que el autor es de la casa.
 *
 * Cuerpo: { casa, clave, accion, ref_id, pedida_at, dato: { campo, persona_id, valor, origen } }, o con `datos`
 * (una lista) en vez de `dato`: los huecos de un horario que cambian juntos (trozo 13), en una sola operación.
 * Un cambio de la familia (trozo 10), en vez de `dato`: { …, personas: [...], grupos?: [...] }, lo que
 * saca cambiosDePersonas (src/lib/personas.js); va a escribir_persona (0108) por la misma tubería y puerta.
 * Un cambio de la libreta (trozo 14), en vez de `dato`: { …, preferencias: [...] }, lo que saca cambiosDeLibreta
 * (src/lib/preferencias.js); va a escribir_preferencias (0109) por la misma tubería y puerta.
 * Lo que hace la familia en la app (trozo 15), en vez de `dato`: { casa, senales: [{ eje, valor, delta }] }, las
 * señales de un voto, un descarte o un cambio de plato (src/lib/senales.js); se suman en `senal` (sumarSenales,
 * api/_bot/aprender.js) si quien las manda edita la casa. Sin clave: contar no es una operación (no se deshace).
 * Para deshacer una operación propia (trozo 41): { casa, deshacer: <operacion_id> }, sin dato; la
 * deshace la base en una transacción (deshacer_operacion, 0111) si es de quien tiene la sesión y nada
 * de lo que tocó cambió después (si no, 200 con `guardado: false` y `sin_hacer` con su motivo).
 * Contesta 200 con el resultado (sin `pedido` ni `inversa`) o el código de
 * HTTP_DE_FALLO con { fallo, error? } (FALLOS_DATO; `error`, el motivo de la puerta o del dato).
 *
 * Lo cocinado (trozo 22), en vez de `dato`: { casa, cocinado: { semana, dia, comida, receta_id, hecho } }: marca o desmarca
 * un plato cocinado en su tabla (api/_bot/cocinados.js) si quien lo manda edita la casa. Sin clave: es un historial,
 * no una operación de la ficha (no se deshace por aquí; se desmarca). Y GET ?casa=<uuid>&cocinados=<lunes> contesta
 * 200 con { cocinados: [{ semana, dia, comida, receta_id }] } a quien es de la casa.
 *
 * Lo gastado (trozo 22), en vez de `dato`: { casa, compra: { ticket?, precios?, borrar_ticket? } }: guarda un ticket con
 * sus precios, precios sueltos (un gasto a mano) o borra un ticket (y sus precios), en `ticket` y `precio_observado`
 * (api/_bot/historialCompra.js) si quien lo manda edita la casa; sin clave, como lo cocinado. Y GET ?casa=&compra=1
 * contesta 200 con { tickets, precios } en la forma de la app (src/lib/historialCompra.js) a quien es de la casa.
 *
 * Exportar la casa (trozo 36, privacidad): GET ?casa=<uuid>&exportar=1 contesta 200 con todo lo que la base guarda de
 * esa casa, tabla a tabla (api/_bot/exportar.js, src/lib/exportarCasa.js), a quien es de ella, con cualquier papel.
 *
 * Y lee (trozo 12): GET ?casa=<uuid> contesta 200 con { v, datos }, los datos de la ficha Casa de ficha_casa v2
 * (leerDatosDeCasa; con la v1, 503). La app no puede llamar a ficha_casa (solo la service role, 0107):
 * los lee aquí quien es de la casa, con cualquier papel; quien no es de ella, sin_permiso.
 */
import { cors, blocked } from "./_guard.js";
import { usuarioDeToken } from "./_bot/db.js";
import { papelDeUsuario } from "./_bot/papel.js";
import { escribirDato, escribirPersonas, escribirPreferencias, deshacerOperacion, falloDeMotivo, leerDatosDeCasa } from "./_bot/datos.js";
import { motivoDe } from "./_bot/avisar.js";
import { sumarSenales } from "./_bot/aprender.js";
import { cocinadosDeSemana, ponerCocinado } from "./_bot/cocinados.js";
import { filaDeCocinado } from "../src/lib/cocinados.js";
import { guardarTicket, guardarPrecios, borrarTicket, leerCompra } from "./_bot/historialCompra.js";
import { exportarCasa } from "./_bot/exportar.js";
import { filaDeTicket, filaDePrecio } from "../src/lib/historialCompra.js";
import { senalesDeLaApp } from "../src/lib/senales.js";
import { puede } from "../src/lib/papeles.js";
import { HTTP_DE_FALLO, apuntarSinGuardar, campoDelPedido } from "../src/lib/escribirDato.js";
import * as ids from "../src/lib/ids.js";
import { FALLO_DATO, CANAL_DATO, REF_OPERACION } from "../src/lib/vocabularios.js";

/** Peticiones por IP y minuto: una familia toca pocos datos por minuto; esto frena a quien quiera llenar la base. */
export const LIMITE_POR_MINUTO = 60;

const contestar = (res, fallo, error) => res.status(HTTP_DE_FALLO[fallo]).json({ fallo, ...(error ? { error } : {}) });

/** Un fallo leyendo la sesión, la casa o la ficha: `sin_red` o `servidor` (solo la red se distingue), con su motivo para el log. */
function falloDeBase(e) {
  const motivo = motivoDe(e);
  return { motivo, fallo: falloDeMotivo(motivo) === FALLO_DATO.SIN_RED ? FALLO_DATO.SIN_RED : FALLO_DATO.SERVIDOR };
}

/** GET ?casa=: los datos de la ficha Casa (leerDatosDeCasa) para quien es de la casa. */
async function leerCasa(req, res, accessToken) {
  const casa = req.query?.casa;
  try {
    const user = await usuarioDeToken(accessToken);
    if (!user) return contestar(res, FALLO_DATO.SIN_SESION);
    if (!ids.casa.esNuevo(casa)) return contestar(res, FALLO_DATO.INVALIDO, "casa");
    // Con la service role, ficha_casa no mira quién lee: se mira aquí.
    if (!(await papelDeUsuario(casa, user.id))) return contestar(res, FALLO_DATO.SIN_PERMISO);
    if (req.query?.compra !== undefined) return res.status(200).json(await leerCompra(casa));
    if (req.query?.exportar !== undefined) return res.status(200).json(await exportarCasa(casa));
    const semana = req.query?.cocinados;
    if (semana !== undefined) {
      // Primero la semana (inválida, sin pedir nada); luego la base, cuyo fallo va al catch de abajo.
      try {
        filaDeCocinado({ semana, dia: "Lun", comida: "Comida", receta_id: "semana" });
      } catch (e) {
        return contestar(res, FALLO_DATO.INVALIDO, e.message);
      }
      return res.status(200).json({ cocinados: await cocinadosDeSemana(casa, semana) });
    }
    return res.status(200).json(await leerDatosDeCasa(casa, user.id));
  } catch (e) {
    // No leída no es una casa sin datos: se dice (la app no sigue la carga) y queda en el log.
    const { fallo, motivo } = falloDeBase(e);
    console.error(JSON.stringify({ evento: "casa_sin_leer", fallo, motivo }));
    return contestar(res, fallo);
  }
}

/** Un plato cocinado (trozo 22): quien edita la casa lo marca o desmarca en su tabla; si la base falla, se dice. */
async function apuntarCocinado(res, casa, cocinado, papel) {
  if (!puede(papel, "editar_casa")) return contestar(res, FALLO_DATO.SIN_PERMISO);
  if (typeof cocinado?.hecho !== "boolean") return contestar(res, FALLO_DATO.INVALIDO, "cocinado.hecho");
  // Como las señales: primero la fila (inválida, sin pedir nada) y aparte la base (red, corte o error: se dice).
  let fila;
  try {
    fila = filaDeCocinado(cocinado);
  } catch (e) {
    return contestar(res, FALLO_DATO.INVALIDO, e.message);
  }
  try {
    return res.status(200).json({ guardado: true, ...(await ponerCocinado(casa, fila, cocinado.hecho)) });
  } catch (e) {
    const { fallo, motivo } = falloDeBase(e);
    console.error(JSON.stringify({ evento: "cocinado_sin_apuntar", fallo, motivo }));
    return contestar(res, fallo);
  }
}

/**
 * Lo gastado (trozo 22): quien edita la casa guarda un ticket con sus precios, precios sueltos o borra un ticket. Como
 * lo cocinado: primero las filas (si no valen, inválido sin pedir nada) y aparte la base (red, corte o error: se dice).
 */
async function apuntarCompra(res, casa, compra, papel) {
  if (!puede(papel, "editar_casa")) return contestar(res, FALLO_DATO.SIN_PERMISO);
  const { ticket = null, precios = [], borrar_ticket: borrarId = null } = compra ?? {};
  let filaTicket = null;
  let filasPrecios;
  try {
    if (borrarId != null && (ticket != null || precios.length)) throw new Error("compra: borrar y guardar a la vez");
    if (borrarId != null && typeof borrarId !== "string") throw new Error("compra: borrar_ticket no es un id");
    if (!Array.isArray(precios)) throw new Error("compra: precios no es una lista");
    if (borrarId == null && ticket == null && !precios.length) throw new Error("compra: nada que guardar");
    filaTicket = ticket == null ? null : filaDeTicket(ticket);
    filasPrecios = precios.map(filaDePrecio);
    if (filaTicket && filasPrecios.some((p) => p.ticket_id !== filaTicket.id)) throw new Error("compra: un precio no es de este ticket");
  } catch (e) {
    return contestar(res, FALLO_DATO.INVALIDO, e.message);
  }
  try {
    const r = borrarId != null
      ? await borrarTicket(casa, borrarId)
      : filaTicket ? await guardarTicket(casa, filaTicket, filasPrecios) : await guardarPrecios(casa, filasPrecios);
    return res.status(200).json({ guardado: true, ...r });
  } catch (e) {
    const { fallo, motivo } = falloDeBase(e);
    console.error(JSON.stringify({ evento: "compra_sin_apuntar", fallo, motivo }));
    return contestar(res, fallo);
  }
}

/** Las señales de la app (trozo 15): las de quien edita la casa, comprobadas, se suman; si la base falla, se dice. */
async function contarSenales(res, casa, senales, papel) {
  if (!puede(papel, "editar_casa")) return contestar(res, FALLO_DATO.SIN_PERMISO);
  let lista;
  try {
    lista = senalesDeLaApp(senales);
  } catch (e) {
    return contestar(res, FALLO_DATO.INVALIDO, e.message);
  }
  try {
    await sumarSenales(casa, lista);
  } catch (e) {
    const { fallo, motivo } = falloDeBase(e);
    console.error(JSON.stringify({ evento: "senales_sin_contar", fallo, motivo }));
    return contestar(res, fallo);
  }
  return res.status(200).json({ guardado: true, senales: lista.length });
}

export default async function handler(req, res) {
  // La app iOS (Capacitor) llama desde capacitor://localhost: responde al preflight.
  if (cors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  // Origen ajeno o demasiadas peticiones (por IP; sin Redis deja pasar, _guard.js).
  if (await blocked(req, res, { bucket: "operacion", limit: LIMITE_POR_MINUTO, windowSec: 60 })) return;

  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return contestar(res, FALLO_DATO.SIN_SESION);
  if (req.method === "GET") return leerCasa(req, res, accessToken);

  const { casa, clave, accion, ref_id, pedida_at = null, dato, datos, deshacer = null, personas, grupos, preferencias, senales, cocinado, compra } = req.body ?? {};
  // Un dato o varios (`datos`); cuál de los dos, y su forma, lo mira operacionDeDato (escribirDato.js).
  const conDatos = dato != null || datos != null;
  // Un cambio de la familia (trozo 10) en vez de un dato: personas y, si cambiaron, los grupos.
  const deFamilia = personas !== undefined || grupos !== undefined;
  // Un cambio de la libreta (trozo 14): sus preferencias.
  const deLibreta = preferencias !== undefined;
  // Señales de lo que hace la familia (trozo 15).
  const conSenales = senales !== undefined;
  // Un plato cocinado (trozo 22): un historial, como las señales, sin clave.
  const conCocinado = cocinado !== undefined;
  // Lo gastado (trozo 22): tickets y precios, historiales como lo cocinado.
  const conCompra = compra !== undefined;
  const historial = conCocinado || conCompra;
  let user;
  let papel;
  try {
    user = await usuarioDeToken(accessToken);
    if (!user) return contestar(res, FALLO_DATO.SIN_SESION);
    if (!ids.casa.esNuevo(casa)) return contestar(res, FALLO_DATO.INVALIDO, "casa");
    if (deshacer != null) {
      // Deshacer o escribir, nunca las dos en una petición: el dato no se tiraría en silencio.
      if (!ids.operacion.esNuevo(deshacer) || conDatos || deFamilia || deLibreta || conSenales || historial) return contestar(res, FALLO_DATO.INVALIDO, "deshacer");
    } else if (Number(conDatos) + Number(deFamilia) + Number(deLibreta) + Number(conSenales) + Number(conCocinado) + Number(conCompra) > 1) {
      // Un dato, un cambio de la familia o uno de la libreta, nunca dos: uno se tiraría en silencio.
      return contestar(res, FALLO_DATO.INVALIDO, "dato");
    } else if (!conSenales && !historial && !ids.claveOperacion.esNuevo(clave)) {
      // La clave la da la app (un uuid); va a su propio espacio, para que no pueda adelantarse a una de Lola.
      return contestar(res, FALLO_DATO.INVALIDO, "clave");
    }
    papel = await papelDeUsuario(casa, user.id);
  } catch (e) {
    // La sesión o la casa no se pudieron leer: no se guarda. Aquí no se llama a la RPC: un «no existe» no es rpc_ausente.
    const { fallo, motivo } = falloDeBase(e);
    apuntarSinGuardar({ fallo, motivo, canal: CANAL_DATO.APP, campo: campoDelPedido({ dato, datos }) });
    return contestar(res, fallo);
  }

  if (conSenales) return contarSenales(res, casa, senales, papel);
  if (conCocinado) return apuntarCocinado(res, casa, cocinado, papel);
  if (conCompra) return apuntarCompra(res, casa, compra, papel);
  // El papel (o null, si no es de la casa) lo juzga la puerta de la tubería, la misma que la de Lola.
  if (deshacer != null) {
    // Quien deshace es el de la sesión: la base solo deshace lo suyo (deshacer_operacion, 0111).
    const r = await deshacerOperacion({ casa, operacion_id: deshacer, canal: CANAL_DATO.APP, autor: { user_id: user.id } }, { papel });
    if (r.fallo) return contestar(res, r.fallo, r.error);
    return res.status(200).json(r);
  }
  const pedido = {
    casa, clave: `${CANAL_DATO.APP}:${clave}`, accion, pedida_at,
    canal: CANAL_DATO.APP,
    ref: { tipo: REF_OPERACION.PANTALLA, id: ref_id },
    autor: { user_id: user.id },
  };
  const r = deFamilia
    ? await escribirPersonas({ ...pedido, personas, grupos }, { papel })
    : deLibreta
      ? await escribirPreferencias({ ...pedido, preferencias }, { papel })
      : await escribirDato({ ...pedido, dato, datos }, { papel });
  if (r.fallo) return contestar(res, r.fallo, r.error);
  return res.status(200).json(r);
}
