import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerGlosario } from "../../scripts/lib/glosario.mjs";
import { VOCABULARIOS } from "../../scripts/lib/vocabulariosVida.mjs";
import { PLATAFORMAS, VOCABULARIOS_DE_TIPOS, cifrasDeTaxonomia, leerSuperficies, leerTaxonomia, problemasDeTaxonomia, tiposDe } from "../../scripts/lib/taxonomiaDiseno.mjs";

/**
 * La taxonomía de diseño (#776, línea 1 de #774): los tres vocabularios cerrados de `ops/diseno/taxonomia.json`
 * (tipos de pantalla, de elemento de interfaz y de flujo de usuario) contra el glosario y las superficies de
 * `ops/diseno/bloques.json`. Es un test booleano, sin lista de excepciones ni techo:
 *
 *  1. ids únicos, con forma válida y sin repetirse entre los tres vocabularios;
 *  2. cada tipo tiene su término activo del glosario (su `en` es el id), de clase tipo y dominio diseno;
 *  3. el vínculo va también al revés: todo término de clase tipo tiene su fila (o es la cabeza de un vocabulario);
 *  4. grupo y plataforma salen de su vocabulario cerrado, y la plataforma usa las superficies app y web de bloques.json;
 *  5. un tipo solo de un lado no lleva recuento del otro (null: no aplica), y uno de los dos lados lleva al menos uno;
 *  6. lo que queda fuera tiene motivo y no está dentro; los límites de las capturas están escritos;
 *  7. los vocabularios están registrados en ops/vocabularios-vida.json (ciclo de vida).
 *
 * Abajo, un autotest: cada regla falla con un dato roto a propósito. Sin red.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATOS = leerTaxonomia(RAIZ);
const G = leerGlosario(RAIZ);
const SUPERFICIES = leerSuperficies(RAIZ);
const copia = (x) => JSON.parse(JSON.stringify(x));

describe("la taxonomía de diseño de hoy", () => {
  it("no tiene ningún problema contra el glosario y las superficies", () => {
    expect(problemasDeTaxonomia(DATOS, G, SUPERFICIES), "Corrige ops/diseno/taxonomia.json o el término en ops/glosario/terminos/").toEqual([]);
  });

  it("los tres vocabularios existen y tienen tipos", () => {
    const c = cifrasDeTaxonomia(DATOS);
    for (const v of Object.keys(VOCABULARIOS_DE_TIPOS)) expect(c.por_vocabulario[v], v).toBeGreaterThan(0);
    expect(c.total).toBe(Object.values(c.por_vocabulario).reduce((a, n) => a + n, 0));
    expect(Object.values(c.por_plataforma).reduce((a, x) => a + x.total, 0)).toBe(c.total);
  });

  it("ningún id está en dos vocabularios", () => {
    const ids = tiposDe(DATOS).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada tipo tiene un término activo del glosario que lo traduce, y es de diseno", () => {
    const porEn = new Map(G.terminos.filter((t) => t.estado !== "retirado" && t.en).map((t) => [t.en, t]));
    for (const t of tiposDe(DATOS)) {
      const term = porEn.get(t.id);
      expect(term, t.id).toBeDefined();
      expect(term.clase, t.id).toBe("tipo");
      expect(term.dominio, t.id).toBe("diseno");
    }
  });

  it("todo término de clase tipo tiene su fila: ninguno se queda sin entrada", () => {
    const ids = new Set(tiposDe(DATOS).map((t) => t.id));
    const cabezas = new Set(Object.values(DATOS.cabezas));
    const huerfanos = G.terminos.filter((t) => t.estado !== "retirado" && t.clase === "tipo" && !ids.has(t.en) && !cabezas.has(t.en)).map((t) => t.termino);
    expect(huerfanos).toEqual([]);
    // y la cuenta cuadra: un término por tipo, más las cabezas que son de clase tipo (la de elemento; las de pantalla y flujo de usuario son artefactos)
    const cabezasTipo = G.terminos.filter((t) => t.estado !== "retirado" && cabezas.has(t.en) && t.clase === "tipo").length;
    expect(cabezasTipo).toBe(1);
    expect(G.terminos.filter((t) => t.estado !== "retirado" && t.clase === "tipo").length).toBe(ids.size + cabezasTipo);
  });

  it("la plataforma son las superficies de pantalla de bloques.json, más both", () => {
    expect(PLATAFORMAS).toEqual(["app", "web", "both"]);
    for (const x of ["app", "web"]) expect(SUPERFICIES, x).toContain(x);
    for (const t of tiposDe(DATOS)) expect(PLATAFORMAS, t.id).toContain(t.plataforma);
  });

  it("el perfil no está en la taxonomía: lo elige cada proyecto en su especificación", () => {
    for (const t of tiposDe(DATOS)) expect(t, t.id).not.toHaveProperty("perfil");
  });

  it("en espera se calcula y no se guarda: sin proyecto que elija, todos lo están", () => {
    const c = cifrasDeTaxonomia(DATOS);
    expect(c.en_espera).toBe(c.total);
    expect(cifrasDeTaxonomia(DATOS, [DATOS.pantalla[0].id, DATOS.flujo[0].id]).en_espera).toBe(c.total - 2);
    for (const t of tiposDe(DATOS)) expect(Object.keys(t), t.id).not.toContain("uso");
  });

  it("Pablo (14 oct): escritorio es lo mismo que móvil salvo lo imposible; los solo app y los solo web, con motivo", () => {
    const solo = (p) => tiposDe(DATOS).filter((t) => t.plataforma === p).map((t) => t.id).sort();
    expect(solo("app")).toEqual(["augmented-reality", "camera-and-scanner", "filters-and-stickers", "pull-to-refresh", "scanning", "splash-screen", "stories", "taking-photos"]);
    expect(solo("web")).toEqual(["combobox", "context-menu", "internal-tool", "kanban-board", "multi-column-layout"]);
    const plat = (id) => tiposDe(DATOS).find((t) => t.id === id)?.plataforma;
    for (const id of ["dark-mode", "segmented-control", "bottom-sheet", "tab-bar", "floating-action-button", "account-setup", "reminder", "location-and-address"]) expect(plat(id), id).toBe("both");
    expect(DATOS.limites.join(" ")).toMatch(/asunción de Pablo/);
  });

  it("los tres vocabularios y sus grupos y plataformas están anclados en vocabularios-vida", () => {
    for (const n of ["diseno.tipo_pantalla", "diseno.tipo_elemento", "diseno.tipo_flujo", "diseno.grupo_pantalla", "diseno.grupo_elemento", "diseno.grupo_flujo", "diseno.plataforma_de_tipo"]) expect(VOCABULARIOS, n).toHaveProperty(n);
    const reg = JSON.parse(readFileSync(join(RAIZ, "ops", "vocabularios-vida.json"), "utf8")).anclados;
    expect(Object.keys(reg["diseno.tipo_pantalla"]).sort()).toEqual(DATOS.pantalla.map((t) => t.id).sort());
    expect(Object.keys(reg["diseno.tipo_elemento"]).sort()).toEqual(DATOS.elemento.map((t) => t.id).sort());
    expect(Object.keys(reg["diseno.tipo_flujo"]).sort()).toEqual(DATOS.flujo.map((t) => t.id).sort());
    expect(Object.keys(reg["diseno.plataforma_de_tipo"])).toEqual(PLATAFORMAS);
  });

  it("lo del encargo: los solo iOS están fuera y los solo web, dentro y marcados web", () => {
    const fuera = DATOS.fuera.map((f) => f.id);
    for (const id of ["dynamic-island", "live-activities", "widgets"]) expect(fuera, id).toContain(id);
    const web = (v, id) => DATOS[v].find((t) => t.id === id)?.plataforma;
    for (const id of ["internal-tool", "kanban-board", "multi-column-layout"]) expect(web("pantalla", id), id).toBe("web");
    for (const id of ["context-menu", "combobox"]) expect(web("elemento", id), id).toBe("web");
  });
});

describe("autotest: la taxonomía falla con datos malos", () => {
  const con = (cambio, glosario = G) => {
    const d = copia(DATOS);
    cambio(d);
    return problemasDeTaxonomia(d, glosario, SUPERFICIES).join("\n");
  };
  const sinTermino = (en) => ({ terminos: G.terminos.filter((t) => t.en !== en) });

  it("un id repetido en dos vocabularios", () => {
    expect(con((d) => { d.flujo[0].id = d.pantalla[0].id; })).toMatch(/id repetido/);
  });

  it("un id con forma inválida", () => {
    expect(con((d) => { d.pantalla[0].id = "Account_Setup"; })).toMatch(/el id no es kebab/);
  });

  it("un tipo sin término en el glosario", () => {
    const id = DATOS.pantalla[0].id;
    expect(con(() => {}, sinTermino(id))).toContain(`pantalla.${id}: ningún término activo del glosario tiene en «${id}»`);
  });

  it("un término retirado no cuenta como término del tipo", () => {
    const id = DATOS.pantalla[0].id;
    const g = { terminos: G.terminos.map((t) => (t.en === id ? { ...t, estado: "retirado", pasa_a: "caso" } : t)) };
    expect(con(() => {}, g)).toContain(`ningún término activo del glosario tiene en «${id}»`);
  });

  it("un término de otra clase o de otro dominio", () => {
    const id = DATOS.pantalla[0].id;
    expect(con(() => {}, { terminos: G.terminos.map((t) => (t.en === id ? { ...t, clase: "artefacto" } : t)) })).toMatch(/es de clase artefacto, no tipo/);
    expect(con(() => {}, { terminos: G.terminos.map((t) => (t.en === id ? { ...t, dominio: "datos" } : t)) })).toMatch(/es del dominio datos, no diseno/);
  });

  it("un término de tipo sin fila (el otro sentido del vínculo)", () => {
    const nuevo = { termino: "pantalla inventada", estado: "activo", clase: "tipo", dominio: "diseno", definicion: "Una pantalla que no existe.", sinonimos_prohibidos: [], aplica_a: ["todas"], entidades: [{ entidad: "screen", relacion: "tipo_de" }], en: "invented-screen" };
    expect(con(() => {}, { terminos: [...G.terminos, nuevo] })).toContain("«pantalla inventada»: nombra un tipo y ninguna fila de la taxonomía tiene id «invented-screen»");
  });

  it("un término de tipo que no es del dominio diseno", () => {
    const nuevo = { termino: "pantalla ajena", estado: "activo", clase: "tipo", dominio: "datos", definicion: "Una pantalla que no es de diseno.", sinonimos_prohibidos: [], aplica_a: ["todas"], en: "foreign-screen" };
    expect(con(() => {}, { terminos: [...G.terminos, nuevo] })).toMatch(/«pantalla ajena»: un término de clase tipo es del dominio diseno/);
  });

  it("un tipo cuyo término no cuelga de la cabeza de su vocabulario", () => {
    const id = DATOS.elemento[0].id;
    const g = { terminos: G.terminos.map((t) => (t.en === id ? { ...t, amplio: "flujo de usuario" } : t)) };
    expect(con(() => {}, g)).toMatch(/debe tener por amplio a «elemento de interfaz»/);
  });

  it("un tipo cuyo término nombra la entidad que no es", () => {
    const id = DATOS.elemento[0].id;
    const g = { terminos: G.terminos.map((t) => (t.en === id ? { ...t, entidades: [{ entidad: "screen", relacion: "tipo_de" }] } : t)) };
    expect(con(() => {}, g)).toMatch(/debe nombrar la entidad component con tipo_de/);
  });

  it("un grupo o una plataforma fuera del vocabulario cerrado", () => {
    expect(con((d) => { d.pantalla[0].grupo = "inventado"; })).toMatch(/grupo «inventado» fuera del vocabulario/);
    expect(con((d) => { d.elemento[0].plataforma = "tablet"; })).toMatch(/plataforma «tablet» fuera del vocabulario/);
  });

  it("el perfil en una fila es un campo desconocido (lo elige el proyecto, no la taxonomía)", () => {
    expect(con((d) => { d.pantalla[0].perfil = ["P1"]; })).toMatch(/campo desconocido \(perfil\)/);
  });

  it("una plataforma que no es superficie, o una superficie que bloques.json ya no tiene", () => {
    expect(problemasDeTaxonomia(DATOS, G, SUPERFICIES.filter((x) => x !== "app")).join("\n")).toMatch(/plataformas: «app» no es una superficie/);
  });

  it("la cabeza de pantalla y de flujo es un artefacto que denota; la de elemento, un tipo de component", () => {
    const g = { terminos: G.terminos.map((t) => (t.en === "screen" ? { ...t, clase: "tipo" } : t)) };
    expect(con(() => {}, g)).toMatch(/cabezas.pantalla: «pantalla» debe ser de clase artefacto/);
    const h = { terminos: G.terminos.map((t) => (t.en === "flow" ? { ...t, entidades: [{ entidad: "flow", relacion: "tipo_de" }] } : t)) };
    expect(con(() => {}, h)).toMatch(/cabezas.flujo: «flujo de usuario» debe nombrar la entidad flow con denota/);
  });

  it("la popularidad: entero positivo y null donde no se mide", () => {
    expect(con((d) => { d.pantalla.find((t) => t.plataforma === "app").ejemplos_mobile = null; })).toMatch(/ejemplos_mobile es un entero positivo en un tipo solo app/);
    expect(con((d) => { d.pantalla.find((t) => t.plataforma === "both").ejemplos_mobile = -3; })).toMatch(/ejemplos_mobile es un entero positivo o null/);
    expect(con((d) => { d.pantalla.find((t) => t.plataforma === "web").ejemplos_mobile = 5; })).toMatch(/solo web no lleva ejemplos_mobile/);
    expect(con((d) => { d.pantalla.find((t) => t.plataforma === "app").ejemplos_web = 5; })).toMatch(/solo app no lleva ejemplos_web/);
    expect(con((d) => { d.pantalla.find((t) => t.plataforma === "both").ejemplos_web = "mil"; })).toMatch(/ejemplos_web es un entero positivo o null/);
    expect(con((d) => { const t = d.pantalla.find((x) => x.plataforma === "both"); t.ejemplos_web = null; t.ejemplos_mobile = null; })).toMatch(/los dos lados necesita al menos un recuento/);
  });

  it("un campo desconocido o que falta", () => {
    expect(con((d) => { d.pantalla[0].nombre = "x"; })).toMatch(/campo desconocido \(nombre\)/);
    expect(con((d) => { delete d.pantalla[0].grupo; })).toMatch(/falta grupo/);
  });

  it("la fecha de la captura, los límites y la fuente", () => {
    expect(con((d) => { d.captura.fecha = "14/10/2026"; })).toMatch(/captura.fecha/);
    expect(con((d) => { d.captura.fuente = ""; })).toMatch(/captura.fuente/);
    expect(con((d) => { d.limites = []; })).toMatch(/limites/);
  });

  it("un grupo que ningún tipo usa", () => {
    expect(con((d) => { d.grupos.pantalla["grupo-vacio"] = "Sin tipos"; })).toMatch(/grupos.pantalla.grupo-vacio: ningún tipo lo usa/);
  });

  it("lo que queda fuera: sin motivo, o a la vez dentro", () => {
    expect(con((d) => { d.fuera[0].motivo = ""; })).toMatch(/sin motivo/);
    expect(con((d) => { d.fuera[0].id = d.pantalla[0].id; })).toMatch(/está fuera y también dentro/);
    expect(con((d) => { d.fuera = []; })).toMatch(/fuera: lista no vacía/);
    expect(con((d) => { delete d.fuera[0].ejemplos_web; })).toMatch(/falta ejemplos_web \(null si no aplica\)/);
    expect(con((d) => { d.fuera[0].extra = 1; })).toMatch(/campo desconocido \(extra\)/);
  });

  it("la cabeza de un vocabulario: desaparece o no cuadra con sus tipos", () => {
    expect(con((d) => { d.cabezas.flujo = "inventada"; })).toMatch(/cabezas.flujo: ningún término activo/);
    expect(con((d) => { d.cabezas.pantalla = d.pantalla[0].id; })).toMatch(/es también el id de un tipo/);
    const g = { terminos: G.terminos.map((t) => (t.en === "flow" ? { ...t, estrecho: t.estrecho.slice(1) } : t)) };
    expect(con(() => {}, g)).toMatch(/cabezas.flujo: «flujo de usuario» tiene en estrecho/);
  });

  it("un vocabulario vacío", () => {
    expect(con((d) => { d.flujo = []; })).toMatch(/flujo: no hay ninguna fila/);
  });
});
