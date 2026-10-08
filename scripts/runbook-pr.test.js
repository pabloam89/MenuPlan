import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarMapa } from "../.claude/hooks/dominios.mjs";
import { comprobar, lineaRunbook } from "./runbook-pr.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapa = cargarMapa(RAIZ);

const TOCA_TELEGRAM = ["scripts/telegram-webhook.mjs", "src/App.jsx"];
const SOLO_APP = ["src/App.jsx", "src/lib/x.js"];
const ok = (a) => comprobar({ mapa, ...a }).ok;

describe("la línea «Runbook:» del cuerpo", () => {
  it.each([
    ["Runbook: sin novedades", "sin novedades"],
    ["runbook: Sin novedades.", "sin novedades"],
    ["- Runbook: actualizado (skill telegram)", "actualizado:telegram"],
    ["Runbook:   actualizado ( skill   vercel )", "actualizado:vercel"],
    ["Closes #4\n\nRunbook: sin novedades\nAgente: sesión", "sin novedades"],
  ])("lee %j", (cuerpo, esperado) => expect(lineaRunbook(cuerpo)).toEqual({ valida: true, valor: esperado }));

  it.each([
    ["", "falta"],
    [null, "falta"],
    ["Closes #4\nAgente: sesión", "falta"],
    ["Runbook:", "vacía"],
    ["Runbook:   \nAgente: x", "vacía"],
    ["Runbook: lo miraré", "no vale"],
    ["Runbook: actualizado", "no vale"],
    ["Runbook: actualizado (skill)", "no vale"],
    ["Runbook: actualizado / sin novedades", "no vale"],
    ["Runbook: actualizado (skill X) / sin novedades", "no vale"],
  ])("no vale %j", (cuerpo, tipo) => {
    const r = lineaRunbook(cuerpo);
    expect(r.valida).toBe(false);
    expect(r.motivo).toMatch(new RegExp(tipo, "i"));
  });

  it("el comentario de la plantilla no cuenta como respuesta", () => {
    const plantilla = "<!--\nRunbook: sin novedades  o  Runbook: actualizado (skill X)\n-->\n\nRunbook:\n";
    expect(lineaRunbook(plantilla).valida).toBe(false);
    expect(lineaRunbook("<!-- Runbook: sin novedades -->").valida).toBe(false);
  });
});

describe("cuándo falla el CI", () => {
  it("un PR que no toca ningún dominio no necesita la línea", () => {
    expect(ok({ cuerpo: "", ficheros: SOLO_APP })).toBe(true);
    expect(ok({ cuerpo: "Closes #1", ficheros: [] })).toBe(true);
  });

  it("toca un dominio sin la línea: falla y dice qué skill", () => {
    const r = comprobar({ mapa, cuerpo: "Closes #1\nAgente: sesión", ficheros: TOCA_TELEGRAM });
    expect(r.ok).toBe(false);
    expect(r.dominios).toEqual(["telegram"]);
    expect(r.motivo).toMatch(/telegram/);
    expect(r.motivo).toMatch(/Runbook:/);
  });

  it("toca un dominio con la línea vacía: falla", () => {
    expect(ok({ cuerpo: "Runbook:\nAgente: sesión", ficheros: TOCA_TELEGRAM })).toBe(false);
  });

  it("toca un dominio con «sin novedades»: pasa", () => {
    expect(ok({ cuerpo: "Runbook: sin novedades", ficheros: TOCA_TELEGRAM })).toBe(true);
  });

  it("«actualizado (skill X)» pasa si el PR toca esa skill", () => {
    const ficheros = [...TOCA_TELEGRAM, ".claude/skills/telegram/SKILL.md"];
    expect(ok({ cuerpo: "Runbook: actualizado (skill telegram)", ficheros })).toBe(true);
  });

  it("«actualizado (skill X)» sin tocar esa skill falla: sería decir que sí sin haberlo hecho", () => {
    const r = comprobar({ mapa, cuerpo: "Runbook: actualizado (skill telegram)", ficheros: TOCA_TELEGRAM });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/\.claude\/skills\/telegram/);
    expect(r.motivo).toMatch(/sin novedades/);
  });

  it("«actualizado» con una skill que no existe falla", () => {
    expect(ok({ cuerpo: "Runbook: actualizado (skill inventada)", ficheros: [...TOCA_TELEGRAM, ".claude/skills/inventada/SKILL.md"] })).toBe(false);
  });

  it("dos dominios: una sola línea sirve", () => {
    expect(ok({ cuerpo: "Runbook: sin novedades", ficheros: ["scripts/telegram-webhook.mjs", "vercel.json"] })).toBe(true);
  });

  describe("lo que nunca debe fallar", () => {
    const cuerpoDependabot = "Bumps [vite](https://github.com/vitejs/vite) from 5.0.0 to 5.0.1.\n<details>…</details>";
    const dominios = [".github/workflows/tests.yml", "vercel.json", "package.json"];
    it.each(["dependabot[bot]", "Dependabot[bot]", "github-actions[bot]"])("PR de %s, aunque toque un dominio", (autor) =>
      expect(ok({ cuerpo: cuerpoDependabot, ficheros: dominios, autor })).toBe(true));
    it("rama dependabot/…, aunque el autor no llegue", () =>
      expect(ok({ cuerpo: cuerpoDependabot, ficheros: dominios, rama: "dependabot/github_actions/staging/actions-semanal-e873aee6fb" })).toBe(true));
    it("pero una persona sin la línea sí falla", () => expect(ok({ cuerpo: cuerpoDependabot, ficheros: dominios, autor: "pabloam89", rama: "ops/x" })).toBe(false));
    it("y un autor que solo lo parece (dependabot-fake) también", () =>
      expect(ok({ cuerpo: "", ficheros: dominios, autor: "dependabot-fake", rama: "ops/x" })).toBe(false));
    it("sin mapa, no bloquea (falla abierto)", () => expect(comprobar({ mapa: null, cuerpo: "", ficheros: dominios }).ok).toBe(true));
  });
});

describe("el script, tal como lo lanza el CI", () => {
  const dir = mkdtempSync(join(tmpdir(), "runbook-"));
  const corre = (cuerpo, ficheros, env = {}) => {
    const lista = join(dir, "ficheros.txt");
    writeFileSync(lista, ficheros.join("\n") + "\n");
    try {
      const salida = execFileSync("node", [join(RAIZ, "scripts", "runbook-pr.mjs"), lista], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PR_BODY: cuerpo, PR_AUTOR: "", PR_RAMA: "", ...env },
      });
      return { codigo: 0, salida };
    } catch (e) {
      return { codigo: e.status, salida: `${e.stdout}${e.stderr}` };
    }
  };

  it("Dependabot: sale 0", () =>
    expect(corre("Bumps x", [".github/workflows/tests.yml"], { PR_AUTOR: "dependabot[bot]" }).codigo).toBe(0));
  it("toca telegram-webhook sin la línea: sale 1 y lo explica", () => {
    const r = corre("Closes #164", ["scripts/telegram-webhook.mjs"]);
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/Runbook:/);
  });
  it("lo mismo con la línea: sale 0", () =>
    expect(corre("Closes #164\nRunbook: sin novedades", ["scripts/telegram-webhook.mjs"]).codigo).toBe(0));
  it("cuerpo con comillas, $ y saltos de línea no se interpreta", () =>
    expect(corre('Runbook: sin novedades\n`rm -rf` $(x) "y"', ["scripts/telegram-webhook.mjs"]).codigo).toBe(0));
});
