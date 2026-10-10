import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FALTAS, ERRORES, lineaDe, lineaDeError, medir, leerLinea, resumir, respuestasFinales, textoDeProsa, terminosDeJerga } from "./lib/voz.mjs";

/**
 * El vigilante de la voz (#453): mide la respuesta final a Pablo contra la regla de
 * `estilo-de-respuesta`. Cada regla del vocabulario cerrado tiene aquí un mensaje malo
 * que la dispara y uno bueno que no. Mensajes inventados, fieles a los de las sesiones.
 */
const faltas = (t) => medir(t).faltas;
const frase = (n) => Array.from({ length: n }, (_, i) => "w" + i).join(" ") + ".";

describe("el vocabulario cerrado", () => {
  it("son exactamente las once reglas medibles, sin repetidos", () => {
    expect([...FALTAS].sort()).toEqual([
      "decision_sin_tres_opciones", "emoji", "frase_larga", "ideas_de_mas", "jerga", "numero_sin_nombre",
      "parrafo_largo", "preambulo", "raiz_en_negrita", "recapitulacion_final", "ruta_o_comando_en_prosa",
    ]);
  });
  it("medir solo devuelve faltas del vocabulario", () => {
    const m = medir("Claro, mira #12 y el PR de scripts/a.mjs 🎉\na\nb\nc\nd\ne");
    for (const f of m.faltas) expect(FALTAS).toContain(f);
  });
});

describe("cada regla ve fallar lo que debe y deja pasar lo bueno", () => {
  it("raiz_en_negrita", () => {
    expect(faltas("He terminado el cambio.")).toContain("raiz_en_negrita");
    expect(faltas("Dónde estábamos: el test.\n**Listo.**")).toContain("raiz_en_negrita");
    expect(faltas("**Listo.**")).not.toContain("raiz_en_negrita");
  });
  it("ideas_de_mas: cuatro tras la raíz pasan, cinco fallan", () => {
    expect(faltas("**Listo.**\na\nb\nc\nd")).not.toContain("ideas_de_mas");
    expect(faltas("**Listo.**\na\nb\nc\nd\ne")).toContain("ideas_de_mas");
  });
  it("frase_larga: el umbral es 25", () => {
    expect(faltas("**Ok.**\n" + frase(24))).not.toContain("frase_larga");
    expect(faltas("**Ok.**\n" + frase(25))).toContain("frase_larga");
  });
  it("parrafo_largo: más de cinco frases en una línea", () => {
    expect(faltas("**Ok.**\nUna. Dos. Tres. Cuatro. Cinco.")).not.toContain("parrafo_largo");
    expect(faltas("**Ok.**\nUna. Dos. Tres. Cuatro. Cinco. Seis.")).toContain("parrafo_largo");
  });
  it("preambulo", () => {
    expect(faltas("Claro, te cuento lo que ha pasado.")).toContain("preambulo");
    expect(faltas("**Claro que sí, está hecho.**")).toContain("preambulo");
    expect(faltas("**Está hecho.**")).not.toContain("preambulo");
  });
  it("recapitulacion_final", () => {
    expect(faltas("**Listo.**\nSe cambió el aviso.\nEn resumen, todo está hecho.")).toContain("recapitulacion_final");
    expect(faltas("**Listo.**\nSe cambió el aviso.")).not.toContain("recapitulacion_final");
  });
  it("emoji", () => {
    expect(faltas("**Listo 🎉**")).toContain("emoji");
    expect(faltas("**Listo.**")).not.toContain("emoji");
  });
  it("jerga: sin explicar falla; con su explicación la primera vez, no", () => {
    expect(faltas("**He abierto un PR con el cambio.**")).toContain("jerga");
    expect(faltas("**He abierto un PR (la petición de pasar los cambios a lo principal).**")).not.toContain("jerga");
    expect(faltas("**Una rama es una copia de trabajo aparte.**")).not.toContain("jerga");
    expect(faltas("**He usado una rama.**")).toContain("jerga");
  });
  it("jerga: es palabra completa (no salta en «ramas» dentro de otra palabra ni en «pregunta»)", () => {
    expect(faltas("**Quedó hecho el aviso.**")).not.toContain("jerga");
    expect(faltas("**El CI sigue en curso.**")).toContain("jerga");
  });
  it("decision_sin_tres_opciones", () => {
    expect(faltas("**Necesito que decidas: dónde guardar las copias.**\nA ver qué te parece.")).toContain("decision_sin_tres_opciones");
    expect(faltas("**Necesito que decidas: dónde guardar las copias.**\nA (recomendada): el servidor.\nB: un servicio aparte.\nRespóndeme con la letra.")).toContain("decision_sin_tres_opciones");
    expect(faltas("**Necesito que decidas: dónde guardar las copias.**\nA (recomendada): el servidor.\nB: un servicio aparte.\nC: tu ordenador.\nRespóndeme con la letra.")).not.toContain("decision_sin_tres_opciones");
    expect(faltas("**No hay decisiones pendientes.**")).not.toContain("decision_sin_tres_opciones");
  });
  it("numero_sin_nombre: el número va solo entre paréntesis, detrás del nombre", () => {
    expect(faltas("**Falta el #453.**")).toContain("numero_sin_nombre");
    expect(faltas("**Falta el vigilante de la voz (#453).**")).not.toContain("numero_sin_nombre");
    expect(faltas("**Faltan dos fichas (#453, #454).**")).not.toContain("numero_sin_nombre");
  });
  it("ruta_o_comando_en_prosa", () => {
    expect(faltas("**He tocado scripts/lib/voz.mjs.**")).toContain("ruta_o_comando_en_prosa");
    expect(faltas("**Lanza npm run voz.**")).toContain("ruta_o_comando_en_prosa");
    expect(faltas("**He empujado la rama ops/453-vigilante-voz.**")).toContain("ruta_o_comando_en_prosa");
    expect(faltas("**Se ha hecho git push.**")).toContain("ruta_o_comando_en_prosa");
    expect(faltas("**Mira https://github.com/pabloam89/MenuPlan.**")).not.toContain("ruta_o_comando_en_prosa");
    expect(faltas("**Pega esto.**\n```\nnpm run voz\n```")).not.toContain("ruta_o_comando_en_prosa");
  });
});

describe("no cuenta como falta lo que está en un bloque de código o en una cita", () => {
  it("un bloque de código no cuenta en las reglas de prosa", () => {
    const m = "**Pega esto.**\n```\nnpm run voz -- --si " + frase(40) + " 🎉 #12 scripts/a.mjs\n```";
    expect(faltas(m)).toEqual([]);
  });
  it("una cita (>) de lo que NO hay que hacer no cuenta", () => {
    const m = "**Así no se escribe.**\n> Claro, voy a contarte el PR #12 de scripts/a.mjs 🎉 " + frase(40);
    expect(faltas(m)).toEqual([]);
  });
  it("textoDeProsa quita bloques y citas", () => {
    expect(textoDeProsa("hola\n```js\nx\n```\n> cita\nadiós")).toBe("hola\nadiós");
  });
  it("una respuesta de una sola línea es válida", () => {
    expect(medir("**Sí, está hecho.**")).toMatchObject({ cumple: true, faltas: [], palabras: 3, ideas: 0 });
  });
});

describe("la línea contable", () => {
  it("lleva palabras, ideas, faltas y cumple; sin el texto del mensaje", () => {
    const m = medir("Claro, hecho el PR #9 con SECRETO-DE-FAMILIA");
    const l = lineaDe(m, "2026-10-10");
    expect(l).toMatch(/^voz: dia=2026-10-10 palabras=\d+ ideas=\d+ faltas=\S+ cumple=no$/);
    expect(l).not.toContain("SECRETO-DE-FAMILIA");
  });
  it("sin faltas dice «ninguna» y cumple=sí", () => {
    expect(lineaDe(medir("**Listo.**"), "2026-10-10")).toBe("voz: dia=2026-10-10 palabras=1 ideas=0 faltas=ninguna cumple=sí");
  });
  it("se lee de vuelta", () => {
    const l = lineaDe(medir("Claro, hecho."), "2026-10-10");
    expect(leerLinea(l)).toMatchObject({ dia: "2026-10-10", cumple: false, faltas: expect.arrayContaining(["raiz_en_negrita", "preambulo"]) });
    expect(leerLinea("buscar-antes senal: x")).toBeNull();
  });
  it("el error usa un motivo cerrado", () => {
    expect(lineaDeError("tiempo")).toBe("voz: error=tiempo");
    expect(lineaDeError("inventado")).toBe("voz: error=otro");
    expect(ERRORES).toContain("otro");
  });
});

describe("el resumen", () => {
  const l = (dia, texto) => lineaDe(medir(texto), dia);
  const lineas = [
    l("2026-10-09", "**Listo.**"), l("2026-10-10", "**Listo.**"), l("2026-10-10", "Claro, hecho."),
    l("2026-10-10", "**He abierto un PR.**"), lineaDeError("tiempo"), "buscar-antes senal: x",
  ];
  it("cuenta respuestas medidas, % que cumple, regla más fallada y tendencia por día", () => {
    const r = resumir(lineas, { hoy: "2026-10-10", dias: 7 });
    expect(r.medidas).toBe(4);
    expect(r.cumplen).toBe(2);
    expect(r.porcentaje).toBe(50);
    expect(r.errores).toBe(1);
    expect(r.reglas[0].regla).toMatch(/raiz_en_negrita|preambulo|jerga/);
    expect(r.porDia).toEqual([{ dia: "2026-10-09", medidas: 1, cumplen: 1 }, { dia: "2026-10-10", medidas: 3, cumplen: 1 }]);
  });
  it("solo cuenta la ventana de días pedida", () => {
    const r = resumir([l("2026-09-01", "Claro."), ...lineas], { hoy: "2026-10-10", dias: 7 });
    expect(r.medidas).toBe(4);
  });
  it("sin datos no divide por cero", () => {
    expect(resumir([], { hoy: "2026-10-10" })).toMatchObject({ medidas: 0, porcentaje: null });
  });
});

describe("respuestasFinales: el último texto de cada turno del transcript", () => {
  const a = (t) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: t }] } });
  const u = (t) => JSON.stringify({ type: "user", message: { content: t } });
  const uso = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] } });
  const res = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } });
  it("devuelve una por turno, ignora resultados de herramientas y líneas rotas", () => {
    const jsonl = [u("hola"), a("voy a mirar"), uso, res, a("**Hecho.**"), "{roto", u("otra cosa"), a("**Segunda.**")].join("\n");
    expect(respuestasFinales(jsonl)).toEqual(["**Hecho.**", "**Segunda.**"]);
  });
});

describe("el glosario de jerga sale de la skill (una sola fuente)", () => {
  it("lee la tabla «Traducir la jerga» de estilo-de-respuesta", () => {
    const t = terminosDeJerga();
    for (const x of ["rama", "PR", "CI", "migración", "staging", "hook"]) expect(t).toContain(x);
  });
});

describe("el hook: falla abierto y no guarda texto", () => {
  const hook = join(process.cwd(), ".claude/hooks/voz.mjs");
  const correr = (entrada, dir) => spawnSync(process.execPath, [hook], { input: typeof entrada === "string" ? entrada : JSON.stringify(entrada), encoding: "utf8", env: { ...process.env, MENUPLAN_BUSCAR_DIR: dir }, timeout: 15000 });
  const leerLog = (dir) => { try { return readFileSync(join(dir, "voz.log"), "utf8"); } catch { return ""; } };

  it("mide el último mensaje de la sesión principal y anota solo la línea contable", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const r = correr({ session_id: "s1", last_assistant_message: "Claro, mira el PR SECRETO-DE-FAMILIA" }, dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const log = leerLog(dir);
    expect(log).toMatch(/^voz: dia=\d{4}-\d\d-\d\d palabras=5 /);
    expect(log).toContain("preambulo");
    expect(log).not.toContain("SECRETO-DE-FAMILIA");
  });
  it("un subagente no cuenta", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    correr({ session_id: "s1", agent_id: "x", last_assistant_message: "Claro, hecho." }, dir);
    expect(leerLog(dir)).toBe("");
  });
  it("entrada rota: sale con 0, sin salida y deja voz: error=", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const r = correr("esto no es json", dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(leerLog(dir)).toMatch(/^voz: error=entrada\n$/);
  });
  it("sin last_assistant_message usa el transcript", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const t = join(dir, "t.jsonl");
    writeFileSync(t, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "**Hecho.**" }] } }) + "\n");
    correr({ session_id: "s2", transcript_path: t }, dir);
    expect(leerLog(dir)).toContain("faltas=ninguna cumple=sí");
  });
});
