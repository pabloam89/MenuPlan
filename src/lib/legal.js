/**
 * La versión vigente de la política de privacidad y los términos de uso.
 *
 * Puro y sin dependencias (ni de Supabase ni del navegador): lo importan por
 * igual la app (src/lib/legalConsent.js) y el bot (api/_bot/cuentas.js), igual
 * que src/lib/comidas.js o src/lib/cuando.js. Cuando cambie el TEXTO legal
 * (public/privacidad.html, public/terminos.html), sube este valor: a quien
 * tenga guardada una versión distinta se le vuelve a pedir el "acepto", tanto
 * si entra por la app como por el chat.
 */
export const LEGAL_VERSION = "2026-10-01";

export const URL_PRIVACIDAD = "/privacidad.html";
export const URL_TERMINOS = "/terminos.html";
