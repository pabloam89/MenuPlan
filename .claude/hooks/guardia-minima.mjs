#!/usr/bin/env node
/**
 * guardia-minima.mjs — lo único que queda de la guardia tras #878: no volver a las credenciales de Pablo.
 *
 * PreToolUse de Bash y PowerShell (`.claude/settings.json`). Solo aplica `credencialDeComando`
 * (credenciales.mjs, #447): quitar o vaciar GH_TOKEN, cambiar de dónde saca git sus credenciales,
 * sacar las guardadas del PC, cambiar las reglas del repo, aprobar un PR, imprimir el token, en
 * PowerShell lanzar gh o git de red sin `node scripts/token-sesion.mjs --`, y lanzar `op` o nombrar
 * lo de 1Password que es solo de Pablo (familia `op`, la regla `op-de-pablo` de antes, #328).
 *
 * Por qué hace falta aunque se fuera la guardia grande (juicio del inventario v2 de #878, hallazgo B):
 * el token de la App solo lo carga Bash (CLAUDE_ENV_FILE). En PowerShell, `gh` usa el llavero del PC;
 * si Pablo entró en `gh` para aplicar los rulesets y no salió, una sesión que lanza `gh pr merge`
 * sobre un PR a main iría como administrador y el ruleset la dejaría. La familia `powershell` lo
 * frena. Es un filtro de buena fe: la barrera de fondo es el `gh auth logout` de Pablo.
 *
 * La familia `powershell` solo se aplica en el PC de Pablo (esPcDePablo): en otro PC, `gh` y `git`
 * van con la cuenta de quien está delante, que no es administradora.
 *
 * Además (fueraDelRepo.mjs, 19 oct 2026): no escribir fuera de la carpeta del repo y sus carpetas de
 * tarea (C:\dev\MenuPlan*, o como se llame en ese PC), con Bash, PowerShell, Edit, Write o NotebookEdit.
 *
 * Sin entrada legible no puede mirar: pregunta (ni deja pasar en silencio ni niega).
 */
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AVISOS_CREDENCIALES, credencialDeComando } from "./credenciales.mjs";
import { AVISO_FUERA, fijarRaizPropia, fueraDelRepo, hermanasDeDisco, raizPropiaDeGit } from "./fueraDelRepo.mjs";

/**
 * ¿Es el PC de Pablo? La familia `powershell` solo tiene sentido aquí: protege de que `gh` o `git`
 * vayan con la credencial de administrador de Pablo. En el PC de Álvaro su cuenta solo escribe, y
 * la regla le dejaba sin subir nada desde PowerShell (19 oct 2026).
 */
export function esPcDePablo() {
  try {
    return userInfo().username.toLowerCase() === "pablo";
  } catch {
    return true; // sin saberlo, se protege como si lo fuera
  }
}

/**
 * Pura salvo los valores por defecto (`hermanas`: las entradas de C:\dev que no son del repo;
 * `pcDePablo`: esPcDePablo()): { decision: "deny", motivo, familia } o null.
 */
export function decidir(entrada, { hermanas, pcDePablo } = {}) {
  const herramienta = entrada?.tool_name;
  const ajena = fueraDelRepo(entrada, { hermanas: hermanas ?? hermanasDeDisco() });
  if (ajena) return { decision: "deny", motivo: AVISO_FUERA(ajena), familia: "fuera-del-repo" };
  if (herramienta !== "Bash" && herramienta !== "PowerShell") return null;
  const cmd = String(entrada?.tool_input?.command ?? "");
  const familia = credencialDeComando(cmd, { powershell: herramienta === "PowerShell" });
  if (!familia) return null;
  if (familia === "powershell" && !(pcDePablo ?? esPcDePablo())) return null;
  return { decision: "deny", motivo: AVISOS_CREDENCIALES[familia], familia };
}

/** La respuesta para Claude Code. */
export function salida(r) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: r.decision, permissionDecisionReason: `[guardia] ${r.motivo}` } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let crudo = "";
  for await (const trozo of process.stdin) crudo += trozo;
  let r;
  try {
    const entrada = JSON.parse(crudo);
    fijarRaizPropia(raizPropiaDeGit(process.env.CLAUDE_PROJECT_DIR || entrada?.cwd || process.cwd()));
    r = decidir(entrada);
  } catch (e) {
    r = { decision: "ask", motivo: `entrada ilegible (${e.message}): no puedo mirar las credenciales de esta orden.` };
  }
  if (r) process.stdout.write(JSON.stringify(salida(r)));
  process.exit(0);
}
