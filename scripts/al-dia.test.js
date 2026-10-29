// El despertador «al día»: tras cada push a staging pone al día UN solo PR, el
// armado más antiguo que va detrás de la base. Y el workflow que lo lanza no
// abre la puerta a nada más. Plan puente HoMenu, trozo 15.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { armadosPorAntiguedad, BASE, DECISIONES, decidir, linea, MOTIVOS, pasada } from "./al-dia.mjs";

const REPO = "pabloam89/MenuPlan";

function pr(n, creado, extra = {}) {
  return {
    number: n,
    created_at: creado,
    draft: false,
    auto_merge: { merge_method: "squash" },
    base: { ref: "staging" },
    head: { sha: String(n).padStart(40, "0"), repo: { full_name: REPO } },
    ...extra,
  };
}

// api falso: abiertos, cuántos commits va detrás cada PR (por número) y qué
// responde update-branch (por número; por defecto, bien).
function mundo({ abiertos, detras = {}, rechaza = {}, cae = {} }) {
  const llamadas = [];
  const api = async (ruta, { method = "GET", body } = {}) => {
    llamadas.push({ method, ruta, body });
    const cmp = /^\/compare\/staging\.\.\.(\d{40})$/.exec(ruta);
    if (cmp) {
      const n = Number(cmp[1]);
      if (cae[n]) throw new Error("boom");
      return { behind_by: detras[n] ?? 0 };
    }
    const upd = /^\/pulls\/(\d+)\/update-branch$/.exec(ruta);
    if (upd && method === "PUT") {
      const n = Number(upd[1]);
      if (rechaza[n]) {
        const e = new Error("422");
        e.status = rechaza[n];
        throw e;
      }
      return { message: "Updating pull request branch." };
    }
    throw new Error(`ruta inesperada ${method} ${ruta}`);
  };
  const paginas = async (ruta) => {
    expect(ruta).toBe(`/pulls?state=open&base=${BASE}`);
    return abiertos;
  };
  return { api, paginas, llamadas };
}
const puts = (llamadas) => llamadas.filter((l) => l.method === "PUT");

describe("al-dia: quién entra", () => {
  it("solo armados, de este repo, no borrador, contra staging; el más antiguo primero", () => {
    const abiertos = [
      pr(5, "2026-10-05T10:00:00Z"),
      pr(2, "2026-10-02T10:00:00Z"),
      pr(3, "2026-10-03T10:00:00Z", { auto_merge: null }),
      pr(4, "2026-10-04T10:00:00Z", { draft: true }),
      pr(6, "2026-10-01T10:00:00Z", { head: { sha: "6".repeat(40), repo: { full_name: "otro/MenuPlan" } } }),
      pr(7, "2026-10-01T09:00:00Z", { head: { sha: "7".repeat(40), repo: null } }),
      pr(8, "2026-10-01T08:00:00Z", { base: { ref: "main" } }),
      pr(1, "2026-10-02T10:00:00Z"),
    ];
    expect(armadosPorAntiguedad(abiertos, REPO).map((p) => p.number)).toEqual([1, 2, 5]);
  });
  it("sin PR abiertos, lista vacía", () => {
    expect(armadosPorAntiguedad([], REPO)).toEqual([]);
  });
});

describe("al-dia: decidir", () => {
  it("detrás de la base: actualizado; al día: espera", () => {
    expect(decidir({ detras: 3 })).toEqual({ decision: "actualizado", motivo: "-" });
    expect(decidir({ detras: 0 })).toEqual({ decision: "espera", motivo: "al-dia" });
  });
  it("las decisiones y motivos que usa están en el vocabulario cerrado", () => {
    for (const d of [decidir({ detras: 1 }), decidir({ detras: 0 })]) {
      expect(DECISIONES).toContain(d.decision);
      expect(MOTIVOS).toContain(d.motivo);
    }
    expect(linea({ pr: 7, decision: "actualizado", motivo: "-" })).toBe("al-dia pr: 7 decision: actualizado motivo: -");
  });
  it("linea lanza con una decisión o un motivo fuera del vocabulario", () => {
    expect(() => linea({ pr: 1, decision: "fusionado", motivo: "-" })).toThrow(/decisión fuera del vocabulario/);
    expect(() => linea({ pr: 1, decision: "espera", motivo: "otro" })).toThrow(/motivo fuera del vocabulario/);
  });
  it("todas las líneas que escribe pasada (ensayo, 422, error de la API, al día) están en el vocabulario", async () => {
    const lineas = [];
    for (const [si, rechaza, detras, cae] of [
      [false, {}, { 1: 1, 2: 1 }, {}],
      [true, { 1: 422 }, { 1: 1, 2: 1 }, {}],
      [true, { 1: 500 }, { 1: 1, 2: 1 }, {}],
      [true, {}, { 1: 0, 2: 0 }, { 1: true }],
    ]) {
      const m = mundo({ abiertos: [pr(1, "2026-10-01T00:00:00Z"), pr(2, "2026-10-02T00:00:00Z")], detras, rechaza, cae });
      lineas.push(...(await pasada({ ...m, repo: REPO, si, log: () => {}, avisar: () => {} })).lineas);
    }
    expect(lineas).toHaveLength(6);
    for (const l of lineas) {
      const [, decision, motivo] = /decision: (\S+) motivo: (\S+)/.exec(l);
      expect(DECISIONES).toContain(decision);
      expect(MOTIVOS).toContain(motivo);
    }
    // y cada valor del vocabulario se usa en alguna línea (si no, sobra)
    const vistos = lineas.map((l) => /decision: (\S+) motivo: (\S+)/.exec(l).slice(1));
    for (const d of DECISIONES) expect(vistos.some(([x]) => x === d)).toBe(true);
    for (const mo of MOTIVOS.filter((x) => x !== "-")) expect(vistos.some(([, y]) => y === mo)).toBe(true);
  });
});

describe("al-dia: pasada", () => {
  it("pone al día solo el armado más antiguo que va detrás, aunque haya más detrás", async () => {
    const m = mundo({
      abiertos: [pr(30, "2026-10-03T00:00:00Z"), pr(10, "2026-10-01T00:00:00Z"), pr(20, "2026-10-02T00:00:00Z")],
      detras: { 10: 0, 20: 4, 30: 2 },
    });
    const r = await pasada({ ...m, repo: REPO, si: true, log: () => {} });
    expect(r.fallos).toBe(0);
    const p = puts(m.llamadas);
    expect(p).toHaveLength(1);
    expect(p[0].ruta).toBe("/pulls/20/update-branch");
    expect(p[0].body).toEqual({ expected_head_sha: "20".padStart(40, "0") });
    // el 30 ni se mira: uno cada vez
    expect(m.llamadas.some((l) => l.ruta.includes(String(30).padStart(40, "0")))).toBe(false);
    expect(r.lineas).toContain("al-dia pr: 10 decision: espera motivo: al-dia");
    expect(r.lineas).toContain("al-dia pr: 20 decision: actualizado motivo: -");
  });
  it("sin --si no escribe: lo dice y no llama a update-branch", async () => {
    const m = mundo({ abiertos: [pr(1, "2026-10-01T00:00:00Z")], detras: { 1: 1 } });
    const r = await pasada({ ...m, repo: REPO, si: false, log: () => {} });
    expect(puts(m.llamadas)).toHaveLength(0);
    expect(r.lineas).toEqual(["al-dia pr: 1 decision: espera motivo: ensayo haria: actualizado"]);
  });
  it("sin armados o con todos al día, no hace nada y no falla", async () => {
    const m = mundo({ abiertos: [pr(1, "2026-10-01T00:00:00Z", { auto_merge: null }), pr(2, "2026-10-02T00:00:00Z")] });
    const r = await pasada({ ...m, repo: REPO, si: true, log: () => {} });
    expect(r.fallos).toBe(0);
    expect(puts(m.llamadas)).toHaveLength(0);
  });
  it("si GitHub rechaza (422: conflicto o rama cambiada), pasa al siguiente y no cuenta fallo", async () => {
    const m = mundo({
      abiertos: [pr(1, "2026-10-01T00:00:00Z"), pr(2, "2026-10-02T00:00:00Z")],
      detras: { 1: 1, 2: 1 },
      rechaza: { 1: 422 },
    });
    const r = await pasada({ ...m, repo: REPO, si: true, log: () => {} });
    expect(r.fallos).toBe(0);
    expect(puts(m.llamadas).map((l) => l.ruta)).toEqual(["/pulls/1/update-branch", "/pulls/2/update-branch"]);
    expect(r.lineas[0]).toBe("al-dia pr: 1 decision: espera motivo: rechazado");
    expect(r.lineas[1]).toBe("al-dia pr: 2 decision: actualizado motivo: -");
  });
  it("cualquier otro fallo de la API se ve: cuenta fallo y no sigue escribiendo", async () => {
    const m = mundo({
      abiertos: [pr(1, "2026-10-01T00:00:00Z"), pr(2, "2026-10-02T00:00:00Z")],
      detras: { 1: 1, 2: 1 },
      rechaza: { 1: 403 },
    });
    const r = await pasada({ ...m, repo: REPO, si: true, log: () => {}, avisar: () => {} });
    expect(r.fallos).toBe(1);
    expect(puts(m.llamadas)).toHaveLength(1);
    expect(r.lineas[0]).toBe("al-dia pr: 1 decision: error motivo: api");
  });
  it("si no se puede ni comparar un PR, falla en alto y mira el siguiente", async () => {
    const m = mundo({
      abiertos: [pr(1, "2026-10-01T00:00:00Z"), pr(2, "2026-10-02T00:00:00Z")],
      detras: { 2: 1 },
      cae: { 1: true },
    });
    const r = await pasada({ ...m, repo: REPO, si: true, log: () => {}, avisar: () => {} });
    expect(r.fallos).toBe(1);
    expect(puts(m.llamadas).map((l) => l.ruta)).toEqual(["/pulls/2/update-branch"]);
  });
});

describe("al-dia.yml: no abre la puerta", () => {
  const yml = readFileSync(new URL("../.github/workflows/al-dia.yml", import.meta.url), "utf8");
  const sinComentarios = yml.replace(/\s#.*$/gm, "");

  it("solo push a staging", () => {
    expect(sinComentarios).toMatch(/^on:\n {2}push:\n {4}branches: \[staging\]\n\npermissions:/m);
    expect(sinComentarios).not.toMatch(/pull_request|workflow_run|schedule|workflow_dispatch/);
  });
  it("permisos: ninguno arriba y solo leer contenido en el job", () => {
    expect(sinComentarios).toMatch(/^permissions: \{\}$/m);
    const permisosJob = /^ {4}permissions:\n((?: {6}\S.*\n)+)/m.exec(sinComentarios)?.[1].trim().split("\n").map((l) => l.trim());
    expect(permisosJob).toEqual(["contents: read"]);
  });
  it("sin secrets: inherit; el único secreto es la clave de la App, y solo en el paso del token", () => {
    expect(sinComentarios).not.toMatch(/secrets:\s*inherit/);
    expect([...sinComentarios.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])).toEqual(["DEPENDABOT_APP_KEY"]);
    const paso = sinComentarios.split(/\n {6}- /).find((p) => p.includes("secrets.DEPENDABOT_APP_KEY"));
    expect(paso).toMatch(/uses: actions\/create-github-app-token@[0-9a-f]{40}/);
    expect(paso).toMatch(/owner: pabloam89\n/);
    expect(paso).toMatch(/repositories: MenuPlan\n/);
    expect([...paso.matchAll(/permission-([\w-]+): (\w+)/g)].map((m) => `${m[1]}: ${m[2]}`).sort()).toEqual(["contents: write", "pull-requests: write"]);
  });
  it("environment dependabot-auto (solo staging) y un solo update-branch a la vez", () => {
    expect(sinComentarios).toMatch(/^ {4}environment: dependabot-auto$/m);
    expect(sinComentarios).toMatch(/^ {4}concurrency:\n {6}group: al-dia\n {6}cancel-in-progress: false/m);
  });
  it("cada acción fijada por SHA y el checkout es de staging, sin credenciales y solo del script", () => {
    const usos = [...sinComentarios.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(usos).toHaveLength(2);
    for (const u of usos) expect(u).toMatch(/@[0-9a-f]{40}$/);
    expect(sinComentarios).toMatch(/ref: staging\n/);
    expect(sinComentarios).toMatch(/persist-credentials: false/);
    expect(sinComentarios).toMatch(/sparse-checkout: scripts\/al-dia\.mjs\n/);
    expect(sinComentarios).not.toMatch(/github\.event\.(head_commit|pull_request)|github\.head_ref|refs\/pull/);
  });
});
