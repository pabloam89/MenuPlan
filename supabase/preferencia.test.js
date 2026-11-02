import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EJES } from "../src/data/axisRegistry.js";
import { MOTIVOS_SIN_HACER_PREFERENCIA } from "../src/lib/vocabularios.js";

/**
 * La 0109 (plan fichas con estado, trozo 14): preferencia, plan_preferencias, senal, registro_eje y los historiales,
 * con escribir_preferencias, preferencias_de_casa y las dos podas de noche. Lo que no vigilan principios.test.js
 * (FK, índices, comentarios) ni vocabularios.test.js (cada CHECK de lista con su lista de JS). La autoprueba de la
 * propia migración prueba lo que hace (crear, no duplicar, lo supuesto no pisa lo dicho, rechazar, borrar, leer,
 * decaer y podar); este test, lo que se ve en el texto.
 */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const codigo = sinComentarios(readFileSync(new URL("./migrations/0109_preferencia_senal_historial.sql", import.meta.url), "utf8"));

/** El cuerpo de una función, de su create a su $$ de cierre. */
function cuerpo(nombre) {
  const i = codigo.search(new RegExp(String.raw`create function public\.${nombre}\(`));
  expect(i, `falta la función ${nombre}`).toBeGreaterThan(-1);
  const abre = codigo.indexOf("$$", i);
  return codigo.slice(i, codigo.indexOf("$$", abre + 2) + 2);
}

const TABLAS = ["registro_eje", "plan_preferencias", "preferencia", "senal", "ticket", "precio_observado", "cocinado"];

describe("0109: preferencias, señales e historiales", () => {
  it("registro_eje es EJES (axisRegistry.js) entero: mismo id y mismo tipo, ni uno más ni uno menos", () => {
    const insert = codigo.match(/insert into public\.registro_eje \(id, tipo\) values([\s\S]*?);/);
    expect(insert, "falta el INSERT de registro_eje").not.toBeNull();
    const filas = [...insert[1].matchAll(/\('([^']+)', '([^']+)'\)/g)].map(([, id, tipo]) => [id, tipo]);
    expect(filas).toEqual(EJES.map((e) => [e.id, e.tipo]));
  });

  it("cada tabla nace con RLS y sin permisos de usuario ni políticas: solo el servidor (como operacion y sobre)", () => {
    for (const t of TABLAS) {
      expect(codigo, t).toMatch(new RegExp(String.raw`alter table public\.${t} enable row level security;`));
      expect(codigo, t).toMatch(new RegExp(String.raw`revoke all on table [^;]*public\.${t}\b[^;]* from anon, authenticated;`));
    }
    expect(codigo).not.toMatch(/create\s+policy/i);
    expect(codigo).not.toMatch(/grant\s+[^;]*\bon\s+(table\s+)?public\.(preferencia|plan_preferencias|senal|registro_eje|ticket|precio_observado|cocinado)\b/i);
  });

  it("escribe solo la service role; lee la casa (y la service role); las podas no las llama nadie más que el cron", () => {
    expect(codigo).toMatch(/revoke all on function public\.escribir_preferencias\(jsonb\) from public, anon, authenticated;\s*grant execute on function public\.escribir_preferencias\(jsonb\) to service_role;/);
    expect(codigo).toMatch(/revoke all on function public\.preferencias_de_casa\(uuid\) from public, anon, authenticated;\s*grant execute on function public\.preferencias_de_casa\(uuid\) to authenticated, service_role;/);
    for (const f of ["senal_decaer", "historial_podar"]) {
      expect(codigo).toMatch(new RegExp(String.raw`revoke all on function public\.${f}\(\) from public, anon, authenticated;`));
      expect(codigo).not.toMatch(new RegExp(String.raw`grant execute on function public\.${f}\(`));
    }
    expect(cuerpo("preferencias_de_casa")).toMatch(/household_members m where m\.household_id = p_casa and m\.user_id = auth\.uid\(\)/);
  });

  it("los motivos de sin_hacer son MOTIVOS_SIN_HACER_PREFERENCIA, y nada más", () => {
    const motivos = [...cuerpo("escribir_preferencias").matchAll(/v_motivo := '([a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(motivos)].sort()).toEqual([...MOTIVOS_SIN_HACER_PREFERENCIA].sort());
  });

  it("lo que pone el servidor no lo trae el pedido: casa, canal, autor, rechazo, operación y fechas se pisan", () => {
    const f = cuerpo("escribir_preferencias");
    for (const campo of ["household_id := v_casa", "canal := v_canal", "dicho_by := case", "rechazada_at := null", "operacion_id := v_id", "updated_at := now()"]) {
      expect(f, campo).toContain(`v_nueva.${campo}`);
    }
    expect(f).toContain("raise exception 'escribir_preferencias: un defecto no se guarda");
  });

  it("las dos podas, de noche, con sus plazos escritos una vez", () => {
    expect(codigo).toMatch(/select cron\.schedule\('senal-decaer', '[^']+', 'select public\.senal_decaer\(\)'\);/);
    expect(codigo).toMatch(/select cron\.schedule\('historial-podar', '[^']+', 'select public\.historial_podar\(\)'\);/);
    const poda = cuerpo("historial_podar");
    expect(poda).toContain("c_precios constant interval := interval '90 days'");
    expect(poda).toContain("c_cocinado constant interval := interval '1 year'");
    expect(cuerpo("senal_decaer")).toContain("c_semivida_dias constant numeric := 60");
  });
});
