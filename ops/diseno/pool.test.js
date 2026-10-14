import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { agentesDe } from "../../scripts/lib/agentes.mjs";
import { VOCABULARIOS } from "../../scripts/lib/vocabulariosVida.mjs";
import { PLAZO_COMPROBADO_DIAS } from "../../scripts/lib/skills.mjs";
import { CLAVES_DE_VOCABULARIO, cifrasDeBibliotecas, caducidadDeFicha, candidatasDe, cumpleReact, leerBibliotecas, problemasDeBibliotecas, reactDePackage } from "../../scripts/lib/bibliotecasDiseno.mjs";
import { leerTaxonomia } from "../../scripts/lib/taxonomiaDiseno.mjs";

/**
 * El pool de bibliotecas de interfaz (#780, línea 2 de #774): las fichas de `ops/diseno/bibliotecas.json` contra la
 * taxonomía de diseño y los agentes. Es un test booleano, sin lista de excepciones:
 *
 *  1. todos los campos de cada ficha existen y salen de su vocabulario cerrado (que lleva definición);
 *  2. la licencia lleva la URL de su fuente (o es `unverified` entera), y la accesibilidad declarada, la suya;
 *  3. `comprobada` es una fecha válida, no anterior a la lectura del dossier; su caducidad a 90 días se calcula, como la de las skills;
 *  4. cada elemento cubierto existe en ops/diseno/taxonomia.json, y una cobertura comprobada lleva fuente (un juicio, no);
 *  5. una biblioteca sin mantenimiento o archivada no puede ser candidata: solo `retired`, con motivo y sucesora si la hay;
 *  6. cada elemento del alcance tiene al menos una candidata con acceso libre o un motivo escrito;
 *  7. los vocabularios están registrados en ops/vocabularios-vida.json (ciclo de vida).
 *
 * Abajo, un autotest: cada regla falla con un dato roto a propósito. Sin red.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATOS = leerBibliotecas(RAIZ);
const TAXONOMIA = leerTaxonomia(RAIZ);
const AGENTES = Object.keys(agentesDe(RAIZ));
const copia = (x) => JSON.parse(JSON.stringify(x));
const problemas = (d) => problemasDeBibliotecas(d, TAXONOMIA, AGENTES);
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
    expect([sh.importacion, sh.react.estado, sh.requisitos[0]]).toEqual(["unverified", "unverified", "unverified"]);
    expect(ficha(DATOS, "nucleo").licencia.spdx).toBe("unverified");
    expect(ficha(DATOS, "nucleo").licencia.fuente).toBeNull();
    expect(ficha(DATOS, "nucleo").cubre[0].acceso).toBe("unverified");
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

  it("los vocabularios están en el ciclo de vida", () => {
    for (const k of CLAVES_DE_VOCABULARIO) expect(Object.keys(VOCABULARIOS), k).toContain(`diseno.biblioteca_${k}`);
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
  it("un valor de rol repetido en importacion", () => rompe((d) => { d.vocabularios.importacion["css-only"] = "Hojas de estilo"; }, "se repite en importacion"));
  it("un valor de rol repetido en requisito", () => rompe((d) => { d.vocabularios.requisito["single-piece"] = "Una pieza suelta"; }, "se repite en requisito"));
  it("una licencia unverified con fuente", () => rompe((d) => { ficha(d, "nucleo").licencia.fuente = "DOC"; }, "licencia sin comprobar no lleva fuente"));
  it("un acceso free con licencia sin comprobar", () => rompe((d) => { ficha(d, "nucleo").cubre[0].acceso = "free"; }, "acceso free con licencia sin comprobar"));
  it("una sucesora sin fuente", () => rompe((d) => { ficha(d, "shoelace").retirada.fuente_url = null; }, "sucesora sin URL"));
  it("una fuente de sucesora sin sucesora", () => rompe((d) => { ficha(d, "vaul").retirada.fuente_url = "https://x.test/a"; }, "fuente_url sin sucesora"));
  it("una versión de React de proyecto guardada en el pool", () => rompe((d) => { d.base_react = "19.2"; }, "base_react"));
  it("un origen de alcance que el recuento no sostiene", () => rompe((d) => { d.alcance.find((a) => a.elemento === "toast").origen = "mobbin-count"; }, "fuera del top 15"));
  it("un requisito unverified mezclado", () => rompe((d) => { ficha(d, "sonner").requisitos = ["react", "unverified"]; }, "unverified va solo"));
});
