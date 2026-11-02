import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Trozo 20 de #1037: la 0121 avisa por Realtime al subir bot_rev, y solo la casa oye su tema.
const sql = readFileSync(new URL("./migrations/0121_senal_de_casa.sql", import.meta.url), "utf8");
const sinComentarios = sql.replace(/--.*$/gm, "");

describe("0121: la señal de la casa", () => {
  it("avisa tras subir bot_rev, venga de donde venga, y solo si cambió", () => {
    expect(sinComentarios).toMatch(/after update of bot_rev on public\.household_state\s+for each row\s+when \(new\.bot_rev is distinct from old\.bot_rev\)/);
  });

  it("el tema es privado (el último argumento de realtime.send)", () => {
    expect(sinComentarios).toMatch(/realtime\.send\([^;]*, true\)/);
  });

  it("solo los de la casa la oyen: la política pasa por _puede_oir_casa, que mira el tema antes de convertirlo a uuid", () => {
    expect(sinComentarios).toMatch(/create policy casa_oye_su_senal on realtime\.messages\s+for select to authenticated\s+using \(realtime\.messages\.extension = 'broadcast' and public\._puede_oir_casa\(\(select realtime\.topic\(\)\)\)\)/);
    const cuerpo = sinComentarios.slice(sinComentarios.indexOf("function public._puede_oir_casa"));
    expect(cuerpo.indexOf("!~ '^casa:")).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("!~ '^casa:")).toBeLessThan(cuerpo.indexOf("::uuid"));
    expect(cuerpo).toContain("public.is_household_member(");
  });

  it("nadie de fuera llama al disparador; la comprobación, solo con sesión", () => {
    expect(sinComentarios).toContain("revoke all on function public._avisar_rev_de_casa() from public, anon, authenticated;");
    expect(sinComentarios).toContain("revoke all on function public._puede_oir_casa(text) from public, anon, authenticated;");
    expect(sinComentarios).not.toMatch(/grant [^;]*_avisar_rev_de_casa/);
  });
});
