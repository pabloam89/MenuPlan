// Registra (o consulta) el webhook del bot de Telegram.
//
//   node scripts/telegram-webhook.mjs info
//   node scripts/telegram-webhook.mjs set https://<dominio>/api/bot/telegram
//   node scripts/telegram-webhook.mjs delete
//
// Lee TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET de .env.local. El secreto
// viaja en cada llamada de Telegram (cabecera X-Telegram-Bot-Api-Secret-Token)
// y api/bot/telegram.js rechaza todo lo que no lo traiga: tiene que ser el
// MISMO valor que la variable de entorno del despliegue.

import { leerEnv } from "./lib/env.mjs";

const leer = leerEnv;
const token = leer("TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env.local");

const llamar = async (metodo, cuerpo = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return res.json();
};

const [cmd, url] = process.argv.slice(2);
if (cmd === "set") {
  const secreto = leer("TELEGRAM_WEBHOOK_SECRET");
  if (!url || !secreto) throw new Error("uso: set <url>, con TELEGRAM_WEBHOOK_SECRET en .env.local");
  console.log(await llamar("setWebhook", {
    url,
    secret_token: secreto,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }));
} else if (cmd === "delete") {
  console.log(await llamar("deleteWebhook", { drop_pending_updates: true }));
} else {
  console.log(await llamar("getMe"));
  console.log(await llamar("getWebhookInfo"));
}
