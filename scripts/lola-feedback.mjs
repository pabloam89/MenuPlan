/**
 * El bucle de mejora de Lola: de los turnos reales que salieron mal a casos
 * nuevos de scripts/bot-evals.json. Lo mismo que scripts/router-feedback.mjs
 * hace con el enrutador, pero con lo que es de Lola.
 *
 *   node scripts/lola-feedback.mjs              → saca los huecos de los últimos 7 días
 *   node scripts/lola-feedback.mjs --dias=14    → otra ventana (más de 14 no: el texto se borra a los 15)
 *   node scripts/lola-feedback.mjs --sugerir    → y un modelo grande propone dónde se arregla y el caso de prueba
 *   node scripts/lola-feedback.mjs --anadir     → pasa a bot-evals.json los que tengan «aprobado»: true
 *
 * Los huecos van a scripts/bot-evals-candidatos.json, que NO se sube (está en
 * .gitignore): lleva frases reales. Revisión, en ese fichero:
 *   · «destino»: dónde se arregla — vectores (descripciones del índice),
 *     conocimiento (api/_bot/conocimiento.md), router (router-feedback.mjs),
 *     instrucciones (lo que se le dice a Lola), herramienta (código) o ninguno.
 *   · «caso»: la prueba, con la frase REESCRITA (sin nombres ni nada de la
 *     familia: bot-evals.json es público).
 *   · «aprobado»: true cuando lo hayas mirado.
 * Nada entra en las pruebas sin que lo mire alguien: un caso mal etiquetado
 * enseña a Lola a equivocarse con seguridad.
 *
 * Qué es un hueco (scripts/lib/bot-semana.mjs, huecosDeLola):
 *   · corregida      lo siguiente del mismo chat, en 3 min, fue «no, eso no» o deshacer
 *   · no entiende    Lola dijo que no lo había entendido
 *   · supervisor     el supervisor frenó algo delicado (alergias, quitar a alguien)
 *   · dijo que guardó  dijo que lo guardó y no llamó a nada
 *   · búsqueda vacía / floja   buscar_recetas no encontró nada, o nada parecido
 *   · lenta          el turno pasó del objetivo (bot-objetivos.json)
 *   · plan B         contestó el modelo de reserva
 */

import fs from "node:fs";
import pg from "pg";
import { huecosDeLola, contarHuecos, normal } from "./lib/bot-semana.mjs";

const env = fs.existsSync(new URL("../.env.local", import.meta.url)) ? fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8") : "";
const leerEnv = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]+)`, "m"))?.[1]?.trim();
process.env.ANTHROPIC_API_KEY ||= leerEnv("ANTHROPIC_API_KEY");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`));
const DIAS = Math.min(14, Number(arg("dias=")?.split("=")[1] ?? 7));
const EVALS = new URL("./bot-evals.json", import.meta.url);
const CANDIDATOS = new URL("./bot-evals-candidatos.json", import.meta.url);
const NOTA = "Huecos reales de Lola (scripts/lola-feedback.mjs). NO SE SUBE: lleva frases reales. Pon «destino», revisa el «caso» (frase reescrita, sin datos de la familia) y «aprobado»: true; luego --anadir. Los _campos son pistas.";

const evals = JSON.parse(fs.readFileSync(EVALS, "utf8"));
const leerCandidatos = () => (fs.existsSync(CANDIDATOS) ? JSON.parse(fs.readFileSync(CANDIDATOS, "utf8")) : { casos: [] });
const guardarCandidatos = (casos) => fs.writeFileSync(CANDIDATOS, `${JSON.stringify({ _nota: NOTA, casos }, null, 2)}\n`);

// ── --anadir: de candidatos aprobados a pruebas ─────────────────────────────
if (arg("anadir")) {
  const cand = leerCandidatos();
  const listos = cand.casos.filter((c) => c.aprobado === true);
  const ya = new Set(evals.casos.map((c) => normal(c.entrada)));
  const nuevos = [];
  const rechazados = new Map(); // candidato → por qué no entra
  for (const c of listos) {
    if (!c.caso?.entrada || !c.caso?.nombre) { rechazados.set(c, "sin caso"); continue; }
    // La frase real tal cual no entra: bot-evals.json es público.
    if (normal(c.caso.entrada) === normal(c.texto)) { rechazados.set(c, "la entrada es la frase real, reescríbela"); continue; }
    if (ya.has(normal(c.caso.entrada))) continue;
    nuevos.push(Object.fromEntries(Object.entries(c.caso).filter(([k]) => !k.startsWith("_"))));
  }
  evals.casos.push(...nuevos);
  fs.writeFileSync(EVALS, `${JSON.stringify(evals, null, 2)}
`);
  const hechos = listos.filter((c) => !rechazados.has(c));
  guardarCandidatos(cand.casos.filter((c) => !hechos.includes(c)));
  console.log(`${nuevos.length} casos nuevos en bot-evals.json.`);
  for (const [c, porque] of rechazados) console.log(`  no entra «${String(c.texto).slice(0, 50)}»: ${porque}`);
  // Lo que además se arregla fuera de las pruebas.
  for (const c of hechos.filter((x) => ["vectores", "conocimiento", "router"].includes(x.destino))) {
    console.log(`  · arreglar también en ${c.destino}: ${c._sugerido ?? c.caso.nombre}`);
  }
  console.log("Siguiente: node scripts/bot-evals.mjs (antes y después del arreglo).");
  process.exit(0);
}

// ── Sacar los huecos ────────────────────────────────────────────────────────
const url = process.env.SUPABASE_DB_URL || leerEnv("SUPABASE_DB_URL");
if (!url) throw new Error("Falta SUPABASE_DB_URL en .env.local");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(
  `select created_at, event, metadata m from user_events
    where event like 'bot\\_%' and created_at > now() - make_interval(days => $1)
    order by created_at`, [DIAS]);
await db.end();

const objetivos = JSON.parse(fs.readFileSync(new URL("./bot-objetivos.json", import.meta.url), "utf8"));
const eventos = rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), m: r.m ?? {} }));
const huecos = huecosDeLola(eventos, objetivos);

const previos = leerCandidatos().casos;
const vistos = new Set([...evals.casos.map((c) => normal(c.entrada)), ...previos.map((c) => normal(c.texto))]);
const nuevos = huecos.filter((h) => !vistos.has(normal(h.texto))).map((h) => ({
  texto: h.texto,
  ...(h.ultima ? { ultima: h.ultima } : {}),
  destino: null,
  caso: null,
  aprobado: false,
  _motivo: h.motivos.join(", "),
  _cuando: h.cuando,
  // Dónde pasó: en grupo Lola tiene que saber a quién contesta y la vía rápida hace menos.
  ...(h.lugar ? { _lugar: h.lugar } : {}),
  ...(h.extra ? { _extra: h.extra } : {}),
}));

// ── --sugerir: un modelo grande propone destino y caso (se revisa igual) ────
if (arg("sugerir") && nuevos.length) {
  process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { herramientas } = await import("../api/_bot/agente.js");
  const nombres = (await herramientas({ channel: "telegram", chatId: "0", householdId: "00000000-0000-0000-0000-000000000000", autor: null })).map((t) => t.name);
  const ejemplo = JSON.stringify(evals.casos.slice(0, 2), null, 1);
  const cliente = new Anthropic();
  for (const c of nuevos) {
    const r = await cliente.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 800,
      system: `Revisas un turno real en el que Lola, la asistente de cocina de HoMenu (Telegram), lo hizo mal o tarde. Propón dónde se arregla y una prueba que lo cubra.
Destinos: vectores (el índice de recetas no encontró algo que existe o la descripción no lo cubre), conocimiento (pregunta frecuente sin respuesta), router (la vía rápida decidió mal), instrucciones (Lola eligió mal herramienta o respuesta), herramienta (fallo de código), ninguno (no era un fallo).
El caso sigue el formato de scripts/bot-evals.json. Herramientas que existen: ${nombres.join(", ")}.
La «entrada» del caso es la frase REESCRITA: misma intención, sin nombres propios, edades, lugares ni nada que identifique a la familia (el fichero es público).
Ejemplos de casos:
${ejemplo}`,
      tools: [{
        name: "proponer",
        description: "Dónde se arregla y la prueba que lo cubre.",
        input_schema: {
          type: "object",
          properties: {
            destino: { type: "string", enum: ["vectores", "conocimiento", "router", "instrucciones", "herramienta", "ninguno"] },
            porque: { type: "string" },
            caso: {
              type: "object",
              properties: {
                nombre: { type: "string" }, entrada: { type: "string" },
                llama: { type: "array", items: { type: "string" } }, noLlama: { type: "array", items: { type: "string" } },
                texto: { type: "string" }, sinTexto: { type: "string" },
              },
              required: ["nombre", "entrada"],
            },
          },
          required: ["destino", "porque", "caso"],
        },
      }],
      tool_choice: { type: "tool", name: "proponer" },
      messages: [{ role: "user", content: `${c.ultima ? `Lo último que dijo Lola: «${c.ultima}»\n` : ""}Mensaje de la persona: «${c.texto}»\nPor qué es sospechoso: ${c._motivo}${c._extra ? ` ${JSON.stringify(c._extra)}` : ""}` }],
    });
    const x = r.content.find((b) => b.type === "tool_use")?.input;
    if (x) { c.destino = x.destino; c.caso = x.caso; c._sugerido = x.porque; }
  }
}

guardarCandidatos([...previos, ...nuevos]);
const cuenta = contarHuecos(huecos);
console.log(`${rows.length} eventos del bot en ${DIAS} días · ${huecos.length} huecos (${Object.entries(cuenta).map(([k, n]) => `${k} ${n}`).join(", ") || "ninguno"}).`);
console.log(`${nuevos.length} nuevos en bot-evals-candidatos.json; ${previos.length} de antes sin revisar.`);
for (const c of nuevos.slice(0, 15)) console.log(`  · «${c.texto.slice(0, 70)}» [${c._motivo}]${c.destino ? ` → ${c.destino}: ${c._sugerido}` : ""}`);
