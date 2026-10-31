/**
 * Donde la app propone sus operaciones (plan fichas con estado, trozos 8 y 26; #1037).
 *
 * La app no escribe tablas de ficha ni llama a aplicar_operacion (es solo de la
 * service role, 0106): manda aquí el dato que tocó la familia, pasa la puerta
 * de la tubería (src/lib/operaciones/puerta.js) y este endpoint lo escribe con
 * escribirDato (api/_bot/datos.js), el mismo que usa Lola. Hoy acepta solo
 * operaciones de tipo dato.
 *
 * Quién escribe sale del token de la sesión (nunca del cuerpo), y su papel en
 * la casa, de household_members. La puerta decide con ese papel: quien no es de
 * la casa o no la edita no escribe, y desde una pantalla habla una persona
 * (nada supuesto). El canal es siempre `app` y la
 * referencia, la pantalla: la app no puede hacerse pasar por Lola ni por el
 * sistema. aplicar_operacion vuelve a comprobar que el autor es de la casa.
 *
 * Cuerpo: { casa, clave, accion, ref_id, pedida_at, dato: { campo, persona_id, valor, origen } }.
 * Contesta 200 con el resultado (sin `pedido` ni `inversa`) o el código de
 * HTTP_DE_FALLO con { fallo, error? } (FALLOS_DATO; `error`, el motivo de la puerta o del dato).
 */
import { cors, blocked } from "./_guard.js";
import { usuarioDeToken } from "./_bot/db.js";
import { papelDeUsuario } from "./_bot/papel.js";
import { escribirDato, falloDeMotivo } from "./_bot/datos.js";
import { motivoDe } from "./_bot/avisar.js";
import { HTTP_DE_FALLO, apuntarSinGuardar } from "../src/lib/escribirDato.js";
import { comprobar, falloDePuerta } from "../src/lib/operaciones/puerta.js";
import * as ids from "../src/lib/ids.js";
import { FALLO_DATO, CANAL_DATO, REF_OPERACION } from "../src/lib/vocabularios.js";

/** Peticiones por IP y minuto: una familia toca pocos datos por minuto; esto frena a quien quiera llenar la base. */
export const LIMITE_POR_MINUTO = 60;

const contestar = (res, fallo, error) => res.status(HTTP_DE_FALLO[fallo]).json({ fallo, ...(error ? { error } : {}) });

export default async function handler(req, res) {
  // La app iOS (Capacitor) llama desde capacitor://localhost: responde al preflight.
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Origen ajeno o demasiadas peticiones (por IP; sin Redis deja pasar, _guard.js).
  if (await blocked(req, res, { bucket: "operacion", limit: LIMITE_POR_MINUTO, windowSec: 60 })) return;

  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return contestar(res, FALLO_DATO.SIN_SESION);

  const { casa, clave, accion, ref_id, pedida_at = null, dato } = req.body ?? {};
  let user;
  let papel;
  try {
    user = await usuarioDeToken(accessToken);
    if (!user) return contestar(res, FALLO_DATO.SIN_SESION);
    if (!ids.casa.esNuevo(casa)) return contestar(res, FALLO_DATO.INVALIDO, "casa");
    // La clave la da la app (un uuid); va a su propio espacio, para que no pueda adelantarse a una de Lola.
    if (!ids.claveOperacion.esNuevo(clave)) return contestar(res, FALLO_DATO.INVALIDO, "clave");
    papel = await papelDeUsuario(casa, user.id);
  } catch (e) {
    // La sesión o la casa no se pudieron leer: no se guarda, se dice y queda en el log.
    // Aquí no se llama a la RPC: un «no existe» no es rpc_ausente; solo la red se distingue.
    const motivo = motivoDe(e);
    const fallo = falloDeMotivo(motivo) === FALLO_DATO.SIN_RED ? FALLO_DATO.SIN_RED : FALLO_DATO.SERVIDOR;
    apuntarSinGuardar({ fallo, motivo, canal: CANAL_DATO.APP, campo: dato?.campo ?? null });
    return contestar(res, fallo);
  }

  // El papel (o null, si no es de la casa) lo juzga la puerta, la misma que juzgará a Lola.
  const contra = comprobar({ canal: CANAL_DATO.APP, autor_user_id: user.id, datos: dato ? [dato] : [] }, { papel });
  if (contra) {
    const fallo = falloDePuerta(contra.motivo);
    apuntarSinGuardar({ fallo, motivo: contra.motivo, canal: CANAL_DATO.APP, campo: dato?.campo ?? null });
    return contestar(res, fallo, contra.motivo);
  }

  const r = await escribirDato({
    casa, clave: `${CANAL_DATO.APP}:${clave}`, accion, pedida_at, dato,
    canal: CANAL_DATO.APP,
    ref: { tipo: REF_OPERACION.PANTALLA, id: ref_id },
    autor: { user_id: user.id },
  });
  if (r.fallo) return contestar(res, r.fallo, r.error);
  return res.status(200).json(r);
}
