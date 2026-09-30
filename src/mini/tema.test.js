import { describe, it, expect } from "vitest";
import { CLARO, temaDe, contraste } from "./tema.js";

// Temas reales de Telegram (oscuro de Android y de iOS, claro de iOS).
const OSCURO_ANDROID = { bg_color: "#212d3b", secondary_bg_color: "#151e27", text_color: "#ffffff", hint_color: "#7d8b99", button_color: "#5288c1", button_text_color: "#ffffff" };
const OSCURO_IOS = { bg_color: "#000000", secondary_bg_color: "#1c1c1d", text_color: "#ffffff", hint_color: "#98989e", button_color: "#3e88f7", button_text_color: "#ffffff" };
const CLARO_IOS = { bg_color: "#ffffff", secondary_bg_color: "#efeff4", text_color: "#000000", hint_color: "#999999", button_color: "#2481cc", button_text_color: "#ffffff" };

function cumple(t) {
  for (const f of [t.tarjeta, t.fondo]) {
    expect(contraste(t.tinta, f)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(t.suave, f)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contraste(t.suave, t.pista)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(t.acento, t.tarjeta)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(t.sobreAcento, t.relleno)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(t.borde, t.tarjeta)).toBeGreaterThanOrEqual(3);
}

describe("temaDe", () => {
  it("sin Telegram, los colores de la marca, que ya cumplen", () => {
    expect(temaDe()).toBe(CLARO);
    expect(temaDe({})).toBe(CLARO);
    cumple(CLARO);
  });

  it("el gris del tema oscuro de Telegram no llega a 4,5:1 y se aclara", () => {
    expect(contraste(OSCURO_ANDROID.hint_color, OSCURO_ANDROID.bg_color)).toBeLessThan(4.5);
    const t = temaDe(OSCURO_ANDROID);
    expect(t.tarjeta).toBe("#212d3b");
    expect(t.suave).not.toBe(OSCURO_ANDROID.hint_color);
    cumple(t);
  });

  it("cumple con los temas de iOS, oscuro y claro", () => {
    cumple(temaDe(OSCURO_IOS));
    cumple(temaDe(CLARO_IOS));
  });

  it("ignora valores que no son un color", () => {
    expect(temaDe({ bg_color: "rojo" })).toBe(CLARO);
  });
});
