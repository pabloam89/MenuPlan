/**
 * Una columna que una migración quitó no se vuelve a escribir (#958; el C5
 * del revisor en #965). #965 volvió a poner `descripcion` en el insert de
 * bot_deshacer (casa.js), que la 0085 había quitado: en la base, cada foto
 * de «Deshacer» fallaba al apuntarse y solo dejaba un console.error.
 *
 * De las migraciones salen las columnas quitadas (y no vueltas a añadir);
 * ningún fichero de api/ que nombre esa tabla puede usarla como clave.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const raiz = new URL("../../", import.meta.url);
const leer = (f) => readFileSync(new URL(f, raiz), "utf8");

/** Las «tabla.columna» que quedan quitadas tras aplicar las migraciones en orden. */
function columnasQuitadas(migraciones) {
  const quitada = new Map();
  for (const sql of migraciones) {
    const limpio = sql.replace(/--.*$/gm, "");
    for (const m of limpio.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      for (const c of m[2].matchAll(/(add|drop)\s+column\s+(?:if\s+(?:not\s+)?exists\s+)?(\w+)/gi)) {
        quitada.set(`${m[1]}.${c[2]}`, c[1].toLowerCase() === "drop");
      }
    }
  }
  return [...quitada].filter(([, si]) => si).map(([k]) => k).sort();
}

/** Los ficheros de código de api/ (sin tests), con su texto. */
function codigoDeApi(dir = "api/") {
  return readdirSync(new URL(dir, raiz), { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === "node_modules" ? [] : codigoDeApi(`${dir}${e.name}/`);
    return /\.m?js$/.test(e.name) && !/\.test\.m?js$/.test(e.name) ? [{ f: `${dir}${e.name}`, texto: leer(`${dir}${e.name}`) }] : [];
  });
}

/** Dónde se escribe una columna quitada: un fichero que nombra la tabla y usa la columna como clave. */
function escriturasDeQuitadas(quitadas, ficheros) {
  return quitadas.flatMap((tc) => {
    const [tabla, columna] = tc.split(".");
    const clave = new RegExp("[{,\\s]" + columna + "\\s*:");
    return ficheros.filter(({ texto }) => texto.includes(`"${tabla}"`) && clave.test(texto)).map(({ f }) => `${f}: ${tc}`);
  });
}

const migraciones = readdirSync(new URL("supabase/migrations/", raiz)).filter((n) => n.endsWith(".sql")).sort()
  .map((n) => leer(`supabase/migrations/${n}`));

describe("una columna quitada no se vuelve a escribir (#958)", () => {
  it("las migraciones dicen cuáles están quitadas (y una vuelta a añadir no cuenta)", () => {
    expect(columnasQuitadas(migraciones)).toEqual(expect.arrayContaining(["bot_deshacer.descripcion"]));
    expect(columnasQuitadas(["alter table public.t drop column if exists a;", "alter table t\n  add column if not exists a text;"])).toEqual([]);
  });

  it("ningún fichero de api/ escribe una columna quitada", () => {
    expect(escriturasDeQuitadas(columnasQuitadas(migraciones), codigoDeApi())).toEqual([]);
  });

  it("y lo vería: el insert de bot_deshacer con `descripcion`, como lo dejó #965", () => {
    const malo = { f: "api/_bot/casa.js", texto: 'insert("bot_deshacer", [{ household_id: h, descripcion: op?.herramienta ?? null }])' };
    expect(escriturasDeQuitadas(["bot_deshacer.descripcion"], [malo])).toEqual(["api/_bot/casa.js: bot_deshacer.descripcion"]);
  });
});
