import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  avisosDeLimpieza,
  ficheroPendientes,
  fusionarPendientes,
  guardarPendientes,
  leerPendientes,
  problemaDelBorrado,
  salidaDeProblemas,
  terminada,
  worktreesVivos,
} from "./limpiar-worktrees.mjs";

// #141: tras un merge, la limpieza quitó C:\dev\MenuPlan-estado-0088 de
// `git worktree list` pero la carpeta siguió en disco, y como al arrancar va
// en silencio, nadie se enteró.
describe("limpiar-worktrees: lo que no pudo borrar se dice (#141)", () => {
  const dir = "C:\\dev\\MenuPlan-estado-0088";
  const rama = "datos/estado-0088";

  it("git la quita de su lista pero la carpeta sigue: es un problema", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(p).toMatchObject({ dir, rama });
    expect(p.motivo).toMatch(/sigue en disco/);
  });
  it("el remove falla y la carpeta sigue: es un problema", () =>
    expect(problemaDelBorrado({ dir, rama, quitado: false, sigue: true }).motivo).toMatch(/falló/));
  it("la carpeta ya no está: no hay problema", () =>
    expect(problemaDelBorrado({ dir, rama, quitado: true, sigue: false })).toBeNull());

  it("lo imprime siempre (no hay modo silencio para esto)", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(salidaDeProblemas([p])).toContain(dir);
    expect(salidaDeProblemas([])).toBe("");
  });
  it("tras un merge (PostToolUse) va como contexto adicional, que es lo que llega a la sesión", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const salida = JSON.parse(salidaDeProblemas([p], { hook: true }));
    expect(salida.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(salida.hookSpecificOutput.additionalContext).toContain(dir);
  });

  it("lo pendiente se guarda mientras la carpeta siga en disco, y sin repetir", () => {
    const viejo = { dir: "C:\\dev\\MenuPlan-vieja", rama: "ops/vieja", motivo: "x" };
    const ya = { dir: "C:\\dev\\MenuPlan-borrada", rama: "ops/borrada", motivo: "x" };
    const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const repetido = { ...nuevo, dir: dir.toUpperCase(), motivo: "antes" };
    const existe = (d) => d !== ya.dir;
    const r = fusionarPendientes([viejo, ya, repetido], [nuevo], existe);
    expect(r.map((p) => p.dir).sort()).toEqual([dir, viejo.dir].sort());
    expect(r.find((p) => p.dir === dir).motivo).toBe(nuevo.motivo);
  });

  it("el arranque lo enseña con un AVISO por carpeta que siga en disco", () => {
    const p = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    expect(avisosDeLimpieza([p], () => true)).toEqual([expect.stringMatching(/^AVISO: .*MenuPlan-estado-0088/)]);
    expect(avisosDeLimpieza([p], () => false)).toEqual([]);
  });

  // Revisor del PR #186: si la ruta se reutiliza, el aviso mandaba borrar un
  // worktree vivo. Secuencia: la limpieza falla y lo apunta; Pablo borra la
  // carpeta a mano; `npm run tarea` crea otra en la MISMA ruta.
  it("una ruta que vuelve a ser un worktree vivo sale del registro y del aviso", () => {
    const apuntado = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
    const existe = () => true; // la carpeta nueva de `tarea` existe
    const vivos = worktreesVivos(`worktree C:/dev/MenuPlan\nHEAD abc\nbranch refs/heads/staging\n\nworktree C:/dev/MenuPlan-estado-0088\nHEAD def\nbranch refs/heads/datos/otra\n`);
    expect(fusionarPendientes([apuntado], [], existe, vivos)).toEqual([]);
    expect(avisosDeLimpieza([apuntado], existe, vivos)).toEqual([]);
    // y una huérfana de verdad sigue saliendo
    expect(avisosDeLimpieza([{ ...apuntado, dir: "C:\\dev\\MenuPlan-huerfana" }], existe, vivos)).toHaveLength(1);
  });

  it("guardar: vuelve a leer justo antes de escribir, conserva lo de otra limpieza y no deja temporales", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      const otra = { dir: "C:\\dev\\MenuPlan-otra", rama: "ops/otra", motivo: "m" };
      writeFileSync(ficheroPendientes(comun), JSON.stringify([otra])); // la escribió otra limpieza a la vez
      const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
      guardarPendientes(comun, [nuevo], { existe: () => true, vivos: new Set() });
      expect(leerPendientes(comun).map((p) => p.dir).sort()).toEqual([otra.dir, dir].sort());
      expect(readdirSync(comun)).toEqual(["claude-limpieza.json"]);
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });

  it("guardar: un registro corrupto se reescribe y lo dice", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      writeFileSync(ficheroPendientes(comun), "{roto");
      const nuevo = problemaDelBorrado({ dir, rama, quitado: true, sigue: true });
      const r = guardarPendientes(comun, [nuevo], { existe: () => true, vivos: new Set() });
      expect(r.corrupto).toBeTruthy();
      expect(leerPendientes(comun)).toEqual([nuevo]);
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });

  it("lee el registro de la carpeta común; sin registro, nada; corrupto, lanza (y quien lee avisa)", () => {
    const comun = mkdtempSync(join(tmpdir(), "limpieza-"));
    try {
      expect(leerPendientes(comun)).toEqual([]);
      writeFileSync(ficheroPendientes(comun), JSON.stringify([{ dir, rama, motivo: "m" }]));
      expect(leerPendientes(comun)).toEqual([{ dir, rama, motivo: "m" }]);
      writeFileSync(ficheroPendientes(comun), "{roto");
      expect(() => leerPendientes(comun)).toThrow();
    } finally {
      rmSync(comun, { recursive: true, force: true });
    }
  });
});

const base = { rama: "ops/x", subida: true, contenida: false, remotaBorrada: false, sinSubir: "" };

describe("limpiar-worktrees: qué rama está terminada", () => {
  // El 8 oct 2026 borraba la carpeta recién creada de cualquier sesión: una
  // rama nueva desde staging, sin commits, también está «contenida en staging».
  it("una rama nueva, nunca subida, no se borra aunque esté contenida en staging", () =>
    expect(terminada({ ...base, subida: false, contenida: true })).toBe(false));
  it("subida y fusionada en staging, sí", () => expect(terminada({ ...base, contenida: true })).toBe(true));
  it("subida, con la remota borrada tras el merge y nada sin subir, sí", () =>
    expect(terminada({ ...base, remotaBorrada: true })).toBe(true));
  it("con la remota borrada pero commits sin subir, no", () =>
    expect(terminada({ ...base, remotaBorrada: true, sinSubir: "abc123 wip" })).toBe(false));
  it("subida pero ni fusionada ni con la remota borrada, no", () => expect(terminada(base)).toBe(false));
  it("desconectada (sin rama), no", () => expect(terminada({ ...base, rama: null, contenida: true })).toBe(false));
});
