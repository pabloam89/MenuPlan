import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { motivoParaNoLeer, avisosDeRetiradas } from "./lib/consulta.mjs";
import { TABLAS } from "../src/data/model.js";

describe("npm run consulta solo lee", () => {
  it("deja pasar lecturas", () => {
    for (const q of [
      "select count(*) from households",
      "with x as (select 1) select * from x;",
      "show log_min_messages",
      "select 'delete from x' as texto", // la palabra va dentro de un texto
      "-- update en un comentario\nselect 1",
    ]) expect(motivoParaNoLeer(q), q).toBe(null);
  });

  it("para escrituras, varias sentencias y lo que no es lectura", () => {
    expect(motivoParaNoLeer("delete from households")).toMatch(/Solo lectura/);
    expect(motivoParaNoLeer("select 1; delete from households")).toMatch(/Una sola sentencia/);
    expect(motivoParaNoLeer("with b as (delete from households returning *) select * from b")).toMatch(/escribe/);
    expect(motivoParaNoLeer("select set_config('x','y',false); update t set a=1")).toMatch(/Una sola sentencia/);
    expect(motivoParaNoLeer("")).toMatch(/vacía/);
  });

  it("el truco del juez del PR #223: un -- dentro de una cadena no esconde lo que viene después", () => {
    expect(motivoParaNoLeer("select '--'; commit; begin read write; delete from households; commit")).not.toBe(null);
    expect(motivoParaNoLeer("select '/*'; delete from households; select '*/'")).not.toBe(null);
    expect(motivoParaNoLeer("select $$--$$; commit")).not.toBe(null);
    expect(motivoParaNoLeer("select 'it''s'; commit")).not.toBe(null);
  });

  it("para lo que read only no impide: señales, replicación, sesión, red", () => {
    for (const q of [
      "select pg_terminate_backend(pid) from pg_stat_activity",
      "select pg_create_physical_replication_slot('x', true)",
      "select set_config('role','postgres',false)",
      "select pg_advisory_lock(1)",
      "select net.http_get('https://x')",
      "select cron.schedule('x','* * * * *','select 1')",
    ]) expect(motivoParaNoLeer(q), q).not.toBe(null);
  });

  it("las tres formas de esconder una función del re-juicio del PR #223", () => {
    for (const q of [
      "select E'\\'' as a, pg_sleep(0)::text as b --'",
      'select "pg_sleep"(0)::text',
      "select 1 as x$$, pg_sleep(0)::text as y$$",
      // Tercer juicio: un nombre con escape Unicode y SQL armado desde un texto.
      `select U&"pg!005fsleep" UESCAPE '!' (0)::text as b`,
      "select query_to_xml('select pg_' || 'sleep(0)::text as b', true, false, '')::text",
    ]) expect(motivoParaNoLeer(q), q).not.toBe(null);
  });

  it("case … end y explain analyze son lecturas", () => {
    expect(motivoParaNoLeer("select case when 1 = 1 then 'a' end")).toBe(null);
    expect(motivoParaNoLeer("explain analyze select 1")).toBe(null);
  });

  it("el script manda la consulta por el protocolo extendido, que no admite varias sentencias", () => {
    const fuente = readFileSync(new URL("./consulta.mjs", import.meta.url), "utf8");
    expect(fuente).toMatch(/client\.query\(\{ text: sql, values: \[\] \}\)/);
  });

  it("los permisos dejan lanzarla sin preguntar, y la autorización está escrita", () => {
    const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
    expect(settings.permissions.allow).toContain("Bash(npm run *)");
    const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
    expect(claude).toMatch(/Autorizado de forma permanente/);
    expect(claude).toMatch(/npm run consulta/);
  });
});

// Los nombres van sueltos y la SQL se arma con estos ayudantes: ops/lecturasRetiradas.test.js
// busca lecturas de fuentes retiradas y un ejemplo escrito entero lo tomaría por una.
const sel = (t) => ["select *", "from", t].join(" ");
// Los nombres salen del registro (y no se escriben aquí) por la misma razón.
const de = (id) => TABLAS.find((t) => t.id === id);
const R = de("copiaRecetasSupabase").tablas[0];
const RI = de("copiaRecetasSupabase").tablas[1];
const FOTOS = de("copiaFotosSupabase").tablas[0];
const ING = de("copiaIngredientesSupabase").tablas[0];

describe("npm run consulta avisa de las copias retiradas, sin negarlas (#292)", () => {
  it("una tabla retirada avisa y nombra la fuente que la sustituye", () => {
    const a = avisosDeRetiradas(sel(R) + " limit 1");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(new RegExp("^La tabla " + R + " es una copia retirada"));
    expect(a[0]).toMatch(/borrada en la 0093/);
    expect(a[0]).toMatch(/sustituye es recetas/);
    expect(avisosDeRetiradas(sel("x") + " join " + FOTOS + " d on true")[0]).toMatch(/fotosPlatos/);
    expect(avisosDeRetiradas("insert into " + ING + " select 1")[0]).toMatch(/ingredientes/); // INTO
  });

  it("una vista retirada también avisa", () => {
    expect(avisosDeRetiradas(sel(de("copiaAlergenosSupabase").vistas[0]))[0]).toMatch(/^La vista /);
  });

  it("una tabla viva no avisa", () => {
    expect(avisosDeRetiradas(sel("households"))).toEqual([]);
    expect(avisosDeRetiradas(sel(R + "_extra"))).toEqual([]); // otro nombre, no el mismo
  });

  it("mayúsculas, minúsculas, esquema y alias", () => {
    expect(avisosDeRetiradas(sel(R.toUpperCase() + " r").toUpperCase())).toHaveLength(1);
    expect(avisosDeRetiradas(sel("public." + R + " r"))).toHaveLength(1);
    expect(avisosDeRetiradas(sel("public." + R + " r join public." + RI + " i on true"))).toHaveLength(2);
  });

  it("solo en un comentario o en una cadena no avisa", () => {
    expect(avisosDeRetiradas("select 1 -- " + sel(R) + "\nselect 2")).toEqual([]);
    expect(avisosDeRetiradas("select 1 /* " + sel(R) + " */")).toEqual([]);
    expect(avisosDeRetiradas("select '" + sel(R) + "' as t")).toEqual([]);
  });

  it("listas con coma, table y nombres entre comillas dobles", () => {
    expect(avisosDeRetiradas(sel("households h, " + R + " r"))).toHaveLength(1);
    expect(avisosDeRetiradas(sel("households, public." + R))).toHaveLength(1);
    expect(avisosDeRetiradas("table " + R)).toHaveLength(1);
    expect(avisosDeRetiradas(sel('"' + R + '"'))).toHaveLength(1);
    expect(avisosDeRetiradas(sel('public."' + R + '" r'))).toHaveLength(1);
    // una coma de lista de columnas no es una tabla
    expect(avisosDeRetiradas("select a, " + R + " from households")).toEqual([]);
    expect(avisosDeRetiradas(sel("households where x in (1, 2) and y = 3, " + R))).toEqual([]);
  });

  it("solo avisan las fuentes retiradas del registro que se le pasa", () => {
    const viva = { id: "x", estado: "vivo", rol: "derivado", tablas: ["mesa_x"], vistas: [], sustituido_por: null, nota: "" };
    const muerta = { ...viva, estado: "retirado", rol: "copia_retirada", sustituido_por: "otra" };
    expect(avisosDeRetiradas(sel("mesa_x"), [viva])).toEqual([]);
    expect(avisosDeRetiradas(sel("mesa_x"), [muerta])).toHaveLength(1);
  });

  it("avisar no es negar: motivoParaNoLeer sigue dejando pasar la lectura", () => {
    expect(motivoParaNoLeer(sel(R))).toBe(null);
  });

  it("lee el registro: toda tabla de una fuente retirada avisa", () => {
    const retiradas = TABLAS.filter((t) => t.estado === "retirado" || t.rol === "copia_retirada");
    const nombres = retiradas.flatMap((t) => [...t.tablas, ...t.vistas]);
    expect(nombres.length).toBeGreaterThan(0);
    for (const n of nombres) expect(avisosDeRetiradas(sel(n)), n).toHaveLength(1);
  });

  it("el script imprime los avisos por stderr y no cambia el código de salida", () => {
    const fuente = readFileSync(new URL("./consulta.mjs", import.meta.url), "utf8");
    expect(fuente).toMatch(/avisosDeRetiradas\(sql\)/);
    expect(fuente).toMatch(/console\.error\(av\)/);
  });
});
