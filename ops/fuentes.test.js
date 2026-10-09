import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ficherosDeGit, directosDe } from "./ficherosGit.js";
import { isoDeCasa } from "../src/lib/dias.js";
import { ESTADOS_FUENTE, ROLES_FUENTE, TABLAS, esFechaIso, fuentesVencidas } from "../src/data/model.js";

/**
 * El registro de fuentes de datos (TABLAS de src/data/model.js, issue #249):
 * cada fuente con su rol y su ciclo de vida con fecha. Es el ÚNICO registro;
 * este test lo vigila y su mensaje dice qué hacer.
 *
 * Existe para que «antiguo / nuevo» no vuelva a significar cinco cosas.
 * Aún NO prohíbe leer una fuente retirada: eso es el issue #251.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const mapa = JSON.parse(leer("ops/MODULOS.json"));
const porId = new Map(TABLAS.map((f) => [f.id, f]));
const HOY = isoDeCasa();
/** Lo que git ve (versionado + nuevo, sin lo ignorado): lo generado por el build no cuenta. */
const FICHEROS = ficherosDeGit(RAIZ);
const SET = new Set(FICHEROS);

const migraciones = directosDe(FICHEROS, "supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => leer(f).toLowerCase()).join("\n");
const creaTabla = (t) => new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${t}\\b`).test(migraciones);
const creaVista = (v) => new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+(public\\.)?${v}\\b`).test(migraciones);

/** Expande una ruta o un patrón con * en el último tramo a los ficheros que existen. */
function expandir(ruta) {
  if (!ruta.includes("*")) return SET.has(ruta) ? [ruta] : [];
  const barra = ruta.lastIndexOf("/");
  const dir = ruta.slice(0, barra);
  const [pre, post] = ruta.slice(barra + 1).split("*");
  return directosDe(FICHEROS, dir).filter((f) => f.slice(dir.length + 1).startsWith(pre) && f.endsWith(post));
}

describe("fuentes: forma y vocabulario cerrado", () => {
  it("los ids son únicos y cada fuente trae rol y estado del vocabulario", () => {
    const vistos = new Set();
    const malos = [];
    for (const f of TABLAS) {
      if (vistos.has(f.id)) malos.push(`${f.id}: repetido`);
      vistos.add(f.id);
      if (!ROLES_FUENTE.includes(f.rol)) malos.push(`${f.id}: rol «${f.rol}»`);
      if (!ESTADOS_FUENTE.includes(f.estado)) malos.push(`${f.id}: estado «${f.estado}»`);
    }
    expect(malos, `Roles válidos: ${ROLES_FUENTE.join(", ")}. Estados: ${ESTADOS_FUENTE.join(", ")} (src/data/model.js).`).toEqual([]);
  });

  it("una copia_retirada está retirada, y solo una copia_retirada se retira", () => {
    const malos = [];
    for (const f of TABLAS) {
      if (f.rol === "copia_retirada" && f.estado !== "retirado") malos.push(`${f.id}: copia_retirada en estado «${f.estado}» (si se lee, no es una copia retirada)`);
      if (f.rol !== "copia_retirada" && f.estado === "retirado") malos.push(`${f.id}: «retirado» con rol «${f.rol}» (una fuente retirada es una copia_retirada; si aún se lee, está «deprecado»)`);
    }
    expect(malos).toEqual([]);
  });
});

describe("fuentes: ciclo de vida con fecha", () => {
  it("lo deprecado y lo retirado llevan fecha ISO real; lo vivo no", () => {
    const malos = [];
    for (const f of TABLAS) {
      if (f.estado === "vivo" && f.retirar_el !== null) malos.push(`${f.id}: vivo con \`retirar_el\`; si ya tiene fecha es «deprecado»`);
      if (f.estado !== "vivo" && !esFechaIso(f.retirar_el)) malos.push(`${f.id}: «${f.estado}» sin \`retirar_el\` válido (AAAA-MM-DD real; vale ${JSON.stringify(f.retirar_el)})`);
    }
    expect(malos, "Una fuente que se deja de usar dice cuándo: pon `retirar_el` en src/data/model.js.").toEqual([]);
  });

  it("las fuentes deprecadas con fecha pasada avisan, pero no rompen el CI de nadie", () => {
    const vencidas = fuentesVencidas(HOY);
    for (const f of vencidas) {
      console.warn(`[fuentes] «${f.id}» (${f.ruta}) estaba deprecada y debía retirarse el ${f.retirar_el}. Qué hacer: quitar sus lectores y pasarla a copia_retirada/retirado, o fijar una fecha nueva con el motivo en su nota (src/data/model.js).`);
    }
    expect(Array.isArray(vencidas)).toBe(true);
  });

  it("fuentesVencidas ve una fecha pasada, ignora una futura y no cuenta una fecha imposible", () => {
    const f = (estado, retirar_el) => ({ id: "x", estado, retirar_el });
    expect(fuentesVencidas("2026-10-09", [f("deprecado", "2026-01-01")]).length).toBe(1);
    expect(fuentesVencidas("2026-10-09", [f("deprecado", "2026-12-31")]).length).toBe(0);
    expect(fuentesVencidas("2026-10-09", [f("deprecado", "2026-13-45")]).length).toBe(0);
    expect(fuentesVencidas("2026-10-09", [f("retirado", "2026-01-01")]).length).toBe(0);
    expect(esFechaIso("2026-13-45")).toBe(false);
    expect(esFechaIso("2026-02-30")).toBe(false);
    expect(esFechaIso("2026-10-09")).toBe(true);
  });

  it("lo deprecado o retirado nombra su sustituto vivo, o dice «sin sustituto» en la nota", () => {
    const malos = [];
    for (const f of TABLAS) {
      const s = f.sustituido_por;
      if (f.estado === "vivo") { if (s) malos.push(`${f.id}: vivo con \`sustituido_por\``); continue; }
      if (s === null) {
        if (!/sin sustituto/i.test(f.nota ?? "")) malos.push(`${f.id}: «${f.estado}» sin \`sustituido_por\` y sin «sin sustituto» en la nota`);
        continue;
      }
      const dest = porId.get(s);
      if (!dest) malos.push(`${f.id}: \`sustituido_por\` apunta a «${s}», que no existe`);
      else if (dest.estado !== "vivo") malos.push(`${f.id}: su sustituto «${s}» no está vivo`);
    }
    expect(malos, "Lo que se retira dice dónde vive ahora el dato (id de otra fuente viva) o que no hay sustituto.").toEqual([]);
  });
});

describe("fuentes: lo que cita existe y nada queda sin registrar", () => {
  it("todo fichero citado existe", () => {
    const faltan = [];
    for (const f of TABLAS) {
      for (const r of f.ficheros) {
        if (r.startsWith("/") || r.includes("\\") || r.includes("..")) faltan.push(`${f.id}: ruta mal escrita «${r}»`);
        else if (!expandir(r).length) faltan.push(`${f.id}: no existe «${r}»`);
      }
    }
    expect(faltan, "Se movió o se borró algo: corrige `ficheros` en src/data/model.js (si se borró de verdad, la fuente pasa a «retirado»).").toEqual([]);
  });

  it("toda tabla y vista citada la crea alguna migración, y no figura en dos fuentes", () => {
    const malos = [];
    const dondeEsta = new Map();
    for (const f of TABLAS) {
      for (const t of f.tablas) { if (!creaTabla(t)) malos.push(`${f.id}: ninguna migración crea la tabla «${t}»`); dondeEsta.set(t, [...(dondeEsta.get(t) ?? []), f.id]); }
      for (const v of f.vistas) { if (!creaVista(v)) malos.push(`${f.id}: ninguna migración crea la vista «${v}»`); dondeEsta.set(v, [...(dondeEsta.get(v) ?? []), f.id]); }
    }
    for (const [t, ids] of dondeEsta) if (ids.length > 1) malos.push(`${t}: en ${ids.join(" y ")} (cada dato en un solo sitio)`);
    expect(malos).toEqual([]);
  });

  /** Un JSON de datos sin fuente solo se admite aquí, con su motivo. Hoy ninguno. */
  const SIN_FUENTE = {};
  it("todo JSON de src/data, derived, recipes, src/assets/dishes, api/_bot y public/store pertenece a una fuente registrada", () => {
    const registrados = new Set(TABLAS.flatMap((f) => f.ficheros.flatMap(expandir)));
    const sueltos = [];
    for (const d of ["src/data", "src/data/derived", "src/data/recipes", "src/assets/dishes", "api/_bot", "public/store"]) {
      for (const ruta of directosDe(FICHEROS, d)) {
        if (ruta.endsWith(".json") && !registrados.has(ruta) && !SIN_FUENTE[ruta]) sueltos.push(ruta);
      }
    }
    expect(sueltos, `JSON sin fuente: ${sueltos.join(", ")}. Registra cada uno en TABLAS de src/data/model.js con su rol (ingesta, fuente_de_verdad, derivado o copia_retirada) y sus \`ficheros\`.`).toEqual([]);
  });
});

describe("fuentes: las tablas copia no tienen lector vivo y las sin lector son copia", () => {
  const copias = new Set(TABLAS.filter((f) => f.rol === "copia_retirada").flatMap((f) => f.tablas));

  it("una tabla copia_retirada con módulo dueño no tiene puerta (ni app ni servidor)", () => {
    const malos = [];
    for (const t of copias) {
      const info = mapa.tablas?.[t];
      if (!info) continue;
      const conPuerta = ["app", "servidor"].filter((lado) => info.fichero_dueno?.[lado]);
      if (conPuerta.length) malos.push(`${t}: el módulo ${info.dueno} le da puerta ${conPuerta.join(" y ")}, pero es copia_retirada`);
    }
    expect(malos, "Una copia retirada no tiene lectores. Si alguien la lee, no es una copia retirada: decídelo en el issue #251.").toEqual([]);
  });

  it("toda tabla que ops/MODULOS.json declara en_desuso es una copia_retirada del registro", () => {
    const malos = [];
    for (const [t, info] of Object.entries(mapa.tablas)) {
      const enDesuso = ["app", "servidor"].some((l) => info.sin_puerta?.[l]?.motivo === "en_desuso");
      if (enDesuso && !copias.has(t)) malos.push(`${t}: en_desuso en ops/MODULOS.json pero sin entrada copia_retirada en src/data/model.js`);
    }
    expect(malos, "Una tabla sin lector es una copia retirada: regístrala en TABLAS (src/data/model.js) con su sustituto.").toEqual([]);
  });

  it("toda copia_retirada que tiene dueño en ops/MODULOS.json figura allí como en_desuso", () => {
    const malos = [];
    for (const t of copias) {
      const info = mapa.tablas?.[t];
      if (info && !["app", "servidor"].every((l) => info.sin_puerta?.[l]?.motivo === "en_desuso")) malos.push(`${t}: copia_retirada pero ops/MODULOS.json no dice en_desuso en sus dos lados`);
    }
    expect(malos, "Un solo hecho, un solo motivo: pon `en_desuso` en los dos lados de sin_puerta.").toEqual([]);
  });
});
