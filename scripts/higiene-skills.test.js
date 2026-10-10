import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SECCIONES_POR_TIPO, nombresDeSkills, tiposDeSkill } from "./lib/skills.mjs";
import { leerForja } from "./lib/forja.mjs";
import { CODIGOS_FORJA, MAX_SOLAPE, solape } from "./lib/skillsForja.mjs";
import {
  ARREGLOS, CODIGOS_HIGIENE, higieneDeSkill, higieneDelRepo, lineaDeResumen, scriptsDeNpm, solapeMaximo,
} from "./lib/higieneSkills.mjs";

/**
 * La higiene de una skill (#411): sobre una skill mala hecha a propósito tiene que
 * señalar TODOS sus defectos, cada uno con su arreglo, y una buena sale limpia.
 * El repo de mentira (contexto inyectado) no lee disco.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const HOY = new Date("2026-10-10T12:00:00Z");
const FORJA = leerForja(RAIZ);
/** Las líneas de la ficha con las respuestas que dan un tipo (#495); la mala es de diagnóstico. */
const respuestasDe = (tipo) => FORJA.preguntas_tipo.map((p) => `  ${p.clave}: ${p.tipo === tipo}`).join("\n");
const relleno = "Texto de relleno suficientemente largo para que la sección no cuente como vacía.";

/**
 * Una skill de mentira, de diagnóstico salvo que `tipo` diga otro; `secciones` toca el texto de
 * cada sección y `orden` cambia las secciones que lleva (por defecto, las de su tipo).
 */
function oficio({ descripcion, comprobado = "2026-10-01", secciones = {}, ficheros = ["SKILL.md", "casos.json"], extra = {}, casos, antes = "", tipo = "diagnostico", orden = SECCIONES_POR_TIPO[tipo] } = {}) {
  const cuerpo = orden.map((t) => {
    if (secciones[t] !== undefined) return `## ${t}\n\n${secciones[t]}`;
    if (t === "Método") return `## ${t}\n\n${relleno}\n\nSale bien si la prueba pasa.`;
    if (t === "Registro de cambios") return `## ${t}\n\n- **2026-10-01** · Primera versión (#411).`;
    if (t === "Fuentes y comprobación") return `## ${t}\n\n- https://ejemplo.invalid\n\nComprobado el ${comprobado}: la prueba.`;
    if (t === "Lo que falló y por qué") return `## ${t}\n\n- **2026-10-01 · síntoma de prueba.** Causa: la que sea. Arreglo: el que sea.`;
    return `## ${t}\n\n${relleno}`;
  }).join("\n\n");
  const d = descripcion ?? "Úsala al probar la higiene de las skills con una de mentira («revisa esta skill», «¿está al día?»). No para: medir si dispara (skills-prueba) ni crearla (forja-de-skills).";
  return {
    nombre: "mala",
    texto: `---\nname: mala\ndescription: ${d}\nmetadata:\n  tipo: ${tipo}\n${respuestasDe(tipo)}\n  dueno: gobierno\n  comprobado: ${comprobado}\n---\n\n# Mala\n\n${antes}${cuerpo}\n`,
    ficheros, extra,
    casos: casos ?? {
      skill: "mala",
      casos: [
        { id: "uno", peticion: "Revisa la skill de vercel y dime qué defectos tiene.", skill: "mala", debe_salir: ["Lista los defectos con su arreglo"] },
        { id: "dos", peticion: "¿Está al día la skill de hetzner o caduca pronto?", skill: "mala", debe_salir: ["Dice cuántos días le quedan de plazo"] },
        { id: "tres", peticion: "Pásale una pasada de higiene a todas las skills del repositorio.", skill: "mala", debe_salir: ["Da la cifra de faltas y de avisos"] },
        { id: "f-uno", peticion: "El despliegue de la preview falla en Vercel con un error rojo.", skill: "otra" },
        { id: "f-dos", peticion: "Quiero dar de alta un token nuevo para el workflow.", skill: "otra" },
        { id: "f-tres", peticion: "Cuéntame un chiste sobre pizzas napolitanas.", skill: "ninguna" },
      ],
    },
  };
}

const CATALOGO_LIMPIO = [
  { nombre: "mala", descripcion: "" },
  { nombre: "otra", descripcion: "Úsala en despliegues de preview y logs de funciones." },
];

function ctxDe({ catalogo, otras = [], otrosCasos = [], existe, scriptsNpm = ["higiene-skills", "buscar"] } = {}) {
  return {
    hoy: HOY,
    tipos: tiposDeSkill(RAIZ),
    preguntas: FORJA.preguntas_tipo,
    agentes: { gobierno: ["mala", "otra"], lola: [] },
    skills: ["mala", "otra", "forja-de-skills"],
    existe: existe ?? ((r) => r === "scripts/lib/skills.mjs"),
    scriptsNpm,
    catalogo: catalogo ?? CATALOGO_LIMPIO,
    otras,
    otrosCasos,
  };
}
const codigos = (defectos) => [...new Set(defectos.map((d) => d.codigo))].sort();

describe("una skill buena sale limpia (si no, lo de abajo no prueba nada)", () => {
  it("sin defectos ni avisos", () => {
    const b = oficio();
    const c = ctxDe({ catalogo: [{ nombre: "mala", descripcion: b.texto.match(/description: (.*)/)[1] }, ...CATALOGO_LIMPIO.slice(1)] });
    expect(higieneDeSkill(b, c)).toEqual([]);
  });
});

describe("cada skill de nivel 2 se mira contra el molde de su tipo (#495)", () => {
  const seccionesDe = (s) => higieneDeSkill(s, ctxDe()).filter((d) => d.codigo === "secciones");
  it("una de revisión con «Qué mira» y «Cómo puntúa» no tiene defectos de secciones", () => {
    expect(SECCIONES_POR_TIPO.revision).toEqual(expect.arrayContaining(["Qué mira", "Cómo puntúa"]));
    expect(seccionesDe(oficio({ tipo: "revision" }))).toEqual([]);
  });
  it("una de revisión con las secciones de antes falta, y el arreglo remite al molde", () => {
    const vieja = oficio({ tipo: "revision", orden: ["Cuándo y para qué", "Método", "Cómo se prueba", "Cuándo se poda", "Lo que falló y por qué", "Registro de cambios", "Fuentes y comprobación"] });
    const d = seccionesDe(vieja);
    expect(d.map((x) => x.gravedad)).toContain("falta");
    expect(d[0].arreglo).toContain(".claude/plantillas-skill/<tipo>.md");
  });
  it("cada tipo de la forja tiene arreglo para su tipo, y el arreglo dice dónde van las respuestas", () => {
    expect(ARREGLOS.tipo).toContain("preguntas_tipo de ops/forja.json");
    expect(ARREGLOS.tipo).not.toContain("ops/flujo.json");
  });
});

describe("la skill mala hecha a propósito: señala TODOS sus defectos", () => {
  const secreto = `sk-${"a".repeat(25)}`;
  const mala = oficio({
    descripcion: "Úsala con cosas de skills y de otras cosas varias. No para: otras cosas.",
    comprobado: "2026-07-20", // 82 días: vigente pero a menos de 30 de caducar
    ficheros: ["SKILL.md", "casos.json", "suelto.md"],
    secciones: {
      "Método": `${relleno}\n\nDesde el 9 oct 2026 se hace así. Lanza npm run higiene-skills a mano y mira ops/fantasma.json.`,
      "Técnicas": [
        relleno,
        "Mira la skill `fantasma` y corre `npm run no-existe` o `node scripts/fantasma.mjs` o `ops/fantasma.md`; la clave de prueba es " + secreto + ".",
        "| Qué | Comando |\n|---|---|\n| uno | `a` | de más |\n| dos |  |",
        "#### Salto de cabecera",
        "Párrafo copiado en otra skill: " + "esta frase se repite igual en las dos skills para que el control de copiado la vea y avise sin dudar. ".repeat(2),
        Array.from({ length: 130 }, (_, i) => `Línea de relleno número ${i}.`).join("\n"),
      ].join("\n\n"),
      "Ejemplo resuelto": Array.from({ length: 4 }, (_, i) => `### Ejemplo ${i + 1}\n\n${relleno}`).join("\n\n"),
      "Lo que falló y por qué": "- **2026-10-01 · síntoma sin causa.** Solo cuenta lo que pasó.",
    },
    casos: {
      skill: "mala",
      casos: [
        { id: "uno", peticion: "Revisa la skill de vercel y dime qué defectos tiene.", skill: "mala", debe_salir: ["Lista los defectos con su arreglo"] },
        { id: "dos", peticion: "Revisa la skill de vercel y dime qué defectos tiene hoy.", skill: "mala", debe_salir: ["Lista los defectos con su arreglo"] },
        { id: "tres", peticion: "Pásale una pasada de higiene a todas las skills del repositorio.", skill: "mala", debe_salir: ["corto"] },
        { id: "f-uno", peticion: "El despliegue de la preview falla en Vercel con un error rojo.", skill: "otra" },
      ],
    },
  });
  mala.texto = mala.texto.replace("(#411).", "(#411).\n\nPrecio de prueba. ").replace("Comprobado el 2026-07-20: la prueba.", "Comprobado el 2026-07-20: la prueba.");
  const copiada = `${"esta frase se repite igual en las dos skills para que el control de copiado la vea y avise sin dudar. ".repeat(2)}`.trim();
  const ajena = { nombre: "otra", texto: `# Otra\n\nPárrafo copiado en otra skill: ${copiada}\n`, ficheros: [], extra: {}, casos: null };
  const descMala = mala.texto.match(/description: (.*)/)[1];
  const ctx = ctxDe({
    catalogo: [{ nombre: "mala", descripcion: descMala }, { nombre: "otra", descripcion: descMala }],
    otras: [ajena],
    otrosCasos: [{ skill: "otra", id: "f-uno", peticion: "El despliegue de la preview falla en Vercel con un error rojo." }],
  });
  const defectos = higieneDeSkill(mala, ctx);

  it("encuentra cada defecto de la forja y de la forma, y cada uno de la higiene propia", () => {
    const quiero = [
      "caduca-pronto", "casos", "casos-negativos", "sin-parada", "comando-muerto", "comando-suelto", "copiado", "descripcion-sin-palabras",
      "ejemplos", "estructura", "fechas", "formato", "frontera-vaga", "frontmatter", "caso-duplicado", "ruta-muerta", "rutas",
      "secretos", "skill-muerta", "solape", "tabla", "cabeceras", "tamano-cerca",
    ];
    expect(codigos(defectos)).toEqual(expect.arrayContaining(quiero));
  });

  it("cada defecto trae su arreglo y los de higiene propios están en el vocabulario", () => {
    for (const d of defectos) {
      expect(d.arreglo, d.codigo).toBeTruthy();
      expect(["falta", "aviso"], d.codigo).toContain(d.gravedad);
    }
    for (const c of [...CODIGOS_HIGIENE, ...CODIGOS_FORJA]) expect(ARREGLOS[c], `sin arreglo para ${c}`).toBeTruthy();
  });

  it("las faltas van antes que los avisos", () => {
    const gravedades = defectos.map((d) => d.gravedad);
    expect(gravedades).toEqual([...gravedades].sort((a, b) => (a === "falta" ? 0 : 1) - (b === "falta" ? 0 : 1)));
  });

  it("la línea de resumen se puede contar", () => {
    expect(lineaDeResumen("mala", defectos, solapeMaximo(mala, ctx.catalogo))).toMatch(/^higiene skill: mala faltas: \d+ avisos: \d+ solape: 1\.00 con: otra$/);
  });

  it("entre las pruebas de este fichero se ve cada código del vocabulario de higiene", () => {
    const vistos = new Set(codigos(defectos));
    // Los que no caben en la skill mala (excluyentes con otro de arriba) se ven en los casos de abajo.
    const aparte = ["solape-cercano", "caso-en-frontera"];
    expect(CODIGOS_HIGIENE.filter((c) => !vistos.has(c) && !aparte.includes(c))).toEqual([]);
  });
});

describe("los avisos que no caben en la skill mala", () => {
  it("solape-cercano: cerca del límite pero sin pasarlo, con la cifra", () => {
    // 8 palabras de 5 letras o más por lado y 3 en común: 3/13 = 0,23.
    const a = "Úsala con alfa1 bravo cesar delta1 eco11 foxtrot golf1 hotel1 india.";
    const b = "Úsala con alfa1 bravo cesar kilo1 limas mike1 novem1 oscar1 papa1.";
    const s = solape(a, b);
    expect(s).toBeGreaterThan(MAX_SOLAPE * 0.8);
    expect(s).toBeLessThanOrEqual(MAX_SOLAPE);
    const c = ctxDe({ catalogo: [{ nombre: "mala", descripcion: a }, { nombre: "otra", descripcion: b }] });
    const d = higieneDeSkill(oficio({ descripcion: `${a} No para: otra cosa (otra).` }), c).find((x) => x.codigo === "solape-cercano");
    expect(d?.detalle).toMatch(/solapa 0\.\d\d con otra/);
  });

  it("caso-en-frontera: una petición propia usa palabras de lo que «No para:» deja a otra skill", () => {
    const desc = "Úsala al revisar una skill («revisa esta skill»). No para: rotar una clave de punta a punta (otra).";
    const casos = oficio().casos;
    casos.casos[0] = { ...casos.casos[0], peticion: "Hay que rotar la clave de la API de Anthropic." };
    const d = higieneDeSkill(oficio({ descripcion: desc, casos }), ctxDe({ catalogo: [{ nombre: "mala", descripcion: desc }, { nombre: "otra", descripcion: "" }] }))
      .find((x) => x.codigo === "caso-en-frontera");
    expect(d?.detalle).toContain("rotar");
    expect(d?.detalle).toContain("otra");
  });

  it("caso-en-frontera no avisa por las palabras de la propia skill ni del nombre de la otra", () => {
    const desc = "Úsala al revisar una skill de higiene («revisa esta skill»). No para: crearla (otra).";
    const casos = oficio().casos;
    casos.casos[0] = { ...casos.casos[0], peticion: "Revisa la higiene de esta skill otra vez." };
    expect(higieneDeSkill(oficio({ descripcion: desc, casos }), ctxDe({ catalogo: [{ nombre: "mala", descripcion: desc }, { nombre: "otra", descripcion: "" }] }))
      .filter((x) => x.codigo === "caso-en-frontera")).toEqual([]);
  });

  it("tipo y dueño: un tipo que no casa con sus respuestas y un dueño que no la carga son faltas (#457: todo código se ve salir)", () => {
    const b = oficio();
    const otroTipo = { ...b, texto: b.texto.replace("  tipo: diagnostico", "  tipo: revision") };
    expect(higieneDeSkill(otroTipo, ctxDe()).find((x) => x.codigo === "tipo")?.gravedad).toBe("falta");
    const sinCargar = { ...ctxDe(), agentes: { gobierno: ["otra"], lola: [] } };
    expect(higieneDeSkill(b, sinCargar).find((x) => x.codigo === "dueno")?.gravedad).toBe("falta");
  });

  it("tamano: más de 220 líneas es falta del nivel 1 y no solo aviso", () => {
    const relleno220 = Array.from({ length: 230 }, (_, i) => `Línea ${i}.`).join("\n\n");
    const d = higieneDeSkill(oficio({ secciones: { "Técnicas": relleno220 } }), ctxDe());
    expect(codigos(d)).toContain("tamano");
    expect(codigos(d)).not.toContain("tamano-cerca");
  });

  it("caducada es falta con su propio código (el del criterio caducada, #457); a 30 días o menos de caducar, aviso", () => {
    const vieja = higieneDeSkill(oficio({ comprobado: "2026-06-01" }), ctxDe());
    expect(vieja.find((x) => x.codigo === "caducada")?.gravedad).toBe("falta");
    expect(vieja.map((x) => x.codigo)).not.toContain("comprobado");
    const pronto = higieneDeSkill(oficio({ comprobado: "2026-07-20" }), ctxDe()).find((x) => x.codigo === "caduca-pronto");
    expect(pronto?.gravedad).toBe("aviso");
    expect(pronto?.detalle).toMatch(/caduca en 8 días/);
    expect(higieneDeSkill(oficio({ comprobado: "2026-09-01" }), ctxDe()).map((x) => x.codigo)).not.toContain("caduca-pronto");
  });

  it("el historial puede citar lo que ya no existe: «Lo que falló» y el registro no cuentan como referencias muertas", () => {
    const secciones = { "Lo que falló y por qué": "- **2026-10-01 · se quitó `npm run viejo`.** Causa: sobraba, en `ops/viejo.json`. Arreglo: skill `muerta` retirada." };
    expect(codigos(higieneDeSkill(oficio({ secciones }), ctxDe())).filter((c) => /muert/.test(c))).toEqual([]);
  });
});

describe("sobre el repo de verdad", () => {
  it("la forja se cumple a sí misma y no tiene defectos", () => {
    expect(higieneDelRepo("forja-de-skills", RAIZ, HOY).filter((d) => d.gravedad === "falta")).toEqual([]);
  });

  it("una skill que no existe se rechaza", () => {
    expect(() => higieneDelRepo("no-existe", RAIZ, HOY)).toThrow(/No existe/);
  });

  it("ningún comando de npm run de esta skill falta: el script higiene-skills está en package.json", () => {
    expect(scriptsDeNpm(RAIZ)).toContain("higiene-skills");
  });

  it("el script: una skill concreta, --todas, una que no existe y sin argumentos", () => {
    const ok = spawnSync("node", ["scripts/higiene-skills.mjs", "forja-de-skills"], { cwd: RAIZ, encoding: "utf8" });
    expect(ok.stdout).toMatch(/^higiene skill: forja-de-skills faltas: 0 /);
    const todas = spawnSync("node", ["scripts/higiene-skills.mjs", "--todas"], { cwd: RAIZ, encoding: "utf8" }).stdout;
    expect(todas.match(/^higiene skill: /gm)?.length).toBe(nombresDeSkills(RAIZ).length);
    expect(todas).toMatch(/Higiene: \d+ skills, \d+ sin defectos, \d+ faltas y \d+ avisos\./);
    expect(spawnSync("node", ["scripts/higiene-skills.mjs", "no-existe"], { cwd: RAIZ, encoding: "utf8" }).status).toBe(2);
    expect(spawnSync("node", ["scripts/higiene-skills.mjs"], { cwd: RAIZ, encoding: "utf8" }).status).toBe(2);
  });
});
