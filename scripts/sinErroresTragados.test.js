// Ningún `catch` de scripts/ ni de .claude/hooks/ se traga un error sin aviso.
//
// Problema de fondo #177 (encargo #182). El caso que lo destapó, #141: la
// limpieza de carpetas las dejaba a medias y solo avisaba si no iba en
// silencio, y al arrancar sesión va en silencio. Qué cuenta como «tragado» y
// qué lo salva (un `// a propósito: <porqué>` o un aviso) está en
// scripts/lib/erroresTragados.mjs.
//
// Los que ya existían están en TRAGADOS_CONOCIDOS, que SOLO PUEDE BAJAR, como
// la línea base del lint: uno nuevo hace fallar el test, y uno arreglado
// también, hasta que se quita de la lista (para que no quede hueco donde
// colarse otro). Se compara por fichero y por el texto de la línea del catch,
// no por el número de línea, que se mueve con cualquier edición.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { erroresTragados } from "./lib/erroresTragados.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const CARPETAS = ["scripts", ".claude/hooks"];

// Fichero → texto de la línea del catch (recortado), con su línea aproximada.
// Al arreglar uno, bórralo de aquí. No se añade nada: se arregla o se marca.
const TRAGADOS_CONOCIDOS = {
  "scripts/audit-catalog.mjs": [
    "} catch { /* la tabla aún no existe: no es un fallo del catálogo */ }", // ~l.712
    'try { return JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentoPorIngrediente.json"), "utf8', // ~l.811
    'try { return JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentoPorIngrediente.json"), "utf8', // ~l.878
  ],
  "scripts/build-alimentos.mjs": ["} catch {", "} catch {"], // ~l.103 y ~l.119
  "scripts/build-derived.mjs": ['try { previo = readFileSync(ruta, "utf8"); } catch { /* no existía */ }'], // ~l.359
  "scripts/enrich-recipe-steps.mjs": ["} catch {"], // ~l.216
  "scripts/gen-all-photos.mjs": ["const releaseLock = () => { try { unlinkSync(LOCK_FILE); } catch {} };"], // ~l.39
  "scripts/lib/env.mjs": ["} catch {"], // ~l.53
  "scripts/lib/mercadonaFetch.mjs": ["batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null)),"], // ~l.68
  "scripts/lib/permisoAplicar.mjs": ["} catch {", "} catch {", "} catch {"], // ~l.188, ~l.201 y ~l.206
  "scripts/mercadona-ingredient-map.mjs": ["batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null))"], // ~l.250
  "scripts/podar.mjs": ["} catch {"], // ~l.35
  "scripts/retirar.mjs": ["} catch {"], // ~l.28
  "scripts/run-seed.mjs": ['await c.query("rollback").catch(() => {});'], // ~l.108
  "scripts/tarea.mjs": ["} catch {"], // ~l.62
  "scripts/verificar-estado.mjs": ['await client.query("rollback").catch(() => {});', "} catch {"], // ~l.264 y ~l.283
};

function ficheros(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : ficheros(ruta);
    return /\.m?js$/.test(e.name) && !/\.test\.m?js$/.test(e.name) ? [ruta] : [];
  });
}

/** Lo que hay hoy: fichero → textos de los catch que se tragan el error. */
function tragadosHoy() {
  const hoy = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of ficheros(join(RAIZ, carpeta))) {
      const hallados = erroresTragados(readFileSync(ruta, "utf8"));
      if (hallados.length) hoy[relative(RAIZ, ruta).split("\\").join("/")] = hallados;
    }
  }
  return hoy;
}

/** a − b como multiconjuntos de textos. */
const resta = (a, b) => {
  const quedan = [...b];
  return a.filter((x) => {
    const i = quedan.indexOf(x);
    if (i === -1) return true;
    quedan.splice(i, 1);
    return false;
  });
};

describe("scripts y hooks: ningún error tragado sin aviso (#177)", () => {
  const hoy = tragadosHoy();

  it("no hay ninguno nuevo fuera de la lista", () => {
    const nuevos = Object.entries(hoy).flatMap(([f, hallados]) => {
      const textos = resta(hallados.map((h) => h.texto), TRAGADOS_CONOCIDOS[f] ?? []);
      return hallados.filter((h) => textos.includes(h.texto)).map((h) => `${f}:${h.linea}  ${h.texto}`);
    });
    expect(
      nuevos,
      "Un catch que se traga el error sin aviso. Avisa (console.warn/console.error), " +
        "relanza, o si callarlo es lo correcto escribe en el bloque `// a propósito: <porqué>`. " +
        "La lista TRAGADOS_CONOCIDOS no crece.",
    ).toEqual([]);
  });

  it("la lista solo baja: lo arreglado se quita de ella", () => {
    const sobran = Object.entries(TRAGADOS_CONOCIDOS).flatMap(([f, textos]) =>
      resta(textos, (hoy[f] ?? []).map((h) => h.texto)).map((t) => `${f}  ${t}`),
    );
    expect(sobran, "Ya no están en el código: bórralos de TRAGADOS_CONOCIDOS.").toEqual([]);
  });

  it("los hooks no tienen ninguno en la lista: los que callan, callan a propósito y lo dicen", () => {
    expect(Object.keys(TRAGADOS_CONOCIDOS).filter((f) => f.startsWith(".claude/"))).toEqual([]);
  });
});

describe("erroresTragados: qué cuenta como tragado", () => {
  const n = (src) => erroresTragados(src).length;

  it("catch vacío", () => expect(n("try { f() } catch {}")).toBe(1));
  it("catch que solo devuelve un valor por defecto", () => {
    expect(n("try { return f() } catch { return null }")).toBe(1);
    expect(n("try { return f() } catch (e) { return { ok: false } }")).toBe(1);
    expect(n("try { return f() } catch { return }")).toBe(1);
  });
  it("catch que solo asigna un valor por defecto", () => expect(n("try { x = f() } catch (e) { x = [] }")).toBe(1));
  it("catch con solo un comentario que no es «a propósito»", () => expect(n("try { f() } catch {\n  // nada\n}")).toBe(1));
  it("promesa con .catch que se lo traga", () => {
    expect(n("p.catch(() => {})")).toBe(1);
    expect(n("p.catch(() => null)")).toBe(1);
    expect(n("p.catch((e) => { return [] })")).toBe(1);
  });

  it("no, si lleva `a propósito:` con su porqué", () => {
    expect(n("try { f() } catch {\n  // a propósito: sin red se sigue\n  return null\n}")).toBe(0);
    expect(n("try { f() } catch {} // fuera del bloque: a propósito: no cuenta")).toBe(1);
    expect(n("try { f() } catch { /* a propósito: */ }")).toBe(1); // sin porqué no vale
  });
  it("no, si avisa", () => {
    expect(n("try { f() } catch (e) { console.warn(e.message); return null }")).toBe(0);
    expect(n("try { f() } catch { console.error('x') }")).toBe(0);
    expect(n("try { f() } catch { avisos.push('no pude') }")).toBe(0);
    expect(n("p.catch(console.error)")).toBe(0);
  });
  it("no, si usa el error o hace algo más", () => {
    expect(n("try { f() } catch (e) { throw e }")).toBe(0);
    expect(n("try { f() } catch (e) { return e.message }")).toBe(0);
    expect(n("try { f() } catch { fallidas += 1; registra() }")).toBe(0);
    expect(n("try { f() } catch { rmSync(x) }")).toBe(0);
  });
  it("no confunde un catch escrito en un comentario o una cadena", () => {
    expect(n("// try {} catch {}\nconst s = 'catch {}'\n")).toBe(0);
  });
  it("da la línea del catch", () => expect(erroresTragados("a()\nb()\ntry { f() } catch {}")[0].linea).toBe(3));
});
