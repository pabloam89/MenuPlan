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

/** Una lista del frontmatter: «a, b», «[a, b]» o las líneas `  - a` (ya en array). */
const lista = (v) => (Array.isArray(v) ? v : String(v ?? "").replace(/^\[|\]$/g, "").split(",")).map((t) => String(t).trim()).filter(Boolean);

/**
 * Las herramientas que el agente tiene de verdad, no las que lista (#351). En
 * Claude Code (code.claude.com/docs/en/sub-agents): sin `tools` hereda todas;
 * con `memory` se le activan Read, Write y Edit para llevar su memoria, y el
 * frontmatter no puede limitarlas a esa carpeta; `disallowedTools` quita.
 */
function herramientasEfectivas(meta) {
  // `tools` ausente o vacío (null en YAML) hereda todas: ante la duda, el juez puede escribir.
  const base = lista(meta.tools).length ? lista(meta.tools) : [...HERRAMIENTAS];
  const conMemoria = meta.memory ? [...base, "Read", "Write", "Edit"] : base;
  const quitadas = lista(meta.disallowedTools);
  return [...new Set(conMemoria)].filter((t) => !quitadas.includes(t));
}

describe("herramientas efectivas", () => {
  it("la memoria da escritura, sin tools se heredan todas y disallowedTools quita", () => {
    const escribe = (meta) => herramientasEfectivas(meta).filter((t) => ESCRITURA.includes(t));
    expect(escribe({ tools: "Read, Grep, Bash" })).toEqual([]);
    expect(escribe({ tools: "Read, Grep, Bash", memory: "project" }).sort()).toEqual(["Edit", "Write"]);
    expect(escribe({}).sort()).toEqual(["Edit", "NotebookEdit", "Write"]);
    expect(escribe({ disallowedTools: "Edit, Write, NotebookEdit" })).toEqual([]);
    expect(escribe({ tools: "Read", memory: "project", disallowedTools: "Write, Edit" })).toEqual([]);
  });

  it("lee el frontmatter como lo lee Claude Code: tools vacío hereda todas y las listas de varias líneas cuentan", () => {
    const escribe = (front) => herramientasEfectivas(analizar(`---\nname: x\n${front}\n---\ncuerpo`).meta).filter((t) => ESCRITURA.includes(t)).sort();
    expect(escribe("tools:")).toEqual(["Edit", "NotebookEdit", "Write"]);
    expect(escribe("tools: ")).toEqual(["Edit", "NotebookEdit", "Write"]);
    expect(escribe("tools:\n  - Read\n  - Edit")).toEqual(["Edit"]);
    expect(escribe("tools: [Read, Write]")).toEqual(["Write"]);
    expect(escribe("tools:\n  - Read\n  - Edit\ndisallowedTools:\n  - Edit")).toEqual([]);
    expect(escribe("tools: Read, Grep")).toEqual([]);
  });
});

function leer(fichero) {
  return analizar(readFileSync(join(DIR, fichero), "utf8"));
}

/** El frontmatter de un agente. `clave:` con sus `  - valor` debajo es una lista. */
function analizar(bruto) {
  const texto = bruto.replace(/\r\n/g, "\n");
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: null, cuerpo: texto };
  const meta = {};
  let clave = null;
  for (const l of m[1].split("\n")) {
    const kv = l.match(/^(\w+):\s*(.*)$/);
    if (kv) { clave = kv[1]; meta[clave] = kv[2].trim(); continue; }
    const item = l.match(/^\s+-\s*(.+)$/);
    if (item && clave) meta[clave] = [...(Array.isArray(meta[clave]) ? meta[clave] : []), item[1].trim()];
  }
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
  const tools = lista(meta?.tools);
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

  it("declara su tipo, y un juez no puede escribir (mirando las herramientas efectivas, memoria incluida)", () => {
    expect(tipo).toBeDefined();
    if (tipo === "juez") {
      const aviso = "Un juez no escribe: quita Edit/Write de tools, no le pongas memory (le da Write y Edit) y no dejes tools vacío (hereda todas).";
      expect(herramientasEfectivas(meta).filter((t) => ESCRITURA.includes(t)), aviso).toEqual([]);
    }
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
  // Cada agente remite al informe común de la plantilla (de ahí hereda CASOS:)
  // o, si define el suyo, lo incluye.
  for (const f of agentes) {
    const { cuerpo } = leer(f);
    const remite = /informe común/i.test(seccion(cuerpo, "Entregables"));
    const propio = /^CASOS:/m.test(cuerpo);
    expect(remite || propio, `${f}: ni remite al informe común ni lleva CASOS:`).toBe(true);
  }
});

it("el informe común lleva SKILLS:, /orquestar las saca del mapa y el revisor las comprueba (#397)", () => {
  // Las skills son el camino de aprendizaje: si el informe no dice cuáles se
  // abrieron, nadie puede comprobar que se usaron. La lista del brief sale de un
  // script sobre .claude/dominios-skills.json, no de memoria.
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const informe = plantilla.slice(plantilla.indexOf("## Informe común"));
  expect(informe).toMatch(/^SKILLS:/m);
  expect(plantilla).toMatch(/^## Skills que he abierto$/m);
  const orquestar = readFileSync(join(AQUI, "commands", "orquestar.md"), "utf8");
  const brief = orquestar.slice(orquestar.indexOf("## 4. El brief"), orquestar.indexOf("## 5."));
  expect(brief).toMatch(/npm run skills-encargo/);
  expect(brief).toMatch(/`SKILLS:`/);
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  expect(pkg.scripts["skills-encargo"]).toMatch(/scripts\/skills-encargo\.mjs/);
  const { cuerpo } = leer("revisor.md");
  expect(seccion(cuerpo, "Principios")).toMatch(/skills-encargo -- *\n? *--diff[\s\S]*`SKILLS:`/);
  expect(seccion(cuerpo, "Hecho")).toMatch(/SKILLS:/);
});

it("el informe común lleva ESTÁNDAR:, /orquestar pega el de la tarea, el revisor lo contrasta y cada agente lista sus tareas (#413)", () => {
  // Un estándar que nadie cita no se cumple: mismo patrón que SKILLS: (#397). El
  // catálogo y su test están en ops/estandares-agentes.test.js; aquí, que el
  // encargo lo pida, el informe lo diga y el revisor lo mire.
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const informe = plantilla.slice(plantilla.indexOf("## Informe común"));
  expect(informe).toMatch(/^ESTÁNDAR:/m);
  expect(plantilla).toMatch(/^## Estándar de la tarea que se encarga$/m);
  expect(plantilla).toMatch(/^## Tareas y su estándar$/m);
  const orquestar = readFileSync(join(AQUI, "commands", "orquestar.md"), "utf8");
  const brief = orquestar.slice(orquestar.indexOf("## 4. El brief"), orquestar.indexOf("## 5."));
  expect(brief).toMatch(/npm run estandar/);
  expect(brief).toMatch(/ESTÁNDAR A CUMPLIR/);
  expect(brief).toMatch(/`ESTÁNDAR:`/);
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  expect(pkg.scripts.estandar).toMatch(/scripts\/estandares-agentes\.mjs/);
  const { cuerpo } = leer("revisor.md");
  expect(seccion(cuerpo, "Principios")).toMatch(/npm run estandar[\s\S]*`ESTÁNDAR:`/);
  expect(seccion(cuerpo, "Hecho")).toMatch(/ESTÁNDAR:/);
  // Un agente sin su lista de tareas no pasa (el contenido lo compara el test de ops/).
  for (const f of agentes) {
    expect(leer(f).cuerpo, `${f}: falta la sección «Tareas y su estándar» (npm run estandar -- --escribir)`).toMatch(/^## Tareas y su estándar$/m);
  }
});

it("cada agente trae precargadas las skills de su dominio, y solo esas: una sola fuente, el mapa (#397)", () => {
  // El 10 oct, `datos` editó supabase/ 9 veces en una semana sin la skill
  // supabase: no la traía precargada y nada lo pedía. El mapa dice qué
  // constructores trabajan en cada dominio (`agentes`); el frontmatter lo sigue.
  const mapa = JSON.parse(readFileSync(join(AQUI, "dominios-skills.json"), "utf8"));
  const esperado = {};
  for (const [skill, d] of Object.entries(mapa.skills)) {
    expect(Array.isArray(d.agentes) && d.agentes.length > 0, `${skill}: falta "agentes" en el mapa`).toBe(true);
    for (const a of d.agentes) {
      expect(existsSync(join(DIR, `${a}.md`)), `${skill}: el agente ${a} no existe`).toBe(true);
      (esperado[a] ??= []).push(skill);
    }
  }
  for (const f of agentes) {
    const nombre = f.replace(/\.md$/, "");
    const { meta } = leer(f);
    expect(lista(meta.skills).sort(), `${nombre}: su skills: no cuadra con "agentes" del mapa`).toEqual((esperado[nombre] ?? []).sort());
  }
});

it("buscar antes de dar nada por nuevo: plantilla, orquestar y las fuentes de cada agente (#384, #320)", () => {
  // Los cinco jueces del 9 oct 2026 presentaron como nuevo lo ya apuntado (#320).
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
  const informe = plantilla.slice(plantilla.indexOf("## Informe común"));
  expect(informe).toMatch(/YA APUNTADO: #n/);
  expect(informe).toContain("NUEVO (buscado: <consulta>)");
  expect(plantilla).toMatch(/^## Lo ya apuntado/m);
  const orquestar = readFileSync(join(AQUI, "commands", "orquestar.md"), "utf8");
  expect(orquestar).toMatch(/npm run buscar/);
  expect(orquestar).toMatch(/YA APUNTADO: #n/);
  for (const f of agentes) {
    const fuentes = seccion(leer(f).cuerpo, "Fuentes de verdad");
    expect(/npm run (buscar|issues)/.test(fuentes), `${f}: sus Fuentes de verdad no nombran npm run buscar ni npm run issues`).toBe(true);
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
