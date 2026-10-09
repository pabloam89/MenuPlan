import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Todos los agentes con la misma forma (.claude/PLANTILLA-AGENTE.md, v2):
 * frontmatter dentro de lo que admite Claude Code, las diez secciones en
 * orden, su tipo (constructor o juez) y los planos a los que sirven.
 * Cambian la personalidad, las herramientas y los principios; la estructura
 * no. Y el catálogo no deriva: CLAUDE.md y /orquestar nombran a todos.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const DIR = join(AQUI, "agents");

const SECCIONES = ["Identidad", "Misión y alcance", "Principios", "Disparadores", "Fuentes de verdad", "Método", "Gateways", "Entregables", "Escalado", "Hecho"];
const COLORES = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"];
const HERRAMIENTAS = ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "WebFetch", "WebSearch", "NotebookEdit"];
const ESCRITURA = ["Edit", "Write", "NotebookEdit"];
// Campos documentados en code.claude.com/docs/en/sub-agents. Una errata en
// el nombre de un campo no da error en Claude Code: se ignora en silencio.
const CAMPOS = ["name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns", "skills", "mcpServers", "memory", "hooks", "background", "omitClaudeMd", "effort", "isolation", "color"];
// Las descripciones de todos los agentes se cargan en cada sesión.
const MAX_DESCRIPCION = 600;

const agentes = readdirSync(DIR).filter((f) => f.endsWith(".md"));

function leer(fichero) {
  const texto = readFileSync(join(DIR, fichero), "utf8").replace(/\r\n/g, "\n");
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: null, cuerpo: texto };
  const meta = Object.fromEntries(
    m[1].split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim()]),
  );
  return { meta, cuerpo: m[2] };
}

/** El texto de una sección, por su título. */
function seccion(cuerpo, titulo) {
  const partes = cuerpo.split(/^## \d+\. (.+)$/m);
  const i = partes.findIndex((p) => p.trim() === titulo);
  return i === -1 ? "" : partes[i + 1];
}

const PLANOS = (() => {
  const md = readFileSync(join(RAIZ, "ops", "PLANOS.md"), "utf8");
  return new Set([...md.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1])));
})();

it("hay agentes", () => expect(agentes.length).toBeGreaterThan(0));

describe.each(agentes)("%s", (fichero) => {
  const { meta, cuerpo } = leer(fichero);
  const tools = (meta?.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const mision = seccion(cuerpo, "Misión y alcance");
  const tipo = mision.match(/^Tipo:\s*(constructor|juez)\s*$/m)?.[1];

  it("tiene frontmatter completo y solo con campos que existen", () => {
    expect(meta).not.toBeNull();
    expect(Object.keys(meta).filter((k) => !CAMPOS.includes(k))).toEqual([]);
    expect(meta.name).toBe(fichero.replace(/\.md$/, ""));
    expect(["inherit", "opus", "sonnet", "haiku"]).toContain(meta.model);
    expect(COLORES).toContain(meta.color);
    expect(tools.filter((t) => !HERRAMIENTAS.includes(t) && !t.startsWith("mcp__"))).toEqual([]);
    if (meta.memory) expect(["project", "user", "local"]).toContain(meta.memory);
    if (meta.isolation) expect(meta.isolation).toBe("worktree");
  });

  it("la descripción enruta: corta, y dice qué NO es suyo", () => {
    expect(meta.description.length).toBeGreaterThan(80);
    expect(meta.description.length).toBeLessThanOrEqual(MAX_DESCRIPCION);
    expect(meta.description).toMatch(/No para:/);
  });

  it("tiene las diez secciones, en orden, ninguna vacía", () => {
    const titulos = [...cuerpo.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2].trim()}`);
    expect(titulos).toEqual(SECCIONES.map((s, i) => `${i + 1}. ${s}`));
    for (const s of SECCIONES) expect(seccion(cuerpo, s).trim().length, s).toBeGreaterThan(40);
  });

  it("declara su tipo, y un juez no puede escribir", () => {
    expect(tipo).toBeDefined();
    if (tipo === "juez") expect(tools.filter((t) => ESCRITURA.includes(t))).toEqual([]);
  });

  it("declara los planos a los que sirve, y existen", () => {
    const linea = mision.match(/^Planos:\s*(.+)$/m)?.[1] ?? "";
    const numeros = [...linea.matchAll(/\d+/g)].map((m) => Number(m[0]));
    expect(numeros.length).toBeGreaterThan(0);
    expect(numeros.filter((n) => !PLANOS.has(n))).toEqual([]);
  });

  it("el método va por pasos y el entregable acaba en el informe común", () => {
    expect(seccion(cuerpo, "Método")).toMatch(/^1\. /m);
    expect(seccion(cuerpo, "Entregables")).toMatch(/informe común/i);
  });

  it("los ficheros que cita existen", () => {
    // Un agente que lee una fuente de verdad que ya no existe opina a ciegas.
    const rutas = [...cuerpo.matchAll(/`((?:\.claude|\.github|ops|supabase|docs|specs|src|scripts|api)\/[\w./-]+\.(?:md|js|mjs|jsx|json|yml|sql))`/g)].map((m) => m[1]);
    expect(rutas.filter((r) => !existsSync(join(RAIZ, r)))).toEqual([]);
  });
});

it("la plantilla lista las mismas secciones que exige este test", () => {
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const titulos = [...plantilla.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => m[2].trim());
  expect(titulos).toEqual(SECCIONES);
});

it("el informe común lleva CASOS: y /orquestar los pasa a la línea «Casos:» del PR (#185)", () => {
  // Los fallos del camino de cada agente se pierden si el informe no los pide.
  // Un solo campo en la plantilla, no una sección por agente: una definición.
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const informe = plantilla.slice(plantilla.indexOf("## Informe común"));
  expect(informe).toMatch(/^CASOS:/m);
  expect(plantilla).toMatch(/^## Casos que he visto$/m);
  const orquestar = readFileSync(join(AQUI, "commands", "orquestar.md"), "utf8");
  expect(orquestar).toMatch(/`CASOS:`/);
  expect(orquestar).toMatch(/Casos: #n, #m/);
  // Cada agente termina con el informe común (otro test); aquí, que ninguno lo redefine sin el campo.
  for (const f of agentes) {
    const { cuerpo } = leer(f);
    if (/^ESTADO:/m.test(cuerpo)) expect(cuerpo, `${f} define su propio informe sin CASOS:`).toMatch(/^CASOS:/m);
  }
});

it("CLAUDE.md y /orquestar nombran a todos los agentes", () => {
  const claude = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
  const orquestar = readFileSync(join(AQUI, "commands", "orquestar.md"), "utf8");
  for (const f of agentes) {
    const nombre = f.replace(/\.md$/, "");
    expect(claude, `CLAUDE.md no nombra a ${nombre}`).toContain(`\`${nombre}\``);
    expect(orquestar, `/orquestar no nombra a ${nombre}`).toContain(`\`${nombre}\``);
  }
});
