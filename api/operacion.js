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
 * Para deshacer una operación propia (trozo 41): { casa, deshacer: <operacion_id> }, sin dato; la
 * deshace la base en una transacción (deshacer_operacion, 0111) si es de quien tiene la sesión y nada
 * de lo que tocó cambió después (si no, 200 con `guardado: false` y `sin_hacer` con su motivo).
 * Contesta 200 con el resultado (sin `pedido` ni `inversa`) o el código de
 * HTTP_DE_FALLO con { fallo, error? } (FALLOS_DATO; `error`, el motivo de la puerta o del dato).
 *
 * Y lee (trozo 12): GET ?casa=<uuid> contesta 200 con { v, datos }, los datos de la ficha Casa de ficha_casa v2
 * (leerDatosDeCasa; `datos` null con la v1). La app no puede llamar a ficha_casa (solo la service role, 0107):
 * los lee aquí quien es de la casa, con cualquier papel; quien no es de ella, sin_permiso.
 */
import { cors, blocked } from "./_guard.js";
import { usuarioDeToken } from "./_bot/db.js";
import { papelDeUsuario } from "./_bot/papel.js";
import { escribirDato, escribirPersonas, escribirPreferencias, deshacerOperacion, falloDeMotivo, leerDatosDeCasa } from "./_bot/datos.js";
import { motivoDe } from "./_bot/avisar.js";
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
    return res.status(200).json(await leerDatosDeCasa(casa, user.id));
  } catch (e) {
    // No leída no es una casa sin datos: se dice (la app no sigue la carga) y queda en el log.
    const { fallo, motivo } = falloDeBase(e);
    console.error(JSON.stringify({ evento: "casa_sin_leer", fallo, motivo }));
    return contestar(res, fallo);
  }
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

  const { casa, clave, accion, ref_id, pedida_at = null, dato, datos, deshacer = null, personas, grupos, preferencias } = req.body ?? {};
  // Un dato o varios (`datos`); cuál de los dos, y su forma, lo mira operacionDeDato (escribirDato.js).
  const conDatos = dato != null || datos != null;
  // Un cambio de la familia (trozo 10) en vez de un dato: personas y, si cambiaron, los grupos.
  const deFamilia = personas !== undefined || grupos !== undefined;
  // Un cambio de la libreta (trozo 14): sus preferencias.
  const deLibreta = preferencias !== undefined;
  let user;
  let papel;
  try {
    user = await usuarioDeToken(accessToken);
    if (!user) return contestar(res, FALLO_DATO.SIN_SESION);
    if (!ids.casa.esNuevo(casa)) return contestar(res, FALLO_DATO.INVALIDO, "casa");
    if (deshacer != null) {
      // Deshacer o escribir, nunca las dos en una petición: el dato no se tiraría en silencio.
      if (!ids.operacion.esNuevo(deshacer) || conDatos || deFamilia || deLibreta) return contestar(res, FALLO_DATO.INVALIDO, "deshacer");
    } else if (Number(conDatos) + Number(deFamilia) + Number(deLibreta) > 1) {
      // Un dato, un cambio de la familia o uno de la libreta, nunca dos: uno se tiraría en silencio.
      return contestar(res, FALLO_DATO.INVALIDO, "dato");
    } else if (!ids.claveOperacion.esNuevo(clave)) {
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
