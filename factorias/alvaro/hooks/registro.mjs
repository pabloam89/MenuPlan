/**
 * Apunta qué juez corrió y qué veredicto dio. Un solo script para los tres eventos
 * donde se ve a un juez (SubagentStop, PostToolUse de SubagentHandback y de Agent):
 * qué se lee de cada uno vive en `apunteDe` (lib/reglas.mjs).
 */
import { apuntar } from "../lib/registro.mjs";
import { apunteDe } from "../lib/reglas.mjs";

let entrada = {};
try {
  let crudo = "";
  for await (const t of process.stdin) crudo += t;
  entrada = JSON.parse(crudo);
} catch {
  process.exit(0); // a propósito: sin entrada legible no hay nada que apuntar, y no se rompe la sesión
}

const apunte = apunteDe(entrada);
if (apunte) apuntar(entrada.cwd || process.cwd(), { ts: Date.now(), sesion: entrada.session_id, ...apunte });
