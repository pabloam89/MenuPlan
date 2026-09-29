// El último `bot_rev` (0057) que ESTE dispositivo vio de cada casa. Sirve para
// saber, al abrir la app, si el bot de Telegram ha escrito mientras estaba
// cerrada: en ese caso la nube manda sobre la copia local aunque aquí ya haya
// perfil. Vive en localStorage porque es un dato del dispositivo, no de la casa.

const clave = (householdId) => `hm.botRev.${householdId}`;

export function leerBotRevVisto(householdId) {
  if (!householdId) return null;
  try {
    const v = localStorage.getItem(clave(householdId));
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export function guardarBotRevVisto(householdId, rev) {
  if (!householdId || rev == null) return;
  try {
    localStorage.setItem(clave(householdId), String(rev));
  } catch {
    // Safari en privado: sin memoria de dispositivo, se recarga de más, no de menos.
  }
}
