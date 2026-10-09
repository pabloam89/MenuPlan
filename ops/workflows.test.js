import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dos reglas de clase sobre todos los workflows (#299, revisión de seguridad):
 *
 * 1. Nada que escriba quien lanza o provoca el workflow (`inputs.*`,
 *    `github.event.*`, `github.head_ref`) se interpola con `${{ }}` dentro de
 *    un `run:`: Actions lo pega en el script antes de ejecutarlo, y unas comillas
 *    en el texto bastan para colar una orden. Se pasa por `env:` y se lee como
 *    variable ("$NOTAS").
 * 2. Un workflow con environment (es decir, con secretos fuera del repo) solo
 *    se dispara por `schedule` o `workflow_dispatch`: nada que pueda provocar
 *    un PR, una etiqueta o un push de otra rama. Excepción declarada:
 *    `dependabot-auto.yml` (`workflow_run` tras `Tests`; su job con environment
 *    no hace checkout del PR, #193).
 *
 * Se lee el texto, sin parser de YAML: los workflows del repo siguen el
 * formato de bloque que escribe cualquiera (`on:` arriba, `run: |`).
 */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");
const workflows = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n")]);

const DISPAROS_CON_SECRETOS = ["schedule", "workflow_dispatch"];
const EXCEPCIONES_DISPARO = { "dependabot-auto.yml": ["schedule", "workflow_dispatch", "workflow_run"] };
const PELIGROSAS = /\$\{\{\s*(?:inputs\.|github\.event\.|github\.head_ref)/;

/** Las líneas de cada `run:` (en línea o en bloque), con su número. */
function lineasDeRun(texto) {
  const lineas = texto.split("\n");
  const fuera = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lineas[i]);
    if (!m) continue;
    const sangria = m[1].length;
    if (m[2] && !/^[|>][-+]?\s*$/.test(m[2])) { fuera.push([i + 1, m[2]]); continue; }
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (l.trim() && l.search(/\S/) <= sangria) break;
      fuera.push([j + 1, l]);
    }
  }
  return fuera;
}

/** Los disparadores de `on:` (las claves de su primer nivel). */
function disparadores(texto) {
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => /^(?:on|"on"|'on'):/.test(l));
  if (i === -1) return [];
  const enLinea = /^\S+:\s*(.+)$/.exec(lineas[i]);
  if (enLinea) return enLinea[1].replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const fuera = [];
  for (let j = i + 1; j < lineas.length && !/^\S/.test(lineas[j]); j++) {
    const m = /^ {2}([a-z_]+):/.exec(lineas[j]);
    if (m) fuera.push(m[1]);
  }
  return fuera;
}

const conEnvironment = (texto) => /^\s*environment:/m.test(texto.replace(/#.*$/gm, ""));

describe("los workflows: sin texto ajeno en run y con secretos solo por cron o a mano (#299)", () => {
  it("hay workflows que leer", () => expect(workflows.length).toBeGreaterThan(3));

  it.each(workflows)("%s: ningún inputs.*, github.event.* ni head_ref interpolado en un run", (nombre, texto) => {
    const malas = lineasDeRun(texto).filter(([, l]) => PELIGROSAS.test(l)).map(([n, l]) => `${nombre}:${n}: ${l.trim()}`);
    expect(malas).toEqual([]);
  });

  it.each(workflows.filter(([, t]) => conEnvironment(t)))("%s, con environment, solo se dispara por cron o a mano", (nombre, texto) => {
    const permitidos = EXCEPCIONES_DISPARO[nombre] ?? DISPAROS_CON_SECRETOS;
    expect(disparadores(texto).filter((d) => !permitidos.includes(d))).toEqual([]);
  });

  it("cada excepción de disparo existe y sigue teniendo environment", () => {
    for (const nombre of Object.keys(EXCEPCIONES_DISPARO)) {
      const w = workflows.find(([n]) => n === nombre);
      expect(w, `${nombre} ya no existe: quita su excepción`).toBeTruthy();
      expect(conEnvironment(w[1]), `${nombre} ya no tiene environment: quita su excepción`).toBe(true);
    }
  });

  it("las comprobaciones cazan lo que deben (cada caso, una cosa)", () => {
    const run = (cuerpo) => lineasDeRun(`jobs:\n  a:\n    steps:\n      - name: x\n        run: |\n${cuerpo}\n      - name: y\n        env:\n          N: \${{ inputs.notas }}\n`);
    expect(run('          echo "${{ inputs.notas }}"').some(([, l]) => PELIGROSAS.test(l))).toBe(true);
    expect(run('          echo "$N"').some(([, l]) => PELIGROSAS.test(l))).toBe(false);
    expect(lineasDeRun('      - run: echo "${{ github.event.pull_request.title }}"\n').some(([, l]) => PELIGROSAS.test(l))).toBe(true);
    expect(disparadores("on:\n  push:\n    tags: [x]\n  workflow_dispatch:\njobs: {}\n")).toEqual(["push", "workflow_dispatch"]);
    expect(disparadores("on: [push, pull_request]\n")).toEqual(["push", "pull_request"]);
  });
});
