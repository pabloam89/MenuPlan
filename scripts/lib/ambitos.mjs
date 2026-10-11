/**
 * El vocabulario único de ámbitos (#619): de qué parte del trabajo es un principio (`area` de
 * ops/principios/) y una norma (`ambito` de ops/normas.json). Un solo vocabulario para los dos
 * campos, con una definición por valor; los valores, en inglés (N0, «Idioma de los nombres»).
 * Se ancla en ops/vocabularios-vida.json como `ambitos`. Sin dependencias: lo importan
 * normas.mjs (que está en el grafo de un hook) y principios.mjs.
 */
export const AMBITOS = {
  code: { legible: "código", que: "El código del repo y su forma: tests, lint y ficheros" },
  infra: { legible: "infraestructura", que: "Identidades, permisos, secretos, ramas, CI, despliegues, copias y servicios" },
  data: { legible: "datos", que: "La base: tablas, migraciones, roles y cada dato que guarda" },
  catalog: { legible: "catálogo", que: "El catálogo de recetas y alimentos que vive en git" },
  bot: { legible: "bot", que: "Lola, el bot de mensajería, sus evals y su coste" },
  api: { legible: "api", que: "Las funciones de api/ y lo que protegen" },
  ui: { legible: "pantallas", que: "Las pantallas de la app" },
  product: { legible: "producto", que: "Qué hace bien HoMenu y Lola para las familias" },
  process: { legible: "proceso", que: "Cómo se trabaja: issues, fondos, PR, sesiones, agentes, jueces y cifras" },
  writing: { legible: "redacción", que: "Cómo se escribe una regla o un principio de la casa" },
  entities: { legible: "entidades", que: "Cómo se nombra, se identifica y se registra cada cosa del proyecto" },
};

