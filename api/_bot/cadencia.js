/**
 * Cada cuánto llama pg_cron a /api/bot/recordatorios: el único sitio donde
 * vive esa cifra. scripts/bot-cron.mjs programa el job con HORARIO_CRON, y el
 * endpoint se la pasa al barrido de caducidades (#958, #974).
 */

export const CADA_MINUTOS = 5;
export const CADA_MS = CADA_MINUTOS * 60000;
/** La expresión de pg_cron (cron.schedule) que sale de CADA_MINUTOS. */
export const HORARIO_CRON = `*/${CADA_MINUTOS} * * * *`;
