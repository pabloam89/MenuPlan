/**
 * «Conectar Telegram» desde la app.
 *
 * La app llama aquí con la sesión del usuario; devolvemos dos enlaces t.me con
 * un código de un solo uso (15 minutos): uno para hablar con el bot en privado
 * y otro para meterlo en un grupo. Al pulsarlo, Telegram le manda al bot
 * `/start <código>` y el webhook (api/bot/telegram.js) enlaza ese chat con la
 * casa. Con GET, solo si esta persona ya está conectada (el botón de Inicio).
 * Con `{ aviso: "alta" }`, que Lola diga en su chat que el alta se hizo en la app.
 *
 * Cualquiera de la casa conecta su privado: titular, cotitular o lector (Lola
 * mira su papel en cada mensaje, api/_bot/papel.js). El enlace de grupo, solo
 * titular y cotitular: meter a Lola en el grupo es cosa de quien gestiona.
 */

import { codigoBot, codigoGrupo } from "../../src/lib/ids.js";
import { cors } from "../_guard.js";
import { select, insert, usuarioDeToken, eq } from "../_bot/db.js";
import { nombreDelBot, enviar } from "../_bot/telegram.js";
import { recordar } from "../_bot/rapido.js";
import { puede } from "../../src/lib/papeles.js";
import { BOTONES_CAMINO_TELEGRAM, PREGUNTA_DE_CAMINO } from "../_bot/caminoMenu.js";

const VALIDEZ_MS = 15 * 60 * 1000;
// El menú no sale solo: se ofrece (Pablo, 6 oct 2026). Tras el alta, la misma pregunta que antes de cada menú
// (#1210, 4 nov 2026): para cuándo y cómo de a fondo, con los tres caminos. Cada botón vuelve como si lo hubiera
// escrito (`t:`, sacarBotones en telegram.js) y Lola hace las preguntas de ese camino (caminoMenu.js).
export const AVISO_ALTA = `¡Listo, ya os tengo! 🙌 ${PREGUNTA_DE_CAMINO}\n\nCuando quieras me pides lo que sea: «¿qué comemos hoy?», «cambia la cena del jueves» o «apunta leche».`;

export default async function handler(req, res) {
  // La app iOS (Capacitor) llama desde capacitor://localhost: sin CORS el
  // navegador de la app ni envía el POST. Responde al preflight OPTIONS.
  if (cors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const accessToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return res.status(401).json({ error: "Falta la sesión." });

  try {
    const user = await usuarioDeToken(accessToken);
    if (!user) return res.status(401).json({ error: "Sesión inválida." });

    // GET: ¿esta persona ya habla con Lola? Para el botón de Inicio («Pídeselo
    // a Lola» o «Conecta con Lola»). Las tablas del bot no se leen desde la app
    // (RLS sin políticas, 0057). Su Telegram es su cuenta, o enlazó un privado.
    if (req.method === "GET") {
      const [ident, privado] = await Promise.all([
        select("bot_identities", `user_id=${eq(user.id)}&limit=1`, "user_id"),
        select("bot_chats", `kind=eq.private&linked_by=${eq(user.id)}&limit=1`, "chat_id"),
      ]);
      return res.status(200).json({ conectado: ident.length > 0 || privado.length > 0 });
    }

    const [perfil] = await select("user_profiles", `user_id=${eq(user.id)}`, "active_household_id");
    const householdId = perfil?.active_household_id;
    if (!householdId) return res.status(409).json({ error: "No tienes una casa activa." });

    const [miembro] = await select("household_members", `household_id=${eq(householdId)}&user_id=${eq(user.id)}`, "role");
    if (!miembro) return res.status(403).json({ error: "No eres de esta casa." });

    // `{ aviso: "alta" }`: acabó el alta en la app tras pulsar «Prefiero
    // rellenarlo en la app» en el saludo de Lola. Ella lo dice en su chat (si
    // no, allí seguiría su «¿quiénes coméis?» sin contestar) y lo apunta en su
    // memoria, para no volver a preguntarlo.
    if (req.body?.aviso === "alta") {
      const chats = await select("bot_chats", `household_id=${eq(householdId)}&kind=eq.private&linked_by=${eq(user.id)}`, "chat_id");
      await Promise.all(chats.map(async ({ chat_id }) => {
        await enviar(chat_id, AVISO_ALTA, { botones: [BOTONES_CAMINO_TELEGRAM] });
        await recordar({ chatId: chat_id, householdId, pregunta: "(He rellenado en la app quiénes comemos y las alergias.)", respuesta: AVISO_ALTA });
      }));
      return res.status(200).json({ avisados: chats.length });
    }

    // 16 bytes en base64url: cabe en el límite de 64 caracteres de /start, y
    // nunca empieza como un enlace de compartir (rc_, ru_, m_…): src/lib/ids.js.
    // El del grupo, con su propio código de grupo (la «g» delante, codigoGrupo): el enlace de «añadir al grupo» se
    // reenvía, y con el mismo código cualquiera que lo recibiera lo abriría en su privado y su Telegram pasaría a ser
    // esta cuenta (specs/auth.md §7, trozo 3). Un código de grupo, en un privado, se rechaza (enlazarDesdeAjustes).
    const token = codigoBot.nuevo();
    const tokenGrupo = puede(miembro.role, "enlazar_grupo") ? codigoGrupo.nuevo() : null;
    const caduca = new Date(Date.now() + VALIDEZ_MS).toISOString();
    await insert("bot_link_tokens", [token, tokenGrupo].filter(Boolean).map((t) => ({
      token: t,
      user_id: user.id,
      household_id: householdId,
      expires_at: caduca,
    })));

    const bot = await nombreDelBot();
    return res.status(200).json({
      privado: `https://t.me/${bot}?start=${token}`,
      grupo: tokenGrupo ? `https://t.me/${bot}?startgroup=${tokenGrupo}` : null,
      caduca: VALIDEZ_MS / 60000,
    });
  } catch (err) {
    console.error("[bot/link]", err?.message);
    return res.status(500).json({ error: "No se pudo crear el enlace." });
  }
}
