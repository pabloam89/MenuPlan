import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TIPOS_AGENTE, traspasosDe, traspasosDeclarados, traspasosEnTexto } from "../scripts/lib/agentes.mjs";

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
const HERRAMIENTAS = ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "WebFetch", "WebSearch", "NotebookEdit", "Agent"];
const ESCRITURA = ["Edit", "Write", "NotebookEdit"];
// Campos documentados en code.claude.com/docs/en/sub-agents, más `traspasa_a`, nuestro (Claude Code ignora los campos que no conoce). Una errata en
// el nombre de un campo no da error en Claude Code: se ignora en silencio.
const CAMPOS = ["name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns", "skills", "mcpServers", "memory", "hooks", "background", "omitClaudeMd", "effort", "isolation", "color", "traspasa_a"];
// Las descripciones de todos los agentes se cargan en cada sesión.
const MAX_DESCRIPCION = 600;

const agentes = readdirSync(DIR).filter((f) => f.endsWith(".md"));

/** Una lista del frontmatter: «a, b», «[a, b]» o las líneas `  - a` (ya en array). */
/**
 * Las herramientas de un `tools`: se parte por comas FUERA de paréntesis (`Agent(a, b)` es una sola),
 * `Task` es el nombre antiguo de `Agent` (sub-agents.md, «Restrict which subagents can be spawned») y
 * `Agent(a, b)` es una lista de permitidos. Devuelve { nombre, permitidos|null }.
 */
export function herramientasDe(v) {
  if (Array.isArray(v)) v = v.join(",");
  const partes = [];
  let hondo = 0, actual = "";
  for (const c of String(v ?? "").replace(/^\[|\]$/g, "")) {
    if (c === "(") hondo++;
    if (c === ")") hondo--;
    if (c === "," && hondo === 0) { partes.push(actual); actual = ""; } else actual += c;
  }
  partes.push(actual);
  return partes.map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^([\w-]+)(?:\((.*)\))?$/.exec(x);
    if (!m) return { nombre: x, permitidos: null };
    const nombre = m[1] === "Task" ? "Agent" : m[1];
    return { nombre, permitidos: m[2] === undefined ? null : m[2].split(",").map((y) => y.trim()).filter(Boolean) };
  });
}
const nombresTools = (v) => herramientasDe(v).map((h) => h.nombre);

const lista = (v) => (Array.isArray(v) ? v : String(v ?? "").replace(/^\[|\]$/g, "").split(",")).map((t) => String(t).trim()).filter(Boolean);

/**
 * Las herramientas que el agente tiene de verdad, no las que lista (#351). En
 * Claude Code (code.claude.com/docs/en/sub-agents): sin `tools` hereda todas;
 * con `memory` se le activan Read, Write y Edit para llevar su memoria, y el
 * frontmatter no puede limitarlas a esa carpeta; `disallowedTools` quita.
 */
function herramientasEfectivas(meta) {
  // `tools` ausente o vacío (null en YAML) hereda todas: ante la duda, el juez puede escribir.
  const base = nombresTools(meta.tools).length ? nombresTools(meta.tools) : [...HERRAMIENTAS];
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
  const tools = nombresTools(meta?.tools);
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
    // «juez» es un valor del tipo (TIPOS_AGENTE, una sola fuente en scripts/lib/agentes.mjs), no una categoría aparte.
    expect(TIPOS_AGENTE, "Tipo: de la sección Misión y alcance").toContain(tipo);
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

describe("los traspasos entre agentes son un dato de la cabecera (#652)", () => {
  const ids = agentes.map((f) => f.replace(/\.md$/, ""));
  const traspasos = traspasosDe(RAIZ);

  it.each(ids)("%s: traspasa_a son ids de agentes que existen, sin repetir ni a sí mismo, ordenados", (id) => {
    const { declarado } = traspasos[id];
    expect(declarado, "falta el campo traspasa_a en la cabecera").not.toBeNull();
    expect(declarado.filter((x) => !ids.includes(x)), "ids que no son agentes").toEqual([]);
    expect(declarado).not.toContain(id);
    expect(new Set(declarado).size).toBe(declarado.length);
    expect([...declarado].sort()).toEqual(declarado);
  });

  it.each(ids)("%s: lo declarado coincide con su «No para:» y su Escalado, en los dos sentidos", (id) => {
    const { declarado, enTexto } = traspasos[id];
    expect(declarado.filter((x) => !enTexto.includes(x)), "declarado en traspasa_a y no dicho en el texto").toEqual([]);
    expect(enTexto.filter((x) => !declarado.includes(x)), "dicho en el texto y no declarado en traspasa_a").toEqual([]);
  });

  it("solo el orquestador lleva Agent (también como Task o Agent(...)) y lo acota a su traspasa_a", () => {
    const conAgent = agentes.filter((f) => nombresTools(leer(f).meta.tools).includes("Agent")).map((f) => f.replace(/\.md$/, ""));
    expect(conAgent).toEqual(["orquestador"]);
    const h = herramientasDe(leer("orquestador.md").meta.tools).find((x) => x.nombre === "Agent");
    expect(h.permitidos, "Agent sin lista: puede lanzar cualquier agente; usa Agent(a, b, …)").not.toBeNull();
    expect([...h.permitidos].sort()).toEqual([...traspasos.orquestador.declarado].sort());
  });

  // Decisión de Pablo (12 oct 2026, #652): toda sesión arranca como el orquestador. La clave `agent` de
  // settings.json (code.claude.com/docs/en/settings-reference#agent, sub-agents.md «Run the whole session
  // as a subagent») hace que el hilo principal use el prompt, las herramientas y el modelo de ese agente.
  // Un nombre con errata no da error: la sesión arranca como la de por defecto, sin avisar.
  it("settings.json arranca toda sesión como el orquestador, y ese agente existe con ese nombre", () => {
    const ajustes = JSON.parse(readFileSync(join(AQUI, "settings.json"), "utf8"));
    expect(ajustes.agent).toBe("orquestador");
    expect(existsSync(join(DIR, "orquestador.md"))).toBe(true);
    expect(leer("orquestador.md").meta.name).toBe(ajustes.agent);
  });

  it.each(agentes)("%s: declara tools (si no, hereda todas) y no usa permissionMode: bypassPermissions", (f) => {
    const { meta } = leer(f);
    expect(nombresTools(meta.tools).length, "tools explícito").toBeGreaterThan(0);
    expect(meta.permissionMode).not.toBe("bypassPermissions");
  });

  it("el lector de tools ve Task, Agent(...) con comas dentro y la falta de lista", () => {
    expect(herramientasDe("Task, Read").map((x) => x.nombre)).toEqual(["Agent", "Read"]);
    expect(herramientasDe("Agent(a, b), Read, Bash")).toEqual([{ nombre: "Agent", permitidos: ["a", "b"] }, { nombre: "Read", permitidos: null }, { nombre: "Bash", permitidos: null }]);
    expect(herramientasDe("Task(a), Read")[0]).toEqual({ nombre: "Agent", permitidos: ["a"] });
    expect(herramientasDe("Read, Agent")[1].permitidos).toBeNull();
    expect(herramientasDe("")).toEqual([]);
  });

  it("el lector ve fallar un traspaso que sobra, la palabra suelta y la cabecera sin campo", () => {
    const base = (np, esc) => `---\nname: x\ndescription: Úsalo para algo. No para: ${np}.\ntraspasa_a: [b]\n---\n\n## 9. Escalado\n\n${esc}\n\n## 10. Hecho\n`;
    const sano = base("cosas (b)", "- Lo demás: a `b`.");
    expect(traspasosEnTexto(sano, "x", ["x", "b", "c"])).toEqual(["b"]);
    expect(traspasosDeclarados(sano)).toEqual(["b"]);
    // Un traspaso nuevo en el texto que la cabecera no declara.
    expect(traspasosEnTexto(base("cosas (b, c)", "- a `b`."), "x", ["x", "b", "c"])).toEqual(["b", "c"]);
    // La palabra suelta (sin paréntesis ni comillas) no es una arista: «datos» es una palabra del castellano.
    expect(traspasosEnTexto(base("lógica o datos", "- cambiar lógica o datos."), "x", ["x", "datos"])).toEqual([]);
    // Sin el campo, el lector devuelve null y el test de arriba falla.
    expect(traspasosDeclarados("---\nname: x\n---\n")).toBeNull();
  });

  it("la plantilla documenta traspasa_a y que «juez» es un valor de Tipo", () => {
    const plantilla = readFileSync(join(AQUI, "PLANTILLA-AGENTE.md"), "utf8");
    expect(plantilla).toMatch(/traspasa_a:/);
    for (const v of TIPOS_AGENTE) expect(plantilla, v).toContain("`" + v + "`");
    expect(plantilla).toMatch(/«juez» es un valor de `Tipo`/);
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
