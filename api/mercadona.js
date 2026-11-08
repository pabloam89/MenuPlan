/**
 * Comprar rellena una lista en la cuenta de Mercadona de la casa (0131, skill `mercadona`). Dos llamantes, con
 * credenciales distintas:
 *
 * La app, con la sesión de quien está dentro (el token de Supabase):
 *   GET  ?casa=<uuid>                          { disponible, cuenta, encargo, clave_publica }; quien es de la casa
 *   POST { casa, encargar: { lista } }         { encargo } o { fallo }; quien edita la casa
 *   POST { casa, conectar: { sesion_cifrada } }  guarda la sesión ya sellada en el navegador; quien edita la casa
 *   POST { casa, desconectar: true }           borra la sesión; quien edita la casa
 *
 * El trabajador, con MERCADONA_TRABAJADOR_TOKEN, que solo vale aquí (?trabajador=1):
 *   POST { accion: "tomar" }                   { siguiente: { encargo, sesion_cifrada } | null }
 *   POST { accion: "cerrar", id, resultado }   { cerrado }; repetirlo no hace nada dos veces
 *
 * El trabajador no tiene acceso a la base: ve solo lo que le da este endpoint. Esta función nunca abre la sesión:
 * la clave para abrirla vive solo en el servidor del trabajador.
 */
import { timingSafeEqual } from "node:crypto";
import { cors, blocked } from "./_guard.js";
import { usuarioDeToken } from "./_bot/db.js";
import { papelDeUsuario } from "./_bot/papel.js";
import { cambiarLlegaHasta, casaPermitida, cerrar, conectar, contarFallo, desconectar, encargar, estadoDeCasa, guardarTelefono, PeticionMala, tomar } from "./_bot/mercadonaEncargos.js";
import { FALLOS_ENCARGO_MERCADONA } from "../src/lib/vocabularios.js";
import { esRevision } from "../src/lib/mercadonaLlegaHasta.js";
import { puede } from "../src/lib/papeles.js";
import * as ids from "../src/lib/ids.js";

const LIMITE_POR_MINUTO = 30;

const tokenDe = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();

function esElTrabajador(req) {
  const esperado = Buffer.from(process.env.MERCADONA_TRABAJADOR_TOKEN ?? "");
  const dado = Buffer.from(tokenDe(req));
  return esperado.length > 0 && esperado.length === dado.length && timingSafeEqual(esperado, dado);
}

async function trabajador(req, res) {
  if (!esElTrabajador(req)) return res.status(401).json({ error: "sin permiso" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { accion, id, resultado } = req.body ?? {};
  if (accion === "tomar") return res.status(200).json({ siguiente: await tomar() });
  if (accion !== "cerrar" || !ids.operacion.esNuevo(id) || !resultadoValido(resultado)) {
    return res.status(400).json({ error: "petición no válida" });
  }
  return res.status(200).json({ cerrado: await cerrar(id, resultado) });
}

function resultadoValido(r) {
  // La revisión de la cuenta viaja con el cierre, sea cual sea el resultado; si viene, con su forma exacta.
  if (r?.revision !== undefined && !esRevision(r.revision)) return false;
  if (r?.fallo !== undefined) return FALLOS_ENCARGO_MERCADONA.includes(r.fallo);
  if (!r?.lista_xid) return false;
  // Sin releer la lista no se sabe qué entró: los dos null, y no a medias.
  if (r.entraron === null && r.faltan === null) return true;
  return Number.isInteger(r.entraron) && r.entraron >= 0 && Array.isArray(r.faltan);
}

async function app(req, res) {
  const accessToken = tokenDe(req);
  if (!accessToken) return res.status(401).json({ error: "sin sesión" });
  const user = await usuarioDeToken(accessToken);
  if (!user) return res.status(401).json({ error: "sin sesión" });
  const casa = req.method === "GET" ? req.query?.casa : req.body?.casa;
  if (!ids.casa.esNuevo(casa)) return res.status(400).json({ error: "casa no válida" });
  const papel = await papelDeUsuario(casa, user.id);
  if (!papel) return res.status(403).json({ error: "sin permiso" });

  if (req.method === "GET") {
    const estado = await estadoDeCasa(casa);
    return res.status(200).json({ ...estado, clave_publica: process.env.MERCADONA_CLAVE_PUBLICA ?? null });
  }
  if (!puede(papel, "editar_casa")) return res.status(403).json({ error: "sin permiso" });
  const { encargar: pedido, conectar: conexion, desconectar: quitar, llega_hasta, telefono } = req.body;
  if (pedido) return res.status(200).json(await encargar({ casa, por: user.id, canal: "app", lista: pedido.lista }));
  // Desconectar no pasa por esta puerta: una casa fuera de la lista tiene que poder borrar su sesión.
  if (conexion && !casaPermitida(casa)) return res.status(403).json({ error: "sin permiso" });
  if (conexion) return res.status(200).json(await conectar({ casa, por: user.id, sesion_cifrada: conexion.sesion_cifrada }));
  if (quitar === true) return res.status(200).json(await desconectar(casa));
  // Hasta dónde llega el bot y el teléfono del pedido (trozo 17): las mismas funciones que usa Lola.
  if (llega_hasta !== undefined) return res.status(200).json(await cambiarLlegaHasta({ casa, llega_hasta }));
  if (telefono) return res.status(200).json(await guardarTelefono({ casa, telefono_sellado: telefono.telefono_sellado }));
  return res.status(400).json({ error: "petición no válida" });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (await blocked(req, res, { bucket: "mercadona", limit: LIMITE_POR_MINUTO, windowSec: 60 })) return;
  try {
    return await (req.query?.trabajador ? trabajador(req, res) : app(req, res));
  } catch (e) {
    if (e instanceof PeticionMala) return res.status(400).json({ error: e.message });
    contarFallo(e);
    return res.status(500).json({ error: "no se ha podido" });
  }
}
