import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPAS, MAX_DESCRIPCION, MAX_LINEAS, MIN_CASOS, PLAZO_COMPROBADO_DIAS, REGLAS, SECCIONES_POR_TIPO,
  caducidad, caducidades, catalogoParaDisparo, cargarContexto, cargarSkill, comprobarSkillsPr, faltasDeCopiado, faltasDeSkill,
  nombresDeSkills, parsearSkill, seccion, tiposDeFlujo,
} from "../scripts/lib/skills.mjs";
import {
  CODIGOS_FORJA, EXCEPCIONES_FORJA, EXCEPCIONES_INICIALES, MAX_EJEMPLOS, MAX_SOLAPE, MIN_FRONTERA_FORJA,
  LIMITE_DESCRIPCION_ESTANDAR, LIMITE_LINEAS_ESTANDAR, faltasDeSolape, faltasForja, solape,
} from "../scripts/lib/skillsForja.mjs";

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
    { id: "frontera-dos", peticion: "Otra petición parecida que es de la otra skill", skill: "otra" },
    { id: "frontera-tres", peticion: "Una tercera petición que no es de ninguna skill", skill: "ninguna" },
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
  ["casos", "menos casos de los que hacen falta", { casos: casosDe((c) => c.casos.splice(0, 3)) }],
  ["casos", "sin caso de frontera", { casos: casosDe((c) => { c.casos.splice(3, 3, { ...c.casos[0], id: "cuatro" }); }) }],
  ["casos", "un caso propio sin «debe_salir»", { casos: casosDe((c) => { delete c.casos[0].debe_salir; }) }],
  ["casos", "un caso que pide una skill que no existe", { casos: casosDe((c) => { c.casos[3].skill = "inventada"; }) }],
  ["casos", "dos casos con el mismo id", { casos: casosDe((c) => { c.casos[1].id = "uno"; }) }],
  ["forja", "solo dos casos de frontera", { casos: casosDe((c) => { c.casos.pop(); }) }],
  ["forja", "una fecha en el cuerpo", { texto: herramienta().replace(`## Claves y accesos\n\n${relleno}`, `## Claves y accesos\n\n${relleno} Desde el 9 oct 2026 va así.`) }],
  ["forja", "una fecha ISO en el cuerpo", { texto: herramienta().replace(`## Coste y límites\n\n${relleno}`, `## Coste y límites\n\n${relleno} Al 2026-10-09 cuesta una cifra.`) }],
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
    if (t === "Método") return `## ${t}\n\n${relleno}\n\nSale bien si la prueba pasa.`;
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

// ── La forja (#409): lo automatizable de forja-de-skills ─────────────────

const faltasDe = (cambio) => faltasDeSkill(buena(cambio), FALSO).filter((f) => f.regla === "forja");
const codigos = (faltas) => faltas.map((f) => f.codigo);
const conFecha = (txt) => herramienta().replace(`## Claves y accesos\n\n${relleno}`, `## Claves y accesos\n\n${relleno} ${txt}`);

/** Una skill de oficio de mentira con el Método y la sección de ejemplos que se le den. */
function oficioConForja({ metodo = `${relleno}\n\nSale bien si la prueba pasa.`, ejemplos = relleno } = {}) {
  const secciones = SECCIONES_POR_TIPO.oficio.map((t) => {
    if (t === "Registro de cambios") return `## ${t}\n\n- **2026-10-09** · Primera versión (#409).`;
    if (t === "Fuentes y comprobación") return `## ${t}\n\n- https://ejemplo.invalid\n\nComprobado el 2026-10-09: la prueba.`;
    if (t === "Lo que falló y por qué") return `## ${t}\n\nNada todavía: es nueva. ${relleno}`;
    if (t === "Método") return `## ${t}\n\n${metodo}`;
    if (t === "Ejemplo resuelto") return `## ${t}\n\n${ejemplos}`;
    return `## ${t}\n\n${relleno}`;
  }).join("\n\n");
  return `---\nname: prueba\ndescription: Úsala cuando haya que probar el nivel 1 de las skills con una skill de oficio de mentira. No para: nada real.\nmetadata:\n  tipo: oficio\n  dueno: gobierno\n  comprobado: 2026-10-09\n---\n\n# Prueba\n\n${secciones}\n`;
}
const oficio = (o) => ({ texto: oficioConForja(o), ficheros: ["SKILL.md", "casos.json"], extra: {} });

describe("la forja ve fallar cada control", () => {
  it("la skill de mentira de oficio pasa el nivel 1 entero (si no, lo de abajo no prueba nada)", () => {
    expect(ver(faltasDeSkill(buena(oficio()), FALSO))).toEqual([]);
  });

  it("casos-negativos: menos de MIN_FRONTERA_FORJA peticiones de otra skill", () => {
    expect(codigos(faltasDe({ casos: casosDe((c) => { c.casos.pop(); }) }))).toEqual(["casos-negativos"]);
    expect(MIN_FRONTERA_FORJA).toBe(3);
  });

  it("fechas: una fecha en prosa falla; en código, en «Lo que falló» o en el registro, no", () => {
    expect(codigos(faltasDe({ texto: conFecha("Desde el 9 oct 2026 va así.") }))).toEqual(["fechas"]);
    expect(codigos(faltasDe({ texto: conFecha("Al 2026-10-09 se cambió.") }))).toEqual(["fechas"]);
    expect(faltasDe({ texto: conFecha("Cabecera `anthropic-version: 2023-06-01`.") })).toEqual([]);
    expect(faltasDe({ texto: conFecha("\n\n```\nversion: 2023-06-01\nfecha: 9 oct 2026\n```") })).toEqual([]);
    expect(faltasDe({})).toEqual([]); // la mentira ya lleva fechas en «Lo que falló» y en «Fuentes»
  });

  it("sin-parada: el Método de un tipo que no es herramienta no dice cuándo se acaba", () => {
    expect(codigos(faltasDe(oficio({ metodo: relleno })))).toEqual(["sin-parada"]);
    for (const frase of ["Sale bien si X.", "Sale: el fichero.", "Debe salir Y.", "Hecho cuando Z.", "Para por criterio, no por cansancio.", "- **Sale bien si** X.", "1. Paso. **Sale:** Y."]) {
      expect(faltasDe(oficio({ metodo: `${relleno}\n\n${frase}` })), frase).toEqual([]);
    }
    // Una palabra suelta en mitad de un párrafo no es un criterio de parada.
    for (const frase of ["Hay que parar si algo falla.", "La parada es de la persona.", "Para si hace falta, y sale algo.", "Aquí se dice que sale bien si todo va bien."]) {
      expect(codigos(faltasDe(oficio({ metodo: `${relleno} ${frase}` }))), frase).toEqual(["sin-parada"]);
    }
  });

  it("ejemplos: más de MAX_EJEMPLOS en una sección de ejemplos", () => {
    const n = (k) => Array.from({ length: k }, (_, i) => `### Ejemplo ${i + 1}\n\n${relleno}`).join("\n\n");
    expect(MAX_EJEMPLOS).toBe(3);
    expect(faltasDe(oficio({ ejemplos: n(3) }))).toEqual([]);
    expect(codigos(faltasDe(oficio({ ejemplos: n(4) })))).toEqual(["ejemplos"]);
    // Los subapartados de un ejemplo no son ejemplos, y un «### Ejemplo» dentro de un bloque de código tampoco.
    const con = (k) => Array.from({ length: k }, (_, i) => `### Ejemplo ${i + 1}\n\n#### Entrada\n\n${relleno}\n\n#### Salida\n\n${relleno}`).join("\n\n");
    expect(faltasDe(oficio({ ejemplos: con(3) }))).toEqual([]);
    expect(codigos(faltasDe(oficio({ ejemplos: con(4) })))).toEqual(["ejemplos"]);
    const enBloque = "```\n### Ejemplo A\n### Ejemplo B\n### Ejemplo C\n### Ejemplo D\n```";
    expect(faltasDe(oficio({ ejemplos: `${n(2)}\n\n${enBloque}` }))).toEqual([]);
  });

  it("solape: dos descripciones casi iguales; distintas, no", () => {
    const a = { nombre: "a", descripcion: "Úsala al rotar una credencial caducada del servicio de correo, guardarla en la bóveda y probar que funciona. No para: otra." };
    const b = { nombre: "b", descripcion: "Úsala al rotar una credencial caducada del servicio de correo, guardarla en la bóveda y comprobar que funciona. No para: otra." };
    const c = { nombre: "c", descripcion: "Úsala para diagnosticar por qué falló un despliegue y encontrar la causa raíz de un fallo repetido. No para: otra." };
    expect(faltasDeSolape([a, b]).map((f) => f.skills)).toEqual([["a", "b"]]);
    expect(faltasDeSolape([a, c])).toEqual([]);
    expect(solape(a.descripcion, a.descripcion)).toBe(1);
    expect(solape("", "")).toBe(0);
  });

  it("la lista de excepciones deja pasar el código que nombra y solo ese", () => {
    const fecha = buena({ texto: conFecha("Desde el 9 oct 2026 va así.") });
    expect(codigos(faltasDeSkill(fecha, FALSO))).toEqual(["fechas"]);
    expect(faltasDeSkill(fecha, { ...FALSO, excepcionesForja: { prueba: ["fechas"] } })).toEqual([]);
    expect(codigos(faltasDeSkill(fecha, { ...FALSO, excepcionesForja: { prueba: ["solape"] } }))).toEqual(["fechas"]);
  });

  it("cada código de la forja se ve fallar aquí y está explicado en la skill", () => {
    const vistos = new Set(["casos-negativos", "fechas", "sin-parada", "ejemplos", "solape"]);
    expect(CODIGOS_FORJA.filter((c) => !vistos.has(c))).toEqual([]);
    const defectos = readFileSync(join(RAIZ, ".claude/skills/forja-de-skills/referencias/defectos.md"), "utf8");
    for (const c of CODIGOS_FORJA) expect(defectos, `defectos.md no explica el código ${c}`).toContain(`\`${c}\``);
  });
});

// ── La lista de excepciones solo baja (como TRAGADOS_CONOCIDOS) ──────────

// Los 19 pares de partida. Este literal NO se edita para añadir: solo se le quitan líneas cuando #410 y #411 arreglan la skill.
const PARES_DE_PARTIDA = [
  "1password: casos-negativos", "1password: fechas", "alta-de-secreto: fechas", "causa-raiz: casos-negativos",
  "github: casos-negativos", "github: fechas", "hetzner: casos-negativos", "hetzner: fechas",
  "issues: casos-negativos", "issues: fechas", "plan-de-arreglo: casos-negativos", "supabase: casos-negativos",
  "supabase: fechas", "tailscale: casos-negativos", "tailscale: fechas", "telegram: casos-negativos",
  "telegram: fechas", "vercel: casos-negativos", "vercel: fechas",
];

describe("EXCEPCIONES_FORJA: lo que las skills de hoy incumplen, y solo baja", () => {
  const brutas = Object.fromEntries(skills.map((s) => {
    const { meta, cuerpo } = parsearSkill(s.texto);
    return [s.nombre, codigos(faltasForja({ nombre: s.nombre, cuerpo, tipo: meta?.metadata?.tipo, casos: s.casos }))];
  }));

  it("no hay faltas nuevas fuera de la lista (arregla la skill; la lista no crece)", () => {
    const nuevas = Object.entries(brutas).flatMap(([n, cs]) => cs.filter((c) => !(EXCEPCIONES_FORJA[n] ?? []).includes(c)).map((c) => `${n}: ${c}`));
    expect(nuevas).toEqual([]);
  });

  it("lo arreglado se quita de la lista", () => {
    const sobran = Object.entries(EXCEPCIONES_FORJA).flatMap(([n, cs]) => cs.filter((c) => !(brutas[n] ?? []).includes(c)).map((c) => `${n}: ${c}`));
    expect(sobran, "Ya cumple: bórralo de EXCEPCIONES_FORJA en scripts/lib/skillsForja.mjs").toEqual([]);
  });

  it("cada par (skill, código) de la lista está en el literal de partida: solo se puede quitar", () => {
    const pares = Object.entries(EXCEPCIONES_FORJA).flatMap(([n, cs]) => cs.map((c) => `${n}: ${c}`));
    expect(pares.filter((p) => !PARES_DE_PARTIDA.includes(p)), "Un par nuevo: arregla la skill; la lista no crece ni cambia de sitio").toEqual([]);
    expect(PARES_DE_PARTIDA).toHaveLength(EXCEPCIONES_INICIALES);
  });

  it("la lista tiene claves que son skills y códigos reales", () => {
    for (const [n, cs] of Object.entries(EXCEPCIONES_FORJA)) {
      expect(skills.map((s) => s.nombre), n).toContain(n);
      for (const c of cs) expect(CODIGOS_FORJA, `${n}: ${c}`).toContain(c);
    }
  });

  it("los pares de skills no solapan por encima de MAX_SOLAPE", () => {
    expect(faltasDeSolape(catalogoParaDisparo(RAIZ)).map((f) => f.detalle)).toEqual([]);
  });

  it("forja-de-skills no tiene ninguna excepción: se cumple a sí misma", () => {
    expect(EXCEPCIONES_FORJA["forja-de-skills"]).toBeUndefined();
    expect(brutas["forja-de-skills"]).toEqual([]);
  });
});

// ── La plantilla no contradice la forja ──────────────────────────────────

describe("PLANTILLA-SKILL.md y forja-de-skills dicen lo mismo", () => {
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const forja = readFileSync(join(RAIZ, ".claude/skills/forja-de-skills/SKILL.md"), "utf8").replace(/\r\n/g, "\n");

  it("los números de la forja salen en la plantilla", () => {
    for (const n of [`${MIN_FRONTERA_FORJA} casos de frontera`, `${LIMITE_DESCRIPCION_ESTANDAR} caracteres`, `${LIMITE_LINEAS_ESTANDAR} líneas`, "EXCEPCIONES_FORJA", "forja-de-skills"]) {
      expect(plantilla, n).toContain(n);
    }
  });

  it("los topes de la casa están por debajo de los del estándar abierto", () => {
    expect(MAX_DESCRIPCION).toBeLessThanOrEqual(LIMITE_DESCRIPCION_ESTANDAR);
    expect(MAX_LINEAS).toBeLessThan(LIMITE_LINEAS_ESTANDAR);
  });

  it("la forja es de tipo meta, dice la regla de parada y cita al menos cinco fuentes con URL", () => {
    expect(forja).toContain("tipo: meta");
    expect(forja).toContain("regla_de_parada");
    const fuentes = seccion(parsearSkill(forja).cuerpo, "Fuentes y comprobación");
    expect(new Set(fuentes.match(/https:\/\/\S+/g)).size).toBeGreaterThanOrEqual(5);
  });

  it("la plantilla y la forja dicen la misma forma de descripción que exige el test", () => {
    expect(plantilla).toContain("Úsala <cuándo");
    expect(forja).toContain("Úsala <cuándo");
  });
});
