// La puerta de salud tras desplegar existe y está bien puesta (#589, norma `vuelta-atras-probada`).
//
// Es el control de esa norma: si alguien quita el workflow, le cambia el disparador, le amplía los
// permisos, deja una acción sin fijar, pega texto del evento en un `run:` o hace que el paso de
// salud no falle el job, este test cae en el CI. Lo que hace la llamada de verdad (sano, 5xx,
// timeout, sin campo, URL ilegible) lo prueba scripts/salud-despliegue.test.js con una API de mentira.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const RAIZ = resolve(import.meta.dirname, "..");
const RUTA = ".github/workflows/salud-despliegue.yml";
const texto = () => readFileSync(join(RAIZ, RUTA), "utf8");

/** Las faltas de un workflow de salud (texto YAML). Lista vacía si está bien. */
function faltasDePuerta(yaml) {
  const f = [];
  let w;
  try { w = parse(yaml); } catch (e) { return [`no es YAML: ${e.message}`]; }
  const on = w?.on ?? w?.[true];
  if (!on || !("deployment_status" in on)) f.push("no se dispara con deployment_status");
  if (!on || !("workflow_dispatch" in on)) f.push("no se puede lanzar a mano (workflow_dispatch)");
  if (JSON.stringify(w?.permissions) !== JSON.stringify({ contents: "read" })) f.push("los permisos del workflow no son solo contents: read");
  const jobs = Object.values(w?.jobs ?? {});
  if (jobs.length !== 1) f.push("debe tener un solo job");
  for (const j of jobs) {
    const p = j.permissions ?? {};
    const sobran = Object.keys(p).filter((k) => !["contents", "issues"].includes(k));
    if (sobran.length || p.contents !== "read" || p.issues !== "write") f.push(`permisos del job: solo contents: read e issues: write (hay ${JSON.stringify(p)})`);
    if (j.environment) f.push("no lleva environment: la puerta no usa secretos");
    const cond = String(j.if ?? "");
    if (!/staging/.test(cond) || !/main/.test(cond)) f.push("el job no se limita a las ramas staging y main");
    if (!/success/.test(cond) || !/failure/.test(cond)) f.push("el job no contempla los estados success y failure/error del despliegue");
    const pasos = j.steps ?? [];
    for (const s of pasos) {
      if (s.uses && !/@[0-9a-f]{40}(\s|$)/.test(`${s.uses} `)) f.push(`acción sin fijar por huella: ${s.uses}`);
      if (s.run && /\$\{\{/.test(s.run)) f.push(`texto del evento dentro de un run: ${String(s.run).slice(0, 40)}`);
    }
    const salud = pasos.find((s) => /salud-despliegue\.mjs/.test(String(s.run ?? "")));
    if (!salud) f.push("ningún paso lanza scripts/salud-despliegue.mjs");
    else if (salud["continue-on-error"]) f.push("el paso de salud tiene continue-on-error: el job no saldría en rojo");
    if (!pasos.some((s) => /gh issue (create|comment)/.test(String(s.run ?? "")))) f.push("ningún paso avisa en un issue");
  }
  return f;
}

describe("la puerta de salud tras desplegar (#589)", () => {
  it("el workflow existe y cumple lo que se le pide", () => {
    expect(existsSync(join(RAIZ, RUTA))).toBe(true);
    expect(faltasDePuerta(texto())).toEqual([]);
  });

  it("el script que lanza existe", () => {
    expect(existsSync(join(RAIZ, "scripts/salud-despliegue.mjs"))).toBe(true);
  });

  it("la norma vuelta-atras-probada tiene a este test como control", () => {
    const n = JSON.parse(readFileSync(join(RAIZ, "ops/normas.json"), "utf8")).normas.find((x) => x.id === "vuelta-atras-probada");
    expect(n?.control).toBe("ops/salud-despliegue.test.js");
    expect(n?.control_tipo).toBe("test");
  });

  it("la regla ve cada falta (visto fallar con workflows rotos)", () => {
    const bueno = texto();
    const rotos = {
      "sin deployment_status": bueno.replace("  deployment_status:\n", "  push:\n"),
      "permisos de más": bueno.replace("permissions:\n  contents: read\n\nconcurrency", "permissions: write-all\n\nconcurrency"),
      "acción sin fijar": bueno.replace(/actions\/setup-node@[0-9a-f]{40} # v6/, "actions/setup-node@v6"),
      "evento en un run": bueno.replace('case "$RAMA" in staging|main) ;; *) exit 0 ;; esac', 'echo "${{ github.event.deployment.ref }}"'),
      "paso de salud que no falla": bueno.replace("        id: salud\n", "        id: salud\n        continue-on-error: true\n"),
      "con environment": bueno.replace("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    environment: vigia\n"),
    };
    for (const [caso, yaml] of Object.entries(rotos)) {
      expect(yaml, `${caso}: el cambio de prueba no se aplicó`).not.toBe(bueno);
      expect(faltasDePuerta(yaml).length, caso).toBeGreaterThan(0);
    }
  });
});
