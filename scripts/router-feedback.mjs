/**
 * El bucle de mejora del enrutador (api/_bot/router.js): de los turnos reales
 * (user_events `bot_route`) a casos nuevos de scripts/router-evals.json.
 *
 *   node scripts/router-feedback.mjs                 → saca los sospechosos de los últimos 14 días
 *   node scripts/router-feedback.mjs --dias=30       → otra ventana
 *   node scripts/router-feedback.mjs --sugerir       → y un modelo grande propone la etiqueta de cada uno
 *   node scripts/router-feedback.mjs --anadir        → pasa a router-evals.json los que ya tengan «modo»
 *
 * Los sospechosos van a scripts/router-evals-candidatos.json con «modo» y
 * «rapida» a null. Se etiquetan a mano (o se revisa lo sugerido), y --anadir
 * los mete en las pruebas. Nada entra en las pruebas sin que lo mire alguien:
 * una etiqueta mala enseña al enrutador a equivocarse con seguridad.
 *
 * Qué es sospechoso:
 *   · dudosa      el enrutador no llegó al umbral (entre 0,5 y 0,8)
 *   · sin datos   eligió un modo rápido pero le faltó algo y acabó en Lola
 *   · corregida   fue por la rápida y lo siguiente del mismo chat, en 3 min,
 *                 fue deshacer o un «no, eso no»
 *   · error       el enrutador falló (tiempo agotado, API caída)
 */

import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const leerEnv = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]+)`, "m"))?.[1]?.trim();
process.env.ANTHROPIC_API_KEY ||= leerEnv("ANTHROPIC_API_KEY");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`));
const DIAS = Number(arg("dias=")?.split("=")[1] ?? 14);
const EVALS = new URL("./router-evals.json", import.meta.url);
const CANDIDATOS = new URL("./router-evals-candidatos.json", import.meta.url);
const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!.,]/g, "").trim();

const evals = JSON.parse(fs.readFileSync(EVALS, "utf8"));

// ── --anadir: de candidatos etiquetados a pruebas ───────────────────────────
if (arg("anadir")) {
  const cand = fs.existsSync(CANDIDATOS) ? JSON.parse(fs.readFileSync(CANDIDATOS, "utf8")) : { casos: [] };
  const listos = cand.casos.filter((c) => c.modo && typeof c.rapida === "boolean");
  const ya = new Set(evals.casos.map((c) => normal(c.texto)));
  const nuevos = listos.filter((c) => !ya.has(normal(c.texto)))
    .map(({ texto, modo, rapida, datos, ultima }) => ({ texto, modo, rapida, ...(datos ? { datos } : {}), ...(ultima ? { ultima } : {}) }));
  evals.casos.push(...nuevos);
  fs.writeFileSync(EVALS, `${JSON.stringify(evals, null, 2)}\n`);
  cand.casos = cand.casos.filter((c) => !(c.modo && typeof c.rapida === "boolean"));
  fs.writeFileSync(CANDIDATOS, `${JSON.stringify(cand, null, 2)}\n`);
  console.log(`${nuevos.length} casos nuevos en router-evals.json (${listos.length - nuevos.length} ya estaban). Quedan ${cand.casos.length} sin etiquetar.`);
  process.exit(0);
}

// ── Sacar los sospechosos ───────────────────────────────────────────────────
const db = new pg.Client({ connectionString: leerEnv("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(
  `select created_at, metadata from user_events
    where event = 'bot_route' and created_at > now() - make_interval(days => $1)
    order by created_at`, [DIAS]);
await db.end();

const { UMBRAL } = await import("../api/_bot/router.js");
const CORRIGE = /^(no\b|eso no|que no|mal\b|deshaz|deshacer|vuelve a como|d[eé]jalo como)/i;
const conTexto = rows.filter((r) => r.metadata?.texto);
const sospechas = [];
for (const [i, r] of conTexto.entries()) {
  const m = r.metadata;
  const motivos = [];
  if (m.error) motivos.push("error");
  if (m.confianza >= 0.5 && m.confianza < UMBRAL) motivos.push("dudosa");
  if (!m.rapida && m.modo !== "lola" && m.confianza >= UMBRAL) motivos.push("sin datos");
  if (m.rapida && m.chat) {
    const siguiente = conTexto.slice(i + 1).find((x) => x.metadata.chat === m.chat);
    if (siguiente && Date.parse(siguiente.created_at) - Date.parse(r.created_at) < 3 * 60000
      && (siguiente.metadata.modo === "deshacer" || CORRIGE.test(siguiente.metadata.texto))) motivos.push("corregida");
  }
  if (motivos.length) sospechas.push({ r, motivos });
}

const ya = new Set(evals.casos.map((c) => normal(c.texto)));
const previos = fs.existsSync(CANDIDATOS) ? JSON.parse(fs.readFileSync(CANDIDATOS, "utf8")).casos : [];
const vistos = new Set([...ya, ...previos.map((c) => normal(c.texto))]);
const nuevos = [];
for (const { r, motivos } of sospechas) {
  const k = normal(r.metadata.texto);
  if (vistos.has(k)) continue;
  vistos.add(k);
  nuevos.push({
    texto: r.metadata.texto,
    ...(r.metadata.ultima ? { ultima: r.metadata.ultima } : {}),
    modo: null,
    rapida: null,
    _motivo: motivos.join(", "),
    _predicho: `${r.metadata.modo} ${Number(r.metadata.confianza ?? 0).toFixed(2)}${r.metadata.rapida ? " ⚡" : " 🧠"}`,
    _datos: r.metadata.datos ?? null,
    _cuando: r.created_at,
  });
}

// ── --sugerir: un modelo grande propone la etiqueta (se revisa igual) ───────
if (arg("sugerir") && nuevos.length) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { REGLAS, MODOS } = await import("../api/_bot/router.js");
  const cliente = new Anthropic();
  for (const c of nuevos) {
    const r = await cliente.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: `${REGLAS}\n\nAhora no enrutas en vivo: etiquetas un caso para las pruebas del enrutador. Piensa qué modo es el CORRECTO (no el que eligió) y si debería ir por la vía rápida (true) o a Lola (false). Ante la duda, lola y false.`,
      tools: [{
        name: "etiquetar",
        description: "La etiqueta correcta del caso.",
        input_schema: { type: "object", properties: { modo: { type: "string", enum: MODOS }, rapida: { type: "boolean" }, porque: { type: "string" } }, required: ["modo", "rapida", "porque"] },
      }],
      tool_choice: { type: "tool", name: "etiquetar" },
      messages: [{ role: "user", content: `${c.ultima ? `Lo último que dijo Lola: «${c.ultima}»\n` : ""}Mensaje: «${c.texto}»\nEl enrutador eligió: ${c._predicho}` }],
    });
    const x = r.content.find((b) => b.type === "tool_use")?.input;
    if (x) c._sugerido = `${x.modo} ${x.rapida ? "⚡" : "🧠"}: ${x.porque}`;
  }
}

fs.writeFileSync(CANDIDATOS, `${JSON.stringify({
  _nota: "Turnos reales sospechosos (scripts/router-feedback.mjs). Pon «modo» y «rapida» (y «datos» si quieres comprobarlos) a los que tengas claros y corre --anadir. Los _campos son pistas, no se copian.",
  casos: [...previos, ...nuevos],
}, null, 2)}\n`);

const cuenta = (m) => sospechas.filter((s) => s.motivos.includes(m)).length;
const rapidas = conTexto.filter((r) => r.metadata.rapida).length;
console.log(`${rows.length} turnos en ${DIAS} días (${conTexto.length} con texto, ${rapidas} por la rápida).`);
console.log(`Sospechosos: ${sospechas.length} (dudosa ${cuenta("dudosa")}, sin datos ${cuenta("sin datos")}, corregida ${cuenta("corregida")}, error ${cuenta("error")}).`);
console.log(`${nuevos.length} nuevos en router-evals-candidatos.json; ${previos.length} de antes sin etiquetar.`);
for (const c of nuevos.slice(0, 15)) console.log(`  · «${c.texto.slice(0, 70)}» → ${c._predicho} [${c._motivo}]${c._sugerido ? `\n      sugerido: ${c._sugerido}` : ""}`);
