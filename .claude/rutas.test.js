import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Las reglas por carpeta, las skills y los agentes citan rutas del repo. Una
 * ruta que ya no existe no da error en Claude Code: la regla manda a leer un
 * fichero que no está y nadie se entera. Este test falla en cuanto se rompe
 * una, y también si un glob de `paths:` ya no casa con ningún fichero (la
 * regla no se cargaría nunca).
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

const ficherosDe = (dir, filtro) => (existsSync(dir) ? readdirSync(dir).filter(filtro).map((f) => join(dir, f)) : []);
const DOCUMENTOS = [
  ...ficherosDe(join(AQUI, "rules"), (f) => f.endsWith(".md")),
  ...ficherosDe(join(AQUI, "agents"), (f) => f.endsWith(".md")),
  ...(existsSync(join(AQUI, "skills"))
    ? readdirSync(join(AQUI, "skills")).map((d) => join(AQUI, "skills", d, "SKILL.md")).filter(existsSync)
    : []),
];

// Solo lo que está en git, y comparado como texto: en Windows existsSync no
// distingue mayúsculas y da por buena una cita mal escrita que en el CI de
// Linux falla; y un fichero sin commitear existe aquí pero no en el CI.
const REPO = execFileSync("git", ["ls-files", "--cached"], { cwd: RAIZ, encoding: "utf8" })
  .split("\n").filter(Boolean);
const EN_REPO = new Set(REPO);
const NOMBRES = new Set(REPO.map((f) => basename(f)));

const PREFIJOS = /^\.?(?:src|api|scripts|supabase|docs|ops|specs|\.claude|\.github|public)\//;
const EXTENSION = /\.(?:md|js|mjs|json)$/;

/** Rutas citadas entre comillas invertidas, sin comodines ni marcadores. */
export function rutasCitadas(texto) {
  const r = new Set();
  for (const [, crudo] of texto.matchAll(/`([^`\n]+)`/g)) {
    const t = crudo.replace(/:\d+$/, "").replace(/[.,;)]+$/, "");
    if (/[\s*?<>{}$]|:\/\//.test(t)) continue;
    if (PREFIJOS.test(t) || EXTENSION.test(t)) r.add(t);
  }
  return [...r];
}

// La memoria de un agente con `memory: project` la crea Claude Code al
// usarla; que aún no exista no es una ruta rota.
const EN_TIEMPO_DE_USO = /^\.claude\/agent-memory\//;

/** Existe en el árbol; un nombre suelto vale si está en cualquier carpeta. */
function existe(ruta) {
  if (EN_TIEMPO_DE_USO.test(ruta)) return true;
  const r = ruta.replace(/\/$/, "");
  if (EN_REPO.has(r) || REPO.some((f) => f.startsWith(`${r}/`))) return true;
  return !r.includes("/") && NOMBRES.has(r);
}

/** Los globs del frontmatter `paths:` de una regla. */
export function globsDe(texto) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(texto.replace(/\r\n/g, "\n"));
  if (!fm) return [];
  const bloque = /^paths:\s*\n((?:\s+-\s+.*\n?)+)/m.exec(fm[1] + "\n");
  if (!bloque) return [];
  return [...bloque[1].matchAll(/-\s+["']?([^"'\n]+?)["']?\s*$/gm)].map((m) => m[1]);
}

const rel = (f) => f.slice(RAIZ.length + 1).split("\\").join("/");

describe("rutas: lo que citan reglas, skills y agentes existe", () => {
  it.each(DOCUMENTOS.map((f) => [rel(f), f]))("%s", (nombre, f) => {
    const rotas = rutasCitadas(readFileSync(f, "utf8")).filter((r) => !existe(r));
    expect(rotas, `actualiza la ruta en ${nombre} o borra la mención`).toEqual([]);
  });
});

describe("rutas: cada glob de paths: casa con algún fichero", () => {
  const reglas = ficherosDe(join(AQUI, "rules"), (f) => f.endsWith(".md"));
  it("hay reglas por carpeta", () => {
    expect(reglas.length).toBeGreaterThan(0);
  });
  it.each(reglas.map((f) => [rel(f), f]))("%s", (nombre, f) => {
    const globs = globsDe(readFileSync(f, "utf8"));
    expect(globs.length, `${nombre} sin paths: se cargaría en todas las sesiones`).toBeGreaterThan(0);
    const muertos = globs.filter((g) => !REPO.some((r) => posix.matchesGlob(r, g)));
    expect(muertos, `actualiza la ruta en ${nombre} o borra la mención`).toEqual([]);
  });
});

describe("rutas: el lector", () => {
  it("saca rutas y nombres de fichero, y deja fuera comandos, comodines y marcadores", () => {
    const texto = "Lee `docs/datos/PRINCIPIOS.md`, `pendientes.js` y `api/_bot/`; "
      + "no `npm run build`, ni `src/**/*.jsx`, ni `src/lib/<dominio>Sync.js`, ni `https://x.com/a.md`.";
    expect(rutasCitadas(texto).sort()).toEqual(["api/_bot/", "docs/datos/PRINCIPIOS.md", "pendientes.js"]);
  });
  it("una ruta inventada no existe", () => {
    expect(existe("src/no-existe-nunca.js")).toBe(false);
    expect(existe("docs/datos/PRINCIPIOS.md")).toBe(true);
  });
  it("lee los globs del frontmatter", () => {
    expect(globsDe('---\npaths:\n  - "src/**/*.jsx"\n  - api/*.js\n---\n# x')).toEqual(["src/**/*.jsx", "api/*.js"]);
  });
});
