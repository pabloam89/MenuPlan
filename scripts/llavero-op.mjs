#!/usr/bin/env node
/**
 * llavero-op.mjs — guarda en el llavero de Windows el token de la service
 * account de 1Password que usan los scripts (scripts/lib/env.mjs, LLAVERO),
 * sin que pase por la pantalla, un fichero ni un argumento. Lo lanza Pablo
 * (#299, #328) con `!`, con el token llegando por la tubería desde `op`:
 *
 *   op service-account create "MenuPlan sesiones" --vault HoMenu-sesiones:read_items --raw | node scripts/llavero-op.mjs
 *
 * Sustituye al que hubiera con un solo Add (PasswordVault lo reemplaza en
 * sitio; sin Remove, el llavero nunca se queda vacío), lo relee y compara a ciegas: imprime COINCIDEN o
 * NO COINCIDEN, nunca el token. Si lo que llega no parece un token de service
 * account (`ops_…`), no guarda nada: así un mensaje de error de `op` no acaba
 * en el llavero.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { LLAVERO } from "./lib/env.mjs";

const CARGAR = "[void][Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType = WindowsRuntime];"
  + " $v = New-Object Windows.Security.Credentials.PasswordVault;";

/**
 * La orden de PowerShell que guarda lo que llega por stdin. El token no va en
 * la orden: la lee de [Console]::In.
 */
export const ordenGuardar = (recurso = LLAVERO.recurso, usuario = LLAVERO.usuario) => CARGAR
  + " $t = [Console]::In.ReadToEnd().Trim();"
  + ` $v.Add((New-Object Windows.Security.Credentials.PasswordCredential('${recurso}', '${usuario}', $t)))`;

/** La orden que lo relee (la misma que usa env.mjs). */
export const ordenLeer = (recurso = LLAVERO.recurso, usuario = LLAVERO.usuario) => CARGAR
  + ` $c = $v.Retrieve('${recurso}', '${usuario}'); $c.RetrievePassword(); [Console]::Out.Write($c.Password)`;

/** ¿Parece un token de service account? Empiezan por `ops_` y no llevan espacios. */
export const pareceToken = (t) => /^ops_\S{20,}$/.test(t);

function main() {
  if (process.platform !== "win32") {
    console.error("Solo en Windows: el llavero es el de Windows.");
    process.exit(1);
  }
  const chunks = [];
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", () => {
    const token = Buffer.concat(chunks).toString("utf8").trim();
    if (!pareceToken(token)) {
      console.error("Lo que ha llegado no parece un token de service account (ops_…). No guardo nada.");
      process.exit(1);
    }
    const ps = (orden, input) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", orden], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const g = ps(ordenGuardar(), token);
    if (g.status !== 0) {
      console.error(`No pude guardarlo en el llavero: ${String(g.stderr).trim().split("\n")[0]}`);
      process.exit(1);
    }
    const l = ps(ordenLeer(), "");
    const coincide = l.status === 0 && l.stdout.trim() === token;
    console.log(`llavero recurso: "${LLAVERO.recurso}" usuario: ${LLAVERO.usuario} resultado: ${coincide ? "COINCIDEN" : "NO COINCIDEN"}`);
    process.exit(coincide ? 0 : 1);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
