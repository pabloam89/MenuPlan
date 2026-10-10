import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPAS, MAX_LINEAS, MIN_CASOS, PLAZO_COMPROBADO_DIAS, REGLAS, SECCIONES_POR_TIPO,
  caducidad, caducidades, cargarContexto, cargarSkill, comprobarSkillsPr, faltasDeCopiado, faltasDeSkill,
  nombresDeSkills, tiposDeFlujo,
} from "../scripts/lib/skills.mjs";

/**
 * Nivel 1 de las skills (#336), gratis y en el CI. Todas siguen
 * `.claude/PLANTILLA-SKILL.md`: tipo de los ocho de `ops/flujo.json`, dueño que
 * la carga, fecha de comprobación bien puesta, las secciones de su tipo, un
 * SKILL.md corto con el detalle en capas, rutas que existen, nada copiado entre
 * skills y sus casos de prueba en `casos.json`. Las reglas viven en
 * `scripts/lib/skills.mjs`; aquí se aplican a las de verdad y se ven fallar una
 * a una con una skill de mentira. El nivel 2 (cuesta tokens) es
 * `npm run skills-prueba`.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

const ctx = cargarContexto(RAIZ);
const skills = nombresDeSkills(RAIZ).map((n) => cargarSkill(n, RAIZ));
const ver = (faltas) => faltas.map((f) => `${f.regla}: ${f.detalle}`);

it("hay skills", () => expect(skills.length).toBeGreaterThan(0));

describe.each(skills.map((s) => [s.nombre, s]))("%s", (_nombre, skill) => {
  it("pasa el nivel 1", () => expect(ver(faltasDeSkill(skill, ctx))).toEqual([]));
});

it("ninguna skill copia un párrafo largo de otra", () => {
  expect(ver(faltasDeCopiado(skills))).toEqual([]);
});

// ── Ver fallar cada regla ─────────────────────────────────────────────────

const HOY = new Date("2026-10-10T12:00:00Z");
const FALSO = {
  hoy: HOY,
  tipos: tiposDeFlujo(RAIZ),
  agentes: { gobierno: ["prueba", "otra"], lola: [] },
  skills: ["prueba", "otra"],
  existe: (r) => r === "scripts/lib/skills.mjs" || r === ".claude/skills/prueba/referencias/detalle.md",
};
const relleno = "Texto suficiente para que la sección no cuente como vacía en la prueba.";

function herramienta({ meta = {}, sinSeccion = null, lineasExtra = 0, extraCuerpo = "" } = {}) {
  const m = { tipo: "herramienta", dueno: "gobierno", comprobado: "2026-10-09", ...meta };
  const metaTxt = Object.entries(m).filter(([, v]) => v != null).map(([k, v]) => `  ${k}: ${v}`).join("\n");
  const secciones = {
    "Qué es y dónde": `${relleno} Detalle en \`.claude/skills/prueba/referencias/detalle.md\` y \`scripts/lib/skills.mjs\`.`,
    "Claves y accesos": relleno,
    "Operaciones habituales": "| Qué | Comando | Debe salir |\n|---|---|---|\n| Ver | `ver` | lo que sale |",
    "Lo que falló y por qué": "- **2026-10-09 · síntoma.** Causa: una. Arreglo: otro.",
    "Qué requiere el OK de Pablo": "- Borrar cualquier cosa del servicio de prueba.",
    "Coste y límites": relleno,
    "Fuentes y comprobación": "- https://ejemplo.invalid\n\nComprobado el 2026-10-09: la prueba.",
  };
  const cuerpo = Object.entries(secciones).filter(([t]) => t !== sinSeccion).map(([t, x]) => `## ${t}\n\n${x}`).join("\n\n");
  return `---\nname: prueba\ndescription: Úsala cuando haya que probar el nivel 1 de las skills con una skill de mentira bien hecha. No para: nada real.\nmetadata:\n${metaTxt}\n---\n\n# Prueba\n\n${extraCuerpo}${"\nlínea".repeat(lineasExtra)}\n\n${cuerpo}\n`;
}

const casosBuenos = () => ({
  skill: "prueba",
  casos: [
    { id: "uno", peticion: "Una petición que debe cargar prueba", skill: "prueba", debe_salir: ["Dice el comando ver"] },
    { id: "dos", peticion: "Otra petición que debe cargar prueba", skill: "prueba", debe_salir: ["Dice lo que sale al ver"] },
    { id: "tres", peticion: "Una tercera que debe cargar prueba", skill: "prueba", debe_salir: ["No borra nada sin el OK"] },
    { id: "frontera", peticion: "Una petición que es de la otra skill", skill: "otra" },
  ],
});

const buena = (cambios = {}) => ({
  nombre: "prueba",
  texto: herramienta(),
  ficheros: ["SKILL.md", "casos.json", "referencias/detalle.md"],
  extra: { "referencias/detalle.md": "Detalle de la capa.\n" },
  casos: casosBuenos(),
  ...cambios,
});

it("la skill de mentira pasa el nivel 1 (si no, los casos de abajo no prueban nada)", () => {
  expect(ver(faltasDeSkill(buena(), FALSO))).toEqual([]);
});

const casosDe = (f) => { const c = casosBuenos(); f(c); return c; };
const MUTACIONES = [
  ["frontmatter", "una clave de frontmatter que no va", { texto: herramienta().replace("name: prueba", "name: prueba\nmodel: x") }],
  ["frontmatter", "una descripción sin «No para:»", { texto: herramienta().replace(" No para: nada real.", "") }],
  ["tipo", "sin tipo", { texto: herramienta({ meta: { tipo: null } }) }],
  ["tipo", "un tipo fuera del vocabulario", { texto: herramienta({ meta: { tipo: "manual" } }) }],
  ["dueno", "sin dueño", { texto: herramienta({ meta: { dueno: null } }) }],
  ["dueno", "un dueño que no es agente", { texto: herramienta({ meta: { dueno: "pablo" } }) }],
  ["dueno", "un dueño que no la carga", { texto: herramienta({ meta: { dueno: "lola" } }) }],
  ["comprobado", "sin fecha", { texto: herramienta({ meta: { comprobado: null } }) }],
  ["comprobado", "una fecha futura", { texto: herramienta({ meta: { comprobado: "2026-12-01" } }).replace("Comprobado el 2026-10-09", "Comprobado el 2026-12-01") }],
  ["comprobado", "una fecha que el texto no explica", { texto: herramienta({ meta: { comprobado: "2026-10-08" } }) }],
  ["secciones", "falta una sección", { texto: herramienta({ sinSeccion: "Coste y límites" }) }],
  ["secciones", "las secciones de otro tipo", { texto: herramienta({ meta: { tipo: "oficio" } }) }],
  ["formato", "una operación sin «Debe salir»", { texto: herramienta().replace("| `ver` | lo que sale |", "| `ver` |  |") }],
  ["formato", "un fallo sin arreglo", { texto: herramienta().replace(" Arreglo: otro.", "") }],
  ["tamano", "más líneas que el tope", { texto: herramienta({ lineasExtra: MAX_LINEAS }) }],
  ["secretos", "una clave escrita", { texto: herramienta({ extraCuerpo: `sk-${"a".repeat(30)}` }) }],
  ["rutas", "una ruta citada que no existe", { texto: herramienta({ extraCuerpo: "Ver `scripts/no-existe.mjs`." }) }],
  ["estructura", "un fichero de capa que SKILL.md no cita", { ficheros: ["SKILL.md", "casos.json", "referencias/detalle.md", "referencias/huerfano.md"] }],
  ["estructura", "un fichero fuera de las capas", { ficheros: ["SKILL.md", "casos.json", "referencias/detalle.md", "notas.md"] }],
  ["casos", "sin casos.json", { casos: null }],
  ["casos", "casos.json roto", { casos: { error: "Unexpected token" } }],
  ["casos", "menos casos de los que hacen falta", { casos: casosDe((c) => c.casos.splice(0, 1)) }],
  ["casos", "sin caso de frontera", { casos: casosDe((c) => { c.casos[3] = { ...c.casos[0], id: "cuatro" }; }) }],
  ["casos", "un caso propio sin «debe_salir»", { casos: casosDe((c) => { delete c.casos[0].debe_salir; }) }],
  ["casos", "un caso que pide una skill que no existe", { casos: casosDe((c) => { c.casos[3].skill = "inventada"; }) }],
  ["casos", "dos casos con el mismo id", { casos: casosDe((c) => { c.casos[1].id = "uno"; }) }],
];

it.each(MUTACIONES)("falla la regla %s con %s", (regla, _que, cambio) => {
  const faltas = faltasDeSkill(buena(cambio), FALSO);
  expect(faltas.map((f) => f.regla), ver(faltas).join("\n")).toContain(regla);
});

it("falla «copiado» con un párrafo largo igual en dos skills", () => {
  const parrafo = `Este párrafo es lo bastante largo como para contar como saber: ${"explica algo con detalle ".repeat(5)}`;
  const a = buena({ texto: herramienta({ extraCuerpo: parrafo }) });
  const b = { ...buena({ texto: herramienta({ extraCuerpo: parrafo }) }), nombre: "otra" };
  const delParrafo = (faltas) => faltas.filter((f) => f.regla === "copiado" && f.detalle.includes("Este párrafo es lo bastante"));
  expect(delParrafo(faltasDeCopiado([a, b]))).toHaveLength(1);
  // El mismo párrafo en una sola skill no es copia.
  expect(delParrafo(faltasDeCopiado([a, { ...buena(), nombre: "otra" }]))).toEqual([]);
});

// La caducidad no es del nivel 1: el reloj no pone en rojo todos los PR. Aquí
// solo avisa; falla en el paso «Skills del PR» si el PR toca la skill.
it("una skill caducada no falla el nivel 1, y la regla «caducada» solo salta si el PR la toca", () => {
  const vieja = herramienta({ meta: { comprobado: "2026-06-01" } }).replace("Comprobado el 2026-10-09", "Comprobado el 2026-06-01");
  expect(ver(faltasDeSkill(buena({ texto: vieja }), FALSO))).toEqual([]);
  const estados = [{ nombre: "prueba", ...caducidad(vieja, HOY) }];
  expect(estados[0].estado).toBe("caducada");
  expect(comprobarSkillsPr(["src/App.jsx"], estados).ok).toBe(true);
  expect(comprobarSkillsPr([".claude/skills/prueba/casos.json"], estados).faltas.map((f) => f.regla)).toEqual(["caducada"]);
});

it("avisa (sin fallar) de las skills caducadas o a punto", () => {
  for (const e of caducidades(RAIZ).filter((x) => x.estado !== "vigente")) console.warn(`[skills] ${e.nombre} ${e.estado}: comprobada el ${e.comprobado}, hace ${e.dias} días`);
});

it("cada regla del vocabulario se ve fallar aquí", () => {
  const vistas = new Set([...MUTACIONES.map((m) => m[0]), "copiado", "caducada"]);
  expect(Object.keys(REGLAS).filter((r) => !vistas.has(r))).toEqual([]);
});

it("un tipo nuevo pasa con sus secciones y su registro de cambios", () => {
  const secciones = SECCIONES_POR_TIPO.oficio.map((t) => {
    if (t === "Registro de cambios") return `## ${t}\n\n- **2026-10-09** · Primera versión (#336).`;
    if (t === "Fuentes y comprobación") return `## ${t}\n\n- https://ejemplo.invalid\n\nComprobado el 2026-10-09: la prueba.`;
    if (t === "Lo que falló y por qué") return `## ${t}\n\nNada todavía: es nueva. ${relleno}`;
    return `## ${t}\n\n${relleno}`;
  }).join("\n\n");
  const texto = `---\nname: prueba\ndescription: Úsala cuando haya que probar el nivel 1 de las skills con una skill de oficio de mentira. No para: nada real.\nmetadata:\n  tipo: oficio\n  dueno: gobierno\n  comprobado: 2026-10-09\n---\n\n# Prueba\n\n${secciones}\n`;
  const skill = buena({ texto, ficheros: ["SKILL.md", "casos.json"], extra: {} });
  expect(ver(faltasDeSkill(skill, FALSO))).toEqual([]);
  const sinRegistro = texto.replace("- **2026-10-09** · Primera versión (#336).", "Sin cambios que contar todavía, ninguno.");
  expect(faltasDeSkill({ ...skill, texto: sinRegistro }, FALSO).map((f) => f.regla)).toContain("formato");
});

// ── La plantilla, el catálogo del flujo y CLAUDE.md dicen lo mismo ───────

it("los tipos son los ocho de ops/flujo.json, y cada uno tiene sus secciones", () => {
  expect(Object.keys(SECCIONES_POR_TIPO).sort()).toEqual(tiposDeFlujo(RAIZ).sort());
});

it("la plantilla lista cada tipo con las mismas secciones que exige el test", () => {
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  for (const [tipo, secciones] of Object.entries(SECCIONES_POR_TIPO)) {
    const fila = plantilla.split("\n").find((l) => l.startsWith(`| \`${tipo}\` |`));
    expect(fila, `la plantilla no tiene la fila de ${tipo}`).toBeTruthy();
    expect(fila.split("|")[3].split("·").map((s) => s.trim()), tipo).toEqual(secciones);
  }
  // El bloque de forma de herramienta sigue siendo el de siempre.
  const bloque = plantilla.match(/```markdown\n([\s\S]*?)\n```/)?.[1] ?? "";
  expect([...bloque.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())).toEqual(SECCIONES_POR_TIPO.herramienta);
  for (const capa of CAPAS) expect(plantilla).toContain(`${capa}/`);
  for (const n of [`${MAX_LINEAS} líneas`, `${PLAZO_COMPROBADO_DIAS} días`, `${MIN_CASOS} casos`]) expect(plantilla).toContain(n);
});

it("CLAUDE.md nombra todas las skills", () => {
  const claude = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
  for (const s of skills) expect(claude, `CLAUDE.md no nombra a ${s.nombre}`).toContain(`\`${s.nombre}\``);
});
