/**
 * Vigila ops/campos-por-entidad.json (#711): el registro que dice dónde mide
 * `npm run campos-por-entidad` los campos de cada entidad. Una entidad nueva sin entrada, una
 * fuente que ya no existe o una tabla repetida hacen fallar el CI.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FUENTES, RUTA_REGISTRO, registrosDeFuente } from "../scripts/lib/camposPorEntidadFuentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => JSON.parse(readFileSync(join(RAIZ, r), "utf8"));
const registro = leer(RUTA_REGISTRO);
const { entities } = leer("ops/entidades.json");
const modulos = leer("ops/MODULOS.json");

describe("ops/campos-por-entidad.json", () => {
  it("solo trae las claves conocidas", () => {
    expect(Object.keys(registro).sort()).toEqual(["$comentario", "entidades", "version"]);
    for (const [id, r] of Object.entries(registro.entidades)) {
      const sobran = Object.keys(r).filter((k) => !["sin_fuente", "ficheros", "tablas"].includes(k));
      expect(sobran, id).toEqual([]);
    }
  });

  it("cada entidad de ops/entidades.json declara su fuente (o por qué no tiene), y ninguna sobra", () => {
    const ids = entities.map((e) => e.id);
    expect(ids.filter((id) => !(id in registro.entidades)), "entidades sin entrada").toEqual([]);
    expect(Object.keys(registro.entidades).filter((id) => !ids.includes(id)), "entradas de entidades que no existen").toEqual([]);
  });

  it("sin_fuente es excluyente y lleva su motivo", () => {
    for (const [id, r] of Object.entries(registro.entidades)) {
      if (r.sin_fuente !== undefined) {
        expect(r.ficheros ?? r.tablas, `${id}: sin_fuente y fuentes a la vez`).toBeUndefined();
        expect(typeof r.sin_fuente === "string" && r.sin_fuente.trim().length >= 10, `${id}: falta el motivo`).toBe(true);
      } else expect(r.ficheros?.length || r.tablas?.length, `${id}: ni fuente ni sin_fuente`).toBeTruthy();
    }
  });

  it("cada fuente de ficheros es de un tipo conocido y se puede leer, con registros", async () => {
    for (const [id, r] of Object.entries(registro.entidades)) {
      for (const f of r.ficheros ?? []) {
        expect(Object.keys(FUENTES), `${id}: tipo «${f.tipo}»`).toContain(f.tipo);
        const ruta = f.ruta ?? f.directorio;
        expect(existsSync(join(RAIZ, ruta)), `${id}: ${ruta} no existe`).toBe(true);
        const { registros } = await registrosDeFuente(RAIZ, f);
        expect(registros.length, `${id}: ${ruta} sin registros`).toBeGreaterThan(0);
      }
    }
  });

  it("cada tabla va a una sola entidad y existe en ops/MODULOS.json", () => {
    const vistas = new Map();
    const todas = [...Object.entries(registro.entidades).flatMap(([id, r]) => (r.tablas ?? []).map((t) => [t, id]))];
    for (const [t, id] of todas) {
      expect(modulos.tablas[t], `${id}: la tabla ${t} no está en ops/MODULOS.json`).toBeDefined();
      expect(vistas.has(t), `${t} está en ${vistas.get(t)} y en ${id}`).toBe(false);
      vistas.set(t, id);
    }
  });

  it("sin_entidad se deriva: las tablas de ops/MODULOS.json que ninguna entidad reclama", () => {
    expect(registro.sin_entidad).toBeUndefined();
    const reclamadas = new Set(Object.values(registro.entidades).flatMap((r) => r.tablas ?? []));
    const sueltas = Object.keys(modulos.tablas).filter((t) => !reclamadas.has(t));
    expect(sueltas.length).toBeGreaterThan(0);
  });
});
