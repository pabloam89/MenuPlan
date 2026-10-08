import { describe, expect, it } from "vitest";

import { auditoriaDe, hashDe, motivosDePablo, motivosParaNoAplicar, VIGENCIA_MS } from "./permisoAplicar.mjs";

const OK = "-- AUDITADA: auditor-datos 2026-10-08 OK\n";
const SQL = `${OK}set lock_timeout = '5s';\ncreate table public.x (id int);\nalter table public.x enable row level security;\nrevoke all on table public.x from anon, authenticated;\n`;
const ahora = Date.parse("2026-10-08T12:00:00Z");
const hace = (ms) => new Date(ahora - ms).toISOString();
/** Un caso que pasa todo salvo lo que se cambie: el mismo SQL en local, en staging y en el ensayo. */
const con = (sql, extra = {}) => ({ nombre: "0088_x", local: sql, enStaging: sql, ensayo: { hash: hashDe(sql), at: hace(60_000) }, ahora, ...extra });
const base = con(SQL);

describe("cuándo se puede aplicar en producción", () => {
  it("en staging, idéntica, ensayada hace un minuto y con el OK del juez: sí", () => {
    expect(motivosParaNoAplicar(base)).toEqual([]);
  });

  it("los saltos de línea de Windows no la hacen distinta", () => {
    expect(motivosParaNoAplicar({ ...base, local: SQL.replace(/\n/g, "\r\n") })).toEqual([]);
  });

  it("si no está en staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, enStaging: null })[0]).toMatch(/no está en origin\/staging/);
  });

  it("si la local difiere de la de staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, local: `${SQL}create index i on public.x (id);` }).join()).toMatch(/no es igual que en origin\/staging/);
  });

  it("sin ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: null })[0]).toMatch(/No hay ensayo/);
  });

  it("si cambió después del ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe("otra cosa"), at: hace(60_000) } })[0]).toMatch(/cambió después/);
  });

  it("con el ensayo de hace más de una hora, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe(SQL), at: hace(VIGENCIA_MS + 1) } })[0]).toMatch(/más de una hora/);
  });
});

describe("el juez auditor-datos", () => {
  it("sin la línea AUDITADA, no", () => {
    expect(motivosParaNoAplicar(con(SQL.replace(OK, ""))).join()).toMatch(/pide al juez auditor-datos/);
  });

  it("con un veredicto que no es OK, no, y dice cuál", () => {
    const sql = SQL.replace("OK\n", "falta el índice de la FK\n");
    expect(motivosParaNoAplicar(con(sql)).join()).toMatch(/no dio el OK.*falta el índice de la FK/);
  });

  it("con una fecha imposible, no cuenta como auditada", () => {
    expect(auditoriaDe("-- AUDITADA: auditor-datos 2026-02-30 OK")).toBe(null);
    expect(auditoriaDe(OK)).toEqual({ fecha: "2026-10-08", veredicto: "OK" });
  });
});

describe("lo que lanza Pablo", () => {
  it("una tabla nueva con su RLS y su revoke no es de Pablo", () => {
    expect(motivosDePablo(SQL)).toEqual([]);
  });

  it("CONTRAE es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`-- CONTRAE: user_recipes.vieja, sin lector\n${SQL}`)).join()).toMatch(/la lanza Pablo/);
  });

  it("una política sobre una tabla que ya existía es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`${SQL}create policy p on public.households for select using (true);\n`)).join()).toMatch(/política de households/);
  });

  it("un grant sobre una tabla que ya existía es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`${SQL}grant select on public.persona to anon;\n`)).join()).toMatch(/grant sobre persona/);
  });

  it("security definer es de Pablo", () => {
    const sql = `${SQL}create function public.f() returns int language sql security definer as 'select 1';\n`;
    expect(motivosDePablo(sql).join()).toMatch(/security definer/);
  });

  it("--pablo levanta lo de Pablo…", () => {
    expect(motivosParaNoAplicar(con(`-- CONTRAE: x\n${SQL}`, { pablo: true }))).toEqual([]);
  });

  it("…pero no se salta al juez, ni staging, ni el ensayo", () => {
    const sql = `-- CONTRAE: x\n${SQL.replace(OK, "")}`;
    const no = motivosParaNoAplicar({ ...con(sql, { pablo: true }), enStaging: null, ensayo: null }).join("\n");
    expect(no).toMatch(/pide al juez/);
    expect(no).toMatch(/no está en origin\/staging/);
    expect(no).toMatch(/No hay ensayo/);
  });
});
