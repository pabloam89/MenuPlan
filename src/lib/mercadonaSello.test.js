import { describe, expect, it } from "vitest";
import { abrir, sellar } from "./mercadonaSello.js";

async function claves() {
  const par = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"],
  );
  const spki = await crypto.subtle.exportKey("spki", par.publicKey);
  return { publica: btoa(String.fromCharCode(...new Uint8Array(spki))), privada: par.privateKey };
}

const SESION = JSON.stringify({ token: "secreto-ñ", uuid: "u" });

describe("sellar y abrir", () => {
  it("se abre con la privada y da lo mismo", async () => {
    const { publica, privada } = await claves();
    expect(await abrir(await sellar(SESION, publica), privada)).toBe(SESION);
  });

  it("el sello no lleva la sesión a la vista", async () => {
    const { publica } = await claves();
    const sello = await sellar(SESION, publica);
    expect(sello).not.toContain("secreto");
    expect(atob(JSON.parse(sello).c)).not.toContain("secreto");
  });

  it("otra clave privada no lo abre", async () => {
    const { publica } = await claves();
    const otra = await claves();
    await expect(abrir(await sellar(SESION, publica), otra.privada)).rejects.toThrow();
  });

  it("un sello tocado no se abre", async () => {
    const { publica, privada } = await claves();
    const s = JSON.parse(await sellar(SESION, publica));
    s.c = btoa("otra cosa distinta del cifrado");
    await expect(abrir(JSON.stringify(s), privada)).rejects.toThrow();
  });

  it("una versión desconocida no se intenta", async () => {
    const { publica, privada } = await claves();
    const s = JSON.parse(await sellar(SESION, publica));
    await expect(abrir(JSON.stringify({ ...s, v: 9 }), privada)).rejects.toThrow("otra versión");
  });
});
