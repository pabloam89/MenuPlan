/**
 * El usuario de solo lectura `consulta_lectura` (0092, issue #233) solo puede
 * leer, en todas las migraciones que lo nombren, las de hoy y las que vengan.
 *
 * Mira el texto; en el catálogo lo comprueba la propia 0092 al aplicarse (su
 * bloque final hace `raise exception` si el rol puede escribir, crear, ejecutar
 * una security definer volátil o es miembro de algún rol). Este test vigila
 * además que ese bloque siga ahí.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OP_LECTURA, ROL_LECTURA, VAR_LECTURA } from "../scripts/lib/rolLectura.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "migrations");
const ROL = ROL_LECTURA;

// Atributos de rol que no puede tener (sin el prefijo `no`).
const ATRIBUTOS = ["superuser", "createrole", "createdb", "replication", "inherit"];

/**
 * El SQL en minúsculas, sin comentarios, con los textos entre comillas
 * vaciados (`''`) y SIN quitar lo de dentro de `$$ … $$`: un `create role`
 * dentro de un `do` también cuenta.
 */
export function codigoPlano(sql) {
  let out = "";
  for (let i = 0; i < sql.length; ) {
    const resto = sql.slice(i);
    const dolar = /^\$[A-Za-z_]*\$/.exec(resto);
    if (dolar) { out += " "; i += dolar[0].length; continue; }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += "''";
      i = j + 1;
    } else if (resto.startsWith("--")) {
      const fin = sql.indexOf("\n", i);
      i = fin < 0 ? sql.length : fin;
    } else if (resto.startsWith("/*")) {
      const fin = sql.indexOf("*/", i + 2);
      i = fin < 0 ? sql.length : fin + 2;
    } else {
      out += sql[i++];
    }
  }
  return out.toLowerCase();
}

const nombra = (s) => new RegExp(String.raw`(?<![\w$])${ROL}(?![\w$])`).test(s);

/** Lo que no puede pasar en el SQL para este rol. Vacío = bien. */
export function fallosDelRol(sqlCrudo) {
  const f = [];
  const sents = codigoPlano(sqlCrudo).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const s of sents) {
    if (!nombra(s)) continue;
    // grant <privilegios> on … to consulta_lectura: solo select y usage.
    const g = /\bgrant (.+?) on (.+?) to (.+)$/.exec(s);
    if (g && nombra(g[3])) {
      for (const p of g[1].split(",").map((x) => x.trim().split(" ")[0])) if (!["select", "usage"].includes(p)) f.push(`concede ${p}`);
    }
    // grant <rol> to consulta_lectura: ninguna pertenencia (pg_signal_backend, pg_monitor…).
    const m = /\bgrant ([\w", ]+) to (.+)$/.exec(s);
    if (m && !g && nombra(m[2])) f.push(`le hace miembro de ${m[1]}`);
    // create/alter role consulta_lectura … superuser, replication…
    const r = new RegExp(String.raw`\b(?:create|alter) (?:role|user) ${ROL}\b(.*)$`).exec(s);
    if (r) {
      for (const a of ATRIBUTOS) if (new RegExp(String.raw`(?<![\w])${a}\b`).test(r[1])) f.push(`le da ${a}`);
      if (/\bpassword\b/.test(r[1])) f.push("lleva contraseña en el repo");
      if (/\bset default_transaction_read_only\s*(?:=|to)\s*(?:off|false|''|0)/.test(r[1])) f.push("le quita el read only");
      if (/\bin (?:role|group)\b/.test(r[1])) f.push("le hace miembro de un rol");
    }
    if (new RegExp(String.raw`\balter group [\w"]+ add user .*\b${ROL}\b`).test(s)) f.push("le hace miembro de un rol");
  }
  return f;
}

const migraciones = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const conRol = migraciones.filter((f) => new RegExp(String.raw`\b${ROL}\b`).test(fs.readFileSync(path.join(DIR, f), "utf8")));

describe("consulta_lectura solo lee", () => {
  it("lo crea la 0092", () => {
    expect(conRol[0]).toMatch(/^0092_/);
  });

  for (const f of conRol) {
    it(`${f}: ni escribe, ni es miembro de nada, ni lleva contraseña`, () => {
      expect(fallosDelRol(fs.readFileSync(path.join(DIR, f), "utf8"))).toEqual([]);
    });
  }

  it("la 0092 pone las dos barreras de sesión y comprueba el catálogo al aplicarse", () => {
    const sql = fs.readFileSync(path.join(DIR, conRol[0]), "utf8");
    expect(sql).toMatch(/^alter role consulta_lectura set default_transaction_read_only = on;/m);
    expect(sql).toMatch(/^alter role consulta_lectura set statement_timeout = '\d+s';/m);
    expect(sql).toMatch(/^alter role consulta_lectura set idle_session_timeout = '\d+s';/m);
    // El bloque de comprobación: cada «no» de la base, con su raise exception.
    for (const pieza of ["pg_auth_members", "has_table_privilege", "has_schema_privilege(r.oid, n.oid, 'CREATE')", "prosecdef", "rolreplication"]) {
      expect(sql, pieza).toContain(pieza);
    }
  });

  it("la plantilla de .env.local trae la dirección del usuario de lectura (la ficha existe desde el 9 oct 2026)", () => {
    const plantilla = fs.readFileSync(path.join(AQUI, "..", "ops", "env.1password"), "utf8");
    expect(plantilla.split(/\r?\n/)).toContain(`${VAR_LECTURA}=${OP_LECTURA}`);
  });

  it("caza lo que no debe pasar (cada caso, una cosa)", () => {
    const bien = "set lock_timeout = '5s';\ngrant usage on schema public to consulta_lectura;\ngrant select on all tables in schema public to consulta_lectura;\n";
    expect(fallosDelRol(bien)).toEqual([]);
    for (const [malo, regla] of [
      ["grant insert on public.households to consulta_lectura;", /concede insert/],
      ["grant select, update on all tables in schema public to consulta_lectura;", /concede update/],
      ["grant delete on public.households to consulta_lectura;", /concede delete/],
      ["grant truncate on public.households to consulta_lectura;", /concede truncate/],
      ["grant all on schema public to consulta_lectura;", /concede all/],
      ["alter default privileges for role postgres in schema public grant insert on tables to consulta_lectura;", /concede insert/],
      ["grant pg_signal_backend to consulta_lectura;", /miembro de pg_signal_backend/],
      ["grant pg_read_server_files, pg_monitor to consulta_lectura;", /miembro de pg_read_server_files, pg_monitor/],
      ["grant postgres to consulta_lectura;", /miembro de postgres/],
      ["alter role consulta_lectura replication;", /le da replication/],
      ["alter role consulta_lectura with superuser;", /le da superuser/],
      ["create role consulta_lectura login password 'x';", /contraseña/],
      ["alter role consulta_lectura set default_transaction_read_only = off;", /read only/],
    ]) {
      expect(fallosDelRol(bien + malo), malo).toEqual([expect.stringMatching(regla)]);
    }
    // Con «no» delante, los atributos están bien.
    expect(fallosDelRol("alter role consulta_lectura with login nocreatedb nocreaterole noinherit noreplication bypassrls;")).toEqual([]);
  });
});
