import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SOBRECARGA, leerMigraciones, leerSinAplicar, sentencias, testigos, veredictos } from "./verificar-estado.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ids = (sql) => testigos(sql).crea.map((t) => `${t.tipo}|${t.id}`);

describe("leer el SQL", () => {
  it("no parte por los ; de un cuerpo $$ ni de una cadena", () => {
    const sql = "create function f() returns int as $$ begin; return 1; end $$ language plpgsql;\nselect ';';\n-- comentario; con punto y coma\nselect 2;";
    expect(sentencias(sql)).toHaveLength(3);
  });

  it("saca tabla, columnas, constraint con sus literales, política, índice, trigger, enum y cron", () => {
    const sql = `
      create table if not exists public.bot_cola (id uuid primary key);
      alter table public.bot_cola add column if not exists tipo text, add column "Raro" int;
      alter table bot_cola add constraint bot_cola_tipo_check check (tipo in ('a', 'b'));
      create policy "Leer lo suyo" on public.bot_cola for select using (true);
      create unique index if not exists bot_cola_tipo on public.bot_cola (tipo);
      create trigger t_cola before insert on public.bot_cola for each row execute function f();
      create type public.papel as enum ('owner', 'viewer');
      alter type public.papel add value if not exists 'editor';
      select cron.schedule('bot-retencion', '17 3 * * *', 'select 1');
    `;
    expect(ids(sql)).toEqual([
      "tabla|public.bot_cola",
      "columna|public.bot_cola.tipo",
      "columna|public.bot_cola.Raro",
      "constraint|public.bot_cola:bot_cola_tipo_check",
      "política|public.bot_cola:Leer lo suyo",
      "índice|public.bot_cola_tipo",
      "trigger|public.bot_cola:t_cola",
      "tipo|public.papel",
      "valor|public.papel:owner",
      "valor|public.papel:viewer",
      "valor|public.papel:editor",
      "cron|bot-retencion",
    ]);
    expect(testigos(sql).crea.find((t) => t.tipo === "constraint").literales).toEqual(["a", "b"]);
  });

  it("guarda el cuerpo de la función para compararlo", () => {
    const [f] = testigos("create or replace function public.g(x int) returns int language sql as $f$ select   x + 1 $f$;").crea;
    expect(f).toMatchObject({ tipo: "función", id: "public.g", cuerpo: "select x + 1" });
  });

  it("apunta lo que se quita", () => {
    const { quita } = testigos("alter table public.t drop constraint t_check; drop policy if exists \"p\" on public.t; drop function public.g(int);");
    expect(quita.map((t) => `${t.tipo}|${t.id}`)).toEqual(["constraint|public.t:t_check", "política|public.t:p", "función|public.g"]);
  });
});

describe("decidir", () => {
  const migs = [
    { nombre: "0001_a", ...testigos("create table public.a (id int); alter table public.a add constraint a_check check (x in ('uno'));") },
    { nombre: "0002_b", ...testigos("alter table public.a drop constraint a_check; alter table public.a add constraint a_check check (x in ('uno','dos'));") },
    { nombre: "0003_c", ...testigos("create table public.c (id int);") },
    { nombre: "0004_d", ...testigos("create table public.d (id int); create table public.e (id int);") },
  ];
  const catalogo = {
    tabla: new Map([["public.a", ""], ["public.d", ""]]),
    constraint: new Map([["public.a:a_check", "CHECK ((x = ANY (ARRAY['uno'::text])))"]]),
  };
  const v = Object.fromEntries(veredictos(migs, catalogo, new Set(["0003_c"])).map((x) => [x.nombre, x]));

  it("lo que redefine una migración posterior no cuenta para la anterior", () => {
    expect(v["0001_a"].estado).toBe("aplicada");
    expect(v["0001_a"].filas.find((f) => f.tipo === "constraint").resultado).toBe("después");
  });
  it("una constraint con la definición vieja sale distinta, no aplicada", () => {
    expect(v["0002_b"].estado).toBe("parcial");
    expect(v["0002_b"].choca).toBe(true);
  });
  it("sin aplicar y ESTADO.md de acuerdo: no choca", () => {
    expect(v["0003_c"]).toMatchObject({ estado: "sin aplicar", choca: false });
  });
  it("a medias: parcial y choca", () => {
    expect(v["0004_d"]).toMatchObject({ estado: "parcial", choca: true });
  });
});

it("una función con dos versiones vale si coincide cualquiera", () => {
  const migs = [{ nombre: "0001_f", ...testigos("create function public.f(a int) returns int language sql as $$ select 2 $$;") }];
  const catalogo = { función: new Map([["public.f", `select 1${SOBRECARGA}select 2`]]) };
  expect(veredictos(migs, catalogo, new Set())[0].estado).toBe("aplicada");
});

describe("con el repo de verdad", () => {
  const migraciones = leerMigraciones();

  it("ve testigos en casi todas las migraciones", () => {
    // Si un cambio en el lector deja de ver objetos, esto cae en picado.
    const con = migraciones.filter((m) => m.crea.length > 0).length;
    expect(con / migraciones.length).toBeGreaterThan(0.85);
  });

  it("la 0084 trae su constraint nueva con 'alta' dentro", () => {
    const m = migraciones.find((x) => x.nombre === "0084_bot_codigo_alta");
    const c = m.crea.find((t) => t.id === "public.bot_codigos:bot_codigos_tipo_check");
    expect(c.literales).toContain("alta");
  });

  it("lee la lista «Sin aplicar» de ESTADO.md", () => {
    const lista = leerSinAplicar(readFileSync(join(RAIZ, "supabase", "ESTADO.md"), "utf8"));
    expect(lista.has("0021_store_products")).toBe(true);
    expect(lista.has("0080_bot_tareas_v2")).toBe(false); // aplicada el 8 oct 2026
  });
});
