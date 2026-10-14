import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { esCatalogo, leerCatalogo } from "../scripts/lib/catalogos.mjs";
import { leerEstandares } from "../scripts/lib/estandaresAgentes.mjs";
import {
  AVISO_ANTES_DIAS, ESTADOS_REVISION, PLAZO_REVISION_DIAS, TECHO_SIN_REVISAR, cifrasDeFuentes, estadoDeRevision, leerFuentes,
  ladoDeFuente, ladoObligado, mapaDeFuentes, problemasDeFuentes, problemasDeLado, resolverCitas, vistaParaEstandares,
} from "../scripts/lib/fuentesDoc.mjs";
import { clasificar, compilar, leerZonas } from "../scripts/lib/zonasProyecto.mjs";
import { leerPool } from "../scripts/lib/pool.mjs";
import { rutaPrincipiosDeProyecto } from "../scripts/lib/principios.mjs";

/**
 * La fuente documental, entidad única `source` (#681, parte de #652). Una lista (ops/fuentes-documentales/)
 * en vez de dos catálogos; principios, estándares y pool la citan por id. Como la caducidad de las skills
 * (.claude/skills.test.js), el reloj NO pone en rojo `npm test`: la caducidad se prueba con fechas fijas y,
 * contra el repo, solo avisa. Lo que sí falla es lo que no depende del día: forma, citas y que haya más
 * fuentes sin revisar que el techo (que solo baja).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogo = leerFuentes(RAIZ);
const clon = () => structuredClone(catalogo);
const DIAS = (n) => new Date(Date.parse("2026-10-13T00:00:00Z") + n * 86_400_000);

// Quién cita cada fuente, leído en crudo: el id que escribe cada principio, regla y práctica.
// Los principios de cada proyecto (ops/proyectos/<id>/principios/, #710) citan fuentes igual que los de la casa.
const deProyectos = readdirSync(resolve(RAIZ, "ops/proyectos")).map(rutaPrincipiosDeProyecto).filter((c) => esCatalogo(RAIZ, c));
const citasDePrincipios = ["ops/principios/", "ops/principios-producto/", ...deProyectos].flatMap((c) => leerCatalogo(RAIZ, c).principios.flatMap((p) => p.fuentes.map((f) => ({ p: p.id, f }))));
const estandares = leerEstandares(RAIZ);
const reglas = [...Object.values(estandares.agentes).flatMap((a) => a.tareas.flatMap((t) => t.reglas ?? [])), ...Object.values(estandares.comunes).flatMap((c) => c.reglas ?? [])];
const citasDePool = Object.values(leerPool(RAIZ).agentes).flatMap((a) => a.practicas.map((x) => x.fuente));
const citadas = new Set([...citasDePrincipios.map((c) => c.f.fuente), ...reglas.map((r) => r.fuente), ...citasDePool]);
const zonas = compilar(leerZonas(RAIZ));
const zonaDe = (ruta) => clasificar(ruta, zonas).zona;
const proyectos = JSON.parse(readFileSync(resolve(RAIZ, "ops/entidades.json"), "utf8")).projects.map((p) => p.id);
const falla = (cambia, trozo, opciones = {}) => {
  const c = clon();
  cambia(c);
  expect(problemasDeFuentes(c, { citadas, raiz: RAIZ, proyectos, ...opciones }).join("\n")).toContain(trozo);
};

describe("ops/fuentes-documentales/: una sola lista de fuentes", () => {
  it("el catálogo cumple las reglas de forma, nadie cita una fuente que no existe y no sobra ninguna", () => {
    expect(problemasDeFuentes(catalogo, { citadas, raiz: RAIZ, proyectos })).toEqual([]);
  });

  it("los principios citan por id: { marca, fuente } y nada más (ni url ni ruta escritas dentro)", () => {
    expect(citasDePrincipios.length).toBeGreaterThan(100);
    for (const { p, f } of citasDePrincipios) {
      expect(Object.keys(f).sort(), p).toEqual(["fuente", "marca"]);
      expect(["F", "S", "I"], p).toContain(f.marca);
    }
  });

  it("la marca de una cita casa con la fuente: I es de la casa (ruta); F y S son externas (url)", () => {
    const mapa = mapaDeFuentes(catalogo);
    for (const { p, f } of citasDePrincipios) expect(mapa.get(f.fuente)?.tipo, `${p}: ${f.fuente}`).toBe(f.marca === "I" ? "casa" : "externa");
  });

  it("una sola lista: el catálogo de estándares ya no guarda fuentes y su vista sale de esta lista", () => {
    const vista = vistaParaEstandares(catalogo);
    expect(Object.keys(estandares.fuentes).sort()).toEqual(Object.keys(vista).sort());
    expect(Object.keys(vista).length).toBe(catalogo.fuentes.filter((f) => f.uso !== "principio").length);
    expect(Object.keys(vista).length).toBeLessThan(catalogo.fuentes.length);
  });

  it("una fuente que solo cita un principio lleva uso «principio»; una que cita una regla o el pool, no", () => {
    const deReglaOPool = new Set([...reglas.map((r) => r.fuente), ...citasDePool]);
    for (const f of catalogo.fuentes) {
      if (f.uso === "principio") expect(deReglaOPool.has(f.id), `${f.id} la cita una regla o el pool y lleva uso principio`).toBe(false);
      else expect(deReglaOPool.has(f.id), `${f.id} solo la cita un principio: pon uso principio`).toBe(true);
    }
  });

  it("resolver una cita da la forma de siempre y deja tal cual la que no existe", () => {
    const mapa = mapaDeFuentes(catalogo);
    const e = catalogo.fuentes.find((f) => f.tipo === "externa");
    const c = catalogo.fuentes.find((f) => f.tipo === "casa");
    expect(resolverCitas([{ marca: "F", fuente: e.id }, { marca: "I", fuente: c.id }, { marca: "F", fuente: "no-existe" }], mapa)).toEqual([
      { marca: "F", url: e.url }, { marca: "I", ruta: c.ruta }, { marca: "F", fuente: "no-existe" },
    ]);
  });
});

describe("revisión: el reloj avisa, no falla", () => {
  it("vocabulario cerrado y plazo de 90 días como las skills", () => {
    expect(ESTADOS_REVISION).toEqual(["vigente", "proxima", "caducada", "sin_revisar"]);
    expect(PLAZO_REVISION_DIAS).toBe(90);
    expect(catalogo.plazo_revision_dias).toBe(PLAZO_REVISION_DIAS);
  });

  it("estado según los días desde la revisión (fechas fijas)", () => {
    const f = (r, d) => ({ revisada: r, fecha_revision: d });
    expect(estadoDeRevision(f("no", null), DIAS(0)).estado).toBe("sin_revisar");
    expect(estadoDeRevision(f("si", "2026-10-13"), DIAS(0))).toEqual({ estado: "vigente", dias: 0 });
    expect(estadoDeRevision(f("si", "2026-10-13"), DIAS(PLAZO_REVISION_DIAS - AVISO_ANTES_DIAS)).estado).toBe("vigente");
    expect(estadoDeRevision(f("si", "2026-10-13"), DIAS(PLAZO_REVISION_DIAS - AVISO_ANTES_DIAS + 1)).estado).toBe("proxima");
    expect(estadoDeRevision(f("si", "2026-10-13"), DIAS(PLAZO_REVISION_DIAS)).estado).toBe("proxima");
    expect(estadoDeRevision(f("si", "2026-10-13"), DIAS(PLAZO_REVISION_DIAS + 1)).estado).toBe("caducada");
    expect(estadoDeRevision(f("si", "no es fecha"), DIAS(0)).estado).toBe("sin_revisar");
  });

  it("las cifras suman el total (fechas fijas)", () => {
    const k = cifrasDeFuentes(catalogo, DIAS(0));
    expect(k.total).toBe(catalogo.fuentes.length);
    expect(k.externas + k.casa).toBe(k.total);
    expect(ESTADOS_REVISION.reduce((s, e) => s + k[e], 0)).toBe(k.total);
    expect(k.sin_revisar).toBe(TECHO_SIN_REVISAR);
  });

  it("avisa (sin fallar) de las fuentes sin revisar y de las caducadas o a punto", () => {
    const k = cifrasDeFuentes(catalogo);
    console.warn(`[fuentes] ${k.total} fuentes: ${k.sin_revisar} sin revisar, ${k.caducada} caducadas, ${k.proxima} próximas a caducar`);
    for (const f of catalogo.fuentes) {
      const e = estadoDeRevision(f);
      if (e.estado === "caducada" || e.estado === "proxima") console.warn(`[fuentes] ${f.id} ${e.estado}: revisada el ${f.fecha_revision}, hace ${e.dias} días`);
    }
    expect(k.total).toBeGreaterThan(0);
  });
});

describe("cada regla de forma, vista fallar", () => {
  it("un id repetido", () => falla((c) => { c.fuentes[1].id = c.fuentes[0].id; }, "id repetido"));
  it("un id que no es kebab", () => falla((c) => { c.fuentes[0].id = "Mal Id"; }, "el id va en minúsculas"));
  it("una dirección en dos fuentes", () => falla((c) => { const a = c.fuentes.find((f) => f.url); const b = c.fuentes.filter((f) => f.url)[1]; b.url = a.url; }, "ya está en otra fuente"));
  it("una externa en http", () => falla((c) => { const f = c.fuentes.find((x) => x.url); f.url = f.url.replace("https:", "http:"); }, "la url va en https"));
  it("una de la casa con una ruta que no existe", () => falla((c) => { c.fuentes.find((f) => f.ruta).ruta = "no/existe.md"; }, "la ruta no/existe.md no existe"));
  it("una de la casa con url", () => falla((c) => { c.fuentes.find((f) => f.ruta).url = "https://x.org"; }, "lleva ruta y no url"));
  it("un tipo fuera del vocabulario", () => falla((c) => { c.fuentes[0].tipo = "blog"; }, "fuera de externa, casa"));
  it("un uso fuera del vocabulario", () => falla((c) => { c.fuentes[0].uso = "adorno"; }, "fuera de pool, principio"));
  it("un campo desconocido", () => falla((c) => { c.fuentes[0].autor = "x"; }, "campo desconocido «autor»"));
  it("una fecha de alta que no es fecha", () => falla((c) => { c.fuentes[0].fecha_alta = "ayer"; }, "fecha_alta no es AAAA-MM-DD"));
  it("revisada con un valor fuera de si | no", () => falla((c) => { c.fuentes[0].revisada = "quizá"; }, "fuera de si, no"));
  it("revisada sin fecha de revisión", () => falla((c) => { const f = c.fuentes.find((x) => x.revisada === "si"); f.fecha_revision = null; }, "revisada sin fecha_revision"));
  it("revisión anterior al alta", () => falla((c) => { const f = c.fuentes.find((x) => x.revisada === "si"); f.fecha_revision = "2020-01-01"; }, "anterior a fecha_alta"));
  it("una revisión en el futuro no caduca nunca y no vale", () => falla((c) => { const f = c.fuentes.find((x) => x.revisada === "si"); f.fecha_revision = "2099-01-01"; }, "en el futuro"));
  it("sin revisar con fecha de revisión", () => falla((c) => { const f = c.fuentes.find((x) => x.revisada === "no"); f.fecha_revision = "2026-10-13"; }, "lleva fecha_revision null"));
  it("una fuente que nadie cita", () => falla((c) => { c.fuentes.push({ id: "sobra-una", nombre: "Una fuente que sobra en la lista", tipo: "externa", url: "https://sre.google/sobra", fecha_alta: "2026-10-13", revisada: "si", fecha_revision: "2026-10-13" }); }, "nadie la cita"));
  it("se cita una fuente que no existe", () => {
    const c = clon();
    expect(problemasDeFuentes(c, { citadas: new Set([...citadas, "fantasma"]) }).join()).toContain("se cita la fuente «fantasma»");
  });
  it("el plazo de revisión cambiado", () => falla((c) => { c.plazo_revision_dias = 365; }, "plazo_revision_dias"));
  it("una fuente nueva sin revisar sube el techo: falla", () => falla((c) => {
    c.fuentes.push({ id: "nueva-sin-revisar", nombre: "Una fuente nueva sin revisar", tipo: "externa", url: "https://sre.google/nueva", fecha_alta: "2026-10-14", revisada: "no", fecha_revision: null });
  }, "el techo es", { citadas: new Set([...citadas, "nueva-sin-revisar"]) }));
  it("revisar una fuente sin bajar el techo también falla (solo baja)", () => falla((c) => {
    const f = c.fuentes.find((x) => x.revisada === "no"); f.revisada = "si"; f.fecha_revision = "2026-10-13";
  }, "baja TECHO_SIN_REVISAR"));
});

describe("el lado de cada fuente (#710, PR 4): el campo project", () => {
  // Una ruta de zona producto sacada del propio catálogo (así el test no nombra ficheros de HoMenu a mano).
  const rutaDeProducto = catalogo.fuentes.find((f) => f.project && f.tipo === "casa").ruta;
  const casa = (ruta, project) => ({ id: "casa-x", nombre: "Fuente de prueba de la casa", tipo: "casa", ruta, ...(project ? { project } : {}) });
  const con = (...fuentes) => ({ fuentes });

  it("el catálogo no mezcla lados: ninguna horizontal lleva project y ninguna de producto lo olvida", () => {
    expect(problemasDeLado(catalogo, zonaDe)).toEqual([]);
  });

  it("una fuente horizontal con project falla (agente, o zona de factoría)", () => {
    expect(problemasDeLado(con(casa(".claude/agents/qa.md", "homenu")), zonaDe).join()).toContain("es horizontal");
    expect(problemasDeLado(con(casa("ops/PLANOS.md", "homenu")), zonaDe).join()).toContain("es horizontal");
  });

  it("una fuente de proyecto sin project falla (ruta en zona de producto)", () => {
    expect(problemasDeLado(con(casa(rutaDeProducto)), zonaDe).join()).toContain("no lleva project");
    expect(problemasDeLado(con(casa(rutaDeProducto, "homenu")), zonaDe)).toEqual([]);
  });

  it("una externa o una ruta de zona mixta es libre: con project es del proyecto, sin él de la casa", () => {
    const ext = { id: "x-docs", nombre: "Documentación de un proveedor", tipo: "externa", url: "https://supabase.com/docs" };
    expect(problemasDeLado(con(ext, { ...ext, project: "homenu" }), zonaDe)).toEqual([]);
    expect(ladoObligado(ext, zonaDe)).toBeNull();
    expect(ladoDeFuente(ext, zonaDe)).toBe("horizontal");
    expect(ladoDeFuente({ ...ext, project: "homenu" }, zonaDe)).toBe("vertical");
    expect(ladoDeFuente(casa(rutaDeProducto), zonaDe)).toBe("vertical");
  });

  it("un project que no es un proyecto de ops/entidades.json falla", () => {
    falla((c) => { c.fuentes.find((f) => f.project).project = "fantasma"; }, "project «fantasma» no es un proyecto");
  });
});
