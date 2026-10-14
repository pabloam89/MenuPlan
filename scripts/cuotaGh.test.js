// La cuota de GitHub (#424, fondo #326): la caché, la línea contable y el ratchet
// que vigila que no vuelvan a subir las llamadas que agotaron el cupo GraphQL.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APIS_GH, CALLERS_GH, IDENTIDADES_GH, MEDIDAS_GH, RESULTADOS_GH, TOPE_VIEJO_MIN, TTL_MIN, apiDe, borrarCacheGh, conCache, contarLog, escribirCacheGh, ghSync, identidadDe, leerCacheGh, leerLineas, lineaGh, porHoras, puntosDe, registrarGh, rafagas, registrarTras, resumenDeHoras, sesionCorta } from "./lib/cuotaGh.mjs";
import { conReintentos, leerArgs, resumirChecks } from "./espera-ci.mjs";

const raiz = join(import.meta.dirname, "..");
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "cuota-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("apiDe y la línea contable", () => {
  it("distingue REST y GraphQL", () => {
    expect(apiDe(["api", "graphql", "-f", "query=x"])).toBe("graphql");
    expect(apiDe(["api", "repos/a/b/issues"])).toBe("rest");
    expect(apiDe(["issue", "list"])).toBe("graphql");
    expect(apiDe(["pr", "checks", "1"])).toBe("graphql");
    expect(apiDe(["run", "list"])).toBe("rest");
  });

  it("usa un vocabulario cerrado y no cuela texto libre", () => {
    expect(lineaGh("issues", "graphql")).toBe("gh: caller=issues api=graphql");
    expect(lineaGh("inventado con espacios y token ghs_abc", "otra")).toBe("gh: caller=otro api=graphql");
    for (const c of CALLERS_GH) for (const a of APIS_GH) expect(lineaGh(c, a)).toBe(`gh: caller=${c} api=${a}`);
  });

  it("registrarGh escribe una línea por llamada y se puede contar", () => {
    const dir = tmp();
    registrarGh("issues", ["api", "graphql"], { dir });
    registrarGh("issues", ["api", "graphql"], { dir });
    registrarGh("avisos", ["api", "repos/x"], { dir });
    expect(contarLog(readFileSync(join(dir, "gh.log"), "utf8"))).toEqual({ "issues/graphql": 2, "avisos/rest": 1 });
  });

  it("registrarGh no rompe si no puede escribir", () => {
    const dir = tmp();
    writeFileSync(join(dir, "fichero"), "x"); // una carpeta que en realidad es un fichero
    expect(() => registrarGh("issues", ["issue", "list"], { dir: join(dir, "fichero") })).not.toThrow();
  });
});

describe("conCache", () => {
  const nombre = "issues-nodos";

  it("no vuelve a pedir dentro del TTL y sí al pasar", () => {
    const dir = tmp();
    let pedidas = 0;
    const pedir = () => ({ n: ++pedidas });
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 1 });
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 1 });
    const antes = new Date(Date.now() - 16 * 60_000);
    utimesSync(join(dir, `${nombre}.json`), antes, antes);
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 2 });
    expect(pedidas).toBe(2);
  });

  it("con TTL 0 (lo que escribe) siempre pide, pero deja la caché para el siguiente", () => {
    const dir = tmp();
    let pedidas = 0;
    const pedir = () => ({ n: ++pedidas });
    conCache(nombre, { ttlMin: 0, pedir, dir });
    conCache(nombre, { ttlMin: 0, pedir, dir });
    expect(pedidas).toBe(2);
    expect(conCache(nombre, { ttlMin: 15, pedir, dir })).toEqual({ n: 2 });
    expect(pedidas).toBe(2);
  });

  it("plan B: sin cuota, devuelve lo viejo y lo avisa; sin viejoSiFalla, propaga el error", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => ["viejo"], dir });
    const antes = new Date(Date.now() - 3 * 3600_000);
    utimesSync(join(dir, `${nombre}.json`), antes, antes);
    const falla = () => {
      throw new Error("API rate limit exceeded");
    };
    const avisos = [];
    expect(conCache(nombre, { ttlMin: 15, viejoSiFalla: true, pedir: falla, aviso: (m) => avisos.push(m), dir })).toEqual(["viejo"]);
    expect(avisos[0]).toMatch(/hace 180 min/);
    expect(() => conCache(nombre, { ttlMin: 15, pedir: falla, dir })).toThrow(/rate limit/);
  });

  it("plan B con tope: pasadas 6 h la caché vieja no tapa el error", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => ["viejo"], dir });
    const falla = () => {
      throw new Error("API rate limit exceeded");
    };
    const poner = (min) => {
      const t = new Date(Date.now() - min * 60_000);
      utimesSync(join(dir, `${nombre}.json`), t, t);
    };
    poner(TOPE_VIEJO_MIN - 5);
    expect(conCache(nombre, { ttlMin: 15, viejoSiFalla: true, pedir: falla, dir })).toEqual(["viejo"]);
    poner(TOPE_VIEJO_MIN + 5);
    expect(() => conCache(nombre, { ttlMin: 15, viejoSiFalla: true, pedir: falla, dir })).toThrow(/rate limit/);
  });

  it("el aviso del plan B lleva los minutos (para decirlo en el arranque)", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => 1, dir });
    const t = new Date(Date.now() - 42 * 60_000);
    utimesSync(join(dir, `${nombre}.json`), t, t);
    const vistos = [];
    const falla = () => {
      throw new Error("x");
    };
    conCache(nombre, { ttlMin: 15, viejoSiFalla: true, pedir: falla, aviso: (m, min) => vistos.push(min), dir });
    expect(vistos).toEqual([42]);
  });

  it("borrarCacheGh borra de verdad: escribir, borrar, leer da null", () => {
    const dir = tmp();
    escribirCacheGh(nombre, { a: 1 }, { dir });
    expect(leerCacheGh(nombre, { dir })?.valor).toEqual({ a: 1 });
    borrarCacheGh(nombre, { dir });
    expect(leerCacheGh(nombre, { dir })).toBeNull();
    expect(() => borrarCacheGh(nombre, { dir })).not.toThrow(); // borrar lo que no hay no rompe
  });

  it("plan B: una caché ilegible no rompe, se pide como antes", () => {
    const dir = tmp();
    conCache(nombre, { ttlMin: 15, pedir: () => 1, dir });
    writeFileSync(join(dir, `${nombre}.json`), "{roto");
    expect(conCache(nombre, { ttlMin: 15, pedir: () => 2, dir })).toBe(2);
  });
});

describe("espera-ci (REST)", () => {
  it("el PR es solo el primer argumento; --cada y --tope se llevan su valor", () => {
    expect(leerArgs(["123"])).toMatchObject({ pr: 123, cada: 60, topeMin: 20 });
    expect(leerArgs(["123", "--cada", "90", "--tope", "5"])).toMatchObject({ pr: 123, cada: 90, topeMin: 5 });
    expect(leerArgs(["--cada", "60", "123"]).pr).toBe(0); // no toma ni el 60 ni el 123 por PR
    expect(leerArgs(["--tope", "20"]).pr).toBe(0);
    expect(leerArgs(["123", "--cada", "5"]).cada).toBe(30);
  });

  it("conReintentos pasa el número de intento a quien llama (para la línea contable)", async () => {
    const vistos = [];
    await conReintentos((i) => {
      vistos.push(i);
      if (i < 3) throw new Error("red");
    }, 3, 0);
    expect(vistos).toEqual([1, 2, 3]);
  });

  it("reintenta un fallo de red y se rinde al tercero", async () => {
    let n = 0;
    const flojo = () => {
      if (++n < 3) throw new Error("red");
      return "ok";
    };
    expect(await conReintentos(flojo, 3, 1)).toBe("ok");
    let m = 0;
    const roto = () => {
      m++;
      throw new Error("red");
    };
    await expect(conReintentos(roto, 3, 1)).rejects.toThrow("red");
    expect(m).toBe(3);
  });

  it("resume los check-runs", () => {
    expect(resumirChecks([]).estado).toBe("pendiente");
    expect(resumirChecks([{ name: "tests", status: "in_progress", conclusion: null }]).estado).toBe("pendiente");
    expect(resumirChecks([{ name: "tests", status: "completed", conclusion: "success" }]).estado).toBe("ok");
    expect(resumirChecks([{ name: "tests", status: "completed", conclusion: "skipped" }]).estado).toBe("ok");
    const f = resumirChecks([{ name: "tests", status: "completed", conclusion: "failure" }, { name: "x", status: "queued", conclusion: null }]);
    expect(f).toMatchObject({ estado: "falla", fallan: ["tests"], faltan: 1 });
  });
});

// ── El ratchet: lo que agotó la cuota no puede volver a subir ───────────────────

const leer = (r) => readFileSync(join(raiz, r), "utf8");
function ficheros(dir, ext, out = []) {
  for (const f of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${f}`;
    if (["node_modules", "skills-prueba", ".git", "agent-memory"].includes(f)) continue;
    if (statSync(join(raiz, rel)).isDirectory()) ficheros(rel, ext, out);
    else if (ext.some((e) => f.endsWith(e)) && !/\.test\.[jm]?js$/.test(f)) out.push(rel);
  }
  return out;
}

describe("ratchet de la cuota GraphQL (#424)", () => {
  // Techos = lo que hay hoy. Bajar es bueno; subir exige pensar en la cuota y cambiar el número aquí.
  const TECHO_WATCH = 5; // menciones de `gh pr checks … --watch` fuera de tests: hoy solo para desaconsejarlo (skill github, su capa cuota-graphql y la cabecera de espera-ci)
  const TECHO_GRAPHQL_ISSUES = 4; // sitios con `api graphql` en scripts/issues.mjs: issues, PR del índice, PR de «Casos:» y la mutación de colgar

  it("nadie recomienda `gh pr checks --watch`: se espera con `npm run espera-ci`", () => {
    const todos = [...ficheros(".claude", [".md", ".mjs", ".json"]), ...ficheros("docs", [".md"]), ...ficheros("scripts", [".mjs"]), ...ficheros("ops", [".md", ".json"])];
    const hallazgos = todos.filter((f) => /pr checks[^\n]*--watch/.test(leer(f)));
    const cuenta = todos.reduce((n, f) => n + (leer(f).match(/pr checks[^\n]*--watch/g) ?? []).length, 0);
    expect(cuenta, `menciones en: ${hallazgos.join(", ")}`).toBeLessThanOrEqual(TECHO_WATCH);
    // Ni una como instrucción en una tabla de operaciones.
    expect(leer(".claude/skills/github/SKILL.md")).not.toMatch(/^\|[^\n]*\| `gh pr checks[^\n]*--watch/m);
  });

  it("los sitios de GraphQL de scripts/issues.mjs no suben", () => {
    const n = (leer("scripts/issues.mjs").match(/"api", "graphql"/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(TECHO_GRAPHQL_ISSUES);
  });

  it("el arranque y el listado leen los issues con caché; solo lo que escribe va fresco", () => {
    const f = leer("scripts/issues.mjs");
    const arranque = f.slice(f.indexOf('args.includes("--arranque")'));
    expect(arranque).toMatch(/todos\(\{ ttlMin: TTL_MIN\.arranque, viejoSiFalla: true \}\)/);
    expect(arranque).toMatch(/todos\(\{ ttlMin: TTL_MIN\.listado, viejoSiFalla: true \}\)/);
    expect(TTL_MIN.arranque).toBeGreaterThanOrEqual(10);
    // Cualquier otra lectura (`todos()` a secas) es de una orden que escribe: TTL 0.
    expect((f.match(/todos\(\)/g) ?? []).length).toBeLessThanOrEqual(5); // --colgar, --nuevo (parecidos y padre), --ordenar, --marcas-huerfanas
  });

  // Corta la rama de una orden: de su `args.includes` al siguiente `} else`.
  const rama = (f, orden) => {
    const ini = f.indexOf(`args.includes("${orden}")`);
    expect(ini, orden).toBeGreaterThan(-1);
    const fin = f.slice(ini + 10).search(/\n\} else/);
    return f.slice(ini, fin < 0 ? undefined : ini + 10 + fin);
  };

  it("las órdenes que escriben (--nuevo, --colgar, --ordenar) leen siempre frescas: ni rastro de ttlMin", () => {
    const f = leer("scripts/issues.mjs");
    for (const o of ["--nuevo", "--colgar", "--ordenar"]) {
      const r = rama(f, o);
      expect(r, o).not.toMatch(/ttlMin|TTL_MIN/);
      expect(r, o).toMatch(/todos\(|colgar\(/);
    }
  });

  it("las escrituras invalidan la caché, en el orden crear → borrar → releer", () => {
    const f = leer("scripts/issues.mjs");
    const nuevo = rama(f, "--nuevo");
    const crear = nuevo.indexOf("gh(...crear)");
    const borrar = nuevo.indexOf('borrarCacheGh("issues-nodos")');
    const releer = nuevo.indexOf("colgar(todos()");
    expect(crear).toBeGreaterThan(-1);
    expect(borrar).toBeGreaterThan(crear);
    expect(releer).toBeGreaterThan(borrar);
    expect(rama(f, "--ordenar")).toMatch(/borrarCacheGh\("issues-nodos"\)/);
    // colgar(): al enlazar el padre y al reabrir el fondo
    const colgar = f.slice(f.indexOf("function colgar("), f.indexOf("function ramasVivas"));
    expect((colgar.match(/borrarCacheGh\("issues-nodos"\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("el arranque cuenta en stdout que sirve caché vieja", () => {
    expect(rama(leer("scripts/issues.mjs"), "--arranque")).toMatch(/caché de hace \$\{minutosDeCacheVieja\} min/);
  });

  it("el arranque abre una sola lectura de issues", () => {
    const f = leer("scripts/issues.mjs");
    const ini = f.indexOf('args.includes("--arranque")');
    const rama = f.slice(ini, f.indexOf("} else {", ini));
    expect((rama.match(/todos\(/g) ?? []).length).toBe(1);
  });

  it("los puntos que llaman a gh dejan su línea contable", () => {
    expect(leer("scripts/issues.mjs")).toMatch(/ghSync\("issues"/);
    expect(leer(".claude/hooks/avisos.mjs")).toMatch(/ghSync\("avisos"/);
  });
});

// ── E1 de #326 (#724): puntos, origen, sesión y resultado en cada línea ──────────

describe("la línea contable con puntos (#724)", () => {
  const campos = { identidad: "app", sesion: "a1b2c3", puntos: 106, medida: "real", resultado: "ok", intento: 1 };

  it("lleva identidad, sesión, puntos, medida, resultado e intento, con vocabulario cerrado", () => {
    expect(lineaGh("issues", "graphql", campos)).toBe("gh: caller=issues api=graphql identidad=app sesion=a1b2c3 puntos=106 medida=real resultado=ok intento=1");
    const hostil = lineaGh("issues", "graphql", { identidad: "C:\\Users\\pablo", sesion: "ghp_abc", puntos: "x", medida: "?", resultado: "npm run", intento: -3 });
    expect(hostil).toBe("gh: caller=issues api=graphql identidad=pablo sesion=000000 puntos=0 medida=est resultado=error intento=1");
    for (const i of IDENTIDADES_GH) for (const m of MEDIDAS_GH) for (const r of RESULTADOS_GH) expect(lineaGh("fabrica", "rest", { ...campos, identidad: i, medida: m, resultado: r })).toContain(`identidad=${i} `);
  });

  it("la sesión es un hash corto: sin rutas ni nombres", () => {
    const s = sesionCorta({}, "C:\\dev\\MenuPlan-algo");
    expect(s).toMatch(/^[0-9a-f]{6}$/);
    expect(s).toBe(sesionCorta({}, "C:\\dev\\MenuPlan-algo"));
    expect(sesionCorta({}, "C:\\dev\\MenuPlan-otra")).not.toBe(s);
    expect(sesionCorta({ CLAUDE_SESSION_ID: "abc" }, "x")).toBe(sesionCorta({ CLAUDE_SESSION_ID: "abc" }, "y"));
  });

  it("la identidad sale del prefijo del token, nunca de su valor", () => {
    expect(identidadDe({ GH_TOKEN: "ghs_loquesea" })).toBe("app");
    expect(identidadDe({ GH_TOKEN: "gho_loquesea" })).toBe("pablo");
    expect(identidadDe({})).toBe("pablo");
  });

  it("los puntos salen de rateLimit { cost } y, sin él, de la tabla de estimación", () => {
    const q = ["api", "graphql", "-f", "query=x"];
    expect(puntosDe("issues", q, JSON.stringify({ data: { rateLimit: { cost: 7 }, repository: {} } }))).toEqual({ puntos: 7, medida: "real" });
    expect(puntosDe("issues", q, "{}")).toEqual({ puntos: 106, medida: "est" });
    expect(puntosDe("fabrica", q, "{}")).toEqual({ puntos: 5, medida: "est" });
    expect(puntosDe("avisos", ["issue", "list"], "[]")).toEqual({ puntos: 1, medida: "est" });
    expect(puntosDe("espera-ci", ["api", "repos/x"], "{}")).toEqual({ puntos: 0, medida: "nada" });
  });

  it("un fallo sin medida real no cuenta como puntos gastados (ni en la línea ni en las horas)", () => {
    const q = ["api", "graphql", "-f", "query=x"];
    expect(puntosDe("issues", q, "{}", "limitado")).toEqual({ puntos: 0, medida: "est" });
    expect(puntosDe("fabrica", q, "", "error")).toEqual({ puntos: 0, medida: "est" });
    expect(puntosDe("issues", q, "{}", "ok")).toEqual({ puntos: 106, medida: "est" });
    // si GitHub dijo el coste real, se cree aunque el resultado no sea ok
    expect(puntosDe("issues", q, JSON.stringify({ data: { rateLimit: { cost: 7 } } }), "error")).toEqual({ puntos: 7, medida: "real" });
    // líneas ya escritas con la estimación: porHoras tampoco las suma
    const l = (hora, p, m, r) => `${hora} ${lineaGh("issues", "graphql", { ...campos, puntos: p, medida: m, resultado: r })}`;
    const t = [l("2026-10-13T08:05:00Z", 106, "est", "limitado"), l("2026-10-13T08:06:00Z", 5, "est", "error"), l("2026-10-13T08:07:00Z", 7, "real", "error"), l("2026-10-13T08:08:00Z", 106, "est", "ok")].join("\n");
    expect(porHoras(t)["2026-10-13 10"]).toMatchObject({ lineas: 4, puntos: 113, limitadas: 1 });
  });

  it("ghSync registra DESPUÉS de la llamada, con el resultado, y relanza el error", () => {
    const dir = tmp();
    const orden = [];
    const ejecutar = () => {
      orden.push(existsSync(join(dir, "gh.log")) ? "log-antes" : "llamada");
      return JSON.stringify({ data: { rateLimit: { cost: 3 } } });
    };
    expect(ghSync("issues", ["api", "graphql"], {}, { dir, ejecutar })).toContain("cost");
    expect(orden).toEqual(["llamada"]); // al hacer la llamada todavía no había línea
    expect(readFileSync(join(dir, "gh.log"), "utf8")).toMatch(/puntos=3 medida=real resultado=ok intento=1/);

    const limite = Object.assign(new Error("x"), { stderr: "GraphQL: API rate limit already exceeded" });
    expect(() => ghSync("issues", ["api", "graphql"], {}, { dir, ejecutar: () => { throw limite; }, intento: 2 })).toThrow(limite);
    const raro = new Error("sin red");
    expect(() => ghSync("issues", ["issue", "view", "1"], {}, { dir, ejecutar: () => { throw raro; } })).toThrow(raro);
    const lineas = readFileSync(join(dir, "gh.log"), "utf8").trim().split("\n");
    expect(lineas[1]).toMatch(/resultado=limitado intento=2/);
    expect(lineas[2]).toMatch(/resultado=error intento=1/);
  });

  it("cada intento de un reintento deja su línea", () => {
    const dir = tmp();
    const falla = () => { throw Object.assign(new Error("x"), { stderr: "rate limit" }); };
    for (const intento of [1, 2, 3]) expect(() => ghSync("fabrica", ["api", "graphql"], {}, { dir, intento, ejecutar: falla })).toThrow();
    expect(readFileSync(join(dir, "gh.log"), "utf8").trim().split("\n").map((l) => /intento=(\d)/.exec(l)[1])).toEqual(["1", "2", "3"]);
  });

  it("registrarTras apunta al resolverse o fallar una llamada asíncrona", async () => {
    const dir = tmp();
    await registrarTras("token-sesion", ["api", "user"], Promise.resolve({ stdout: "x" }), { dir });
    await expect(registrarTras("token-sesion", ["api", "user"], Promise.reject(Object.assign(new Error("e"), { stderr: "abuse detection" })), { dir })).rejects.toThrow("e");
    const t = readFileSync(join(dir, "gh.log"), "utf8");
    expect(t).toMatch(/resultado=ok/);
    expect(t).toMatch(/resultado=limitado/);
  });

  it("leerLineas lee las líneas nuevas y las viejas (sin campos) sin romper", () => {
    const t = "2026-10-13T10:00:00.000Z gh: caller=issues api=graphql\n2026-10-13T10:01:00.000Z " + lineaGh("fabrica", "graphql", campos) + "\nbasura\n";
    const l = leerLineas(t);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ caller: "issues", resultado: "sin-dato", sesion: "sin-dato" });
    expect(l[1]).toMatchObject({ caller: "fabrica", puntos: 106, resultado: "ok", sesion: "a1b2c3" });
  });

  it("porHoras suma puntos por hora, origen y sesión y cuenta las limitadas (hora de Madrid)", () => {
    const l = (hora, caller, p, r, s = "a1b2c3") => `${hora} ${lineaGh(caller, "graphql", { ...campos, puntos: p, resultado: r, sesion: s })}`;
    const t = [
      l("2026-10-13T08:05:00Z", "issues", 100, "ok"), // 10:05 en Madrid (UTC+2)
      l("2026-10-13T08:40:00Z", "issues", 106, "ok", "ffffff"),
      l("2026-10-13T08:41:00Z", "fabrica", 5, "limitado"),
      l("2026-10-13T09:00:00Z", "issues", 1, "ok"),
    ].join("\n");
    const h = porHoras(t);
    expect(Object.keys(h)).toEqual(["2026-10-13 10", "2026-10-13 11"]);
    expect(h["2026-10-13 10"]).toMatchObject({ lineas: 3, puntos: 211, limitadas: 1, porOrigen: { issues: 206, fabrica: 5 }, porSesion: { a1b2c3: 105, ffffff: 106 } });
    expect(porHoras(t, { desde: Date.parse("2026-10-13T08:30:00Z") })["2026-10-13 10"].lineas).toBe(2);
    // el desglose por medida: todo lo de los campos de prueba es real
    expect(h["2026-10-13 10"].porMedida).toEqual({ real: 211 });
  });
});

// ── La clase: todo sitio que lanza gh deja su línea, y la deja DESPUÉS ──────────────

describe("cobertura del registro: quien lanza gh pasa por el envoltorio común (#724)", () => {
  // Lista que SOLO BAJA. Cada una con su motivo; E2 (#326) les exige al menos leer la marca limitado-hasta.
  const EXCEPCIONES = {
    ".claude/hooks/guardia.mjs": "corre en cada comando y no importa scripts/ (migraciones.mjs lo documenta); solo gh pr view y la comparación en las ramas de PR",
    ".claude/hooks/migraciones.mjs": "la guardia lo carga sola, sin scripts/; una sola lectura de PR por sesión",
    "scripts/rulesets.mjs": "pide a gh la sesión local, no llama a la API",
  };
  // Quien recibe gh como función y no lo lanza: lo lanza (y registra) el fichero que dice el valor.
  const RECEPTORES = {
    "scripts/lib/fabricaGh.mjs": "scripts/fabrica.mjs",
    "scripts/lib/situacion.mjs": "scripts/situacion.mjs",
  };
  const LANZA = /\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*["'`]gh(?:\.exe)?(?:["'`]|\s)/;
  // gh como parámetro: `function f(gh)`, `(gh) =>`, `gh =>`, `async (a, gh = x) =>`
  const RECIBE = /function\s*\w*\s*\([^)]*\bgh\b[^)]*\)|\([^()]*\bgh\b[^()]*\)\s*=>|(?<![\w.$])gh\s*=>/;
  // gh nombrado como ejecutable: "gh", 'gh', `gh`, gh.exe entre comillas (alias, `GH = "gh"`, `run("gh", …)`)
  const NOMBRA = /["'`]gh(?:\.exe)?["'`]/;
  const USA_PROCESOS = /(?:node:)?child_process/;
  // Sustitutos transparentes de gh: no son un origen, pasan el comando de quien los invoca al gh real (#719).
  // Fuera de EXCEPCIONES a propósito: esa lista solo baja. Deuda: contar sus llamadas (#724).
  const TRANSPARENTES = {
    "scripts/gh-shim.mjs": "sustituto de gh: el origen es de quien lo invoca",
    "scripts/lib/ghConRenovacion.mjs": "ejecutor por defecto de ghSync/execFileGh: cambia el token y lanza el gh real; el origen y el registro son de quien lo invoca",
  };
  // El código sin comentarios: una mención de `gh` en un comentario no lanza nada.
  const codigo = (f) => leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const todos = [...ficheros("scripts", [".mjs", ".js"]), ...ficheros(".claude/hooks", [".mjs", ".js"])].filter((f) => f !== "scripts/lib/cuotaGh.mjs");
  const usaElEnvoltorio = (f) => /\b(?:ghSync|registrarTras|execFileGh)\(/.test(leer(f)) && /cuotaGh\.mjs/.test(leer(f));

  it("nadie lanza gh a pelo fuera del envoltorio (salvo la lista que solo baja)", () => {
    // Las líneas `ejecutar: …` son el ejecutor que un hook pasa a ghSync/execFileGh (registra ghSync, no el ejecutor)
    const sinEjecutor = (f) => leer(f).split("\n").filter((l) => !/\bejecutar:\s*\(/.test(l)).join("\n");
    const aPelo = todos.filter((f) => LANZA.test(sinEjecutor(f)) && !EXCEPCIONES[f]);
    expect(aPelo, "lanzan gh sin registrar: usa ghSync/registrarTras de scripts/lib/cuotaGh.mjs").toEqual([]);
  });

  it("detector ancho: ningún fichero con child_process nombra gh sin el envoltorio ni estar en la lista", () => {
    const suelto = todos.filter((f) => USA_PROCESOS.test(codigo(f)) && NOMBRA.test(codigo(f)) && !usaElEnvoltorio(f) && !EXCEPCIONES[f] && !TRANSPARENTES[f]);
    expect(suelto, 'nombran "gh" junto a child_process sin ghSync/registrarTras/execFileGh: pásalos por scripts/lib/cuotaGh.mjs o apúntalos en EXCEPCIONES con motivo').toEqual([]);
  });

  it("los patrones del detector ven los alias y las flechas (y no ven lo inocente)", () => {
    for (const c of ['const GH = "gh";', "run('gh', a)", "spawn(`gh`, a)", 'execFile("gh.exe", a)']) expect(NOMBRA.test(c), c).toBe(true);
    for (const c of ["(gh) => gh(a)", "gh => gh(a)", "async (x, gh = y) => 1", "function f(a, gh) {}", "const f = function (gh) {}"]) expect(RECIBE.test(c), c).toBe(true);
    for (const c of ["const ghost = 1", "obj.gh => 1", "// gh pr view", "const gha = (x) => x"]) expect(RECIBE.test(c) || NOMBRA.test(c), c).toBe(false);
  });

  it("en cupos.mjs, cada lanzamiento de gh va envuelto en registrarTras", () => {
    const lineas = leer("scripts/lib/cupos.mjs").split("\n").filter((l) => /lanzar\("gh"/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) expect(l, l).toMatch(/registrarTras\(/);
  });

  it("las excepciones siguen siendo necesarias: si ya no lanzan gh, se quitan de la lista", () => {
    for (const f of Object.keys(EXCEPCIONES)) expect(LANZA.test(leer(f)), f).toBe(true);
    expect(Object.keys(EXCEPCIONES).length).toBeLessThanOrEqual(3);
  });

  it("quien usa el envoltorio lo importa de verdad, y quien recibe un gh inyectado dice quién lo lanza", () => {
    for (const f of todos.filter((x) => /\b(?:ghSync|registrarTras|execFileGh)\(/.test(leer(x)))) expect(leer(f), f).toMatch(/from "[./]+(?:\/scripts)?\/(?:lib\/)?cuotaGh\.mjs"/);
    const receptores = todos.filter((f) => RECIBE.test(leer(f)) && !usaElEnvoltorio(f) && !LANZA.test(leer(f)));
    for (const f of receptores) {
      expect(RECEPTORES[f], `${f} recibe gh como función: di en RECEPTORES quién lo lanza`).toBeDefined();
      expect(usaElEnvoltorio(RECEPTORES[f]), `${RECEPTORES[f]} lanza el gh de ${f} y debe registrarlo`).toBe(true);
    }
    for (const f of Object.keys(RECEPTORES)) expect(RECIBE.test(leer(f)), `${f} ya no recibe gh: quítalo de RECEPTORES`).toBe(true);
  });

  it("el único ejecutor de gh está en cuotaGh.mjs y registra tras llamar", () => {
    const f = leer("scripts/lib/cuotaGh.mjs");
    const fn = f.slice(f.indexOf("export function ghSync"), f.indexOf("export function registrarTras"));
    expect(fn.indexOf("ejecutar(args")).toBeGreaterThan(-1);
    expect(fn.indexOf("registrarGh(")).toBeGreaterThan(fn.indexOf("ejecutar(args"));
  });

  it("las consultas propias piden rateLimit { cost } para saber los puntos reales", () => {
    const consultas = [["scripts/lib/issues.mjs", "CONSULTA"], ["scripts/lib/issues.mjs", "CONSULTA_PR"], ["scripts/lib/buscarAntes.mjs", "CONSULTA_PR_INDICE"], ["scripts/lib/fabricaGh.mjs", "CONSULTA_TODOS"], ["scripts/lib/fabricaGh.mjs", "CONSULTA_FONDOS"], ["scripts/lib/cumplimiento.mjs", "CONSULTA_FLUJO"]];
    for (const [fichero, nombre] of consultas) {
      const f = leer(fichero);
      const ini = f.indexOf(`export const ${nombre} =`);
      expect(ini, nombre).toBeGreaterThan(-1);
      expect(f.slice(ini, f.indexOf("}`;", ini)), nombre).toMatch(/rateLimit \{ cost \}/);
    }
  });
});

describe("npm run cuota -- --horas y --rafagas (#724)", () => {
  const c = { identidad: "app", sesion: "a1b2c3", puntos: 10, medida: "real", resultado: "ok", intento: 1 };
  const l = (hora, p = 10, r = "ok", s = "a1b2c3") => `${hora} ${lineaGh("issues", "graphql", { ...c, puntos: p, resultado: r, sesion: s })}`;

  it("resumenDeHoras da la hora más cara, el p95, el total y las limitadas", () => {
    const t = [l("2026-10-13T08:00:00Z", 100), l("2026-10-13T09:00:00Z", 300, "limitado"), l("2026-10-13T10:00:00Z", 50)].join("\n");
    expect(resumenDeHoras(porHoras(t))).toEqual({ horas: 3, puntos: 450, limitadas: 1, maxima: { hora: "2026-10-13 11", puntos: 300 }, p95: 300 });
    expect(resumenDeHoras({})).toEqual({ horas: 0, puntos: 0, limitadas: 0, maxima: null, p95: 0 });
  });

  it("rafagas agrupa las líneas seguidas de un origen (menos de 30 s entre una y otra)", () => {
    const t = [l("2026-10-13T08:00:00Z"), l("2026-10-13T08:00:10Z"), l("2026-10-13T08:00:20Z", 10, "ok", "ffffff"), l("2026-10-13T09:00:00Z")].join("\n");
    expect(rafagas(t)).toEqual([{ inicio: "2026-10-13T08:00:00.000Z", lineas: 3, sesiones: 2 }, { inicio: "2026-10-13T09:00:00.000Z", lineas: 1, sesiones: 1 }]);
    expect(rafagas(t, { caller: "fabrica" })).toEqual([]);
  });

  it("cuota.mjs --horas lee un gh.log y cuenta los puntos de la hora", () => {
    const dir = tmp();
    const ahora = new Date();
    writeFileSync(join(dir, "gh.log"), `${ahora.toISOString()} ${lineaGh("issues", "graphql", { ...c, puntos: 106, resultado: "limitado" })}\n`);
    const salida = execFileSync(process.execPath, [join(raiz, "scripts", "cuota.mjs"), "--horas"], { env: { ...process.env, MENUPLAN_CUOTA_DIR: dir }, encoding: "utf8" });
    expect(salida).toMatch(/puntos +106 +limitadas 1/);
    expect(salida).toMatch(/hora más cara gastó 106 puntos/);
    expect(salida).toMatch(/líneas limitadas, 1/);
  });
});

describe("endurecimiento de la medida y de la lectura (#724, seguridad)", () => {
  const q = ["api", "graphql", "-f", "query=x"];

  it("el texto de usuario con un rateLimit falso no fija el coste: solo cuenta data.rateLimit.cost", () => {
    const salida = JSON.stringify({ data: { repository: { issues: { nodes: [{ body: "\"rateLimit\":{\"cost\":999999}" }] } } } });
    expect(puntosDe("issues", q, salida)).toEqual({ puntos: 106, medida: "est" });
    // un coste absurdo o no entero tampoco se cree
    expect(puntosDe("issues", q, JSON.stringify({ data: { rateLimit: { cost: 1e308 } } }))).toEqual({ puntos: 106, medida: "est" });
    // sin JSON válido, estimación
    expect(puntosDe("issues", q, "no es json \"rateLimit\":{\"cost\":5}")).toEqual({ puntos: 106, medida: "est" });
  });

  it("leerLineas pasa cada campo por su lista cerrada y acota los puntos", () => {
    const hostil = "2026-10-13T08:00:00Z gh: caller=__proto__ api=graphql identidad=\u001b[31mroja sesion=ZZZZZZ puntos=1e308 medida=\u001b[0mx resultado=rm intento=99999999999";
    const buena = lineaGh("issues", "graphql", { identidad: "app", sesion: "a1b2c3", puntos: 7, medida: "real", resultado: "ok", intento: 2 });
    const [h, b] = leerLineas(hostil + "\n2026-10-13T08:00:01Z " + buena);
    expect(h).toMatchObject({ caller: "otro", api: "graphql", identidad: "pablo", sesion: "000000", puntos: 0, medida: "est", resultado: "error", intento: 1 });
    expect(b).toMatchObject({ caller: "issues", identidad: "app", sesion: "a1b2c3", puntos: 7, medida: "real", resultado: "ok", intento: 2 });
    expect(JSON.stringify(h)).not.toMatch(/u001b|\\x1b/);
  });
});
