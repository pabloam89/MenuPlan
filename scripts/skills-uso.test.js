// El uso de las skills se cuenta desde los transcripts de Claude Code (#397).
// Transcripts de mentira, una línea JSONL por evento, como los escribe Claude Code.
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarMapa } from "../.claude/hooks/dominios.mjs";
import {
  TOQUES,
  VIAS,
  comandoQueCuenta,
  eventosDeTranscript,
  lineas,
  medirUso,
  nombreDeProyecto,
  precargadasDe,
  resumir,
  skillsDelEncargo,
  rutaDelRepo,
  skillsDelRepo,
  tocadosSinSkill,
} from "./lib/usoSkills.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapa = cargarMapa(RAIZ);
const skills = skillsDelRepo(RAIZ);

let reloj = 0;
const t = () => new Date(Date.parse("2026-10-10T08:00:00Z") + 1000 * reloj++).toISOString();
const herramienta = (name, input, cwd = "C:\\dev\\MenuPlan-x") =>
  JSON.stringify({ type: "assistant", sessionId: "sesion-prueba-1", timestamp: t(), cwd, message: { content: [{ type: "tool_use", name, input }] } });
const persona = (content) => JSON.stringify({ type: "user", sessionId: "sesion-prueba-1", timestamp: t(), message: { role: "user", content } });
const ev = (lineasJsonl, esAgente = false) => eventosDeTranscript(lineasJsonl.join("\n"), { skills, mapa, esAgente });

describe("eventosDeTranscript: qué cuenta como abrir una skill", () => {
  it.each([
    ["la herramienta Skill", [herramienta("Skill", { skill: "vercel" })], "herramienta"],
    ["Skill con barra o prefijo", [herramienta("Skill", { skill: "/plugin:vercel" })], "herramienta"],
    ["un Read de su SKILL.md", [herramienta("Read", { file_path: "C:\\dev\\MenuPlan-x\\.claude\\skills\\vercel\\SKILL.md" })], "lectura"],
    ["la persona con /vercel", [persona("<command-message>vercel</command-message>\n<command-name>/vercel</command-name>")], "orden"],
  ])("%s", (_, l, via) => expect(ev(l).aperturas.map((a) => [a.skill, a.via])).toEqual([["vercel", via]]));

  it("en un subagente, lo que llega como orden es su precarga", () =>
    expect(ev([persona([{ type: "text", text: "<command-name>github</command-name>" }])], true).aperturas[0].via).toBe("precargada"));

  it("una orden que no es skill (/orquestar), un Read de otro fichero o un resultado de herramienta no cuentan", () => {
    const l = [
      persona("<command-name>/orquestar</command-name>"),
      herramienta("Read", { file_path: "C:/dev/MenuPlan-x/.claude/skills/vercel/referencias/x.md" }),
      persona([{ type: "tool_result", content: "<command-name>vercel</command-name>" }]),
      herramienta("Skill", { skill: "no-existe" }),
    ];
    expect(ev(l).aperturas).toEqual([]);
  });

  it("una línea rota se salta y el resto cuenta", () =>
    expect(eventosDeTranscript(`{"type":"assis\n${herramienta("Skill", { skill: "github" })}`, { skills, mapa }).aperturas).toHaveLength(1));
});

describe("eventosDeTranscript: qué cuenta como tocar un dominio", () => {
  it("editar un fichero de sus rutas, con la ruta de una carpeta de trabajo o de un worktree de agente", () => {
    const l = [
      herramienta("Edit", { file_path: "C:\\dev\\MenuPlan-x\\vercel.json" }),
      herramienta("Write", { file_path: "C:/dev/MenuPlan/.claude/worktrees/agent-1/supabase/migrations/0150_x.sql" }),
      herramienta("Edit", { file_path: "C:\\dev\\MenuPlan-x\\src\\App.jsx" }),
    ];
    expect(ev(l).toques.map((x) => [x.skill, x.como])).toEqual([["vercel", "edicion"], ["supabase", "edicion"]]);
  });

  it("un comando de riesgo, con el mismo mapa que la guardia; uno de lectura no", () => {
    const l = [herramienta("Bash", { command: "node scripts/telegram-webhook.mjs set https://x" }), herramienta("PowerShell", { command: "git status" })];
    expect(ev(l).toques.map((x) => [x.skill, x.como])).toEqual([["telegram", "comando"]]);
  });

  it("el texto de un commit, un PR o un heredoc no toca nada, ni un tramo que solo lee (#397)", () => {
    const l = [
      herramienta("Bash", { command: "git commit -m \"node scripts/telegram-webhook.mjs set\"" }),
      herramienta("Bash", { command: "cat <<'EOF' > x.md\nnode scripts/telegram-webhook.mjs set\nEOF" }),
      herramienta("Bash", { command: "cd C:/dev/MenuPlan-x && grep -n telegram-webhook.mjs scripts/*.mjs" }),
      herramienta("Bash", { command: "git status && node scripts/telegram-webhook.mjs set https://x" }),
    ];
    expect(ev(l).toques.map((x) => x.skill)).toEqual(["telegram"]);
    expect(comandoQueCuenta("cd x && ls && git diff")).toBe("");
  });

  it("lo que acabó en error no cuenta: la guardia que niega para pedir la skill, o el comando que falla (#397)", () => {
    const llamada = (id, command) =>
      JSON.stringify({ type: "assistant", sessionId: "sesion-prueba-1", timestamp: t(), message: { content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
    const resultado = (id, is_error) => persona([{ type: "tool_result", tool_use_id: id, is_error, content: "x" }]);
    const l = [llamada("u1", "node scripts/telegram-webhook.mjs set https://x"), resultado("u1", true), llamada("u2", "node scripts/telegram-webhook.mjs set https://x"), resultado("u2", false)];
    expect(ev(l).toques).toHaveLength(1);
  });

  it("rutaDelRepo: por el nombre de la carpeta o relativa a la sesión; fuera, null", () => {
    expect(rutaDelRepo("C:\\dev\\MenuPlan-tarea\\ops\\copias\\x.sh", "")).toBe("ops/copias/x.sh");
    expect(rutaDelRepo("D:/otro/repo/vercel.json", "D:\\otro\\repo")).toBe("vercel.json");
    expect(rutaDelRepo("D:/fuera/vercel.json", "D:\\otro\\repo")).toBe(null);
  });
});

describe("tocadosSinSkill y resumir", () => {
  it("tocar antes de abrir cuenta; abrir antes (por cualquier vía) no", () => {
    const sin = ev([herramienta("Edit", { file_path: "C:/dev/MenuPlan-x/vercel.json" }), herramienta("Skill", { skill: "vercel" })]);
    expect(tocadosSinSkill(sin).map((x) => x.skill)).toEqual(["vercel"]);
    const con = ev([herramienta("Skill", { skill: "vercel" }), herramienta("Edit", { file_path: "C:/dev/MenuPlan-x/vercel.json" })]);
    expect(tocadosSinSkill(con)).toEqual([]);
    const precargada = ev([persona("<command-name>vercel</command-name>"), herramienta("Edit", { file_path: "C:/dev/MenuPlan-x/vercel.json" })], true);
    expect(tocadosSinSkill(precargada)).toEqual([]);
  });

  it("uno por skill y sesión, aunque toque el dominio muchas veces", () => {
    const e = ev([herramienta("Bash", { command: "vercel env rm A" }), herramienta("Bash", { command: "vercel env rm B" })]);
    expect(tocadosSinSkill(e)).toHaveLength(1);
  });

  it("resumir: uso por skill y vía, sin uso deliberado (la precarga no cuenta) y la ventana", () => {
    const a = { agente: "sesion", sesion: "s1", ...ev([herramienta("Skill", { skill: "github" }), herramienta("Bash", { command: "vercel env rm A" })]) };
    const b = { agente: "gobierno", sesion: "s2", ...ev([persona("<command-name>tailscale</command-name>")], true) };
    const r = resumir([a, b], skills);
    expect(r.uso.github.herramienta).toBe(1);
    expect(r.uso.tailscale.precargada).toBe(1);
    expect(r.sinUso).toContain("tailscale");
    expect(r.sinUso).not.toContain("github");
    expect(r.sinSkill.map((x) => [x.skill, x.agente])).toEqual([["vercel", "sesion"]]);
    // Todo lo de antes de la ventana se queda fuera.
    const tarde = resumir([a, b], skills, "2099-01-01");
    expect(tarde.uso.github.total).toBe(0);
    expect(tarde.sinSkill).toEqual([]);
  });

  it("las líneas son de vocabulario cerrado y no llevan texto de la conversación", () => {
    const s = { agente: "datos", sesion: "abcdef123456", ...ev([herramienta("Read", { file_path: "C:/dev/MenuPlan-x/.claude/skills/supabase/SKILL.md" }), herramienta("Bash", { command: "vercel env rm SECRETO_X" })]) };
    const l = lineas([s]);
    expect(l).toHaveLength(2);
    const re = new RegExp(`^(?:skill_abierta: [\\w-]+ via: (?:${VIAS.join("|")})|dominio_sin_skill: [\\w-]+ como: (?:${TOQUES.join("|")})) agente: [\\w-]+ sesion: [\\w-]{1,8} fecha: \\d{4}-\\d{2}-\\d{2}$`);
    for (const x of l) expect(x).toMatch(re);
    expect(l.join("\n")).not.toMatch(/SECRETO_X/);
  });
});

describe("skillsDelEncargo: las skills del brief salen del mapa", () => {
  it("por ruta y por comando, sin repetir, con los ficheros que la piden", () => {
    const r = skillsDelEncargo({
      ficheros: ["supabase/migrations/0150_x.sql", ".\\vercel.json", "src/App.jsx"],
      comandos: ["node scripts/telegram-webhook.mjs set https://x", "vercel env rm A"],
      mapa,
    });
    expect(r.map((s) => [s.skill, s.motivo])).toEqual([["supabase", "ruta"], ["telegram", "comando"], ["vercel", "ruta"]]);
    expect(r.find((s) => s.skill === "vercel").ficheros).toEqual(["vercel.json"]);
  });

  it("marca las que el agente ya trae precargadas, y un fichero sin dominio no pide nada", () => {
    expect(skillsDelEncargo({ ficheros: ["scripts/telegram-perfil.mjs"], mapa, precargadas: precargadasDe(RAIZ, "lola") })[0].precargada).toBe(true);
    expect(skillsDelEncargo({ ficheros: ["src/App.jsx"], mapa })).toEqual([]);
  });

  it("precargadasDe lee el frontmatter, y solo de un nombre válido", () => {
    expect(precargadasDe(RAIZ, "gobierno")).toContain("github");
    expect(precargadasDe(RAIZ, "no-existe")).toEqual([]);
    expect(precargadasDe(RAIZ, "../gobierno")).toEqual([]);
  });

  it("cada skill de la lista es una skill de verdad", () => {
    const todas = skillsDelEncargo({ ficheros: ["supabase/x", "vercel.json", ".github/workflows/x.yml", "ops/copias/x", "scripts/lib/issues.mjs"], mapa });
    for (const s of todas) expect(skills).toContain(s.skill);
    expect(todas.length).toBeGreaterThanOrEqual(5);
  });
});

describe("medirUso: las carpetas de transcripts de verdad", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-uso-"));
  const principal = "C:\\dev\\MenuPlan";
  const proyecto = join(dir, nombreDeProyecto(principal));
  const sesion = join(proyecto, "s1");
  mkdirSync(join(sesion, "subagents"), { recursive: true });
  const ahora = Date.parse("2026-10-10T12:00:00Z");
  writeFileSync(join(proyecto, "s1.jsonl"), [herramienta("Skill", { skill: "github" })].join("\n"));
  writeFileSync(join(sesion, "subagents", "agent-a1.jsonl"), [persona("<command-name>supabase</command-name>"), herramienta("Edit", { file_path: "C:/dev/MenuPlan/.claude/worktrees/agent-a1/vercel.json" })].join("\n"));
  writeFileSync(join(sesion, "subagents", "agent-a1.meta.json"), JSON.stringify({ agentType: "datos" }));
  // Un tipo de agente que no es un nombre (ruta, espacios) sale «desconocido».
  writeFileSync(join(sesion, "subagents", "agent-a2.jsonl"), herramienta("Skill", { skill: "issues" }));
  writeFileSync(join(sesion, "subagents", "agent-a2.meta.json"), JSON.stringify({ agentType: "../fuera de aquí" }));
  // Otro proyecto (no es de este repo) y una sesión vieja: no cuentan.
  mkdirSync(join(dir, "C--dev-OtraCosa"));
  writeFileSync(join(dir, "C--dev-OtraCosa", "x.jsonl"), herramienta("Skill", { skill: "vercel" }));
  writeFileSync(join(proyecto, "vieja.jsonl"), herramienta("Skill", { skill: "hetzner" }));
  const hace = (dias) => new Date(ahora - dias * 86_400_000);
  for (const f of [join(proyecto, "s1.jsonl"), join(sesion, "subagents", "agent-a1.jsonl"), join(sesion, "subagents", "agent-a2.jsonl")]) utimesSync(f, hace(0), hace(0));
  utimesSync(join(proyecto, "vieja.jsonl"), hace(20), hace(20));

  it("cuenta la sesión y su subagente (con su tipo), y nada de otro proyecto ni de fuera de la ventana", () => {
    const m = medirUso(RAIZ, { principal, dirProyectos: dir, ahora });
    expect(m.sesiones).toBe(3);
    expect(m.lineas.filter((x) => x.includes("skill_abierta: issues")).every((x) => x.includes("agente: desconocido"))).toBe(true);
    expect(m.uso.github.herramienta).toBe(1);
    expect(m.uso.supabase.precargada).toBe(1);
    expect(m.uso.vercel.total).toBe(0);
    expect(m.uso.hetzner.total).toBe(0);
    expect(m.sinSkill.map((x) => [x.skill, x.agente])).toEqual([["vercel", "datos"]]);
  });

  it("sin carpeta de transcripts (el CI) o sin sesiones en la ventana: null, nunca un cero", () => {
    expect(medirUso(RAIZ, { principal, dirProyectos: join(dir, "no-existe"), ahora })).toBe(null);
    expect(medirUso(RAIZ, { principal, dirProyectos: dir, ahora: ahora + 60 * 86_400_000 })).toBe(null);
  });
});
