#!/usr/bin/env node
/**
 * El diccionario de lo que se pide (#939, fase 3), para personas y agentes.
 *
 *   npm run diccionario -- buscar "<frase>"        qué reconoce y de dónde sale cada forma
 *   npm run diccionario -- huecos [--dias 15]       palabras de mensajes reales que no reconoce (solo lectura)
 *   npm run diccionario -- proponer <palabra>... [--si]
 *        a qué valor se parece cada palabra, por embeddings. Sin --si solo dice
 *        qué haría y cuánto costaría: con --si llama al AI Gateway (céntimos).
 *   npm run diccionario -- aprender <rasgo> <valor> <forma> --quien <persona|agente>
 *        apunta una forma confirmada en src/data/sinonimosAprendidos.json (va por PR)
 *
 * El bucle de aprendizaje: huecos → proponer → una persona o un agente confirma
 * → aprender → PR. Nada entra solo: lo que se aprende se revisa como el código.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { entradas, formasDe, resolver, sinTildes, EJE_DEL_RASGO } from "../src/lib/diccionario.js";

const [orden, ...resto] = process.argv.slice(2);
const opcion = (n, porDefecto) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : porDefecto; };
const sueltos = resto.filter((x, i) => !x.startsWith("--") && !resto[i - 1]?.startsWith("--"));
const RUTA_APRENDIDOS = fileURLToPath(new URL("../src/data/sinonimosAprendidos.json", import.meta.url));

// Palabras que no son comida ni rasgo: no son huecos.
const VACIAS = new Set("hola gracias vale bueno pues para porque pero como cuando donde quiero queremos puedes podrias dame hazme ponme cambia cambiar semana menu hoy manana comida cena cenar comer algo otra otro esta este esto eso esa mejor tambien ahora luego mucho poco nada todo todos todas cosa cosas plato platos receta recetas dias dia lunes martes miercoles jueves viernes sabado domingo opciones mas menos tengo tenemos hacer hace hacemos".split(" "));

if (orden === "buscar") {
  const frase = sueltos.join(" ");
  const r = resolver(frase);
  if (!r.length) console.log(`Nada reconocido en «${frase}». Si debería, es un hueco: npm run diccionario -- proponer <palabra>.`);
  for (const x of r) console.log(`${x.rasgo}=${x.valor}  por «${x.forma}» (${x.origen})  → eje ${EJE_DEL_RASGO[x.rasgo] ?? "varios"}`);
} else if (orden === "huecos") {
  const dias = Number(opcion("dias", 15));
  const pg = (await import("pg")).default;
  const { leerEnv } = await import("./lib/env.mjs");
  const { conexionDeConsulta } = await import("./lib/rolLectura.mjs");
  const c = new pg.Client({ connectionString: conexionDeConsulta(leerEnv).url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin read only");
  const { rows } = await c.query("select content from bot_messages where role = 'user' and created_at > now() - make_interval(days => $1)", [dias]);
  await c.end();
  const textos = rows.map((r) => (typeof r.content === "string" ? r.content : r.content?.texto ?? r.content?.text ?? "")).filter(Boolean);
  const conocidas = new Set(entradas().flatMap((e) => [...e.formas.keys()]).flatMap((f) => f.split(" ")));
  const cuenta = new Map();
  for (const t of textos) {
    for (const p of new Set(sinTildes(t).split(/[^a-z]+/))) {
      if (p.length < 4 || VACIAS.has(p) || conocidas.has(p)) continue;
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
  }
  const lista = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log(`${textos.length} mensajes de ${dias} días; ${cuenta.size} palabras sin reconocer. Las más repetidas (revisar a mano: muchas no son comida):`);
  for (const [p, n] of lista) console.log(`  ${n}  ${p}`);
} else if (orden === "proponer") {
  const palabras = sueltos;
  if (!palabras.length) throw new Error("proponer <palabra>...");
  const etiquetas = entradas().map((e) => ({ rasgo: e.rasgo, valor: e.valor, texto: `${e.rasgo} ${e.valor}: ${[...e.formas.keys()].slice(0, 12).join(", ")}` }));
  const textos = [...palabras, ...etiquetas.map((e) => e.texto)];
  if (!resto.includes("--si")) {
    const tokens = textos.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
    console.log(`Vectorizaría ${palabras.length} palabras y ${etiquetas.length} entradas (~${tokens} tokens, voyage/voyage-4 por el AI Gateway: céntimos). Repite con --si para hacerlo.`);
  } else {
    const { leerEnv } = await import("./lib/env.mjs");
    const token = leerEnv("AI_GATEWAY_API_KEY");
    if (!token) throw new Error("falta AI_GATEWAY_API_KEY");
    const r = await fetch("https://ai-gateway.vercel.sh/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voyage/voyage-4", input: textos }),
    });
    if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const v = (await r.json()).data.map((d) => d.embedding);
    const coseno = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return s / Math.sqrt(na * nb); };
    palabras.forEach((p, i) => {
      const top = etiquetas.map((e, j) => ({ ...e, s: coseno(v[i], v[palabras.length + j]) })).sort((a, b) => b.s - a.s).slice(0, 3);
      console.log(`«${p}»: ${top.map((t) => `${t.rasgo}=${t.valor} (${t.s.toFixed(2)})`).join(" · ")}`);
    });
    console.log("Si una es buena: npm run diccionario -- aprender <rasgo> <valor> <forma> --quien <persona|agente>");
  }
} else if (orden === "aprender") {
  const [rasgo, valorTexto, ...formaPartes] = sueltos;
  const forma = sinTildes(formaPartes.join(" ")).trim();
  const quien = opcion("quien", null);
  const valor = valorTexto === "true" ? true : valorTexto;
  if (!rasgo || valor == null || !forma || !quien) throw new Error("aprender <rasgo> <valor> <forma> --quien <persona|agente>");
  if (!entradas().some((e) => e.rasgo === rasgo && e.valor === valor)) throw new Error(`${rasgo}=${valor} no existe en el diccionario`);
  if (formasDe(rasgo, valor).some((f) => f.texto === forma)) { console.log(`«${forma}» ya es de ${rasgo}=${valor}.`); process.exit(0); }
  const j = JSON.parse(readFileSync(RUTA_APRENDIDOS, "utf8"));
  const { hoyISO } = await import("../src/lib/dias.js").catch(() => ({}));
  const fecha = typeof hoyISO === "function" ? hoyISO() : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  j.formas.push({ rasgo, valor, forma, quien, fecha });
  writeFileSync(RUTA_APRENDIDOS, `${JSON.stringify(j, null, 2)}\n`);
  console.log(`Apuntada «${forma}» → ${rasgo}=${valor}. Va en el siguiente PR.`);
} else {
  console.log("npm run diccionario -- buscar | huecos | proponer | aprender  (ver la cabecera de scripts/diccionario.mjs)");
}
