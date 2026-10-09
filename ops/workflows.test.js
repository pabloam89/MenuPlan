import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dos reglas de clase sobre todos los workflows (#299, revisión de seguridad):
 *
 * 1. Dentro de un script (`run:`, o `script:` de `actions/github-script`) no
 *    hay ninguna `${{ … }}` salvo una lista corta de lo que pone GitHub y no
 *    puede llevar comillas ni órdenes (PERMITIDAS). Actions pega la expresión
 *    en el script antes de ejecutarlo: con `inputs`, `github.event`, la rama,
 *    salidas de otros pasos o funciones como `format`, unas comillas bastan
 *    para colar una orden; con `secrets.*`, el secreto queda escrito en el
 *    script. Todo lo demás se pasa por `env:` y se lee como variable ("$NOTAS").
 *    Es una lista de lo permitido, no de lo prohibido: lo nuevo entra negado.
 * 2. Un workflow con environment (es decir, con secretos fuera del repo) solo
 *    se dispara por `schedule` o `workflow_dispatch`: nada que pueda provocar
 *    un PR, una etiqueta o un push de otra rama. Excepción declarada:
 *    `dependabot-auto.yml` (`workflow_run` tras `Tests`; su job con environment
 *    no hace checkout del PR, #193).
 *
 * Se lee el texto, sin parser de YAML: los workflows del repo siguen el
 * formato de bloque (`on:` arriba, `run: |`).
 */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");
const workflows = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n")]);

const DISPAROS_CON_SECRETOS = ["schedule", "workflow_dispatch"];
const EXCEPCIONES_DISPARO = { "dependabot-auto.yml": ["schedule", "workflow_dispatch", "workflow_run"] };

/** Las únicas expresiones que se admiten dentro de un script. */
const PERMITIDAS = /^(?:github\.(?:repository|server_url|run_id|workspace)|vars\.[A-Za-z_][A-Za-z0-9_]*)$/;

/** Las líneas de cada script (`run:` o `script:`, en línea o en bloque), con su número. */
function lineasDeScript(texto) {
  const lineas = texto.split("\n");
  const fuera = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)(?:- )?(?:run|script):\s*(.*)$/.exec(lineas[i]);
    if (!m) continue;
    const sangria = m[1].length;
    if (m[2] && !/^[|>][-+]?\s*(?:#.*)?$/.test(m[2])) { fuera.push([i + 1, m[2]]); continue; }
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (l.trim() && l.search(/\S/) <= sangria) break;
      fuera.push([j + 1, l]);
    }
  }
  return fuera;
}

/** Las expresiones `${{ … }}` de un script que no están en la lista de permitidas. */
function expresionesNoPermitidas(texto) {
  return lineasDeScript(texto).flatMap(([n, l]) => [...l.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)]
    .filter((m) => !PERMITIDAS.test(m[1])).map((m) => `${n}: ${m[0]}`));
}

/**
 * Los disparadores de `on:`: las claves del primer nivel bajo `on:`, con la
 * sangría que tenga, o la lista en línea (`on: [push, pull_request]`).
 * null si el workflow no tiene `on:`.
 */
function disparadores(texto) {
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => /^(?:on|"on"|'on'|true):/.test(l));
  if (i === -1) return null;
  const enLinea = /^\S+:\s*([^#]*)/.exec(lineas[i])[1].trim();
  if (enLinea) return enLinea.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const fuera = [];
  let nivel = null;
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j];
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const sangria = l.search(/\S/);
    if (sangria === 0) break;
    nivel ??= sangria;
    const m = /^\s*([A-Za-z_]+)\s*:/.exec(l);
    if (sangria === nivel && m) fuera.push(m[1]);
  }
  return fuera;
}

const conEnvironment = (texto) => /^\s*environment:/m.test(texto.replace(/#.*$/gm, ""));

describe("los workflows: nada ajeno en los scripts y, con secretos, solo por cron o a mano (#299)", () => {
  it("hay workflows que leer", () => expect(workflows.length).toBeGreaterThan(3));

  it.each(workflows)("%s: ninguna expresión fuera de la lista dentro de un run o un script", (nombre, texto) => {
    expect(expresionesNoPermitidas(texto)).toEqual([]);
  });

  it.each(workflows)("%s: sus disparadores se leen (un on: con la lista vacía es un fallo del lector)", (nombre, texto) => {
    const d = disparadores(texto);
    expect(d, "sin on:").not.toBeNull();
    expect(d.length).toBeGreaterThan(0);
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

  describe("el lector caza cada clase (cada caso, una cosa)", () => {
    const enRun = (linea) => `jobs:\n  a:\n    steps:\n      - name: x\n        run: |\n          ${linea}\n      - name: y\n        env:\n          N: \${{ inputs.notas }}\n`;
    it.each([
      ["inputs", 'echo "${{ inputs.notas }}"'],
      ["github.event", 'echo "${{ github.event.pull_request.title }}"'],
      ["corchetes", "echo \"${{ github.event['pull_request']['title'] }}\""],
      ["head_ref", "echo ${{ github.head_ref }}"],
      ["ref_name", "git checkout ${{ github.ref_name }}"],
      ["ref", "echo ${{ github.ref }}"],
      ["env hecho con inputs", "echo ${{ env.NOTAS }}"],
      ["steps outputs", "echo ${{ steps.datos.outputs.x }}"],
      ["needs", "echo ${{ needs.a.outputs.x }}"],
      ["format", "echo ${{ format('{0}', inputs.notas) }}"],
      ["toJSON", "echo '${{ toJSON(github) }}'"],
      ["fromJSON", "echo ${{ fromJSON(inputs.x).y }}"],
      ["secrets", "curl -H 'x: ${{ secrets.TOKEN }}' https://ejemplo"],
    ])("%s, negada", (_, linea) => expect(expresionesNoPermitidas(enRun(linea))).toHaveLength(1));

    it("lo de la lista y lo que va por env:, permitido", () => {
      expect(expresionesNoPermitidas(enRun('echo "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }} ${{ vars.AVISO }} ${{ github.workspace }}"'))).toEqual([]);
      expect(expresionesNoPermitidas(enRun('echo "$N"'))).toEqual([]);
    });

    it("run en línea y script de github-script", () => {
      expect(expresionesNoPermitidas('      - run: echo "${{ inputs.x }}"\n')).toHaveLength(1);
      const gs = "      - uses: actions/github-script@v8\n        with:\n          script: |\n            core.info('${{ github.event.issue.title }}')\n";
      expect(expresionesNoPermitidas(gs)).toHaveLength(1);
    });

    it("disparadores con cualquier sangría, en línea y con comentarios", () => {
      expect(disparadores("on:\n  push:\n    tags: [x]\n  workflow_dispatch:\njobs: {}\n")).toEqual(["push", "workflow_dispatch"]);
      expect(disparadores("on:\n    # comentario\n    schedule:\n      - cron: '1 * * * *'\n    pull_request:\njobs: {}\n")).toEqual(["schedule", "pull_request"]);
      expect(disparadores("on: [push, pull_request] # dos\n")).toEqual(["push", "pull_request"]);
      expect(disparadores("on:\njobs: {}\n")).toEqual([]);
      expect(disparadores("name: x\n")).toBeNull();
    });
  });
});
