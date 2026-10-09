// Ningún manejador de error de scripts/ ni de .claude/hooks/ se traga un error
// sin aviso.
//
// Problema de fondo #177 (encargo #182). El caso que lo destapó, #141: la
// limpieza de carpetas las dejaba a medias y solo lo decía con un `log()` que
// en silencio no imprime nada. Qué cuenta como «tragado» y qué lo salva (un
// comentario `a propósito: <porqué>` o un aviso) está en
// scripts/lib/erroresTragados.mjs, que es la única fuente.
//
// Los que ya existían están en TRAGADOS_CONOCIDOS, que SOLO PUEDE BAJAR, como
// la línea base del lint: uno nuevo hace fallar el test, y uno arreglado
// también, hasta que se quita de la lista (para que no quede hueco donde
// colarse otro). Se compara por fichero y por el texto de la línea del
// manejador, no por el número de línea, que se mueve con cualquier edición.

import { describe, expect, it } from "vitest";

import { erroresTragados, erroresTragadosEn } from "./lib/erroresTragados.mjs";

const CARPETAS = ["scripts", ".claude/hooks"];

// Fichero → texto de la línea del manejador (recortado), con su línea aproximada.
// Al arreglar uno, bórralo de aquí. No se añade nada: se arregla o se marca.
const TRAGADOS_CONOCIDOS = {
  "scripts/audit-catalog.mjs": [
    "} catch { /* la tabla aún no existe: no es un fallo del catálogo */ }", // ~l.712
    'try { return JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentoPorIngrediente.json"), "utf8', // ~l.811
    'try { return JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentoPorIngrediente.json"), "utf8', // ~l.878
  ],
  "scripts/build-alimentos.mjs": ["} catch {", "} catch {"], // ~l.103 y ~l.119
  "scripts/build-derived.mjs": ['try { previo = readFileSync(ruta, "utf8"); } catch { /* no existía */ }'], // ~l.359
  "scripts/enrich-recipe-steps.mjs": ["} catch {", "} catch (err) {"], // ~l.216 y ~l.1199 (solo console.log)
  "scripts/gen-all-photos.mjs": ["const releaseLock = () => { try { unlinkSync(LOCK_FILE); } catch {} };"], // ~l.39
  "scripts/gen-prompt-test.mjs": ["} catch (err) {"], // ~l.99 (solo console.log)
  "scripts/issues.mjs": ["} catch (e) {"], // ~l.127 (solo console.log)
  "scripts/lib/env.mjs": ["} catch {"], // ~l.53
  "scripts/lib/mercadonaFetch.mjs": ["batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null)),"], // ~l.68
  "scripts/lib/permisoAplicar.mjs": ["} catch {", "} catch {", "} catch {"], // ~l.188, ~l.201 y ~l.206
  "scripts/mercadona-ingredient-map.mjs": ["batch.map((id) => fetchJson(`${API}/categories/${id}/`).catch(() => null))"], // ~l.250
  "scripts/podar.mjs": ["} catch {"], // ~l.35
  "scripts/prompt-ab-test.mjs": ["} catch (err) {"], // ~l.153 (solo console.log)
  "scripts/retirar.mjs": ["} catch {"], // ~l.28
  "scripts/run-seed.mjs": ['await c.query("rollback").catch(() => {});'], // ~l.108
  "scripts/tarea.mjs": ["} catch {"], // ~l.62
  "scripts/verificar-estado.mjs": ['await client.query("rollback").catch(() => {});', "} catch {"], // ~l.264 y ~l.283
};

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
  const { tragados, ilegibles } = erroresTragadosEn(CARPETAS);
  const hoy = {};
  for (const t of tragados) (hoy[t.fichero] ??= []).push(t);

  it("todos los ficheros se pueden analizar (uno ilegible no se da por limpio)", () => expect(ilegibles).toEqual([]));

  it("no hay ninguno nuevo fuera de la lista", () => {
    const nuevos = Object.entries(hoy).flatMap(([f, hallados]) => {
      const sobrantes = resta(hallados.map((h) => h.texto), TRAGADOS_CONOCIDOS[f] ?? []);
      return hallados.filter((h) => sobrantes.includes(h.texto)).map((h) => `${f}:${h.linea}  ${h.texto}`);
    });
    expect(
      nuevos,
      "Un manejador que se traga el error sin aviso. Avisa (console.warn/console.error), " +
        "relanza, o si callarlo es lo correcto escribe en el bloque el comentario `// a propósito: <porqué>`. " +
        "La lista TRAGADOS_CONOCIDOS no crece.",
    ).toEqual([]);
  });

  it("la lista solo baja: lo arreglado se quita de ella", () => {
    const sobran = Object.entries(TRAGADOS_CONOCIDOS).flatMap(([f, textos]) =>
      resta(textos, (hoy[f] ?? []).map((h) => h.texto)).map((t) => `${f}  ${t}`),
    );
    expect(sobran, "Ya no están en el código: bórralos de TRAGADOS_CONOCIDOS.").toEqual([]);
  });

  it("de los hooks, ninguno en la lista (la guardia pregunta si no lee la entrada, #209)", () => {
    expect(Object.entries(TRAGADOS_CONOCIDOS).filter(([f]) => f.startsWith(".claude/"))).toEqual([]);
  });
});

describe("erroresTragados: qué cuenta como tragado", () => {
  const n = (src) => erroresTragados(src).length;

  it("catch vacío", () => expect(n("try { f() } catch {}")).toBe(1));
  it("devuelve un valor por defecto", () => {
    expect(n("try { return f() } catch { return null }")).toBe(1);
    expect(n("try { return f() } catch (e) { return { ok: false } }")).toBe(1);
    expect(n("try { return f() } catch { return }")).toBe(1);
    expect(n("try { return f() } catch { return new Map() }")).toBe(1);
    expect(n("try { return f() } catch { return Promise.resolve([]) }")).toBe(1);
    expect(n("try { return f() } catch {\n  return {\n    ok: false,\n    lista: [],\n  };\n}")).toBe(1);
  });
  it("asigna o declara un valor por defecto", () => {
    expect(n("try { x = f() } catch (e) { x = [] }")).toBe(1);
    expect(n("try { f() } catch { fallos++ }")).toBe(1);
  });
  it("solo un comentario que no es «a propósito»", () => expect(n("try { f() } catch {\n  // nada\n}")).toBe(1));
  it("solo lo dice con console.log/info/debug, un log local o process.exit(0) (la forma de #141)", () => {
    expect(n("try { f() } catch (e) { console.log(e.message) }")).toBe(1);
    expect(n("try { f() } catch { console.info('x') }")).toBe(1);
    expect(n("try { f() } catch { console.debug('x') }")).toBe(1);
    expect(n("const log = () => {}\ntry { f() } catch { log('no pude borrar') }")).toBe(1);
    expect(n("try { f() } catch { debug('x') }")).toBe(1);
    expect(n("try { f() } catch { process.exit(0) }")).toBe(1);
  });
  it("promesas: .catch y el segundo argumento de .then, flecha o no", () => {
    expect(n("p.catch(() => {})")).toBe(1);
    expect(n("p.catch(() => null)")).toBe(1);
    expect(n("p.catch(() => ({}))")).toBe(1);
    expect(n("p.catch((e) => { return [] })")).toBe(1);
    expect(n("p.catch(function () {})")).toBe(1);
    expect(n("const noop = () => {}\np.catch(noop)")).toBe(1);
    expect(n("p.catch(noop)")).toBe(1);
    expect(n("p.catch(console.log)")).toBe(1);
    expect(n("p.then(ok, () => {})")).toBe(1);
    expect(n("p.then(ok)")).toBe(0);
  });

  it("no, si lleva el COMENTARIO `a propósito:` con su porqué", () => {
    expect(n("try { f() } catch {\n  // a propósito: sin red se sigue\n  return null\n}")).toBe(0);
    expect(n("p.catch(() => null /* a propósito: si falla, sin categoría */)")).toBe(0);
    expect(n("try { f() } catch {} // fuera del bloque: a propósito: no cuenta")).toBe(1);
    expect(n("try { f() } catch { /* a propósito: */ }")).toBe(1); // sin porqué no vale
    expect(n("try { f() } catch { x = '// a propósito: dentro de una cadena' }")).toBe(1);
  });
  it("no, si avisa o relanza", () => {
    expect(n("try { f() } catch (e) { console.warn(e.message); return null }")).toBe(0);
    expect(n("try { f() } catch { console.error('x') }")).toBe(0);
    expect(n("try { f() } catch { process.stderr.write('x') }")).toBe(0);
    expect(n("try { f() } catch { avisos.push('no pude') }")).toBe(0);
    expect(n("try { f() } catch (e) { throw e }")).toBe(0);
    expect(n("p.catch(console.error)")).toBe(0);
    expect(n("p.catch((e) => { throw new Error('x', { cause: e }) })")).toBe(0);
  });
  it("no, si usa el error o hace algo más", () => {
    expect(n("try { f() } catch (e) { return e.message }")).toBe(0);
    expect(n("try { f() } catch (e) { x = { error: e } }")).toBe(0);
    expect(n("try { f() } catch { registra() }")).toBe(0);
    expect(n("try { f() } catch { if (x) y() }")).toBe(0);
    expect(n("try { f() } catch { process.exit(1) }")).toBe(0);
  });
  it("no se queda ciego tras una plantilla anidada o una regex detrás de return", () => {
    expect(n("const s = `a ${xs.map((x) => `<b>${x}</b>`).join('')} c`\ntry { f() } catch {}")).toBe(1);
    expect(n("function g(t) { return /[}{`'\"]/.test(t) }\ntry { f() } catch {}")).toBe(1);
  });
  it("no confunde un catch escrito en un comentario o una cadena", () => {
    expect(n("// try {} catch {}\nconst s = 'catch {}'\n")).toBe(0);
  });
  it("entiende CommonJS y el #! inicial", () => {
    expect(n("#!/usr/bin/env node\nconst fs = require('fs')\ntry { fs.x() } catch {}\nmodule.exports = 1")).toBe(1);
  });
  it("un fuente que no se puede analizar lanza, no se da por limpio", () => expect(() => erroresTragados("try {")).toThrow());
  it("da la línea del manejador", () => expect(erroresTragados("a()\nb()\ntry { f() } catch {}")[0].linea).toBe(3));
});
