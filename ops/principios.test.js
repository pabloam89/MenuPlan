import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCUMENTOS_MIGRADOS, RUTA_MD, anclaDe, componerLista, existeEn, faltasDeMigracion, generarMd, leerCatalogoPropio,
  leerPrincipiosCasa, leerTextoEn, problemasDePrincipios, seccionesNumeradas,
} from "../scripts/lib/principios.mjs";
import { leerPrincipios as leerProducto } from "../scripts/lib/principiosProducto.mjs";
import { leerJsonEn, leerRedaccion, problemasDeRedaccion } from "../scripts/lib/redaccion.mjs";

/**
 * La lista única de principios (#619, fondo #618). Falla cuando:
 *  1. un principio propio no tiene su forma fija (campos, área, nombre, enunciado, porqué, fuente,
 *     detalle con su sección de verdad, origen), o un id o un nombre se repite con un delegado;
 *  2. queda algo sin migrar: un C/I/N de la auditoría de agentes o un punto de «Pensar en datos»
 *     sin principio, o una sección numerada de docs/datos/PRINCIPIOS.md o del N0 de entidades
 *     que ningún principio cita;
 *  3. docs/PRINCIPIOS.md no sale de la lista.
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const propio = leerCatalogoPropio(RAIZ);
const datos = leerPrincipiosCasa(RAIZ);
const ctx = { existe: existeEn(RAIZ), leerTexto: leerTextoEn(RAIZ) };
const textos = Object.fromEntries(DOCUMENTOS_MIGRADOS.map((r) => [r, readFileSync(join(RAIZ, r), "utf8")]));
const delegados = { producto: leerProducto(RAIZ), redaccion: leerRedaccion(RAIZ) };

describe("ops/principios/", () => {
  it("cada principio tiene su forma fija y no se repite con los delegados", () => {
    expect(problemasDePrincipios(propio, datos.principios, ctx)).toEqual([]);
  });

  it("los delegados entran enteros, sin copiar su texto en ops/principios/", () => {
    expect(datos.principios.filter((p) => p.catalogo === "ops/principios-producto/")).toHaveLength(delegados.producto.principios.length);
    expect(datos.principios.filter((p) => p.catalogo === "ops/redaccion.json")).toHaveLength(delegados.redaccion.principios.length);
    const enunciados = new Set(propio.principios.map((p) => p.enunciado));
    expect(datos.principios.filter((p) => p.catalogo && enunciados.has(p.enunciado)).map((p) => p.id)).toEqual([]);
  });
});

describe("la migración de las cinco listas y de la auditoría de agentes", () => {
  it("no queda nada sin migrar", () => {
    expect(faltasDeMigracion(datos.principios, textos), "Cada C/I/N y cada punto de «Pensar en datos» va a un principio (origen); cada sección numerada, a un detalle").toEqual([]);
  });

  it("las secciones de los documentos migrados se leen: 21 de datos y 13 del N0", () => {
    expect(seccionesNumeradas(textos["docs/datos/PRINCIPIOS.md"]).length).toBeGreaterThanOrEqual(21);
    expect(seccionesNumeradas(textos["docs/entidades/N0-principios.md"]).length).toBeGreaterThanOrEqual(13);
  });

  it("CLAUDE.md apunta a la lista única y cada id que nombra en «Pensar en datos» existe", () => {
    const md = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
    const seccion = md.split(/^## /m).find((s) => s.startsWith("Pensar en datos"));
    expect(seccion).toBeTruthy();
    expect(seccion).toContain("docs/PRINCIPIOS.md");
    const ids = [...seccion.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    const existentes = new Set(datos.principios.map((p) => p.id));
    expect(ids.filter((id) => !existentes.has(id))).toEqual([]);
  });
});

describe("docs/PRINCIPIOS.md sale de la lista", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "PRINCIPIOS.md se genera: edita ops/principios/ y lanza `npm run principios-casa -- --escribir`").toBe(generarMd(datos));
  });

  it("lleva cada principio una vez y un cambio lo descuadra", () => {
    const md = generarMd(datos);
    for (const p of datos.principios) expect(md.split(`- \`${p.id}\` —`).length - 1, p.id).toBe(1);
    const otro = structuredClone(datos);
    otro.principios[0].enunciado = "Otro enunciado distinto que nadie escribió.";
    expect(generarMd(otro)).not.toBe(md);
  });
});

describe("se ven fallar", () => {
  const BUENO = {
    id: "ejemplo-bueno", area: "codigo", nombre: "Principio de ejemplo", enunciado: "Un principio de ejemplo dice lo que se busca en una línea.",
    porque: "Sin un porqué escrito cada uno decide a su manera.", fuente: "[I] CLAUDE.md", detalle: ["CLAUDE.md#pensar-en-datos"], origen: ["C1"],
  };
  const con = (cambios) => {
    const c = structuredClone(propio);
    c.principios = [...c.principios, { ...BUENO, ...cambios }];
    return problemasDePrincipios(c, componerLista(c, delegados).principios, ctx).join("\n");
  };

  it("el ejemplo bueno pasa", () => expect(con({})).toBe(""));

  it.each([
    ["un campo desconocido", { texto: "x" }, /campo desconocido «texto»/],
    ["sin porqué", { porque: undefined }, /«porque» es una frase/],
    ["un id con mayúsculas", { id: "Ejemplo" }, /«id» va en minúsculas/],
    ["un área fuera del vocabulario", { area: "marketing" }, /área «marketing» fuera del vocabulario/],
    ["un nombre de una palabra", { nombre: "Ejemplo" }, /«nombre» tiene de 2 a 5 palabras/],
    ["un nombre de seis palabras", { nombre: "Un principio de ejemplo muy largo" }, /«nombre» tiene de 2 a 5 palabras/],
    ["un enunciado de más de 25 palabras", { enunciado: `Un principio ${"muy ".repeat(24)}largo.` }, /«enunciado» pasa de 25 palabras/],
    ["un enunciado con dos frases", { enunciado: "Un principio dice algo. Y luego dice otra cosa." }, /«enunciado» es una sola frase/],
    ["un enunciado con punto y coma", { enunciado: "Un principio dice algo; y otra cosa más." }, /«enunciado» es una sola frase/],
    ["un enunciado con dos puntos", { enunciado: "Un principio dice algo: otra cosa más." }, /«enunciado» es una sola frase/],
    ["un enunciado con fuerza", { enunciado: "Cada tabla debe llevar su comentario." }, /palabra de fuerza \(«debe»\)/],
    ["un enunciado con DEBE en mayúsculas", { enunciado: "Cada tabla DEBE llevar su comentario." }, /palabra de fuerza/],
    ["un enunciado con «hay que»", { enunciado: "Hay que comentar cada tabla nueva." }, /palabra de fuerza \(«hay que»\)/],
    ["un enunciado en minúscula", { enunciado: "un principio de ejemplo en minúscula." }, /empieza por mayúscula/],
    ["un porqué de más de 30 palabras", { porque: `Porque ${"sí ".repeat(30)}pasa.` }, /«porque» pasa de 30 palabras/],
    ["un porqué con fuerza", { porque: "Porque conviene tenerlo así siempre." }, /palabra de fuerza \(«conviene»\)/],
    ["un nombre con punto final", { nombre: "Principio de ejemplo." }, /«nombre»/],
    ["un enunciado sin punto final", { enunciado: "Un principio de ejemplo sin punto final al acabar" }, /«enunciado» acaba en punto/],
    ["un enunciado en dos líneas", { enunciado: "Una línea larga de un principio.\nY otra más." }, /«enunciado» va en una sola línea/],
    ["una fuente sin marca", { fuente: "CLAUDE.md" }, /«fuente» es «\[F\]/],
    ["una fuente de la casa que no existe", { fuente: "[I] no/existe.md" }, /no existe en el repo/],
    ["un detalle a un fichero que no existe", { detalle: ["no/existe.md"] }, /el detalle no\/existe\.md no existe/],
    ["un detalle a una sección que no existe", { detalle: ["CLAUDE.md#seccion-inventada"] }, /no tiene la sección #seccion-inventada/],
    ["un origen inventado", { origen: ["C13"] }, /origen «C13»/],
    ["un origen de CLAUDE.md que no está en ORIGENES", { origen: ["claude:inventado"] }, /no está en ORIGENES/],
  ])("con %s", (_, cambios, trozo) => expect(con(cambios)).toMatch(trozo));

  it("un id o un nombre repetido con un delegado", () => {
    const c = structuredClone(propio);
    const prod = delegados.producto.principios[0];
    c.principios = [...propio.principios, { ...BUENO, id: prod.id }];
    expect(problemasDePrincipios(c, componerLista(c, delegados).principios, ctx).join("\n")).toMatch(/id repetido/);
    c.principios = [...propio.principios, { ...BUENO, nombre: prod.nombre }];
    expect(problemasDePrincipios(c, componerLista(c, delegados).principios, ctx).join("\n")).toMatch(/repetido con/);
  });

  it("un anexo a un principio que no existe o a uno propio", () => {
    const c = structuredClone(propio);
    c.anexos = { inventado: { origen: ["N5"] } };
    expect(problemasDePrincipios(c, componerLista(c, delegados).principios, ctx).join("\n")).toMatch(/anexo inventado: no es un principio/);
    c.anexos = { [propio.principios[0].id]: { origen: ["N5"] } };
    expect(problemasDePrincipios(c, componerLista(c, delegados).principios, ctx).join("\n")).toMatch(/es un principio propio/);
  });

  it("quitar un principio deja sin migrar su origen y sus secciones", () => {
    const sin = datos.principios.filter((p) => p.id !== "closed-vocabulary");
    const f = faltasDeMigracion(sin, textos).join("\n");
    expect(f).toMatch(/origen C4: ningún principio lo recoge/);
    expect(f).toMatch(/docs\/datos\/PRINCIPIOS\.md#4-vocabularios-cerrados: ningún principio la cita/);
  });

  it("un origen en dos principios", () => {
    const dos = datos.principios.map((p) => (p.id === "explicit-over-clever" ? { ...p, origen: ["C1"] } : p));
    expect(faltasDeMigracion(dos, textos).join("\n")).toMatch(/origen C1: lo recogen .*; un origen va a un solo principio/);
  });

  it("la guía de redacción pasa la plantilla a ops/principios/ y cae con un principio mal escrito", () => {
    const red = leerRedaccion(RAIZ);
    const k = red.catalogos.find((x) => x.fichero === "ops/principios/");
    expect(k?.forma).toBe("principio");
    const malo = structuredClone(propio);
    malo.principios[0] = { ...malo.principios[0], enunciado: "Cada sesión debe leer su estado; luego decide." };
    const leerJson = (r) => (r === "ops/principios/" ? malo : leerJsonEn(RAIZ)(r));
    const f = problemasDeRedaccion(red, { existe: existeEn(RAIZ), leerJson }).join("\n");
    expect(f).toMatch(/catálogo ops\/principios\/ · .*palabra de fuerza/);
    expect(f).toMatch(/catálogo ops\/principios\/ · .*una sola frase/);
    expect(problemasDeRedaccion(red, { existe: existeEn(RAIZ), leerJson: leerJsonEn(RAIZ) })).toEqual([]);
  });

  it("el ancla de un título es la de GitHub", () => {
    expect(anclaDe("15. Cableado: del código a la tabla")).toBe("15-cableado-del-código-a-la-tabla");
    expect(anclaDe("Qué se le pregunta a Pablo, y qué no")).toBe("qué-se-le-pregunta-a-pablo-y-qué-no");
  });
});
