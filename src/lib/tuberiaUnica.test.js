// Test de clase de la tubería única (plan fichas con estado, trozo 26; arquitectura
// objetivo, [3] y D3): una ficha solo se escribe desde src/lib/operaciones/. Fuera de
// ahí, en el código de la app, de Lola y de los scripts, ni una llamada a las RPC que
// escriben fichas ni un insert, update o borrado en sus tablas. Y las RPC que crean
// las migraciones del plan son una lista cerrada: una nueva no entra sin decir aquí
// qué es y, si escribe, sin quedar dentro de la tubería.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..");
const TUBERIA = join("src", "lib", "operaciones") + sep;
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

/** Las RPC que crean las migraciones del plan (0105 en adelante), y si escriben fichas. Lista cerrada. */
const RPC_DEL_PLAN = { aplicar_operacion: "escribe", escribir_dato: "escribe", ficha_casa: "lee" };
const PRIMERA_DEL_PLAN = 105;
/** Las tablas de ficha: sobre, operacion y el registro (0097, 0105), persona y salud (0079, 0089), grupo. */
const TABLAS_DE_FICHA = [
  "sobre", "operacion", "registro_campo",
  "persona", "persona_alergia", "persona_intolerancia", "persona_estado", "persona_perfil_salud",
  "grupo", "grupo_persona",
];

function ficheros(dir) {
  return readdirSync(dir).flatMap((f) => {
    const ruta = join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) return [];
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.(m?js|jsx)$/.test(f) && !/\.test\.(m?js|jsx)$/.test(f) ? [ruta] : [];
  });
}
// Sin comentarios: los que explican la tubería nombran sus RPC y no son llamadas.
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const CODIGO = ["src", "api", "scripts"].flatMap((d) => ficheros(join(RAIZ, d)))
  .map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: sinComentarios(readFileSync(ruta, "utf8")) }));
const FUERA = CODIGO.filter((f) => !f.ruta.startsWith(TUBERIA));

const lista = (nombres) => nombres.join("|");
const ESCRIBEN = Object.keys(RPC_DEL_PLAN).filter((n) => RPC_DEL_PLAN[n] === "escribe");
const RPC_QUE_ESCRIBE = new RegExp(`["'\`](${lista(ESCRIBEN)})["'\`]`);
// db.js (insert, update, borrar) y supabase-js (.from(t).insert/update/upsert/delete).
const ESCRITURA_EN_FICHA = new RegExp(
  `\\b(insert|update|borrar)\\(\\s*["'\`](${lista(TABLAS_DE_FICHA)})["'\`]`
  + `|\\.from\\(\\s*["'\`](${lista(TABLAS_DE_FICHA)})["'\`]\\s*\\)\\s*\\.(insert|update|upsert|delete)\\b`,
);

describe("tubería única: una ficha solo se escribe desde src/lib/operaciones/", () => {
  it("el recorrido ve el código (si no, lo de abajo no mide nada)", () => {
    expect(FUERA.length).toBeGreaterThan(100);
    expect(CODIGO.some((f) => f.ruta.startsWith(TUBERIA))).toBe(true);
  });

  it("nadie fuera de la tubería llama a una RPC que escribe fichas", () => {
    expect(FUERA.filter((f) => RPC_QUE_ESCRIBE.test(f.texto)).map((f) => f.ruta)).toEqual([]);
  });

  it("nadie fuera de la tubería hace insert, update ni borra en una tabla de ficha", () => {
    expect(FUERA.filter((f) => ESCRITURA_EN_FICHA.test(f.texto)).map((f) => f.ruta)).toEqual([]);
  });

  it("la tubería sí llama a aplicar_operacion (la regla mira donde debe)", () => {
    const dentro = CODIGO.filter((f) => f.ruta.startsWith(TUBERIA) && RPC_QUE_ESCRIBE.test(f.texto));
    expect(dentro.length).toBeGreaterThan(0);
  });
});

describe("las RPC y las tablas del plan, en lista cerrada", () => {
  const sql = readdirSync(MIGRACIONES).filter((f) => /^\d{4}_.*\.sql$/.test(f));
  const texto = (f) => readFileSync(join(MIGRACIONES, f), "utf8");

  it("las RPC que crean las migraciones del plan son las de RPC_DEL_PLAN", () => {
    const creadas = new Set(sql.filter((f) => Number(f.slice(0, 4)) >= PRIMERA_DEL_PLAN)
      .flatMap((f) => [...texto(f).matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map((m) => m[1])));
    expect([...creadas].sort()).toEqual(Object.keys(RPC_DEL_PLAN).sort());
  });

  it("cada tabla de ficha existe en alguna migración (un nombre mal escrito no vigila nada)", () => {
    const todas = sql.map(texto).join("\n");
    for (const t of TABLAS_DE_FICHA) expect(todas, t).toMatch(new RegExp(`create table (if not exists )?public\\.${t}\\b`));
  });
});
