import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Todos los agentes con la misma forma (.claude/PLANTILLA-AGENTE.md): mismo
 * frontmatter y las nueve secciones en orden. Cambian la personalidad, las
 * herramientas y los principios; la estructura no.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const DIR = join(AQUI, "agents");

const SECCIONES = ["Identidad", "Misión y alcance", "Principios", "Disparadores", "Fuentes de verdad", "Gateways", "Entregables", "Escalado", "Hecho"];
const COLORES = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"];
const HERRAMIENTAS = ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "WebFetch", "WebSearch", "NotebookEdit"];

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

it("hay agentes", () => expect(agentes.length).toBeGreaterThan(0));

describe.each(agentes)("%s", (fichero) => {
  const { meta, cuerpo } = leer(fichero);

  it("tiene frontmatter completo", () => {
    expect(meta).not.toBeNull();
    expect(meta.name).toBe(fichero.replace(/\.md$/, ""));
    expect(meta.description?.length).toBeGreaterThan(80);
    expect(["inherit", "opus", "sonnet", "haiku"]).toContain(meta.model);
    expect(COLORES).toContain(meta.color);
    const tools = meta.tools.split(",").map((t) => t.trim());
    expect(tools.filter((t) => !HERRAMIENTAS.includes(t) && !t.startsWith("mcp__"))).toEqual([]);
  });

  it("tiene las nueve secciones, en orden", () => {
    const titulos = [...cuerpo.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2].trim()}`);
    expect(titulos).toEqual(SECCIONES.map((s, i) => `${i + 1}. ${s}`));
  });

  it("ninguna sección vacía", () => {
    const trozos = cuerpo.split(/^## \d+\. .+$/m).slice(1);
    for (const t of trozos) expect(t.trim().length).toBeGreaterThan(40);
  });

  it("los ficheros que cita existen", () => {
    // Un agente que lee una fuente de verdad que ya no existe opina a ciegas.
    const rutas = [...cuerpo.matchAll(/`((?:\.claude|\.github|ops|supabase|docs|specs|src|scripts|api)\/[\w./-]+\.(?:md|js|mjs|json|yml|sql))`/g)].map((m) => m[1]);
    expect(rutas.filter((r) => !existsSync(join(RAIZ, r)))).toEqual([]);
  });
});

it("la plantilla lista las mismas secciones que exige este test", () => {
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const titulos = [...plantilla.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => m[2].trim());
  expect(titulos).toEqual(SECCIONES);
});
