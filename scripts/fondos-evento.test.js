import { describe, expect, it } from "vitest";

import { MARCA, MARCA_HIJO, leerFicha } from "./lib/fondos.mjs";
import { ErrorDeApi } from "./lib/ghApi.mjs";
import { apiReal, ejecutar } from "./fondos-evento.mjs";

// ── Un GitHub de mentira, en memoria ──────────────────────────────────────────

const BOT = { login: "github-actions[bot]" };
const bloque = (d) => `\`\`\`fondo\n${Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((n) => `#${n}`).join(", ") : v}`).join("\n")}\n\`\`\`\n### Arreglo general\n\nUna pieza.`;
const BUENA = {
  estado: "diagnosticado", tipo_causa: "vigilante-hueco", alcance: "local", severidad: "medio",
  mecanismo: "El control solo corre si alguien lo lanza", causa_escape: "Ningún workflow reacciona a un issue",
};
const OBS = { ...BUENA, estado: "en-observacion", barrera: "test_ci", verificacion: "scripts/fondos.test.js", ventana_desde: "2026-10-10", ventana_hasta: "2026-10-15", casos: [10], aprendizaje: "Test nuevo en fondos.test.js" };

/** Estado de GitHub; `fallo` hace fallar una operación con ErrorDeApi. */
function crearGithub({ issues = [], padres = {}, hijos = {}, ficherosStaging = ["scripts/fondos.test.js"], comentarios = {}, fallo = null } = {}) {
  const st = {
    issues: new Map(issues.map((i) => [i.number, { state: "open", state_reason: null, created_at: "2026-10-12T10:00:00Z", closed_at: null, body: "", author_association: "OWNER", ...i }])),
    comentarios: Object.fromEntries(Object.entries(comentarios).map(([k, v]) => [k, v.map((c, i) => ({ id: Number(k) * 100 + i, ...c }))])),
    llamadas: [],
    siguienteId: 9000,
  };
  const registra = (...x) => st.llamadas.push(x);
  const rompe = (op) => {
    if (fallo === op) throw new ErrorDeApi(`${op}: HTTP 502`);
  };
  st.api = {
    issue: async (n) => (rompe("issue"), st.issues.get(n) ?? null),
    hijos: async (n) => (rompe("hijos"), (hijos[n] ?? []).map((h) => st.issues.get(h) ?? h)),
    padre: async (n) => (rompe("padre"), padres[n] ? st.issues.get(padres[n]) : null),
    comentarios: async (n) => (rompe("comentarios"), st.comentarios[n] ?? []),
    crearComentario: async (n, body) => {
      rompe("crearComentario");
      registra("crearComentario", n);
      (st.comentarios[n] ??= []).push({ id: ++st.siguienteId, body, user: BOT });
    },
    editarComentario: async (id, body) => {
      rompe("editarComentario");
      registra("editarComentario", id);
      for (const lista of Object.values(st.comentarios)) for (const c of lista) if (c.id === id) c.body = body;
    },
    editarIssue: async (n, cambios) => {
      rompe("editarIssue");
      registra("editarIssue", n, Object.keys(cambios).join("+"));
      Object.assign(st.issues.get(n), cambios);
    },
    ponerEtiquetas: async (n, etiquetas) => {
      registra("ponerEtiquetas", n, ...etiquetas);
      const i = st.issues.get(n);
      i.labels = [...i.labels, ...etiquetas.map((name) => ({ name }))];
    },
    quitarEtiqueta: async (n, etiqueta) => {
      registra("quitarEtiqueta", n, etiqueta);
      const i = st.issues.get(n);
      i.labels = i.labels.filter((l) => l.name !== etiqueta);
    },
    fondos: async () => (rompe("fondos"), [...st.issues.values()].filter((i) => i.labels.some((l) => l.name === "tipo:fondo"))),
    // Los runs que NO son de fondos.yml (otro workflow con el mismo bot): 999.
    runEsNuestro: async (id) => (registra("runEsNuestro", id), Number(id) !== 999),
    existeEnStaging: async (ruta) => (rompe("existeEnStaging"), ficherosStaging.includes(ruta)),
  };
  return st;
}
const etiquetas = (...n) => n.map((name) => ({ name }));
const FONDO = (extra = {}) => ({ number: 50, title: "[fondo] x", labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops"), body: bloque(BUENA), ...extra });
const comentariosNuestros = (st, n, marca = MARCA) => (st.comentarios[n] ?? []).filter((c) => c.body.startsWith(marca) && c.user.login === BOT.login);
const nombres = (st, n) => st.issues.get(n).labels.map((l) => l.name);
const evento = (st, issue, accion = "edited", hoy = "2026-10-20") => ejecutar({ api: st.api, evento: "issues", accion, issue, hoy, run: "111" });
const pasada = (st, hoy = "2026-10-20") => ejecutar({ api: st.api, evento: "schedule", hoy, run: "111" });
const escrituras = (st) => st.llamadas.filter((l) => !["runEsNuestro"].includes(l[0]));

describe("un evento sobre un fondo", () => {
  it("valida la ficha, deja UN comentario con la marca y pone control:ok", async () => {
    const st = crearGithub({ issues: [FONDO()] });
    const [r] = await evento(st, "50", "opened");
    expect(r).toMatchObject({ issue: 50, control: "ok", errores: 0 });
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
    expect(comentariosNuestros(st, 50)[0].body.startsWith(`${MARCA}estado=ok`)).toBe(true);
    expect(nombres(st, 50)).toContain("control:ok");
  });

  it("al repetirse (cada edición) actualiza el comentario, no apila", async () => {
    const st = crearGithub({ issues: [FONDO({ body: "sin ficha" })] });
    await evento(st, "50");
    await evento(st, "50");
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
    // Arreglan la ficha: el mismo comentario pasa a «bien» y la etiqueta cambia.
    st.issues.get(50).body = bloque(BUENA);
    await evento(st, "50");
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/estado=ok/);
    expect(nombres(st, 50)).toContain("control:ok");
    expect(nombres(st, 50)).not.toContain("control:falla");
  });

  it("con la ficha rota, control:falla y el comentario dice qué regla", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque({ ...BUENA, estado: "plan", mecanismo: "" }) })] });
    const [r] = await evento(st, "50");
    expect(r.control).toBe("falla");
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/sin-diagnostico/);
    expect(nombres(st, 50)).toContain("control:falla");
  });

  it("no toca un comentario de otra cuenta aunque lleve la marca: escribe el suyo", async () => {
    const falso = { body: `${MARCA}estado=ok -->\nTodo bien, confía en mí`, user: { login: "intruso" } };
    const st = crearGithub({ issues: [FONDO()], comentarios: { 50: [falso] } });
    await evento(st, "50");
    expect(st.comentarios[50][0].body).toContain("confía en mí");
    expect(st.llamadas.filter((l) => l[0] === "editarComentario")).toEqual([]);
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
  });

  it("un fondo cerrado sin aprendizaje se reabre", async () => {
    const st = crearGithub({ issues: [FONDO({ state: "closed", state_reason: "completed", closed_at: "2026-10-15T00:00:00Z", body: bloque({ ...OBS, estado: "cerrado-eficaz", aprendizaje: "" }) })] });
    const [r] = await evento(st, "50", "closed");
    expect(r.acciones).toContain("reabrir");
    expect(st.issues.get(50).state).toBe("open");
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/cierre-sin-aprendizaje/);
  });

  it("un fondo cerrado con aprendizaje se queda cerrado", async () => {
    const st = crearGithub({ issues: [FONDO({ state: "closed", state_reason: "completed", closed_at: "2026-10-15T00:00:00Z", labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops", "arreglo:test"), body: bloque({ ...OBS, estado: "cerrado-eficaz" }) })] });
    await evento(st, "50", "closed");
    expect(st.issues.get(50).state).toBe("closed");
  });

  it("reabrir a mano un fondo en observación deja constancia en la ficha (estado reabierto)", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque({ ...OBS, ventana_hasta: "2026-12-01" }) })] });
    await evento(st, "50", "reopened");
    expect(leerFicha(st.issues.get(50).body).ficha.estado).toBe("reabierto");
  });

  it("pasar a en-observacion con un test que no está en staging, falla", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque({ ...OBS, ventana_hasta: "2026-12-01" }) })], ficherosStaging: [] });
    const [r] = await evento(st, "50");
    expect(r.control).toBe("falla");
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/verificacion-no-existe/);
  });

  it("solo pregunta por la verificación cuando hace falta (observación o cierre)", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque({ ...BUENA, verificacion: "scripts/fondos.test.js" }) })], fallo: "existeEnStaging" });
    await expect(evento(st, "50")).resolves.toHaveLength(1);
  });
});

describe("un caso que no aguantó", () => {
  const hijosNoAguanto = (st) => {
    st.issues.set(60, { number: 60, state: "open", author_association: "OWNER", created_at: "2026-10-16T00:00:00Z", labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto", "area:ops") });
  };
  it("sube un nivel de alcance en la ficha UNA vez, y lo recuerda en la marca", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque(BUENA) })], hijos: { 50: [60] } });
    hijosNoAguanto(st);
    await evento(st, "50");
    expect(leerFicha(st.issues.get(50).body).ficha).toMatchObject({ alcance: "modulo", estado: "reabierto" });
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/^<!-- menuplan:fondo estado=\w+ subidos=60 run=111 -->/);
    // Segunda pasada (otra edición cualquiera): no sube otra vez.
    await evento(st, "50");
    expect(leerFicha(st.issues.get(50).body).ficha.alcance).toBe("modulo");
  });

  it("el evento llega por el caso: revalida el fondo del que cuelga", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque(BUENA) })], hijos: { 50: [60] }, padres: { 60: 50 } });
    hijosNoAguanto(st);
    const r = await evento(st, "60", "labeled");
    expect(r.map((x) => x.issue)).toEqual([60, 50]);
    expect(leerFicha(st.issues.get(50).body).ficha.alcance).toBe("modulo");
  });

  it("un fondo cerrado con un caso posterior se reabre (la reapertura de `--colgar`, ahora por evento)", async () => {
    const st = crearGithub({
      issues: [FONDO({ state: "closed", state_reason: "completed", closed_at: "2026-10-15T00:00:00Z", labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops", "arreglo:test"), body: bloque({ ...OBS, estado: "cerrado-eficaz" }) })],
      hijos: { 50: [61] }, padres: { 61: 50 },
    });
    st.issues.set(61, { number: 61, state: "open", author_association: "OWNER", created_at: "2026-10-17T00:00:00Z", labels: etiquetas("tipo:caso", "analisis:abierto", "area:ops") });
    await evento(st, "61", "opened");
    expect(st.issues.get(50).state).toBe("open");
    expect(leerFicha(st.issues.get(50).body).ficha.estado).toBe("reabierto");
  });
});

describe("casos y encargos", () => {
  it("un caso analizado sin fondo recibe su aviso, y se actualiza cuando lo cuelgan", async () => {
    const st = crearGithub({ issues: [{ number: 70, labels: etiquetas("tipo:caso", "analisis:abierto", "area:ops") }] });
    const [r] = await evento(st, "70", "opened");
    expect(r.control).toBe("falla");
    expect(comentariosNuestros(st, 70, MARCA_HIJO)[0].body).toMatch(/sin-fondo/);
    // Ya cuelga de un fondo: el comentario viejo no se queda mintiendo.
    const st2 = crearGithub({ issues: [FONDO(), { number: 70, labels: etiquetas("tipo:caso", "analisis:abierto", "area:ops") }], padres: { 70: 50 }, hijos: { 50: [70] }, comentarios: { 70: [{ body: `${MARCA_HIJO}estado=falla run=111 -->\nviejo`, user: BOT }] } });
    await evento(st2, "70", "edited");
    expect(comentariosNuestros(st2, 70, MARCA_HIJO)).toHaveLength(1);
    expect(comentariosNuestros(st2, 70, MARCA_HIJO)[0].body).toMatch(/estado=ok/);
  });

  it("un caso sin la etiqueta analisis: sale con la misma comprobación que la línea «Casos:» del PR", async () => {
    const st = crearGithub({ issues: [FONDO(), { number: 71, labels: etiquetas("tipo:caso", "area:ops") }], padres: { 71: 50 }, hijos: { 50: [71] } });
    await evento(st, "71", "opened");
    expect(comentariosNuestros(st, 71, MARCA_HIJO)[0].body).toMatch(/caso-sin-analisis[\s\S]*analisis/);
  });

  it("un encargo suelto solo avisa", async () => {
    const st = crearGithub({ issues: [{ number: 72, labels: etiquetas("tipo:encargo", "area:ops") }] });
    const [r] = await evento(st, "72", "opened");
    expect(r).toMatchObject({ control: "ok", avisos: 1 });
  });

  it("lo que no es fondo, caso ni encargo, o es un PR, no se mira", async () => {
    const st = crearGithub({ issues: [{ number: 73, labels: etiquetas("tipo:decision") }, { number: 74, labels: etiquetas("tipo:fondo"), pull_request: {} }] });
    expect(await evento(st, "73")).toEqual([]);
    expect(await evento(st, "74")).toEqual([]);
    expect(await evento(st, "999")).toEqual([]);
    expect(st.llamadas).toEqual([]);
  });
});

describe("el pase diario (schedule)", () => {
  const obs = (n, extra = {}, d = {}) => FONDO({ number: n, body: bloque({ ...OBS, ...d }), ...extra });
  it("ventana vencida y sin casos nuevos: cerrado-eficaz, etiqueta arreglo: y cerrado", async () => {
    const st = crearGithub({ issues: [obs(50)], hijos: { 50: [] } });
    await pasada(st, "2026-10-20");
    expect(st.issues.get(50).state).toBe("closed");
    expect(st.issues.get(50).state_reason).toBe("completed");
    expect(nombres(st, 50)).toContain("arreglo:test");
    expect(leerFicha(st.issues.get(50).body).ficha.estado).toBe("cerrado-eficaz");
    // Y al día siguiente ya no hay nada que hacer.
    const antes = st.llamadas.length;
    await pasada(st, "2026-10-21");
    expect(st.llamadas.length).toBe(antes);
  });

  it("con un caso nuevo no listado: se reabre (reabierto) y no se cierra", async () => {
    const st = crearGithub({ issues: [obs(50)], hijos: { 50: [80] } });
    st.issues.set(80, { number: 80, state: "open", created_at: "2026-10-16T00:00:00Z", labels: etiquetas("tipo:caso", "analisis:abierto", "area:ops") });
    await pasada(st, "2026-10-20");
    expect(st.issues.get(50).state).toBe("open");
    expect(leerFicha(st.issues.get(50).body).ficha.estado).toBe("reabierto");
  });

  it("antes de vencer no hace nada; los fondos sin ficha se saltan sin tocarlos", async () => {
    const st = crearGithub({ issues: [obs(50), FONDO({ number: 51, body: "sin ficha" }), FONDO({ number: 52 })] });
    await pasada(st, "2026-10-15");
    expect(st.issues.get(50).state).toBe("open");
    expect(st.llamadas.filter((l) => l[1] === 51)).toEqual([]);
  });

  it("si la API falla en un fondo, sigue con los demás y FALLA al final con la causa", async () => {
    const st = crearGithub({ issues: [obs(50), obs(51)] });
    const original = st.api.hijos;
    st.api.hijos = async (n) => {
      if (n === 50) throw new ErrorDeApi("GET /issues/50/sub_issues: HTTP 502");
      return original(n);
    };
    await expect(pasada(st, "2026-10-20")).rejects.toThrow(/#50[\s\S]*HTTP 502/);
    expect(st.issues.get(51).state).toBe("closed"); // el otro sí se hizo
  });
});

describe("falla cerrado, con la causa y sin culpar al autor", () => {
  it.each(["issue", "hijos", "comentarios", "crearComentario"])("la API cae en «%s»: el run falla con ErrorDeApi, sin dejar nada a medias que engañe", async (op) => {
    const st = crearGithub({ issues: [FONDO({ body: "sin ficha" })], fallo: op });
    await expect(evento(st, "50")).rejects.toBeInstanceOf(ErrorDeApi);
    expect(comentariosNuestros(st, 50)).toEqual([]);
  });
  it("el mensaje de la API habla de la API", async () => {
    const st = crearGithub({ issues: [FONDO()], fallo: "hijos" });
    await expect(evento(st, "50")).rejects.toThrow(/HTTP 502/);
  });
});

describe("entradas hostiles", () => {
  it.each(["abc", "1; rm -rf /", "-5", "0", "99999999999", "1e3", "5.5"])("ISSUE_NUMBER «%s» no es un número de issue", async (n) => {
    const st = crearGithub({ issues: [FONDO()] });
    await expect(evento(st, n)).rejects.toThrow(/ISSUE_NUMBER/);
    expect(st.llamadas).toEqual([]);
  });

  it("una ficha hostil (todo a la vez) no tumba el run ni escribe nada del autor", async () => {
    const sucio = "<img src=x onerror=alert(1)> @pablo [x](http://evil.example)";
    const cuerpo = `\`\`\`fondo\nestado: ${sucio}\n${"matiz: x\n".repeat(50)}casos: #99999999999\n\`\`\`\n${"A".repeat(200_000)}`;
    const st = crearGithub({ issues: [FONDO({ body: cuerpo, title: sucio })] });
    const [r] = await evento(st, "50");
    expect(r.control).toBe("falla");
    const c = comentariosNuestros(st, 50)[0].body.split("\n").slice(1).join("\n");
    expect(c).not.toMatch(/[<>]|@pablo|https?:\/\/|\]\(/);
  });
});

describe("ronda 2: solo issues de la casa", () => {
  const rest = (n, labels, asoc) => ({ number: n, labels: etiquetas(...labels), author_association: asoc, body: n === 50 ? bloque(OBS) : "", created_at: "2026-10-12T10:00:00Z" });
  it.each(["NONE", "CONTRIBUTOR", "FIRST_TIMER", undefined])("un fondo de author_association %s: ninguna acción, ningún comentario, ninguna etiqueta", async (asoc) => {
    const st = crearGithub({ issues: [rest(50, ["tipo:fondo", "causa:vigilante-hueco"], asoc)] });
    st.issues.get(50).author_association = asoc;
    expect(await evento(st, "50", "edited", "2026-10-30")).toEqual([]);
    expect(await pasada(st, "2026-10-30")).toEqual([]);
    expect(escrituras(st)).toEqual([]);
    expect(st.comentarios).toEqual({});
  });
  it("un caso de un extraño no se mira, ni revalida el fondo de la casa", async () => {
    const st = crearGithub({ issues: [rest(50, ["tipo:fondo"], "OWNER"), rest(71, ["tipo:caso", "analisis:abierto"], "NONE")], padres: { 71: 50 } });
    expect(await evento(st, "71", "opened")).toEqual([]);
    expect(escrituras(st)).toEqual([]);
  });
  it("un caso de la casa colgado de un fondo de un extraño no actúa sobre el fondo", async () => {
    const st = crearGithub({ issues: [rest(50, ["tipo:fondo"], "NONE"), rest(71, ["tipo:caso", "analisis:abierto"], "OWNER")], padres: { 71: 50 }, hijos: { 50: [71] } });
    const r = await evento(st, "71", "opened");
    expect(r.map((x) => x.issue)).toEqual([71]);
    expect(st.llamadas.filter((l) => l[1] === 50)).toEqual([]);
  });
  it("un issue sin etiqueta de tipo vigilado (aunque sea de la casa) no se mira", async () => {
    const st = crearGithub({ issues: [rest(80, ["bug"], "OWNER")] });
    expect(await evento(st, "80")).toEqual([]);
    expect(escrituras(st)).toEqual([]);
  });
});

describe("ronda 2: la marca solo vale si salió de un run de fondos.yml", () => {
  it("un comentario del bot con la marca y el run de OTRO workflow no se lee ni se edita", async () => {
    const falso = { body: `${MARCA}estado=ok subidos=60 run=999 -->\nfalso`, user: BOT };
    const st = crearGithub({ issues: [FONDO()], comentarios: { 50: [falso] } });
    await evento(st, "50");
    expect(st.comentarios[50][0].body).toContain("falso");
    expect(escrituras(st).filter((l) => l[0] === "editarComentario")).toEqual([]);
    expect(st.comentarios[50]).toHaveLength(2);
  });
  it("sin run en la marca tampoco", async () => {
    const st = crearGithub({ issues: [FONDO()], comentarios: { 50: [{ body: `${MARCA}estado=ok subidos=60 -->`, user: BOT }] } });
    await evento(st, "50");
    expect(st.comentarios[50]).toHaveLength(2);
  });
  it("el comentario de un run nuestro sí se reutiliza", async () => {
    const st = crearGithub({ issues: [FONDO()] });
    await evento(st, "50");
    await evento(st, "50");
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/run=111 -->/);
  });
});

describe("ronda 2: los fondos antiguos no se reabren en bucle (bloqueante)", () => {
  it("fondo cerrado sin ficha con un hijo no-aguanto: una pasada lo reabre; al cerrarlo otra vez a mano, la siguiente lo deja", async () => {
    const st = crearGithub({
      issues: [FONDO({ number: 50, state: "closed", state_reason: "completed", closed_at: "2026-10-15T12:00:00Z", body: "### Arreglo general\n\nviejo", created_at: "2026-10-01T00:00:00Z" })],
      hijos: { 50: [60] },
    });
    st.issues.set(60, { number: 60, state: "open", created_at: "2026-10-10T00:00:00Z", author_association: "OWNER", labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto") });
    await evento(st, "50", "closed");
    expect(st.issues.get(50).state).toBe("open");
    expect(comentariosNuestros(st, 50)[0].body).toMatch(/subidos=60/);
    st.issues.get(50).state = "closed";
    st.issues.get(50).closed_at = "2026-10-16T12:00:00Z";
    await evento(st, "50", "closed");
    expect(st.issues.get(50).state).toBe("closed");
  });
});

describe("ronda 2: el pase diario cubre lo que ningún evento avisa", () => {
  it("reabre un fondo CERRADO con un hijo no-aguanto colgado después, sin evento", async () => {
    const st = crearGithub({
      issues: [FONDO({ state: "closed", state_reason: "completed", closed_at: "2026-10-15T12:00:00Z", body: bloque({ ...OBS, estado: "cerrado-eficaz" }), labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops", "arreglo:test") })],
      hijos: { 50: [61] },
    });
    st.issues.set(61, { number: 61, state: "open", created_at: "2026-10-17T00:00:00Z", author_association: "OWNER", labels: etiquetas("tipo:caso", "analisis:no-aguanto-roto") });
    await pasada(st);
    expect(st.issues.get(50).state).toBe("open");
    expect(leerFicha(st.issues.get(50).body).ficha).toMatchObject({ estado: "reabierto", alcance: "modulo" });
  });
  it("un cerrado sin hijos nuevos no se toca", async () => {
    const st = crearGithub({ issues: [FONDO({ state: "closed", closed_at: "2026-10-15T12:00:00Z" })], hijos: { 50: [] } });
    await pasada(st);
    expect(escrituras(st)).toEqual([]);
  });
  it("revalida un fondo abierto con ficha aunque no esté en observación (hijos colgados sin evento)", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque({ ...BUENA, alcance: "local" }) })], hijos: { 50: [62] } });
    st.issues.set(62, { number: 62, state: "open", created_at: "2026-10-17T00:00:00Z", author_association: "OWNER", labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto") });
    await pasada(st);
    expect(leerFicha(st.issues.get(50).body).ficha.alcance).toBe("modulo");
  });
  it("un fondo abierto sin ficha no recibe comentario del pase diario", async () => {
    const st = crearGithub({ issues: [FONDO({ body: "sin ficha" })] });
    await pasada(st);
    expect(escrituras(st)).toEqual([]);
  });
});

describe("ronda 2: orden de escrituras y reapertura a mano", () => {
  it("el comentario con la intención (subidos) se escribe ANTES de tocar el issue", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque(BUENA) })], hijos: { 50: [60] } });
    st.issues.set(60, { number: 60, state: "open", created_at: "2026-10-16T00:00:00Z", author_association: "OWNER", labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto") });
    await evento(st, "50");
    const orden = escrituras(st).map((l) => l[0]);
    expect(orden.indexOf("crearComentario")).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf("crearComentario")).toBeLessThan(orden.indexOf("editarIssue"));
  });
  it("si se corta al editar el issue, el siguiente run no sube el alcance otra vez", async () => {
    const st = crearGithub({ issues: [FONDO({ body: bloque(BUENA) })], hijos: { 50: [60] } });
    st.issues.set(60, { number: 60, state: "open", created_at: "2026-10-16T00:00:00Z", author_association: "OWNER", labels: etiquetas("tipo:caso", "analisis:no-aguanto-corto") });
    const editar = st.api.editarIssue;
    st.api.editarIssue = async () => {
      throw new ErrorDeApi("PATCH /issues/50: HTTP 502");
    };
    await expect(evento(st, "50")).rejects.toBeInstanceOf(ErrorDeApi);
    st.api.editarIssue = editar;
    await evento(st, "50");
    expect(leerFicha(st.issues.get(50).body).ficha.alcance).toBe("local"); // la subida se perdió, pero no se duplica: el run falló a la vista
  });
  it("reabrir a mano un cerrado-eficaz deja el comentario al día (sin «estado-incoherente»)", async () => {
    const st = crearGithub({
      issues: [FONDO({ labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops", "arreglo:test"), body: bloque({ ...OBS, estado: "cerrado-eficaz" }) })],
      comentarios: { 50: [{ body: `${MARCA}estado=ok run=111 -->\nviejo: cerrado-eficaz`, user: BOT }] },
    });
    await evento(st, "50", "reopened");
    expect(leerFicha(st.issues.get(50).body).ficha.estado).toBe("reabierto");
    expect(comentariosNuestros(st, 50)).toHaveLength(1);
    expect(comentariosNuestros(st, 50)[0].body).not.toMatch(/estado-incoherente|viejo/);
  });
});

describe("apiReal: las rutas que pide", () => {
  const pedidas = [];
  const fetchFn = async (url, init) => {
    pedidas.push({ url, metodo: init.method, cuerpo: init.body });
    return { status: 200, ok: true, json: async () => [] };
  };
  const api = apiReal({ token: "t", repo: "a/b", fetchFn });

  it("existeEnStaging mira la rama staging y codifica cada tramo de la ruta", async () => {
    pedidas.length = 0;
    await api.existeEnStaging("scripts/a b#c.test.js");
    expect(pedidas[0].url).toBe("https://api.github.com/repos/a/b/contents/scripts/a%20b%23c.test.js?ref=staging");
  });
  it("un directorio (la API da 200 y una lista) no cuenta como verificación; un fichero sí", async () => {
    const respuesta = (cuerpo, status = 200) => ({ status, ok: status === 200, json: async () => cuerpo });
    const con = (cuerpo, status) => apiReal({ token: "t", repo: "a/b", fetchFn: async () => respuesta(cuerpo, status) });
    expect(await con([{ type: "file", name: "x.test.js" }]).existeEnStaging("scripts")).toBe(false);
    expect(await con({ type: "dir" }).existeEnStaging("scripts")).toBe(false);
    expect(await con({ type: "submodule" }).existeEnStaging("x")).toBe(false);
    expect(await con({ type: "file", name: "x.test.js" }).existeEnStaging("scripts/x.test.js")).toBe(true);
    expect(await con({}, 404).existeEnStaging("scripts/no-esta.test.js")).toBe(false);
  });
  it("runEsNuestro compara la ruta del workflow del run", async () => {
    const con = (path) => apiReal({ token: "t", repo: "a/b", fetchFn: async () => ({ status: 200, ok: true, json: async () => ({ path }) }) });
    expect(await con(".github/workflows/fondos.yml").runEsNuestro(5)).toBe(true);
    expect(await con(".github/workflows/otro.yml").runEsNuestro(5)).toBe(false);
  });
  it("las etiquetas se borran por su nombre codificado y los fondos se piden por etiqueta", async () => {
    pedidas.length = 0;
    await api.quitarEtiqueta(5, "control:ok");
    await api.fondos();
    expect(pedidas[0]).toMatchObject({ metodo: "DELETE", url: "https://api.github.com/repos/a/b/issues/5/labels/control%3Aok" });
    expect(pedidas[1].url).toContain("labels=tipo%3Afondo");
  });
  it("crear un comentario NO se reintenta (duplicaría), leer sí", async () => {
    let n = 0;
    const falla502 = async () => (n++, { status: 502, ok: false, json: async () => ({}) });
    const a = apiReal({ token: "t", repo: "a/b", fetchFn: falla502, espera: async () => {} });
    await expect(a.crearComentario(1, "x")).rejects.toBeInstanceOf(ErrorDeApi);
    expect(n).toBe(1);
    n = 0;
    await expect(a.issue(1)).rejects.toBeInstanceOf(ErrorDeApi);
    expect(n).toBe(3);
  });
});
