// El escaparate del bot en Telegram: el «About», la descripción que ve quien
// abre el chat por primera vez y el menú «/» de comandos.
//
//   node scripts/telegram-perfil.mjs          # enseña lo que hay ahora
//   node scripts/telegram-perfil.mjs aplicar  # sube lo de abajo
//
// Lee TELEGRAM_BOT_TOKEN de .env.local, como telegram-webhook.mjs. La foto de
// perfil y el GIF de la descripción no tienen API: van a mano en @BotFather.

import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync(path.resolve(import.meta.dirname, "..", ".env.local"), "utf8");
const token = env.match(/^TELEGRAM_BOT_TOKEN="?([^"\r\n]+)"?/m)?.[1];
if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env.local");

const llamar = async (metodo, cuerpo = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${metodo}: ${json.description}`);
  return json.result;
};

// Máx. 64. El nombre visible del bot en la lista de chats (el @usuario no cambia).
const NOMBRE = "Lola · HoMenu";

// Máx. 120 caracteres. Sale en el perfil y al compartir el bot.
const ABOUT = "Soy Lola, tu cocinera de casa 👩‍🍳 Te planifico el menú de la semana, la compra y las recetas. Háblame como a una amiga.";

// Máx. 512. Es lo que se ve, debajo del GIF, antes de pulsar «Iniciar».
const DESCRIPCION = `¡Hola! Soy Lola 👩‍🍳, la cocinera de tu casa.

🗓️ Te preparo el menú de toda la semana en segundos
🛒 Te hago la lista de la compra
📖 Te paso las recetas paso a paso
🥜 Tengo en cuenta las alergias y los gustos de cada uno
👨‍👩‍👧 Y me puedes meter en el grupo de la familia

Escríbeme como a un amigo: «¿qué comemos hoy?», «cambia la cena del jueves» o «genérame el menú».`;

const COMANDOS = [
  { command: "menu", description: "Ver el menú de la semana" },
  { command: "hoy", description: "Qué comemos y cenamos hoy" },
  { command: "compra", description: "La lista de la compra" },
  { command: "generar", description: "Hacer un menú nuevo" },
  { command: "app", description: "Abrir la app de HoMenu" },
  { command: "ayuda", description: "Qué sé hacer" },
  { command: "start", description: "Hola, qué sé hacer" },
];

if ([...NOMBRE].length > 64) throw new Error(`Nombre: ${[...NOMBRE].length} > 64`);
if ([...ABOUT].length > 120) throw new Error(`About: ${[...ABOUT].length} > 120`);
if ([...DESCRIPCION].length > 512) throw new Error(`Descripción: ${[...DESCRIPCION].length} > 512`);

if (process.argv[2] === "aplicar") {
  await llamar("setMyName", { name: NOMBRE });
  await llamar("setMyShortDescription", { short_description: ABOUT });
  await llamar("setMyDescription", { description: DESCRIPCION });
  await llamar("setMyCommands", { commands: COMANDOS });
  console.log("Subido.");
}

const yo = await llamar("getMe");
console.log(`@${yo.username} · ${(await llamar("getMyName")).name}`);
console.log("About:", (await llamar("getMyShortDescription")).short_description);
console.log("Descripción:\n" + (await llamar("getMyDescription")).description);
console.log("Comandos:", (await llamar("getMyCommands")).map((c) => "/" + c.command).join(" "));
