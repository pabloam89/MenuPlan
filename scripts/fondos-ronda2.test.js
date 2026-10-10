import { describe, expect, it } from "vitest";

import {
  BARRERAS, MARCA, VERIFICACION_POR_BARRERA, comentario, esDeLaCasa, informeFichas, leerFicha, leerRun, leerSubidos, limpio, validarFicha,
} from "./lib/fondos.mjs";
import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";

// Ronda 2 de #337 (revisor y seguridad): cada arreglo con su test, visto fallar.

const bloque = (lineas) => `Texto del fondo.\n\n\`\`\`fondo\n${lineas.join("\n")}\n\`\`\`\n`;
const BUENA = {
  estado: "diagnosticado", tipo_causa: "vigilante-hueco", alcance: "local", severidad: "medio", capa_agente: "gobierno",
  mecanismo: "El control solo corre si alguien lo lanza", causa_escape: "Ningún workflow reacciona a un issue",
};
const fichaDe = (extra = {}, quitar = []) => {
  const d = { ...BUENA, ...extra };
  for (const q of quitar) delete d[q];
  return bloque(Object.entries(d).map(([k, v]) => `${k}: ${v}`));
};
const FONDO = ["tipo:fondo", "causa:vigilante-hueco", "area:ops"];
const fondo = (extra = {}) => ({
  number: 50, title: "[fondo] x", state: "OPEN", stateReason: null, createdAt: "2026-10-12T10:00:00Z", closedAt: null,
  body: `${fichaDe()}\n### Arreglo general`, labels: FONDO.map((name) => ({ name })), hijos: [], ...extra,
});
const hijo = (number, labels, state = "OPEN", createdAt = "2026-10-12T10:00:00Z") => ({
  number, state, createdAt, labels: labels.map((name) => ({ name })), tipo: labels.find((l) => l.startsWith("tipo:"))?.slice(5) ?? null,
});
const CTX = { hoy: "2026-10-20", existeEnStaging: () => true };
const reglas = (r, gravedad) => r.hallazgos.filter((h) => !gravedad || h.gravedad === gravedad).map((h) => h.regla);
const tipos = (r) => r.acciones.map((a) => a.tipo);
const campos = (r) => Object.assign({}, ...r.acciones.filter((a) => a.tipo === "fijar").map((a) => a.campos));
const OBS = { estado: "en-observacion", barrera: "test_ci", verificacion: "scripts/fondos.test.js", ventana_desde: "2026-10-10", ventana_hasta: "2026-10-15", casos: "#10, #77", aprendizaje: "Test nuevo en fondos.test.js" };

describe("lo que reabre el bot no se repite (bloqueante)", () => {
  const cerradoConNoAguanto = (body, subidos) => validarFicha(
    fondo({ state: "CLOSED", stateReason: "COMPLETED", closedAt: "2026-10-15T12:00:00Z", body, hijos: [hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-10T00:00:00Z")] }),
    { ...CTX, subidos },
  );
  it.each([
    ["sin ficha (fondo antiguo)", "### Arreglo general\n\nUna pieza."],
    ["con la ficha en error", fichaDe({ estado: "hackeado" })],
  ])("fondo %s con un hijo no-aguanto: lo reabre una vez y lo anota en subidos (dos pasadas)", (_, body) => {
    const primera = cerradoConNoAguanto(body, new Set());
    expect(tipos(primera)).toContain("reabrir");
    expect([...primera.subidos]).toEqual([60]);
    // El bot escribió la marca; alguien lo vuelve a cerrar a mano: la segunda pasada no repite.
    const segunda = cerradoConNoAguanto(body, primera.subidos);
    expect(tipos(segunda)).not.toContain("reabrir");
  });
});

describe("la ventana no cierra como eficaz con un caso que no aguantó ni con casos nuevos escondidos", () => {
  const obs = (hijos, extra = {}) => fondo({ hijos, body: `${fichaDe({ ...OBS, ...extra })}\n### Arreglo general` });

  it("un no-aguanto presente: sube alcance, reabre y NO cierra aunque la ventana venza (Object.assign no deja ganar al último)", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso"], "CLOSED", "2026-10-01T00:00:00Z"), hijo(77, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-01T00:00:00Z")]), CTX);
    expect(tipos(r)).not.toContain("cerrar");
    expect(campos(r)).toEqual({ alcance: "modulo", estado: "reabierto" });
  });
  it("un no-aguanto ya contado y DE ESTA ventana: tampoco se cierra como eficaz", () => {
    const r = validarFicha(obs([hijo(77, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-12T00:00:00Z")]), { ...CTX, subidos: new Set([77]) });
    expect(tipos(r)).not.toContain("cerrar");
    expect(campos(r).estado).not.toBe("cerrado-eficaz");
  });
  it("N2 (#381): un no-aguanto ya contado y ANTERIOR a la ventana no bloquea el cierre eficaz para siempre", () => {
    const r = validarFicha(obs([hijo(77, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-01T00:00:00Z")]), { ...CTX, subidos: new Set([77]) });
    expect(tipos(r)).toContain("cerrar");
    expect(campos(r).estado).toBe("cerrado-eficaz");
  });
  it("N2: sin «ventana_desde» legible no se arriesga: el no-aguanto sigue bloqueando", () => {
    const f = obs([hijo(77, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-01T00:00:00Z")], { ventana_desde: "" });
    expect(tipos(validarFicha(f, { ...CTX, subidos: new Set([77]) }))).not.toContain("cerrar");
  });
  it("N1 (#381): ventana_desde es un día a las 00:00 UTC; un caso de ese mismo día, aunque sea el de origen, cuenta como nuevo", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso", "analisis:abierto"], "CLOSED", "2026-10-10T00:00:00Z")], { casos: "#10" }), CTX);
    expect(tipos(r)).not.toContain("cerrar");
    expect(campos(r)).toEqual({ estado: "reabierto" });
    // Y el del día anterior, listado, no.
    expect(tipos(validarFicha(obs([hijo(10, ["tipo:caso", "analisis:abierto"], "CLOSED", "2026-10-09T23:59:00Z")], { casos: "#10" }), CTX))).toContain("cerrar");
  });
  it("un caso LISTADO en «casos» pero creado después del inicio de la ventana cuenta como nuevo", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso", "analisis:abierto"], "OPEN", "2026-10-12T00:00:00Z")], { casos: "#10" }), CTX);
    expect(tipos(r)).not.toContain("cerrar");
    expect(campos(r)).toEqual({ estado: "reabierto" });
  });
  it("sin casos nuevos (los de antes de la ventana, listados) sí se cierra", () => {
    const r = validarFicha(obs([hijo(10, ["tipo:caso", "analisis:abierto"], "CLOSED", "2026-10-01T00:00:00Z")], { casos: "#10" }), CTX);
    expect(tipos(r)).toContain("cerrar");
  });
  it("el reintento de cierre (cerrado-eficaz con el issue abierto) no cierra si hay un no-aguanto", () => {
    const f = fondo({ hijos: [hijo(77, ["tipo:caso", "analisis:no-aguanto-corto"], "OPEN", "2026-10-01T00:00:00Z")], body: `${fichaDe({ ...OBS, estado: "cerrado-eficaz" })}\n### Arreglo general` });
    const r = validarFicha(f, CTX);
    expect(tipos(r)).not.toContain("cerrar");
    expect(campos(r).estado).toBe("reabierto");
  });
  it("cerrado-eficaz con el issue abierto y todo en regla: reintenta el cierre (el pase diario se cortó a medias)", () => {
    const f = fondo({ body: `${fichaDe({ ...OBS, estado: "cerrado-eficaz" })}\n### Arreglo general` });
    expect(validarFicha(f, CTX).acciones).toContainEqual({ tipo: "cerrar", arreglo: "test" });
  });
  it("sin «alcance» en la ficha no se escribe «alcance: undefined»", () => {
    const f = fondo({ hijos: [hijo(60, ["tipo:caso", "analisis:no-aguanto-corto"])], body: `${fichaDe({}, ["alcance"])}\n### Arreglo general` });
    const r = validarFicha(f, CTX);
    expect(campos(r)).toEqual({ estado: "reabierto" });
    expect(Object.keys(campos(r))).not.toContain("alcance");
  });
  it("«ventana_desde» es obligatoria en observación", () => {
    expect(reglas(validarFicha(obs([], { ventana_desde: "" }), CTX), "error")).toContain("observacion-sin-ventana");
  });
});

describe("la verificación es un fichero que vale para su barrera", () => {
  const con = (barrera, verificacion) => validarFicha(fondo({ body: `${fichaDe({ ...OBS, barrera, verificacion })}\n### Arreglo general` }), CTX);
  it("hay un patrón por cada barrera de la escalera", () => expect(Object.keys(VERIFICACION_POR_BARRERA)).toEqual(BARRERAS));
  it.each([
    ["test_ci", "scripts"],
    ["test_ci", "scripts/fondos.mjs"],
    ["bloqueo", "scripts/fondos.test.js"],
    ["script", "scripts/fondos.test.js"],
    ["skill", ".claude/skills/issues"],
    ["texto", "scripts/fondos.mjs"],
  ])("%s con «%s» no vale (un directorio o un fichero de otra clase no vigila nada)", (barrera, ruta) => {
    expect(reglas(con(barrera, ruta), "error")).toContain("verificacion-no-vale");
  });
  it.each([
    ["test_ci", "scripts/fondos.test.js"],
    ["bloqueo", ".claude/hooks/guardia.mjs"],
    ["bloqueo", ".github/workflows/tests.yml"],
    ["script", "scripts/issues.mjs"],
    ["skill", ".claude/skills/issues/SKILL.md"],
    ["texto", "CLAUDE.md"],
  ])("%s con «%s» vale", (barrera, ruta) => expect(reglas(con(barrera, ruta), "error")).toEqual([]));
});

describe("el lector y el texto que se enseña", () => {
  it.each(["constructor", "__proto__", "tostring"])("la clave «%s» no es de la ficha (no se hereda de Object.prototype)", (clave) => {
    const l = leerFicha(bloque([`${clave}: x`]));
    expect(l.errores.map((e) => e.regla)).toEqual(["ficha-bloque"]);
    expect(l.ficha).toEqual({});
  });
  it("limpio() no deja referencias a otro repo (dueño/repo#12) pero sí la de este (#12)", () => {
    expect(limpio("mira pabloam89/MenuPlan#12 y otro/x#3")).not.toContain("#");
    expect(limpio("encargos abiertos (#20)")).toBe("encargos abiertos (#20)");
  });
  it("la marca lleva el run y se lee de vuelta; un run con basura no se escribe", () => {
    const c = comentario({ hallazgos: [], acciones: [] }, { run: "123456" });
    expect(c.split("\n")[0]).toBe(`${MARCA}estado=ok run=123456 -->`);
    expect(leerRun(c)).toBe("123456");
    expect(comentario({ hallazgos: [], acciones: [] }, { run: "1 --> <script>" }).split("\n")[0]).toBe(`${MARCA}estado=ok -->`);
    expect(leerRun(`${MARCA}estado=ok -->`)).toBeNull();
    expect([...leerSubidos(c)]).toEqual([]);
  });
  it("«de la casa» son el dueño, los miembros y los colaboradores; nadie más, ni sin dato", () => {
    for (const a of ["OWNER", "MEMBER", "COLLABORATOR", "owner"]) expect(esDeLaCasa(a), a).toBe(true);
    for (const a of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "MANNEQUIN", "", null, undefined]) expect(esDeLaCasa(a), String(a)).toBe(false);
  });
});

describe("el informe de fichas", () => {
  const f = (number, body, extra = {}) => ({ number, state: "OPEN", createdAt: "2026-10-12T00:00:00Z", labels: FONDO.map((name) => ({ name })), body, hijos: [], ...extra });
  it("ignora los fondos de quien no es de la casa (si se sabe quién es)", () => {
    const r = informeFichas([f(1, "sin ficha", { asociacion: "NONE" }), f(2, "sin ficha", { asociacion: "OWNER" }), f(3, "sin ficha", { asociacion: null })], { hoy: "2026-10-20" });
    expect(r.total).toBe(2);
    expect(r.sinFicha).toEqual([2, 3]);
  });
  it("distingue los sin ficha que ya la deben tener y enseña el estado de la autoaplicación (#334)", () => {
    const r = informeFichas([f(334, "sin ficha", { createdAt: "2026-10-08T00:00:00Z" }), f(400, "sin ficha")], { hoy: "2026-10-20" });
    expect(r.sinFicha).toEqual([334, 400]);
    expect(r.sinFichaObligatoria).toEqual([400]);
    expect(r.autoaplicacion).toEqual([{ number: 334, conFicha: false }]);
    expect(informeFichas([f(334, fichaDe())], { hoy: "2026-10-20" }).autoaplicacion).toEqual([{ number: 334, conFicha: true }]);
  });
});

describe("ghApi: el token no sale de api.github.com", () => {
  const registro = () => {
    const llamadas = [];
    return { llamadas, fetchFn: async (url) => (llamadas.push(url), { status: 200, ok: true, json: async () => ({}) }) };
  };
  it.each(["https://evil.example/x", "http://api.github.com/x", "file:///etc/passwd", "ftp://x/y", "https://api.github.com.evil.example/x"])("rechaza %s sin hacer la petición", async (ruta) => {
    const { llamadas, fetchFn } = registro();
    await expect(pedir({ token: "t", repo: "a/b", ruta, fetchFn })).rejects.toThrow(/URL fuera de/);
    expect(llamadas).toEqual([]);
  });
  it("acepta una absoluta de la API y las rutas relativas", async () => {
    const { llamadas, fetchFn } = registro();
    await pedir({ token: "t", repo: "a/b", ruta: "https://api.github.com/repos/a/b/issues/1", fetchFn });
    await pedir({ token: "t", repo: "a/b", ruta: "/issues/2", fetchFn });
    expect(llamadas).toEqual(["https://api.github.com/repos/a/b/issues/1", "https://api.github.com/repos/a/b/issues/2"]);
    expect(ErrorDeApi).toBeDefined();
  });
});
