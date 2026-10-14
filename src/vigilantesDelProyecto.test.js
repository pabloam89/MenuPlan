import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit } from "../ops/ficherosGit.js";
import { clasificar, compilar, leerZonas } from "../scripts/lib/zonasProyecto.mjs";
import { elegir, indiceDeTests, leerVigilantes } from "../scripts/lib/vecinos.mjs";

/**
 * La parte de ops/vigilantes.test.js que nombra ficheros de HoMenu y vive aquí porque un test de la casa no los
 * nombra (#710, PR 6): los grupos de vigilantes cuyos tests son todos del proyecto (zona «producto» de
 * ops/zonas.json), con una o dos rutas de ejemplo cada uno -> el test que debe salir. Los de la casa, allí.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerVigilantes(RAIZ);
const FICHEROS = ficherosDeGit(RAIZ);
const indice = indiceDeTests(RAIZ, FICHEROS);
const zonas = compilar(leerZonas(RAIZ));
const delProyecto = (v) => v.tests.length > 0 && v.tests.every((t) => clasificar(t, zonas).zona === "producto");
const testsDe = (tocados) => elegir({ tocados, datos, indice }).tests.map((t) => t.test);
const A = (ruta) => ({ ruta, estado: "A" });
const M = (ruta) => ({ ruta, estado: "M" });

const TABLA = [
  ["derivados-registrados", "src/design/tokens.css", "ops/derivados.test.js"],
  ["derivados-registrados", "scripts/lib/derivados.mjs", "ops/derivados.test.js"],
  ["errores-tragados-scripts", "scripts/lib/x.mjs", "scripts/sinErroresTragados.test.js"],
  ["errores-tragados-scripts", ".claude/hooks/x.mjs", "scripts/sinErroresTragados.test.js"],
  ["errores-tragados-bot", "api/bot/x.js", "api/_bot/sinErroresTragados.test.js"],
  ["api-sin-credencial", "api/x.js", "api/sinCredencial.test.js"],
  ["api-sin-credencial", "ops/api-sin-credencial.json", "api/sinCredencial.test.js"],
  ["fuentes-y-modulos", "src/lib/x.js", "ops/modulos.test.js"],
  ["fuentes-y-modulos", "scripts/lib/x.mjs", "ops/fuentes.test.js"],
  ["cableado", "api/_bot/x.js", "supabase/cableado.test.js"],
  ["migraciones-sql", "supabase/migrations/9999_x.sql", "supabase/principios.test.js"],
  ["migraciones-sql", "ops/columnas-texto.json", "supabase/columnasTexto.test.js"],
  ["catalogo-de-recetas", "src/data/recipes/x.json", "src/data/model.test.js"],
  ["fuentes-sin-invisibles", "src/lib/x.js", "src/data/fuentesLimpias.test.js"],
  ["app-y-bot", "src/components/x.jsx", "src/components/coachAnchors.test.js"],
  ["zonas-del-catalogo", "src/utils/x.js", "src/lib/barreras.test.js"],
  ["cargadores-de-lib", "src/lib/x.js", "src/lib/cargadoresSinVacioEnError.test.js"],
  ["bot-sin-listas-a-mano", "api/_bot/x.js", "src/lib/comidas.test.js"],
  ["endpoints", "api/x.js", "api/_guard.test.js"],
  ["una-escala-y-una-escalera", "ops/flujo.json", "ops/escalas.test.js"],
];

describe("tabla del proyecto: ruta de ejemplo → vigilante que debe salir", () => {
  it("todos los grupos del proyecto tienen al menos una fila", () => {
    expect(datos.vigilantes.filter(delProyecto).map((v) => v.id).filter((id) => !TABLA.some((f) => f[0] === id))).toEqual([]);
  });
  it("ninguna fila es de un grupo de la casa: esas filas viven en ops/vigilantes.test.js", () => {
    const delProy = new Set(datos.vigilantes.filter(delProyecto).map((v) => v.id));
    expect(TABLA.filter((f) => !delProy.has(f[0])).map((f) => f[0])).toEqual([]);
  });
  it.each(TABLA)("%s · %s → %s", (grupo, ruta, esperado) => {
    expect(datos.vigilantes.find((v) => v.id === grupo).tests, "la fila apunta a un test que no es de su grupo").toContain(esperado);
    const plan = elegir({ tocados: [A(ruta)], datos, indice: new Map([...indice, [esperado, indice.get(esperado) ?? { texto: "", imports: new Set() }]]) });
    expect(plan.tests.map((t) => t.test)).toContain(esperado);
  });
});

describe("`npm run vecinos` en los ficheros del proyecto", () => {
  it("una migración nueva se mide contra todas; una receta, contra el catálogo", () => {
    expect(testsDe([A("supabase/migrations/9999_prueba.sql")])).toEqual(expect.arrayContaining(["supabase/migrations.test.js", "supabase/principios.test.js"]));
    expect(testsDe([M("src/data/recipes/cualquiera.json")])).toContain("src/data/model.test.js");
  });
});
