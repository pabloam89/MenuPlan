import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES_FUENTE, ESTADOS_FUENTE } from "../src/lib/vocabularios.js";

/**
 * Las fuentes de datos del catálogo (`fuentes_de_datos` de ops/MODULOS.json,
 * issue #249): cada una con su rol y su ciclo de vida con fecha.
 *
 * Existe para que «antiguo / nuevo» no vuelva a significar cinco cosas. Cuando
 * este test se pone rojo, el mensaje dice qué tocar: casi siempre es editar
 * `fuentes_de_datos` en el mismo PR que movió o retiró algo.
 *
 * Aún NO prohíbe leer una fuente retirada: eso es el issue #251.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const mapa = JSON.parse(leer("ops/MODULOS.json"));
const fuentes = mapa.fuentes_de_datos ?? [];
const porId = new Map(fuentes.map((f) => [f.id, f]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** La fecha de hoy en ISO (UTC basta: el margen es de días). Se puede fijar para probar. */
const HOY = new Date().toISOString().slice(0, 10);

const migraciones = readdirSync(join(RAIZ, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => leer(`supabase/migrations/${f}`).toLowerCase()).join("\n");
const creaTabla = (t) => new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${t}\\b`).test(migraciones);
const creaVista = (v) => new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+(public\\.)?${v}\\b`).test(migraciones);

describe("fuentes_de_datos: forma y vocabulario cerrado", () => {
  it("las definiciones del JSON dicen lo mismo que las constantes de src/lib/vocabularios.js", () => {
    const aviso = "Si añades un valor, ponlo en la constante de src/lib/vocabularios.js Y en `vocabularios` de ops/MODULOS.json con su definición.";
    expect(Object.keys(mapa.vocabularios.roles_fuente), aviso).toEqual(ROLES_FUENTE);
    expect(Object.keys(mapa.vocabularios.estados_fuente), aviso).toEqual(ESTADOS_FUENTE);
  });

  it("los ids son únicos y con forma de id", () => {
    const vistos = new Set();
    const malos = [];
    for (const f of fuentes) {
      if (!/^[a-z][a-z0-9_]*$/.test(f.id ?? "")) malos.push(`${f.id}: forma de id (minúsculas, números y _)`);
      if (vistos.has(f.id)) malos.push(`${f.id}: repetido`);
      vistos.add(f.id);
    }
    expect(fuentes.length, "Falta la sección `fuentes_de_datos` en ops/MODULOS.json").toBeGreaterThan(0);
    expect(malos, "Cada fuente necesita un `id` estable y distinto.").toEqual([]);
  });

  it("cada fuente trae id, qué es, rol y estado dentro del vocabulario, y una nota", () => {
    const malos = [];
    for (const f of fuentes) {
      for (const c of ["que_es", "nota"]) if (typeof f[c] !== "string" || f[c].trim().length < 15) malos.push(`${f.id}: falta «${c}» (una frase)`);
      if (!ROLES_FUENTE.includes(f.rol)) malos.push(`${f.id}: rol «${f.rol}»`);
      if (!ESTADOS_FUENTE.includes(f.estado)) malos.push(`${f.id}: estado «${f.estado}»`);
      const contenido = ["ficheros", "tablas", "vistas"].filter((c) => Array.isArray(f[c]) && f[c].length);
      if (!contenido.length) malos.push(`${f.id}: debe citar al menos uno de ficheros, tablas o vistas`);
    }
    expect(malos, `Roles válidos: ${ROLES_FUENTE.join(", ")}. Estados: ${ESTADOS_FUENTE.join(", ")}. Definiciones en \`vocabularios\` de ops/MODULOS.json.`).toEqual([]);
  });

  it("una copia_retirada nunca está «vivo», y lo que no es copia_retirada nunca está «retirado»", () => {
    const malos = [];
    for (const f of fuentes) {
      if (f.rol === "copia_retirada" && f.estado === "vivo") malos.push(`${f.id}: copia_retirada en estado «vivo» (si se lee, no es una copia retirada; si no, «retirado»)`);
      if (f.rol !== "copia_retirada" && f.estado !== "vivo") malos.push(`${f.id}: rol «${f.rol}» en estado «${f.estado}» (solo una copia_retirada se deprecia o se retira)`);
    }
    expect(malos).toEqual([]);
  });
});

describe("fuentes_de_datos: ciclo de vida con fecha", () => {
  it("lo deprecado lleva fecha de retirada (ISO) y lo vivo no la lleva", () => {
    const malos = [];
    for (const f of fuentes) {
      const tiene = f.retirar_el !== null && f.retirar_el !== undefined;
      if (f.estado === "deprecado" && !(typeof f.retirar_el === "string" && ISO.test(f.retirar_el) && !Number.isNaN(Date.parse(f.retirar_el)))) {
        malos.push(`${f.id}: deprecado sin \`retirar_el\` válido (AAAA-MM-DD)`);
      }
      if (f.estado === "vivo" && tiene) malos.push(`${f.id}: vivo con \`retirar_el\`; si ya tiene fecha, es «deprecado»`);
      if (f.estado === "retirado" && tiene && !ISO.test(f.retirar_el)) malos.push(`${f.id}: \`retirar_el\` mal escrito «${f.retirar_el}»`);
    }
    expect(malos, "Una fuente deprecada dice cuándo se quita: pon `retirar_el` con la fecha en ISO.").toEqual([]);
  });

  it("ninguna fuente deprecada ha pasado su fecha de retirada", () => {
    const vencidas = fuentes.filter((f) => f.estado === "deprecado" && typeof f.retirar_el === "string" && f.retirar_el < HOY);
    expect(
      vencidas.map((f) => `${f.id}: debía retirarse el ${f.retirar_el}`),
      "Fecha pasada: o se retira de verdad (se borran los lectores y pasa a «retirado») o se decide una fecha nueva en el mismo PR, con motivo en la nota.",
    ).toEqual([]);
  });

  it("lo deprecado o retirado nombra su sustituto, y ese sustituto existe y está vivo", () => {
    const malos = [];
    for (const f of fuentes) {
      if (f.estado === "vivo") {
        if (f.sustituido_por) malos.push(`${f.id}: vivo con \`sustituido_por\` (¿está deprecado?)`);
        continue;
      }
      const s = f.sustituido_por;
      if (typeof s !== "string" || !s) { malos.push(`${f.id}: «${f.estado}» sin \`sustituido_por\``); continue; }
      const dest = porId.get(s);
      if (!dest) malos.push(`${f.id}: \`sustituido_por\` apunta a «${s}», que no existe en fuentes_de_datos`);
      else if (dest.estado !== "vivo") malos.push(`${f.id}: su sustituto «${s}» no está vivo`);
      else if (s === f.id) malos.push(`${f.id}: se sustituye a sí misma`);
    }
    expect(malos, "Lo que se retira dice dónde vive ahora el dato: el id de otra fuente viva de `fuentes_de_datos`.").toEqual([]);
  });
});

describe("fuentes_de_datos: lo que cita existe", () => {
  it("todo fichero citado existe (rutas relativas y con /)", () => {
    const faltan = [];
    for (const f of fuentes) {
      for (const r of f.ficheros ?? []) {
        if (typeof r !== "string" || r.startsWith("/") || r.includes("\\") || r.includes("..")) faltan.push(`${f.id}: ruta mal escrita «${r}»`);
        else if (!existsSync(join(RAIZ, r))) faltan.push(`${f.id}: no existe «${r}»`);
      }
    }
    expect(faltan, "Se movió o se borró algo: corrige la ruta en `fuentes_de_datos` (si se borró de verdad, la fuente pasa a «retirado» y deja de citarlo).").toEqual([]);
  });

  it("toda tabla y vista citada la crea alguna migración", () => {
    const faltan = [];
    for (const f of fuentes) {
      for (const t of f.tablas ?? []) if (!creaTabla(t)) faltan.push(`${f.id}: ninguna migración crea la tabla «${t}»`);
      for (const v of f.vistas ?? []) if (!creaVista(v)) faltan.push(`${f.id}: ninguna migración crea la vista «${v}»`);
    }
    expect(faltan, "Las tablas se citan por su nombre real en supabase/migrations.").toEqual([]);
  });

  it("una tabla no figura en dos fuentes", () => {
    const dondeEsta = new Map();
    for (const f of fuentes) for (const t of [...(f.tablas ?? []), ...(f.vistas ?? [])]) dondeEsta.set(t, [...(dondeEsta.get(t) ?? []), f.id]);
    const dobles = [...dondeEsta].filter(([, ids]) => ids.length > 1).map(([t, ids]) => `${t}: en ${ids.join(" y ")}`);
    expect(dobles, "Cada dato en un solo sitio: una tabla pertenece a una sola fuente.").toEqual([]);
  });
});

describe("fuentes_de_datos: las tablas copia no tienen lector vivo", () => {
  it("una tabla copia_retirada con módulo dueño no tiene puerta (ni app ni servidor), o la fuente se lo explica", () => {
    const malos = [];
    for (const f of fuentes.filter((x) => x.rol === "copia_retirada")) {
      for (const t of f.tablas ?? []) {
        const info = mapa.tablas?.[t];
        if (!info) continue; // sin dueño de módulo: nada que contradecir
        const conPuerta = ["app", "servidor"].filter((lado) => info.fichero_dueno?.[lado]);
        if (conPuerta.length) malos.push(`${t} (${f.id}): el módulo ${info.dueno} le da puerta ${conPuerta.join(" y ")}, pero es copia_retirada. Quita la puerta (pasa a null con motivo en_desuso) o saca la tabla de copia_retirada`);
        const sinMotivo = ["app", "servidor"].filter((lado) => info.sin_puerta?.[lado] && !["en_desuso", "no_la_usa"].includes(info.sin_puerta[lado].motivo));
        if (sinMotivo.length) malos.push(`${t} (${f.id}): sin puerta por «${info.sin_puerta[sinMotivo[0]].motivo}», que sugiere un lector; debería ser en_desuso o no_la_usa`);
      }
    }
    expect(malos, "Una copia retirada no tiene lectores. Si ahora alguien la lee, no es una copia retirada: decídelo en el issue #251.").toEqual([]);
  });
});
