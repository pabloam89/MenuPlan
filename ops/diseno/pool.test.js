import { describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { agentesDe } from "../../scripts/lib/agentes.mjs";
import { VOCABULARIOS, leerRegistro } from "../../scripts/lib/vocabulariosVida.mjs";
import { PLAZO_COMPROBADO_DIAS } from "../../scripts/lib/skills.mjs";
import { CAMPOS_DE_FICHA, CORRESPONDENCIA_DE_Q, NO_APLICA, RUTA_BIBLIOTECAS, SIN_COMPROBAR, VOCABULARIOS_DEL_POOL, cifrasDeBibliotecas, caducidadDeFicha, candidatasDe, clavesDeVocabulario, cumpleReact, leerBibliotecas, leerBloques, problemasDeBibliotecas, reactDePackage, validarReact } from "../../scripts/lib/bibliotecasDiseno.mjs";
import { leerTaxonomia } from "../../scripts/lib/taxonomiaDiseno.mjs";

/**
 * El pool de bibliotecas de interfaz (#780, línea 2 de #774): las fichas de `ops/diseno/bibliotecas.json` contra la
 * taxonomía de diseño y los agentes. Es un test booleano, sin lista de excepciones:
 *
 *  1. todos los campos de cada ficha existen y salen de su vocabulario cerrado (que lleva definición);
 *  2. la licencia lleva la URL de su fuente (o es `unverified` entera), y la accesibilidad declarada, la suya;
 *  3. `comprobada` es una fecha válida, no anterior a la lectura del dossier; su caducidad a 90 días se calcula, como la de las skills;
 *     `medida` (#814), la del refresco, es null o una fecha igual de válida, y no renueva esa caducidad;
 *  4. cada elemento cubierto existe en ops/diseno/taxonomia.json, y una cobertura comprobada lleva fuente (un juicio, no);
 *  5. una biblioteca sin mantenimiento o archivada no puede ser candidata: solo `retired`, con motivo y sucesora si la hay;
 *  6. cada elemento del alcance tiene al menos una candidata con acceso libre o un motivo escrito;
 *  7. los vocabularios están registrados en ops/vocabularios-vida.json (ciclo de vida);
 *  8. (#788) una sola marca de «sin comprobar» (`unverified`) y un valor aparte de «no aplica» (`not-applicable`): ningún `null`, `unread` ni `cli` dice «no sé»;
 *  9. (#788) el pool dice solo `candidate` o `retired`, y no guarda hechos de un proyecto (cómo importa una biblioteca, que la use): son `decide_el_proyecto`;
 * 10. (#788) los campos del bloque Q de ops/diseno/bloques.json son los de la ficha (con la correspondencia de nombres) más `decide_el_proyecto`;
 * 11. (#788) la plataforma de la ficha usa las de la taxonomía, con fuente; `requisitos` solo dice lo que se exige; las fuentes tienen id kebab y un patrón de URL;
 * 12. (#802) las dos marcas viven en un solo vocabulario, `marca`, y ningún otro las repite; los vocabularios del fichero son los que el
 *     código lee (VOCABULARIOS_DEL_POOL), y el ciclo de vida los lee del fichero solo al pedir sus textos, no al importar el módulo.
 *
 * Abajo, un autotest: cada regla falla con un dato roto a propósito. Sin red.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATOS = leerBibliotecas(RAIZ);
const TAXONOMIA = leerTaxonomia(RAIZ);
const BLOQUES = leerBloques(RAIZ);
const AGENTES = Object.keys(agentesDe(RAIZ));
const copia = (x) => JSON.parse(JSON.stringify(x));
const problemas = (d) => problemasDeBibliotecas(d, TAXONOMIA, AGENTES, BLOQUES);
const ficha = (d, id) => d.bibliotecas.find((f) => f.id === id);

describe("el pool de bibliotecas de hoy", () => {
  it("no tiene ningún problema contra la taxonomía y los agentes", () => {
    expect(problemas(DATOS), "Corrige ops/diseno/bibliotecas.json").toEqual([]);
  });

  it("el alcance inicial son 18 elementos, 13 por recuento, 1 elegido en el encargo y 4 del panel, cada uno con candidata", () => {
    expect(DATOS.alcance).toHaveLength(18);
    expect(DATOS.alcance.filter((a) => a.origen === "mobbin-count")).toHaveLength(13);
    expect(DATOS.alcance.filter((a) => a.origen === "encargo").map((a) => a.elemento).sort()).toEqual(["toast"]);
    expect(DATOS.alcance.filter((a) => a.origen === "panel").map((a) => a.elemento).sort()).toEqual(["combobox", "context-menu", "data-table", "side-navigation"]);
    for (const a of DATOS.alcance) expect(candidatasDe(DATOS, a.elemento).length, a.elemento).toBeGreaterThan(0);
  });

  it("las cifras cuadran: fichas por rol, por vínculo y por mantenimiento suman el total", () => {
    const c = cifrasDeBibliotecas(DATOS);
    const suma = (o) => Object.values(o).reduce((a, n) => a + n, 0);
    expect(c.total).toBe(DATOS.bibliotecas.length);
    expect(suma(c.por_rol)).toBe(c.total);
    expect(suma(c.por_vinculo)).toBe(c.total);
    expect(suma(c.por_mantenimiento)).toBe(c.total);
  });

  it("lo que el dossier no comprobó consta como unverified, no como relleno", () => {
    const sh = ficha(DATOS, "shadcn-ui");
    expect([sh.react.estado, sh.requisitos[0]]).toEqual(["unverified", "unverified"]);
    expect(ficha(DATOS, "nucleo").licencia.spdx).toBe("unverified");
    expect(ficha(DATOS, "nucleo").licencia.fuente).toBeNull();
    expect(ficha(DATOS, "nucleo").cubre).toEqual([]);
    expect(ficha(DATOS, "shadcn-ui").rol).toBe("unverified");
    expect(ficha(DATOS, "radix-ui").accesibilidad.wcag).toBe("unverified");
    for (const f of DATOS.bibliotecas.filter((x) => x.id !== "base-ui")) expect(f.peso.podable, f.id).toBe("unverified");
  });

  it("Web Awesome: combobox, tabla y selector de fecha son de pago, y no cuentan como candidata libre", () => {
    const wa = ficha(DATOS, "web-awesome");
    expect(wa.cubre.map((c) => [c.elemento, c.acceso])).toEqual([["combobox", "paid"], ["data-table", "paid"], ["date-picker", "paid"]]);
    expect(candidatasDe(DATOS, "combobox").map((f) => f.id)).not.toContain("web-awesome");
  });

  it("Vaul, Shoelace y Pico están retiradas, con motivo, y solo Shoelace tiene sucesora, con su fuente", () => {
    for (const id of ["vaul", "shoelace", "pico-css"]) {
      expect(ficha(DATOS, id).vinculo, id).toBe("retired");
      expect(ficha(DATOS, id).retirada.motivo.length, id).toBeGreaterThan(15);
    }
    expect(ficha(DATOS, "shoelace").retirada.sucesora).toBe("web-awesome");
    expect(ficha(DATOS, "shoelace").retirada.fuente_url).toMatch(/^https:/);
    expect(ficha(DATOS, "vaul").retirada.sucesora).toBeNull();
    expect(ficha(DATOS, "pico-css").retirada.sucesora).toBeNull();
  });

  it("los vocabularios están en el ciclo de vida: el código los registra y el registro los ancla", () => {
    const anclados = Object.keys(leerRegistro(RAIZ).anclados);
    expect(clavesDeVocabulario(DATOS).length).toBeGreaterThan(0);
    for (const k of clavesDeVocabulario(DATOS)) {
      expect(Object.keys(VOCABULARIOS), k).toContain(`diseno.biblioteca_${k}`);
      expect(anclados, k).toContain(`diseno.biblioteca_${k}`);
    }
  });

  it("el pool no guarda la versión de React de ningún proyecto: sale de package.json al pintar la cifra", () => {
    expect("base_react" in DATOS).toBe(false);
    const react = reactDePackage(RAIZ);
    expect(react).toMatch(/^\d+\.\d+$/);
    expect(cifrasDeBibliotecas(DATOS, new Date(), react).react).toBe(react);
    expect(cifrasDeBibliotecas(DATOS, new Date(), "16.8").react_compatibles).toBeGreaterThan(0);
    expect(cifrasDeBibliotecas(DATOS, new Date(), "20.0").react_compatibles).toBeLessThan(cifrasDeBibliotecas(DATOS, new Date(), "19.2").react_compatibles);
  });

  it("el React dado cabe en el rango declarado, y es null si no hay rango", () => {
    expect(cumpleReact(ficha(DATOS, "mantine"), "19.2")).toBe(true);
    expect(cumpleReact(ficha(DATOS, "konsta"), "19.2")).toBeNull();
    expect(cumpleReact(ficha(DATOS, "daisyui"), "19.2")).toBeNull();
    expect(cumpleReact({ react: { estado: "declared", desde: "16.8", hasta: "18" } }, "19.2")).toBe(false);
  });
});

describe("el esquema limpio (#788)", () => {
  it("una sola marca de «sin comprobar» y un valor aparte de «no aplica»: ningún null, unread ni cli dice «no sé»", () => {
    for (const f of DATOS.bibliotecas) {
      expect([f.version, f.peso.dependencias, f.ultimo_push].map((x) => x === null || x === "unread" || x === "cli"), f.id).toEqual([false, false, false]);
    }
    expect(ficha(DATOS, "nucleo").version).toBe("unverified");
    expect(ficha(DATOS, "nucleo").ultimo_push).toBe("unverified");
    // El dossier dice «n/a (CLI)», pero también que no comprobó si se instala como paquete o copia el código (#802): sin comprobar.
    expect([ficha(DATOS, "shadcn-ui").version, ficha(DATOS, "shadcn-ui").peso.dependencias]).toEqual([SIN_COMPROBAR, SIN_COMPROBAR]);
    expect([ficha(DATOS, "pico-css").version, ficha(DATOS, "pico-css").peso.dependencias]).toEqual(["unverified", "unverified"]);
  });

  it("el pool dice solo candidate o retired, y el uso por un proyecto no está en la ficha", () => {
    expect(Object.keys(DATOS.vocabularios.vinculo)).toEqual(["candidate", "retired"]);
    expect(Object.keys(DATOS.vocabularios)).not.toContain("importacion");
    for (const c of ["movil", "importacion", "estado_fuente"]) expect(CAMPOS_DE_FICHA, c).not.toContain(c);
    expect(DATOS.decide_el_proyecto).toEqual(["importación", "envoltorio", "reglas de uso"]);
    expect(DATOS.vocabularios.requisito).not.toHaveProperty("css");
    expect(DATOS.vocabularios.requisito).not.toHaveProperty("web-components");
  });

  it("los campos del bloque Q son de la ficha o de decide_el_proyecto, sin sobrar ni faltar", () => {
    const q = BLOQUES.bloques.find((b) => b.id === "Q").ficha;
    const deLaFicha = q.filter((c) => !DATOS.decide_el_proyecto.includes(c)).map((c) => CORRESPONDENCIA_DE_Q[c] ?? c);
    expect(deLaFicha.every((c) => CAMPOS_DE_FICHA.includes(c))).toBe(true);
    expect([...deLaFicha, ...DATOS.decide_el_proyecto].sort()).toEqual(q.map((c) => CORRESPONDENCIA_DE_Q[c] ?? c).sort());
  });

  it("la plataforma de cada ficha es una de la taxonomía o unverified, y sin comprobar no lleva URL", () => {
    for (const f of DATOS.bibliotecas) {
      expect([...Object.keys(TAXONOMIA.plataformas), SIN_COMPROBAR], f.id).toContain(f.plataforma.vale_en);
      if (f.plataforma.vale_en === SIN_COMPROBAR) expect(f.plataforma.fuente_url, f.id).toBeNull();
    }
  });

  it("las fuentes tienen id en minúsculas, una sola definición y su patrón de URL aparte", () => {
    expect(Object.keys(DATOS.vocabularios.fuente_de_dato)).toEqual(["github", "npm", "doc"]);
    expect(DATOS.lectura).not.toHaveProperty("fuentes");
    expect(Object.keys(DATOS.lectura.patron_de_url)).toEqual(["github", "npm"]);
    for (const f of DATOS.bibliotecas) {
      if (f.licencia.fuente === "npm") expect(f.licencia.fuente_url.startsWith("https://registry.npmjs.org/"), f.id).toBe(true);
      if (f.licencia.fuente === "github") expect(f.licencia.fuente_url.startsWith("https://api.github.com/repos/"), f.id).toBe(true);
    }
  });

  it("requisitos solo dice lo que se exige, y los neutrales de framework salen de ahí", () => {
    const vivas = DATOS.bibliotecas.filter((f) => f.vinculo !== "retired");
    expect(cifrasDeBibliotecas(DATOS).neutrales_de_framework).toBe(vivas.filter((f) => f.requisitos.length === 0).length);
    expect(ficha(DATOS, "web-awesome").requisitos).toEqual([]);
    expect(ficha(DATOS, "daisyui").requisitos).toEqual(["tailwind"]);
  });

  it("--react pide una versión x.y", () => {
    expect(validarReact("19.2")).toBe("19.2");
    for (const mal of [undefined, "", "19", "x.y", "--json", "19.2.1"]) expect(() => validarReact(mal), String(mal)).toThrow(/--react necesita/);
  });
});

describe("una sola marca y lectura perezosa (#802)", () => {
  it("las dos marcas viven en el vocabulario marca y ningún otro vocabulario las repite", () => {
    expect(Object.keys(DATOS.vocabularios.marca)).toEqual([SIN_COMPROBAR, NO_APLICA]);
    for (const [k, v] of Object.entries(DATOS.vocabularios)) if (k !== "marca") expect(Object.keys(v).filter((x) => x in DATOS.vocabularios.marca), k).toEqual([]);
  });

  it("los vocabularios del fichero son los que lee el código, y el ciclo de vida registra esos", () => {
    expect([...clavesDeVocabulario(DATOS)].sort()).toEqual([...VOCABULARIOS_DEL_POOL].sort());
    expect(Object.keys(VOCABULARIOS).filter((k) => k.startsWith("diseno.biblioteca_")).sort()).toEqual(VOCABULARIOS_DEL_POOL.map((k) => `diseno.biblioteca_${k}`).sort());
  });

  it("importar el ciclo de vida no lee el pool: lo lee al pedir los textos", async () => {
    const leidos = [];
    vi.resetModules();
    vi.doMock("node:fs", async (original) => {
      const m = await original();
      const readFileSync = (p, ...r) => { leidos.push(String(p).replace(/\\/g, "/")); return m.readFileSync(p, ...r); };
      return { ...m, readFileSync, default: { ...m, readFileSync } };
    });
    try {
      const vida = await import("../../scripts/lib/vocabulariosVida.mjs");
      const delPool = () => leidos.filter((p) => p.endsWith(RUTA_BIBLIOTECAS)).length;
      expect(delPool(), "al importar").toBe(0);
      expect(Object.keys(vida.VOCABULARIOS["diseno.biblioteca_marca"].textos())).toEqual([SIN_COMPROBAR, NO_APLICA]);
      expect(delPool(), "al pedir los textos (si es 0, el espía no ve las lecturas y el test no prueba nada)").toBeGreaterThan(0);
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });
});

describe("la caducidad de comprobada (90 días, como las skills)", () => {
  it("avisa de las caducadas sin poner en rojo el CI", () => {
    for (const f of DATOS.bibliotecas) {
      const c = caducidadDeFicha(f);
      if (c.estado !== "vigente") console.warn(`[pool] ${f.id} ${c.estado}: comprobada el ${f.comprobada}, hace ${c.dias} días`);
    }
  });
  it("se calcula con el plazo de las skills", () => {
    const f = { comprobada: "2026-10-14" };
    const dia = (n) => new Date(Date.parse("2026-10-14T00:00:00Z") + n * 86_400_000);
    expect(caducidadDeFicha(f, dia(PLAZO_COMPROBADO_DIAS)).estado).toBe("vigente");
    expect(caducidadDeFicha(f, dia(PLAZO_COMPROBADO_DIAS + 1)).estado).toBe("caducada");
    expect(caducidadDeFicha({ comprobada: "ayer" }).estado).toBe("sin_fecha");
  });
  it("la medida del refresco no la renueva, y su última fecha se cuenta aparte (#814)", () => {
    const f = { comprobada: "2026-10-14", medida: "2027-03-01" };
    expect(caducidadDeFicha(f, new Date("2027-03-02T00:00:00Z")).estado).toBe("caducada");
    const d = copia(DATOS);
    expect(cifrasDeBibliotecas(d).ultima_medida).toBe(d.bibliotecas.map((x) => x.medida).filter(Boolean).sort().at(-1) ?? null);
    ficha(d, "sonner").medida = "2026-10-20";
    ficha(d, "radix-ui").medida = "2026-10-21";
    expect(cifrasDeBibliotecas(d).ultima_medida).toBe("2026-10-21");
  });
  it("con la medida, ultimo_push puede ser posterior a comprobada", () => {
    const d = copia(DATOS);
    ficha(d, "sonner").medida = "2026-10-21";
    ficha(d, "sonner").ultimo_push = "2026-10-20";
    expect(problemas(d)).toEqual([]);
  });
});

describe("autotest: cada regla falla con un dato roto a propósito", () => {
  const rompe = (cambia, esperado) => {
    const d = copia(DATOS);
    cambia(d);
    const p = problemas(d);
    expect(p.length, "debería haber problema").toBeGreaterThan(0);
    expect(p.join("\n")).toContain(esperado);
  };
  it("un campo que falta", () => rompe((d) => { delete ficha(d, "sonner").rol; }, "falta rol"));
  it("un campo desconocido", () => rompe((d) => { ficha(d, "sonner").peso_kb = 3; }, "campo desconocido"));
  it("un valor fuera de vocabulario", () => rompe((d) => { ficha(d, "sonner").rol = "magia"; }, "rol «magia»"));
  it("un id repetido", () => rompe((d) => { d.bibliotecas.push(copia(ficha(d, "sonner"))); }, "id repetido"));
  it("una licencia sin URL de su fuente", () => rompe((d) => { ficha(d, "sonner").licencia.fuente_url = null; }, "licencia sin URL"));
  it("una licencia unverified con URL", () => rompe((d) => { ficha(d, "nucleo").licencia.fuente_url = "https://x.test/a"; }, "licencia sin comprobar no lleva URL"));
  it("una accesibilidad declarada sin fuente", () => rompe((d) => { ficha(d, "radix-ui").accesibilidad.fuente_url = null; }, "accesibilidad declarada sin URL"));
  it("una fecha comprobada mal formada", () => rompe((d) => { ficha(d, "sonner").comprobada = "14/10/2026"; }, "comprobada falta"));
  it("una fecha comprobada anterior a la lectura", () => rompe((d) => { ficha(d, "sonner").comprobada = "2026-01-01"; }, "anterior a la lectura"));
  it("un elemento que no está en la taxonomía", () => rompe((d) => { ficha(d, "sonner").cubre[0].elemento = "boton-magico"; }, "no es un elemento de ops/diseno/taxonomia.json"));
  it("una cobertura comprobada sin fuente", () => rompe((d) => { ficha(d, "sonner").cubre[0].fuente_url = null; }, "cobertura comprobada sin URL"));
  it("un juicio que se hace pasar por fuente", () => rompe((d) => { ficha(d, "mantine").cubre[0].fuente_url = "https://x.test/a"; }, "un juicio no lleva fuente"));
  it("una candidata archivada", () => rompe((d) => { ficha(d, "sonner").mantenimiento = "archived"; }, "solo retired"));
  it("una retirada sin motivo", () => rompe((d) => { ficha(d, "vaul").retirada.motivo = ""; }, "retirada sin motivo"));
  it("una retirada con sucesora que no existe", () => rompe((d) => { ficha(d, "vaul").retirada.sucesora = "nada"; }, "la sucesora"));
  it("una cobertura vacía sin motivo", () => rompe((d) => { ficha(d, "cmdk").motivo_sin_cobertura = null; }, "motivo_sin_cobertura"));
  it("un dueño que no es un agente", () => rompe((d) => { ficha(d, "sonner").dueno = "nadie"; }, "no es un agente"));
  it("una alternativa que no comparte elemento", () => rompe((d) => { ficha(d, "embla-carousel").alternativa = ["tanstack-table"]; }, "no comparte ningún elemento"));
  it("un elemento del alcance sin candidata ni motivo", () => rompe((d) => { for (const f of d.bibliotecas) f.cubre = f.cubre.filter((c) => c.elemento !== "context-menu"); }, "sin ninguna candidata"));
  it("un elemento del alcance con candidata y motivo", () => rompe((d) => { d.alcance[0].motivo_sin_candidata = "no hace falta ninguna candidata"; }, "lleva motivo_sin_candidata"));
  it("un vocabulario sin definición", () => rompe((d) => { d.vocabularios.rol.headless = ""; }, "sin definición"));
  it("una versión que no es x.y.z", () => rompe((d) => { ficha(d, "sonner").version = "dos"; }, "version"));
  it("un valor de rol repetido en requisito", () => rompe((d) => { d.vocabularios.requisito["single-piece"] = "Una pieza suelta"; }, "se repite en requisito"));
  it("una licencia unverified con fuente", () => rompe((d) => { ficha(d, "nucleo").licencia.fuente = "DOC"; }, "licencia sin comprobar no lleva fuente"));
  it("un acceso free con licencia sin comprobar", () => rompe((d) => { const n = ficha(d, "nucleo"); n.cubre = [{ elemento: "icon", base: "judgement", acceso: "free", fuente_url: null }]; n.motivo_sin_cobertura = null; }, "acceso free con licencia sin comprobar"));
  it("una sucesora sin fuente", () => rompe((d) => { ficha(d, "shoelace").retirada.fuente_url = null; }, "sucesora sin URL"));
  it("una fuente de sucesora sin sucesora", () => rompe((d) => { ficha(d, "vaul").retirada.fuente_url = "https://x.test/a"; }, "fuente_url sin sucesora"));
  it("una versión de React de proyecto guardada en el pool", () => rompe((d) => { d.base_react = "19.2"; }, "base_react"));
  it("un origen de alcance que el recuento no sostiene", () => rompe((d) => { d.alcance.find((a) => a.elemento === "toast").origen = "mobbin-count"; }, "fuera del top 15"));
  it("una versión unread", () => rompe((d) => { ficha(d, "nucleo").version = "unread"; }, "version"));
  it("unas dependencias null", () => rompe((d) => { ficha(d, "nucleo").peso.dependencias = null; }, "peso.dependencias"));
  it("una versión leída con dependencias sin comprobar", () => rompe((d) => { ficha(d, "sonner").peso.dependencias = "unverified"; }, "deben ser a la vez"));
  it("una versión no aplicable con dependencias contadas", () => rompe((d) => { ficha(d, "shadcn-ui").peso.dependencias = 3; }, "deben ser a la vez"));
  it("una fecha medida mal formada", () => rompe((d) => { ficha(d, "sonner").medida = "21/10/2026"; }, "medida es null o"));
  it("una fecha medida anterior a la lectura", () => rompe((d) => { ficha(d, "sonner").medida = "2026-01-01"; }, "medida es null o"));
  it("un último push posterior a las dos fechas", () => rompe((d) => { ficha(d, "sonner").medida = "2026-10-15"; ficha(d, "sonner").ultimo_push = "2026-10-16"; }, "ultimo_push es una fecha"));
  it("un último push null", () => rompe((d) => { ficha(d, "nucleo").ultimo_push = null; }, "ultimo_push"));
  it("una fuente de último push que falta", () => rompe((d) => { ficha(d, "sonner").ultimo_push_fuente = null; }, "ultimo_push_fuente va con ultimo_push"));
  it("una fuente de mantenimiento con doc, que pediría URL", () => rompe((d) => { ficha(d, "vaul").mantenimiento_fuente = "doc"; }, "mantenimiento_fuente va con mantenimiento"));
  it("una fuente de mantenimiento sin hecho", () => rompe((d) => { ficha(d, "nucleo").mantenimiento_fuente = "github"; }, "mantenimiento_fuente va con mantenimiento"));
  it("un vínculo in-use", () => rompe((d) => { ficha(d, "nucleo").vinculo = "in-use"; }, "vinculo «in-use»"));
  it("un campo de proyecto en la ficha", () => rompe((d) => { ficha(d, "sonner").importacion = "package"; }, "campo desconocido"));
  it("una plataforma fuera de la taxonomía", () => rompe((d) => { ficha(d, "sonner").plataforma.vale_en = "yes"; }, "plataforma.vale_en"));
  it("una plataforma declarada sin fuente", () => rompe((d) => { ficha(d, "sonner").plataforma.vale_en = "both"; }, "plataforma declarada sin URL"));
  it("una plataforma sin comprobar con URL", () => rompe((d) => { ficha(d, "sonner").plataforma.fuente_url = "https://x.test/a"; }, "plataforma sin comprobar no lleva URL"));
  it("un campo del bloque Q que no es de la ficha ni del proyecto", () => rompe((d) => { d.decide_el_proyecto = ["envoltorio", "reglas de uso"]; }, "bloque Q «importación»"));
  it("un campo de decide_el_proyecto que no está en el bloque Q", () => rompe((d) => { d.decide_el_proyecto.push("color"); }, "decide_el_proyecto «color»"));
  it("un campo del bloque Q a la vez de la ficha y del proyecto", () => rompe((d) => { d.decide_el_proyecto.push("licencia"); }, "a la vez"));
  it("un bloque Q que cambia sin que el pool lo sepa", () => {
    const b = copia(BLOQUES);
    b.bloques.find((x) => x.id === "Q").ficha.push("coste");
    expect(problemasDeBibliotecas(DATOS, TAXONOMIA, AGENTES, b).join("\n")).toContain("bloque Q «coste»");
  });
  it("un requisito que describe una ausencia", () => rompe((d) => { ficha(d, "sonner").requisitos = ["css"]; }, "requisitos es una lista"));
  it("un id de fuente en mayúsculas", () => rompe((d) => { d.vocabularios.fuente_de_dato.GH = "La API de GitHub"; }, "el id no es kebab"));
  it("la definición de las fuentes repetida en lectura", () => rompe((d) => { d.lectura.fuentes = { github: "algo" }; }, "lectura.fuentes"));
  it("un patrón de URL de una fuente que no existe", () => rompe((d) => { d.lectura.patron_de_url.gitlab = "https://x.test/<repo>"; }, "no es una fuente"));
  it("una URL de licencia que no sigue el patrón de su fuente", () => rompe((d) => { ficha(d, "sonner").licencia.fuente = "github"; }, "no sigue el patrón de github"));
  it("un origen encargo dentro del top 15", () => rompe((d) => { d.alcance.find((a) => a.elemento === "button").origen = "encargo"; }, "dentro del top"));
  it("un requisito unverified mezclado", () => rompe((d) => { ficha(d, "sonner").requisitos = ["react", "unverified"]; }, "unverified va solo"));
  it("una marca repetida en otro vocabulario", () => rompe((d) => { d.vocabularios.rol.unverified = "No se ha comprobado qué piezas da"; }, "vocabularios.rol.unverified: es una marca"));
  it("un vocabulario sin marca", () => rompe((d) => { delete d.vocabularios.marca; }, "vocabularios.marca"));
  it("un vocabulario que el código no lee", () => rompe((d) => { d.vocabularios.color = { rojo: "Un color de la ficha" }; }, "VOCABULARIOS_DEL_POOL"));
});
