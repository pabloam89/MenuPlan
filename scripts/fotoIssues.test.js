/**
 * La foto publicada de los issues (fondo #326): escritor y lector tienen que coincidir, y quitarla
 * tiene que dejar a los lectores en modo API sin romper nada. Sin red: `gh` es una función falsa.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CAMPOS_ISSUE, CONSULTA, leerIssue } from "./lib/issues.mjs";
import {
  CAMPOS_FOTO, CONSULTA_CAMBIOS, CONSULTA_COMPLETA, CONSULTA_POR_IDS, FICHERO_FOTO, FOTO_VERSION, MAX_MIN_FOTO, PUNTOS_MIN_COMPLETA, RAMA_FOTO,
  REPO, URL_FOTO, actualizarFoto, aplicarCambiosRest, nodosDeFoto, nodosDeFotoVivos, nodosDeLaFoto, validarFoto, vecinosAActualizar,
} from "./lib/fotoIssues.mjs";
import { APIS_GH, lineaGh, registrarFoto, leerLineas } from "./lib/cuotaGh.mjs";

// El workflow vive en .github/workflows/; mientras la App de las sesiones no pueda empujar ahí (le falta el permiso
// `workflows`), espera en ops/workflows-pendientes/ hasta que Pablo lo mueva (skill github, foto-issues.md).
const RUTA_WORKFLOW = [".github/workflows/foto-issues.yml", "ops/workflows-pendientes/foto-issues.yml"].map((r) => new URL(`../${r}`, import.meta.url)).find((u) => existsSync(u));
const T0 = new Date("2026-10-14T12:00:00Z");
const min = (m) => new Date(T0.getTime() + m * 60_000);

/** Un nodo con la forma de CAMPOS_ISSUE. */
const nodo = (number, extra = {}) => ({
  id: `I_${number}`, number, title: `[caso] issue ${number}`, state: "OPEN", createdAt: "2026-10-01T00:00:00Z", closedAt: null, body: `cuerpo ${number}`,
  authorAssociation: "OWNER", labels: { nodes: [{ name: "tipo:caso" }] }, assignees: { nodes: [] },
  reaperturas: { totalCount: 0, nodes: [] }, closedByPullRequestsReferences: { nodes: [] }, comments: { totalCount: 0, nodes: [] },
  parent: null, subIssues: { nodes: [] }, ...extra,
});

/**
 * `gh` falso: sirve la base `mundo` (lista de nodos) según la consulta que le llega y cuenta los puntos como GitHub
 * (1 por cambios, 1 por id, 54 por página completa).
 */
function ghFalso(mundo, { cambiados = [], remaining = 4000 } = {}) {
  const llamadas = [];
  const gh = (consulta, vars = {}) => {
    llamadas.push({ consulta, vars });
    if (consulta === CONSULTA_CAMBIOS) {
      return { rateLimit: { cost: 1, remaining }, repository: { issues: { pageInfo: { hasNextPage: false }, nodes: mundo.filter((n) => cambiados.includes(n.number)).map((n) => ({ id: n.id, number: n.number, updatedAt: "x" })) } } };
    }
    if (consulta === CONSULTA_POR_IDS) {
      const ids = vars["ids[]"];
      return { rateLimit: { cost: ids.length, remaining }, nodes: ids.map((id) => mundo.find((n) => n.id === id) ?? null) };
    }
    if (consulta === CONSULTA_COMPLETA) {
      return { rateLimit: { cost: 54, remaining }, repository: { issues: { pageInfo: { hasNextPage: false }, nodes: mundo } } };
    }
    if (/rateLimit \{ remaining \}/.test(consulta)) return { rateLimit: { remaining } };
    throw new Error("consulta inesperada");
  };
  return { gh, llamadas };
}

describe("el formato: escritor y lector comparten versión y campos", () => {
  it("la foto que escribe el escritor la acepta el lector, con los mismos nodos", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    expect(foto.version).toBe(FOTO_VERSION);
    for (const c of CAMPOS_FOTO) expect(foto).toHaveProperty(c);
    expect(validarFoto(foto)).toEqual({ ok: true, motivo: null });
    const leida = nodosDeFoto(JSON.stringify(foto), { ahora: min(1) });
    expect(leida.nodos.map((n) => n.number)).toEqual([3, 2, 1]);
    // y lo que sale sirve a quien ya usaba leerIssue
    expect(leerIssue(leida.nodos[0])).toMatchObject({ number: 3, state: "OPEN", labels: [{ name: "tipo:caso" }] });
  });

  it("una versión distinta, un campo que falta o un total que no cuadra no se aceptan", () => {
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso([nodo(1)]).gh, ahora: T0 });
    expect(validarFoto({ ...foto, version: FOTO_VERSION + 1 }).ok).toBe(false);
    for (const c of CAMPOS_FOTO) {
      const rota = { ...foto };
      delete rota[c];
      expect(validarFoto(rota).ok, `sin ${c}`).toBe(false);
    }
    expect(validarFoto({ ...foto, total: 5 }).ok).toBe(false);
    expect(validarFoto({ ...foto, nodos: [{ number: "x" }], total: 1 }).ok).toBe(false);
    expect(validarFoto(null).ok).toBe(false);
  });

  it("una foto de más de 15 minutos, del futuro o que no es JSON no vale", () => {
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso([nodo(1)]).gh, ahora: T0 });
    const texto = JSON.stringify(foto);
    expect(MAX_MIN_FOTO).toBe(15);
    expect(nodosDeFoto(texto, { ahora: min(14) }).nodos).not.toBeNull();
    expect(nodosDeFoto(texto, { ahora: min(16) })).toMatchObject({ nodos: null, motivo: expect.stringContaining("16 min") });
    expect(nodosDeFoto(texto, { ahora: min(-10) }).nodos).toBeNull();
    expect(nodosDeFoto("<html>", { ahora: T0 }).nodos).toBeNull();
  });

  it("la URL y la rama que lee el lector son las que publica el workflow", () => {
    const wf = parse(readFileSync(RUTA_WORKFLOW, "utf8"));
    expect(wf.env.RAMA_FOTO).toBe(RAMA_FOTO);
    expect(URL_FOTO).toBe(`https://raw.githubusercontent.com/${REPO}/${RAMA_FOTO}/${FICHERO_FOTO}`);
    const pasos = JSON.stringify(wf.jobs.foto.steps);
    expect(pasos).toContain(FICHERO_FOTO);
    expect(pasos).toContain("scripts/foto-issues.mjs");
  });

  it("la consulta de la foto pide los mismos campos que la consulta completa de issues", () => {
    expect(CONSULTA).toContain(CAMPOS_ISSUE);
    expect(CONSULTA_POR_IDS).toContain(CAMPOS_ISSUE);
    expect(CONSULTA_COMPLETA).toContain(CAMPOS_ISSUE);
  });
});

describe("el escritor: completa la primera vez, incremental después", () => {
  it("sin foto previa lee todo; con una de otra versión, también", () => {
    const mundo = [nodo(2), nodo(1)];
    const a = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    expect(a.resumen).toMatchObject({ modo: "completa", cambiados: 2, puntos: 54 });
    const b = actualizarFoto({ previa: { ...a.foto, version: 99 }, gh: ghFalso(mundo).gh, ahora: min(5) });
    expect(b.resumen.modo).toBe("completa");
  });

  it("no empieza una lectura completa si no queda cupo", () => {
    expect(() => actualizarFoto({ previa: null, gh: ghFalso([nodo(1)], { remaining: PUNTOS_MIN_COMPLETA - 1 }).gh, ahora: T0 })).toThrow(/puntos/);
  });

  it("incremental: sin cambios solo gasta la consulta de cambios y la rotación", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    const f = ghFalso(mundo);
    const r = actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 2 });
    expect(r.resumen).toMatchObject({ modo: "incremental", cambiados: 0, rotados: 2 });
    expect(r.resumen.puntos).toBe(1 + 2);
    // nada de páginas completas
    expect(f.llamadas.some((l) => l.consulta === CONSULTA_COMPLETA)).toBe(false);
    expect(r.foto.nodos.map((n) => n.number)).toEqual([3, 2, 1]);
  });

  it("un issue cambiado se actualiza, uno nuevo se añade y uno borrado desaparece", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    const cambiado = nodo(2, { title: "[caso] cambiado", state: "CLOSED" });
    const nuevo = nodo(4);
    // el 1 ya no existe en el mundo (borrado): la rotación lo pide y no vuelve
    const mundo2 = [nuevo, nodo(3), cambiado];
    const r = actualizarFoto({ previa: foto, gh: ghFalso(mundo2, { cambiados: [2, 4] }).gh, ahora: min(5), rotacion: 10 });
    expect(r.foto.nodos.map((n) => n.number)).toEqual([4, 3, 2]);
    expect(r.foto.nodos.find((n) => n.number === 2).title).toBe("[caso] cambiado");
    expect(r.resumen).toMatchObject({ cambiados: 2, borrados: 1 });
    expect(r.foto.total).toBe(3);
  });

  it("al cerrarse un hijo se vuelve a leer su padre (guarda el estado de los hijos); si no cambió nada que copien, no", () => {
    const padre = nodo(10, { subIssues: { nodes: [{ id: "I_11", number: 11, state: "OPEN", labels: { nodes: [] } }] } });
    const hijo = nodo(11, { parent: { id: "I_10", number: 10, state: "OPEN", labels: { nodes: [] } } });
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso([hijo, padre]).gh, ahora: T0 });
    const hijoCerrado = { ...hijo, state: "CLOSED" };
    const padreAlDia = { ...padre, subIssues: { nodes: [{ id: "I_11", number: 11, state: "CLOSED", labels: { nodes: [] } }] } };
    const r = actualizarFoto({ previa: foto, gh: ghFalso([hijoCerrado, padreAlDia], { cambiados: [11] }).gh, ahora: min(5), rotacion: 0 });
    expect(r.resumen.vecinos).toBe(1);
    expect(r.foto.nodos.find((n) => n.number === 10).subIssues.nodes[0].state).toBe("CLOSED");
    // un comentario nuevo en el hijo (mismo estado y etiquetas) no arrastra al padre
    expect(vecinosAActualizar(hijo, { ...hijo, comments: { totalCount: 1, nodes: [] } }).size).toBe(0);
    // cambiar de padre arrastra a los dos
    expect([...vecinosAActualizar(hijo, { ...hijo, parent: { id: "I_20", number: 20, state: "OPEN", labels: { nodes: [] } } })].sort()).toEqual(["I_10", "I_20"]);
  });

  it("la rotación empieza por el de lectura más antigua", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const { foto } = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    foto.refrescados = { 1: "2026-10-14T11:00:00.000Z", 2: "2026-10-14T11:30:00.000Z", 3: "2026-10-14T11:59:00.000Z" };
    const f = ghFalso(mundo);
    actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 1 });
    expect(f.llamadas.find((l) => l.consulta === CONSULTA_POR_IDS).vars["ids[]"]).toEqual(["I_1"]);
  });
});

describe("el lector: la foto puesta al día, y la API si no sirve", () => {
  const textoFoto = (nodos, ahora = T0) => JSON.stringify({ version: FOTO_VERSION, generado_en: ahora.toISOString(), completa_en: ahora.toISOString(), total: nodos.length, refrescados: {}, nodos });

  it("pone encima lo que cambió después de la foto (estado, etiquetas, nuevo) y salta los PR", () => {
    const base = [nodo(2), nodo(1)];
    const cambios = [
      { number: 2, node_id: "I_2", title: "[caso] t", state: "closed", created_at: "2026-10-01T00:00:00Z", closed_at: "2026-10-14T12:01:00Z", body: "nuevo", labels: [{ name: "area:ops" }], assignees: [{ login: "pabloam89" }], author_association: "OWNER" },
      { number: 3, node_id: "I_3", title: "[caso] nuevo", state: "open", created_at: "2026-10-14T12:02:00Z", body: null, labels: [], assignees: [] },
      { number: 4, node_id: "PR_4", pull_request: {}, title: "un PR", state: "open" },
    ];
    const r = aplicarCambiosRest(base, cambios);
    expect(r.map((n) => n.number)).toEqual([3, 2, 1]);
    expect(leerIssue(r.find((n) => n.number === 2))).toMatchObject({ state: "CLOSED", asignados: ["pabloam89"], labels: [{ name: "area:ops" }] });
    expect(leerIssue(r.find((n) => n.number === 3))).toMatchObject({ state: "OPEN", prs: [], hijos: [] });
  });

  it("devuelve la foto viva y, si no se pudo poner al día, la foto sola (leer) o nada (escribir)", () => {
    const traerTexto = () => textoFoto([nodo(1)]);
    const ok = nodosDeFotoVivos({ traerTexto, traerCambios: () => [], ahora: min(3) });
    expect(ok).toMatchObject({ vivo: true });
    const sinRest = () => { throw new Error("sin REST"); };
    expect(nodosDeFotoVivos({ traerTexto, traerCambios: sinRest, ahora: min(3) })).toMatchObject({ vivo: false, nodos: expect.any(Array) });
    expect(nodosDeFotoVivos({ traerTexto, traerCambios: sinRest, ahora: min(3), exigirVivo: true }).nodos).toBeNull();
  });

  it("LIMPIEZA: sin la rama, con otra versión o vieja, el lector no lanza y dice «a la API»", () => {
    const sinRama = () => { throw new Error("HTTP 404"); };
    expect(nodosDeFotoVivos({ traerTexto: sinRama, ahora: T0 })).toMatchObject({ nodos: null, motivo: expect.stringContaining("404") });
    const otra = JSON.stringify({ version: FOTO_VERSION + 1, generado_en: T0.toISOString(), nodos: [] });
    expect(nodosDeFotoVivos({ traerTexto: () => otra, ahora: T0 }).nodos).toBeNull();
    expect(nodosDeFotoVivos({ traerTexto: () => textoFoto([nodo(1)]), ahora: min(60) }).nodos).toBeNull();
  });

  it("nodosDeLaFoto: lee de un fichero, cuenta el origen foto, y con MENUPLAN_FOTO=0 o sin foto devuelve null", () => {
    const dir = mkdtempSync(join(tmpdir(), "foto-test-"));
    try {
      const ruta = join(dir, "issues.json");
      const ahora = new Date();
      writeFileSync(ruta, textoFoto([nodo(1)], ahora));
      const gh = () => "[]";
      const avisos = [];
      const env = { MENUPLAN_FOTO_ARCHIVO: ruta, MENUPLAN_CUOTA_DIR: dir };
      process.env.MENUPLAN_CUOTA_DIR = dir;
      expect(nodosDeLaFoto({ gh, caller: "issues", env, avisar: (m) => avisos.push(m) })).toHaveLength(1);
      expect(nodosDeLaFoto({ gh, caller: "issues", env: { ...env, MENUPLAN_FOTO: "0" } })).toBeNull();
      expect(nodosDeLaFoto({ gh, caller: "issues", env: { MENUPLAN_FOTO_ARCHIVO: join(dir, "no-existe.json") }, avisar: (m) => avisos.push(m) })).toBeNull();
      expect(avisos.at(-1)).toMatch(/voy a la API/);
      const lineas = leerLineas(readFileSync(join(dir, "gh.log"), "utf8"));
      expect(lineas.map((l) => `${l.api}:${l.resultado}`)).toEqual(["foto:ok", "foto:error"]);
      expect(lineas.every((l) => l.puntos === 0)).toBe(true);
    } finally {
      delete process.env.MENUPLAN_CUOTA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("la medición de la cuota conoce el origen foto", () => {
  it("foto es un valor del vocabulario, con su línea contable", () => {
    expect(APIS_GH).toContain("foto");
    expect(lineaGh("issues", "foto", { identidad: "app", sesion: "abc123", puntos: 0, medida: "nada", resultado: "ok", intento: 1 }))
      .toBe("gh: caller=issues api=foto identidad=app sesion=abc123 puntos=0 medida=nada resultado=ok intento=1");
    expect(typeof registrarFoto).toBe("function");
  });
});

describe("el workflow", () => {
  const texto = readFileSync(RUTA_WORKFLOW, "utf8");
  const wf = parse(texto);

  it("permisos mínimos: contents write e issues read, y nada más", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.jobs.foto.permissions).toEqual({ contents: "write", issues: "read" });
  });

  it("usa el token del propio workflow: ningún secreto ni la App de las sesiones", () => {
    const activo = JSON.stringify(wf); // sin los comentarios, que sí nombran a la App
    expect(activo).not.toMatch(/secrets\./);
    expect(activo).not.toMatch(/homenu-sesiones|APP_KEY|pull_request_target/);
    expect(activo).toContain("github.token");
  });

  it("acciones fijadas por SHA y el código sale de staging", () => {
    const usos = wf.jobs.foto.steps.filter((s) => s.uses).map((s) => s.uses);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
    expect(wf.jobs.foto.steps[0].with.ref).toBe("staging");
  });

  it("nada del texto de un issue ni del evento entra en un run: solo variables de entorno", () => {
    for (const paso of wf.jobs.foto.steps.filter((s) => s.run)) {
      expect(paso.run, paso.name).not.toMatch(/\$\{\{/);
      expect(paso.run, paso.name).not.toMatch(/github\.event/);
    }
  });

  it("se dispara por el reloj y por los cambios de un issue, de uno en uno", () => {
    expect(Object.keys(wf.on)).toEqual(expect.arrayContaining(["schedule", "issues", "issue_comment", "workflow_dispatch"]));
    expect(wf.concurrency).toMatchObject({ group: "foto-issues", "cancel-in-progress": false });
  });
});
