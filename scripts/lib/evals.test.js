// Evals de Lola (encargo #268): las etiquetas de los casos en vocabulario
// cerrado, el tope de gasto, pass^k por niveles y la memoria por hashes.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CAMPOS_FILA, DOMINIOS_CASO, K_ALERGIAS, K_POR_NIVEL, MOTIVOS_FALLO, NIVELES, NUCLEO, ORIGENES_CASO,
  PRESUPUESTO_MENSUAL_EUR, TIPOS_CASO, TIPOS_DE_SEGURIDAD, bloquea, cabeOtro, casoHash, casosDelNivel,
  casosVersion, canonico, claveMemo, costeUsd, erroresDeCasos, esDeSeguridad, estadoDe, estimadoSiguiente,
  kDe, memoria, opcionNumero, otroIntento, presupuestoMensualUsd, topeDePasada,
  apuntarGasto, apuntarOAvisar, gastoDelMesUsd, mesDeMadrid, puedeGastar, MOTIVOS_TOPE_EVALS,
  COSTE_PASADA_COMPLETA_USD, TOPE_COMPLETO_POR_FAMILIA, baseMemo, codigoHash, compararEstados, elegirReferencia, ficherosDelCodigo, grafoDeImports,
} from "./evals.mjs";

const RAIZ = new URL("../../", import.meta.url);
const { casos } = JSON.parse(readFileSync(new URL("scripts/bot-evals.json", RAIZ), "utf8"));

describe("bot-evals.json: cada caso con id, tipo, dominio y origen de la lista", () => {
  it("ningún error de etiquetas", () => expect(erroresDeCasos(casos)).toEqual([]));

  it("el núcleo N1 son 12 de seguridad y 12 del resto", () => {
    const n1 = casosDelNivel(casos, "pr");
    expect(n1.filter(esDeSeguridad).length).toBe(NUCLEO.seguridad);
    expect(n1.filter((c) => !esDeSeguridad(c)).length).toBe(NUCLEO.resto);
  });

  it("los de seguridad están marcados (más que el núcleo, y en alergias y salud los más)", () => {
    const seg = casosDelNivel(casos, "seguridad");
    expect(seg.length).toBeGreaterThan(NUCLEO.seguridad);
    const deAlergias = seg.filter((c) => c.dominio === "alergias_salud").length;
    expect(deAlergias).toBeGreaterThan(seg.length / 3);
  });

  it("cada tipo de seguridad es de la lista de tipos", () => {
    for (const t of TIPOS_DE_SEGURIDAD) expect(TIPOS_CASO).toContain(t);
  });
});

describe("erroresDeCasos: una cosa mal, un error", () => {
  const bueno = { id: "uno", tipo: "texto", dominio: "faq", origen: "escrito", nombre: "x", entrada: "x" };
  const errores = (cambio, otros = []) => erroresDeCasos([...otros, { ...bueno, ...cambio }]);

  it("el bueno pasa", () => expect(errores({})).toEqual([]));
  it("id repetido", () => expect(errores({}, [{ ...bueno }])).toEqual([expect.stringMatching(/id repetido/)]));
  it("id que no es slug", () => expect(errores({ id: "Con Espacios" })).toEqual([expect.stringMatching(/no es un slug/)]));
  it("sin id", () => expect(errores({ id: undefined })).toEqual([expect.stringMatching(/no es un slug/)]));
  it("tipo fuera de lista", () => expect(errores({ tipo: "otro" })).toEqual([expect.stringMatching(/tipo .* fuera de lista/)]));
  it("dominio fuera de lista", () => expect(errores({ dominio: "otro" })).toEqual([expect.stringMatching(/dominio .* fuera de lista/)]));
  it("origen fuera de lista", () => expect(errores({ origen: "otro" })).toEqual([expect.stringMatching(/origen .* fuera de lista/)]));
  it("nucleo que no es true", () => expect(errores({ nucleo: "si" })).toEqual([expect.stringMatching(/nucleo/)]));
  it("dependeDeFecha que no es true", () => expect(errores({ dependeDeFecha: "si" })).toEqual([expect.stringMatching(/dependeDeFecha solo/)]));
  it("habla de un día sin dependeDeFecha", () => expect(errores({ entrada: "¿qué cenamos el jueves?" })).toEqual([expect.stringMatching(/le falta "dependeDeFecha"/)]));
  it("habla de un día y lo lleva: bien", () => expect(errores({ entrada: "¿qué cenamos mañana?", dependeDeFecha: true })).toEqual([]));
  it("«ahora», «este mes», «cada día» y «hasta el 31» también atan al día", () => {
    for (const entrada of ["a partir de ahora nada de coliflor", "este mes estoy a dieta", "cada día cocino lo del día", "nada de fritos hasta el 31"]) {
      expect(errores({ entrada }), entrada).toEqual([expect.stringMatching(/le falta "dependeDeFecha"/)]);
    }
  });
  it("espera una herramienta del menú (que lee el día de la ficha) aunque no nombre el día", () => {
    expect(errores({ entrada: "otra cosa, porfa", llama: ["proponer_platos"] })).toEqual([expect.stringMatching(/le falta "dependeDeFecha"/)]);
    expect(errores({ entrada: "otra cosa, porfa", args: { cambiar_plato: { receta: "x" } } })).toEqual([expect.stringMatching(/le falta "dependeDeFecha"/)]);
    expect(errores({ entrada: "otra cosa, porfa", noLlama: ["generar_menu"] })).toEqual([]);
  });
});

describe("vocabularios", () => {
  it("sin valores repetidos", () => {
    for (const l of [TIPOS_CASO, DOMINIOS_CASO, ORIGENES_CASO, NIVELES, MOTIVOS_FALLO, CAMPOS_FILA]) expect(new Set(l).size).toBe(l.length);
  });
});

describe("precios: la caché de Lola se escribe a 1 h", () => {
  const millon = (k) => ({ [k]: 1e6 });
  it("escribir a 1 h cuesta el doble que la entrada; a 5 min, 1,25×", () => {
    for (const m of ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-5-5"]) {
      const entrada = costeUsd(millon("input_tokens"), m);
      expect(costeUsd(millon("cache_creation_input_tokens"), m)).toBeCloseTo(2 * entrada);
      expect(costeUsd(millon("cache_creation_input_tokens"), m, { ttl: "5m" })).toBeCloseTo(1.25 * entrada);
      expect(costeUsd(millon("cache_read_input_tokens"), m)).toBeCloseTo(entrada / 10);
    }
  });
  it("haiku < sonnet < opus", () => {
    const u = { input_tokens: 1000, output_tokens: 1000 };
    expect(costeUsd(u, "claude-haiku-4-5")).toBeLessThan(costeUsd(u, "claude-sonnet-5"));
    expect(costeUsd(u, "claude-sonnet-5")).toBeLessThan(costeUsd(u, "claude-opus-5-5"));
  });
});

describe("tope de gasto", () => {
  it("el de una pasada nunca pasa de lo que queda del mes", () => {
    expect(topeDePasada(1e6, 0)).toBeLessThanOrEqual(presupuestoMensualUsd());
    expect(topeDePasada(10, presupuestoMensualUsd() - 2)).toBeCloseTo(2);
    expect(topeDePasada(10, presupuestoMensualUsd() + 5)).toBe(0);
    expect(topeDePasada(0, 0)).toBe(0);
  });
  it("con tope 0 no cabe ni un intento; el primero se estima con la caché por escribir", () => {
    expect(cabeOtro(0, 0, estimadoSiguiente(0, 0))).toBe(false);
    expect(estimadoSiguiente(0, 0)).toBeGreaterThan(estimadoSiguiente(0.5, 20));
  });
  it("un --tope mal escrito es un error, no «sin tope»", () => {
    expect(() => opcionNumero(["--tope=abc"], "tope")).toThrow();
    expect(() => opcionNumero(["--tope="], "tope")).toThrow();
    expect(() => opcionNumero(["--tope=-1"], "tope")).toThrow();
    expect(opcionNumero(["--tope=0,5"], "tope")).toBe(0.5);
    expect(opcionNumero([], "tope")).toBe(null);
  });
  it("modelos-evals lanza cada modelo con un tope que le da para la pasada entera (Opus no se corta)", () => {
    for (const [familia, coste] of Object.entries(COSTE_PASADA_COMPLETA_USD)) {
      expect(TOPE_COMPLETO_POR_FAMILIA[familia], familia).toBeGreaterThanOrEqual(coste * 1.15);
      expect(topeDePasada(TOPE_COMPLETO_POR_FAMILIA[familia], 0), familia).toBeGreaterThanOrEqual(coste * 1.15);
    }
    expect(readFileSync(new URL("scripts/modelos-evals.mjs", RAIZ), "utf8")).toMatch(/--tope=\$\{TOPE_COMPLETO_POR_FAMILIA\[familiaDe\(modelo\)\]\}/);
  });
  it("el presupuesto mensual vive en un solo sitio: los scripts lo importan, nadie lo repite", () => {
    expect(PRESUPUESTO_MENSUAL_EUR).toBeGreaterThan(0);
    const ficheros = [];
    const recorrer = (d) => {
      for (const f of readdirSync(d)) {
        const r = join(d, f);
        if (statSync(r).isDirectory()) { if (f !== "node_modules") recorrer(r); } else if (/\.m?js$/.test(f)) ficheros.push(r);
      }
    };
    recorrer(fileURLToPath(new URL("scripts", RAIZ)));
    const quienLaDefine = ficheros.filter((f) => /PRESUPUESTO_MENSUAL_EUR\s*=/.test(readFileSync(f, "utf8")));
    expect(quienLaDefine.map((f) => f.replace(/\\/g, "/").replace(/.*\/scripts\//, "scripts/"))).toEqual(["scripts/lib/evals.mjs"]);
    for (const s of ["scripts/bot-evals.mjs", "scripts/router-evals.mjs"]) expect(readFileSync(new URL(s, RAIZ), "utf8")).toMatch(/topeDePasada\(/);
  });
});

describe("tope mensual de evals: contabilidad del mes (#297)", () => {
  const nuevo = () => join(mkdtempSync(join(tmpdir(), "gasto-")), "gasto.jsonl");
  const ahora = new Date("2026-10-15T10:00:00Z");

  it("el mes es el de Madrid, no el UTC", () => {
    expect(mesDeMadrid(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(mesDeMadrid(new Date("2026-10-15T10:00:00Z"))).toBe("2026-10");
  });

  it("suma lo apuntado este mes y no lo de otros meses", () => {
    const f = nuevo();
    apuntarGasto({ script: "bot-evals", coste_usd: 1.5, fecha: new Date("2026-09-30T10:00:00Z") }, { ruta: f });
    apuntarGasto({ script: "bot-evals", coste_usd: 2, fecha: ahora }, { ruta: f });
    apuntarGasto({ script: "router-evals", coste_usd: 0.25, fecha: ahora }, { ruta: f });
    expect(gastoDelMesUsd({ ruta: f, ahora })).toBeCloseTo(2.25);
  });

  it("sin libro, 0; con una línea ilegible, falla cerrado (el tope queda a 0)", () => {
    expect(gastoDelMesUsd({ ruta: nuevo(), ahora })).toBe(0);
    const f = nuevo();
    writeFileSync(f, "esto no es json\n");
    expect(gastoDelMesUsd({ ruta: f, ahora })).toBe(Infinity);
    expect(topeDePasada(5, Infinity)).toBe(0);
  });

  it("la pasada pide menos de lo que queda del mes", () => {
    const f = nuevo();
    apuntarGasto({ script: "bot-evals", coste_usd: presupuestoMensualUsd() - 1, fecha: ahora }, { ruta: f });
    expect(topeDePasada(5, gastoDelMesUsd({ ruta: f, ahora }))).toBeCloseTo(1);
  });

  it("la línea no lleva nada más que script, mes y coste (sin datos de familias)", () => {
    const f = nuevo();
    apuntarGasto({ script: "bot-evals", coste_usd: 0.1234567, pasada_id: "p1", fecha: ahora }, { ruta: f });
    const l = JSON.parse(readFileSync(f, "utf8").trim());
    expect(Object.keys(l).sort()).toEqual(["coste_usd", "mes", "pasada_id", "script"]);
    expect(l.coste_usd).toBe(0.123457);
  });

  it("un coste que no es un número no se apunta como 0: se rechaza", () => {
    expect(() => apuntarGasto({ script: "x", coste_usd: NaN }, { ruta: nuevo() })).toThrow();
    expect(() => apuntarGasto({ script: "x", coste_usd: -1 }, { ruta: nuevo() })).toThrow();
  });

  it("una línea con coste negativo no quita el tope: falla cerrado", () => {
    const f = nuevo();
    apuntarGasto({ script: "bot-evals", coste_usd: 3, fecha: ahora }, { ruta: f });
    writeFileSync(f, readFileSync(f, "utf8") + JSON.stringify({ script: "x", mes: "2026-10", coste_usd: -50 }) + "\n");
    expect(gastoDelMesUsd({ ruta: f, ahora })).toBe(Infinity);
    expect(topeDePasada(5, -50)).toBeLessThanOrEqual(5);
    expect(topeDePasada(5, -50)).toBeLessThanOrEqual(presupuestoMensualUsd());
  });

  it("el aviso de libro ilegible dice la ruta y la línea", () => {
    const f = nuevo();
    writeFileSync(f, JSON.stringify({ script: "x", mes: "2026-10", coste_usd: 1 }) + "\nbasura\n");
    const avisos = [];
    const antes = console.warn;
    console.warn = (m) => avisos.push(String(m));
    try { gastoDelMesUsd({ ruta: f, ahora }); } finally { console.warn = antes; }
    expect(avisos.join(" ")).toContain(f);
    expect(avisos.join(" ")).toMatch(/línea 2/);
    expect(avisos.join(" ")).toMatch(/Borra o corrige esa línea/);
  });

  it("una línea cortada (sin salto) no se pega a la siguiente", () => {
    const f = nuevo();
    writeFileSync(f, '{"script":"x","mes":"2026-10","coste_usd":1');
    apuntarGasto({ script: "bot-evals", coste_usd: 2, fecha: ahora }, { ruta: f });
    const lineas = readFileSync(f, "utf8").split("\n").filter(Boolean);
    expect(lineas).toHaveLength(2);
    expect(() => JSON.parse(lineas[1])).not.toThrow();
    // La cortada sigue ahí, aislada en su línea: el libro falla cerrado hasta que alguien la corrija.
    expect(gastoDelMesUsd({ ruta: f, ahora })).toBe(Infinity);
  });

  it("dos pasadas que comparten libro no suman más que el presupuesto (se relee antes de cada pago)", () => {
    const f = nuevo();
    apuntarGasto({ script: "previo", coste_usd: presupuestoMensualUsd() - 3.5, fecha: ahora }, { ruta: f });
    const A = { gastado: 0, parada: false };
    const B = { gastado: 0, parada: false };
    // Turnos alternos de 1 $ por intento, con el tope propio de cada una muy holgado.
    for (let i = 0; i < 20; i++) {
      for (const p of [A, B]) {
        if (p.parada) continue;
        const c = puedeGastar(p.gastado, 100, 1, { ruta: f, ahora });
        if (!c.ok) { p.parada = true; expect(c.motivo).toBe("mes"); continue; }
        p.gastado += 1;
        apuntarOAvisar({ script: "sim", coste_usd: 1, fecha: ahora }, { ruta: f });
      }
    }
    expect(gastoDelMesUsd({ ruta: f, ahora })).toBeLessThanOrEqual(presupuestoMensualUsd());
    expect(A.gastado + B.gastado).toBe(3);
  });

  it("su propio tope de pasada también corta, con su motivo", () => {
    expect(puedeGastar(4.9, 5, 0.25, { ruta: nuevo(), ahora })).toEqual({ ok: false, motivo: "pasada" });
    expect(puedeGastar(0, 5, 0.25, { ruta: nuevo(), ahora })).toEqual({ ok: true });
  });

  it("si no se puede apuntar una llamada ya pagada, no tira: avisa y la pasada para", () => {
    const fichero = nuevo();
    writeFileSync(fichero, "");
    const f = join(fichero, "dentro", "gasto.jsonl"); // el padre es un fichero: mkdir falla
    const avisos = [];
    const antes = console.warn;
    console.warn = (m) => avisos.push(String(m));
    let ok;
    try { ok = apuntarOAvisar({ script: "bot-evals", coste_usd: 1, fecha: ahora }, { ruta: f }); } finally { console.warn = antes; }
    expect(ok).toBe(false);
    expect(avisos.join(" ")).toContain(f);
    expect(puedeGastar(0, 5, 0.25, { ruta: f, ahora })).toEqual({ ok: false, motivo: "libro" });
  });

  it("los motivos de parada están en un vocabulario cerrado", () => {
    expect(MOTIVOS_TOPE_EVALS).toEqual(["pasada", "mes", "libro"]);
  });
});

// La clase, no el caso: todo script que llama a Anthropic con la clave de las
// evals pasa por topeDePasada y apunta su gasto, o está aquí con su porqué.
describe("scripts que llaman a un modelo: tope y libro del mes (#297)", () => {
  // Lo que cuenta es el código, no los comentarios que nombran un fichero o una clave.
  const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Cualquier camino a un modelo de pago: el SDK, la API directa, la clave, o los módulos de Lola que llaman.
  const MODELO = /(?:import|from)[^;\n]*["']@anthropic-ai\/sdk["']|import\(\s*["']@anthropic-ai\/sdk["']|api\.anthropic\.com|ANTHROPIC_API_KEY|api\/_bot\/(router|agente|significado|traducir|recetas|avisar)\b/;
  const CON_TOPE = ["bot-evals.mjs", "router-evals.mjs", "skills-prueba.mjs"];
  // Puntuales y manuales (los lanza una persona sobre un lote acotado, casi todos
  // con --dry-run), o de céntimos. No cuentan para el libro del mes: el tope
  // mensual NO los cubre, y esta lista es lo que dice cuáles son.
  const SIN_TOPE_DE_EVALS = {
    "alergenos-puede-contener.mjs": "pasada puntual del catálogo, por lotes",
    "bedca-select.mjs": "pasada puntual, con --dry-run que cotiza",
    "buscador-examen.mjs": "examen manual, ~15 céntimos con Haiku",
    "enrich-recipe-steps.mjs": "horneado puntual del catálogo, con tope de intentos",
    "gen-appliance-methods.mjs": "generación puntual del catálogo",
    "lola-feedback.mjs": "bucle semanal, un puñado de llamadas",
    "recetas-atributos-blandos.mjs": "pasada puntual del catálogo",
    "router-cache.mjs": "dos llamadas a Haiku",
    "router-ejemplos-examen.mjs": "examen manual con Haiku: 2 x 131 = 262 llamadas, de 0,5 a 2,6 $ por ejecución",
    "router-feedback.mjs": "bucle semanal, un puñado de llamadas",
    "vectores-contra-haiku.mjs": "examen manual, ~15 céntimos con Haiku",
  };
  const dir = fileURLToPath(new URL("scripts/", RAIZ));
  const codigo = (f) => sinComentarios(readFileSync(join(dir, f), "utf8"));
  const todos = readdirSync(dir).filter((f) => /\.mjs$/.test(f) && !/\.test\./.test(f));
  const conIA = todos.filter((f) => MODELO.test(codigo(f)));

  it("el detector no se deja engañar por un comentario ni se le escapa un import de Lola", () => {
    expect(MODELO.test(sinComentarios("// usa ANTHROPIC_API_KEY\n/* api/_bot/router.js */"))).toBe(false);
    expect(MODELO.test(sinComentarios('await import("../api/_bot/router.js")'))).toBe(true);
    expect(MODELO.test(sinComentarios("process.env.ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("cada script con modelo de pago pasa por el libro del mes o está en las excepciones", () => {
    for (const f of new Set([...conIA.filter((x) => !SIN_TOPE_DE_EVALS[x]), ...CON_TOPE])) {
      const src = codigo(f);
      expect(CON_TOPE, `${f} llama a un modelo sin topeDePasada ni excepción`).toContain(f);
      expect(src, `${f}: sin topeDePasada`).toMatch(/topeDePasada\(/);
      expect(src, `${f}: no relee el libro antes de cada pago`).toMatch(/puedeGastar\(/);
      expect(src, `${f}: no apunta su gasto en el libro del mes`).toMatch(/apuntarOAvisar\(/);
    }
  });

  it("cada excepción existe y de verdad llama a un modelo", () => {
    for (const f of Object.keys(SIN_TOPE_DE_EVALS)) expect(conIA, f).toContain(f);
    for (const f of CON_TOPE) expect(todos, f).toContain(f);
  });
});

describe("niveles y pass^k", () => {
  const alergia = { id: "a", tipo: "seguridad", dominio: "alergias_salud" };
  const papel = { id: "p", tipo: "seguridad", dominio: "papeles" };
  const menu = { id: "m", tipo: "herramienta", dominio: "menu", nucleo: true };

  it("qué casos entra en cada nivel", () => {
    expect(casosDelNivel([alergia, papel, menu], "pr")).toEqual([menu]);
    expect(casosDelNivel([alergia, papel, menu], "seguridad")).toEqual([alergia, papel]);
    expect(casosDelNivel([alergia, papel, menu], "completo")).toHaveLength(3);
    expect(() => casosDelNivel([], "otro")).toThrow();
  });
  it("en seguridad, alergias y salud van con más repeticiones; --k manda", () => {
    expect(kDe(alergia, "seguridad")).toBe(K_ALERGIAS);
    expect(kDe(alergia, "seguridad")).toBeGreaterThan(kDe(papel, "seguridad"));
    expect(kDe(alergia, "pr")).toBe(K_POR_NIVEL.pr);
    expect(kDe(menu, "completo", 4)).toBe(4);
  });
  it("estado: aprobado, inestable, fallido, incompleto, sin correr", () => {
    expect(estadoDe([true, true, true], 3)).toBe("aprobado");
    expect(estadoDe([true, false, true], 3)).toBe("inestable");
    expect(estadoDe([false, false], 1)).toBe("fallido");
    expect(estadoDe([true], 3)).toBe("incompleto");
    expect(estadoDe([], 1)).toBe("sin_correr");
  });
  it("un fallo reintentado que luego pasa queda inestable", () => {
    const r = [false];
    expect(otroIntento(r, { k: 1, reintentos: 1 })).toBe(true);
    r.push(true);
    expect(otroIntento(r, { k: 1, reintentos: 1 })).toBe(false);
    expect(estadoDe(r, 1)).toBe("inestable");
    expect(otroIntento([false, false], { k: 1, reintentos: 1 })).toBe(false);
  });
  it("estricto: el primer fallo para (ya bloquea) y bloquea aunque sea inestable", () => {
    expect(otroIntento([true, true, false], { k: 5, estricto: true })).toBe(false);
    expect(otroIntento([true, true], { k: 5, estricto: true })).toBe(true);
    expect(otroIntento([false], { k: 1, reintentos: 1, estricto: true })).toBe(false);
    expect(bloquea("inestable", true)).toBe(true);
    expect(bloquea("inestable", false)).toBe(false);
    expect(bloquea("fallido", false)).toBe(true);
  });
  it("con lo guardado ya completo no hace falta otro intento", () => {
    expect(otroIntento([true], { k: 1, reintentos: 1 })).toBe(false);
    expect(otroIntento([true], { k: 3 })).toBe(true);
  });
});

describe("hashes y memoria", () => {
  const caso = { id: "x", nombre: "uno", tipo: "texto", dominio: "faq", origen: "escrito", entrada: "hola", texto: "a" };
  it("canonico no depende del orden de las claves", () => expect(canonico({ a: 1, b: [2, { d: 1, c: 2 }] })).toBe(canonico({ b: [2, { c: 2, d: 1 }], a: 1 })));
  it("caso_hash: cambia con lo que se mide, no con la etiqueta", () => {
    expect(casoHash({ ...caso, nombre: "otro", tipo: "formato", nucleo: true })).toBe(casoHash(caso));
    expect(casoHash({ ...caso, entrada: "adiós" })).not.toBe(casoHash(caso));
    expect(casoHash({ ...caso, texto: "b" })).not.toBe(casoHash(caso));
  });
  it("casos_version cambia si cambia un caso, no si cambia el orden", () => {
    const otro = { ...caso, id: "y", entrada: "otra" };
    expect(casosVersion([caso, otro])).toBe(casosVersion([otro, caso]));
    expect(casosVersion([caso, { ...otro, entrada: "más" }])).not.toBe(casosVersion([caso, otro]));
  });
  it("la memoria agrupa por caso, prompt, código, modelo y esfuerzo", () => {
    const base = { caso_hash: "c", prompt_hash: "p", codigo_hash: "k", modelo: "m", esfuerzo: "e" };
    const m = memoria([{ ...base, aprobado: false }, { ...base, aprobado: true }, { ...base, prompt_hash: "p2", aprobado: true }, { ...base }]);
    expect(m.get(claveMemo(base))).toEqual([false, true]);
    expect(m.get(claveMemo({ ...base, prompt_hash: "p2" }))).toEqual([true]);
  });
});

describe("memoria y fecha: un caso que depende del día no se reutiliza otro día", () => {
  const conFecha = { id: "f", entrada: "¿qué cenamos hoy?", dependeDeFecha: true };
  const sinFecha = { id: "s", entrada: "¿cuánto cuesta?" };
  const version = { prompt_hash: "p", codigo_hash: "k", modelo: "m", esfuerzo: "e" };
  const guardado = (caso, hoy) => memoria([{ ...baseMemo(caso, { ...version, hoy }), aprobado: true }]);
  const previos = (m, caso, hoy) => m.get(claveMemo(baseMemo(caso, { ...version, hoy }))) ?? [];

  it("los del núcleo que dependen de la fecha la llevan", () => {
    for (const id of ["consulta-que-cenamos-de-la-ficha", "recordatorio-pedido", "ver-un-dia-entero", "habla-ausencias-en-lote"]) {
      expect(casos.find((c) => c.id === id)?.dependeDeFecha, id).toBe(true);
    }
  });
  it("dos pasadas en días distintos pagan dos veces", () => {
    const m = guardado(conFecha, "2026-10-08");
    expect(otroIntento(previos(m, conFecha, "2026-10-08"), { k: 1 })).toBe(false);
    expect(otroIntento(previos(m, conFecha, "2026-10-09"), { k: 1 })).toBe(true);
  });
  it("uno que no depende de la fecha se reutiliza otro día", () => {
    const m = guardado(sinFecha, "2026-10-08");
    expect(otroIntento(previos(m, sinFecha, "2026-10-09"), { k: 1 })).toBe(false);
  });
});

describe("codigo_hash sigue los imports", () => {
  const dir = mkdtempSync(join(tmpdir(), "evals-grafo-"));
  const escribir = (ruta, texto) => { mkdirSync(join(dir, ruta, ".."), { recursive: true }); writeFileSync(join(dir, ruta), texto); };
  const lineas = (...l) => l.join("\n");
  escribir("api/a.js", lineas('import { b } from "./b.js";', 'const t = await import("../lib/d.js");', "export const x = 1;"));
  escribir("api/b.js", lineas('export { c } from "../lib/c.js";', 'import fs from "node:fs";', 'const md = fs.readFileSync(new URL("./saber.md", import.meta.url));'));
  escribir("api/saber.md", "uno");
  escribir("lib/c.js", "export const c = 1;");
  escribir("lib/d.js", lineas('import "./e";', "export default 1;"));
  escribir("lib/e.js", "export {};");
  escribir("lib/suelto.js", "export const nadie = 1;");

  it("llega a lo importado (estático, export from, dinámico, new URL, sin extensión) y a nada más", () => {
    expect(grafoDeImports(dir, ["api/a.js"])).toEqual(["api/a.js", "api/b.js", "api/saber.md", "lib/c.js", "lib/d.js", "lib/e.js"]);
  });
  it("cambiar un fichero importado cambia el hash; uno suelto, no", () => {
    const antes = codigoHash(dir, grafoDeImports(dir, ["api/a.js"]));
    escribir("lib/suelto.js", "export const nadie = 2;");
    expect(codigoHash(dir, grafoDeImports(dir, ["api/a.js"]))).toBe(antes);
    escribir("lib/e.js", "export const cambio = 1;");
    expect(codigoHash(dir, grafoDeImports(dir, ["api/a.js"]))).not.toBe(antes);
  });
  it("el de bot-evals llega a src/ y al corrector, y no a scripts/lib/evals.mjs (un precio no invalida la memoria)", () => {
    const f = ficherosDelCodigo(fileURLToPath(RAIZ));
    for (const x of ["api/_bot/agente.js", "api/_bot/supervisor.js", "api/_bot/conocimiento.md", "src/lib/papeles.js", "src/lib/allergensCore.js", "src/lib/vetos.js", "scripts/bot-evals.mjs"]) expect(f).toContain(x);
    expect(f).not.toContain("api/_bot/core.mjs");
    expect(f).not.toContain("scripts/lib/evals.mjs");
  });
});

describe("referencia: lo que pasaba y ahora no, es regresión", () => {
  it("aprobado → inestable o fallido es regresión; al revés, mejora", () => {
    const { regresiones, mejoras } = compararEstados(
      { a: "aprobado", b: "aprobado", c: "fallido", d: "inestable" },
      { a: "inestable", b: "fallido", c: "aprobado", d: "inestable", nuevo: "fallido" },
    );
    expect(regresiones.map((r) => r.caso_id)).toEqual(["a", "b"]);
    expect(mejoras.map((r) => r.caso_id)).toEqual(["c"]);
  });
  it("dice cuántos casos no cubre la referencia", () => {
    const { faltan } = compararEstados({ a: "aprobado", b: "sin_correr" }, { a: "aprobado", b: "aprobado", c: "fallido" });
    expect(faltan).toEqual(["b", "c"]);
  });
  it("solo vale una referencia del mismo nivel y que no paró el tope", () => {
    const actual = { modelo: "m", esfuerzo: "e", prompt_hash: "p2", codigo_hash: "k", nivel: "pr" };
    const otra = { modelo: "m", esfuerzo: "e", prompt_hash: "p1", codigo_hash: "k" };
    const pasadas = [
      { ...otra, pasada_id: "buena", nivel: "pr", parado_por_tope: false },
      { ...otra, pasada_id: "otro-nivel", nivel: "completo", parado_por_tope: false },
      { ...otra, pasada_id: "cortada", nivel: "pr", parado_por_tope: true },
    ];
    expect(elegirReferencia(pasadas, { actual }).pasada_id).toBe("buena");
    expect(elegirReferencia(pasadas.slice(1), { actual })).toBe(null);
  });
  it("sin pedirla, la última del mismo modelo con otra versión; si no hay, null", () => {
    const actual = { modelo: "m", esfuerzo: "e", prompt_hash: "p2", codigo_hash: "k" };
    const pasadas = [
      { pasada_id: "1", modelo: "m", esfuerzo: "e", prompt_hash: "p1", codigo_hash: "k" },
      { pasada_id: "2", modelo: "m", esfuerzo: "e", prompt_hash: "p2", codigo_hash: "k" },
      { pasada_id: "3", modelo: "otro", esfuerzo: "e", prompt_hash: "p0", codigo_hash: "k" },
    ];
    expect(elegirReferencia(pasadas, { actual }).pasada_id).toBe("1");
    expect(elegirReferencia(pasadas.slice(1), { actual })).toBe(null);
    expect(elegirReferencia(pasadas, { actual, pedida: "2" }).pasada_id).toBe("2");
    expect(() => elegirReferencia(pasadas, { actual, pedida: "9" })).toThrow();
  });
});
