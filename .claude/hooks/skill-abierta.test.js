import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { skillAbierta } from "./skill-abierta.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

// El registro de eventos (#340) escribe en ~/.claude/menuplan-fabrica: un test no toca la carpeta real del usuario.
process.env.MENUPLAN_FABRICA_DIR = mkdtempSync(join(tmpdir(), "skill-abierta-eventos-"));

describe("qué acción cuenta como abrir una skill", () => {
  it.each([
    [{ tool_name: "Skill", tool_input: { skill: "github" } }, "github"],
    [{ tool_name: "Skill", tool_input: { skill: "/vercel" } }, "vercel"],
    [{ tool_name: "Skill", tool_input: { skill: "menuplan:1password" } }, "1password"],
    [{ tool_name: "Read", tool_input: { file_path: "C:\\dev\\MenuPlan-x\\.claude\\skills\\supabase\\SKILL.md" } }, "supabase"],
    [{ tool_name: "Read", tool_input: { file_path: "C:/dev/MenuPlan/.claude/skills/hetzner/SKILL.md" } }, "hetzner"],
  ])("%j -> %s", (entrada, skill) => expect(skillAbierta(entrada)).toBe(skill));

  it.each([
    [{ tool_name: "Read", tool_input: { file_path: "C:/dev/MenuPlan/src/App.jsx" } }],
    [{ tool_name: "Read", tool_input: { file_path: "C:/dev/MenuPlan/.claude/skills/hetzner/otra.md" } }],
    [{ tool_name: "Read", tool_input: { file_path: "C:/dev/MenuPlan/.claude/PLANTILLA-SKILL.md" } }],
    [{ tool_name: "Bash", tool_input: { command: "cat .claude/skills/github/SKILL.md" } }],
    [{ tool_name: "Skill", tool_input: { skill: "../../etc" } }],
    [{ tool_name: "Skill", tool_input: {} }],
    [null],
  ])("no cuenta: %j", (entrada) => expect(skillAbierta(entrada)).toBeNull());
});

describe("el hook, lanzado como lo hace Claude Code", () => {
  it("con una entrada rota, vacía o que no abre ninguna skill: sale 0, no imprime y no escribe ninguna ficha", () => {
    const repo = mkdtempSync(join(tmpdir(), "skill-abierta-rota-"));
    execFileSync("git", ["init", "-q", repo]);
    const entradas = [
      "",
      "no es json",
      "{}",
      JSON.stringify({ session_id: "sesion-de-prueba-2", cwd: repo, tool_name: "Read", tool_input: { file_path: "src/App.jsx" } }),
      JSON.stringify({ session_id: "sesion-de-prueba-2", cwd: repo, tool_name: "Skill", tool_input: { skill: "../../etc" } }),
      // abre una skill pero sin sesión (o con un id inservible): no hay dónde anotarlo
      JSON.stringify({ cwd: repo, tool_name: "Skill", tool_input: { skill: "github" } }),
      JSON.stringify({ session_id: "../x", cwd: repo, tool_name: "Skill", tool_input: { skill: "github" } }),
    ];
    for (const stdin of entradas) {
      const salida = execFileSync("node", [join(AQUI, "skill-abierta.mjs")], { input: stdin, encoding: "utf8", cwd: repo });
      expect(salida).toBe("");
    }
    expect(existsSync(join(repo, ".git", "claude-sesiones"))).toBe(false);
  });

  it("anota la skill en el registro de la sesión", () => {
    const repo = mkdtempSync(join(tmpdir(), "skill-abierta-"));
    execFileSync("git", ["init", "-q", repo]);
    const entrada = { session_id: "sesion-de-prueba-1", cwd: repo, tool_name: "Skill", tool_input: { skill: "github" } };
    const salida = execFileSync("node", [join(AQUI, "skill-abierta.mjs")], { input: JSON.stringify(entrada), encoding: "utf8" });
    expect(salida).toBe("");
    expect(readdirSync(join(repo, ".git", "claude-sesiones", "skills"))).toEqual(["sesion-de-prueba-1__github.json"]);
  });
});
