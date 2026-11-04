/**
 * Las partes del manual de Lola que solo entran cuando hacen falta (api/_bot/manual.js, trozo 44): el alta de
 * una casa vacía y lo de fotos y voz. Cada una con su disparador exacto, sin repetirse en el manual fijo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { partesDelTurno, PARTES_MANUAL, MARCAS_DEL_TURNO as M } from "./manual.js";
import { montarFicha } from "./ficha.js";

const leer = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const FIJO = leer("./conocimiento.md");
const PARTES = Object.fromEntries(Object.keys(PARTES_MANUAL).map((p) => [p, leer(`./manual/${p}.md`)]));
const conGente = { estable: "SEGURIDAD: Leo, sin huevo\nCASA: Ana (38), Leo (6)" };

describe("cuándo entra cada parte", () => {
  it("un mensaje normal de una casa con gente: ninguna", () => {
    expect(partesDelTurno({ entrada: "¿qué hay de cena?", ficha: conGente, historia: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola!" }] })).toEqual([]);
  });

  it("alta: el primer mensaje de la casa nueva, o la ficha de una casa sin nadie (la de verdad, de montarFicha)", () => {
    expect(partesDelTurno({ entrada: `${M.ALTA} Casa recién creada desde Telegram. Ayúdame a montarla.` })).toEqual(["alta"]);
    expect(partesDelTurno({ entrada: "somos 4", ficha: montarFicha({ state: { data: { members: [] } } }) })).toEqual(["alta"]);
    expect(partesDelTurno({ entrada: "somos 4", ficha: montarFicha({ state: { data: { members: [{ id: "m1", name: "Ana" }] } } }) })).toEqual([]);
  });

  it("fotos y voz: un adjunto ahora, uno en el mensaje anterior de la persona (aunque sea de otro día) o una nota de voz", () => {
    const anterior = (content) => [{ role: "user", content }, { role: "assistant", content: "¿Lo paso a la despensa?" }];
    expect(partesDelTurno({ entrada: "", adjunto: { tipo: "image" }, ficha: conGente })).toEqual(["fotos"]);
    expect(partesDelTurno({ entrada: "Sí, a la despensa", historia: anterior(`${M.FOTO} `), ficha: conGente })).toEqual(["fotos"]);
    expect(partesDelTurno({ entrada: "para Leo", historia: anterior(`[Escrito el lunes 3 de noviembre] ${M.PDF} menú del cole`), ficha: conGente })).toEqual(["fotos"]);
    expect(partesDelTurno({ entrada: `[Ana]: ${M.VOZ} somos cuatro`, ficha: conGente })).toEqual(["fotos"]);
    expect(partesDelTurno({ entrada: `${M.ALTA} Casa recién creada. Mi primer mensaje ${M.VOZ_EN_EL_ALTA}: somos Ana e Iker` })).toEqual(["alta", "fotos"]);
    // Un adjunto de hace dos mensajes ya no: solo el anterior de la persona.
    const viejo = [{ role: "user", content: `${M.FOTO} ` }, { role: "assistant", content: "Hecho." }, { role: "user", content: "gracias" }, { role: "assistant", content: "¡A ti!" }];
    expect(partesDelTurno({ entrada: "¿qué hay de cena?", historia: viejo, ficha: conGente })).toEqual([]);
  });

  it("los disparadores son las marcas que ponen quienes escriben, no una copia", () => {
    const telegram = leer("../bot/telegram.js");
    expect(telegram).toMatch(/`\$\{MARCAS_DEL_TURNO\.ALTA\} Casa recién creada/);
    expect(telegram).toMatch(/`\$\{MARCAS_DEL_TURNO\.VOZ\} \$\{texto\}`/);
    expect(telegram).not.toMatch(/"\[alta\]|`\[alta\]|`\[nota de voz\]/);
    expect(leer("./agente.js")).toMatch(/MARCAS_DEL_TURNO\.PDF : MARCAS_DEL_TURNO\.FOTO\} \$\{entrada\}/);
  });

  it("el vigilante quita la marca de voz de la lista, y el texto para Lola nombra las marcas que de verdad llegan", () => {
    // Fuera de manual.js, en código, ninguna marca escrita a mano.
    const supervisor = leer("./supervisor.js");
    expect(supervisor).toMatch(/MARCAS_DEL_TURNO\.VOZ/);
    expect(supervisor).not.toMatch(/\\\[nota de voz\\\]/);
    // El texto es para el modelo y no puede importar: el test lo cuadra con la lista.
    expect(PARTES.fotos).toContain(`«${M.VOZ}»`);
    expect(PARTES.fotos).toContain(`«${M.VOZ_EN_EL_ALTA}»`);
    expect(PARTES.alta).toContain(`«${M.ALTA}»`);
    expect(PARTES.alta).toContain(`«${M.PARA_EMPEZAR}»`);
  });
});

describe("cada cosa en un sitio", () => {
  it("cada parte tiene su fichero y cada fichero su parte", () => {
    expect(readdirSync(new URL("./manual/", import.meta.url)).sort()).toEqual(Object.keys(PARTES_MANUAL).map((p) => `${p}.md`).sort());
  });

  it("lo que dice una parte no sigue en el manual fijo", () => {
    for (const [p, texto] of Object.entries(PARTES)) {
      for (const linea of texto.split("\n").filter((l) => l.trim().length > 40)) expect(FIJO, `${p}: ${linea.slice(0, 50)}`).not.toContain(linea.trim());
    }
  });

  it("lo que llega con la casa ya con gente sigue en el fijo: después del primer menú, el peso y la altura, invitar a mandar audios", () => {
    expect(FIJO).toMatch(/^# Después del primer menú$/m);
    expect(FIJO).toContain("Peso y altura: no los preguntes.");
    expect(FIJO).toContain("Invita a mandar audios cuando haya que contar varias cosas");
    expect(PARTES.alta).toContain("lo de «Después del primer menú»");
  });
});
