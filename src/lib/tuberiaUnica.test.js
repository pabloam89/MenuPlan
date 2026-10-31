// Test de clase de la tubería única (plan fichas con estado, trozo 26; arquitectura
// objetivo, [3] y D3): una ficha solo se escribe desde src/lib/operaciones/. Fuera de
// ahí, en el código de la app, de Lola y de los scripts, ni una llamada a una función
// de la base que escribe fichas ni un insert, update o borrado en sus tablas. Qué
// funciones escriben fichas no se dice a mano: sale de las migraciones (las que
// escriben sus tablas o llaman a otra que lo hace), y tiene que cuadrar con una lista
// cerrada que dice de cada una si es de la tubería o heredada, y quién la retira.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..");
const TUBERIA = join("src", "lib", "operaciones") + sep;
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

/** Las tablas de ficha: sobre, operacion y el registro (0097, 0105), persona y salud (0079), grupo. */
const TABLAS_DE_FICHA = [
  "sobre", "operacion", "registro_campo",
  "persona", "persona_alergia", "persona_intolerancia", "persona_estado", "persona_perfil_salud",
  "grupo", "grupo_persona",
];
/** Las funciones de la base que escriben fichas. Lista cerrada: una nueva no entra sin decir aquí qué es. */
const ESCRIBEN_FICHAS = {
  aplicar_operacion: "tubería (0106)",
  escribir_dato: "tubería (0106; llama a aplicar_operacion)",
  deshacer_operacion: "tubería (0111): deshace una operación con su inversa",
  persona_sincronizar_casa: "heredada (0081-0082): la retira la 0108, trozo 10",
  persona_reemplazar_casa: "heredada (0079; delega en persona_sincronizar_casa): la retira la 0108, trozo 10",
  _personas_al_guardar: "heredada: disparador de household_state (0089) que copia members a persona_*; lo retira la 0108, trozo 10",
};
/** Quién llama hoy a una heredada desde el código, y quién lo quita. Lista cerrada. */
const LLAMADAS_HEREDADAS = { [join("scripts", "backfill-personas.mjs")]: "persona_reemplazar_casa" };

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

const SQL = readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(MIGRACIONES, f), "utf8"));
// Cada función de cada migración con su cuerpo (entre sus $$), en todas sus versiones.
const FUNCIONES = SQL.flatMap((texto) => [...texto.matchAll(
  /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2/gi,
)].map((m) => ({ nombre: m[1], cuerpo: m[3] })));

const lista = (nombres) => nombres.join("|");
const ESCRIBE_TABLA = new RegExp(`\\b(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?(${lista(TABLAS_DE_FICHA)})\\b`, "i");

/** Las que escriben una tabla de ficha, más las que llaman a una de ellas, hasta que no salen más. */
function escritorasDeFichas() {
  const son = new Set(FUNCIONES.filter((f) => ESCRIBE_TABLA.test(f.cuerpo)).map((f) => f.nombre));
  for (let crece = true; crece;) {
    crece = false;
    for (const f of FUNCIONES) {
      if (!son.has(f.nombre) && [...son].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(f.cuerpo))) {
        son.add(f.nombre);
        crece = true;
      }
    }
  }
  return son;
}

const literal = (nombres) => new RegExp(`["'\`](${lista(nombres)})["'\`]`, "g");
// db.js (insert, update, borrar) y supabase-js (.from(t).insert/update/upsert/delete).
const ESCRITURA_EN_FICHA = new RegExp(
  `\\b(insert|update|borrar)\\(\\s*["'\`](${lista(TABLAS_DE_FICHA)})["'\`]`
  + `|\\.from\\(\\s*["'\`](${lista(TABLAS_DE_FICHA)})["'\`]\\s*\\)\\s*\\.(insert|update|upsert|delete)\\b`,
);

describe("tubería única: una ficha solo se escribe desde src/lib/operaciones/", () => {
  it("el recorrido ve el código y las funciones de la base (si no, lo de abajo no mide nada)", () => {
    expect(FUERA.length).toBeGreaterThan(100);
    expect(CODIGO.some((f) => f.ruta.startsWith(TUBERIA))).toBe(true);
    expect(FUNCIONES.length).toBeGreaterThan(20);
  });

  it("las funciones de la base que escriben fichas son las de ESCRIBEN_FICHAS", () => {
    expect([...escritorasDeFichas()].sort()).toEqual(Object.keys(ESCRIBEN_FICHAS).sort());
  });

  it("nadie fuera de la tubería llama a una función que escribe fichas, salvo las llamadas heredadas", () => {
    const llamadas = FUERA.flatMap((f) => [...f.texto.matchAll(literal(Object.keys(ESCRIBEN_FICHAS)))]
      .map((m) => ({ ruta: f.ruta, funcion: m[1] })))
      .filter((l) => LLAMADAS_HEREDADAS[l.ruta] !== l.funcion);
    expect(llamadas).toEqual([]);
  });

  it("cada llamada heredada sigue ahí y es a una heredada (la lista no se queda vieja)", () => {
    for (const [ruta, funcion] of Object.entries(LLAMADAS_HEREDADAS)) {
      expect(ESCRIBEN_FICHAS[funcion], funcion).toMatch(/^heredada/);
      expect(FUERA.find((f) => f.ruta === ruta)?.texto, ruta).toMatch(literal([funcion]));
    }
  });

  it("nadie fuera de la tubería hace insert, update ni borra en una tabla de ficha", () => {
    expect(FUERA.filter((f) => ESCRITURA_EN_FICHA.test(f.texto)).map((f) => f.ruta)).toEqual([]);
  });

  it("la tubería sí llama a aplicar_operacion (la regla mira donde debe)", () => {
    const dentro = CODIGO.filter((f) => f.ruta.startsWith(TUBERIA) && literal(["aplicar_operacion"]).test(f.texto));
    expect(dentro.length).toBeGreaterThan(0);
  });
});

it("cada tabla de ficha existe en alguna migración (un nombre mal escrito no vigila nada)", () => {
  const todas = SQL.join("\n");
  for (const t of TABLAS_DE_FICHA) expect(todas, t).toMatch(new RegExp(`create table (if not exists )?public\\.${t}\\b`));
});
