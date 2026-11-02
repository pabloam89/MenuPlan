import { describe, expect, it } from "vitest";
import { PORTADA, decidirPortada } from "./portada.js";

const base = { cargando: false, conSesion: false, nubeLista: false, hayFamilia: false, hayDestino: false, pidioEntrar: false, saliendo: false };
const decide = (cambios) => decidirPortada({ ...base, ...cambios });

describe("decidirPortada", () => {
  it("sin sesión ni familia, pide entrar", () => {
    expect(decide({})).toBe(PORTADA.VER);
  });

  it("con sesión y familia, directo a Inicio", () => {
    expect(decide({ conSesion: true, nubeLista: true, hayFamilia: true })).toBe(PORTADA.INICIO);
  });

  it("con sesión y sin familia en la nube, al alta", () => {
    expect(decide({ conSesion: true, nubeLista: true })).toBe(PORTADA.ALTA);
  });

  it("con sesión y la nube sin responder, Inicio y no el alta", () => {
    expect(decide({ conSesion: true })).toBe(PORTADA.INICIO);
  });

  it("sin sesión pero con familia guardada aquí, a Inicio", () => {
    expect(decide({ hayFamilia: true })).toBe(PORTADA.INICIO);
  });

  it("con familia en el dispositivo no espera a que cargue", () => {
    expect(decide({ cargando: true, hayFamilia: true })).toBe(PORTADA.INICIO);
  });

  it("con llave de Lola espera aunque haya familia aquí", () => {
    expect(decide({ cargando: true, hayFamilia: true, conLlave: true })).toBe(PORTADA.ESPERAR);
  });

  it("mientras carga no enseña nada", () => {
    expect(decide({ cargando: true })).toBe(PORTADA.ESPERAR);
  });

  it("un enlace de Lola sin sesión pide entrar, aunque haya familia", () => {
    expect(decide({ hayDestino: true, hayFamilia: true })).toBe(PORTADA.VER);
    expect(decide({ pidioEntrar: true, hayFamilia: true })).toBe(PORTADA.VER);
  });

  it("un enlace de Lola con sesión lo resuelve su efecto", () => {
    expect(decide({ hayDestino: true, conSesion: true, nubeLista: true })).toBe(PORTADA.ESPERAR);
  });

  it("borrando la cuenta no entra con la sesión que se va", () => {
    expect(decide({ conSesion: true, nubeLista: true, saliendo: true })).toBe(PORTADA.ESPERAR);
    expect(decide({ saliendo: true })).toBe(PORTADA.VER);
  });
});
