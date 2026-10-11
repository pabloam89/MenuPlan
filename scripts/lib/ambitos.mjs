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
    rutas: [/\.(m?js|cjs|jsx|ts|tsx|py|html)$/, /^(package(-lock)?|lint-base|lint-tokens-base)\.json$/, /^eslint-rules\//, /^scripts\/fixtures\//],
  },
  infra: {
    legible: "infraestructura",
    que: "Identidades, permisos, secretos, ramas, CI, despliegues, copias y servicios",
    rutas: [
      /^\.github\/(?!ISSUE_TEMPLATE\/)/, /^\.claude\/hooks\//, /^\.claude\/settings/, /^(vercel\.json|\.vercelignore|\.gitattributes|\.gitignore|\.env\.example)$/,
      /^ops\/(INVENTARIO\.md|recursos\.json|planos\.json|PLANOS\.md|env\.1password|copias\/)/,
      /^scripts\/(tarea|retirar|podar|rulesets|token-sesiones?|llavero-op|boveda-sesiones|dependabot-auto|limpiar-worktrees|copias-[\w-]+)\.mjs$/,
    ],
  },
  data: {
    legible: "datos",
    que: "La base: tablas, migraciones, roles y cada dato que guarda",
    rutas: [/^supabase\//, /^docs\/datos\//, /^scripts\/(apply-migration|verificar-estado|consulta|bot-cron|clave-[\w-]+)\.mjs$/, /^src\/data\/model\.js$/, /^HOUSEHOLDS\.md$/],
  },
  catalog: {
    legible: "catálogo",
    que: "El catálogo de recetas y alimentos que vive en git",
    rutas: [/^src\/data\//, /^src\/utils\//, /^src\/lib\//, /^api\/_bot\//, /^src\/assets\/dishes\//, /^scripts\/[^/]*catalog/, /^scripts\/(bedca|ciqual)/, /^scripts\/(validate-catalog|mercadona-[\w-]+|build-derived)\.mjs$/],
  },
  bot: {
    legible: "bot",
    que: "Lola, el bot de mensajería, sus evals y su coste",
    rutas: [/^api\/_bot\//, /^api\/bot\//, /^scripts\/(bot|router|telegram)-[\w-]+\.(mjs|json)$/, /^\.claude\/rules\/lola\.md$/],
  },
  api: {
    legible: "api",
    que: "Las funciones de api/ y lo que protegen",
    rutas: [/^api\/(?!_bot\/|bot\/)/, /^ops\/api-sin-credencial\.json$/, /^\.claude\/rules\/api\.md$/],
  },
  ui: {
    legible: "pantallas",
    que: "Las pantallas de la app",
    rutas: [/^src\/.*\.(jsx|css)$/, /^src\/(design|components|screens|assets|dev)\//, /^public\//, /^Avatares\//, /^brand\//, /^dish-gallery\//, /^scripts\/(make_|mj-prompts-)/, /^docs\/medios\.md$/, /^(DESIGN_SYSTEM|ILUSTRACIONES-PASOS)\.md$/, /^docs\/diseno\//, /^\.claude\/rules\/ui\.md$/],
  },
  product: {
    legible: "producto",
    que: "Qué hace bien HoMenu y Lola para las familias",
    rutas: [/^ops\/principios-producto\//, /^docs\/producto\//, /^specs\//, /^README\.md$/],
  },
  process: {
    legible: "proceso",
    que: "Cómo se trabaja: issues, fondos, PR, sesiones, agentes, jueces y cifras",
    rutas: [/^\.claude\/(?!hooks\/|settings)/, /^CLAUDE\.md$/, /^ops\//, /^docs\/ops\//, /^\.github\/ISSUE_TEMPLATE\//, /^docs\/PRINCIPIOS\.md$/],
  },
  writing: {
    legible: "redacción",
    que: "Cómo se escribe una regla o un principio de la casa",
    rutas: [/^ops\/redaccion(-pendientes)?\.json$/, /^docs\/ops\/REDACCION\.md$/, /^ops\/glosario(-excepciones)?\//, /^scripts\/lib\/regla\.mjs$/],
  },
  entities: {
    legible: "entidades",
    que: "Cómo se nombra, se identifica y se registra cada cosa del proyecto",
    rutas: [/^ops\/entidades(-sujetos)?\.json$/, /^docs\/entidades\//],
  },
};

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
