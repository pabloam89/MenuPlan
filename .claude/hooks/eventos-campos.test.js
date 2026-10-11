import { describe, expect, it, vi } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `op` de mentira para ver las líneas de env-boveda y del registro de lecturas; todo lo demás
// (git, node) corre de verdad.
vi.mock("node:child_process", async (original) => {
  const real = await original();
  return {
    ...real,
    execFileSync: (cmd, args, opts) => {
      if (cmd !== "op") return real.execFileSync(cmd, args, opts);
      const mala = [...(globalThis.__noExisten ?? [])].find((ref) => opts?.input?.includes(`{{ ${ref} }}`));
      if (mala) throw Object.assign(new Error("Command failed: op inject"), { status: 1, stderr: `[ERROR] could not resolve item UUID for ${mala}\n` });
      return String(opts?.input ?? "").split("\n").map((l) => l.replace(/\{\{ (op:\/\/[^}]+) \}\}/, (_, ref) => `VALOR-de-${ref.trim()}`)).join("\n");
    },
  };
});

import { EVENTOS, FUENTES, TEMAS_ESTADO, lineaDeEvento, registrarEvento } from "./eventos.mjs";
import { APIS_GH, CALLERS_GH, lineaGh } from "../../scripts/lib/cuotaGh.mjs";
import { cargarEnv } from "../../scripts/lib/env.mjs";

/**
 * #579 (C11 de la auditoría de agentes): ninguna línea que dejan los hooks y los scripts para
 * poder contar lleva un dato que no debe estar ahí. El repo es público y el registro de eventos
 * vive fuera de él (por eso mismo: sin rutas de usuario, comandos, textos libres, correos ni claves).
 *
 * El escáner (`camposProhibidos`) mira cada VALOR de una línea, sea JSON (`eventos.jsonl`,
 * `op-lecturas.jsonl`) o de la forma `campo: valor` (`gh: caller=… api=…`, `env-boveda clave: …`).
 * Vale para cualquier línea nueva: basta pasarla por aquí.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const temporal = (p) => mkdtempSync(join(tmpdir(), p));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las categorías prohibidas, cada una con lo que la delata. */
const PROHIBIDOS = {
  "ruta-de-usuario": /(?:^|[\s"'=(])(?:[A-Za-z]:[\\/]|\\\\|~[\\/])|[\\/](?:Users|home)[\\/]|OneDrive|AppData/i,
  "comando": /(?:^|\s)(?:npm|npx|node|git|gh|op|vercel|curl|psql|bash|powershell|rm|cat|sudo)\s+\S|&&|\|\||\$\(|`|\s--?[a-z][\w-]*(?:\s|=|$)/,
  "correo": /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/,
  "clave": /(?:^|[^A-Za-z0-9])(?:ops_|sk-|ghp_|gho_|ghs_|ghu_|github_pat_|xox[abp]-|AKIA|eyJ)\w{4,}|[A-Za-z][\w+-]*:\/\/\S|[A-Za-z0-9+/=_]{32,}/,
};
/** Un valor corto: ni más de 80 caracteres ni más de 6 palabras (un nombre, un id, un número). */
const LARGO_MAX = 80;
const PALABRAS_MAX = 6;

/** Las categorías en que cae un texto suelto. */
function categoriasDe(v) {
  const s = String(v);
  if (UUID.test(s)) return [];
  const c = Object.entries(PROHIBIDOS).filter(([, re]) => re.test(s)).map(([k]) => k);
  if (s.length > LARGO_MAX || s.split(/\s+/).filter(Boolean).length > PALABRAS_MAX) c.push("texto-libre");
  return c;
}

/** Todos los valores de un JSON (objetos y listas anidados), con el campo al que pertenecen. */
function* valoresDe(x, campo = "") {
  if (x === null || typeof x === "boolean" || typeof x === "number") return;
  if (typeof x === "string") yield [campo, x];
  else if (Array.isArray(x)) for (const y of x) yield* valoresDe(y, campo);
  else for (const [k, y] of Object.entries(x)) yield* valoresDe(y, k);
}

/**
 * [{ campo, valor, categoria }] de una línea: JSON o `campo: valor` / `campo=valor`.
 * Una línea que no se deja trocear en campos se mira entera (y un texto libre largo la delata).
 */
function camposProhibidos(linea) {
  const texto = String(linea).trim();
  let pares;
  try {
    pares = [...valoresDe(JSON.parse(texto))];
  } catch {
    pares = [...texto.matchAll(/([\w-]+)(?::\s|=)(\S+)/g)].map((m) => [m[1], m[2]]);
    // La parte sin campos (el tipo de la línea, «env-boveda clave») no lleva más que palabras sueltas.
    const resto = texto.replace(/([\w-]+)(?::\s|=)(\S+)/g, " ").trim();
    pares.push(["(tipo)", resto]);
    pares.push(["(línea)", texto.length > 300 ? texto : ""]);
  }
  return pares.flatMap(([campo, valor]) => categoriasDe(valor).map((categoria) => ({ campo, valor, categoria })));
}

describe("el escáner: cada categoría prohibida se detecta, y lo normal pasa", () => {
  it.each([
    ["ruta-de-usuario", '{"nombre":"C:\\\\Users\\\\pablo\\\\x"}'],
    ["ruta-de-usuario", '{"cwd":"/home/pablo/MenuPlan"}'],
    ["ruta-de-usuario", "script: C:/dev/MenuPlan/x.mjs"],
    ["ruta-de-usuario", "ruta: ~/.menuplan/op-lecturas.jsonl"],
    ["comando", '{"nombre":"git push --force origin main"}'],
    ["comando", '{"nombre":"npm run issues"}'],
    ["comando", '{"nombre":"ls && rm -rf x"}'],
    ["correo", '{"actor":"pablo@gmail.com"}'],
    ["correo", "quien: pablo@example.org"],
    ["clave", '{"nombre":"ghp_abcdefghijklmnopqrstuvwxyz0123456789"}'],
    ["clave", '{"nombre":"ops_eyJhbGciOiJIUzI1NiIs"}'],
    ["clave", "url: postgres://u:p@host:5432/db"],
    ["clave", "ref: op://HoMenu/Supabase/SUPABASE_DB_URL"],
    ["clave", '{"x":"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd"}'],
    ["texto-libre", '{"nombre":"Esto es un texto libre bastante largo que alguien pegó aquí sin querer"}'],
    ["texto-libre", `{"motivo":"${"a".repeat(81)}"}`],
  ])("%s: %s", (categoria, linea) => {
    expect(camposProhibidos(linea).map((c) => c.categoria)).toContain(categoria);
  });

  it.each([
    '{"id":"2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f","ts":"2026-10-11T08:00:00.000Z","sesion":"2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f","fuente":"guardia","actor":"homenu-sesiones[bot]","rama":"ops/579-hooks-estado-eventos","issue":579,"evento":"bloqueo_guardia","nombre":"push-a-main","codigo":"main-solo-pablo"}',
    '{"cuando":"2026-10-11T08:00:00.000Z","script":"tarea.mjs","claves":3,"reintento":false}',
    "gh: caller=issues api=graphql",
    "env-boveda clave: SUPABASE_DB_URL de: HoMenu-sesiones a: HoMenu motivo: respaldo",
    "env-boveda clave: GROQ_API_KEY motivo: sin-acceso",
    "estado-fresco freno motivo: sin-lectura",
  ])("una línea normal no salta: %s", (linea) => {
    expect(camposProhibidos(linea)).toEqual([]);
  });
});

describe("el registro de eventos: con entradas hostiles no escribe nada prohibido", () => {
  const HOSTILES = [
    "git push --force origin main",
    "C:\\Users\\pablo\\OneDrive\\x.txt",
    "/home/pablo/MenuPlan",
    "pablo@gmail.com",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "ops_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    "postgres://u:p@host/db",
    "op://HoMenu/Supabase/SUPABASE_DB_URL",
    "un texto libre largo que alguien pegó en el sitio del nombre sin querer",
    "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd",
  ];

  it("lineaDeEvento nunca deja pasar un valor hostil en nombre, codigo, tema, sesion, rama, fuente ni actor", () => {
    for (const evento of EVENTOS) {
      for (const h of HOSTILES) {
        const l = lineaDeEvento({ evento, nombre: h, codigo: h, tema: h, sesion: h, rama: h, fuente: h, actor: h }, new Date("2026-10-11T08:00:00Z"), "00000000-0000-4000-8000-000000000000");
        if (l) expect(camposProhibidos(JSON.stringify(l)), `${evento} con ${h}`).toEqual([]);
      }
    }
  });

  it("cada evento y cada fuente del vocabulario, con valores buenos, sale limpio", () => {
    for (const evento of EVENTOS) {
      for (const fuente of FUENTES) {
        const l = lineaDeEvento({ evento, nombre: "sin-lectura", codigo: "main-solo-pablo", tema: TEMAS_ESTADO[1], sesion: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f", rama: "ops/579-hooks-estado-eventos", fuente, actor: "homenu-sesiones[bot]" });
        expect(camposProhibidos(JSON.stringify(l)), `${evento}/${fuente}`).toEqual([]);
      }
    }
  });

  it("un nombre con forma de clave se rechaza, también el que cabría en NOMBRE_OK", () => {
    expect(lineaDeEvento({ evento: "skill_cargada", nombre: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" })).toBeNull();
    expect(lineaDeEvento({ evento: "skill_cargada", nombre: "a".repeat(40) })).toBeNull();
    expect(lineaDeEvento({ evento: "skill_cargada", nombre: "alta-de-secreto" })).not.toBeNull();
  });

  it("registrarEvento con una carpeta y una sesión hostiles escribe líneas limpias en el fichero", () => {
    const dir = temporal("eventos-campos-");
    for (const h of HOSTILES) registrarEvento({ evento: "skill_cargada", nombre: h, sesion: h, rama: h, cwd: h }, { dir });
    registrarEvento({ evento: "skill_cargada", nombre: "github", sesion: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f" }, { dir });
    const lineas = readFileSync(join(dir, "eventos.jsonl"), "utf8").trim().split("\n");
    expect(lineas).toHaveLength(1);
    expect(camposProhibidos(lineas[0])).toEqual([]);
  });

  describe("los hooks de verdad, lanzados con entradas hostiles", () => {
    const HOSTIL = "C:\\Users\\pablo\\OneDrive\\x pablo@gmail.com ghp_abcdefghijklmnopqrstuvwxyz0123456789 npm run issues --nuevo";
    const lanza = (script, entrada, dir) => spawnSync(process.execPath, [join(AQUI, script)], {
      input: JSON.stringify(entrada), encoding: "utf8", timeout: 20000,
      env: { ...process.env, MENUPLAN_FABRICA_DIR: dir, MENUPLAN_BUSCAR_DIR: temporal("eventos-buscar-") },
    });
    const repo = () => {
      const r = temporal("eventos-campos-repo-");
      execFileSync("git", ["init", "-q", r]);
      return r;
    };
    const lineasDe = (dir) => readFileSync(join(dir, "eventos.jsonl"), "utf8").trim().split("\n");

    it("la guardia que bloquea un comando con rutas, correo y clave anota el aviso y nada del comando", () => {
      const dir = temporal("eventos-campos-g-");
      const r = lanza("guardia.mjs", { session_id: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f", cwd: repo(), tool_name: "Bash", tool_input: { command: `git stash # ${HOSTIL}` } }, dir);
      expect(r.status).toBe(0);
      const lineas = lineasDe(dir);
      expect(lineas.length).toBeGreaterThan(0);
      for (const l of lineas) expect(camposProhibidos(l)).toEqual([]);
      expect(lineas.join("\n")).not.toMatch(/pablo|ghp_|OneDrive/);
    });

    it("skill-abierta con un subagent_type y un prompt hostiles anota solo el tipo de agente", () => {
      const dir = temporal("eventos-campos-s-");
      lanza("skill-abierta.mjs", { session_id: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f", cwd: repo(), tool_name: "Agent", tool_input: { subagent_type: HOSTIL, prompt: HOSTIL } }, dir);
      lanza("skill-abierta.mjs", { session_id: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f", cwd: repo(), tool_name: "Agent", tool_input: { subagent_type: "gobierno", prompt: HOSTIL } }, dir);
      const lineas = lineasDe(dir);
      for (const l of lineas) expect(camposProhibidos(l)).toEqual([]);
      expect(lineas.map((l) => JSON.parse(l).nombre)).toEqual(["otro", "gobierno"]);
    });

    it("el freno del estado fresco, con un mensaje que lo cita todo, anota el motivo y el tema y nada del mensaje", () => {
      const dir = temporal("eventos-campos-p-");
      const tr = join(dir, "t.jsonl");
      writeFileSync(tr, JSON.stringify({ type: "user", uuid: "u1", timestamp: new Date(Date.now() - 60_000).toISOString(), message: { content: "hola" } }));
      const r = lanza("pendientes.mjs", { session_id: "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f", cwd: repo(), transcript_path: tr, last_assistant_message: `El CI está verde. ${HOSTIL}` }, dir);
      expect(JSON.parse(r.stdout).decision).toBe("block");
      const lineas = lineasDe(dir);
      expect(lineas).toHaveLength(1);
      expect(camposProhibidos(lineas[0])).toEqual([]);
      expect(JSON.parse(lineas[0])).toMatchObject({ evento: "estado_sin_leer", nombre: "sin-lectura", tema: "ci" });
    });
  });
});

describe("las líneas estructuradas de los scripts que ya tienen test", () => {
  it("cupo de GitHub: gh: caller=… api=… con cualquier caller (también uno hostil) sale limpio", () => {
    for (const caller of [...CALLERS_GH, "C:\\Users\\pablo\\x", "pablo@gmail.com", "npm run issues"]) {
      for (const api of [...APIS_GH, "ghp_abcdefghijklmnopqrstuvwxyz0123456789"]) {
        expect(camposProhibidos(lineaGh(caller, api)), `${caller}/${api}`).toEqual([]);
      }
    }
  });

  it("env-boveda: la línea de respaldo y la de sin-acceso nombran la clave y las bóvedas, y nada más", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = join(temporal("eventos-campos-op-"), "op-lecturas.jsonl");
    process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_de_prueba";
    process.env.MENUPLAN_OP_LOG = log;
    globalThis.__noExisten = new Set(["op://HoMenu-sesiones/Nueva/PRUEBA_CAMPOS_A", "op://HoMenu-sesiones/Nueva/PRUEBA_CAMPOS_B", "op://HoMenu/Nueva/PRUEBA_CAMPOS_B"]);
    process.env.PRUEBA_CAMPOS_A = "op://HoMenu-sesiones/Nueva/PRUEBA_CAMPOS_A";
    process.env.PRUEBA_CAMPOS_B = "op://HoMenu-sesiones/Nueva/PRUEBA_CAMPOS_B";
    try {
      cargarEnv(["PRUEBA_CAMPOS_A", "PRUEBA_CAMPOS_B"], { tolerante: true });
      const lineas = aviso.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("env-boveda"));
      expect(lineas).toEqual([
        "env-boveda clave: PRUEBA_CAMPOS_A de: HoMenu-sesiones a: HoMenu motivo: respaldo",
        "env-boveda clave: PRUEBA_CAMPOS_B motivo: sin-acceso",
      ]);
      for (const l of lineas) expect(camposProhibidos(l), l).toEqual([]);
      // El registro de lecturas a 1Password (#556): una línea JSON por llamada, sin valores ni direcciones.
      const registro = readFileSync(log, "utf8").trim().split("\n");
      expect(registro.length).toBeGreaterThan(0);
      for (const l of registro) {
        expect(camposProhibidos(l), l).toEqual([]);
        expect(Object.keys(JSON.parse(l)).sort()).toEqual(["claves", "cuando", "reintento", "script"]);
      }
    } finally {
      aviso.mockRestore();
      for (const k of ["OP_SERVICE_ACCOUNT_TOKEN", "MENUPLAN_OP_LOG", "PRUEBA_CAMPOS_A", "PRUEBA_CAMPOS_B"]) delete process.env[k];
      delete globalThis.__noExisten;
    }
  });
});
