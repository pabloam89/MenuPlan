/**
 * El vocabulario único de ámbitos (#619): de qué parte del trabajo es un principio (`area` de
 * ops/principios/) y una norma (`ambito` de ops/normas.json). Un solo vocabulario para los dos
 * campos, con una definición por valor; los valores, en inglés (N0, «Idioma de los nombres»).
 * Se ancla en ops/vocabularios-vida.json como `ambitos`. Sin dependencias: lo importan
 * normas.mjs (que está en el grafo de un hook) y principios.mjs.
 *
 * `rutas` (#620) es el mapa fichero → ámbito, con UNA fuente: aquí, junto a la definición de cada
 * ámbito. Lo usa `npm run estandar -- <agente> <tarea> --ficheros …` para sumar a las normas de una
 * tarea las del ámbito de cada fichero tocado. No se reutilizó ops/MODULOS.json (mapa de módulos del
 * producto: app, lola o compartido; no cubre ops/, .github/ ni .claude/) ni .claude/dominios-skills.json
 * (rutas que piden la línea «Runbook:» de una skill; no cubre el código ni las pantallas). Un fichero
 * puede ser de varios ámbitos (un hook es código e infraestructura); ops/uniones.test.js comprueba que
 * cada fichero del repo cae en alguno.
 */
export const AMBITOS = {
  code: {
    legible: "código",
    que: "El código del repo y su forma: tests, lint y ficheros",
    jueces: [],
    construye: "gobierno",
    rutas: [/\.(m?js|cjs|jsx|ts|tsx|py|html)$/, /^(package(-lock)?|lint-base|lint-tokens-base)\.json$/, /^eslint-rules\//, /^scripts\/fixtures\//],
  },
  infra: {
    legible: "infraestructura",
    que: "Identidades, permisos, secretos, ramas, CI, despliegues, copias y servicios",
    jueces: [],
    construye: "gobierno",
    rutas: [
      /^\.github\/(?!ISSUE_TEMPLATE\/)/, /^\.claude\/hooks\//, /^\.claude\/settings/, /^(vercel\.json|\.vercelignore|\.gitattributes|\.gitignore|\.env\.example)$/,
      /^ops\/(INVENTARIO\.md|recursos\.json|planos\.json|PLANOS\.md|env\.1password|copias\/)/,
      /^scripts\/(tarea|retirar|podar|rulesets|token-sesiones?|llavero-op|boveda-sesiones|dependabot-auto|limpiar-worktrees|copias-[\w-]+)\.mjs$/,
    ],
  },
  data: {
    legible: "datos",
    que: "La base: tablas, migraciones, roles y cada dato que guarda",
    jueces: [{ juez: "auditor-datos", fuente: "norma:aplicar-migracion-con-permiso" }],
    construye: "datos",
    rutas: [/^supabase\//, /^docs\/datos\//, /^scripts\/(apply-migration|verificar-estado|consulta|bot-cron|clave-[\w-]+)\.mjs$/, /^src\/data\/model\.js$/, /^HOUSEHOLDS\.md$/],
  },
  catalog: {
    legible: "catálogo",
    que: "El catálogo de recetas y alimentos que vive en git",
    jueces: [{ juez: "auditor-datos", fuente: "agente:auditor-datos" }],
    construye: null,
    rutas: [/^src\/data\//, /^src\/utils\//, /^src\/lib\//, /^api\/_bot\//, /^src\/assets\/dishes\//, /^scripts\/[^/]*catalog/, /^scripts\/(bedca|ciqual)/, /^scripts\/(validate-catalog|mercadona-[\w-]+|build-derived)\.mjs$/],
  },
  bot: {
    legible: "bot",
    que: "Lola, el bot de mensajería, sus evals y su coste",
    jueces: [{ juez: "evaluador", fuente: "norma:evals-antes-de-fusionar" }],
    construye: "lola",
    rutas: [/^api\/_bot\//, /^api\/bot\//, /^scripts\/(bot|router|telegram)-[\w-]+\.(mjs|json)$/, /^\.claude\/rules\/lola\.md$/],
  },
  api: {
    legible: "api",
    que: "Las funciones de api/ y lo que protegen",
    jueces: [{ juez: "seguridad", fuente: "norma:endpoint-nuevo-juez-seguridad" }],
    construye: null,
    rutas: [/^api\/(?!_bot\/|bot\/)/, /^ops\/api-sin-credencial\.json$/, /^\.claude\/rules\/api\.md$/],
  },
  ui: {
    legible: "pantallas",
    que: "Las pantallas de la app",
    jueces: [{ juez: "qa", fuente: "agente:qa" }],
    construye: "diseno",
    rutas: [/^src\/.*\.(jsx|css)$/, /^src\/(design|components|screens|assets|dev)\//, /^public\//, /^Avatares\//, /^brand\//, /^dish-gallery\//, /^scripts\/(make_|mj-prompts-)/, /^docs\/medios\.md$/, /^(DESIGN_SYSTEM|ILUSTRACIONES-PASOS)\.md$/, /^docs\/diseno\//, /^\.claude\/rules\/ui\.md$/],
  },
  diseno: {
    legible: "diseño",
    que: "El sistema de diseño: tokens, primitivos, accesibilidad, estados y voz de la interfaz",
    jueces: [{ juez: "qa", fuente: "agente:qa" }],
    construye: "diseno",
    rutas: [/^docs\/diseno\//, /^ops\/diseno\//, /^src\/design\//, /^DESIGN_SYSTEM\.md$/],
  },
  product: {
    legible: "producto",
    que: "Qué hace bien HoMenu y Lola para las familias",
    jueces: [],
    construye: null,
    rutas: [/^ops\/principios-producto\//, /^docs\/producto\//, /^specs\//, /^README\.md$/],
  },
  process: {
    legible: "proceso",
    que: "Cómo se trabaja: issues, fondos, PR, sesiones, agentes, jueces y cifras",
    jueces: [],
    construye: "gobierno",
    rutas: [/^\.claude\/(?!hooks\/|settings)/, /^CLAUDE\.md$/, /^ops\//, /^docs\/ops\//, /^\.github\/ISSUE_TEMPLATE\//, /^docs\/PRINCIPIOS\.md$/],
  },
  writing: {
    legible: "redacción",
    que: "Cómo se escribe una regla o un principio de la casa",
    jueces: [],
    construye: "gobierno",
    rutas: [/^ops\/redaccion(-pendientes)?\.json$/, /^docs\/ops\/REDACCION\.md$/, /^ops\/glosario(-excepciones)?\//, /^scripts\/lib\/regla\.mjs$/],
  },
  entities: {
    legible: "entidades",
    que: "Cómo se nombra, se identifica y se registra cada cosa del proyecto",
    jueces: [],
    construye: null,
    rutas: [/^ops\/entidades(-sujetos)?\.json$/, /^docs\/entidades\//],
  },
};

/**
 * Quién construye en cada ámbito: `construye` de AMBITOS (un agente de .claude/agents/ o null si ninguno es dueño: entonces
 * construye la sesión y el dimensionador lo avisa). Un fichero con varios ámbitos lo construye el primero de DUENO_ORDEN
 * (sea cual sea su constructor), el más específico antes que el genérico (api/_bot/ es del bot antes que del catálogo); `code` solo decide
 * cuando el fichero no es de ningún otro ámbito (un script suelto de scripts/). Es la única copia de zona → constructor (#641).
 */
export const DUENO_ORDEN = ["bot", "ui", "diseno", "data", "infra", "catalog", "api", "product", "writing", "entities", "process", "code"];

/** El constructor de un fichero por sus ámbitos: { agente, ambito }, con `agente: null` si el ámbito dueño no tiene constructor. null si no cae en ningún ámbito. */
export function constructorDeFichero(ruta) {
  const ids = ambitosDeFichero(ruta);
  const dueno = DUENO_ORDEN.find((id) => ids.includes(id));
  return dueno ? { agente: AMBITOS[dueno].construye, ambito: dueno } : null;
}

/**
 * Los jueces de zona (#646): lo que el dimensionador de #641 calculará desde los ficheros, como dato hasta entonces. Un subtipo
 * de encargo describe el trabajo y no la zona, así que el juez que pide la zona no va en él: sale de aquí. `fuente` dice de dónde
 * sale cada juez: `norma:<id>` (una norma de ops/normas.json de ese ámbito que lo pide) o `agente:<nombre>` (su cabecera y sus
 * tareas en .claude/agents y ops/estandares-agentes.json). El revisor entra siempre, en cualquier zona.
 */
export const JUEZ_SIEMPRE = "revisor";

/** Los jueces que se suman al revisor por los ámbitos dados (ids de AMBITOS), sin repetir y en orden de aparición. */
export const juecesDeAmbitos = (ids) => [...new Set([JUEZ_SIEMPRE, ...ids.flatMap((id) => (AMBITOS[id]?.jueces ?? []).map((j) => j.juez))])];

/**
 * Qué ámbito toca cada regla por carpeta de `.claude/rules/` (#620): todo fichero que casa con los `paths:` de
 * una regla es de su ámbito. Así el mapa de arriba y las reglas no se separan; lo vigila ops/uniones.test.js.
 */
export const AMBITO_DE_REGLA = { api: "api", catalogo: "catalog", lola: "bot", migraciones: "data", tests: "code", ui: "ui" };

/** Los ámbitos de un fichero del repo (ruta relativa, con «/»), en el orden de AMBITOS; lista vacía si no cae en ninguno. */
export function ambitosDeFichero(ruta) {
  const r = String(ruta).replace(/\\/g, "/").replace(/^\.\//, "");
  return Object.entries(AMBITOS).filter(([, a]) => a.rutas.some((re) => re.test(r))).map(([id]) => id);
}
