// Trozo 29 de #1037: el banco de frases comprueba lo guardado (la operación:
// acción y parámetros exactos), no solo la herramienta llamada; y cada pasada
// cuenta el % de operaciones exactas, el coste medio y la latencia media.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CANALES_DATO, ORIGEN_DATO } from "../../src/lib/vocabularios.js";
import {
  CAMPOS_FILA, MOTIVOS_FALLO, SALIDA, cifrasDePasada, erroresDeCasos, memoriaDeOperacion, operacionExacta, parametrosExactos,
} from "./evals.mjs";

const RAIZ = new URL("../../", import.meta.url);
const { casos } = JSON.parse(readFileSync(new URL("scripts/bot-evals.json", RAIZ), "utf8"));

const bueno = { id: "uno", tipo: "herramienta", dominio: "ficha", origen: "escrito", nombre: "x", entrada: "x" };
const conEspera = (espera, otros = {}) => erroresDeCasos([{ ...bueno, ...otros, espera }], otros.acciones ? { acciones: otros.acciones } : {});
const ESPERA = { accion: "ajustar_cocina", parametros: { trastosMas: ["Airfryer"] } };

describe("espera: la operación esperada tiene forma cerrada", () => {
  it("acción y parámetros bien, con o sin sobre del vocabulario del modelo de datos", () => {
    expect(conEspera(ESPERA)).toEqual([]);
    expect(conEspera({ ...ESPERA, sobre: { origen: ORIGEN_DATO[0], canal: CANALES_DATO[0] } })).toEqual([]);
    expect(conEspera({ accion: "deshacer", parametros: {} })).toEqual([]);
  });
  it("sin acción, o con parámetros que no son un objeto, es un error", () => {
    expect(conEspera({ parametros: {} })).toEqual([expect.stringMatching(/espera\.accion/)]);
    expect(conEspera({ accion: "deshacer", parametros: ["x"] })).toEqual([expect.stringMatching(/espera\.parametros/)]);
    expect(conEspera("deshacer")).toEqual([expect.stringMatching(/espera tiene que ser/)]);
  });
  it("el sobre solo admite origen y canal de la lista", () => {
    expect(conEspera({ ...ESPERA, sobre: { origen: "inventado" } })).toEqual([expect.stringMatching(/espera\.sobre\.origen/)]);
    expect(conEspera({ ...ESPERA, sobre: { canal: "fax" } })).toEqual([expect.stringMatching(/espera\.sobre\.canal/)]);
    expect(conEspera({ ...ESPERA, sobre: "telegram" })).toEqual([expect.stringMatching(/espera\.sobre tiene que ser/)]);
  });
  it("con la lista de herramientas, una acción que Lola no tiene es un error (daría siempre rojo y parecería de Lola)", () => {
    expect(conEspera({ accion: "ajustar_trastos", parametros: {} }, { acciones: ["ajustar_cocina"] })).toEqual([expect.stringMatching(/no es ninguna herramienta/)]);
    expect(conEspera(ESPERA, { acciones: ["ajustar_cocina"] })).toEqual([]);
  });
  it("esperar una herramienta del menú ata el caso al día, como con llama o args", () => {
    expect(conEspera({ accion: "cambiar_plato", parametros: { comida: "Cena" } })).toEqual([expect.stringMatching(/le falta "dependeDeFecha"/)]);
    expect(conEspera({ accion: "cambiar_plato", parametros: { comida: "Cena" } }, { dependeDeFecha: true })).toEqual([]);
  });
  it("el motivo de fallo y las columnas de la fila están en sus vocabularios", () => {
    expect(MOTIVOS_FALLO).toContain("operacion_no_exacta");
    expect(CAMPOS_FILA).toContain("operacion_exacta");
    expect(CAMPOS_FILA).toContain("sobre_comprobado");
  });
});

describe("operacionExacta: la acción se llamó con exactamente esos parámetros", () => {
  const llamada = (nombre, args, resultado = "Hecho.") => ({ nombre, args, resultado });

  it("exacto: bien; una subcadena ya no vale", () => {
    const espera = { accion: "fuera_de_casa", parametros: { dias: ["jueves"], comidas: ["Comida"] } };
    expect(operacionExacta([llamada("fuera_de_casa", { dias: ["jueves"], comidas: ["Comida"] })], espera)).toMatchObject({ ok: true, detalle: null });
    const r = operacionExacta([llamada("fuera_de_casa", { dias: ["el jueves"], comidas: ["Comida"] })], espera);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/operación no exacta: fuera_de_casa sin .*llegó: .*el jueves/);
  });
  it("una lista es un conjunto: el orden no importa, el tamaño sí", () => {
    expect(parametrosExactos({ comidas: ["Cena", "Comida"] }, { comidas: ["Comida", "Cena"] })).toBe(true);
    expect(parametrosExactos({ comidas: ["Comida", "Cena"] }, { comidas: ["Comida"] })).toBe(false);
    expect(parametrosExactos({ comidas: ["Comida"] }, { comidas: ["Comida", "Cena"] })).toBe(false);
  });
  it("tildes y mayúsculas no cambian la operación; un valor distinto sí", () => {
    expect(parametrosExactos({ receta: "Brócoli " }, { receta: "brocoli" })).toBe(true);
    expect(parametrosExactos({ receta: "brocoli al horno" }, { receta: "brocoli" })).toBe(false);
    expect(parametrosExactos({ n: 2 }, { n: 2 })).toBe(true);
    expect(parametrosExactos({ n: "2" }, { n: 2 })).toBe(false);
  });
  it("lo que no se lista no se mira (texto libre como frase), también dentro de una lista de objetos", () => {
    const espera = { accion: "ajustar_gustos", parametros: { ajustes: [{ campo: "freqs", valor: "pescado", op: "menos", n: 2 }], dicho: true } };
    const bien = { ajustes: [{ campo: "freqs", valor: "pescado", op: "menos", n: 2, ambito: "todos" }], frase: "pescado como mucho dos veces", dicho: true };
    expect(operacionExacta([llamada("ajustar_gustos", bien)], espera).ok).toBe(true);
    const mal = { ...bien, ajustes: [{ ...bien.ajustes[0], op: "mas" }] };
    expect(operacionExacta([llamada("ajustar_gustos", mal)], espera).ok).toBe(false);
    expect(operacionExacta([llamada("ajustar_gustos", { ...bien, ajustes: [...bien.ajustes, { campo: "favoritos", valor: "pizza", op: "mas" }] })], espera).ok).toBe(false);
  });
  it("sin llamar a la acción, dice a qué llamó; con varias llamadas basta una exacta", () => {
    const espera = { accion: "deshacer", parametros: {} };
    expect(operacionExacta([], espera).detalle).toMatch(/no llamó a deshacer \(llamó a nada\)/);
    expect(operacionExacta([llamada("ver_menu", {})], espera).detalle).toMatch(/no llamó a deshacer \(llamó a ver_menu\)/);
    const e2 = { accion: "anadir_compra", parametros: { productos: ["leche"] } };
    expect(operacionExacta([llamada("anadir_compra", { productos: ["pan"] }), llamada("anadir_compra", { productos: ["leche"] })], e2).ok).toBe(true);
  });
  it("el sobre solo se compara si el resultado lo trae: hoy las herramientas de mentira devuelven texto", () => {
    const espera = { accion: "anadir_compra", parametros: { productos: ["leche"] }, sobre: { origen: "dicho", canal: "telegram" } };
    const args = { productos: ["leche"] };
    expect(operacionExacta([llamada("anadir_compra", args, "Añadido.")], espera)).toMatchObject({ ok: true, sobre_comprobado: false });
    expect(operacionExacta([llamada("anadir_compra", args, { sobre: { origen: "dicho", canal: "telegram" } })], espera)).toMatchObject({ ok: true, sobre_comprobado: true });
    const mal = operacionExacta([llamada("anadir_compra", args, { sobre: { origen: "supuesto", canal: "telegram" } })], espera);
    expect(mal).toMatchObject({ ok: false, sobre_comprobado: true });
    expect(mal.detalle).toMatch(/el sobre de anadir_compra/);
  });
});

describe("cifras de la pasada: % de operación exacta, coste medio y latencia media", () => {
  it("sin intentos pagados ni casos con espera, todo a null o 0", () => {
    expect(cifrasDePasada([], { conEspera: 0, exactos: 0 })).toEqual({ casos_con_espera: 0, operacion_exacta: 0, pct_operacion_exacta: null, coste_medio_usd: null, latencia_media_ms: null });
  });
  it("2 de 3 exactos es 67 %; coste y latencia son la media de los intentos pagados", () => {
    const c = cifrasDePasada([{ coste: 0.02, ms: 4000 }, { coste: 0.04, ms: 8000 }], { conEspera: 3, exactos: 2 });
    expect(c.pct_operacion_exacta).toBe(67);
    expect(c.coste_medio_usd).toBeCloseTo(0.03);
    expect(c.latencia_media_ms).toBe(6000);
  });
  it("la memoria de operación sigue la de aprobados: las filas viejas (sin la columna) valen null", () => {
    const base = { caso_hash: "c", prompt_hash: "p", codigo_hash: "k", modelo: "m", esfuerzo: "e" };
    const m = memoriaDeOperacion([{ ...base, aprobado: true, operacion_exacta: true }, { ...base, aprobado: true }, { ...base }]);
    expect([...m.values()]).toEqual([[true, null]]);
  });
});

// La prueba de punta a punta, gratis: el modelo de mentira de --simulado no llama a
// ninguna herramienta, así que un caso con `espera` tiene que salir en rojo por la
// operación, y el resumen traer las cifras nuevas.
describe("bot-evals.mjs --simulado con un caso con espera", () => {
  const CASO_CON_ESPERA = "airfryer-nueva-no-borra-los-demas";

  it("el caso existe en el banco y espera una operación", () => {
    expect(casos.find((c) => c.id === CASO_CON_ESPERA)?.espera).toMatchObject({ accion: "ajustar_cocina" });
  });

  it("sale en rojo por «operación no exacta» y el resumen trae % exacta, coste medio y latencia media", () => {
    const cwd = fileURLToPath(RAIZ);
    // El agente importa el motor empaquetado (api/_bot/core.mjs, fuera de git): en el CI no está y se construye aquí (~1 s, esbuild).
    if (!existsSync(new URL("api/_bot/core.mjs", RAIZ))) {
      const b = spawnSync(process.execPath, ["scripts/build-bot-core.mjs"], { cwd, encoding: "utf8" });
      expect(b.status, `${b.stdout}\n${b.stderr}`).toBe(0);
    }
    const r = spawnSync(process.execPath, ["scripts/bot-evals.mjs", "--simulado", "--sin-memo", CASO_CON_ESPERA], { cwd, encoding: "utf8" });
    const salida = `${r.stdout}\n${r.stderr}`;
    expect(r.status, salida).toBe(SALIDA.fallos);
    expect(salida).toMatch(/operación no exacta: no llamó a ajustar_cocina/);
    expect(salida).toMatch(/Operación exacta: 0\/1 casos con espera \(0 %\)/);
    expect(salida).toMatch(/coste medio por intento \$[\d.]+ · latencia media [\d.]+ s/);
  });
});
