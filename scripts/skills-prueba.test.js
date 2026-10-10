import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SALIDA, topeDePasada } from "./lib/evals.mjs";
import {
  ESTADOS_PRUEBA, NINGUNA, RAIZ, TOPE_SKILLS_USD, catalogoParaDisparo, comparar, jsonDeTexto,
  nombresDeSkills, promptDisparo, promptEjecuta, resumen, leerRespuesta, OPCIONES_EJECUTA, MOTIVOS_SIN_RESPUESTA,
} from "./lib/skills.mjs";

/**
 * Lo del nivel 2 de las skills (#336) que no necesita la API: prompts, lectura
 * de respuestas, resumen y comparación con la pasada anterior, el tope y la
 * entrada del script. Lo que sí llama a la API se prueba corriéndolo
 * (`npm run skills-prueba`), con su resultado en ops/skills-prueba/.
 */

const correr = (...args) => spawnSync(process.execPath, [join(RAIZ, "scripts/skills-prueba.mjs"), ...args], { encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: "" } });

describe("el disparo", () => {
  it("el catálogo trae todas las skills con su descripción", () => {
    const cat = catalogoParaDisparo();
    expect(cat.map((s) => s.nombre)).toEqual(nombresDeSkills());
    for (const s of cat) expect(s.descripcion, s.nombre).toMatch(/^Úsala /);
  });

  it("el prompt lista cada skill y la salida «ninguna», y no lleva el cuerpo de ninguna", () => {
    const cat = catalogoParaDisparo();
    const p = promptDisparo(cat);
    for (const s of cat) expect(p).toContain(`- ${s.nombre}: `);
    expect(p).toContain(NINGUNA);
    expect(p).not.toContain("## Operaciones habituales");
  });

  it("la ejecución sí lleva la skill entera", () => {
    const texto = readFileSync(join(RAIZ, ".claude/skills/github/SKILL.md"), "utf8");
    expect(promptEjecuta(texto)).toContain(texto);
  });
});

describe("leer lo que contesta el modelo", () => {
  it("saca el JSON aunque venga con texto alrededor", () => {
    expect(jsonDeTexto('Claro: {"skill": "github"} y ya')).toEqual({ skill: "github" });
  });
  it("null si no hay JSON o está roto", () => {
    expect(jsonDeTexto("la de github")).toBeNull();
    expect(jsonDeTexto('{"skill": ')).toBeNull();
    expect(jsonDeTexto('{"skill": }')).toBeNull();
    expect(jsonDeTexto(undefined)).toBeNull();
  });

  // #338: el modelo razonaba por defecto, se comía los tokens y la respuesta vacía contaba como skill que falla.
  it("una respuesta vacía o cortada no se corrige: sale con su motivo", () => {
    expect(leerRespuesta({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "…" }] }).motivo).toBe("cortada");
    expect(leerRespuesta({ stop_reason: "max_tokens", content: [{ type: "text", text: "a medias" }] }).motivo).toBe("cortada");
    expect(leerRespuesta({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "…" }] }).motivo).toBe("vacia");
    expect(leerRespuesta({ stop_reason: "end_turn", content: [{ type: "text", text: "  " }] }).motivo).toBe("vacia");
    expect(MOTIVOS_SIN_RESPUESTA).toEqual(expect.arrayContaining(["vacia", "cortada"]));
  });
  it("una respuesta entera vale, aunque venga en varios bloques de texto", () => {
    expect(leerRespuesta({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "uno " }, { type: "text", text: "dos" }] }))
      .toEqual({ texto: "uno dos", motivo: null });
  });
  it("la ejecución va sin razonamiento extendido y con sitio para contestar", () => {
    expect(OPCIONES_EJECUTA.thinking).toEqual({ type: "disabled" });
    expect(OPCIONES_EJECUTA.maxTokens).toBeGreaterThan(1200);
  });
  it("el script usa ese lector y esas opciones, y no corrige lo que no vale", () => {
    const s = readFileSync(join(RAIZ, "scripts/skills-prueba.mjs"), "utf8");
    expect(s).toContain("return leerRespuesta(data)");
    expect(s).toContain("...OPCIONES_EJECUTA");
    expect(s).toContain("if (r.motivo)");
  });
});

describe("resumen y comparación", () => {
  const pasada = (disparo, ejecucion) => ({
    disparo: disparo.map(([id, estado]) => ({ id, estado })),
    ejecucion: ejecucion.map(([id, estado, cumplen]) => ({ id, estado, comprobaciones: cumplen.map((c) => ({ texto: "x", cumple: c })) })),
  });

  it("cuenta aciertos de disparo, comprobaciones y lo que no corrió", () => {
    const r = resumen(pasada([["a", "ok"], ["b", "falla"], ["c", "sin_correr"]], [["a", "falla", [true, false]], ["b", "ok", [true]]]));
    expect(r).toEqual({ disparo_ok: 1, disparo_total: 3, comprobaciones_ok: 2, comprobaciones_total: 3, sin_correr: 1 });
  });

  it("compara caso a caso: mejora, empeora, igual y nuevo; lo que no corrió no compara", () => {
    const antes = pasada([["a", "ok"], ["b", "falla"], ["c", "ok"]], [["a", "ok", [true]]]);
    const ahora = pasada([["a", "falla"], ["b", "ok"], ["c", "ok"], ["d", "ok"], ["e", "sin_correr"]], [["a", "ok", [true]]]);
    const cambio = Object.fromEntries(comparar(antes, ahora).map((c) => [`${c.parte}:${c.id}`, c.cambio]));
    expect(cambio).toEqual({ "disparo:a": "empeora", "disparo:b": "mejora", "disparo:c": "igual", "disparo:d": "nuevo", "ejecucion:a": "igual" });
  });

  it("sin pasada anterior, todo es nuevo", () => {
    expect(comparar(null, pasada([["a", "ok"]], [])).map((c) => c.cambio)).toEqual(["nuevo"]);
  });

  it("los estados son un vocabulario cerrado", () => {
    expect(ESTADOS_PRUEBA).toEqual(["ok", "falla", "sin_correr"]);
  });
});

describe("el tope", () => {
  it("el propio es bajo y no pasa nunca de lo que queda del presupuesto de evals", () => {
    expect(TOPE_SKILLS_USD).toBeLessThanOrEqual(1);
    expect(topeDePasada(TOPE_SKILLS_USD)).toBeLessThanOrEqual(TOPE_SKILLS_USD);
    expect(topeDePasada(TOPE_SKILLS_USD, 1e6)).toBe(0);
  });
});

describe("la entrada del script (sin llamar a la API)", () => {
  it("sin skills, no corre nada y sale con «entrada»", () => {
    expect(correr().status).toBe(SALIDA.entrada);
  });
  it("una skill que no existe, «entrada»", () => {
    const r = correr("inventada", "--ensayo");
    expect(r.status).toBe(SALIDA.entrada);
    expect(r.stderr).toContain("inventada");
  });
  it("un tope mal escrito no vale «sin tope»", () => {
    expect(correr("github", "--tope=mucho", "--ensayo").status).toBe(SALIDA.entrada);
  });
  it("el ensayo dice cuántas llamadas y el tope, y no llama a nadie", () => {
    const r = correr("github", "supabase", "--ensayo", "--tope=0.5");
    expect(r.status, r.stderr).toBe(SALIDA.bien);
    expect(r.stdout).toMatch(/llamadas como mucho · tope 0\.50 \$/);
    expect(r.stdout).toContain("no se llama a ninguna API");
  });
});
