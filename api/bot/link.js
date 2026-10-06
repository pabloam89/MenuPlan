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

import crypto from "node:crypto";
import { select, insert, usuarioDeToken, eq } from "../_bot/db.js";
import { nombreDelBot, enviar } from "../_bot/telegram.js";
import { recordar } from "../_bot/rapido.js";
import { puede } from "../../src/lib/papeles.js";

const VALIDEZ_MS = 15 * 60 * 1000;
// El menú no sale solo: se ofrece (Pablo, 6 oct 2026). El botón vuelve como si
// lo hubiera escrito (`t:`, sacarBotones en telegram.js) y Lola lo genera.
export const AVISO_ALTA = "¡Listo, ya os tengo! 🙌 ¿Os preparo el menú de la semana?\n\nCuando quieras me pides lo que sea: «¿qué comemos hoy?», «cambia la cena del jueves» o «apunta leche».";
export const BOTON_ALTA = { texto: "🍽️ Prepáralo ya", dato: "t:Prepárame ya el menú de esta semana" };

export default async function handler(req, res) {
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
        await enviar(chat_id, AVISO_ALTA, { botones: [[BOTON_ALTA]] });
        await recordar({ chatId: chat_id, householdId, pregunta: "(He rellenado en la app quiénes comemos y las alergias.)", respuesta: AVISO_ALTA });
      }));
      return res.status(200).json({ avisados: chats.length });
    }

    // 16 bytes en base64url: cabe en el límite de 64 caracteres de /start.
    const token = crypto.randomBytes(16).toString("base64url");
    await insert("bot_link_tokens", [{
      token,
      user_id: user.id,
      household_id: householdId,
      expires_at: new Date(Date.now() + VALIDEZ_MS).toISOString(),
    }]);

    const bot = await nombreDelBot();
    return res.status(200).json({
      privado: `https://t.me/${bot}?start=${token}`,
      grupo: puede(miembro.role, "enlazar_grupo") ? `https://t.me/${bot}?startgroup=${token}` : null,
      caduca: VALIDEZ_MS / 60000,
    });
  } catch (err) {
    console.error("[bot/link]", err?.message);
    return res.status(500).json({ error: "No se pudo crear el enlace." });
  }
}
