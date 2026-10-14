// ghConRenovacion.test.js — los scripts de Node renuevan el token ANTES de llamar a `gh` (E3 #731, fondo #715).
//
// Lo que se prueba:
//   1. La decisión (`planDeToken`, `elegirToken`) con una caché de verdad en un directorio temporal y un
//      canje de mentira que escribe en ella: por edad, por caché más nueva, sin renovar, con fallo.
//   2. La llamada (`ghConRenovacion`) con un `gh` de mentira: UNA sola llamada siempre, también tras un 5xx
//      o un tiempo agotado (una escritura no se repite).
//   3. La tabla cerrada resultado × motivo: cada combinación permitida da su línea y cualquier otra falla.
//   4. El barrido: ningún script llama a `gh` a pelo fuera del punto único y de la lista de excepciones.
// Este test no lanza ningún hook (nombra los ficheros de hooks solo como rutas del barrido): por eso figura en
// NO_REGISTRAN de .claude/hooks/eventos.test.js.
// Ningún token es real: son `ghs_…` inventados, y los mensajes de fallo pasan por `tachado`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { escribirCache, falloReciente } from "./lib/cacheTokenSesion.mjs";
import {
  MOTIVOS_POR_RESULTADO, RESULTADOS, UMBRAL_EDAD_MS, _reiniciarAvisos, elegirToken, ghConRenovacion, lineaCredencial, motivoDeSalida, planDeToken, renovarEnCache,
} from "./lib/ghConRenovacion.mjs";
import { MOTIVOS, TOKEN_CENTINELA } from "./lib/tokenSesion.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN = 60_000;
const T = Date.parse("2026-10-14T10:00:00.000Z");
const TOKEN_CACHE = `ghs_${"C4che".repeat(6)}`;
const TOKEN_NUEVO = `ghs_${"N0evo".repeat(6)}`;
const TOKEN_VIEJO = `ghs_${"V1ejo".repeat(6)}`;
const DE_PRUEBA = new Set([TOKEN_CACHE, TOKEN_NUEVO, TOKEN_VIEJO]);
/** Tacha cualquier `ghs_` que no sea de prueba: un mensaje de fallo nunca enseña un token real. */
const tachado = (texto) => String(texto ?? "").replace(/ghs_[A-Za-z0-9_]+/g, (m) => (DE_PRUEBA.has(m) ? m : "ghs_[tachado]"));

const IDS = () => ({ appId: 1, installationId: 2 });
const LIBRE = { permisosBien: () => true, proteger: () => true };
const dirs = [];
const rutaTemporal = () => {
  const d = mkdtempSync(join(tmpdir(), "gh-renov-"));
  dirs.push(d);
  return join(d, "token-sesion.json");
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
beforeEach(() => _reiniciarAvisos());

/** Guarda en la caché `token` con `restanteMs` de vida a las T. */
const guardar = (ruta, token, restanteMs) =>
  escribirCache({ ruta, proteger: LIBRE.proteger, datos: { token, expiraEn: new Date(T + restanteMs).toISOString(), appId: 1, installationId: 2 } });

/** Un montaje completo: caché, `renovar` que cuenta y (si va bien) deja TOKEN_NUEVO en la caché, `gh` falso. */
function montaje({ cacheToken = null, restanteMs = 50 * MIN, renovacion = "ok", ghFalla = null } = {}) {
  const ruta = rutaTemporal();
  if (cacheToken) guardar(ruta, cacheToken, restanteMs);
  const lineas = [];
  const llamadas = [];
  const canjes = [];
  const renovar = () => {
    canjes.push(1);
    if (renovacion !== "ok") return { motivo: renovacion };
    guardar(ruta, TOKEN_NUEVO, 59 * MIN);
    return { ok: true };
  };
  const ejecutar = (cmd, args, opciones) => {
    llamadas.push({ cmd, args, token: opciones.env.GH_TOKEN });
    if (ghFalla) throw ghFalla;
    return "ok";
  };
  const deps = { ruta, ids: IDS, reloj: () => T, cache: LIBRE, renovar, ejecutar, registrar: (l) => lineas.push(l), buscarGh: () => "gh" };
  return { ruta, lineas, llamadas, canjes, deps };
}

describe("la tabla cerrada resultado × motivo", () => {
  it("cada combinación permitida da su línea", () => {
    for (const resultado of RESULTADOS) {
      for (const motivo of MOTIVOS_POR_RESULTADO[resultado]) {
        expect(lineaCredencial({ resultado, motivo })).toBe(`credencial-sesion resultado: ${resultado} motivo: ${motivo}`);
      }
    }
  });
  it("cualquier otra combinación del producto cartesiano falla", () => {
    for (const resultado of RESULTADOS) {
      for (const motivo of [...MOTIVOS, "-", "ninguno", "canje-fallido"]) {
        const permitida = MOTIVOS_POR_RESULTADO[resultado].includes(motivo);
        const intento = () => lineaCredencial({ resultado, motivo });
        if (permitida) expect(intento).not.toThrow();
        else expect(intento, `${resultado} × ${motivo}`).toThrow();
      }
    }
  });
  it("renovada y sin-renovar tienen los motivos del cuerpo del encargo; `fallo` incluye fallo-reciente y las causas del canje", () => {
    expect(MOTIVOS_POR_RESULTADO.renovada).toEqual(["vencida-por-edad", "cache-mas-nueva"]);
    expect(MOTIVOS_POR_RESULTADO["sin-renovar"]).toEqual(["-"]);
    for (const causa of ["red", "limite-de-1password", "github-rechaza", "sin-clave", "fallo-reciente"]) expect(MOTIVOS_POR_RESULTADO.fallo).toContain(causa);
    expect(MOTIVOS_POR_RESULTADO.fallo).not.toContain("vencida-por-edad");
    expect(MOTIVOS_POR_RESULTADO.fallo).not.toContain("-");
  });
  it("un solo vocabulario: los motivos nuevos están una vez en MOTIVOS y no hay `canje-fallido` ni `ninguno`", () => {
    for (const m of ["vencida-por-edad", "cache-mas-nueva", "fallo-reciente"]) expect(MOTIVOS.filter((x) => x === m)).toHaveLength(1);
    expect(MOTIVOS).not.toContain("canje-fallido");
    expect(MOTIVOS).not.toContain("ninguno");
    expect(new Set(MOTIVOS).size).toBe(MOTIVOS.length);
  });
  it("la línea no lleva nada que parezca un token", () => {
    for (const resultado of RESULTADOS) for (const motivo of MOTIVOS_POR_RESULTADO[resultado]) expect(lineaCredencial({ resultado, motivo })).not.toMatch(/ghs_/);
  });
});

describe("planDeToken (la decisión, pura)", () => {
  const ok = (token, restanteMs) => ({ motivo: "ok", restanteMs, entrada: { token } });
  it("el umbral de edad son 45 min (la vida de 60 menos el margen de 15)", () => {
    expect(UMBRAL_EDAD_MS).toBe(45 * MIN);
  });
  it("el del proceso es el de la caché y tiene menos de 45 min: no renueva", () => {
    expect(planDeToken({ tokenEnv: TOKEN_CACHE, lectura: ok(TOKEN_CACHE, 20 * MIN) })).toEqual({ accion: "usar-entorno", resultado: "sin-renovar", motivo: "-" });
  });
  it("el del proceso es el de la caché y tiene 45 min o más: canjea por edad", () => {
    expect(planDeToken({ tokenEnv: TOKEN_CACHE, lectura: ok(TOKEN_CACHE, 15 * MIN) })).toMatchObject({ accion: "canjear", resultado: "renovada", motivo: "vencida-por-edad" });
    expect(planDeToken({ tokenEnv: TOKEN_CACHE, lectura: ok(TOKEN_CACHE, 5 * MIN) })).toMatchObject({ accion: "canjear", motivo: "vencida-por-edad" });
  });
  it("la caché tiene otro token vigente: usa el de la caché, sin canjear", () => {
    expect(planDeToken({ tokenEnv: TOKEN_VIEJO, lectura: ok(TOKEN_CACHE, 40 * MIN) })).toEqual({ accion: "usar-cache", resultado: "renovada", motivo: "cache-mas-nueva" });
  });
  it("la caché no tiene ninguno vigente (ausente, caducada o casi): canjea", () => {
    for (const lectura of [{ motivo: "ausente" }, { motivo: "caducado" }, ok(TOKEN_CACHE, 10 * MIN)]) {
      expect(planDeToken({ tokenEnv: TOKEN_VIEJO, lectura })).toMatchObject({ accion: "canjear", resultado: "renovada", motivo: "vencida-por-edad" });
    }
  });
  it("sin token en el entorno y sin caché: edad desconocida, canjea", () => {
    expect(planDeToken({ tokenEnv: null, lectura: { motivo: "ausente" } })).toMatchObject({ accion: "canjear" });
  });
});

describe("ghConRenovacion: una sola llamada, con el token elegido antes", () => {
  it("token heredado de 90 min y caché caducada: UNA llamada con el token fresco y la línea renovada/vencida-por-edad", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: -1 * MIN }); // caducada: leerCache la da por «caducado»
    const salida = ghConRenovacion(["issue", "comment", "7", "-b", "hola"], { env: { GH_TOKEN: TOKEN_VIEJO, PATH: "x" } }, m.deps);
    expect(salida).toBe("ok");
    expect(m.llamadas).toHaveLength(1);
    expect(m.canjes).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_NUEVO);
    expect(m.llamadas[0].args).toEqual(["issue", "comment", "7", "-b", "hola"]);
    expect(m.lineas).toEqual(["credencial-sesion resultado: renovada motivo: vencida-por-edad"]);
  });
  it("el entorno de la llamada es explícito: lleva el token elegido y respeta el resto del entorno dado", () => {
    const m = montaje();
    let visto;
    m.deps.ejecutar = (c, a, o) => {
      visto = o.env;
      return "";
    };
    ghConRenovacion(["api", "user"], { env: { GH_TOKEN: TOKEN_VIEJO, OTRA: "1" } }, m.deps);
    expect(visto.OTRA).toBe("1");
    expect(tachado(visto.GH_TOKEN)).toBe(TOKEN_NUEVO);
  });
  it("token de menos de 45 min igual al de la caché: ni renueva ni canjea", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 30 * MIN }); // edad 30 min
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_CACHE } }, m.deps);
    expect(m.canjes).toHaveLength(0);
    expect(m.llamadas).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_CACHE);
    expect(m.lineas).toEqual(["credencial-sesion resultado: sin-renovar motivo: -"]);
  });
  it("sin-renovar se dice una sola vez por proceso", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 30 * MIN });
    for (let i = 0; i < 3; i++) ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_CACHE } }, m.deps);
    expect(m.llamadas).toHaveLength(3);
    expect(m.lineas).toHaveLength(1);
  });
  it("token del proceso igual al de la caché con 45 min o más: canjea y llama con el nuevo", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 10 * MIN }); // edad 50 min
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_CACHE } }, m.deps);
    expect(m.canjes).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_NUEVO);
    expect(m.lineas).toEqual(["credencial-sesion resultado: renovada motivo: vencida-por-edad"]);
  });
  it("token del proceso distinto del de una caché vigente: la única llamada lleva el de la caché, sin canjear", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 40 * MIN });
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(m.canjes).toHaveLength(0);
    expect(m.llamadas).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_CACHE);
    expect(m.lineas).toEqual(["credencial-sesion resultado: renovada motivo: cache-mas-nueva"]);
  });
  it("si el canje falla: la llamada se hace igual, una vez, con el token que había, y sale fallo con la causa", () => {
    const m = montaje({ renovacion: "red" });
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(m.llamadas).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_VIEJO);
    expect(m.lineas).toEqual(["credencial-sesion resultado: fallo motivo: red"]);
  });
  it("tras un canje fallido, durante 30 s no se canjea otra vez: fallo/fallo-reciente y la llamada se hace igual, una vez", () => {
    const m = montaje({ renovacion: "limite-de-1password" });
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(falloReciente({ ruta: m.ruta, reloj: () => T + 10_000, ...LIBRE })).toBe("limite-de-1password");
    m.deps.reloj = () => T + 10_000;
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(m.canjes).toHaveLength(1); // el segundo no canjeó
    expect(m.llamadas).toHaveLength(2); // una por cada ghConRenovacion
    expect(tachado(m.llamadas[1].token)).toBe(TOKEN_VIEJO);
    expect(m.lineas).toEqual(["credencial-sesion resultado: fallo motivo: limite-de-1password", "credencial-sesion resultado: fallo motivo: fallo-reciente"]);
  });
  it("sin token en el entorno (ausente o vacío) y el canje roto: la llamada va con el token de relleno, no con el llavero", () => {
    for (const env of [{ PATH: "x" }, { PATH: "x", GH_TOKEN: "" }]) {
      const m = montaje({ renovacion: "sin-clave" });
      ghConRenovacion(["api", "user"], { env }, m.deps);
      expect(m.llamadas).toHaveLength(1);
      expect(m.llamadas[0].token).toBe(TOKEN_CENTINELA);
    }
  });
  it("en GitHub Actions sin GH_TOKEN no se pone el token de relleno: no se toca nada", () => {
    const m = montaje();
    ghConRenovacion(["pr", "list"], { env: { PATH: "x", GITHUB_ACTIONS: "true" } }, m.deps);
    expect(m.llamadas[0].token).toBeUndefined();
    expect(m.canjes).toHaveLength(0);
  });
  it("un GH_TOKEN propio que no es de la App (una sesión de la nube) no se pisa ni se canjea", () => {
    const m = montaje();
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: "github_pat_de_la_nube" } }, m.deps);
    expect(m.canjes).toHaveLength(0);
    expect(m.llamadas[0].token).toBe("github_pat_de_la_nube");
    expect(m.lineas).toEqual(["credencial-sesion resultado: sin-renovar motivo: -"]);
  });
  it("el canje recibe el entorno de quien llama", () => {
    const m = montaje();
    let visto;
    m.deps.renovar = (o) => {
      visto = o;
      return { motivo: "red" };
    };
    const env = { GH_TOKEN: TOKEN_VIEJO, MARCA: "mia" };
    ghConRenovacion(["pr", "list"], { env }, m.deps);
    expect(visto.env).toBe(env);
  });
  it("lanza el gh real que dice buscarGh (el mismo camino en todos los sistemas)", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 30 * MIN });
    m.deps.buscarGh = () => "C:/real/gh.exe";
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_CACHE } }, m.deps);
    expect(m.llamadas[0].cmd).toBe("C:/real/gh.exe");
  });
  it("50 llamadas pasada la hora dejan UNA línea por pareja resultado × motivo, no 50", () => {
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: -1 * MIN });
    for (let i = 0; i < 50; i++) ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(m.llamadas).toHaveLength(50);
    expect(m.lineas).toEqual(["credencial-sesion resultado: renovada motivo: vencida-por-edad", "credencial-sesion resultado: renovada motivo: cache-mas-nueva"]);
    expect(m.canjes).toHaveLength(1);
  });
  it("50 llamadas con el canje roto también dejan una línea de fallo por motivo", () => {
    const m = montaje({ renovacion: "red" });
    for (let i = 0; i < 50; i++) ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps);
    expect(m.lineas.length).toBeLessThanOrEqual(2);
    expect(new Set(m.lineas).size).toBe(m.lineas.length);
  });
  it("en GitHub Actions no toca nada: ni caché ni canje", () => {
    const m = montaje();
    ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_VIEJO, GITHUB_ACTIONS: "true" } }, m.deps);
    expect(m.canjes).toHaveLength(0);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_VIEJO);
  });
});

describe("sin reintento: una escritura no se repite", () => {
  it("token heredado de 90 min en una escritura que contesta 5xx: una sola llamada, con el token fresco, y el error llega a quien llama", () => {
    const e = Object.assign(new Error("Command failed"), { status: 1, stderr: "HTTP 502: Bad Gateway" });
    const m = montaje({ ghFalla: e });
    expect(() => ghConRenovacion(["issue", "comment", "7", "-b", "hola"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps)).toThrow(/Command failed/);
    expect(m.llamadas).toHaveLength(1);
    expect(tachado(m.llamadas[0].token)).toBe(TOKEN_NUEVO);
    expect(m.canjes).toHaveLength(1);
  });
  it("tiempo agotado después de escribir: tampoco hay segunda llamada", () => {
    const e = Object.assign(new Error("spawnSync gh ETIMEDOUT"), { code: "ETIMEDOUT" });
    const m = montaje({ ghFalla: e });
    expect(() => ghConRenovacion(["pr", "merge", "9"], { env: { GH_TOKEN: TOKEN_VIEJO } }, m.deps)).toThrow(/ETIMEDOUT/);
    expect(m.llamadas).toHaveLength(1);
  });
  it("ni siquiera un 401 se reintenta: no se lee la respuesta", () => {
    const e = Object.assign(new Error("Command failed"), { status: 1, stderr: "HTTP 401: Bad credentials" });
    const m = montaje({ cacheToken: TOKEN_CACHE, restanteMs: 30 * MIN, ghFalla: e });
    expect(() => ghConRenovacion(["pr", "list"], { env: { GH_TOKEN: TOKEN_CACHE } }, m.deps)).toThrow();
    expect(m.llamadas).toHaveLength(1);
    expect(m.canjes).toHaveLength(0);
  });
  it("el código fuente del punto no tiene bucle ni catch alrededor de la llamada", () => {
    const src = readFileSync(join(RAIZ, "scripts", "lib", "ghConRenovacion.mjs"), "utf8");
    const cuerpo = src.slice(src.indexOf("export function ghConRenovacion"), src.indexOf("export const _reiniciarAvisos"));
    expect(cuerpo).not.toMatch(/\b(for|while|catch|retry|reintent)/i);
    expect(cuerpo.match(/ejecutar\(/g)).toHaveLength(1);
  });
});

describe("el canje de verdad (`renovarEnCache`) y el motivo que deja", () => {
  it("lanza token-sesion.mjs --comprobar con node, sin shell, y no recoge stdout (el token no pasa por aquí)", () => {
    let visto;
    const r = renovarEnCache({ correr: (cmd, args, op) => ((visto = { cmd, args, op }), { status: 0 }) });
    expect(r).toEqual({ ok: true });
    expect(visto.cmd).toBe(process.execPath);
    expect(visto.args[0]).toMatch(/token-sesion\.mjs$/);
    expect(visto.args[1]).toBe("--comprobar");
    expect(visto.op.shell).toBeUndefined();
    expect(visto.op.stdio[1]).toBe("ignore");
  });
  it("el motivo sale de lo que dice token-sesion al fallar; lo que no es de causa cae en error-interno", () => {
    expect(motivoDeSalida("token-sesion resultado: fallo motivo: sin-clave (x)")).toBe("sin-clave");
    expect(motivoDeSalida("token-sesion resultado: fallo motivo: red (GitHub no contesta)")).toBe("red");
    expect(motivoDeSalida("token-sesion resultado: fallo motivo: vencida-por-edad")).toBe("error-interno");
    expect(motivoDeSalida("")).toBe("error-interno");
    expect(motivoDeSalida(undefined)).toBe("error-interno");
  });
  it("un tiempo agotado es `red`; un fallo al lanzar, `error-interno`", () => {
    expect(renovarEnCache({ correr: () => ({ error: { code: "ETIMEDOUT" } }) })).toEqual({ motivo: "red" });
    expect(renovarEnCache({ correr: () => ({ error: { code: "ENOENT" } }) })).toEqual({ motivo: "error-interno" });
  });
  it("si el canje dice ok pero la caché no quedó escrita: fallo/error-interno, con el token que había", () => {
    const ruta = rutaTemporal();
    const r = elegirToken({ env: { GH_TOKEN: TOKEN_VIEJO }, ruta, ids: IDS, reloj: () => T, cache: LIBRE, renovar: () => ({ ok: true }) });
    expect(r).toEqual({ token: TOKEN_VIEJO, resultado: "fallo", motivo: "error-interno" });
    // y no se vuelve a probar en 30 s
    expect(falloReciente({ ruta, reloj: () => T + 5000, ...LIBRE })).toBe("error-interno");
  });
});

// ── El barrido ───────────────────────────────────────────────────────────────────────────────────
// El comando es el del fondo #715. `--untracked` suma los ficheros nuevos aún sin `git add`, para que el
// test también los vea antes del commit.
export const COMANDO_BARRIDO = String.raw`git grep -nE "(\w+)\(\s*[\"']gh[\"']\s*," -- scripts .claude/hooks ':!*.test.js'`;
const PATRON_BARRIDO = String.raw`(\w+)\(\s*["']gh["']\s*,`;
export const PUNTO = "scripts/lib/ghConRenovacion.mjs";
/**
 * El punto de llamada es `ghSync`/`execFileGh` de `scripts/lib/cuotaGh.mjs` (#724), cuyo `ejecutar` por defecto es
 * `ghConRenovacion`. Los 10 que pasan por él llaman a `ghSync` y NO importan `ghConRenovacion` directamente.
 */
export const PUNTO_DE_LLAMADA = "scripts/lib/cuotaGh.mjs";
/** Los 10 migrados. */
export const MIGRADOS = [
  "scripts/cumplimiento.mjs", "scripts/dimensionar.mjs", "scripts/espera-ci.mjs", "scripts/fabrica.mjs", "scripts/issues.mjs",
  "scripts/podar.mjs", "scripts/retirar.mjs", "scripts/situacion.mjs", "scripts/lib/lleva.mjs", "scripts/lib/planos.mjs",
];
/** Las 6 excepciones, cada una con su motivo (el del cuerpo de #731). `ghSync`/`execFileGh` de `avisos.mjs` y `tokenSesion.mjs` pasan su propio `ejecutar`. */
export const EXCEPCIONES = {
  ".claude/hooks/avisos.mjs": "hook: llama a `ghSync` de cuotaGh con su propio `ejecutar` (sin renovar): es un aviso que ya falla abierto con su tiempo corto; renovar dentro suma 0,25 s o más a cada orden",
  ".claude/hooks/guardia.mjs": "hook: es un filtro que ya falla abierto con su propio tiempo corto; renovar dentro suma 0,25 s o más a cada orden",
  ".claude/hooks/migraciones.mjs": "hook: es un aviso que ya falla abierto con su propio tiempo corto; renovar dentro suma 0,25 s o más a cada orden",
  "scripts/lib/tokenSesion.mjs": "llama a `execFileGh` con su propio `ejecutar` (sin renovar): su `gh api user` es la comprobación de identidad con un token recién canjeado y env explícito: es el propio canje",
  "scripts/lib/cupos.mjs": "mide el cupo de una identidad concreta y su fallo `sin-token` es el dato: renovar falsearía la medida",
  "scripts/rulesets.mjs": "`gh auth token` no es una llamada a la API, es el acceso de Pablo",
};

/** Ficheros con una llamada a `gh` a pelo que no son el punto ni una excepción. Función pura sobre la salida de `git grep -n`. */
export function llamadasFueraDelPunto(salidaGrep, { punto = PUNTO, excepciones = Object.keys(EXCEPCIONES) } = {}) {
  const ficheros = new Set(
    String(salidaGrep)
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split(":")[0]),
  );
  return [...ficheros].filter((f) => f !== punto && !excepciones.includes(f)).sort();
}

const barrer = () => {
  try {
    return execFileSync("git", ["grep", "--untracked", "-nE", PATRON_BARRIDO, "--", "scripts", ".claude/hooks", ":!*.test.js"], { cwd: RAIZ, encoding: "utf8" });
  } catch (e) {
    if (e.status === 1) return ""; // git grep sale con 1 si no encuentra nada
    throw e;
  }
};

describe(`el barrido de llamadas a gh (${COMANDO_BARRIDO})`, () => {
  it("ningún script llama a `gh` a pelo fuera del punto único y de las 6 excepciones", () => {
    expect(llamadasFueraDelPunto(barrer())).toEqual([]);
  });
  it("el criterio detecta una llamada nueva (se ve fallar): un fichero ajeno a la lista sale", () => {
    const salida = `${barrer()}\nscripts/nuevo-script.mjs:3:  execFileSync("gh", ["api", "user"], {})\nscripts/otro.mjs:9:execFile( 'gh' , args)`;
    expect(llamadasFueraDelPunto(salida)).toEqual(["scripts/nuevo-script.mjs", "scripts/otro.mjs"]);
  });
  it("son 16 ficheros: 10 migrados + 6 excepciones, y no se solapan", () => {
    expect(MIGRADOS).toHaveLength(10);
    expect(Object.keys(EXCEPCIONES)).toHaveLength(6);
    expect(new Set([...MIGRADOS, ...Object.keys(EXCEPCIONES)]).size).toBe(16);
  });
  it("cada excepción sigue llamando a `gh` a pelo (si deja de hacerlo, se quita de la lista) y tiene su motivo", () => {
    const hoy = new Set(barrer().split("\n").filter(Boolean).map((l) => l.split(":")[0]));
    for (const [f, motivo] of Object.entries(EXCEPCIONES)) {
      expect(hoy.has(f), `${f} ya no llama a gh a pelo: sácalo de EXCEPCIONES`).toBe(true);
      expect(motivo.length).toBeGreaterThan(20);
    }
  });
  it("los 10 migrados llaman a `ghSync`/`execFileGh` de cuotaGh, no importan `ghConRenovacion` y no llaman a `gh` a pelo", () => {
    const hoy = new Set(barrer().split("\n").filter(Boolean).map((l) => l.split(":")[0]));
    for (const f of MIGRADOS) {
      const texto = readFileSync(join(RAIZ, f), "utf8");
      expect(texto, f).toMatch(/\b(ghSync|execFileGh)\b/);
      expect(texto, f).not.toMatch(/ghConRenovacion/);
      expect(hoy.has(f), `${f} sigue llamando a gh a pelo`).toBe(false);
    }
  });
  it("el punto de llamada (cuotaGh) renueva por defecto: es el único sitio que importa ghConRenovacion", () => {
    const texto = readFileSync(join(RAIZ, PUNTO_DE_LLAMADA), "utf8");
    expect(texto).toMatch(/import \{ ghConRenovacion \} from "\.\/ghConRenovacion\.mjs"/);
    expect(texto).toMatch(/ejecutar = ghSyncRenovando/);
    expect(texto).toMatch(/ejecutar = execFileRenovando/);
    const importadores = execFileSync("git", ["grep", "--untracked", "-lE", "import .*ghConRenovacion", "--", "scripts", ".claude/hooks", ":!*.test.js"], { cwd: RAIZ, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(importadores).toEqual([PUNTO_DE_LLAMADA]);
  });
});
