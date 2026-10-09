import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALCANCES, BARRERAS, CAMPOS_FICHA, CAPAS_AGENTE, ESTADOS, FICHA_DESDE, MARCA, MARCA_HIJO,
  SEVERIDADES, TIPOS_CAUSA, aprendizajeValido, arregloDeBarrera, comentario, esComentarioNuestro, falla, fijarCampos, informeFichas,
  leerFicha, leerSubidos, limpio, subirAlcance, validarFicha, validarHijo,
} from "./lib/fondos.mjs";
import { ALCANCES_FALLO } from "./lib/flujo.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { GRUPOS } from "./lib/issues.mjs";
import { RIESGOS } from "./lib/normas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

// ── Datos de prueba ───────────────────────────────────────────────────────────

const bloque = (lineas) => `Texto del fondo.\n\n\`\`\`fondo\n${lineas.join("\n")}\n\`\`\`\n`;
/** Una ficha completa y buena, en estado «diagnosticado». */
const BUENA = {
  estado: "diagnosticado", tipo_causa: "vigilante-hueco", alcance: "modulo", severidad: "medio", capa_agente: "gobierno",
  mecanismo: "El control solo corre si alguien lanza el script", causa_escape: "Ningún workflow reacciona a un issue",
};
const fichaDe = (extra = {}, quitar = []) => {
  const d = { ...BUENA, ...extra };
  for (const q of quitar) delete d[q];
  return bloque(Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((n) => `#${n}`).join(", ") : v}`));
};
const FONDO = ["tipo:fondo", "causa:vigilante-hueco", "area:ops"];
const fondo = (extra = {}) => ({
  number: 50, title: "[fondo] x", state: "OPEN", stateReason: null, createdAt: "2026-10-12T10:00:00Z", closedAt: null,
  body: `${fichaDe()}\n### Arreglo general\n\nUna pieza.`, labels: FONDO.map((name) => ({ name })), hijos: [], ...extra,
});
const hijo = (number, labels, state = "OPEN", createdAt = "2026-10-12T10:00:00Z") => ({
  number, state, createdAt, labels: labels.map((name) => ({ name })),
  tipo: labels.find((l) => l.startsWith("tipo:"))?.slice(5) ?? null,
});
const CTX = { hoy: "2026-10-20", existeEnStaging: () => true };
const reglas = (r, gravedad) => r.hallazgos.filter((h) => !gravedad || h.gravedad === gravedad).map((h) => h.regla);

// ── Vocabularios: una sola fuente ─────────────────────────────────────────────

describe("vocabularios cerrados de la ficha", () => {
  it("se importan de su fuente, no se copian", () => {
    expect(TIPOS_CAUSA).toEqual(Object.keys(GRUPOS.causa.valores));
    expect(ALCANCES).toEqual(Object.keys(ALCANCES_FALLO));
    expect(SEVERIDADES).toEqual(Object.keys(RIESGOS));
    expect(BARRERAS).toEqual(JSON.parse(leer("ops/flujo.json")).escalera.map((e) => e.id));
    expect(Object.keys(ESTADOS)).toEqual(["abierto", "diagnosticado", "plan", "en-curso", "en-observacion", "cerrado-eficaz", "reabierto"]);
  });

  it("capa_agente son los agentes de .claude/agents/ más «sesión»: si nace un agente, falla hasta añadirlo", () => {
    const agentes = readdirSync(join(RAIZ, ".claude", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
    expect([...CAPAS_AGENTE].sort()).toEqual([...agentes, "sesión"].sort());
  });

  it("cada barrera tiene su etiqueta arreglo: de GRUPOS", () => {
    for (const b of BARRERAS) expect(Object.keys(GRUPOS.arreglo.valores), b).toContain(arregloDeBarrera(b));
    expect(arregloDeBarrera("inventada")).toBeNull();
  });

  it("el alcance sube un nivel y se queda en el tope", () => {
    expect(subirAlcance("local")).toBe("modulo");
    expect(subirAlcance("modulo")).toBe("transversal");
    expect(subirAlcance("transversal")).toBe("transversal");
    expect(subirAlcance("raro")).toBe("raro");
  });

  it("el formulario del fondo trae todas las claves de la ficha y los valores de cada vocabulario", () => {
    const yml = leer(".github", "ISSUE_TEMPLATE", "2-fondo.yml");
    const valor = /id: ficha[\s\S]*?value: \|\n((?: {8}.*\n?)+)/.exec(yml)[1].replace(/^ {8}/gm, "");
    const l = leerFicha(valor);
    expect(l.presente).toBe(true);
    expect(l.errores).toEqual([]);
    const claves = valor.split("\n").filter((x) => /^[a-z_]+:/.test(x)).map((x) => x.split(":")[0]);
    expect([...claves].sort()).toEqual(Object.keys(CAMPOS_FICHA).sort());
    for (const [clave, def] of Object.entries(CAMPOS_FICHA).filter(([, d]) => d.tipo === "vocab")) {
      const linea = new RegExp(`^ {8}${clave}: (.*)$`, "m").exec(yml)?.[1];
      expect(linea, `la descripción del formulario no explica «${clave}»`).toBeDefined();
      expect(linea.split(", "), clave).toEqual(def.valores);
    }
  });
});

// ── Leer la ficha, con cuerpos hostiles ───────────────────────────────────────

describe("leerFicha", () => {
  it("lee una ficha buena: vocabulario, listas, fecha, ruta y texto", () => {
    const l = leerFicha(fichaDe({ casos: [10, 12], encargos: [51], verificacion: "scripts/fondos.test.js", ventana_hasta: "2026-11-01", barrera: "test_ci", aprendizaje: "Skill issues: sección de la ficha" }));
    expect(l.errores).toEqual([]);
    expect(l.ficha).toMatchObject({ estado: "diagnosticado", casos: [10, 12], encargos: [51], verificacion: "scripts/fondos.test.js", ventana_hasta: "2026-11-01", barrera: "test_ci" });
  });

  it("sin bloque no es un error de forma: simplemente no hay ficha", () => {
    for (const cuerpo of ["", null, undefined, "### Arreglo general\n\nx", "```js\nestado: plan\n```"]) {
      expect(leerFicha(cuerpo)).toEqual({ presente: false, ficha: {}, errores: [] });
    }
  });

  it("los valores vacíos son «sin rellenar», no errores (la plantilla trae todas las claves)", () => {
    const l = leerFicha(bloque(["estado: abierto", "tipo_causa:", "casos:", "matiz:   "]));
    expect(l.errores).toEqual([]);
    expect(l.ficha).toEqual({ estado: "abierto" });
  });

  it("acepta CRLF, sangría de hasta 3 espacios en las vallas y «ninguno» en una lista", () => {
    const l = leerFicha("x\r\n  ```fondo\r\nestado: plan\r\ncasos: ninguno\r\n  ```\r\n");
    expect(l.errores).toEqual([]);
    expect(l.ficha).toEqual({ estado: "plan", casos: [] });
  });

  // Cuerpos hostiles: repo público, el cuerpo lo escribe cualquiera.
  it.each([
    ["un bloque gigante", () => bloque(Array.from({ length: 5000 }, (_, i) => `matiz: ${"x".repeat(100)}${i}`)), /demasiado grande/],
    ["más líneas que el tope (31)", () => bloque(Array.from({ length: 31 }, () => "estado: plan")), /demasiado grande/],
    ["más caracteres que el tope (30 líneas de 150 = 4.800)", () => bloque(Array.from({ length: 30 }, () => `mecanismo: ${"a".repeat(150)}`)), /demasiado grande/],
    ["una línea de megas", () => bloque([`matiz: ${"a".repeat(2_000_000)}`]), /demasiado grande/],
    ["una línea larga dentro del tope de líneas", () => bloque(["estado: plan", `mecanismo: ${"a".repeat(700)}`]), /pasa de 600/],
    ["un texto de 401 caracteres", () => bloque([`mecanismo: ${"a".repeat(401)}`]), /pasa de 400/],
    ["una clave repetida", () => bloque(["estado: plan", "estado: abierto"]), /«estado» está repetida/],
    ["una clave repetida cuya primera vez estaba vacía", () => bloque(["matiz:", "matiz: algo"]), /«matiz» está repetida/],
    ["una clave que no existe", () => bloque(["admin: si"]), /clave «admin» no existe/],
    ["una línea sin dos puntos", () => bloque(["esto no es una ficha"]), /clave: valor/],
    ["una clave con mayúsculas o símbolos", () => bloque(["Estado: plan", "__proto__x: 1"]), /clave: valor/],
    ["el bloque sin cerrar", () => "```fondo\nestado: plan\n", /no está cerrado/],
    ["dos bloques", () => `${bloque(["estado: plan"])}\n${bloque(["estado: abierto"])}`, /más de un bloque/],
    ["caracteres de control", () => bloque(["mecanismo: a\u0007b"]), /control/],
    ["un #n enorme en una lista", () => bloque(["casos: #99999999999"]), /números de issue/],
    ["un #0", () => bloque(["casos: #0"]), /números de issue/],
    ["un #n de 8 cifras que pasa del tope de issues", () => bloque(["casos: #99999999"]), /números de issue/],
    ["una lista con basura", () => bloque(["casos: #1, <script>alert(1)</script>"]), /números de issue/],
    ["más elementos de los permitidos (31)", () => bloque([`casos: ${Array.from({ length: 31 }, (_, i) => `#${i + 1}`).join(", ")}`]), /más de 30/],
    ["un valor de vocabulario inventado", () => bloque(["estado: hackeado"]), /no es de la lista/],
    ["Markdown y HTML en un vocabulario", () => bloque(["alcance: <img src=x onerror=alert(1)> [x](http://evil.example)"]), /no es de la lista/],
    ["una fecha imposible", () => bloque(["ventana_hasta: 2026-02-30"]), /fecha AAAA-MM-DD real/],
    ["una fecha con hora", () => bloque(["ventana_hasta: 2026-11-01T00:00:00Z"]), /fecha/],
    ["una ruta con ..", () => bloque(["verificacion: ../../etc/passwd"]), /ruta del repo/],
    ["una ruta absoluta", () => bloque(["verificacion: /etc/passwd"]), /ruta del repo/],
    ["una ruta con espacios y símbolos de shell", () => bloque(["verificacion: a.test.js; rm -rf /"]), /ruta del repo/],
    ["una URL como ruta", () => bloque(["verificacion: https://evil.example/x.js"]), /ruta del repo/],
  ])("%s: error de forma, sin lanzar y sin ficha a medias", (_, hacer, esperado) => {
    const t0 = Date.now();
    const l = leerFicha(hacer());
    expect(Date.now() - t0).toBeLessThan(500);
    expect(l.errores.length).toBeGreaterThan(0);
    expect(l.errores.map((e) => e.mensaje).join(" | ")).toMatch(esperado);
    // Nunca se copia lo que escribió el autor tal cual al mensaje.
    expect(l.errores.map((e) => e.mensaje).join(" ")).not.toMatch(/[<>]|https?:\/\/|\]\(|evil\.example/);
  });

  it("un cuerpo de un megabyte sin bloque se lee rápido y sin lanzar", () => {
    const t0 = Date.now();
    expect(leerFicha("a\n".repeat(600_000).concat("```fondo\nestado: plan\n```")).presente).toBe(false); // más allá del tope, no se mira
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("un texto con Markdown y HTML es solo texto: se guarda, no se ejecuta ni se muestra", () => {
    const l = leerFicha(bloque(["mecanismo: <b>hola</b> [x](http://evil.example) `código` @pablo"]));
    expect(l.errores).toEqual([]);
    expect(l.ficha.mecanismo).toContain("<b>");
  });
});

describe("fijarCampos", () => {
  it("cambia una línea, añade una que falta y deja el resto del cuerpo intacto", () => {
    const antes = fichaDe();
    const despues = fijarCampos(antes, { estado: "reabierto", barrera: "test_ci" });
    const l = leerFicha(despues);
    expect(l.errores).toEqual([]);
    expect(l.ficha).toMatchObject({ estado: "reabierto", barrera: "test_ci", mecanismo: BUENA.mecanismo });
    expect(despues.startsWith("Texto del fondo.")).toBe(true);
  });
  it("sin bloque (o sin cerrar) no escribe nada", () => {
    expect(fijarCampos("nada", { estado: "plan" })).toBeNull();
    expect(fijarCampos("```fondo\nestado: plan\n", { estado: "reabierto" })).toBeNull();
  });
  it("no deja colar claves ajenas ni saltos de línea", () => {
    expect(() => fijarCampos(fichaDe(), { admin: "si" })).toThrow();
    expect(() => fijarCampos(fichaDe(), { estado: "plan\nmatiz: x" })).toThrow();
  });
});

describe("aprendizaje", () => {
  it.each([
    ["Skill issues: sección «La ficha del fondo»", true],
    ["Test scripts/fondos.test.js", true],
    ["ninguno — fue un fallo del entorno que no puede repetirse nunca", true],
    ["ninguno", false],
    ["Ninguno - porque sí", false],
    ["ninguno — x", false],
    ["", false],
    ["x", false],
    [undefined, false],
  ])("«%s» → %s", (texto, vale) => expect(aprendizajeValido(texto)).toBe(vale));
});

// ── Los controles ─────────────────────────────────────────────────────────────

describe("validarFicha: una ficha buena no dispara nada", () => {
  it("diagnosticado, completo y sin encargos", () => {
    const r = validarFicha(fondo(), CTX);
    expect(reglas(r, "error")).toEqual([]);
    expect(r.acciones).toEqual([]);
    expect(falla(r)).toBe(false);
  });
});

describe("validarFicha: bloque ausente y válido", () => {
  it("sin ficha: error si el fondo es nuevo, aviso si es anterior a la ficha", () => {
    const nuevo = validarFicha(fondo({ body: "### Arreglo general\n\nx" }), CTX);
    expect(reglas(nuevo, "error")).toEqual(["ficha-ausente"]);
    const viejo = validarFicha(fondo({ body: "### Arreglo general\n\nx", createdAt: "2026-10-01T00:00:00Z" }), CTX);
    expect(reglas(viejo, "error")).toEqual([]);
    expect(reglas(viejo, "aviso")).toContain("ficha-ausente");
    expect(FICHA_DESDE).toBe("2026-10-10");
  });
  it("un error de forma o de vocabulario es un error de la ficha", () => {
    expect(reglas(validarFicha(fondo({ body: fichaDe({ estado: "hackeado" }) }), CTX), "error")).toEqual(["ficha-vocabulario"]);
    expect(reglas(validarFicha(fondo({ body: fichaDe({ admin: "x" }) }), CTX), "error")).toEqual(["ficha-bloque"]);
  });
  it("faltan las claves mínimas", () => {
    const r = validarFicha(fondo({ body: fichaDe({}, ["tipo_causa", "alcance"]) }), CTX);
    expect(r.hallazgos.filter((h) => h.regla === "ficha-incompleta").map((h) => h.mensaje).join(" ")).toMatch(/tipo_causa[\s\S]*alcance/);
  });
  it("la ficha no contradice a la etiqueta de causa (una sola verdad)", () => {
    expect(reglas(validarFicha(fondo({ body: fichaDe({ tipo_causa: "entorno" }) }), CTX), "error")).toEqual(["causa-distinta"]);
  });
  it("la clasificación de siempre (faltas) sigue ahí: sin arreglo general", () => {
    const r = validarFicha(fondo({ body: fichaDe() }), CTX);
    expect(r.hallazgos.find((h) => h.regla === "clasificacion").mensaje).toMatch(/arreglo general/);
  });
});

describe("validarFicha: sin diagnóstico no hay encargos", () => {
  const sinDiag = (extra = {}) => fondo({ body: `${fichaDe(extra, ["mecanismo", "causa_escape"])}\n### Arreglo general` });
  it("un encargo colgado sin mecanismo ni causa de escape", () => {
    const r = validarFicha({ ...sinDiag({ estado: "abierto" }), hijos: [hijo(51, ["tipo:encargo"])] }, CTX);
    expect(reglas(r, "error")).toEqual(["sin-diagnostico"]);
    expect(r.hallazgos.find((h) => h.regla === "sin-diagnostico").mensaje).toMatch(/«mecanismo» y «causa_escape»/);
  });
  it("encargos listados en la ficha, aunque aún no cuelguen", () => {
    expect(reglas(validarFicha(sinDiag({ estado: "abierto", encargos: [51] }), CTX), "error")).toEqual(["sin-diagnostico"]);
  });
  it("un estado que presupone diagnóstico, sin diagnóstico", () => {
    for (const estado of ["diagnosticado", "plan", "en-curso"]) expect(reglas(validarFicha(sinDiag({ estado }), CTX), "error"), estado).toEqual(["sin-diagnostico"]);
  });
  it("falta solo una de las dos", () => {
    const r = validarFicha(fondo({ body: `${fichaDe({ estado: "plan" }, ["causa_escape"])}\n### Arreglo general` }), CTX);
    expect(r.hallazgos.find((h) => h.regla === "sin-diagnostico").mensaje).toMatch(/«causa_escape»/);
    expect(r.hallazgos.find((h) => h.regla === "sin-diagnostico").mensaje).not.toMatch(/«mecanismo»/);
  });
  it("abierto o reabierto, sin encargos, no lo exige todavía", () => {
    expect(reglas(validarFicha(sinDiag({ estado: "abierto" }), CTX), "error")).toEqual([]);
    expect(reglas(validarFicha(sinDiag({ estado: "reabierto" }), CTX), "error")).toEqual([]);
  });
  it("más de tres encargos avisa", () => {
    const hijos = [51, 52, 53, 54].map((n) => hijo(n, ["tipo:encargo"]));
    expect(reglas(validarFicha(fondo({ hijos }), CTX), "aviso")).toContain("plan-grande");
  });
});

describe("validarFicha: pasar a en-observacion", () => {
  const obs = (extra = {}, quitar = []) => fondo({ body: `${fichaDe({ estado: "en-observacion", barrera: "test_ci", verificacion: "scripts/fondos.test.js", ventana_hasta: "2026-11-10", casos: [], ...extra }, quitar)}\n### Arreglo general` });
  it("completa y con la verificación en staging, bien", () => {
    expect(reglas(validarFicha(obs(), CTX), "error")).toEqual([]);
  });
  it("sin verificacion", () => {
    expect(reglas(validarFicha(obs({}, ["verificacion"]), CTX), "error")).toEqual(["observacion-sin-verificacion"]);
  });
  it("con una verificacion que NO está en origin/staging", () => {
    const r = validarFicha(obs(), { ...CTX, existeEnStaging: () => false });
    expect(reglas(r, "error")).toEqual(["verificacion-no-existe"]);
    expect(r.hallazgos[0].mensaje).toMatch(/origin\/staging/);
  });
  it("pregunta por la ruta de la ficha, tal cual", () => {
    const pedidas = [];
    validarFicha(obs(), { ...CTX, existeEnStaging: (r) => (pedidas.push(r), true) });
    expect(pedidas).toEqual(["scripts/fondos.test.js"]);
  });
  it("sin barrera, sin ventana o con una ventana eterna", () => {
    expect(reglas(validarFicha(obs({}, ["barrera"]), CTX), "error")).toEqual(["ficha-incompleta"]);
    expect(reglas(validarFicha(obs({}, ["ventana_hasta"]), CTX), "error")).toEqual(["observacion-sin-ventana"]);
    expect(reglas(validarFicha(obs({ ventana_hasta: "2099-01-01" }), CTX), "error")).toEqual(["ventana-excesiva"]);
  });
});

describe("validarFicha: sin aprendizaje no se cierra", () => {
  const cerrado = (extra = {}, issue = {}) => fondo({ state: "CLOSED", closedAt: "2026-10-15T00:00:00Z", stateReason: "COMPLETED", body: `${fichaDe({ estado: "cerrado-eficaz", barrera: "test_ci", verificacion: "scripts/fondos.test.js", ...extra })}\n### Arreglo general`, ...issue });
  it("cerrado sin aprendizaje: error y se reabre", () => {
    const r = validarFicha(cerrado(), CTX);
    expect(reglas(r, "error")).toEqual(["cierre-sin-aprendizaje"]);
    expect(r.acciones).toContainEqual({ tipo: "reabrir", porque: "cierre-sin-aprendizaje" });
  });
  it("con aprendizaje, o «ninguno» con su motivo, se queda cerrado", () => {
    for (const aprendizaje of ["Test scripts/fondos.test.js y la skill issues", "ninguno — fue un fallo de la red de GitHub que no puede repetirse"]) {
      const r = validarFicha(cerrado({ aprendizaje }), CTX);
      expect(reglas(r, "error"), aprendizaje).not.toContain("cierre-sin-aprendizaje");
      expect(r.acciones.filter((a) => a.tipo === "reabrir")).toEqual([]);
    }
  });
  it("«ninguno» sin motivo no vale", () => {
    expect(reglas(validarFicha(cerrado({ aprendizaje: "ninguno" }), CTX), "error")).toContain("cierre-sin-aprendizaje");
  });
  it("cerrado como «no planeado» o duplicado no lleva aprendizaje", () => {
    expect(reglas(validarFicha(cerrado({}, { stateReason: "NOT_PLANNED", body: `${fichaDe({ estado: "abierto" })}\n### Arreglo general` }), CTX), "error")).not.toContain("cierre-sin-aprendizaje");
  });
  it("estado cerrado-eficaz con el issue abierto, y cierre sin pasar por observación, avisan", () => {
    expect(reglas(validarFicha(fondo({ body: `${fichaDe({ estado: "cerrado-eficaz", barrera: "test_ci", verificacion: "scripts/fondos.test.js", aprendizaje: "Test nuevo en fondos.test.js" })}\n### Arreglo general` }), CTX), "aviso")).toContain("estado-incoherente");
    expect(reglas(validarFicha(cerrado({ estado: "plan", aprendizaje: "Test nuevo en fondos.test.js" }), CTX), "aviso")).toContain("cierre-anticipado");
  });
});

describe("validarFicha: un caso que no aguantó", () => {
  const con = (hijos, extra = {}, ctx = {}) => validarFicha(fondo({ hijos, body: `${fichaDe({ alcance: "local", ...extra })}\n### Arreglo general` }), { ...CTX, ...ctx });
  const campos = (r) => Object.assign({}, ...r.acciones.filter((a) => a.tipo === "fijar").map((a) => a.campos));

  it("sube un nivel de alcance y pasa a reabierto", () => {
    const r = con([hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"])]);
    expect(campos(r)).toEqual({ alcance: "modulo", estado: "reabierto" });
    expect([...r.subidos]).toEqual([60]);
  });
  it("«roto» también", () => {
    expect(campos(con([hijo(60, ["tipo:caso", "analisis:no-aguanto-roto"])])).alcance).toBe("modulo");
  });
  it("un caso ya contado (la marca del comentario) no vuelve a subirlo", () => {
    const r = con([hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"])], {}, { subidos: new Set([60]) });
    expect(campos(r)).toEqual({});
  });
  it("dos casos nuevos suben dos niveles, y el tope es transversal", () => {
    const dos = [hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"]), hijo(61, ["tipo:caso", "analisis:no-aguanto-roto"])];
    expect(campos(con(dos)).alcance).toBe("transversal");
    expect(campos(con(dos, { alcance: "transversal" })).alcance).toBe("transversal");
  });
  it("un caso que NO es «no aguantó» no sube nada", () => {
    expect(campos(con([hijo(60, ["tipo:caso", "analisis:abierto"])]))).toEqual({});
  });
  it("un fondo cerrado se reabre con un caso posterior al cierre (debeReabrir de issues.mjs), no con uno anterior", () => {
    const cerrado = (hijos) => validarFicha(fondo({ state: "CLOSED", closedAt: "2026-10-15T12:00:00Z", stateReason: "COMPLETED", hijos, body: `${fichaDe({ estado: "cerrado-eficaz", barrera: "test_ci", verificacion: "scripts/fondos.test.js", aprendizaje: "Test nuevo en fondos.test.js" })}\n### Arreglo general` }), CTX);
    expect(cerrado([hijo(60, ["tipo:caso", "analisis:abierto"], "OPEN", "2026-10-16T00:00:00Z")]).acciones.map((a) => a.tipo)).toContain("reabrir");
    expect(cerrado([hijo(60, ["tipo:caso", "analisis:abierto"], "OPEN", "2026-10-14T00:00:00Z")]).acciones.map((a) => a.tipo)).not.toContain("reabrir");
    // Un encargo nunca reabre.
    expect(cerrado([hijo(60, ["tipo:encargo"], "OPEN", "2026-10-16T00:00:00Z")]).acciones.map((a) => a.tipo)).not.toContain("reabrir");
  });
  it("un fondo cerrado con un «no aguantó» ya contado no se reabre cada vez que alguien lo cierra", () => {
    const f = (subidos) => validarFicha(fondo({ state: "CLOSED", closedAt: "2026-10-15T12:00:00Z", stateReason: "COMPLETED", hijos: [hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-10T00:00:00Z")], body: `${fichaDe({ estado: "cerrado-eficaz", barrera: "test_ci", verificacion: "scripts/fondos.test.js", aprendizaje: "Test nuevo en fondos.test.js" })}\n### Arreglo general` }), { ...CTX, subidos });
    expect(f(new Set()).acciones.map((a) => a.tipo)).toContain("reabrir");
    expect(f(new Set([60])).acciones.map((a) => a.tipo)).not.toContain("reabrir");
  });
});

describe("validarFicha: la ventana de observación vencida", () => {
  const obs = (hijos = [], extra = {}) => fondo({ hijos, body: `${fichaDe({ estado: "en-observacion", barrera: "test_ci", verificacion: "scripts/fondos.test.js", ventana_hasta: "2026-10-15", casos: [10], aprendizaje: "Test nuevo en fondos.test.js", ...extra })}\n### Arreglo general` });
  const campos = (r) => Object.assign({}, ...r.acciones.filter((a) => a.tipo === "fijar").map((a) => a.campos));

  it("sin casos nuevos: cerrado-eficaz y se cierra con la etiqueta arreglo: de su barrera", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso", "analisis:abierto"], "CLOSED")]), CTX);
    expect(campos(r)).toEqual({ estado: "cerrado-eficaz" });
    expect(r.acciones).toContainEqual({ tipo: "cerrar", arreglo: "test" });
    expect(reglas(r, "error")).toEqual([]);
  });
  it("con un caso nuevo (no listado en «casos»): se reabre y NO se cierra", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso"], "CLOSED"), hijo(77, ["tipo:caso", "analisis:abierto"])]), CTX);
    expect(campos(r)).toEqual({ estado: "reabierto" });
    expect(r.acciones.some((a) => a.tipo === "cerrar")).toBe(false);
  });
  it("sin aprendizaje no se cierra aunque la ventana pase limpia", () => {
    const r = validarFicha(obs([], { aprendizaje: "" }), CTX);
    expect(reglas(r, "error")).toEqual(["cierre-sin-aprendizaje"]);
    expect(r.acciones.some((a) => a.tipo === "cerrar")).toBe(false);
  });
  it("con la ficha rota tampoco se cierra", () => {
    const r = validarFicha(obs([]), { ...CTX, existeEnStaging: () => false });
    expect(r.acciones.some((a) => a.tipo === "cerrar")).toBe(false);
  });
  it("el último día de la ventana aún no vence; el siguiente, sí", () => {
    expect(validarFicha(obs(), { ...CTX, hoy: "2026-10-15" }).acciones).toEqual([]);
    expect(validarFicha(obs(), { ...CTX, hoy: "2026-10-16" }).acciones.length).toBeGreaterThan(0);
  });
  it("otro estado no se cierra solo", () => {
    expect(validarFicha(fondo(), { ...CTX, hoy: "2030-01-01" }).acciones).toEqual([]);
  });
});

describe("validarHijo: todo caso y todo encargo cuelga de un fondo", () => {
  const padre = (labels) => ({ number: 50, labels: labels.map((name) => ({ name })) });
  it("un caso analizado y sin padre, error; un puntual, no", () => {
    expect(validarHijo(hijo(1, ["tipo:caso", "analisis:abierto"]), null).map((h) => h.gravedad)).toEqual(["error"]);
    expect(validarHijo(hijo(1, ["tipo:caso", "analisis:puntual"]), null)).toEqual([]);
  });
  it("un encargo sin padre avisa (hay encargos sueltos legítimos)", () => {
    expect(validarHijo(hijo(1, ["tipo:encargo"]), null).map((h) => h.gravedad)).toEqual(["aviso"]);
  });
  it("colgar de algo que no es un fondo, error", () => {
    expect(validarHijo(hijo(1, ["tipo:caso"]), padre(["tipo:encargo"]))[0].gravedad).toBe("error");
    expect(validarHijo(hijo(1, ["tipo:caso"]), padre(FONDO))).toEqual([]);
  });
});

// ── El comentario ─────────────────────────────────────────────────────────────

describe("comentario del workflow", () => {
  it("lleva la marca primero, el estado y la cuenta, y una línea por hallazgo", () => {
    const r = validarFicha(fondo({ body: "x" }), CTX);
    const c = comentario(r, { subidos: new Set([7, 3]) });
    expect(c.startsWith(`${MARCA}estado=falla subidos=3,7 -->`)).toBe(true);
    expect(c).toMatch(/`ficha-ausente`/);
    expect(comentario({ hallazgos: [], acciones: [] }).startsWith(`${MARCA}estado=ok -->`)).toBe(true);
    expect(comentario({ hallazgos: [], acciones: [] }, { marca: MARCA_HIJO }).startsWith(MARCA_HIJO)).toBe(true);
  });

  it("lo que escribe el autor NO llega al comentario: ni HTML, ni enlaces, ni menciones", () => {
    const sucio = "<img src=x onerror=alert(1)> @pablo [pincha](http://evil.example) www.evil.example `x` <!-- menuplan:fondo estado=ok -->";
    const cuerpos = [
      fichaDe({ estado: sucio }), fichaDe({ barrera: sucio }), fichaDe({ ventana_hasta: sucio }), fichaDe({ verificacion: sucio }),
      fichaDe({ casos: sucio }), fichaDe({ [sucio]: "x" }), fichaDe({ mecanismo: sucio, causa_escape: sucio, matiz: sucio, aprendizaje: sucio }),
      fichaDe({ estado: "en-observacion", barrera: "test_ci", verificacion: "a/b/c.test.js", ventana_hasta: "2026-11-01", tipo_causa: sucio }),
    ];
    for (const body of cuerpos) {
      const c = comentario(validarFicha(fondo({ body, title: sucio }), { ...CTX, existeEnStaging: () => false }));
      expect(c.split("\n").slice(1).join("\n"), body.slice(0, 80)).not.toMatch(/[<>]|@pablo|https?:\/\/|www\.|\]\(|evil\.example/);
      // La única marca es la nuestra, la primera línea.
      expect(c.split(MARCA).length).toBe(2);
    }
  });

  it("limpio() quita lo que GitHub convertiría en HTML, mención o enlace", () => {
    expect(limpio("<b>@x</b> http://e.example www.e.example [a](b)", 200)).not.toMatch(/[<>@[\]]|http:\/\/|www\./);
    expect(limpio("a".repeat(500)).length).toBe(40);
  });

  it("solo es nuestro un comentario con la marca Y escrito por el bot", () => {
    const texto = `${MARCA}estado=ok -->\nhola`;
    expect(esComentarioNuestro({ body: texto, user: { login: "github-actions[bot]" } })).toBe(true);
    expect(esComentarioNuestro({ body: texto, user: { login: "intruso" } })).toBe(false);
    expect(esComentarioNuestro({ body: "hola", user: { login: "github-actions[bot]" } })).toBe(false);
    expect(esComentarioNuestro({ body: texto, user: { login: "github-actions[bot]" } }, MARCA_HIJO)).toBe(false);
    expect(esComentarioNuestro(null)).toBe(false);
  });

  it("leerSubidos aguanta basura y tope", () => {
    expect([...leerSubidos(`${MARCA}estado=falla subidos=3,7 -->`)]).toEqual([3, 7]);
    expect([...leerSubidos(`${MARCA}estado=ok -->`)]).toEqual([]);
    expect([...leerSubidos(`${MARCA}estado=ok subidos=abc,99999999999,-1,0 -->`)]).toEqual([]);
    expect(leerSubidos("x".repeat(100_000)).size).toBe(0);
    expect(leerSubidos(null).size).toBe(0);
  });
});

// ── El informe de `npm run issues` ────────────────────────────────────────────

describe("informeFichas", () => {
  const f = (number, body, extra = {}) => ({ number, state: "OPEN", labels: FONDO.map((name) => ({ name })), body, hijos: [], ...extra });
  it("cuenta los fondos sin ficha, sin diagnóstico y con la ventana vencida", () => {
    const r = informeFichas([
      f(1, "sin ficha"),
      f(2, fichaDe({ estado: "plan" }, ["mecanismo"])),
      f(3, fichaDe({ estado: "en-observacion", barrera: "test_ci", verificacion: "a.test.js", ventana_hasta: "2026-10-01" })),
      f(4, fichaDe()),
      f(5, "cerrado y sin ficha", { state: "CLOSED" }),
      { number: 6, state: "OPEN", labels: [{ name: "tipo:caso" }], body: fichaDe(), hijos: [] },
    ], { hoy: "2026-10-20" });
    expect(r).toMatchObject({ total: 5, conFicha: 3, sinFicha: [1], sinDiagnostico: [2], ventanaVencida: [{ number: 3, hasta: "2026-10-01" }] });
  });
  it("un fondo con encargos y sin diagnóstico sale aunque su estado sea «abierto»", () => {
    const r = informeFichas([f(2, fichaDe({ estado: "abierto" }, ["causa_escape"]), { hijos: [hijo(9, ["tipo:encargo"])] })], { hoy: "2026-10-20" });
    expect(r.sinDiagnostico).toEqual([2]);
  });
  it("un matiz que se repite en dos fondos (aunque cambie mayúsculas, tildes o espacios) es candidato a valor nuevo", () => {
    const r = informeFichas([
      f(1, fichaDe({ matiz: "Falla solo en Windows" })),
      f(2, fichaDe({ matiz: "falla  solo en windows " }), { state: "CLOSED" }),
      f(3, fichaDe({ matiz: "Sólo en Linux" })),
      f(4, fichaDe({ matiz: "otro distinto" })),
    ], { hoy: "2026-10-20" });
    expect(r.matices).toEqual([{ matiz: "falla solo en windows", veces: 2, issues: [1, 2] }]);
  });
  it("sin matices repetidos, la lista está vacía", () => {
    expect(informeFichas([f(1, fichaDe({ matiz: "uno" })), f(2, fichaDe({ matiz: "otro" }))]).matices).toEqual([]);
  });
});

// ── Lo que mira el CI del repo ────────────────────────────────────────────────

describe("el workflow fondos.yml y el paso del CI", () => {
  const wf = leer(".github", "workflows", "fondos.yml");
  const sinComentarios = wf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

  it("sin pull_request_target, sin secretos y con los permisos mínimos", () => {
    expect(sinComentarios).not.toMatch(/pull_request_target|secrets\./);
    expect(/^permissions:\n( {2}[\w-]+: (read|write)[^\n]*\n)+/m.exec(sinComentarios)[0].match(/^ {2}[\w-]+: \w+/gm).map((l) => l.trim())).toEqual(["contents: read", "issues: write"]);
  });
  it("nada de texto del issue en un run: todo por entorno", () => {
    const runs = [...sinComentarios.matchAll(/run: (.*)$/gm)].map((m) => m[1]);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).not.toContain("${{");
    for (const m of sinComentarios.matchAll(/\$\{\{ ([^}]+) \}\}/g)) {
      expect(m[1], "solo números, el tipo de evento, el token y el repo").toMatch(/^(github\.token|github\.repository|github\.event\.action|github\.event\.issue\.number(?: \|\| 'diario')?)$/);
    }
  });
  it("eventos de issues, el pase diario, concurrency por issue y acciones como las del resto", () => {
    expect(sinComentarios).toMatch(/types: \[opened, edited, labeled, closed, reopened\]/);
    expect(sinComentarios).toMatch(/schedule:/);
    expect(sinComentarios).toMatch(/concurrency:\n {2}group: fondos-\$\{\{ github\.event\.issue\.number \|\| 'diario' \}\}/);
    expect(sinComentarios).toMatch(/ref: staging/);
    const tests = leer(".github", "workflows", "tests.yml");
    for (const accion of ["actions/checkout@v7", "actions/setup-node@v6"]) {
      expect(sinComentarios).toContain(accion);
      expect(tests).toContain(accion);
    }
  });
  it("tests.yml lanza fondos-pr.mjs en los PR, con el cuerpo por entorno", () => {
    const tests = leer(".github", "workflows", "tests.yml");
    const paso = /- name: Fondos del PR\n([\s\S]*?)(?=\n {6}# |\n {6}- )/.exec(tests)[1];
    expect(paso).toMatch(/if: github\.event_name == 'pull_request'/);
    expect(paso).toMatch(/run: node scripts\/fondos-pr\.mjs/);
    expect(paso).toMatch(/PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    expect(tests).toMatch(/issues: read/);
  });
});

describe("el día de Madrid", () => {
  it("cambia de día a las 22:00 UTC en verano, no a las 00:00", () => {
    expect(diaMadrid(new Date("2026-10-09T21:30:00Z"))).toBe("2026-10-09");
    expect(diaMadrid(new Date("2026-10-09T22:30:00Z"))).toBe("2026-10-10");
  });
});
