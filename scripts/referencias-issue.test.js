// La clase de #856 (fondo #855): toda referencia a un issue que leen las herramientas de la factoría para decidir
// (ficha, bloque `encargo`, `Closes` del CI y de la guardia, línea `Casos:`) se lee con UN lector, que guarda
// { repo, numero }: `#n` es del repo propio y `dueño/repo#n` vale si el repo está en ops/entidades.json, exacto.
// Cifra de antes (15 oct 2026, origin/staging ca3e670b): 0 de 5 lectores aceptaban `dueño/repo#n`;
// 3 expresiones de `Closes`, 3 de la línea `Casos:` y 3 reglas de rama → número. Después: 5 de 5, y una de cada.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decidir } from "../.claude/hooks/guardia.mjs";
import { LINEA_CASOS, analizarCasos } from "../.claude/hooks/casos.mjs";
import { cierresDelPr } from "./fondos-pr.mjs";
import { hijoDeRest, leerEncargo, leerFicha, validarFicha } from "./lib/fondos.mjs";
import { numeroDeRama } from "./lib/lleva.mjs";
import { reposDeProyectos } from "./lib/normas.mjs";
import { escribirReferencia, leerCierres, leerReferencia, mismaReferencia, repoDeIssue } from "../.claude/hooks/referenciaIssue.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROPIO = "pabloam89/MenuPlan";
const PANEL = "pabloam89/homenu-panel";
// Los repos salen del registro de verdad (repo público: nada inventado salvo el repo del rechazo).
const REFS = { repoPropio: PROPIO, repos: reposDeProyectos(RAIZ) };

const CASOS_NINGUNO = "Casos: ninguno — prueba del lector de referencias, sin fallos que registrar";
const ctxGuardia = (rama) => ({
  enStaging: () => false, estadoMd: "", baseDelPr: () => "staging", atrasoLocal: () => 0, choquesDelPr: () => [],
  esPrincipal: () => false, rutaEnPrincipal: () => false, ramaDe: () => rama, leer: () => null,
});
const guardiaDeja = (cuerpo, rama = "ops/301-prueba") =>
  decidir({ tool_name: "Bash", tool_input: { command: "gh pr create --body-file pr.md" } }, { ...ctxGuardia(rama), leer: () => cuerpo })?.decision ?? null;

/**
 * Los lectores de la clase. Cada uno lee UNA referencia del texto y devuelve { repo, numero }, o { error } si
 * la rechaza. La guardia no devuelve la referencia: solo dice si el `Closes` es el de la rama (ops/301-…) del repo
 * propio, así que lee bien si deja pasar el `#301` propio y niega lo demás.
 */
const LECTORES = [
  {
    nombre: "ficha del fondo (casos)", fichero: "scripts/lib/fondos.mjs", funcion: "leerFicha",
    leer: (ref) => {
      const l = leerFicha("```fondo\ncasos: " + ref + "\n```", REFS);
      return l.errores.length ? { error: l.errores[0].mensaje } : l.ficha.casos[0];
    },
  },
  {
    nombre: "bloque encargo (fondo)", fichero: "scripts/lib/fondos.mjs", funcion: "leerEncargo",
    leer: (ref) => {
      const l = leerEncargo("```encargo\nfondo: " + ref + "\n```", REFS);
      return l.errores.length ? { error: l.errores[0].mensaje } : l.ficha.fondo[0];
    },
  },
  {
    nombre: "Closes del CI", fichero: "scripts/fondos-pr.mjs", funcion: "cierresDelPr",
    leer: (ref) => cierresDelPr(`Closes ${ref}`, REFS)[0] ?? { error: "sin Closes" },
  },
  {
    nombre: "Closes de la guardia", fichero: ".claude/hooks/guardia.mjs", funcion: "decidir",
    guardia: true,
    leer: (ref) => (guardiaDeja(`Closes ${ref}\n${CASOS_NINGUNO}`) === null ? { repo: PROPIO, numero: 301 } : { error: "deny" }),
  },
  {
    nombre: "línea Casos:", fichero: ".claude/hooks/casos.mjs", funcion: "analizarCasos",
    leer: (ref) => {
      const a = analizarCasos(`Casos: ${ref}`, REFS);
      return a.valida ? a.referencias[0] : { error: a.motivo };
    },
  },
];

describe("el lector único: leerReferencia, escribirReferencia, mismaReferencia, repoDeIssue", () => {
  it("#n es del repo propio y dueño/repo#n, de ese repo si está en ops/entidades.json", () => {
    expect(leerReferencia("#301", REFS)).toEqual({ repo: PROPIO, numero: 301 });
    expect(leerReferencia(`${PANEL}#301`, REFS)).toEqual({ repo: PANEL, numero: 301 });
    expect(leerReferencia(`${PROPIO}#301`, REFS)).toEqual({ repo: PROPIO, numero: 301 });
  });
  it.each(["PabloAM89/Homenu-Panel#301", "otro/inventado#3", "#0", "#10000001", "301", "#30a", ""])("«%s» da error", (t) => {
    expect(leerReferencia(t, REFS).error).toBeTruthy();
  });
  it("sin repo propio es un fallo de quien llama, no del texto", () => {
    expect(() => leerReferencia("#1", { repos: [] })).toThrow(/repoPropio/);
  });
  it("se escribe corta en su repo y entera fuera, y se compara por repo y número", () => {
    expect(escribirReferencia({ repo: PROPIO, numero: 3 }, PROPIO)).toBe("#3");
    expect(escribirReferencia({ repo: PANEL, numero: 3 }, PROPIO)).toBe(`${PANEL}#3`);
    expect(mismaReferencia({ repo: PROPIO, numero: 3 }, { repo: PANEL, numero: 3 })).toBe(false);
    expect(mismaReferencia({ repo: PANEL, numero: 3 }, { repo: PANEL, numero: 3 })).toBe(true);
  });
  it("el repo de un issue de la API sale de repository_url", () => {
    expect(repoDeIssue({ repository_url: `https://api.github.com/repos/${PANEL}` })).toBe(PANEL);
    expect(repoDeIssue({ repository_url: "https://evil.example/repos/a/b" })).toBeNull();
    expect(repoDeIssue({})).toBeNull();
  });
  it("reposDeProyectos lee projects[].repos de ops/entidades.json: repo → proyecto", () => {
    expect(REFS.repos[PROPIO]).toBe("homenu");
    expect(REFS.repos[PANEL]).toBe("panel");
  });
});

describe.each(LECTORES)("lector $nombre ($fichero)", (l) => {
  it("lee #301 como el repo propio", () => {
    expect(l.leer("#301")).toEqual({ repo: PROPIO, numero: 301 });
  });
  // La cifra del encargo: cuántos de los 5 aceptan la forma completa (antes, 0 de 5).
  it(`acepta la forma completa: ${PROPIO}#301 es el #301 del repo propio`, () => {
    expect(l.leer(`${PROPIO}#301`)).toEqual({ repo: PROPIO, numero: 301 });
  });
  it(`lee ${PANEL}#301 como ese repo, distinto de #301`, () => {
    const r = l.leer(`${PANEL}#301`);
    if (l.guardia) expect(r.error, "un Closes al panel no es el de la rama ops/301 del repo propio").toBeTruthy();
    else expect(r).toEqual({ repo: PANEL, numero: 301 });
  });
  it.each(["PabloAM89/Homenu-Panel#301", "otro/inventado#3"])("«%s» da error", (ref) => {
    expect(l.leer(ref).error).toBeTruthy();
  });
});

describe("#301 y pabloam89/homenu-panel#301 son dos issues distintos", () => {
  it("una ficha con los dos da dos referencias", () => {
    const l = leerFicha(`\`\`\`fondo\ncasos: #301, ${PANEL}#301, #301\n\`\`\``, REFS);
    expect(l.errores).toEqual([]);
    expect(l.ficha.casos).toEqual([{ repo: PROPIO, numero: 301 }, { repo: PANEL, numero: 301 }]);
  });
  it("un hijo #301 del repo propio no cubre al del panel (y al revés)", () => {
    const fondo = (casos, repoHijo) => ({
      number: 900, state: "OPEN", createdAt: "2026-10-15T08:00:00Z", labels: [{ name: "tipo:fondo" }, { name: "causa:codigo" }],
      body: "```fondo\nestado: abierto\ntipo_causa: codigo\nalcance: local\nseveridad: bajo\ncasos: " + casos + "\n```",
      hijos: [hijoDeRest({ number: 301, state: "open", labels: [{ name: "tipo:caso" }], repository_url: `https://api.github.com/repos/${repoHijo}` })],
    });
    const desactualizada = (f) => validarFicha(f, { refs: REFS }).hallazgos.filter((h) => h.regla === "ficha-desactualizada").map((h) => h.mensaje);
    expect(desactualizada(fondo(`${PANEL}#301`, PROPIO))).toEqual(["casos colgados que no están en «casos»: #301"]);
    expect(desactualizada(fondo("#301", PANEL))).toEqual([`casos colgados que no están en «casos»: ${PANEL}#301`]);
    expect(desactualizada(fondo(`${PANEL}#301`, PANEL))).toEqual([]);
  });
  it("la guardia deja la línea Casos: con dueño/repo#n por su forma; el repo y que sea un caso los mira el CI", () => {
    expect(guardiaDeja(`Closes #301\nCasos: ${PANEL}#4`)).toBe(null);
    expect(guardiaDeja("Closes #301\nCasos: otro/inventado#3")).toBe(null);
    expect(analizarCasos("Casos: otro/inventado#3", REFS).valida).toBe(false);
    expect(guardiaDeja("Closes #301\nCasos: otro/inventado")).toBe("deny");
  });
  it("la línea Casos: con los dos da dos referencias", () => {
    expect(analizarCasos(`Casos: #301, ${PANEL}#301`, REFS).referencias).toEqual([{ repo: PROPIO, numero: 301 }, { repo: PANEL, numero: 301 }]);
  });
});

describe("una sola forma de Closes y una sola regla de rama → número", () => {
  it("Closes con el número en otra línea no cuenta en ningún lector", () => {
    expect(leerCierres("Closes\n#193", REFS)).toEqual([]);
    expect(cierresDelPr("Closes\n#193", REFS)).toEqual([]);
    expect(guardiaDeja(`Closes\n#193\n${CASOS_NINGUNO}`, "ops/193-x")).toBe("deny");
    expect(guardiaDeja(`Closes #193\n${CASOS_NINGUNO}`, "ops/193-x")).toBe(null);
  });
  it("las palabras de GitHub, con dos puntos y tabulador, y sin lo que va en comentarios o bloques de código", () => {
    for (const p of ["close", "Closes", "closed", "fix", "Fixes", "fixed", "resolve", "Resolves", "resolved", "Closes:"]) {
      expect(leerCierres(`${p}\t#5`, REFS), p).toEqual([{ repo: PROPIO, numero: 5 }]);
    }
    expect(leerCierres("<!-- Closes #5 -->\n```\nCloses #6\n```", REFS)).toEqual([]);
  });
  it.each([["ops/271-quien-lleva", 271], ["datos/0087-indices", null], ["fix/2026-10-recetas", null], ["ops/123456-x", null]])(
    "%s → %s, en la guardia y en el CI igual", (rama, n) => {
      expect(numeroDeRama(rama)).toBe(n);
      // La guardia pide el Closes solo si la rama tiene número.
      expect(guardiaDeja(CASOS_NINGUNO, rama)).toBe(n === null ? null : "deny");
    },
  );
  it("LINEA_CASOS (la señal de pendientes.mjs) reconoce también dueño/repo#n", () => {
    expect(LINEA_CASOS.test(`Casos: ${PANEL}#4`)).toBe(true);
    expect(LINEA_CASOS.test("Casos: #4")).toBe(true);
    expect(LINEA_CASOS.test("Casos: ninguno — x")).toBe(true);
    expect(LINEA_CASOS.test("Casos: pendiente")).toBe(false);
  });
});

// ── El barrido: ninguna otra expresión de estas formas fuera de su dueño ─────────────────────────────────────────
// Un lector nuevo que escriba su propia expresión de `Closes`, de la línea `Casos:` o de rama → número entra aquí solo.
const DUENOS = {
  closes: [".claude/hooks/referenciaIssue.mjs"],
  casos: [".claude/hooks/casos.mjs"],
  rama: [".claude/hooks/referenciaIssue.mjs"],
  // mapa-entidades.mjs pinta el registro entero en docs/entidades/MAPA.md: lo enseña, no decide nada con él.
  repos: ["scripts/lib/normas.mjs", "scripts/mapa-entidades.mjs"],
};
const FORMAS = {
  // Una expresión con las palabras de cierre de GitHub (close[sd]?, (?:closes|fixes|resolves)…).
  closes: /close\[sd\]|resolve\[sd\]|fix\(\?:?e\[sd\]\)|closes\|fixes|\(\?:close/i,
  // La línea `Casos:` escrita como expresión: `Casos\s*:`, `Casos[ \t]*:`, `Casos(?:\*\*)?`.
  casos: /Casos(?:\\s\*|\[ \\t\]\*|\(\?:\\\*\\\*\)\?)/,
  // Rama → número: `^[a-z]+\/(\d…)-`.
  rama: /\[a-z\]\+\\?\/\(\[?(?:\\d|1-9)/,
  // Lectura de projects[].repos.
  // (`p.repos`, `projects[0].repos`, `find(…).repos`; no el texto «projects[].repos» de un mensaje).
  repos: /(?:\w|\[\d+\]|\))\.repos\b/,
};
const codigo = (dir) => readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((d) => {
  const r = `${dir}/${d.name}`;
  if (d.isDirectory()) return d.name === "node_modules" ? [] : codigo(r);
  return /\.mjs$/.test(d.name) && !/\.test\./.test(d.name) ? [r] : [];
});
// Las líneas de código (sin comentarios de línea ni de bloque, que pueden nombrar la forma al explicarla).
const lineasDeCodigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l));
const fuera = (forma, leer = (f) => readFileSync(join(RAIZ, f), "utf8"), ficheros = [...codigo("scripts"), ...codigo(".claude/hooks")]) =>
  ficheros.filter((f) => !DUENOS[forma].includes(f))
    .flatMap((f) => lineasDeCodigo(leer(f)).filter((l) => FORMAS[forma].test(l) && (forma !== "repos" || /projects|entidades/.test(leer(f)))).map((l) => `${f}: ${l.trim().slice(0, 120)}`));

describe("barrido de scripts/ y .claude/hooks/: cada forma vive solo en su dueño", () => {
  it.each(Object.keys(DUENOS))("%s", (forma) => {
    expect(fuera(forma), `muévelo a ${DUENOS[forma].join(", ")} y úsalo desde allí`).toEqual([]);
  });
  // Autotest: las expresiones que había el 15 oct 2026 (las de #855) se pillan.
  it.each([
    ["closes", String.raw`if (!new RegExp(String.raw\`\b(close[sd]?|fix(e[sd])?|resolve[sd]?):?\s+#\${issue}\b\`, "i").test(texto)) {`],
    ["closes", String.raw`  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \t]+#(\d{1,8})\b/gi;`],
    ["closes", String.raw`    cierra: [...cuerpo.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)/gi)].map((m) => Number(m[1])),`],
    ["casos", String.raw`const LINEA_CASOS = /\bCasos\s*:\s*(?:#\d|ninguno)/i;`],
    ["casos", String.raw`    ? /(?:^|[\s"'(])Casos[ \t]*:[ \t]*(.*)$/gim`],
    ["rama", String.raw`        const issue = rama?.match(/^[a-z]+\/(\d+)-/)?.[1];`],
    ["rama", String.raw`  const deRama = /^[a-z]+\/(\d{1,5})-[a-z]/.exec(String(rama))?.[1];`],
    ["repos", "const r = JSON.parse(readFileSync('ops/entidades.json')).projects[0].repos;"],
  ])("autotest: %s se pilla en «%s»", (forma, linea) => {
    expect(fuera(forma, () => linea, ["scripts/otro.mjs"])).toHaveLength(1);
  });
});
