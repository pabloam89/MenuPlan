/**
 * La foto publicada de los issues (fondo #326): escritor y lector tienen que coincidir, y quitarla
 * tiene que dejar a los lectores en modo API sin romper nada. Sin red: `gh` es un doble de GitHub que
 * contesta como `gh api graphql` de verdad (texto JSON; con `errors`, sale con 1 y deja la respuesta en stdout).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CAMPOS_ISSUE, CONSULTA, leerIssue } from "./lib/issues.mjs";
import {
  CAMPOS_FOTO, CONSULTA_LISTADO, CONSULTA_POR_IDS, FICHERO_FOTO, FOTO_VERSION, MAX_MIN_AVISO, MAX_MIN_FOTO, POR_PAGINA_LISTADO, REPO, RESERVA_PUNTOS, TAG_FOTO,
  CODIGO_HIJO_FETCH, SUBIDOR_FOTO, URL_FOTO, actualizarFoto, assetDeConfianza, aplicarCambiosRest, datosDeGraphql, traerTextoSync, fotoPermitida, guardarEstadoFoto, leerEstadoFoto, lineaFoto, nodosDeFoto, nodosDeFotoVivos,
  nodosDeLaFoto, validarFoto, vecinosAActualizar,
} from "./lib/fotoIssues.mjs";
import { APIS_GH, lineaGh, registrarFoto, leerLineas } from "./lib/cuotaGh.mjs";

// El workflow que escribe la foto (activo desde el 14 oct 2026, PR #824; skill github, foto-issues.md).
// La App de las sesiones no puede empujar a .github/workflows/: un cambio espera en
// ops/workflows-pendientes/ hasta que Pablo lo mueve (#844), y mientras tanto se prueba el pendiente.
const RUTA_PENDIENTE = new URL("../ops/workflows-pendientes/foto-issues.yml", import.meta.url);
const RUTA_WORKFLOW = existsSync(RUTA_PENDIENTE) ? RUTA_PENDIENTE : new URL("../.github/workflows/foto-issues.yml", import.meta.url);
const T0 = new Date("2026-10-14T12:00:00Z");
const min = (m) => new Date(T0.getTime() + m * 60_000);

/** Un nodo con la forma de CAMPOS_ISSUE. */
const nodo = (number, extra = {}) => ({
  id: `I_${number}`, number, title: `[caso] issue ${number}`, state: "OPEN", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", closedAt: null, body: `cuerpo ${number}`,
  authorAssociation: "OWNER", labels: { nodes: [{ name: "tipo:caso" }] }, assignees: { nodes: [] },
  reaperturas: { totalCount: 0, nodes: [] }, closedByPullRequestsReferences: { nodes: [] }, comments: { totalCount: 0, nodes: [] },
  parent: null, subIssues: { nodes: [] }, ...extra,
});
const padreDe = (id, number) => ({ id, number, state: "OPEN", labels: { nodes: [] } });

/**
 * Doble de GitHub: sirve la base `mundo` (lista de nodos) según la consulta, cobra los puntos como GitHub (1 por página del
 * listado, 1 por id) y los descuenta de `remaining`. Un id que no existe sale como en GitHub: `null` en `nodes` y un error
 * NOT_FOUND con su `path`, y `gh` sale con 1 dejando la respuesta en stdout (comprobado el 14 oct 2026 contra la API real).
 * `fallo` fuerza otro error de GraphQL (p. ej. RATE_LIMITED) en la consulta por ids.
 */
function ghFalso(mundo, { remaining = 4000, fallo = null } = {}) {
  const llamadas = [];
  let quedan = remaining;
  const responder = (cuerpo) => {
    const texto = JSON.stringify(cuerpo);
    if (cuerpo.errors?.length) {
      const e = new Error(`gh: ${cuerpo.errors[0].message}`);
      e.status = 1;
      e.stdout = texto;
      throw e;
    }
    return texto;
  };
  const gh = (consulta, vars = {}) => {
    llamadas.push({ consulta, vars });
    if (consulta === CONSULTA_LISTADO) {
      quedan -= 1;
      const desde = vars.cursor ? Number(vars.cursor) : 0;
      const pagina = mundo.slice(desde, desde + POR_PAGINA_LISTADO);
      const mas = desde + POR_PAGINA_LISTADO < mundo.length;
      return responder({ data: { rateLimit: { cost: 1, remaining: quedan }, repository: { issues: {
        pageInfo: { hasNextPage: mas, endCursor: mas ? String(desde + POR_PAGINA_LISTADO) : null },
        nodes: pagina.map((n) => ({ id: n.id, number: n.number, updatedAt: n.updatedAt, parent: n.parent ? { id: n.parent.id } : null })),
      } } } });
    }
    if (consulta === CONSULTA_POR_IDS) {
      const ids = vars["ids[]"];
      if (fallo) return responder({ data: null, errors: [{ type: fallo, message: `fallo ${fallo}` }] });
      quedan -= ids.length;
      const nodes = ids.map((id) => mundo.find((n) => n.id === id) ?? null);
      const errors = nodes.flatMap((n, i) => (n ? [] : [{ type: "NOT_FOUND", path: ["nodes", i], locations: [{ line: 1, column: 34 }], message: `Could not resolve to a node with the global id of '${ids[i]}'` }]));
      return responder({ data: { rateLimit: { cost: ids.length, remaining: quedan }, nodes }, ...(errors.length ? { errors } : {}) });
    }
    throw new Error("consulta inesperada");
  };
  return { gh, llamadas, idsPedidos: () => llamadas.filter((l) => l.consulta === CONSULTA_POR_IDS).flatMap((l) => l.vars["ids[]"]) };
}

const primeraFoto = (mundo) => actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 }).foto;

describe("el formato: escritor y lector comparten versión y campos", () => {
  it("la foto que escribe el escritor la acepta el lector, con los mismos nodos", () => {
    const foto = primeraFoto([nodo(3), nodo(2), nodo(1)]);
    expect(foto.version).toBe(FOTO_VERSION);
    for (const c of CAMPOS_FOTO) expect(foto).toHaveProperty(c);
    expect(validarFoto(foto)).toEqual({ ok: true, motivo: null });
    expect(foto).toMatchObject({ completa: true, pendientes: [] });
    const leida = nodosDeFoto(JSON.stringify(foto), { ahora: min(1) });
    expect(leida.nodos.map((n) => n.number)).toEqual([3, 2, 1]);
    // y lo que sale sirve a quien ya usaba leerIssue
    expect(leerIssue(leida.nodos[0])).toMatchObject({ number: 3, state: "OPEN", labels: [{ name: "tipo:caso" }] });
  });

  it("una versión distinta, un campo que falta o un total que no cuadra no se aceptan", () => {
    const foto = primeraFoto([nodo(1)]);
    expect(validarFoto({ ...foto, version: FOTO_VERSION + 1 }).ok).toBe(false);
    for (const c of CAMPOS_FOTO) {
      const rota = { ...foto };
      delete rota[c];
      expect(validarFoto(rota).ok, `sin ${c}`).toBe(false);
    }
    expect(validarFoto({ ...foto, total: 5 }).ok).toBe(false);
    expect(validarFoto({ ...foto, nodos: [{ number: "x" }], total: 1 }).ok).toBe(false);
    expect(validarFoto({ ...foto, completa: "si" }).ok).toBe(false);
    expect(validarFoto({ ...foto, al_dia_desde: "ayer" }).ok).toBe(false);
    expect(validarFoto({ ...foto, al_dia_desde: min(1).toISOString() }).ok, "al día después de generarse").toBe(false);
    expect(validarFoto(null).ok).toBe(false);
  });

  it("una foto de más de 15 minutos, del futuro, a medias o que no es JSON no vale", () => {
    const foto = primeraFoto([nodo(1)]);
    const texto = JSON.stringify(foto);
    expect(MAX_MIN_FOTO).toBe(15);
    expect(nodosDeFoto(texto, { ahora: min(14) }).nodos).not.toBeNull();
    expect(nodosDeFoto(texto, { ahora: min(16) })).toMatchObject({ nodos: null, motivo: expect.stringContaining("16 min"), generado_en: T0.toISOString() });
    expect(nodosDeFoto(texto, { ahora: min(-10) }).nodos).toBeNull();
    expect(nodosDeFoto(JSON.stringify({ ...foto, completa: false, pendientes: ["I_9"] }), { ahora: min(1) })).toMatchObject({ nodos: null, motivo: expect.stringContaining("a medias") });
    expect(nodosDeFoto("<html>", { ahora: T0 }).nodos).toBeNull();
  });

  it("la URL y la release que lee el lector son las que publica el workflow", () => {
    const wf = parse(readFileSync(RUTA_WORKFLOW, "utf8"));
    expect(wf.env.TAG_FOTO).toBe(TAG_FOTO);
    expect(URL_FOTO).toBe(`https://github.com/${REPO}/releases/download/${TAG_FOTO}/${FICHERO_FOTO}`);
    const pasos = JSON.stringify(Object.values(wf.jobs).flatMap((j) => j.steps));
    expect(pasos).toContain(FICHERO_FOTO);
    expect(pasos).toContain("scripts/foto-issues.mjs");
  });

  it("la consulta de la foto pide los mismos campos que la consulta completa de issues, con updatedAt", () => {
    expect(CONSULTA).toContain(CAMPOS_ISSUE);
    expect(CONSULTA_POR_IDS).toContain(CAMPOS_ISSUE);
    expect(CAMPOS_ISSUE).toMatch(/\bupdatedAt\b/);
    expect(CONSULTA_LISTADO).toMatch(/parent \{ id \}/);
  });
});

describe("el escritor: listado ligero y, por id, solo lo que cambió", () => {
  it("sin foto previa (o de otra versión) lee todo por id: 1 punto por página del listado y 1 por id", () => {
    const mundo = [nodo(2), nodo(1)];
    const a = actualizarFoto({ previa: null, gh: ghFalso(mundo).gh, ahora: T0 });
    expect(a.resumen).toMatchObject({ modo: "desde-cero", nuevos: 2, puntos: 1 + 2 });
    const b = actualizarFoto({ previa: { ...a.foto, version: 99 }, gh: ghFalso(mundo).gh, ahora: min(5) });
    expect(b.resumen.modo).toBe("desde-cero");
  });

  it("incremental: sin cambios solo gasta el listado y la rotación", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const foto = primeraFoto(mundo);
    const f = ghFalso(mundo);
    const r = actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 2 });
    expect(r.resumen).toMatchObject({ modo: "incremental", cambiados: 0, nuevos: 0, de_padre: 0, rotados: 2 });
    expect(r.resumen.puntos).toBe(1 + 2);
    expect(r.foto.nodos.map((n) => n.number)).toEqual([3, 2, 1]);
  });

  it("un issue cambiado (updatedAt distinto) se relee, uno nuevo se añade y uno borrado desaparece sin pedir su id", () => {
    const foto = primeraFoto([nodo(3), nodo(2), nodo(1)]);
    const cambiado = nodo(2, { title: "[caso] cambiado", state: "CLOSED", updatedAt: "2026-10-14T12:03:00Z" });
    // el 1 ya no existe en el mundo (borrado o trasladado): el listado no lo trae
    const f = ghFalso([nodo(4), nodo(3), cambiado]);
    const r = actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 0 });
    expect(r.foto.nodos.map((n) => n.number)).toEqual([4, 3, 2]);
    expect(r.foto.nodos.find((n) => n.number === 2).title).toBe("[caso] cambiado");
    expect(r.resumen).toMatchObject({ cambiados: 1, nuevos: 1, borrados: 1 });
    expect(f.idsPedidos().sort()).toEqual(["I_2", "I_4"]);
    expect(r.foto).toMatchObject({ total: 3, completa: true });
  });

  it("ALTO: un cambio de padre que no mueve updatedAt (addSubIssue) se ve y relee al hijo y a los dos padres", () => {
    const viejo = nodo(10, { subIssues: { nodes: [{ id: "I_12", number: 12, state: "OPEN", labels: { nodes: [] } }] } });
    const nuevoPadre = nodo(11);
    const hijo = nodo(12, { parent: padreDe("I_10", 10) });
    const foto = primeraFoto([hijo, nuevoPadre, viejo]);
    // Colgado de #11: mismas fechas que antes (medido con #768 y #176), solo cambia parent.
    const mundo2 = [
      { ...hijo, parent: padreDe("I_11", 11) },
      { ...nuevoPadre, subIssues: { nodes: [{ id: "I_12", number: 12, state: "OPEN", labels: { nodes: [] } }] } },
      { ...viejo, subIssues: { nodes: [] } },
    ];
    const f = ghFalso(mundo2);
    const r = actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 0 });
    expect(r.resumen).toMatchObject({ cambiados: 0, de_padre: 1 });
    expect(f.idsPedidos().sort()).toEqual(["I_10", "I_11", "I_12"]);
    const por = (n) => leerIssue(r.foto.nodos.find((x) => x.number === n));
    expect(por(12).padre?.number).toBe(11);
    expect(por(11).hijos.map((h) => h.number)).toEqual([12]);
    expect(por(10).hijos).toEqual([]);
  });

  it("ALTO: un id que GitHub ya no encuentra (NOT_FOUND con su path) se quita y no tumba la pasada", () => {
    const foto = primeraFoto([nodo(2), nodo(1)]);
    // El 2 sale en el listado como cambiado pero, al pedirlo por id, ya no existe (borrado entre medias): GitHub contesta con errors.
    const listado = ghFalso([nodo(2, { updatedAt: "2026-10-14T12:01:00Z" }), nodo(1)]);
    const porIds = ghFalso([nodo(1)]);
    const gh = (c, v) => (c === CONSULTA_POR_IDS ? porIds.gh(c, v) : listado.gh(c, v));
    const r = actualizarFoto({ previa: foto, gh, ahora: min(5), rotacion: 0 });
    expect(porIds.idsPedidos()).toEqual(["I_2"]);
    expect(r.foto.nodos.map((n) => n.number)).toEqual([1]);
    expect(r.resumen.borrados).toBe(1);
    expect(r.foto.completa).toBe(true);
  });

  it("cualquier otro error de GraphQL sí para la pasada", () => {
    const foto = primeraFoto([nodo(1)]);
    const f = ghFalso([nodo(1, { updatedAt: "2026-10-14T12:01:00Z" })], { fallo: "RATE_LIMITED" });
    expect(() => actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5) })).toThrow(/RATE_LIMITED/);
  });

  it("datosDeGraphql lee la respuesta real de GitHub a un id inexistente (gh sale con 1)", () => {
    // Copiada de `gh api graphql` el 14 oct 2026.
    const real = '{"data":{"rateLimit":{"cost":1,"remaining":3263},"nodes":[null]},"errors":[{"type":"NOT_FOUND","path":["nodes",0],"locations":[{"line":1,"column":34}],"message":"Could not resolve to a node with the global id of \'I_kwDONOEXISTE00\'"}]}';
    const comoGh = () => { const e = new Error("gh: Could not resolve"); e.status = 1; e.stdout = real; throw e; };
    expect(datosDeGraphql(comoGh)).toMatchObject({ nodes: [null] });
    const sinStdout = () => { const e = new Error("red caída"); e.stdout = ""; throw e; };
    expect(() => datosDeGraphql(sinStdout)).toThrow(/red caída/);
    expect(() => datosDeGraphql(() => '{"errors":[{"type":"NOT_FOUND","path":["repository"],"message":"no repo"}]}')).toThrow(/no repo/);
  });

  it("MEDIO: con más issues de los que caben en el cupo, lee lo que cabe, deja el resto pendiente y sigue en la pasada siguiente", () => {
    const mundo = Array.from({ length: 900 }, (_, i) => nodo(900 - i));
    // 600 puntos: el listado gasta 9 y la reserva deja 100 sin tocar.
    const a = actualizarFoto({ previa: null, gh: ghFalso(mundo, { remaining: 600 }).gh, ahora: T0 });
    expect(a.resumen.puntos).toBeLessThanOrEqual(600 - RESERVA_PUNTOS);
    expect(a.foto.completa).toBe(false);
    expect(a.foto.pendientes.length).toBe(900 - a.foto.total);
    expect(a.foto.total).toBeGreaterThan(400);
    expect(nodosDeFoto(JSON.stringify(a.foto), { ahora: min(1) }).nodos).toBeNull();
    // la hora siguiente, con cupo nuevo, la acaba
    const b = actualizarFoto({ previa: a.foto, gh: ghFalso(mundo, { remaining: 1000 }).gh, ahora: min(60) });
    expect(b.foto).toMatchObject({ completa: true, total: 900, pendientes: [] });
    expect(nodosDeFoto(JSON.stringify(b.foto), { ahora: min(61) }).nodos).toHaveLength(900);
  });

  it("MEDIO: mil issues cambiados de golpe no lanzan: lo que no cabe queda pendiente", () => {
    const mundo = Array.from({ length: 1100 }, (_, i) => nodo(1100 - i));
    const foto = actualizarFoto({ previa: null, gh: ghFalso(mundo, { remaining: 5000 }).gh, ahora: T0 }).foto;
    const mundo2 = mundo.map((n) => ({ ...n, updatedAt: "2026-10-14T12:01:00Z" }));
    const r = actualizarFoto({ previa: foto, gh: ghFalso(mundo2, { remaining: 1000 }).gh, ahora: min(5) });
    expect(r.resumen.cambiados).toBe(1100);
    expect(r.resumen.pendientes).toBeGreaterThan(0);
    expect(r.foto.completa).toBe(true); // están todos, solo que algunos sin releer aún
    expect(r.resumen.puntos).toBeLessThanOrEqual(1000 - RESERVA_PUNTOS);
    // pero la foto NO está al día desde esta pasada: los pendientes llevan los datos de la anterior
    expect(r.foto.generado_en).toBe(min(5).toISOString());
    expect(r.foto.al_dia_desde).toBe(T0.toISOString());
  });

  it("MEDIO: con pendientes viejos, el lector pide a la REST desde la última pasada completa, no desde la última pasada", () => {
    const mundo = Array.from({ length: 1100 }, (_, i) => nodo(1100 - i));
    const foto = actualizarFoto({ previa: null, gh: ghFalso(mundo, { remaining: 5000 }).gh, ahora: T0 }).foto;
    const mundo2 = mundo.map((n) => ({ ...n, updatedAt: "2026-10-14T12:01:00Z", state: "CLOSED" }));
    const a = actualizarFoto({ previa: foto, gh: ghFalso(mundo2, { remaining: 1000 }).gh, ahora: min(5) }).foto;
    expect(a.pendientes.length).toBeGreaterThan(0);
    // una pasada más con pendientes: la marca no avanza
    const b = actualizarFoto({ previa: a, gh: ghFalso(mundo2, { remaining: 120 }).gh, ahora: min(10) }).foto;
    expect(b.pendientes.length).toBeGreaterThan(0);
    expect(b.al_dia_desde).toBe(T0.toISOString());
    const desdes = [];
    const r = nodosDeFotoVivos({ traerTexto: () => JSON.stringify(b), traerCambios: (d) => { desdes.push(d); return []; }, ahora: min(11) });
    expect(r.nodos).not.toBeNull();
    // el issue cerrado a las 12:01 (pendiente) tiene que entrar en lo que se pide a la REST
    expect(Date.parse(desdes[0])).toBeLessThan(Date.parse("2026-10-14T12:01:00Z"));
    // y si la REST no contesta, una foto con pendientes de hace más de 15 min no vale
    const sinRest = () => { throw new Error("sin REST"); };
    expect(nodosDeFotoVivos({ traerTexto: () => JSON.stringify(b), traerCambios: sinRest, ahora: min(16) })).toMatchObject({ nodos: null, motivo: expect.stringContaining("sin releer") });
    // cuando se acaban los pendientes, la marca alcanza a la pasada
    const c = actualizarFoto({ previa: b, gh: ghFalso(mundo2, { remaining: 5000 }).gh, ahora: min(60) }).foto;
    expect(c.pendientes).toEqual([]);
    expect(c.al_dia_desde).toBe(min(60).toISOString());
  });

  it("la rotación solo gasta lo que cabe", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const foto = primeraFoto(mundo);
    // 1 del listado; quedan 102, menos la reserva de 100: caben 2 de rotación.
    const r = actualizarFoto({ previa: foto, gh: ghFalso(mundo, { remaining: 103 }).gh, ahora: min(5), rotacion: 8 });
    expect(r.resumen.rotados).toBe(2);
  });

  it("al cerrarse un hijo se vuelve a leer su padre (guarda el estado de los hijos); si no cambió nada que copien, no", () => {
    const padre = nodo(10, { subIssues: { nodes: [{ id: "I_11", number: 11, state: "OPEN", labels: { nodes: [] } }] } });
    const hijo = nodo(11, { parent: padreDe("I_10", 10) });
    const foto = primeraFoto([hijo, padre]);
    const hijoCerrado = { ...hijo, state: "CLOSED", updatedAt: "2026-10-14T12:02:00Z" };
    const padreAlDia = { ...padre, subIssues: { nodes: [{ id: "I_11", number: 11, state: "CLOSED", labels: { nodes: [] } }] } };
    const r = actualizarFoto({ previa: foto, gh: ghFalso([hijoCerrado, padreAlDia]).gh, ahora: min(5), rotacion: 0 });
    expect(r.resumen.vecinos).toBe(1);
    expect(r.foto.nodos.find((n) => n.number === 10).subIssues.nodes[0].state).toBe("CLOSED");
    // un comentario nuevo en el hijo (mismo estado y etiquetas) no arrastra al padre
    expect(vecinosAActualizar(hijo, { ...hijo, comments: { totalCount: 1, nodes: [] } }).size).toBe(0);
    // cambiar de padre arrastra a los dos
    expect([...vecinosAActualizar(hijo, { ...hijo, parent: padreDe("I_20", 20) })].sort()).toEqual(["I_10", "I_20"]);
  });

  it("la rotación empieza por el de lectura más antigua", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    const foto = primeraFoto(mundo);
    foto.refrescados = { 1: "2026-10-14T11:00:00.000Z", 2: "2026-10-14T11:30:00.000Z", 3: "2026-10-14T11:59:00.000Z" };
    const f = ghFalso(mundo);
    actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5), rotacion: 1 });
    expect(f.idsPedidos()).toEqual(["I_1"]);
  });

  it("MEDIO: una fecha de lectura del futuro (falsa) se corta a ahora y no esquiva la rotación", () => {
    const mundo = [nodo(3), nodo(2), nodo(1)];
    let foto = primeraFoto(mundo);
    foto.refrescados = { 1: "2099-01-01T00:00:00.000Z", 2: "2026-10-14T11:30:00.000Z", 3: "2026-10-14T11:59:00.000Z" };
    const pedidos = [];
    for (let k = 1; k <= 4; k++) {
      const f = ghFalso(mundo);
      foto = actualizarFoto({ previa: foto, gh: f.gh, ahora: min(5 * k), rotacion: 1 }).foto;
      pedidos.push(...f.idsPedidos());
      for (const v of Object.values(foto.refrescados)) expect(Date.parse(v)).toBeLessThanOrEqual(min(5 * k).getTime());
    }
    expect(pedidos).toContain("I_1");
  });
});

describe("el lector: la foto puesta al día, y la API si no sirve", () => {
  const textoFoto = (nodos, ahora = T0) => JSON.stringify({ version: FOTO_VERSION, generado_en: ahora.toISOString(), al_dia_desde: ahora.toISOString(), completa: true, total: nodos.length, refrescados: {}, pendientes: [], nodos });

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

  it("LIMPIEZA: sin la release, con otra versión o vieja, el lector no lanza y dice «a la API»", () => {
    const sinRelease = () => { throw new Error("HTTP 404"); };
    expect(nodosDeFotoVivos({ traerTexto: sinRelease, ahora: T0 })).toMatchObject({ nodos: null, motivo: expect.stringContaining("404") });
    const otra = JSON.stringify({ version: FOTO_VERSION + 1, generado_en: T0.toISOString(), nodos: [] });
    expect(nodosDeFotoVivos({ traerTexto: () => otra, ahora: T0 }).nodos).toBeNull();
    // el marcador con que se creó la release (versión 0) tampoco vale
    expect(nodosDeFotoVivos({ traerTexto: () => '{"version":0,"marca":"c3"}', ahora: T0 }).nodos).toBeNull();
    expect(nodosDeFotoVivos({ traerTexto: () => textoFoto([nodo(1)]), ahora: min(60) }).nodos).toBeNull();
  });

  it("el hijo que baja la foto no llama a process.exit (en Windows revienta tras escribirla) y devuelve el texto", () => {
    // El fallo solo sale con HTTPS de verdad (visto el 14 oct 2026: código 127 tras escribir la foto entera); aquí se vigila la causa.
    expect(CODIGO_HIJO_FETCH).not.toMatch(/process\.exit\(/);
    expect(traerTextoSync('data:application/json,{"a":1}', 5000)).toMatch(/^\{"a":1\}/);
    expect(() => traerTextoSync("http://127.0.0.1:1/no-hay-nadie", 2000)).toThrow();
  });

  it("las escrituras que dependen del padre (--colgar, --ordenar) y --fresco no leen de la foto", () => {
    for (const a of ["--colgar", "--ordenar", "--fresco"]) expect(fotoPermitida([a, "12", "34"]), a).toBe(false);
    for (const a of [[], ["--arranque"], ["--nuevo", "x"], ["--listar"]]) expect(fotoPermitida(a), a.join(" ")).toBe(true);
    // y el script los conecta: `pedirNodos` mira fotoPermitida y colgar tras --nuevo va sin foto
    const src = readFileSync(new URL("./issues.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/sinFoto \|\| !fotoPermitida\(args\)/);
    expect(src).toMatch(/colgar\(todos\(\{ sinFoto: true \}\), n, padre\)/);
  });

  it("MEDIO: solo vale el asset que subió el workflow (github-actions[bot]) y con el tamaño que dice la release", () => {
    expect(SUBIDOR_FOTO).toBe("github-actions[bot]");
    const release = (login, size = 10) => ({ tag_name: TAG_FOTO, assets: [{ name: FICHERO_FOTO, size, uploader: { login, type: "Bot" } }] });
    expect(assetDeConfianza(release("github-actions[bot]"))).toMatchObject({ size: 10 });
    expect(() => assetDeConfianza(release("homenu-sesiones[bot]"))).toThrow(/homenu-sesiones/);
    expect(() => assetDeConfianza(release("pabloam89"))).toThrow(/no la subió el workflow/);
    expect(() => assetDeConfianza({ assets: [] })).toThrow(/sin el asset/);
    expect(() => assetDeConfianza(null)).toThrow();

    const dir = mkdtempSync(join(tmpdir(), "foto-subidor-"));
    try {
      process.env.MENUPLAN_CUOTA_DIR = dir;
      const ahora = new Date();
      const texto = textoFoto([nodo(1)], ahora);
      const bytes = Buffer.byteLength(texto, "utf8");
      const ghCon = (rel) => (...a) => (String(a[1]).includes("/releases/tags/") ? JSON.stringify(rel) : "[]");
      const leer = (rel, bajado = texto) => nodosDeLaFoto({ gh: ghCon(rel), caller: "issues", env: { MENUPLAN_CUOTA_DIR: dir }, avisar: () => {}, ahora, bajar: () => bajado });
      expect(leer(release("github-actions[bot]", bytes))).toHaveLength(1);
      expect(leer(release("homenu-sesiones[bot]", bytes))).toBeNull();
      expect(leerEstadoFoto({ dir }).motivo).toMatch(/no la subió el workflow/);
      // otro asset entre la consulta y la bajada (no cuadra el tamaño): a la API
      expect(leer(release("github-actions[bot]", bytes), `${texto} `)).toBeNull();
    } finally {
      delete process.env.MENUPLAN_CUOTA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el arranque baja la foto con poca espera (tiene 10 s en total)", () => {
    const dir = mkdtempSync(join(tmpdir(), "foto-ms-"));
    try {
      process.env.MENUPLAN_CUOTA_DIR = dir;
      const esperas = [];
      const rel = JSON.stringify({ assets: [{ name: FICHERO_FOTO, size: 1, uploader: { login: "github-actions[bot]" } }] });
      nodosDeLaFoto({ gh: () => rel, caller: "issues", env: {}, avisar: () => {}, ms: 3000, bajar: (url, ms) => { esperas.push(ms); return "x"; } });
      expect(esperas).toEqual([3000]);
      const src = readFileSync(new URL("./issues.mjs", import.meta.url), "utf8");
      expect(src).toContain('ms: args.indexOf("--arranque") >= 0 ? MS_FOTO_ARRANQUE');
    } finally {
      delete process.env.MENUPLAN_CUOTA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("nodosDeLaFoto: lee de un fichero, cuenta el origen foto, guarda su estado, y con MENUPLAN_FOTO=0 o sin foto devuelve null", () => {
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
      expect(leerEstadoFoto({ dir })).toMatchObject({ ok: true, generado_en: ahora.toISOString() });
      expect(nodosDeLaFoto({ gh, caller: "issues", env: { ...env, MENUPLAN_FOTO: "0" } })).toBeNull();
      expect(nodosDeLaFoto({ gh, caller: "issues", env: { MENUPLAN_FOTO_ARCHIVO: join(dir, "no-existe.json") }, avisar: (m) => avisos.push(m) })).toBeNull();
      expect(avisos.at(-1)).toMatch(/voy a la API/);
      expect(leerEstadoFoto({ dir })).toMatchObject({ ok: false, generado_en: null });
      const lineas = leerLineas(readFileSync(join(dir, "gh.log"), "utf8"));
      expect(lineas.map((l) => `${l.api}:${l.resultado}`)).toEqual(["foto:ok", "foto:error"]);
      expect(lineas.every((l) => l.puntos === 0)).toBe(true);
    } finally {
      delete process.env.MENUPLAN_CUOTA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("el aviso: foto que falta o de más de 1 h, en una línea (situacion y arranque)", () => {
  it("dice una línea si falta, está a medias o pasa de 60 min; calla si está bien o nunca se miró", () => {
    expect(MAX_MIN_AVISO).toBe(60);
    expect(lineaFoto(null)).toBeNull();
    expect(lineaFoto({ ok: true, generado_en: T0.toISOString() }, { ahora: min(5) })).toBeNull();
    // 15-60 min: el lector ya va a la API, pero los cron se retrasan; no se avisa
    expect(lineaFoto({ ok: false, generado_en: T0.toISOString(), motivo: "generada hace 30 min (tope 15)" }, { ahora: min(30) })).toBeNull();
    expect(lineaFoto({ ok: false, generado_en: T0.toISOString(), motivo: "generada hace 61 min" }, { ahora: min(61) })).toMatch(/^Foto de los issues: de hace 61 min/);
    expect(lineaFoto({ ok: false, generado_en: T0.toISOString() }, { ahora: min(180) })).toMatch(/de hace 3 h/);
    // vale aunque la lectura saliera bien hace rato y ahora venga de la caché
    expect(lineaFoto({ ok: true, generado_en: T0.toISOString() }, { ahora: min(90) })).toMatch(/de hace 90 min/);
    // la edad se mide al mirarla: una foto de 5 min cuando se miró no acusa al workflow aunque la mirada sea de hace rato
    expect(lineaFoto({ ok: true, generado_en: T0.toISOString(), mirada_en: min(5).toISOString() }, { ahora: min(90) })).toBeNull();
    expect(lineaFoto({ ok: false, generado_en: T0.toISOString(), mirada_en: min(75).toISOString() }, { ahora: min(200) })).toMatch(/de hace 75 min/);
    expect(lineaFoto({ ok: false, generado_en: null, motivo: "sin foto (HTTP 404)" })).toMatch(/^Foto de los issues: no la hay \(sin foto \(HTTP 404\)\)/);
    expect(lineaFoto({ ok: false, generado_en: T0.toISOString(), motivo: "a medias: faltan 3 issues por leer" }, { ahora: min(1) })).toMatch(/a medias/);
  });

  it("el estado se guarda y se lee del disco, y sin disco no rompe", () => {
    const dir = mkdtempSync(join(tmpdir(), "foto-estado-"));
    try {
      expect(leerEstadoFoto({ dir })).toBeNull();
      guardarEstadoFoto({ ok: false, generado_en: null, motivo: "x" }, { dir });
      expect(leerEstadoFoto({ dir })).toMatchObject({ motivo: "x" });
      writeFileSync(join(dir, "fichero"), "");
      expect(() => guardarEstadoFoto({ ok: true }, { dir: join(dir, "fichero", "dentro") })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("situacion y el arranque (issues --arranque) imprimen la línea", () => {
    expect(readFileSync(new URL("./situacion.mjs", import.meta.url), "utf8")).toMatch(/lineaFoto\(leerEstadoFoto\(\)\)/);
    const src = readFileSync(new URL("./issues.mjs", import.meta.url), "utf8");
    const arranque = src.slice(src.indexOf('} else if (args.includes("--arranque"))'));
    expect(arranque.slice(0, 1500)).toMatch(/lineaFoto\(leerEstadoFoto\(\)\)/);
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

  const pasos = () => Object.values(wf.jobs).flatMap((j) => j.steps);

  it("permisos mínimos y separados: generar lee issues, publicar escribe la release, relanzar lanza la siguiente, y nada más", () => {
    expect(Object.keys(wf.jobs).sort()).toEqual(["generar", "publicar", "relanzar"]);
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.jobs.generar.permissions).toEqual({ contents: "read", issues: "read" });
    expect(wf.jobs.publicar.permissions).toEqual({ contents: "write" });
    expect(wf.jobs.relanzar.permissions).toEqual({ actions: "write" });
    expect(wf.jobs.publicar.needs).toBe("generar");
    // quien escribe o relanza no corre código del repo: ni checkout ni node
    for (const j of ["publicar", "relanzar"]) expect(JSON.stringify(wf.jobs[j].steps), j).not.toMatch(/checkout|setup-node|node /);
  });

  describe("se relanza a sí misma (#844, caso #843): sin depender del reloj de GitHub", () => {
    const relanzar = () => wf.jobs.relanzar ?? {};
    const run = () => (relanzar().steps ?? []).map((s) => s.run ?? "").join("\n");

    it("corre tras publicar aunque la pasada falle, pero no si se canceló, y solo en este repo y en staging", () => {
      expect(relanzar().needs).toBe("publicar");
      const si = String(relanzar().if).replace(/\s+/g, " ");
      expect(si).toContain("!cancelled()");
      expect(si).not.toMatch(/always\(\)|success\(\)|failure\(\)/);
      expect(si).toContain("github.repository == 'pabloam89/MenuPlan'");
      expect(si).toContain("github.ref == 'refs/heads/staging'");
      expect(si).not.toMatch(/\|\|/);
    });

    it("lanza solo este workflow, sobre staging, tras una espera de minutos que cabe en su tope", () => {
      const lanzadas = run().match(/gh workflow run [^\n]*/g) ?? [];
      expect(lanzadas).toHaveLength(1);
      expect(lanzadas[0]).toMatch(/^gh workflow run foto-issues\.yml .*--ref staging/);
      const espera = Number(run().match(/sleep (\d+)/)?.[1]);
      expect(espera).toBeGreaterThanOrEqual(180);
      expect(espera).toBeLessThanOrEqual(300);
      expect(relanzar()["timeout-minutes"] * 60).toBeGreaterThan(espera);
    });

    it("la cadena no se multiplica: una sola cola para el workflow entero, sin cancelar la pasada en curso", () => {
      expect(wf.concurrency).toEqual({ group: "foto-issues", "cancel-in-progress": false });
      // por trabajo no: relanzar no retendría la cola y podrían correr dos pasadas a la vez
      for (const [j, job] of Object.entries(wf.jobs)) expect(job.concurrency, j).toBeUndefined();
    });

    it("el cron se queda de respaldo (como mucho dos por hora), no cada 5 min", () => {
      const crones = wf.on.schedule.map((s) => s.cron);
      expect(crones).toHaveLength(1);
      expect(crones[0].split(" ")[0].split(",").length).toBeLessThanOrEqual(2);
    });
  });

  it("MEDIO: la foto anterior solo se usa si la subió el propio workflow (github-actions[bot]); si no, desde cero", () => {
    const traer = wf.jobs.generar.steps.find((s) => /anterior/.test(s.name)).run;
    expect(traer).toContain(".uploader.login");
    expect(traer).toContain("github-actions[bot]");
    // se baja el asset comprobado, por su id, y no lo que haya en la URL
    expect(traer).toContain("releases/assets/${ID}");
  });

  it("usa el token del propio workflow: ningún secreto ni la App de las sesiones", () => {
    const activo = JSON.stringify(wf); // sin los comentarios, que sí nombran a la App
    expect(activo).not.toMatch(/secrets\./);
    expect(activo).not.toMatch(/homenu-sesiones|APP_KEY|pull_request_target/);
    expect(activo).toContain("github.token");
  });

  it("acciones fijadas por SHA y el código sale de staging", () => {
    const usos = pasos().filter((s) => s.uses).map((s) => s.uses);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
    expect(wf.jobs.generar.steps[0].with.ref).toBe("staging");
  });

  it("nada del texto de un issue ni del evento entra en un run: solo variables de entorno", () => {
    for (const paso of pasos().filter((s) => s.run)) {
      expect(paso.run, paso.name).not.toMatch(/\$\{\{/);
      expect(paso.run, paso.name).not.toMatch(/github\.event/);
    }
  });

  it("solo por el reloj y a mano: ningún evento que un tercero pueda disparar (issues, comentarios)", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(wf.concurrency).toMatchObject({ group: "foto-issues", "cancel-in-progress": false });
  });

  it("publica en la release, sin rama ni historia: prerelease, nunca «latest», el asset reemplazado", () => {
    const run = wf.jobs.publicar.steps.filter((s) => s.run).map((s) => s.run).join("\n");
    expect(run).toMatch(/gh release upload "\$\{TAG_FOTO\}" salida\/issues\.json [^\n]*--clobber/);
    expect(run).toMatch(/gh release create [^\n]*--prerelease --latest=false/);
    expect(run).not.toMatch(/git push|vercel\.json|git commit/);
  });
});
