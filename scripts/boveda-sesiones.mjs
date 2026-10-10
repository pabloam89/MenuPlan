/**
 * boveda-sesiones.mjs — separa en 1Password lo que leen las sesiones de lo que
 * solo usa Pablo (#328, fondo #326, decisión #299).
 *
 *   node scripts/boveda-sesiones.mjs              ensayo: qué copiaría, sin escribir
 *   node scripts/boveda-sesiones.mjs --si         copia a HoMenu-sesiones (Pablo, con `!`)
 *   node scripts/boveda-sesiones.mjs --comprobar  con el token del llavero: la URL de
 *                                                administrador NO se lee y las de sesiones sí
 *
 * El token de la cuenta de servicio nueva lo guarda `scripts/llavero-op.mjs`.
 * Los pasos, en orden: skill `1password`, «Bóveda de sesiones».
 *
 * Copia, no mueve: la ficha de HoMenu sigue igual. Solo los campos de COPIAR:
 * la ficha «Supabase» de sesiones lleva la URL y la anon key, no la URL de
 * administrador. Si la ficha ya existe en el destino, la salta (dos fichas
 * con el mismo título dejan la dirección op:// ambigua).
 *
 * Ningún valor sale por pantalla: se leen y se pasan por stdin a `op`, y se
 * comparan a ciegas (COINCIDEN / NO COINCIDEN). Escribir en una bóveda pide la
 * app de escritorio (la service account no escribe): `op` va sin el token.
 *
 * La lista y la plantilla `ops/env.1password` las ata `boveda-sesiones.test.js`.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { BOVEDA_PABLO, BOVEDA_SESIONES, VAR_OP_PABLO, entornoOp, opPorLaApp, tokenServicio } from "./lib/env.mjs";
import { estadoFicha } from "./lib/rolLectura.mjs";

export { BOVEDA_PABLO, BOVEDA_SESIONES };

/** Lo que va a sesiones: ficha de HoMenu → campos (el título se conserva). */
export const COPIAR = [
  { ficha: "Anthropic", campos: ["ANTHROPIC_API_KEY"] },
  { ficha: "Vercel AI Gateway", campos: ["AI_GATEWAY_API_KEY"] },
  { ficha: "fal", campos: ["FAL_KEY"] },
  { ficha: "Gemini AI Studio", campos: ["GEMINI_AI_STUDIO_KEY"] },
  { ficha: "Groq", campos: ["GROQ_API_KEY"] },
  { ficha: "Tripo3D", campos: ["TRIPO3D_API_KEY"] },
  { ficha: "Supabase", campos: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] },
  { ficha: "Supabase lectura", campos: ["SUPABASE_DB_URL_LECTURA"] },
];

/** Lo que se queda con Pablo y la plantilla solo nombra en comentario. */
export const SOLO_PABLO = [
  { ficha: "Supabase", campo: "SUPABASE_DB_URL" },
  { ficha: "Supabase", campo: "SUPABASE_ACCESS_TOKEN" },
  // Escribe y borra en el store que sirve las fotos de producción (seguridad, #328).
  { ficha: "Vercel Blob", campo: "BLOB_READ_WRITE_TOKEN" },
  { ficha: "Telegram", campo: "TELEGRAM_BOT_TOKEN" },
  { ficha: "Telegram", campo: "TELEGRAM_WEBHOOK_SECRET" },
  { ficha: "Telegram", campo: "TELEGRAM_BOT_USERNAME" },
  { ficha: "Gmail SMTP", campo: "SMTP_GMAIL_USER" },
  { ficha: "Gmail SMTP", campo: "SMTP_GMAIL_APP_PASSWORD" },
];

/** La ficha nueva: título, categoría y solo los campos pedidos (sin ids de bóveda, referencias ni secciones). */
export function fichaCopia(origen, campos) {
  const fields = [];
  for (const c of campos) {
    const f = (origen.fields ?? []).find((x) => x.label === c);
    if (!f || f.value === undefined || f.value === "") throw new Error(`«${origen.title}» no tiene el campo ${c} (o está vacío)`);
    fields.push({ id: f.id, type: f.type, label: f.label, value: f.value });
  }
  fields.sort((a, b) => a.label.localeCompare(b.label));
  return { title: origen.title, category: origen.category, fields };
}

/** `op` con la service account del llavero (la que usan las sesiones). Sin token, falla cerrado. */
function opServicio(args) {
  let env;
  try {
    env = entornoOp();
  } catch (e) {
    return { status: 1, stdout: "", stderr: e.message };
  }
  return spawnSync("op", args, { env, encoding: "utf8" });
}
/** `op` por la app de escritorio (pide aprobar a Pablo): el único camino es `opPorLaApp`, que exige MENUPLAN_OP_PABLO=1. */
const opApp = (args, input) => opPorLaApp(args, { input });
const motivo = (r) => (r.error?.message || r.stderr || "").trim().split("\n")[0];

/**
 * Lee la ficha de HoMenu: con la service account y, solo con --si, por la app.
 * El ensayo nunca abre la app: sacaría una ventana a Pablo por cada ficha.
 */
function leerOrigen(ficha, si) {
  const args = ["item", "get", ficha, "--vault", BOVEDA_PABLO, "--format", "json"];
  let r = opServicio(args);
  if (r.status !== 0 && si) r = opApp(args);
  if (r.status !== 0) throw new Error(`no puedo leer «${ficha}» de ${BOVEDA_PABLO}: ${motivo(r)}${si ? "" : " (el ensayo no abre la app de escritorio; con --si, desde tu terminal y con MENUPLAN_OP_PABLO=1)"}`);
  return JSON.parse(r.stdout);
}

function copiar(si) {
  let fallos = 0;
  for (const { ficha, campos } of COPIAR) {
    try {
      const nueva = fichaCopia(leerOrigen(ficha, si), campos);
      // El ensayo no mira el destino: eso pasa por la app y le saltaría una ventana a Pablo.
      if (!si) { console.log(`copiaría «${ficha}» (${campos.join(", ")}) → ${BOVEDA_SESIONES}, si no existe ya`); continue; }
      const destino = estadoFicha(opApp(["item", "get", ficha, "--vault", BOVEDA_SESIONES, "--format", "json"]));
      if (destino === "existe") { console.log(`salto  «${ficha}»: ya existe en ${BOVEDA_SESIONES}`); continue; }
      if (destino === "error") throw new Error(`no veo ${BOVEDA_SESIONES} (¿existe y está desbloqueada la app?)`);
      const c = opApp(["item", "create", "--vault", BOVEDA_SESIONES, "--format", "json", "-"], JSON.stringify(nueva));
      if (c.status !== 0) throw new Error(`op item create falló: ${motivo(c)}`);
      const creada = JSON.parse(c.stdout);
      const iguales = nueva.fields.every((f) => creada.fields?.find((x) => x.label === f.label)?.value === f.value);
      console.log(`copiada «${ficha}» (${campos.join(", ")}): ${iguales ? "COINCIDEN" : "NO COINCIDEN"}`);
      if (!iguales) fallos++;
    } catch (e) {
      console.error(`FALLA  «${ficha}»: ${e.message}`);
      fallos++;
    }
  }
  if (!si) console.log("Ensayo: no he escrito nada. Con --si, copia.");
  return fallos;
}

function comprobar() {
  let mal = 0;
  const linea = (ok, texto) => { console.log(`${ok ? "BIEN" : "MAL "}  ${texto}`); if (!ok) mal++; };
  linea(process.env[VAR_OP_PABLO] !== "1" && Boolean(tokenServicio()), `hay token de service account en el llavero y ${VAR_OP_PABLO} no está puesto`);
  const v = opServicio(["vault", "list", "--format", "json"]);
  const nombres = v.status === 0 ? JSON.parse(v.stdout).map((b) => b.name) : [];
  linea(nombres.length === 1 && nombres[0] === BOVEDA_SESIONES, `la cuenta solo ve ${BOVEDA_SESIONES} (ve: ${nombres.join(", ") || motivo(v)})`);
  for (const { ficha, campo } of SOLO_PABLO.filter((s) => s.campo === "SUPABASE_DB_URL")) {
    const r = opServicio(["read", `op://${BOVEDA_PABLO}/${ficha}/${campo}`]);
    linea(r.status !== 0 && !r.stdout.trim(), `la URL de administrador (op://${BOVEDA_PABLO}/${ficha}/${campo}) NO se puede leer`);
  }
  for (const { ficha, campos } of COPIAR) for (const c of campos) {
    const r = opServicio(["read", `op://${BOVEDA_SESIONES}/${ficha}/${c}`]);
    linea(r.status === 0 && r.stdout.trim().length > 0, `op://${BOVEDA_SESIONES}/${ficha}/${c} se lee${r.status === 0 ? "" : `: ${motivo(r)}`}`);
  }
  console.log(mal ? `${mal} comprobaciones mal.` : "Todo bien: las sesiones leen lo suyo y no la URL de administrador.");
  return mal ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  process.exit(args.includes("--comprobar") ? comprobar() : (copiar(args.includes("--si")) ? 1 : 0));
}
