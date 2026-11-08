// Lo que dice Lola cuando la base no contesta y no puede saber la verdad
// (#208). Mejor decirlo que contestar algo falso: una casa vacía (sin
// alergias), una bienvenida a quien ya tiene cuenta, «ese enlace ya no
// funciona» o tratar como de fuera a alguien de la casa.
//
// Frases fijas, sin pasar por el modelo: es lo que se dice justo cuando no se
// puede confiar en nada más. Tono de conocimiento.md: una frase humana, sin
// jerga ni error técnico, y sin inventar por qué ha fallado.

const ESPERA = { es: "vuelve a intentarlo en un minuto 🙏", en: "please try again in a minute 🙏" };

const QUE = {
  // agente.js (cargarCasa): sin la casa no sabe las alergias ni el menú.
  casa: { es: "No he podido leer tu casa ahora mismo", en: "I couldn't read your home just now" },
  // bot/telegram.js (reconocer): no sabe si ya tiene cuenta; no se le da de alta otra vez.
  cuenta: { es: "No he podido comprobar si ya tienes cuenta ahora mismo", en: "I couldn't check whether you already have an account just now" },
  // bot/telegram.js y agente.js (papelDeQuien): no sabe qué puede hacer en la casa.
  papel: { es: "No he podido comprobar quién eres en esta casa ahora mismo", en: "I couldn't check who you are in this home just now" },
  // invitacion.js (bot_unirse_por_invitacion): no se dice «caducada» sin saberlo.
  invitacion: { es: "No he podido abrir tu invitación ahora mismo", en: "I couldn't open your invitation just now" },
  // bot/telegram.js (recibirCompartido, usarCompartido): sin comprobar el bloqueo no se enseña.
  enlace: { es: "No he podido abrir ese enlace ahora mismo", en: "I couldn't open that link just now" },
};

/**
 * La frase de «no he podido» para `que` (casa, cuenta, papel, invitacion,
 * enlace). `idioma`: el elegido («es», «en») o, si no se pudo leer, el
 * language_code de Telegram («en-GB»); sin él, en castellano.
 */
export function noPude(que, idioma = "es") {
  const lengua = String(idioma ?? "").toLowerCase().startsWith("en") ? "en" : "es";
  return `${QUE[que][lengua]}; ${ESPERA[lengua]}`;
}
