import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerForja } from "../scripts/lib/forja.mjs";
import {
  CABEZA, COLA, EXCEPCIONES_PLANTILLA, EXCEPCIONES_PLANTILLA_INICIALES, MIN_IDS_LISTA, PISTAS, RUTA_PLANTILLA_COMUN, SECCIONES_POR_TIPO,
  contenedoresJs, estadoDePlantillas, estandarDeTipo, generarPlantilla, generarPlantillas, listasDeTipos, problemasDePlantillas, tiposDeForja,
} from "../scripts/lib/plantillasSkill.mjs";
import { cargarSkill, nombresDeSkills, parsearSkill } from "../scripts/lib/skills.mjs";

/**
 * La plantilla de cada tipo de skill sale de la forja (#495, fondo #488): una
 * sola lista de tipos (`tipos_skill` de `ops/forja.json`), un molde por tipo en
 * `.claude/plantillas-skill/` generado y al día, y ninguna otra lista de tipos
 * escrita a mano en el repo. Cada regla se ve fallar con datos de mentira.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const datos = leerForja(RAIZ);
const clon = () => structuredClone(datos);
const comun = readFileSync(join(RAIZ, RUTA_PLANTILLA_COMUN), "utf8");

describe("las secciones de cada tipo cuadran con la forja", () => {
  it("cada tipo de ops/forja.json tiene sus secciones y su pista, y no sobra nada", () => {
    expect(problemasDePlantillas(datos)).toEqual([]);
  });
  it("falla con un tipo de más, uno de menos, una sección sin pista o una pista sin sección", () => {
    const d = clon();
    // Un tipo sin «secciones» no tiene molde.
    const { secciones: _sinSecciones, ...sinSecciones } = d.tipos_skill[0];
    d.tipos_skill.push({ ...sinSecciones, id: "nuevo" });
    expect(problemasDePlantillas(d).join("\n")).toContain("tipo nuevo: está en tipos_skill");
    const e = clon();
    e.tipos_skill = e.tipos_skill.filter((t) => t.id !== "flujo");
    expect(problemasDePlantillas(e, SECCIONES_POR_TIPO).join("\n")).toContain("tipo flujo: tiene secciones y no está en tipos_skill");
    expect(problemasDePlantillas(datos, { ...SECCIONES_POR_TIPO, flujo: ["Método", "Inventada", "Fuentes y comprobación"] }).join("\n")).toContain("«Inventada» no tiene pista");
    expect(problemasDePlantillas(datos, SECCIONES_POR_TIPO, { ...PISTAS, Huérfana: "una pista que no es de nadie" }).join("\n")).toContain("la pista de «Huérfana»");
    expect(problemasDePlantillas(datos, { ...SECCIONES_POR_TIPO, flujo: ["Método", "Método", "Fuentes y comprobación"] }).join("\n")).toContain("repite");
    expect(problemasDePlantillas(datos, { ...SECCIONES_POR_TIPO, flujo: ["Fuentes y comprobación", "Método"] }).join("\n")).toContain("la última sección");
  });
});

describe("los moldes de .claude/plantillas-skill/ están al día", () => {
  it("uno por tipo, igual que lo generado, y ninguno de más", () => {
    const malos = estadoDePlantillas(RAIZ).filter((e) => e.estado !== "igual").map((e) => `${e.ruta}: ${e.estado}`);
    expect(malos, "Lanza «npm run plantillas -- --escribir»").toEqual([]);
    expect(estadoDePlantillas(RAIZ)).toHaveLength(tiposDeForja(datos).length);
  });
  it("cada molde lleva sus secciones en orden, su pregunta, sus criterios y el estándar entero con su ejemplo", () => {
    const moldes = generarPlantillas(datos, comun);
    for (const t of tiposDeForja(datos)) {
      const m = moldes[t];
      const enEsqueleto = m.split("```markdown")[1].split("\n```")[0];
      expect([...enEsqueleto.matchAll(/^## (.+)$/gm)].map((x) => x[1]), t).toEqual(SECCIONES_POR_TIPO[t]);
      expect(m, t).toContain(`  tipo: ${t}`);
      expect(m, t).toContain("### Ejemplo mínimo");
      expect(m, t).not.toContain("Aún no está escrito");
    }
    expect(moldes.decision).toContain("responde que sí a la pregunta 6 (`elige_opciones`) y que no a las 5 anteriores");
    expect(moldes.servicio).toContain("responde que sí a la pregunta 1 (`opera_proveedor`).");
    expect(moldes.conocimiento).toContain("responde que no a las 6 preguntas");
    expect(moldes.servicio).toContain("No se le aplican: `sin-parada`.");
    expect(moldes.flujo).toContain("`sin-parada`");
  });
  it("cambiar la forja o el estándar cambia el molde; un tipo que no está en la forja no se genera", () => {
    const d = clon();
    d.tipos_skill.find((t) => t.id === "flujo").prueba = "otra prueba distinta";
    expect(generarPlantilla(d, "flujo", { estandar: estandarDeTipo(comun, "flujo") })).not.toBe(generarPlantillas(datos, comun).flujo);
    expect(generarPlantilla(datos, "flujo", { estandar: "Otro estándar." })).not.toBe(generarPlantillas(datos, comun).flujo);
    expect(() => generarPlantilla(datos, "forja")).toThrow("no está en tipos_skill");
  });
  it("el estándar se lee de su apartado y nada más; sin apartado, null", () => {
    const e = estandarDeTipo(comun, "revision");
    expect(e.startsWith("### Qué lo hace bueno")).toBe(true);
    expect(e).toContain("Real: `higiene-de-skills`");
    expect(e).not.toContain("### `conocimiento`");
    expect(estandarDeTipo(comun, "meta")).toBeNull();
    expect(estandarDeTipo("# Sin estándar\n", "flujo")).toBeNull();
  });
});

// ── Una sola lista de tipos: la de ops/forja.json ───────────────────────

/**
 * Dónde puede haber varios tipos juntos, y por qué no es otra lista:
 * - ops/forja.json: es LA lista (y los retirados, con su destino);
 * - .claude/PLANTILLA-SKILL.md, SOLO su sección «El estándar de cada tipo»: un apartado
 *   por tipo, que .claude/skills.test.js obliga a tener exactamente los tipos de la forja;
 *   el resto del fichero se mira como cualquier otro;
 * - docs/ops/FORJA.md: se genera de la forja y ops/forja.test.js lo compara.
 * - ops/vocabularios-vida.json: el ancla de forja.tipo_skill la escribe `npm run glosario --
 *   --vocabularios --escribir` desde la forja, y sus retirados solo crecen; ops/vocabularios-vida.test.js
 *   la compara con tipos_skill (#481).
 * Los *.test.js no cuentan: comprueban, no son fuente (ops/forja-tipos.test.js reescribe
 * a propósito la tabla de Pablo para contrastarla).
 */
const PERMITIDOS = ["ops/forja.json", "docs/ops/FORJA.md", "ops/vocabularios-vida.json"];
/** Secciones exentas dentro de un fichero que por lo demás se mira: { ruta: título de la sección ## }. */
const SECCIONES_EXENTAS = { ".claude/PLANTILLA-SKILL.md": "El estándar de cada tipo" };
/** El texto sin la sección `## titulo` (hasta la siguiente cabecera ##); falla si la sección no está, para que la exención no quede vieja. */
function sinSeccion(texto, titulo, ruta) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const i = lineas.findIndex((l) => l.trim() === `## ${titulo}`);
  if (i < 0) throw new Error(`${ruta}: no tiene la sección «${titulo}» que SECCIONES_EXENTAS exime`);
  const j = lineas.findIndex((l, k) => k > i && /^## /.test(l));
  return [...lineas.slice(0, i), ...(j < 0 ? [] : lineas.slice(j))].join("\n");
}
const VOCABULARIOS = { vigentes: tiposDeForja(datos), retirados: Object.keys(datos.destino_tipos_actuales ?? {}) };

describe("una sola lista de tipos de skill", () => {
  it("no hay otra lista de tipos (vigentes o retirados) fuera de ops/forja.json y de lo que se comprueba contra ella", () => {
    const ficheros = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: RAIZ, encoding: "utf8" })
      .split("\n").filter((f) => /\.(json|m?js|jsx|md)$/.test(f) && !/\.test\.(m?js|jsx)$/.test(f) && !PERMITIDOS.includes(f));
    expect(ficheros.length).toBeGreaterThan(100);
    const otras = ficheros.flatMap((f) => {
      let texto;
      try { texto = readFileSync(join(RAIZ, f), "utf8"); } catch (e) {
        // a propósito: un fichero borrado sin commitear no es una lista; cualquier otro error se enseña
        return [`${f}: no se pudo leer (${e.code})`];
      }
      if (f in SECCIONES_EXENTAS) texto = sinSeccion(texto, SECCIONES_EXENTAS[f], f);
      return listasDeTipos(texto, f, VOCABULARIOS).map((h) => `${h.ruta} (${h.donde}): ${h.vocabulario} ${h.ids.join(", ")}`);
    }).filter((x) => !x.includes("no se pudo leer (ENOENT)"));
    expect(otras, "Los tipos de skill viven solo en tipos_skill de ops/forja.json: lee de allí en vez de escribirlos").toEqual([]);
  });

  it("ve la lista que había en ops/flujo.json y la tabla de secciones antigua, y no avisa de menos de tres", () => {
    const viejoFlujo = JSON.stringify({ tipos_skill: [{ id: "herramienta", estado: "existe" }, { id: "oficio" }, { id: "meta" }] });
    expect(listasDeTipos(viejoFlujo, "ops/flujo.json", VOCABULARIOS).map((h) => `${h.donde} ${h.vocabulario}`)).toEqual(["$.tipos_skill[].id retirados"]);
    const viejoJs = "export const S = {\n  herramienta: A,\n  oficio: [...C, \"Técnicas\"],\n  // dominio: comentario\n  meta: [\"x\"],\n};";
    expect(listasDeTipos(viejoJs, "scripts/lib/x.mjs", VOCABULARIOS).map((h) => h.ids.join())).toEqual(["herramienta,meta,oficio"]);
    expect(listasDeTipos("const T = ['servicio', 'flujo', 'revision'];", "a.js", VOCABULARIOS).map((h) => h.vocabulario)).toEqual(["vigentes"]);
    expect(listasDeTipos("| **servicio** | a |\n| flujo | b |\n| `revision` | c |\n", "a.md", VOCABULARIOS)).toHaveLength(1);
    expect(listasDeTipos("### `servicio`\n\n### `flujo`\n\n### `revision`\n", "a.md", VOCABULARIOS)).toHaveLength(1);
    expect(listasDeTipos(JSON.stringify({ tipo: { fondo: 1, caso: 2, encargo: 3, decision: 4 }, a: ["flujo", "forja"] }), "a.json", VOCABULARIOS)).toEqual([]);
    expect(MIN_IDS_LISTA).toBe(3);
  });

  it("ve también listas con guiones en Markdown y arrays de objetos {tipo: …} en JSON", () => {
    const guiones = "Tipos:\n\n- **servicio**: opera un sistema\n  y sigue aquí.\n- `flujo`: encadena\n- revision, que juzga\n\nOtra cosa.\n";
    expect(listasDeTipos(guiones, "a.md", VOCABULARIOS).map((h) => `${h.donde} ${h.ids.join()}`)).toEqual(["lista de la línea 3 flujo,revision,servicio"]);
    // Dos listas separadas por un párrafo no se suman, y una palabra en mayúscula no es un id.
    expect(listasDeTipos("- servicio\n- flujo\n\nTexto.\n\n- revision\n- Decision\n", "a.md", VOCABULARIOS)).toEqual([]);
    const objetos = JSON.stringify({ filas: [{ tipo: "servicio", n: 1 }, { tipo: "flujo" }, { tipo: "decision" }] });
    expect(listasDeTipos(objetos, "a.json", VOCABULARIOS).map((h) => h.donde)).toEqual(["$.filas[].tipo"]);
  });

  it("la exención de .claude/PLANTILLA-SKILL.md es solo su sección de estándares: fuera de ella, una lista se ve", () => {
    const texto = "# P\n\n## Antes\n\n- servicio\n- flujo\n- revision\n\n## El estándar de cada tipo\n\n### `servicio`\n\n### `flujo`\n\n### `revision`\n\n## Después\n\nNada.\n";
    const resto = sinSeccion(texto, "El estándar de cada tipo", "x.md");
    expect(resto).not.toContain("### `servicio`");
    expect(resto).toContain("## Después");
    expect(listasDeTipos(resto, "x.md", VOCABULARIOS).map((h) => h.donde)).toEqual(["lista de la línea 5"]);
    expect(() => sinSeccion("# P\n", "El estándar de cada tipo", "x.md")).toThrow(/no tiene la sección/);
  });

  it("ningún texto dice ya que las respuestas van en respuestas_tipo de la forja: van en el frontmatter", () => {
    for (const f of [".claude/PLANTILLA-SKILL.md", ".claude/skills/forja-de-skills/SKILL.md", "CLAUDE.md", "docs/ops/FORJA.md"]) {
      expect(readFileSync(join(RAIZ, f), "utf8"), f).not.toContain("respuestas_tipo");
    }
  });

  it("el lector de JS salta cadenas y comentarios, y ve claves con y sin comillas", () => {
    const c = contenedoresJs("const a = { \"uno\": 1, dos: [\"tres\", 'cu{atro'] /* { cinco: 1 } */ };\n// { seis: 1 }\nconst b = `{ siete: 1 }`;");
    expect(c.map((x) => x.ids)).toEqual([["tres"], ["uno", "dos"]]);
  });
});

// ── Lo escrito a mano que tiene que cuadrar con la forja ────────────────

/** Los títulos en negrita de una lista (numerada o con guiones) dentro de la sección `### titulo` de un Markdown. */
function negritasDeSeccion(texto, titulo) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const i = lineas.findIndex((l) => l.trim() === `### ${titulo}`);
  if (i < 0) return null;
  const j = lineas.findIndex((l, k) => k > i && /^#{2,3} /.test(l));
  return lineas.slice(i + 1, j < 0 ? undefined : j).map((l) => l.match(/^(?:\d+\.|-)\s+\*\*([^*]+?)\.?\*\*/)?.[1]).filter(Boolean);
}

describe("lo escrito a mano cuadra con la forja", () => {
  const otros = tiposDeForja(datos).filter((t) => t !== "servicio");

  it("«El servicio, sección a sección» de la plantilla común son las secciones del servicio, en orden", () => {
    expect(negritasDeSeccion(comun, "El servicio, sección a sección")).toEqual(SECCIONES_POR_TIPO.servicio);
    expect(negritasDeSeccion("### El servicio, sección a sección\n\n1. **Qué es y dónde.** x\n2. **Otra.** y\n", "El servicio, sección a sección")).not.toEqual(SECCIONES_POR_TIPO.servicio);
  });
  it("«Los demás tipos» solo describe secciones que llevan todos los tipos que no son servicio", () => {
    const comunes = negritasDeSeccion(comun, "Los demás tipos");
    expect(comunes.length).toBeGreaterThan(2);
    for (const t of otros) for (const s of comunes) expect(SECCIONES_POR_TIPO[t], `${t} no lleva «${s}»`).toContain(s);
  });
  it("CABEZA y COLA (con las que se escriben las excepciones) son de todos los tipos que no son servicio: COLA al final y CABEZA en su orden", () => {
    for (const t of otros) {
      const ss = SECCIONES_POR_TIPO[t];
      expect(ss.slice(-COLA.length), t).toEqual(COLA);
      expect(CABEZA.map((s) => ss.indexOf(s)).every((x, i, a) => x >= 0 && (i === 0 || x > a[i - 1])), `${t}: ${ss.join(", ")}`).toBe(true);
    }
  });
  it("las respuestas de la ficha (campos bool de campos_ficha.skill) son exactamente las preguntas de preguntas_tipo", () => {
    const bools = Object.entries(datos.campos_ficha.skill.campos).filter(([, c]) => c.clase === "bool").map(([n]) => n);
    expect(bools.sort()).toEqual(datos.preguntas_tipo.map((p) => p.clave).sort());
  });
  it("en cada molde (nivel 2), tipo y las respuestas son obligatorios con el valor de su tipo, y nivel no ofrece el 1", () => {
    for (const t of tiposDeForja(datos)) {
      const molde = generarPlantilla(datos, t, { estandar: estandarDeTipo(comun, t) });
      expect(molde, t).toContain(`| \`tipo\` | enum | sí | \`${t}\` |`);
      for (const p of datos.preguntas_tipo) expect(molde, `${t} ${p.clave}`).toContain(`| \`${p.clave}\` | bool | sí | \`${p.tipo === t}\` en este tipo |`);
      const nivel = molde.split("\n").find((l) => l.startsWith("| `nivel` |"));
      expect(nivel, t).not.toContain("`1`");
      expect(nivel, t).toContain("`2`");
    }
  });
});

// ── Las excepciones de la migración: solo bajan ─────────────────────────

/** Las skills que no podían seguir su molde al migrar (10 oct 2026). Este literal NO se edita para añadir: solo se le quitan nombres. */
const EXCEPCIONES_DE_PARTIDA = ["estilo-de-respuesta", "issues"];

describe("EXCEPCIONES_PLANTILLA: lo que la migración de tipos no pudo arreglar sin contenido nuevo, y solo baja", () => {
  const skills = Object.fromEntries(nombresDeSkills(RAIZ).map((n) => [n, cargarSkill(n, RAIZ)]));
  const titulos = (n) => [...parsearSkill(skills[n].texto).cuerpo.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const tipo = (n) => parsearSkill(skills[n].texto).meta.metadata.tipo;

  it("cada excepción es de una skill de la lista de partida: la lista no crece", () => {
    expect(Object.keys(EXCEPCIONES_PLANTILLA).filter((n) => !EXCEPCIONES_DE_PARTIDA.includes(n))).toEqual([]);
    expect(EXCEPCIONES_DE_PARTIDA).toHaveLength(EXCEPCIONES_PLANTILLA_INICIALES);
  });
  it("cada excepción sigue haciendo falta: sus secciones no son las de su tipo (si ya lo son, quítala)", () => {
    for (const n of Object.keys(EXCEPCIONES_PLANTILLA)) {
      expect(n in skills, n).toBe(true);
      expect(titulos(n), `${n} ya sigue el molde de ${tipo(n)}: bórrala de EXCEPCIONES_PLANTILLA`).not.toEqual(SECCIONES_POR_TIPO[tipo(n)]);
    }
  });
  it("cada excepción dice por qué y hasta cuándo", () => {
    for (const [n, e] of Object.entries(EXCEPCIONES_PLANTILLA)) {
      expect(e.motivo.length, n).toBeGreaterThanOrEqual(40);
      expect(e.hasta.length, n).toBeGreaterThan(3);
      expect(Array.isArray(e.secciones) && e.secciones.at(-1), n).toBe("Fuentes y comprobación");
    }
  });
  it("las demás skills de nivel 2 llevan exactamente las secciones de su tipo, y la pieza meta las de nivel_0", () => {
    const nivel0 = (n) => parsearSkill(skills[n].texto).meta.metadata.nivel === "0";
    for (const n of Object.keys(skills).filter((x) => !(x in EXCEPCIONES_PLANTILLA) && !nivel0(x))) expect(titulos(n), `${n} (${tipo(n)})`).toEqual(SECCIONES_POR_TIPO[tipo(n)]);
    for (const n of Object.keys(skills).filter(nivel0)) expect(titulos(n), n).toEqual(datos.nivel_0.skills.secciones);
  });
});
